#!/bin/bash
set -euo pipefail
export PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
APP=/srv/kunci/app
ARCHIVE=${1:?release archive required}
IMPORT=${2:?private import archive required}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
umask 077
mkdir -p /srv/kunci/releases /var/backups/kunci
chmod 700 /srv/kunci/releases /var/backups/kunci
/usr/local/sbin/kunci-backup
runuser -u postgres -- pg_dump -Fc kunci > "/var/backups/kunci/pre-v3-$STAMP.dump"
PREVIOUS="/srv/kunci/releases/pre-v3-$STAMP.tar.gz"
tar -czf "$PREVIOUS" --exclude=.next/cache --exclude=.next/dev --exclude=node_modules --exclude=.npm-cache --exclude=data --exclude=uploads --exclude=.env -C "$APP" .
systemctl stop kunci-erp
rollback() {
  code=$?
  trap - ERR
  echo 'V3 upgrade failed; restoring previous application files.'
  tar -xzf "$PREVIOUS" -C "$APP"
  chown -R kunci:kunci "$APP/src" "$APP/.next"
  systemctl restart kunci-erp
  exit "$code"
}
trap rollback ERR
tar -xzf "$ARCHIVE" -C "$APP"
mkdir -p "$APP/data/upload-audit"
tar -xzf "$IMPORT" -C "$APP/data"
chown -R kunci:kunci "$APP"
chmod 700 "$APP/data" "$APP/data/upload-audit"
chmod 600 "$APP/.env" "$APP/data/upload-audit/import-v3.json"
cd "$APP"
runuser -u kunci -- env PATH="$PATH" HOME=/srv/kunci npm ci --include=dev --no-audit --no-fund
runuser -u kunci -- env PATH="$PATH" npm run db:generate
set -a; source /srv/kunci/migrate.env; set +a
runuser -u kunci -- env PATH="$PATH" DATABASE_URL="$DATABASE_URL" npm run db:migrate
runuser -u kunci -- env PATH="$PATH" DATABASE_URL="$DATABASE_URL" node node_modules/tsx/dist/cli.mjs scripts/import-upload-v3.ts
# Idempotence is checked on the real database before reopening the service.
runuser -u kunci -- env PATH="$PATH" DATABASE_URL="$DATABASE_URL" node node_modules/tsx/dist/cli.mjs scripts/import-upload-v3.ts
runuser -u postgres -- psql -d kunci -v ON_ERROR_STOP=1 <<'SQL'
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO kunci_app;
REVOKE UPDATE,DELETE ON audit_events,stock_movements FROM kunci_app;
REVOKE ALL ON _prisma_migrations FROM kunci_app;
DO $$ BEGIN
 IF (SELECT count(*) FROM source_facts WHERE "batchId"='upload-20261118-e84a659afa375656')<>20759 THEN RAISE EXCEPTION 'Incomplete V3 source import'; END IF;
 IF (SELECT count(*) FROM master_records WHERE "companyId"='KBA' AND kind='EMPLOYEE' AND data->>'currentRoster'='true')<>221 THEN RAISE EXCEPTION 'Incomplete V3 roster'; END IF;
END $$;
SQL
runuser -u kunci -- env PATH="$PATH" DATABASE_URL="$DATABASE_URL" SKIP_ORIGINAL_FILES=1 DATA_QA_OUTPUT=artifacts/cloud-data-qa-v3.json node node_modules/tsx/dist/cli.mjs scripts/verify-upload-v3.ts
runuser -u kunci -- env PATH="$PATH" DATABASE_URL="$DATABASE_URL" npm test
unset DATABASE_URL
runuser -u kunci -- env PATH="$PATH" HOME=/srv/kunci NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=640 npm run build
systemctl restart kunci-erp
for i in $(seq 1 45); do if curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1; then break; fi; sleep 2; done
curl -fsS http://127.0.0.1:3000/ >/dev/null
systemctl is-active kunci-erp nginx
runuser -u kunci -- env PATH="$PATH" SMOKE_URL=http://127.0.0.1:3000 node node_modules/tsx/dist/cli.mjs scripts/smoke-v3.ts
/usr/local/sbin/kunci-backup
bash deploy/verify-restore-v3.sh
echo "V3_DEPLOYED $STAMP"
