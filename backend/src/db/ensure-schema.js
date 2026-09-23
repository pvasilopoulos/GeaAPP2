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

async function ensureColumnNullable(table, column, ddl) {
  const { rows } = await query(
    `SELECT IS_NULLABLE AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]);
  if (!rows.length || rows[0].n === 'YES') return;
  await query(`ALTER TABLE ${table} MODIFY COLUMN ${column} ${ddl}`);
  console.log(`[schema] made ${table}.${column} nullable`);
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
  await addColumn('employees', 'erp_id', 'VARCHAR(160) NULL');
  await addIndex('employees', 'idx_employees_tenant_erp', 'tenant_id, erp_id');
  // Personal nav-menu override (sidebar/mobile-footer order & visibility).
  // NULL means the user has no personal preference and falls back to the
  // tenant-wide default menu configuration.
  await addColumn('users', 'menu_preferences', 'JSON NULL');
  await addColumn('communications', 'recipient', 'VARCHAR(255) NULL');
  await addColumn('communications', 'delivery_status', "VARCHAR(20) NOT NULL DEFAULT 'logged'");
  // Structured attachments/button sent alongside the message body, kept
  // separately from `body` (which stays plain, human-readable text) so the
  // composer can re-offer them and richer history views can render them.
  await addColumn('communications', 'meta', 'JSON NULL');
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
  await addColumn('quotes', 'erp_id', 'VARCHAR(100) NULL');
  await addColumn('quotes', 'erp_pushed_at', 'DATETIME NULL');
  await addColumn('quotes', 'erp_push_status', 'VARCHAR(20) NULL');
  await addColumn('quotes', 'erp_push_error', 'TEXT NULL');
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
  // Two-way sync (outbound push back to the ERP) — reuses the connector's
  // existing base_url/auth/headers unless push_url overrides them.
  // push_body_template uses {{field}} placeholders (see lib/pushSync.js);
  // push_response_id_path is the JSON path to read the ERP-assigned id from
  // the response body when creating a brand-new record.
  await addColumn('connectors', 'push_enabled', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn('connectors', 'push_url', 'VARCHAR(500) NULL');
  await addColumn('connectors', 'push_method', "VARCHAR(10) NOT NULL DEFAULT 'POST'");
  await addColumn('connectors', 'push_body_template', 'TEXT NULL');
  await addColumn('connectors', 'push_response_id_path', "VARCHAR(120) NOT NULL DEFAULT 'id'");
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

  // Outbound queue for two-way sync: one row per local create/update that
  // needs to be pushed to a push_enabled connector. Processed by the
  // scheduler (see lib/pushSync.js) with retry/backoff like sync_runs.
  if (!(await tableExists('sync_outbox'))) {
    await query(`CREATE TABLE sync_outbox (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL,
      connector_id BIGINT NOT NULL, entity_type VARCHAR(20) NOT NULL, entity_id BIGINT NOT NULL,
      action VARCHAR(10) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0, last_error TEXT NULL,
      next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME NULL,
      KEY idx_sync_outbox_pending (status, next_attempt_at),
      KEY idx_sync_outbox_connector (connector_id, created_at),
      CONSTRAINT fk_sync_outbox_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      CONSTRAINT fk_sync_outbox_connector FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[schema] created sync_outbox');
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

  // Web Push (VAPID) subscriptions — one row per browser/device a user has
  // granted notification permission on. `endpoint_hash` (sha256 of the full
  // push endpoint URL) gives us a fixed-width unique key since raw endpoints
  // can exceed MySQL's utf8mb4 index byte limit.
  if (!(await tableExists('push_subscriptions'))) {
    await query(`CREATE TABLE push_subscriptions (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL, user_id BIGINT NOT NULL,
      endpoint VARCHAR(1000) NOT NULL, endpoint_hash CHAR(64) NOT NULL,
      p256dh VARCHAR(255) NOT NULL, auth VARCHAR(255) NOT NULL,
      user_agent VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_push_subscriptions_endpoint (endpoint_hash),
      KEY idx_push_subscriptions_user (tenant_id, user_id),
      CONSTRAINT fk_push_subscriptions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      CONSTRAINT fk_push_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[schema] created push_subscriptions');
  }

  // Log of manual admin "send notification" broadcasts (all users or a
  // chosen subset) — provides a history view and a unique source_id per
  // send so the notifications dedupe key never collides across sends.
  if (!(await tableExists('push_broadcasts'))) {
    await query(`CREATE TABLE push_broadcasts (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL, sender_user_id BIGINT NOT NULL,
      title VARCHAR(200) NOT NULL, body VARCHAR(1000) NULL, url VARCHAR(500) NULL,
      recipient_type VARCHAR(20) NOT NULL, recipient_count INT NOT NULL DEFAULT 0,
      push_sent_count INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_push_broadcasts_tenant (tenant_id, created_at),
      CONSTRAINT fk_push_broadcasts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      CONSTRAINT fk_push_broadcasts_sender FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[schema] created push_broadcasts');
  }
  // Rich push notification composer fields: media, action buttons, behavior
  // (require-interaction/silent/vibrate/tag/renotify), delivery priority
  // (urgency/TTL), targeting beyond all-users (role or explicit id list —
  // recipient_ids re-resolved at send time so scheduled sends stay fresh),
  // scheduling (send_at/status) and click-through analytics (clicked_count).
  await addColumn('push_broadcasts', 'image_url', 'VARCHAR(500) NULL');
  await addColumn('push_broadcasts', 'icon_url', 'VARCHAR(500) NULL');
  await addColumn('push_broadcasts', 'badge_url', 'VARCHAR(500) NULL');
  await addColumn('push_broadcasts', 'actions', 'JSON NULL');
  await addColumn('push_broadcasts', 'require_interaction', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn('push_broadcasts', 'silent', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn('push_broadcasts', 'vibrate', 'VARCHAR(100) NULL');
  await addColumn('push_broadcasts', 'tag', 'VARCHAR(100) NULL');
  await addColumn('push_broadcasts', 'renotify', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn('push_broadcasts', 'urgency', "VARCHAR(20) NOT NULL DEFAULT 'normal'");
  await addColumn('push_broadcasts', 'ttl_seconds', 'INT NOT NULL DEFAULT 259200');
  await addColumn('push_broadcasts', 'recipient_role_id', 'BIGINT NULL');
  await addColumn('push_broadcasts', 'recipient_ids', 'JSON NULL');
  await addColumn('push_broadcasts', 'send_at', 'DATETIME NULL');
  await addColumn('push_broadcasts', 'status', "VARCHAR(20) NOT NULL DEFAULT 'sent'");
  await addColumn('push_broadcasts', 'clicked_count', 'INT NOT NULL DEFAULT 0');
  await addIndex('push_broadcasts', 'idx_push_broadcasts_pending', 'status, send_at');

  // Reusable notification presets (title/body/media/actions/behavior) that
  // the composer can save and reload — every field mirrors push_broadcasts'
  // rich columns above so a template can be applied as-is.
  if (!(await tableExists('push_templates'))) {
    await query(`CREATE TABLE push_templates (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL, created_by BIGINT NULL,
      name VARCHAR(120) NOT NULL,
      title VARCHAR(200) NOT NULL, body VARCHAR(1000) NULL, url VARCHAR(500) NULL,
      image_url VARCHAR(500) NULL, icon_url VARCHAR(500) NULL, badge_url VARCHAR(500) NULL,
      actions JSON NULL,
      require_interaction TINYINT(1) NOT NULL DEFAULT 0, silent TINYINT(1) NOT NULL DEFAULT 0,
      vibrate VARCHAR(100) NULL, tag VARCHAR(100) NULL, renotify TINYINT(1) NOT NULL DEFAULT 0,
      urgency VARCHAR(20) NOT NULL DEFAULT 'normal', ttl_seconds INT NOT NULL DEFAULT 259200,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_push_templates_name (tenant_id, name),
      CONSTRAINT fk_push_templates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      CONSTRAINT fk_push_templates_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[schema] created push_templates');
  }

  // Contact fields used to deliver rule-driven notifications to a user via
  // SMS/Viber/Telegram (in addition to email, which already exists on
  // `users.email`). Optional — channels without a value simply skip that
  // user rather than failing the whole rule.
  await addColumn('users', 'phone', 'VARCHAR(40) NULL');
  await addColumn('users', 'telegram_chat_id', 'VARCHAR(64) NULL');

  // Admin-defined automatic notification rules: "when <event> happens and
  // <conditions> match, notify <recipients> via <channels> with <template>".
  // This is the advanced companion to push_broadcasts (which is a one-off
  // manual send) — rules fire continuously whenever their event occurs.
  if (!(await tableExists('notification_rules'))) {
    await query(`CREATE TABLE notification_rules (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL, created_by BIGINT NULL,
      name VARCHAR(150) NOT NULL, event_key VARCHAR(60) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      conditions JSON NULL,
      recipient_type VARCHAR(20) NOT NULL DEFAULT 'all',
      recipient_role_id BIGINT NULL, recipient_ids JSON NULL, recipient_dynamic VARCHAR(40) NULL,
      channels JSON NOT NULL,
      title_template VARCHAR(300) NOT NULL, body_template VARCHAR(1500) NULL, url_template VARCHAR(500) NULL,
      image_url VARCHAR(500) NULL, icon_url VARCHAR(500) NULL, badge_url VARCHAR(500) NULL,
      actions JSON NULL,
      require_interaction TINYINT(1) NOT NULL DEFAULT 0, silent TINYINT(1) NOT NULL DEFAULT 0,
      vibrate VARCHAR(100) NULL, tag VARCHAR(100) NULL, renotify TINYINT(1) NOT NULL DEFAULT 0,
      urgency VARCHAR(20) NOT NULL DEFAULT 'normal', ttl_seconds INT NOT NULL DEFAULT 259200,
      throttle_seconds INT NOT NULL DEFAULT 0,
      last_fired_at DATETIME NULL, fired_count INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_notification_rules_event (tenant_id, event_key, enabled),
      CONSTRAINT fk_notification_rules_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      CONSTRAINT fk_notification_rules_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[schema] created notification_rules');
  }

  // Per-user opt-in/opt-out on top of a rule's allowed channels — missing
  // row means "enabled" (rules are opt-out, not opt-in, so a newly created
  // rule reaches everyone it targets until a user turns it off).
  if (!(await tableExists('notification_preferences'))) {
    await query(`CREATE TABLE notification_preferences (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL, user_id BIGINT NOT NULL,
      event_key VARCHAR(60) NOT NULL, channel VARCHAR(20) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_notification_preferences (tenant_id, user_id, event_key, channel),
      CONSTRAINT fk_notification_preferences_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      CONSTRAINT fk_notification_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[schema] created notification_preferences');
  }

  // Per-(rule, recipient) throttle bookkeeping so a rule with
  // `throttle_seconds` set doesn't spam the same user repeatedly for a
  // rapidly repeating event (e.g. many quote status changes in a row).
  if (!(await tableExists('notification_rule_throttle'))) {
    await query(`CREATE TABLE notification_rule_throttle (
      rule_id BIGINT NOT NULL, user_id BIGINT NOT NULL,
      last_fired_at DATETIME NOT NULL,
      PRIMARY KEY (rule_id, user_id),
      CONSTRAINT fk_notification_rule_throttle_rule FOREIGN KEY (rule_id) REFERENCES notification_rules(id) ON DELETE CASCADE,
      CONSTRAINT fk_notification_rule_throttle_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[schema] created notification_rule_throttle');
  }

  // --- Notification rules engine v2: schedule-based triggers, condition
  // groups (AND/OR), extra actions, escalation, digest mode, quiet hours,
  // priority, dry-run, and an execution log for observability. All
  // additive/backwards compatible — existing event-based rules keep
  // working unchanged (trigger_type defaults to 'event').
  await ensureColumnNullable('notification_rules', 'event_key', 'VARCHAR(60) NULL');
  await addColumn('notification_rules', 'trigger_type', "VARCHAR(20) NOT NULL DEFAULT 'event'");
  await addColumn('notification_rules', 'schedule_entity', 'VARCHAR(30) NULL');
  await addColumn('notification_rules', 'schedule_date_field', 'VARCHAR(60) NULL');
  await addColumn('notification_rules', 'schedule_offset_minutes', 'INT NULL');
  await addColumn('notification_rules', 'schedule_recurrence', "VARCHAR(20) NOT NULL DEFAULT 'once'");
  await addColumn('notification_rules', 'condition_logic', "VARCHAR(10) NOT NULL DEFAULT 'and'");
  await addColumn('notification_rules', 'extra_actions', 'JSON NULL');
  await addColumn('notification_rules', 'escalation', 'JSON NULL');
  await addColumn('notification_rules', 'digest_mode', "VARCHAR(20) NOT NULL DEFAULT 'none'");
  await addColumn('notification_rules', 'respect_quiet_hours', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn('notification_rules', 'priority', "VARCHAR(20) NOT NULL DEFAULT 'normal'");
  await addColumn('notification_rules', 'dry_run', 'TINYINT(1) NOT NULL DEFAULT 0');

  // Per-channel overrides: JSON object keyed by channel id, each value
  // optionally carrying { recipientType: 'inherit'|'customer'|'custom',
  // customValue, titleTemplate, bodyTemplate } — lets e.g. SMS/Viber go
  // straight to the record's own customer (phone from the customers table)
  // with its own wording, while the app/email channels still notify the
  // rule's regular (internal) recipients with the rule's default template.
  // Missing/absent per-channel keys fall back to the rule-level recipient
  // and title/body templates — fully backwards compatible.
  await addColumn('notification_rules', 'channel_overrides', 'JSON NULL');

  // Optional per-user quiet-hours window (server local time) — respected
  // only by rules with respect_quiet_hours = 1, and skipped entirely for
  // priority = 'urgent' rules.
  await addColumn('users', 'quiet_hours_start', 'TIME NULL');
  await addColumn('users', 'quiet_hours_end', 'TIME NULL');

  // Execution log: one row per (rule, recipient, channel) attempt, so the
  // admin UI can show exactly what happened and why (sent/failed/throttled/
  // opted_out/quiet_hours/dry_run).
  if (!(await tableExists('notification_rule_runs'))) {
    await query(`CREATE TABLE notification_rule_runs (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL, rule_id BIGINT NOT NULL,
      recipient_user_id BIGINT NULL, channel VARCHAR(20) NULL,
      status VARCHAR(20) NOT NULL, reason VARCHAR(200) NULL,
      entity_id VARCHAR(60) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_notification_rule_runs_rule (rule_id, created_at),
      KEY idx_notification_rule_runs_tenant (tenant_id, created_at),
      CONSTRAINT fk_notification_rule_runs_rule FOREIGN KEY (rule_id) REFERENCES notification_rules(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[schema] created notification_rule_runs');
  }
  // Which literal address/number a run actually went to (e.g. the
  // customer's own phone/email when a channel override targets them, or a
  // custom static/templated value) — recipient_user_id stays NULL for
  // those, so this is the only way to see *who* got the message.
  await addColumn('notification_rule_runs', 'recipient_label', 'VARCHAR(180) NULL');


  // Digest mode buffer: rule matches accumulate here instead of sending
  // immediately, and a periodic sweep flushes one aggregated message per
  // (rule, user, channel) group.
  if (!(await tableExists('notification_digest_queue'))) {
    await query(`CREATE TABLE notification_digest_queue (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL, rule_id BIGINT NOT NULL, user_id BIGINT NOT NULL,
      channel VARCHAR(20) NOT NULL,
      title VARCHAR(300) NOT NULL, body VARCHAR(1500) NULL, url VARCHAR(500) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME NULL,
      KEY idx_notification_digest_queue_pending (rule_id, user_id, sent_at),
      CONSTRAINT fk_notification_digest_queue_rule FOREIGN KEY (rule_id) REFERENCES notification_rules(id) ON DELETE CASCADE,
      CONSTRAINT fk_notification_digest_queue_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[schema] created notification_digest_queue');
  }

  // Escalation bookkeeping: when a rule has an `escalation` config, firing
  // it inserts a pending row here; a sweep later checks whether enough time
  // has passed and, if so, notifies the escalation recipients/channels.
  if (!(await tableExists('notification_rule_escalations'))) {
    await query(`CREATE TABLE notification_rule_escalations (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL, rule_id BIGINT NOT NULL,
      entity_id VARCHAR(60) NULL, recipient_user_id BIGINT NOT NULL,
      fired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      escalated_at DATETIME NULL,
      title VARCHAR(300) NULL, body VARCHAR(1500) NULL, url VARCHAR(500) NULL,
      KEY idx_notification_rule_escalations_pending (rule_id, escalated_at),
      CONSTRAINT fk_notification_rule_escalations_rule FOREIGN KEY (rule_id) REFERENCES notification_rules(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[schema] created notification_rule_escalations');
  }

  // Dedupe bookkeeping for schedule-based triggers (e.g. "3 days before a
  // quote expires") — `fired_key` is 'once' for schedule_recurrence='once'
  // (fires exactly once per entity, ever) or a YYYY-MM-DD day stamp for
  // 'recurring' (fires at most once per calendar day per entity).
  if (!(await tableExists('notification_schedule_fired'))) {
    await query(`CREATE TABLE notification_schedule_fired (
      rule_id BIGINT NOT NULL, entity_id VARCHAR(60) NOT NULL, fired_key VARCHAR(40) NOT NULL,
      fired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (rule_id, entity_id, fired_key),
      CONSTRAINT fk_notification_schedule_fired_rule FOREIGN KEY (rule_id) REFERENCES notification_rules(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('[schema] created notification_schedule_fired');
  }

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
