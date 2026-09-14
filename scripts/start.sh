#!/usr/bin/env bash
# Per-boot startup: ensure PostgreSQL is running. Idempotent and non-blocking.
set -euo pipefail

echo "==> Starting PostgreSQL cluster"
sudo pg_ctlcluster 16 main start 2>/dev/null || sudo pg_ctlcluster 16 main restart 2>/dev/null || true

# Wait until the server accepts connections (max ~30s).
for i in $(seq 1 30); do
  if pg_isready -h 127.0.0.1 -q 2>/dev/null; then
    echo "==> PostgreSQL is ready"
    exit 0
  fi
  sleep 1
done
echo "==> WARNING: PostgreSQL did not become ready in time" >&2
exit 0
