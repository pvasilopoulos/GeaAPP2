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
  await addColumn('activities', 'details', 'JSON NULL');
  await addColumn('customers', 'erp_id', 'VARCHAR(160) NULL');
  await addColumn('branches', 'erp_id', 'VARCHAR(160) NULL');
  await addColumn('spaces', 'erp_id', 'VARCHAR(160) NULL');

  if (!(await tableExists('platform_settings'))) {
    await query(`CREATE TABLE platform_settings (
      skey VARCHAR(80) NOT NULL PRIMARY KEY,
      svalue TEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[schema] created platform_settings');
  }

  if (!(await tableExists('connectors'))) {
    await query(`CREATE TABLE connectors (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL,
      name VARCHAR(160) NOT NULL, base_url VARCHAR(500) NOT NULL,
      target_entity VARCHAR(20) NOT NULL DEFAULT 'customers',
      method VARCHAR(10) NOT NULL DEFAULT 'GET', auth_type VARCHAR(20) NOT NULL DEFAULT 'bearer',
      credentials_enc TEXT NULL, body_template TEXT NULL,
      headers JSON NULL, mappings JSON NOT NULL, schedule_minutes INT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 0, timeout_ms INT NOT NULL DEFAULT 30000,
      retry_count INT NOT NULL DEFAULT 3, last_run_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_connector_tenant_name (tenant_id, name),
      KEY idx_connector_schedule (enabled, schedule_minutes, last_run_at),
      CONSTRAINT fk_connectors_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }
  await addColumn('connectors', 'auth_type', "VARCHAR(20) NOT NULL DEFAULT 'bearer'");
  await addColumn('connectors', 'body_template', 'TEXT NULL');
  await addColumn('connectors', 'target_entity', "VARCHAR(20) NOT NULL DEFAULT 'customers'");
  if (!(await tableExists('sync_runs'))) {
    await query(`CREATE TABLE sync_runs (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL,
      connector_id BIGINT NOT NULL, status VARCHAR(20) NOT NULL,
      started_at DATETIME NOT NULL, finished_at DATETIME NULL,
      records_seen INT NOT NULL DEFAULT 0, records_upserted INT NOT NULL DEFAULT 0,
      error_count INT NOT NULL DEFAULT 0, error_message TEXT NULL,
      KEY idx_sync_runs_connector (connector_id, started_at),
      CONSTRAINT fk_sync_runs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      CONSTRAINT fk_sync_runs_connector FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
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
