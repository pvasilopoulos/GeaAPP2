import mysql from 'mysql2/promise';
import { config } from './config.js';

// Shared connection pool for the API process.
export const pool = mysql.createPool({
  ...config.mysql,
  waitForConnections: true,
  queueLimit: 0,
  namedPlaceholders: false,
  dateStrings: false,
});

// Returns { rows } to keep a Postgres-like call shape across the codebase.
export async function query(sql, params) {
  const start = Date.now();
  const [rows] = await pool.query(sql, params);
  const durationMs = Date.now() - start;
  if (durationMs > 500) {
    // Lightweight slow-query monitoring (spec §22).
    console.warn(`[slow-query ${durationMs}ms] ${sql.split('\n').join(' ').slice(0, 140)}`);
  }
  return { rows };
}

export async function withConnection(fn) {
  const conn = await pool.getConnection();
  try {
    return await fn(conn);
  } finally {
    conn.release();
  }
}
