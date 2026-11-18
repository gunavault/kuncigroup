#!/bin/bash
set -euo pipefail
export PATH=/opt/node/bin:/usr/local/bin:/usr/bin:/bin
APP=/srv/kunci/app
ARCHIVE=${1:?source archive required}
OWNER_HOME=${2:?deployment user home required}
cd "$APP"
tar -xzf "$ARCHIVE" -C "$APP"
if [ ! -f .env ]; then
  db_password=$(openssl rand -hex 24)
  migrate_password=$(openssl rand -hex 24)
  app_password=$(openssl rand -hex 16)
  session_secret=$(openssl rand -hex 32)
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE kunci_migrate LOGIN PASSWORD '$migrate_password';
CREATE ROLE kunci_app LOGIN PASSWORD '$db_password';
CREATE DATABASE kunci OWNER kunci_migrate;
SQL
  umask 077
  printf 'DATABASE_URL="postgresql://kunci_app:%s@127.0.0.1:5432/kunci?schema=public"\nAPP_PASSWORD="%s"\nSESSION_SECRET="%s"\n' "$db_password" "$app_password" "$session_secret" > .env
  printf 'DATABASE_URL="postgresql://kunci_migrate:%s@127.0.0.1:5432/kunci?schema=public"\n' "$migrate_password" > /srv/kunci/migrate.env
  printf 'Kunci Group ERP pilot\nAkses: http://localhost:8080 (via IAP SSH tunnel)\nPassword aplikasi: %s\n' "$app_password" > "$OWNER_HOME/kunci-access.txt"
  chown --reference="$OWNER_HOME" "$OWNER_HOME/kunci-access.txt"
fi
mkdir -p uploads .next/cache
chown -R kunci:kunci "$APP"
chmod 600 .env /srv/kunci/migrate.env
sudo -u kunci env HOME=/srv/kunci PATH="$PATH" npm ci --include=dev --no-audit --no-fund
set -a; source /srv/kunci/migrate.env; set +a
sudo -u kunci env PATH="$PATH" DATABASE_URL="$DATABASE_URL" npm run db:migrate
sudo -u kunci env PATH="$PATH" DATABASE_URL="$DATABASE_URL" npm run db:seed
sudo -u postgres psql -d kunci -v ON_ERROR_STOP=1 <<'SQL'
GRANT USAGE ON SCHEMA public TO kunci_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO kunci_app;
REVOKE UPDATE,DELETE ON audit_events FROM kunci_app;
REVOKE ALL ON _prisma_migrations FROM kunci_app;
ALTER DEFAULT PRIVILEGES FOR ROLE kunci_migrate IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO kunci_app;
SQL
unset DATABASE_URL
sudo -u kunci env HOME=/srv/kunci PATH="$PATH" NODE_OPTIONS=--max-old-space-size=640 npm run build
systemctl enable --now kunci-erp
systemctl restart kunci-erp
for i in $(seq 1 60); do if curl -fsS http://127.0.0.1:8080/ >/dev/null; then break; fi; sleep 2; done
curl -fsS http://127.0.0.1:8080/ >/dev/null
printf 'Deployment ready. Private listener: 127.0.0.1:8080\n'
