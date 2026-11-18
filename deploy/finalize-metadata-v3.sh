#!/bin/bash
set -euo pipefail
export PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
cd /srv/kunci/app
tar -xzf /home/dharma_regar/kunci-v3-financial-metadata.tar.gz -C /srv/kunci/app
tar -xzf /home/dharma_regar/kunci-v3-verification-patch.tar.gz -C /srv/kunci/app
tar -xzf /home/dharma_regar/kunci-v3-financial-data-private.tar.gz -C /srv/kunci/app/data
chown kunci:kunci scripts/prepare-upload-v3.mjs scripts/import-upload-v3.ts scripts/verify-upload-v3.ts scripts/patch-source-document-dates-v3.ts scripts/smoke-v3.ts deploy/verify-restore-v3.sh data/upload-audit/import-v3.json
chmod 600 data/upload-audit/import-v3.json
set -a; source /srv/kunci/migrate.env; set +a
runuser -u kunci -- env PATH="$PATH" DATABASE_URL="$DATABASE_URL" node node_modules/tsx/dist/cli.mjs scripts/patch-source-document-dates-v3.ts
runuser -u kunci -- env PATH="$PATH" DATABASE_URL="$DATABASE_URL" SKIP_ORIGINAL_FILES=1 DATA_QA_OUTPUT=artifacts/cloud-data-qa-v3.json node node_modules/tsx/dist/cli.mjs scripts/verify-upload-v3.ts
unset DATABASE_URL
runuser -u kunci -- env PATH="$PATH" SMOKE_URL=http://127.0.0.1:3000 node node_modules/tsx/dist/cli.mjs scripts/smoke-v3.ts
/usr/local/sbin/kunci-backup
bash deploy/verify-restore-v3.sh
echo 'SOURCE_METADATA_AND_FINAL_BACKUP_VERIFIED'
