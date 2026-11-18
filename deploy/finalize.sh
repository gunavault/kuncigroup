#!/bin/bash
set -euo pipefail
export PATH=/opt/node/bin:/usr/local/bin:/usr/bin:/bin
cd /srv/kunci/app
sudo tar -xzf /home/dharma_regar/kunci-erp-final.tar.gz -C /srv/kunci/app
sudo chown -R kunci:kunci /srv/kunci/app
# Same lockfile and installed dependencies; no second installation.
sudo -u kunci env PATH="$PATH" NEXT_TELEMETRY_DISABLED=1 PRISMA_HIDE_UPDATE_MESSAGE=1 CHECKPOINT_DISABLE=1 NODE_OPTIONS=--max-old-space-size=640 npm run build
sudo systemctl restart kunci-erp
for i in $(seq 1 30); do if curl -fsS http://127.0.0.1:8080/ >/dev/null; then break; fi; sleep 2; done
set -a; source /srv/kunci/migrate.env; set +a
sudo -u kunci env PATH="$PATH" DATABASE_URL="$DATABASE_URL" npm test
unset DATABASE_URL
sudo -u kunci env PATH="$PATH" /opt/node/bin/node node_modules/tsx/dist/cli.mjs scripts/smoke-production.ts
sudo bash deploy/verify-backup.sh
