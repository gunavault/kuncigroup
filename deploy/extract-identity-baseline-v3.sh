#!/bin/bash
set -euo pipefail
DB=kunci_v3_identity_baseline
if runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1; then echo 'Baseline database already exists'; exit 1; fi
backup=$(find /var/backups/kunci -maxdepth 1 -name 'pre-v3-*.dump' -type f | sort | tail -1)
test -n "$backup"
runuser -u postgres -- createdb "$DB"
trap 'runuser -u postgres -- dropdb --if-exists kunci_v3_identity_baseline' EXIT
runuser -u postgres -- pg_restore --exit-on-error -d "$DB" < "$backup"
runuser -u postgres -- psql -X -qAt -d "$DB" > /srv/kunci/app/data/identity-pre-import.json <<'SQL'
SELECT coalesce(json_agg(to_jsonb(m)),'[]'::json) FROM master_records m WHERE kind='EMPLOYEE' AND "companyId"='KBA';
SQL
chown kunci:kunci /srv/kunci/app/data/identity-pre-import.json
chmod 600 /srv/kunci/app/data/identity-pre-import.json
cp /srv/kunci/app/data/identity-pre-import.json /home/dharma_regar/identity-pre-import.json
chown dharma_regar:dharma_regar /home/dharma_regar/identity-pre-import.json
chmod 600 /home/dharma_regar/identity-pre-import.json
echo 'IDENTITY_BASELINE_EXTRACTED'
