import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { pool } from './db.js';
import { customersRouter } from './routes/customers.js';
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
import { geoRouter } from './routes/geo.js';
import { authenticate } from './middleware/auth.js';

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
app.use('/api/branches', branchesRouter);
app.use('/api/spaces', spacesRouter);
app.use('/api/custom-fields', customFieldsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/geo', geoRouter);
app.use('/api', usersRouter);

// Unknown API routes return JSON 404 (never the SPA shell).
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built frontend (production / single-app deployment, e.g. Plesk).
const distDir = path.resolve(__dirname, '../../frontend/dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback so client-side routes (deep links) resolve to index.html.
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

// Central error handler.
app.use((err, _req, res, _next) => {
  console.error('API error:', err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

const server = app.listen(config.port, () => {
  console.log(`SpaceHub API listening on port ${config.port} (${config.nodeEnv})`);
});

process.on('SIGTERM', () => server.close(() => pool.end()));
process.on('SIGINT', () => server.close(() => pool.end()));
