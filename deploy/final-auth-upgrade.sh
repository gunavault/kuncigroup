#!/bin/bash
set -euo pipefail
export PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
cd /srv/kunci/app
tar -xzf /home/dharma_regar/kunci-erp-auth-patch.tar.gz -C /srv/kunci/app
chown kunci:kunci src/lib/auth.ts tests/origin.test.ts
set -a; source /srv/kunci/migrate.env; set +a
runuser -u kunci -- env PATH="$PATH" DATABASE_URL="$DATABASE_URL" npm test
unset DATABASE_URL
systemctl stop kunci-erp
trap 'systemctl start kunci-erp' ERR
runuser -u kunci -- env PATH="$PATH" HOME=/srv/kunci NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=640 npm run build
systemctl restart kunci-erp
for i in $(seq 1 40); do if curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1; then break; fi; sleep 2; done
runuser -u kunci -- env PATH="$PATH" SMOKE_URL=http://127.0.0.1:3000 /opt/node/bin/node node_modules/tsx/dist/cli.mjs scripts/smoke-operations.ts
/usr/local/sbin/kunci-backup
bash deploy/verify-restore-v2.sh
echo 'FINAL_AUTH_BACKUP_CHECKS_COMPLETE'
