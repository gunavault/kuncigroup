#!/bin/bash
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
RESTORE_DB=kunci_restore_v2_check
if runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='$RESTORE_DB'" | grep -q 1; then echo 'Restore database already exists'; exit 1; fi
stage=$(mktemp -d /var/backups/kunci/restore.XXXXXX)
trap 'runuser -u postgres -- dropdb --if-exists kunci_restore_v2_check; case "$stage" in /var/backups/kunci/restore.*) rm -rf -- "$stage";; esac' EXIT
backup=$(find /var/backups/kunci -maxdepth 1 -name 'kunci-*.tar.gz' -type f | sort | tail -1)
test -n "$backup"
tar -xzf "$backup" -C "$stage"
(cd "$stage"; sha256sum -c SHA256SUMS)
runuser -u postgres -- createdb "$RESTORE_DB"
runuser -u postgres -- pg_restore --exit-on-error -d "$RESTORE_DB" < "$stage/database.dump"
runuser -u postgres -- psql -d "$RESTORE_DB" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM master_records)<931 OR (SELECT count(*) FROM business_records)<937 OR (SELECT count(*) FROM source_files)<15129 THEN RAISE EXCEPTION 'Restore lacks expected imported data'; END IF;
 IF (SELECT sum(debit)-sum(credit) FROM journal_lines)<>0 THEN RAISE EXCEPTION 'Unbalanced restored ledger'; END IF;
END $$;
SELECT 'RESTORE_V2_OK' AS result,(SELECT count(*) FROM companies) AS companies,(SELECT count(*) FROM master_records) AS masters,(SELECT count(*) FROM business_records) AS documents,(SELECT count(*) FROM source_files) AS sources;
SQL
tar -tf "$stage/uploads.tar" >/dev/null
echo 'DATABASE_AND_UPLOAD_BACKUP_VERIFIED'
