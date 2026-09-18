# Deploying SpaceHub to Plesk (MariaDB, no SSH required)

This guide targets a Plesk domain/subdomain (e.g. `gea2.softify.gr`) running the
bundled **MariaDB**, using only the Plesk UI. The whole app runs as a **single
Node.js application** that serves both the REST API and the built React SPA, so
there is no separate web server or reverse proxy to configure.

## 1. Create the database (Plesk → Databases)

- Add a **MariaDB** database, e.g. `geaapp`, and a database user with a password.
- No extensions or special privileges are required.

## 2. Upload the code (Plesk → Git or File Manager)

Deploy the repository into the domain's folder, e.g.
`/var/www/vhosts/softify.gr/gea2.softify.gr`. Use **Plesk Git** (pull the
repository) or upload a zip via **File Manager** and extract it. Do **not** upload
`node_modules`.

## 3. Node.js settings (Plesk → Node.js)

Set these exactly (the paths are relative to the domain folder):

| Field | Value |
| --- | --- |
| Node.js version | 20+ |
| **Application Root** | the domain folder (contains the root `package.json`) |
| **Application Startup File** | `backend/src/index.js` |
| **Document Root** | `<domain folder>/frontend/dist` |
| **Application Mode** | `production` |

> The Document Root **must be a subfolder of the Application Root**, and
> `frontend/dist` only exists **after** the build step (step 5). Set the
> Document Root after building.

## 4. Environment variables (Plesk → Node.js → Custom environment variables)

```
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=<your db user>
MYSQL_PASSWORD=<your db password>
MYSQL_DATABASE=geaapp
NODE_ENV=production
JWT_SECRET=<a long random string>
SEED_CUSTOMERS=50000

# Optional — enables mobile/desktop push notifications. Generate a pair once
# with `npx web-push generate-vapid-keys` and set both here; leave blank to
# keep push disabled (in-app notifications still work).
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:info@softify.gr
```

`JWT_SECRET` signs auth tokens — set a long random value in production. Seeding
creates demo users (see README); the first real user can also self-register at
`/register`, which creates their tenant and an owner account.

`PORT` is provided automatically by Plesk/Passenger — do not set it.

Also create `backend/.env` via **File Manager** with the same `MYSQL_*` values, so
the schema/seed commands (step 6) connect to the right database.

## 5. Install dependencies & build the frontend

The `vite` build tool is a devDependency, so it must be installed for the build:

1. Temporarily set **Application Mode → `development`** and click **NPM install**.
2. Open the **“Run Node.js commands”** tab and run: `build:frontend`
   (this creates `frontend/dist`).

## 6. Create the schema and seed data (Run Node.js commands)

Run, in order:

```
db:schema
db:seed
```

`db:seed` uses `SEED_CUSTOMERS` (default 50000). For a large dataset, raise it
gradually; very large seeds via the UI may hit time limits.

## 7. Go live

- Set **Document Root** = `frontend/dist`, **Application Startup File** =
  `backend/src/index.js`, **Application Mode** = `production`.
- Click **Restart App**.
- Enable **Let's Encrypt SSL** for the domain.

Open `https://<your domain>/` — the dashboard, directory search, Customer 360 and
Branches & Spaces should all work. Client-side deep links (e.g.
`/customers/123`) resolve correctly because the API serves the SPA with a
fallback route.

## Troubleshooting

- **`vite: not found` during build** → NPM install ran in production mode; switch
  to development mode, NPM install, then build (step 5).
- **`frontend/dist` not found** → run `build:frontend` before setting the Document
  Root (step 5).
- **“document root is not a subchild of application root”** → Application Root must
  be the domain folder, not `backend/src`; Document Root must be `frontend/dist`.
- **DB connection errors on `db:schema`/`db:seed`** → ensure `backend/.env` has the
  correct `MYSQL_*` values.
- **Passenger/500 on a very new Node** → try Node 20 LTS in the version dropdown.
