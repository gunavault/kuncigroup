#!/bin/bash
set -euo pipefail
export PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
APP=/srv/kunci/app
ARCHIVE=${1:?release archive required}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
umask 077
mkdir -p /srv/kunci/releases /var/backups/kunci
/usr/local/sbin/kunci-backup
runuser -u postgres -- pg_dump -Fc kunci > "/var/backups/kunci/pre-v4-$STAMP.dump"
PREVIOUS="/srv/kunci/releases/pre-v4-$STAMP.tar.gz"
tar -czf "$PREVIOUS" --exclude=.next/cache --exclude=.next/dev --exclude=node_modules --exclude=.npm-cache --exclude=data --exclude=uploads --exclude=artifacts --exclude=outputs --exclude=.env -C "$APP" .
OLD_LOCK=$(sha256sum "$APP/package-lock.json" | cut -d' ' -f1)
systemctl stop kunci-erp
rollback() {
  code=$?
  trap - ERR
  echo 'V4 upgrade failed; restoring previous application only. Business data is preserved.'
  tar -xzf "$PREVIOUS" -C "$APP"
  chown -R kunci:kunci "$APP/src" "$APP/.next"
  systemctl restart kunci-erp
  exit "$code"
}
trap rollback ERR
tar -xzf "$ARCHIVE" -C "$APP"
chown -R kunci:kunci "$APP/src" "$APP/scripts" "$APP/tests" "$APP/prisma" "$APP/deploy"
cd "$APP"
NEW_LOCK=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ "$OLD_LOCK" != "$NEW_LOCK" ] || [ ! -f node_modules/next/package.json ]; then
  runuser -u kunci -- env PATH="$PATH" HOME=/srv/kunci npm ci --include=dev --no-audit --no-fund
fi
runuser -u kunci -- env PATH="$PATH" npm run db:generate
set -a; source /srv/kunci/migrate.env; set +a
runuser -u kunci -- env PATH="$PATH" DATABASE_URL="$DATABASE_URL" npm run db:migrate
runuser -u kunci -- env PATH="$PATH" DATABASE_URL="$DATABASE_URL" npm test
unset DATABASE_URL
runuser -u kunci -- env PATH="$PATH" HOME=/srv/kunci NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=640 npm run build
systemctl restart kunci-erp
for i in $(seq 1 45); do if curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1; then break; fi; sleep 2; done
curl -fsS http://127.0.0.1:3000/ >/dev/null
systemctl is-active kunci-erp nginx
runuser -u kunci -- env PATH="$PATH" SMOKE_URL=http://127.0.0.1:3000 node node_modules/tsx/dist/cli.mjs scripts/smoke-v4.ts
/usr/local/sbin/kunci-backup
bash deploy/verify-restore-v3.sh
echo "V4_DEPLOYED $STAMP"
