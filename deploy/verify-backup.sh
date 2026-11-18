#!/bin/bash
set -euo pipefail
RESTORE_DB=kunci_restore_check
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$RESTORE_DB'" | grep -q 1; then echo 'Refusing to overwrite an existing restore database'; exit 1; fi
BACKUP=/var/lib/postgresql/kunci-first-verified.dump
sudo -u postgres pg_dump -Fc kunci | sudo -u postgres tee "$BACKUP" >/dev/null
sudo chmod 600 "$BACKUP"
sudo -u postgres createdb "$RESTORE_DB"
trap 'sudo -u postgres dropdb kunci_restore_check' EXIT
sudo -u postgres pg_restore --exit-on-error -d "$RESTORE_DB" "$BACKUP"
result=$(sudo -u postgres psql -d "$RESTORE_DB" -tAc "SELECT (SELECT count(*) FROM journal_entries)=6 AND (SELECT sum(debit)=sum(credit) FROM journal_lines)")
if [ "$result" != t ]; then echo 'Restore validation failed'; exit 1; fi
printf 'Backup and restore PASS: six journals restored, debit equals credit.\n'
