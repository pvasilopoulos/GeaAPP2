import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config.js';
import { pool } from './db.js';
import { customersRouter } from './routes/customers.js';
import { metaRouter } from './routes/meta.js';
import { searchRouter } from './routes/search.js';
import { branchesRouter } from './routes/branches.js';
import { spacesRouter } from './routes/spaces.js';
import { customFieldsRouter } from './routes/customFields.js';
import { statsRouter } from './routes/stats.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('tiny'));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});

app.use('/api/meta', metaRouter);
app.use('/api/search', searchRouter);
app.use('/api/customers', customersRouter);
app.use('/api/branches', branchesRouter);
app.use('/api/spaces', spacesRouter);
app.use('/api/custom-fields', customFieldsRouter);
app.use('/api/stats', statsRouter);

// Central error handler.
app.use((err, _req, res, _next) => {
  console.error('API error:', err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

const server = app.listen(config.port, () => {
  console.log(`SpaceHub API listening on http://127.0.0.1:${config.port}`);
});

process.on('SIGTERM', () => server.close(() => pool.end()));
process.on('SIGINT', () => server.close(() => pool.end()));
