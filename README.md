# SpaceHub — Πλατφόρμα Διαχείρισης Πελατών

Premium customer-management SaaS built around **Customer 360**, **Branches** and **Spaces**, designed for **350.000+ customers** with fast server-side search and filtering.

The UI is in Greek; code, APIs and database identifiers are in English (per spec).

## Stack

- **MariaDB / MySQL** — multi-tenant schema with the ownership hierarchy **TENANT → CUSTOMER → BRANCH → SPACE**; typed-value custom fields; B-tree indexes for exact match, sort and **keyset pagination** (tenant-prefixed); **InnoDB FULLTEXT** indexes for fast search. Accent/case/script-insensitive search uses a precomputed ASCII `search_norm` column (Greek→Latin transliteration in the app layer) — **no DB extensions required**.
- **Node.js + Express** — raw parameterized SQL (`mysql2`); JWT auth (`bcryptjs` + `jsonwebtoken`); server-side search; keyset + page pagination; CSV/Excel/PDF export; slow-query logging; serves the built SPA in production (single-app deployment).
- **React + Vite** — auth flow, **in-app multi-tab workspace** (`zustand`), page-based directory, debounced + cancellable search, query caching (`@tanstack/react-query`). Greek UI labels.

## Architecture highlights

- **Multi-tenancy.** Every customer/branch/space/booking/activity is scoped by `tenant_id`; all queries are bound to the authenticated user's tenant (tenant isolation enforced server-side).
- **Auth + RBAC.** JWT login/register (register creates a tenant + owner). Built-in roles (owner / admin / manager / agent / viewer) map to a permission catalog (`customers.*`, `branches.read`, `settings.manage`, `users.manage`, …) enforced on the server and used to gate the UI.
- **Ownership hierarchy.** Each customer owns its branches (`branches.customer_id`); each branch owns its spaces (`spaces.branch_id`).
- **Never loads all customers.** Server-side search/filter/sort with keyset + page pagination and denormalized aggregates keep the directory index-fast.
- **Smart search** across customers, branches and spaces via FULLTEXT boolean prefix search over a transliterated `search_norm` column. Global command-style search groups results by entity.
- **Dynamic Custom Fields** engine using a typed-value architecture; **CSV / Excel / PDF export** respecting active filters (Greek PDF via an embedded font).
- **In-app multi-tab workspace**: open multiple customers in tabs, switch without losing state.

## Demo accounts (after seeding)

Tenant «Demo Α.Ε.» — password `password123`:

| Role | Email |
| --- | --- |
| Ιδιοκτήτης (owner) | `owner@demo.gr` |
| Διαχειριστής (admin) | `admin@demo.gr` |
| Manager | `manager@demo.gr` |
| Σύμβουλος (agent) | `agent@demo.gr` |
| Θεατής (viewer) | `viewer@demo.gr` |

A second tenant «Acme Ε.Π.Ε.» (`owner@acme.gr`) demonstrates tenant isolation.

### Measured performance (350k customers, ~9M related rows, MariaDB 10.11)

| Query | Latency |
| --- | --- |
| Directory page (keyset, no query) | ~6 ms |
| Selective search (phone / code / specific name) | ~60–260 ms |
| Broad single-fragment search (tens of thousands of matches) | ~400 ms |
| Dashboard KPIs | ~0.6 s |

## Project layout

```
backend/          Express API (raw SQL, mysql2)
  src/db/         schema.sql, apply-schema.js, seed.js (batched inserts)
  src/lib/        normalize.js (Greek→Latin), search.js (FULLTEXT/LIKE), cursor.js
  src/routes/     search, customers, branches, spaces, custom-fields, stats, meta
frontend/         React + Vite app (build output: frontend/dist)
  src/pages/      Dashboard, Customers (directory), CustomerProfile, Settings
  src/components/ design system + customer profile (Overview, BranchesSpaces, HistoryList)
scripts/          setup.sh (bootstrap) + start.sh (per-boot MariaDB)
.cursor/          Cloud Agent environment (Dockerfile + environment.json)
DEPLOY.md         Deployment guide for Plesk (MariaDB, no SSH required)
```

## Local setup

Requires Node 20+ and MariaDB 10.6+ / MySQL 8.

```bash
# 1. Database + user (as a DB admin)
sudo mariadb -e "CREATE DATABASE spacehub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
                 CREATE USER 'spacehub'@'127.0.0.1' IDENTIFIED BY 'spacehub';
                 GRANT ALL ON spacehub.* TO 'spacehub'@'127.0.0.1'; FLUSH PRIVILEGES;"

# 2. Dependencies + env
npm install
cp backend/.env.example backend/.env

# 3. Schema + seed (configurable size)
SEED_CUSTOMERS=350000 npm run db:reset

# 4a. Development (two terminals: API on :4000, Vite on :5173 with /api proxy)
npm run dev:backend
npm run dev:frontend

# 4b. Production-style (single app: API + built SPA on :4000)
npm run build:frontend
NODE_ENV=production npm start
```

`scripts/setup.sh` performs the DB, dependency, build and seed steps idempotently and is what the Cloud Agent `install` runs.

## Key API endpoints

- `GET /api/customers/search` — server-side directory search (`q`, `branchId`, `spaceId`, `status`, `customerType`, `tag`, `isVip`, `lastVisitFrom/To`, `sort`, `cursor`, `limit`).
- `GET /api/customers/count` — result count for current filters.
- `GET /api/customers/:id` (+ `/branches`, `/activities`, `/bookings`, `/visits`, `/payments`, `/communications`, `/documents`, `/notes`, `/custom-fields`).
- `GET /api/customers/:id/spaces/:spaceId/usage` — space drawer content.
- `GET /api/search/global?q=` — grouped global search (customers/branches/spaces).
- `GET /api/branches`, `GET /api/spaces` — async searchable selectors.
- `GET /api/custom-fields?entity=` — custom field definitions.
- `GET /api/stats/overview` — dashboard KPIs.

## Deployment

See **[DEPLOY.md](./DEPLOY.md)** for a step-by-step Plesk guide (MariaDB, no SSH required).
