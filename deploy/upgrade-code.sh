#!/bin/bash
# Code-only release (no data import). Run on the VM:
#   sudo bash upgrade-code.sh /home/<user>/kunci-release.tar.gz <label>
# The archive comes from `git archive` (source, lockfile, migrations, scripts; no .env/data).
# Steps: backup + pre-dump -> snapshot of the old release -> stop -> extract -> npm ci ->
# migrate -> tests in a temporary schema -> build -> restart -> health check -> backup.
# If any step fails, the old application files (including the old .next build) are restored.
set -euo pipefail
export PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
APP=/srv/kunci/app
ARCHIVE=${1:?release archive required}
LABEL=${2:-code}
[[ "$LABEL" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Invalid label"; exit 2; }
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
umask 077
mkdir -p /srv/kunci/releases /var/backups/kunci
chmod 700 /srv/kunci/releases /var/backups/kunci
tar -tzf "$ARCHIVE" | grep -qE '(^|/)(\.env|data/|uploads/)' && { echo "Archive contains private files; aborting."; exit 3; }
/usr/local/sbin/kunci-backup
runuser -u postgres -- pg_dump -Fc kunci > "/var/backups/kunci/pre-$LABEL-$STAMP.dump"
PREVIOUS="/srv/kunci/releases/pre-$LABEL-$STAMP.tar.gz"
tar -czf "$PREVIOUS" --exclude=.next/cache --exclude=.next/dev --exclude=node_modules --exclude=.npm-cache --exclude=data --exclude=uploads --exclude=.env -C "$APP" .
systemctl stop kunci-erp
rollback() {
  code=$?
  trap - ERR
  echo "Upgrade $LABEL failed; restoring previous application files."
  tar -xzf "$PREVIOUS" -C "$APP"
  chown -R kunci:kunci "$APP/src" "$APP/.next"
  systemctl restart kunci-erp
  exit "$code"
}
trap rollback ERR
tar -xzf "$ARCHIVE" -C "$APP"
chown -R kunci:kunci "$APP"
chmod 600 "$APP/.env"
cd "$APP"
runuser -u kunci -- env PATH="$PATH" HOME=/srv/kunci npm ci --include=dev --no-audit --no-fund
runuser -u kunci -- env PATH="$PATH" npm run db:generate
set -a; source /srv/kunci/migrate.env; set +a
runuser -u kunci -- env PATH="$PATH" DATABASE_URL="$DATABASE_URL" npm run db:migrate
runuser -u postgres -- psql -d kunci -v ON_ERROR_STOP=1 <<'SQL'
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO kunci_app;
REVOKE UPDATE,DELETE ON audit_events,stock_movements FROM kunci_app;
REVOKE ALL ON _prisma_migrations FROM kunci_app;
SQL
runuser -u kunci -- env PATH="$PATH" DATABASE_URL="$DATABASE_URL" npm test
unset DATABASE_URL
runuser -u kunci -- env PATH="$PATH" HOME=/srv/kunci NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=640 npm run build
systemctl restart kunci-erp
for i in $(seq 1 45); do if curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1; then break; fi; sleep 2; done
curl -fsS http://127.0.0.1:3000/ >/dev/null
test "$(curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:3000/api/operations?company=KBA')" = 401
systemctl is-active kunci-erp nginx
trap - ERR
/usr/local/sbin/kunci-backup
echo "CODE_RELEASE_DEPLOYED $LABEL $STAMP"
