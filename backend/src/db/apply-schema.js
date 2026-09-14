import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mysql from 'mysql2/promise';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = await readFile(join(__dirname, 'schema.sql'), 'utf8');
  // A dedicated connection with multipleStatements enabled for DDL only.
  const conn = await mysql.createConnection({ ...config.mysql, multipleStatements: true });
  console.log('Applying schema…');
  await conn.query(sql);
  console.log('Schema applied successfully.');
  await conn.end();
}

main().catch((err) => {
  console.error('Failed to apply schema:', err);
  process.exit(1);
});
