#!/bin/bash
set -euo pipefail
export PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
cd /srv/kunci/app
python3 - <<'PY'
from pathlib import Path
p=Path('/etc/caddy/Caddyfile')
s=p.read_text()
s=s.replace('kunci-erp.34.9.120.7.sslip.io {','kunci-erp.34.9.120.7.sslip.io, kunci-erp.34-9-120-7.nip.io {')
p.write_text(s)
PY
caddy fmt --overwrite /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
# Match the Node.js major used for local verification and the scanner dependency.
NODE_VERSION=v24.15.0
if [ "$(/opt/node/bin/node --version)" != "$NODE_VERSION" ]; then
  stage=$(mktemp -d /tmp/kunci-node.XXXXXX)
  (cd "$stage"; curl -fsSLO "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.xz"; curl -fsSLO "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt"; grep " node-$NODE_VERSION-linux-x64.tar.xz$" SHASUMS256.txt | sha256sum -c -)
  tar -xJf "$stage/node-$NODE_VERSION-linux-x64.tar.xz" -C /opt
  if [ -L /opt/node ]; then ln -sfn "/opt/node-$NODE_VERSION-linux-x64" /opt/node; else mv /opt/node "/opt/node-previous-$(date -u +%Y%m%dT%H%M%SZ)"; ln -s "/opt/node-$NODE_VERSION-linux-x64" /opt/node; fi
fi
/opt/node/bin/node --version
systemctl stop kunci-erp
trap 'systemctl start kunci-erp' ERR
if [ -n "${1:-}" ]; then tar -xzf "$1" -C /srv/kunci/app; chown -R kunci:kunci src tests deploy scripts README.md PANDUAN_OPERASIONAL.md; fi
set -a; source /srv/kunci/migrate.env; set +a
runuser -u kunci -- env PATH="$PATH" DATABASE_URL="$DATABASE_URL" /opt/node/bin/node node_modules/tsx/dist/cli.mjs scripts/minimize-employee-data.ts
runuser -u kunci -- env PATH="$PATH" DATABASE_URL="$DATABASE_URL" npm test
unset DATABASE_URL
runuser -u kunci -- env PATH="$PATH" HOME=/srv/kunci NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=640 npm run build
install -m 750 deploy/backup.sh /usr/local/sbin/kunci-backup
systemctl restart kunci-erp
for i in $(seq 1 40); do if curl -fsS http://127.0.0.1:3000/ >/dev/null; then break; fi; sleep 2; done
runuser -u kunci -- env PATH="$PATH" SMOKE_URL=https://kunci-erp.34-9-120-7.nip.io /opt/node/bin/node node_modules/tsx/dist/cli.mjs scripts/smoke-operations.ts
/usr/local/sbin/kunci-backup
bash deploy/verify-restore-v2.sh
systemctl is-active kunci-erp caddy
echo 'V2_FINAL_CHECKS_COMPLETE'
