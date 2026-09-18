#!/usr/bin/env bash
# Idempotent repository bootstrap for the SpaceHub Cloud Agent environment
# (MariaDB). Runs after the source is checked out. Safe to run repeatedly.
set -euo pipefail

cd "$(dirname "$0")/.."

DB_NAME="${MYSQL_DATABASE:-spacehub}"
DB_USER="${MYSQL_USER:-spacehub}"
DB_PASS="${MYSQL_PASSWORD:-spacehub}"

echo "==> Ensuring MariaDB is running"
sudo service mariadb start 2>/dev/null || sudo mariadbd-safe --nowatch 2>/dev/null || true
sleep 2

echo "==> Ensuring database and user exist"
sudo mariadb <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

echo "==> Installing npm dependencies"
npm install

echo "==> Preparing backend .env"
[ -f backend/.env ] || cp backend/.env.example backend/.env

echo "==> Building frontend"
npm run build:frontend

echo "==> Applying schema + seeding (only if empty)"
ROWS=$(mysql -h 127.0.0.1 -u "${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -N -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}' AND table_name='customers'" 2>/dev/null || echo 0)
CUSTOMERS=0
if [ "$ROWS" != "0" ]; then
  CUSTOMERS=$(mysql -h 127.0.0.1 -u "${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -N -e "SELECT COUNT(*) FROM customers" 2>/dev/null || echo 0)
fi
if [ "$CUSTOMERS" = "0" ]; then
  echo "   Seeding ${SEED_CUSTOMERS:-50000} customers…"
  npm --workspace backend run db:reset
else
  echo "   Database already has ${CUSTOMERS} customers — skipping seed."
fi

echo "==> Setup complete"
