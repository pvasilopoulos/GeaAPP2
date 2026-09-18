import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { pool, query } from './db.js';
import { mergeTenantSettings } from './lib/tenantSettings.js';
import { customersRouter } from './routes/customers.js';
import { customerViewsRouter } from './routes/customerViews.js';
import { metaRouter } from './routes/meta.js';
import { searchRouter } from './routes/search.js';
import { branchesRouter } from './routes/branches.js';
import { spacesRouter } from './routes/spaces.js';
import { customFieldsRouter } from './routes/customFields.js';
import { statsRouter } from './routes/stats.js';
import { exportRouter } from './routes/export.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { uploadsRouter, UPLOADS_DIR } from './routes/uploads.js';
import { quotesRouter } from './routes/quotes.js';
import { geoRouter } from './routes/geo.js';
import { authenticate } from './middleware/auth.js';
import { ensureSchema } from './db/ensure-schema.js';
import { tenantsRouter } from './routes/tenants.js';
import { settingsRouter } from './routes/settings.js';
import { connectorsRouter } from './routes/connectors.js';
import { startScheduler } from './lib/scheduler.js';
import { followUpsRouter } from './routes/followUps.js';
import { bookingsRouter } from './routes/bookings.js';
import { calendarRouter } from './routes/calendar.js';
import { notificationsRouter } from './routes/notifications.js';
import { auditRouter } from './routes/audit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// CORS is only needed for the split-origin dev setup (Vite on :5173). In
// production the same Express process serves the SPA, so it is same-origin.
if (config.nodeEnv !== 'production') app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(morgan('tiny'));

mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});

// Public authentication endpoints (login/register); /me authenticates itself.
app.use('/api/auth', authRouter);

// Everything below requires a valid token.
app.use('/api', authenticate);

app.use('/api/meta', metaRouter);
app.use('/api/search', searchRouter);
// Export is registered before the customers router so `/export` is not matched
// by the `/:id` route.
app.use('/api/customers', exportRouter);
app.use('/api/customers', customersRouter);
app.use('/api/follow-ups', followUpsRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/customer-views', customerViewsRouter);
app.use('/api/branches', branchesRouter);
app.use('/api/spaces', spacesRouter);
app.use('/api/custom-fields', customFieldsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/geo', geoRouter);
app.use('/api/tenants', tenantsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/connectors', connectorsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/audit', auditRouter);
app.use('/api', usersRouter);

// Unknown API routes return JSON 404 (never the SPA shell).
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Browser visits to :4000 should never show Express's "Cannot GET /".
// Production serves the built SPA; in local/dev we redirect to Vite (:5173).
const distDir = path.resolve(__dirname, '../../frontend/dist');
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173';

// The PWA manifest is a single static file per browser origin, but this
// deployment's "Όνομα εφαρμογής" branding setting is tenant-scoped. There is
// no authenticated session at manifest-fetch time (the browser requests it
// directly, no Authorization header), so — same limitation as the browser
// tab title before login — it reflects the primary tenant (id 1), which is
// what every current single-org deployment of this app actually is.
function sendServiceWorker(res, filePath) {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(filePath);
}

app.get('/sw.js', (_req, res) => {
  const distSw = path.join(distDir, 'sw.js');
  if (!existsSync(distSw)) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    return res.status(404).send('/* service worker missing — build the frontend */');
  }
  return sendServiceWorker(res, distSw);
});

app.get('/manifest.webmanifest', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  let base;
  try {
    const manifestPath = path.join(distDir, 'manifest.webmanifest');
    const src = existsSync(manifestPath)
      ? manifestPath
      : path.resolve(__dirname, '../../frontend/public/manifest.webmanifest');
    base = JSON.parse(readFileSync(src, 'utf8'));
  } catch (err) {
    console.error('Failed to read PWA manifest:', err);
    return res.status(500).json({ error: 'Manifest unavailable' });
  }
  try {
    const { rows } = await query('SELECT settings FROM tenants WHERE id = 1');
    const { app_name } = mergeTenantSettings(rows[0]?.settings);
    const name = (app_name && String(app_name).trim()) || base.name || 'SpaceHub';
    return res.json({ ...base, name, short_name: name });
  } catch (err) {
    console.error('Failed to brand PWA manifest:', err);
    return res.json(base);
  }
});

if (existsSync(distDir)) {
  app.use(express.static(distDir, {
    setHeaders(res, filePath) {
      if (
        filePath.endsWith(`${path.sep}sw.js`)
        || filePath.endsWith('/sw.js')
        || filePath.endsWith('manifest.webmanifest')
        || /workbox-.*\.js$/i.test(filePath)
      ) {
        res.setHeader('Cache-Control', 'no-cache');
        if (filePath.endsWith('sw.js')) res.setHeader('Service-Worker-Allowed', '/');
      }
    },
  }));
  app.get('*', (req, res) => {
    if (req.path === '/sw.js' || req.path === '/manifest.webmanifest') {
      return res.status(404).end();
    }
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  app.get('*', (req, res) => {
    res.redirect(302, `${frontendOrigin}${req.originalUrl || '/'}`);
  });
}

// Central error handler.
app.use((err, _req, res, _next) => {
  console.error('API error:', err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

let server;
let stopScheduler;
ensureSchema()
  .then(() => {
    stopScheduler = startScheduler();
    server = app.listen(config.port, () => {
      console.log(`SpaceHub API listening on port ${config.port} (${config.nodeEnv})`);
    });
  })
  .catch((err) => {
    console.error('Failed to ensure schema:', err);
    process.exit(1);
  });

const shutdown = () => { stopScheduler?.(); server?.close(() => pool.end()); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
