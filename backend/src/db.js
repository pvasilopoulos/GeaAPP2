import pg from 'pg';
import { config } from './config.js';

// A single shared pool for the API process.
export const pool = new pg.Pool(config.pg);

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const durationMs = Date.now() - start;
  if (durationMs > 500) {
    // Lightweight slow-query monitoring (spec §22).
    console.warn(`[slow-query ${durationMs}ms] ${text.split('\n').join(' ').slice(0, 140)}`);
  }
  return res;
}

export async function withClient(fn) {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
