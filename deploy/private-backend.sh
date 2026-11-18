#!/bin/bash
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
cat >/etc/nginx/conf.d/kunci-private.conf <<'NGINX'
server {
  listen 10.128.0.2:8081;
  server_name _;
  client_max_body_size 8m;
  # Cloud Run startup checks VPC connectivity even during app maintenance.
  if ($host = localhost) { return 200 "private gateway ready\n"; }
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Host $http_host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $http_x_forwarded_for;
    proxy_set_header Connection "";
    proxy_read_timeout 120s;
  }
}
NGINX
nginx -t
systemctl reload nginx
for i in $(seq 1 10); do if curl --max-time 10 -fsS -H 'Host: localhost' http://10.128.0.2:8081/ >/dev/null 2>&1; then break; fi; sleep 1; done
curl --max-time 20 -fsS -H 'Host: localhost' http://10.128.0.2:8081/ >/dev/null
echo 'PRIVATE_BACKEND_READY'
