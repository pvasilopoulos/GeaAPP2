import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = await readFile(join(__dirname, 'schema.sql'), 'utf8');
  console.log('Applying schema…');
  await pool.query(sql);
  console.log('Schema applied successfully.');
  await pool.end();
}

main().catch((err) => {
  console.error('Failed to apply schema:', err);
  process.exit(1);
});
