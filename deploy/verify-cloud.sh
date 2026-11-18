#!/bin/bash
set -euo pipefail
export PATH=/opt/node/bin:/usr/local/bin:/usr/bin:/bin
cd /srv/kunci/app
# Runtime source is already compiled and smoke-tested. This synchronization
# removes the unused standalone packaging option and updates operational files.
tar -xzf /home/dharma_regar/kunci-erp-final.tar.gz -C /srv/kunci/app
chown -R kunci:kunci src scripts tests deploy
chown kunci:kunci next.config.ts README.md
systemctl restart kunci-erp
set -a; source /srv/kunci/migrate.env; set +a
sudo -u kunci env PATH="$PATH" DATABASE_URL="$DATABASE_URL" npm test
unset DATABASE_URL
sudo -u kunci env PATH="$PATH" /opt/node/bin/node node_modules/tsx/dist/cli.mjs scripts/smoke-production.ts
bash deploy/verify-backup.sh
systemctl is-active kunci-erp
sha256sum src/lib/auth.ts src/lib/accounting.ts src/components/journal-form.tsx
