#!/bin/bash
set -euo pipefail
export PATH=/opt/node/bin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
APP=/srv/kunci/app
ARCHIVE=${1:?release archive required}
IMPORT=${2:?private import archive required}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /srv/kunci/releases /var/backups/kunci
chmod 700 /var/backups/kunci
umask 077
runuser -u postgres -- pg_dump -Fc kunci > "/var/backups/kunci/pre-v2-$STAMP.dump"
tar -czf "/srv/kunci/releases/pre-v2-$STAMP.tar.gz" --exclude=node_modules --exclude=.next --exclude=uploads --exclude=data --exclude=.env -C "$APP" .
systemctl stop kunci-erp
trap 'systemctl start kunci-erp' ERR
tar -xzf "$ARCHIVE" -C "$APP"
mkdir -p "$APP/data" "$APP/uploads" "$APP/.next/cache"
tar -xzf "$IMPORT" -C "$APP/data"
chown -R kunci:kunci "$APP"
chmod 700 "$APP/data"; chmod 600 "$APP/data/drive-normalized.json" "$APP/data/drive-inventory.ndjson" "$APP/.env"
cd "$APP"
runuser -u kunci -- env HOME=/srv/kunci PATH="$PATH" npm ci --include=dev --no-audit --no-fund
set -a; source /srv/kunci/migrate.env; set +a
runuser -u kunci -- env PATH="$PATH" DATABASE_URL="$DATABASE_URL" npm run db:migrate
runuser -u kunci -- env PATH="$PATH" DATABASE_URL="$DATABASE_URL" /opt/node/bin/node node_modules/tsx/dist/cli.mjs scripts/import-drive.ts
runuser -u postgres -- psql -d kunci -v ON_ERROR_STOP=1 <<'SQL'
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO kunci_app;
REVOKE UPDATE,DELETE ON audit_events,stock_movements FROM kunci_app;
REVOKE ALL ON _prisma_migrations FROM kunci_app;
SQL
runuser -u kunci -- env PATH="$PATH" DATABASE_URL="$DATABASE_URL" npm test
unset DATABASE_URL
runuser -u kunci -- env HOME=/srv/kunci PATH="$PATH" NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=640 npm run build
install -m 750 deploy/backup.sh /usr/local/sbin/kunci-backup
printf '17 18 * * * root /usr/local/sbin/kunci-backup 2>&1 | logger -t kunci-backup\n' > /etc/cron.d/kunci-backup
systemctl restart kunci-erp
for i in $(seq 1 40); do if curl -fsS http://127.0.0.1:3000/ >/dev/null; then break; fi; sleep 2; done
curl -fsS http://127.0.0.1:3000/ >/dev/null
systemctl is-active kunci-erp caddy
printf 'V2_DEPLOYED %s\n' "$STAMP"
