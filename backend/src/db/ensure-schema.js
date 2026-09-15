import { query } from '../db.js';

async function columnExists(table, column) {
  const { rows } = await query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]);
  return Number(rows[0].c) > 0;
}

async function tableExists(table) {
  const { rows } = await query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]);
  return Number(rows[0].c) > 0;
}

async function addColumn(table, column, ddl) {
  if (await columnExists(table, column)) return;
  await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  console.log(`[schema] added ${table}.${column}`);
}

export async function ensureSchema() {
  await addColumn('tenants', 'status', "VARCHAR(20) NOT NULL DEFAULT 'active'");
  await addColumn('tenants', 'locale', "VARCHAR(10) NOT NULL DEFAULT 'el'");
  await addColumn('tenants', 'timezone', "VARCHAR(60) NOT NULL DEFAULT 'Europe/Athens'");
  await addColumn('tenants', 'currency', "VARCHAR(8) NOT NULL DEFAULT 'EUR'");
  await addColumn('tenants', 'plan', "VARCHAR(40) NOT NULL DEFAULT 'standard'");
  await addColumn('tenants', 'contact_email', 'VARCHAR(255) NULL');
  await addColumn('tenants', 'contact_phone', 'VARCHAR(40) NULL');
  await addColumn('tenants', 'notes', 'TEXT NULL');
  await addColumn('tenants', 'settings', "JSON NULL");
  await addColumn('tenants', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
  await addColumn('users', 'is_platform_admin', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn('communications', 'recipient', 'VARCHAR(255) NULL');
  await addColumn('communications', 'delivery_status', "VARCHAR(20) NOT NULL DEFAULT 'logged'");

  if (!(await tableExists('platform_settings'))) {
    await query(`CREATE TABLE platform_settings (
      skey VARCHAR(80) NOT NULL PRIMARY KEY,
      svalue TEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[schema] created platform_settings');
  }

  const admins = await query('SELECT COUNT(*) AS c FROM users WHERE is_platform_admin = 1');
  if (!Number(admins.rows[0].c)) {
    await query(
      `UPDATE users SET is_platform_admin = 1
       WHERE id = (SELECT id FROM (
         SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
         WHERE r.\`key\` = 'owner' ORDER BY u.id ASC LIMIT 1
       ) x)`);
    console.log('[schema] granted platform admin to first owner');
  }
}
