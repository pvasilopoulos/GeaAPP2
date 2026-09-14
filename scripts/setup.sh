#!/usr/bin/env bash
# Idempotent repository bootstrap for the SpaceHub Cloud Agent environment.
# Runs after the source is checked out. Safe to run repeatedly.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Ensuring PostgreSQL is running"
sudo pg_ctlcluster 16 main start 2>/dev/null || sudo pg_ctlcluster 16 main restart 2>/dev/null || true

echo "==> Ensuring database role, database and extensions exist"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'spacehub') THEN
    CREATE ROLE spacehub WITH LOGIN PASSWORD 'spacehub' CREATEDB;
  END IF;
END$$;
SELECT 'CREATE DATABASE spacehub OWNER spacehub'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'spacehub')\gexec
SQL
sudo -u postgres psql -d spacehub -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
GRANT ALL ON SCHEMA public TO spacehub;
SQL

echo "==> Installing npm dependencies"
npm install

echo "==> Preparing backend .env"
[ -f backend/.env ] || cp backend/.env.example backend/.env

echo "==> Applying schema + seeding (only if empty)"
COUNT=$(PGPASSWORD=spacehub psql -h 127.0.0.1 -U spacehub -d spacehub -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_name='customers'" 2>/dev/null || echo 0)
ROWS=0
if [ "$COUNT" != "0" ]; then
  ROWS=$(PGPASSWORD=spacehub psql -h 127.0.0.1 -U spacehub -d spacehub -tAc "SELECT count(*) FROM customers" 2>/dev/null || echo 0)
fi
if [ "$ROWS" = "0" ]; then
  echo "   Seeding ${SEED_CUSTOMERS:-50000} customers…"
  npm --workspace backend run db:reset
else
  echo "   Database already has ${ROWS} customers — skipping seed."
fi

echo "==> Setup complete"
