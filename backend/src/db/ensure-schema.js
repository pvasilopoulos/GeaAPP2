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

async function indexExists(table, index) {
  const { rows } = await query(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, index]);
  return Number(rows[0].c) > 0;
}

async function dropIndex(table, index) {
  if (!(await indexExists(table, index))) return;
  await query(`ALTER TABLE ${table} DROP INDEX ${index}`);
  console.log(`[schema] removed ${table}.${index}`);
}

async function addUniqueIndex(table, index, columns) {
  if (await indexExists(table, index)) return;
  await query(`ALTER TABLE ${table} ADD UNIQUE KEY ${index} (${columns})`);
  console.log(`[schema] added ${table}.${index}`);
}

async function addColumn(table, column, ddl) {
  if (await columnExists(table, column)) return;
  await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  console.log(`[schema] added ${table}.${column}`);
}

async function addIndex(table, index, columns) {
  if (await indexExists(table, index)) return;
  await query(`ALTER TABLE ${table} ADD INDEX ${index} (${columns})`);
  console.log(`[schema] added index ${table}.${index}`);
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
  // Personal nav-menu override (sidebar/mobile-footer order & visibility).
  // NULL means the user has no personal preference and falls back to the
  // tenant-wide default menu configuration.
  await addColumn('users', 'menu_preferences', 'JSON NULL');
  await addColumn('communications', 'recipient', 'VARCHAR(255) NULL');
  await addColumn('communications', 'delivery_status', "VARCHAR(20) NOT NULL DEFAULT 'logged'");
  await addColumn('activities', 'details', 'JSON NULL');
  await addColumn('customers', 'next_action_at', 'DATETIME NULL');
  await addColumn('customers', 'next_action_note', 'VARCHAR(200) NULL');
  await addColumn('customers', 'next_action_followup_id', 'BIGINT NULL');
  await addIndex('customers', 'idx_customers_next_action_followup', 'next_action_followup_id');
  await addColumn('customers', 'erp_id', 'VARCHAR(160) NULL');
  // Idempotency key for offline-created customers: a retried submission with
  // the same key returns the existing record instead of duplicating it.
  // NULL values are excluded from MySQL unique-index enforcement, so requests
  // without a key (the pre-existing behaviour) are unaffected.
  await addColumn('customers', 'client_request_id', 'VARCHAR(100) NULL');
  await addUniqueIndex('customers', 'uq_customers_tenant_client_request', 'tenant_id, client_request_id');
  await addColumn('branches', 'erp_id', 'VARCHAR(160) NULL');
  await addColumn('branches', 'customer_erp_id', 'VARCHAR(160) NULL');
  await addColumn('spaces', 'erp_id', 'VARCHAR(160) NULL');
  await addColumn('spaces', 'branch_erp_id', 'VARCHAR(160) NULL');
  await addColumn('documents', 'category', "VARCHAR(60) NOT NULL DEFAULT 'general'");
  await addColumn('documents', 'description', 'VARCHAR(500) NULL');
  await addColumn('documents', 'uploaded_by', 'BIGINT NULL');
  await addColumn('notes', 'title', 'VARCHAR(200) NULL');
  await addColumn('notes', 'body_html', 'MEDIUMTEXT NULL');
  await addColumn('notes', 'category', "VARCHAR(60) NOT NULL DEFAULT 'general'");
  await addColumn('notes', 'is_pinned', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn('notes', 'is_archived', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn('notes', 'due_at', 'DATETIME NULL');
  await addColumn('notes', 'tags', 'JSON NULL');
  await addColumn('notes', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  await addIndex('notes', 'idx_notes_customer_due', 'customer_id, due_at');
  await addIndex('notes', 'idx_notes_customer_archived', 'customer_id, is_archived, is_pinned, created_at');
  if (!(await tableExists('follow_ups'))) {
    await query(`CREATE TABLE follow_ups (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL, customer_id BIGINT NOT NULL, branch_id BIGINT NULL,
      title VARCHAR(200) NOT NULL, description VARCHAR(1000) NULL,
      due_at DATETIME NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'open',
      assigned_employee_id BIGINT NULL, created_by BIGINT NULL,
      completed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_followups_tenant_due (tenant_id, status, due_at),
      KEY idx_followups_customer_due (customer_id, status, due_at),
      CONSTRAINT fk_followups_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      CONSTRAINT fk_followups_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      CONSTRAINT fk_followups_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
      CONSTRAINT fk_followups_employee FOREIGN KEY (assigned_employee_id) REFERENCES employees(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[schema] created follow_ups');
  }
  await addColumn('follow_ups', 'branch_id', 'BIGINT NULL');
  if (!(await tableExists('quotes'))) {
    await query(`CREATE TABLE quotes (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL,
      series VARCHAR(30) NOT NULL, quote_number INT NOT NULL, quote_date DATE NOT NULL,
      customer_id BIGINT NOT NULL, branch_id BIGINT NULL, email_template VARCHAR(100),
      payment_terms VARCHAR(160), valid_until DATE, seller_id BIGINT NULL,
      reference_start_year INT, reference_end_year INT, payment_due_date DATE,
      send_email TINYINT(1) NOT NULL DEFAULT 0, email_sent TINYINT(1) NOT NULL DEFAULT 0,
      email_sent_at DATETIME NULL, status VARCHAR(20) NOT NULL DEFAULT 'draft',
      status_error TEXT NULL, status_updated_at DATETIME NULL, status_updated_by BIGINT NULL,
      pdf_generated_at DATETIME NULL,
      subtotal DECIMAL(12,2) NOT NULL DEFAULT 0, tax_total DECIMAL(12,2) NOT NULL DEFAULT 0,
      total DECIMAL(12,2) NOT NULL DEFAULT 0, created_by BIGINT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_quotes_series_number (tenant_id, series, quote_number),
      KEY idx_quotes_customer (tenant_id, customer_id, created_at),
      CONSTRAINT fk_quotes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }
  await addColumn('quotes', 'status_error', 'TEXT NULL');
  await addColumn('quotes', 'status_updated_at', 'DATETIME NULL');
  await addColumn('quotes', 'status_updated_by', 'BIGINT NULL');
  await addColumn('quotes', 'pdf_generated_at', 'DATETIME NULL');
  if (!(await tableExists('quote_lines'))) {
    await query(`CREATE TABLE quote_lines (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, quote_id BIGINT NOT NULL,
      line_order INT NOT NULL DEFAULT 0, description VARCHAR(500) NOT NULL,
      quantity DECIMAL(12,3) NOT NULL DEFAULT 1, unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
      discount_percent DECIMAL(6,2) NOT NULL DEFAULT 0, tax_percent DECIMAL(6,2) NOT NULL DEFAULT 24,
      line_total DECIMAL(12,2) NOT NULL DEFAULT 0, metadata JSON NULL,
      CONSTRAINT fk_quote_lines_quote FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }
  // Preserves the full raw ERP line object dynamically (spec: /quotes/resolve-lines).
  await addColumn('quote_lines', 'metadata', 'JSON NULL');
  await addUniqueIndex('customers', 'uq_customers_tenant_erp_id', 'tenant_id, erp_id');
  // ERP identity is based on ERP IDs, not the human-readable/imported code.
  // Existing installations may still have the inline UNIQUE index named `code`.
  await dropIndex('customers', 'code');
  await dropIndex('branches', 'code');
  await dropIndex('spaces', 'code');
  await query('UPDATE branches b JOIN customers c ON c.id = b.customer_id SET b.customer_erp_id = c.erp_id WHERE b.customer_erp_id IS NULL');
  await query('UPDATE spaces s JOIN branches b ON b.id = s.branch_id SET s.branch_erp_id = b.erp_id WHERE s.branch_erp_id IS NULL');
  await dropIndex('branches', 'uq_branches_tenant_erp_id');
  await dropIndex('spaces', 'uq_spaces_tenant_erp_id');
  await addUniqueIndex('branches', 'uq_branches_tenant_customer_erp', 'tenant_id, customer_erp_id, erp_id');
  await addUniqueIndex('spaces', 'uq_spaces_tenant_branch_erp', 'tenant_id, branch_erp_id, erp_id');

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
      response_encoding VARCHAR(30) NOT NULL DEFAULT 'auto',
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
  await addColumn('connectors', 'response_encoding', "VARCHAR(30) NOT NULL DEFAULT 'auto'");
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
  if (!(await tableExists('customer_saved_views'))) {
    await query(`CREATE TABLE customer_saved_views (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL, user_id BIGINT NOT NULL,
      name VARCHAR(160) NOT NULL, config_json JSON NOT NULL,
      visibility ENUM('personal', 'shared') NOT NULL DEFAULT 'personal',
      is_default TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_saved_view_user_name (tenant_id, user_id, name),
      KEY idx_saved_view_user (tenant_id, user_id, updated_at),
      CONSTRAINT fk_saved_view_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      CONSTRAINT fk_saved_view_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[schema] created customer_saved_views');
  }
  await addColumn('customer_saved_views', 'visibility', "ENUM('personal', 'shared') NOT NULL DEFAULT 'personal'");

  if (!(await tableExists('idempotency_keys'))) {
    await query(`CREATE TABLE idempotency_keys (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL, user_id BIGINT NOT NULL,
      idempotency_key VARCHAR(100) NOT NULL,
      method VARCHAR(10) NOT NULL, path VARCHAR(255) NOT NULL,
      request_hash CHAR(64) NOT NULL, status_code INT NOT NULL,
      response_json JSON NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_idempotency_tenant_user_key (tenant_id, user_id, idempotency_key),
      KEY idx_idempotency_created (created_at),
      CONSTRAINT fk_idempotency_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      CONSTRAINT fk_idempotency_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[schema] created idempotency_keys');
  }

  if (!(await tableExists('notifications'))) {
    await query(`CREATE TABLE notifications (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL, user_id BIGINT NOT NULL,
      type VARCHAR(40) NOT NULL, title VARCHAR(200) NOT NULL, body VARCHAR(1000) NULL,
      source_type VARCHAR(40) NULL, source_id BIGINT NULL, customer_id BIGINT NULL,
      payload JSON NULL, read_at DATETIME NULL, dismissed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_notifications_dedupe (tenant_id, user_id, type, source_id),
      KEY idx_notifications_inbox (tenant_id, user_id, dismissed_at, read_at, created_at),
      CONSTRAINT fk_notifications_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_notifications_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[schema] created notifications');
  }
  await addColumn('notifications', 'dismissed_at', 'DATETIME NULL');
  await addUniqueIndex('notifications', 'uq_notifications_dedupe', 'tenant_id, user_id, type, source_id');
  await addIndex('notifications', 'idx_notifications_inbox', 'tenant_id, user_id, dismissed_at, read_at, created_at');

  if (!(await tableExists('audit_events'))) {
    await query(`CREATE TABLE audit_events (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      actor_user_id BIGINT NULL,
      actor_name VARCHAR(160) NULL,
      action VARCHAR(40) NOT NULL,
      entity_type VARCHAR(40) NOT NULL,
      entity_id BIGINT NULL,
      customer_id BIGINT NULL,
      summary TEXT NULL,
      details JSON NULL,
      ip VARCHAR(64) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_audit_tenant_created (tenant_id, created_at, id),
      KEY idx_audit_tenant_entity (tenant_id, entity_type, entity_id),
      CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_audit_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[schema] created audit_events');
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
