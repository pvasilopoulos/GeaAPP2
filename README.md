# SpaceHub — Πλατφόρμα Διαχείρισης Πελατών

Premium customer-management SaaS built around **Customer 360**, **Branches** and **Spaces**, designed for **350.000+ customers** with fast server-side search and filtering.

The UI is in Greek; code, APIs and database identifiers are in English (per spec).

## Stack

- **PostgreSQL 16** — normalized schema, typed-value custom fields, B-tree indexes for exact/sort, **GIN + `pg_trgm`** for smart substring search, **`unaccent`** (via an `IMMUTABLE` `f_unaccent` wrapper) for accent-insensitive Greek search.
- **Node.js + Express** — raw parameterized SQL for full control over queries and indexes. Server-side search, keyset (cursor) pagination, slow-query logging.
- **React + Vite** — premium SaaS UI, virtualized directory (`react-window`), debounced + cancellable search, query caching (`@tanstack/react-query`).

## Architecture highlights

- **Never loads all customers.** The directory uses server-side search/filter/sort with **keyset cursor pagination** (deep pages stay as fast as the first) and **frontend virtualization**.
- **Smart search** across customers, branches and spaces: partial, accent-insensitive matching using a generated `search_text` column indexed with a trigram GIN index. Global command-style search groups results by entity.
- **Dynamic Custom Fields** engine (Customers / Branches / Spaces) using a **typed-value** architecture (not unindexed EAV/JSON), with searchable/filterable fields backed by indexes.
- **Denormalized aggregates** on `customers` (branch/space/booking/visit counts, total value, last visit, next booking) keep the directory listing index-only fast, while relationships stay fully normalized.

### Measured performance (350k customers, ~9M related rows)

| Query | Latency |
| --- | --- |
| Directory page (keyset, no query) | ~0.2 ms (index scan) |
| Selective search (phone/rare term, trigram GIN) | ~2 ms |
| Broad partial-name relevance search | ~130 ms |

## Project layout

```
backend/          Express API (raw SQL)
  src/db/         schema.sql, apply-schema.js, seed.js (streaming COPY)
  src/routes/     search, customers, branches, spaces, custom-fields, stats, meta
frontend/         React + Vite app
  src/pages/      Dashboard, Customers (directory), CustomerProfile, Settings
  src/components/ design system + customer profile (Overview, BranchesSpaces, HistoryList)
scripts/          setup.sh (bootstrap) + start.sh (per-boot)
.cursor/          Cloud Agent environment (Dockerfile + environment.json)
```

## Local setup

Requires Node 20+ and PostgreSQL 16 with `pg_trgm` and `unaccent`.

```bash
# 1. Database role/db/extensions (as a superuser)
sudo -u postgres psql -c "CREATE ROLE spacehub LOGIN PASSWORD 'spacehub' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE spacehub OWNER spacehub;"
sudo -u postgres psql -d spacehub -c "CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS unaccent;"

# 2. Dependencies
npm install

# 3. Schema + seed (configurable size)
cp backend/.env.example backend/.env
SEED_CUSTOMERS=350000 npm run db:reset

# 4. Run (two terminals)
npm run dev:backend    # http://127.0.0.1:4000
npm run dev:frontend   # http://127.0.0.1:5173
```

`scripts/setup.sh` performs steps 1–3 idempotently and is what the Cloud Agent `install` runs.

## Key API endpoints

- `GET /api/customers/search` — server-side directory search (`q`, `branchId`, `spaceId`, `status`, `customerType`, `tag`, `isVip`, `lastVisitFrom/To`, `sort`, `cursor`, `limit`).
- `GET /api/customers/count` — result count for current filters.
- `GET /api/customers/:id` (+ `/branches`, `/activities`, `/bookings`, `/visits`, `/payments`, `/communications`, `/documents`, `/notes`, `/custom-fields`).
- `GET /api/customers/:id/spaces/:spaceId/usage` — space drawer content.
- `GET /api/search/global?q=` — grouped global search (customers/branches/spaces).
- `GET /api/branches`, `GET /api/spaces` — async searchable selectors.
- `GET /api/custom-fields?entity=` — custom field definitions.
- `GET /api/stats/overview` — dashboard KPIs.
