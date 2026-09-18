#!/usr/bin/env bash
# Per-boot startup: ensure MariaDB is running. Idempotent and non-blocking.
set -euo pipefail

echo "==> Starting MariaDB"
sudo service mariadb start 2>/dev/null || sudo mariadbd-safe --nowatch 2>/dev/null || true

for i in $(seq 1 30); do
  if mysqladmin -h 127.0.0.1 ping >/dev/null 2>&1; then
    echo "==> MariaDB is ready"
    exit 0
  fi
  sleep 1
done
echo "==> WARNING: MariaDB did not become ready in time" >&2
exit 0
