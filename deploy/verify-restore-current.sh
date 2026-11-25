#!/bin/bash
# Restore the latest checksum-verified backup to a throwaway database only.
# Never restores over kunci. Does not assume counts from an old release.
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
umask 077
DB="kunci_restore_check_$(date -u +%Y%m%d%H%M%S)_$$"
[[ "$DB" =~ ^kunci_restore_check_[0-9_]+$ ]] || exit 2
stage=$(mktemp -d /var/backups/kunci/restore-current.XXXXXX)
cleanup() {
  runuser -u postgres -- dropdb --if-exists "$DB"
  case "$stage" in /var/backups/kunci/restore-current.*) rm -rf -- "$stage";; esac
}
trap cleanup EXIT
backup=$(find /var/backups/kunci -maxdepth 1 -name 'kunci-*.tar.gz' -type f | sort | tail -1)
test -n "$backup"
tar -xzf "$backup" -C "$stage"
(cd "$stage"; sha256sum -c SHA256SUMS)
runuser -u postgres -- createdb "$DB"
runuser -u postgres -- pg_restore --exit-on-error -d "$DB" < "$stage/database.dump"
runuser -u postgres -- psql -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM companies) THEN RAISE EXCEPTION 'Restored database has no companies'; END IF;
 IF EXISTS(SELECT e.id FROM journal_entries e LEFT JOIN journal_lines l ON l.journal_entry_id=e.id WHERE e.status='POSTED' GROUP BY e.id HAVING count(l.id)<2 OR sum(l.debit)<>sum(l.credit)) THEN RAISE EXCEPTION 'Restored posted journal is not balanced'; END IF;
 IF EXISTS(SELECT 1 FROM source_facts f JOIN source_files s ON s.id=f."sourceFileId" WHERE s."companyId"<>f."companyId") THEN RAISE EXCEPTION 'Invalid restored source company'; END IF;
END $$;
SELECT 'RESTORE_CURRENT_OK' AS result,
 (SELECT count(*) FROM master_records) AS masters,
 (SELECT count(*) FROM source_facts) AS source_rows,
 (SELECT count(*) FROM journal_entries WHERE status='POSTED') AS posted_journals,
 (SELECT count(*) FROM access_grants) AS grants;
SQL
tar -tf "$stage/uploads.tar" >/dev/null
echo 'CURRENT_DATABASE_AND_UPLOAD_BACKUP_VERIFIED'
