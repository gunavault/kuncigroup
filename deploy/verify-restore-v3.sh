#!/bin/bash
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
DB=kunci_restore_v3_check
if runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1; then echo 'Restore check database already exists'; exit 1; fi
stage=$(mktemp -d /var/backups/kunci/restore-v3.XXXXXX)
trap 'runuser -u postgres -- dropdb --if-exists kunci_restore_v3_check; case "$stage" in /var/backups/kunci/restore-v3.*) rm -rf -- "$stage";; esac' EXIT
backup=$(find /var/backups/kunci -maxdepth 1 -name 'kunci-*.tar.gz' -type f | sort | tail -1)
test -n "$backup"
tar -xzf "$backup" -C "$stage"
(cd "$stage"; sha256sum -c SHA256SUMS)
runuser -u postgres -- createdb "$DB"
runuser -u postgres -- pg_restore --exit-on-error -d "$DB" < "$stage/database.dump"
runuser -u postgres -- psql -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM source_facts)<>20759 THEN RAISE EXCEPTION 'Source facts incomplete'; END IF;
 IF (SELECT count(*) FROM master_records WHERE "companyId"='KBA' AND data->>'currentRoster'='true')<>221 THEN RAISE EXCEPTION 'Roster incomplete'; END IF;
 IF (SELECT count(DISTINCT data->>'workId') FROM master_records WHERE "companyId"='KBA' AND data->>'currentRoster'='true')<>221 THEN RAISE EXCEPTION 'Restored roster IDs are not distinct'; END IF;
 IF (SELECT sum(debit)-sum(credit) FROM journal_lines)<>0 THEN RAISE EXCEPTION 'Restored ledger is not balanced'; END IF;
 IF EXISTS(SELECT 1 FROM source_facts f JOIN source_files s ON s.id=f."sourceFileId" WHERE s."companyId"<>f."companyId") THEN RAISE EXCEPTION 'Invalid source scope'; END IF;
END $$;
SELECT 'RESTORE_V3_OK' AS result,(SELECT count(*) FROM master_records) AS masters,(SELECT count(*) FROM source_facts) AS source_rows,(SELECT count(*) FROM access_grants) AS grants;
SQL
tar -tf "$stage/uploads.tar" >/dev/null
echo 'V3_DATABASE_AND_UPLOAD_BACKUP_VERIFIED'
