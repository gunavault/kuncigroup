#!/bin/bash
set -euo pipefail
if [ -f /srv/kunci/bootstrap-ready ]; then exit 0; fi
export DEBIAN_FRONTEND=noninteractive
if [ ! -f /swapfile ]; then fallocate -l 3G /swapfile; chmod 600 /swapfile; mkswap /swapfile; swapon /swapfile; echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
apt-get update -qq
apt-get install -y -qq postgresql postgresql-client nginx curl xz-utils ca-certificates openssl
NODE_VERSION=v22.22.2
cd /tmp
curl -fsSLO "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz"
curl -fsSLO "https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt"
grep " node-${NODE_VERSION}-linux-x64.tar.xz$" SHASUMS256.txt | sha256sum -c -
mkdir -p /opt/node
tar -xJf "node-${NODE_VERSION}-linux-x64.tar.xz" -C /opt/node --strip-components=1
ln -sf /opt/node/bin/node /usr/local/bin/node
ln -sf /opt/node/bin/npm /usr/local/bin/npm
ln -sf /opt/node/bin/npx /usr/local/bin/npx
id kunci >/dev/null 2>&1 || useradd --system --create-home --home-dir /srv/kunci --shell /bin/bash kunci
mkdir -p /srv/kunci/app /srv/kunci/backups
chown -R kunci:kunci /srv/kunci
# Database is loopback only; no Cloud SQL subscription.
pg_conf=$(find /etc/postgresql -name postgresql.conf | head -1)
cat >> "$pg_conf" <<'PG'
listen_addresses = '127.0.0.1'
shared_buffers = '64MB'
max_connections = 30
work_mem = '2MB'
PG
systemctl restart postgresql
cat >/etc/nginx/sites-available/kunci <<'NGINX'
server {
  listen 127.0.0.1:8080;
  server_name localhost;
  client_max_body_size 6m;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy same-origin always;
  add_header X-Frame-Options DENY always;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
  }
}
NGINX
ln -sf /etc/nginx/sites-available/kunci /etc/nginx/sites-enabled/kunci
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
cat >/etc/systemd/system/kunci-erp.service <<'SERVICE'
[Unit]
Description=Kunci Group Finance ERP
After=network.target postgresql.service
[Service]
Type=simple
User=kunci
Group=kunci
WorkingDirectory=/srv/kunci/app
Environment=NODE_ENV=production
Environment=PATH=/opt/node/bin:/usr/local/bin:/usr/bin:/bin
Environment=NODE_OPTIONS=--max-old-space-size=384
ExecStart=/opt/node/bin/node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/srv/kunci/app/uploads /srv/kunci/app/.next/cache
ProtectHome=true
[Install]
WantedBy=multi-user.target
SERVICE
systemctl daemon-reload
cat >/etc/cron.d/kunci-backup <<'CRON'
15 18 * * * postgres umask 077; pg_dump -Fc kunci > /var/lib/postgresql/kunci-$(date +\%F).dump && find /var/lib/postgresql -maxdepth 1 -name 'kunci-*.dump' -mtime +7 -delete
CRON
touch /srv/kunci/bootstrap-ready
