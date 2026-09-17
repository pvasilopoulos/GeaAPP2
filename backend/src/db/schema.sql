-- ============================================================================
-- SpaceHub schema — MariaDB / MySQL
--
-- Multi-tenant (tenants/users/roles) with an ownership hierarchy:
--     TENANT → CUSTOMER → BRANCH → SPACE
-- Each branch belongs to exactly one customer; each space belongs to exactly
-- one branch. History (bookings/visits/…) is customer-scoped.
--
-- Smart search uses a precomputed ASCII `search_norm` column (Greek→Latin
-- transliteration in the app layer) with InnoDB FULLTEXT — no DB extensions.
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS customer_custom_field_values;
DROP TABLE IF EXISTS branch_custom_field_values;
DROP TABLE IF EXISTS space_custom_field_values;
DROP TABLE IF EXISTS custom_field_definitions;
DROP TABLE IF EXISTS customer_saved_views;
DROP TABLE IF EXISTS follow_ups;
DROP TABLE IF EXISTS activities;
DROP TABLE IF EXISTS communications;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS visits;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS customer_contacts;
DROP TABLE IF EXISTS customer_tags;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS customer_spaces;
DROP TABLE IF EXISTS customer_branches;
DROP TABLE IF EXISTS spaces;
DROP TABLE IF EXISTS branches;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS platform_settings;
DROP TABLE IF EXISTS tenants;
DROP TABLE IF EXISTS sync_runs;
DROP TABLE IF EXISTS connectors;
DROP TABLE IF EXISTS quote_lines;
DROP TABLE IF EXISTS quotes;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- Multi-tenancy + authentication
-- ---------------------------------------------------------------------------
CREATE TABLE tenants (
  id             BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(160) NOT NULL,
  slug           VARCHAR(160) NOT NULL UNIQUE,
  status         VARCHAR(20) NOT NULL DEFAULT 'active',
  locale         VARCHAR(10) NOT NULL DEFAULT 'el',
  timezone       VARCHAR(60) NOT NULL DEFAULT 'Europe/Athens',
  currency       VARCHAR(8) NOT NULL DEFAULT 'EUR',
  plan           VARCHAR(40) NOT NULL DEFAULT 'standard',
  contact_email  VARCHAR(255) NULL,
  contact_phone  VARCHAR(40) NULL,
  notes          TEXT NULL,
  settings       JSON NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quotes (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  series VARCHAR(30) NOT NULL,
  quote_number INT NOT NULL,
  quote_date DATE NOT NULL,
  customer_id BIGINT NOT NULL,
  branch_id BIGINT NULL,
  email_template VARCHAR(100),
  payment_terms VARCHAR(160),
  valid_until DATE,
  seller_id BIGINT NULL,
  reference_start_year INT,
  reference_end_year INT,
  payment_due_date DATE,
  send_email TINYINT(1) NOT NULL DEFAULT 0,
  email_sent TINYINT(1) NOT NULL DEFAULT 0,
  email_sent_at DATETIME NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  status_error TEXT NULL,
  status_updated_at DATETIME NULL,
  status_updated_by BIGINT NULL,
  pdf_generated_at DATETIME NULL,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_quotes_series_number (tenant_id, series, quote_number),
  KEY idx_quotes_customer (tenant_id, customer_id, created_at),
  CONSTRAINT fk_quotes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quote_lines (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  quote_id BIGINT NOT NULL,
  line_order INT NOT NULL DEFAULT 0,
  description VARCHAR(500) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_percent DECIMAL(6,2) NOT NULL DEFAULT 0,
  tax_percent DECIMAL(6,2) NOT NULL DEFAULT 24,
  line_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_quote_lines_quote FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE platform_settings (
  skey       VARCHAR(80) NOT NULL PRIMARY KEY,
  svalue     TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE roles (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id   BIGINT NOT NULL,
  `key`       VARCHAR(60) NOT NULL,          -- owner | admin | manager | agent | viewer | custom-*
  name        VARCHAR(80) NOT NULL,
  permissions JSON NOT NULL,                 -- array of permission codes
  is_system   TINYINT(1) NOT NULL DEFAULT 1, -- 1 = cloned default, 0 = custom
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_roles_tenant_key (tenant_id, `key`),
  CONSTRAINT fk_roles_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT NOT NULL,
  role_id       BIGINT NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name    VARCHAR(120) NOT NULL,
  last_name     VARCHAR(120) NOT NULL,
  full_name     VARCHAR(255) GENERATED ALWAYS AS (CONCAT(first_name, ' ', last_name)) STORED,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  is_platform_admin TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_users_tenant (tenant_id),
  CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
CREATE TABLE employees (
  id         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id  BIGINT NOT NULL,
  first_name VARCHAR(120) NOT NULL,
  last_name  VARCHAR(120) NOT NULL,
  full_name  VARCHAR(255) GENERATED ALWAYS AS (CONCAT(first_name, ' ', last_name)) STORED,
  email      VARCHAR(255),
  role       VARCHAR(120),
  avatar_url VARCHAR(512),
  KEY idx_employees_tenant (tenant_id),
  CONSTRAINT fk_employees_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Customers (primary entity, tenant-scoped)
-- ---------------------------------------------------------------------------
CREATE TABLE customers (
  id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id        BIGINT NOT NULL,
  code             VARCHAR(40) NOT NULL,
  erp_id           VARCHAR(160) NULL,
  first_name       VARCHAR(120) NOT NULL,
  last_name        VARCHAR(120) NOT NULL,
  full_name        VARCHAR(255) GENERATED ALWAYS AS (CONCAT(first_name, ' ', last_name)) STORED,
  email            VARCHAR(255),
  phone            VARCHAR(40),
  mobile           VARCHAR(40),
  company          VARCHAR(200),
  tax_id           VARCHAR(40),
  customer_type    VARCHAR(20) NOT NULL DEFAULT 'individual',
  status           VARCHAR(20) NOT NULL DEFAULT 'active',
  is_vip           TINYINT(1) NOT NULL DEFAULT 0,
  date_of_birth    DATE,
  address_line     VARCHAR(255),
  city             VARCHAR(120),
  postal_code      VARCHAR(20),
  country          VARCHAR(80) DEFAULT 'Ελλάδα',
  avatar_url       VARCHAR(512),
  profile_note     TEXT,
  assigned_employee_id BIGINT,
  registered_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  branches_count   INT NOT NULL DEFAULT 0,
  spaces_count     INT NOT NULL DEFAULT 0,
  bookings_count   INT NOT NULL DEFAULT 0,
  visits_count     INT NOT NULL DEFAULT 0,
  total_value      DECIMAL(12,2) NOT NULL DEFAULT 0,
  last_visit_at    DATETIME NULL,
  next_booking_at  DATETIME NULL,
  next_action_at   DATETIME NULL,
  next_action_note VARCHAR(200) NULL,
  last_visit_sort  DATETIME NOT NULL DEFAULT '1000-01-01 00:00:00',
  search_norm      VARCHAR(768) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  KEY idx_customers_status (tenant_id, status),
  KEY idx_customers_type (tenant_id, customer_type),
  KEY idx_customers_vip (tenant_id, is_vip),
  KEY idx_customers_lastvisit_keyset (tenant_id, last_visit_sort, id),
  KEY idx_customers_value_keyset (tenant_id, total_value, id),
  KEY idx_customers_created_keyset (tenant_id, created_at, id),
  KEY idx_customers_name_keyset (tenant_id, full_name, id),
  KEY idx_customers_employee (assigned_employee_id),
  KEY idx_customers_email (tenant_id, email),
  KEY idx_customers_phone (tenant_id, phone),
  KEY idx_customers_tax (tenant_id, tax_id),
  UNIQUE KEY uq_customers_tenant_erp_id (tenant_id, erp_id),
  FULLTEXT KEY ft_customers_search (search_norm),
  CONSTRAINT fk_customers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_customers_employee FOREIGN KEY (assigned_employee_id) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Multiple contacts per customer (company stakeholders, extra people).
CREATE TABLE customer_saved_views (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  name VARCHAR(160) NOT NULL,
  config_json JSON NOT NULL,
  visibility ENUM('personal', 'shared') NOT NULL DEFAULT 'personal',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_saved_view_user_name (tenant_id, user_id, name),
  KEY idx_saved_view_visibility (tenant_id, visibility, updated_at),
  KEY idx_saved_view_user (tenant_id, user_id, updated_at),
  CONSTRAINT fk_saved_view_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_saved_view_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customer_contacts (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id   BIGINT NOT NULL,
  customer_id BIGINT NOT NULL,
  first_name  VARCHAR(120) NOT NULL,
  last_name   VARCHAR(120) NOT NULL,
  role        VARCHAR(120),
  email       VARCHAR(255),
  phone       VARCHAR(40),
  mobile      VARCHAR(40),
  is_primary  TINYINT(1) NOT NULL DEFAULT 0,
  notes       VARCHAR(400),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_contacts_customer (customer_id, is_primary),
  KEY idx_contacts_tenant (tenant_id),
  CONSTRAINT fk_contacts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_contacts_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Branches — owned by a customer
-- ---------------------------------------------------------------------------
CREATE TABLE branches (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT NOT NULL,
  customer_id   BIGINT NOT NULL,
  code          VARCHAR(40) NOT NULL,
  erp_id        VARCHAR(160) NULL,
  customer_erp_id VARCHAR(160) NULL,
  name          VARCHAR(200) NOT NULL,
  address_line  VARCHAR(255),
  city          VARCHAR(120),
  area          VARCHAR(120),
  postal_code   VARCHAR(20),
  phone         VARCHAR(40),
  email         VARCHAR(255),
  image_url     VARCHAR(512),
  lat           DOUBLE,
  lng           DOUBLE,
  is_primary    TINYINT(1) NOT NULL DEFAULT 0,
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  manager_employee_id BIGINT NULL,
  opening_hours JSON NULL,
  spaces_count  INT NOT NULL DEFAULT 0,
  visits_count  INT NOT NULL DEFAULT 0,
  total_value   DECIMAL(12,2) NOT NULL DEFAULT 0,
  last_visit_at DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  search_norm   VARCHAR(768) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  KEY idx_branches_customer (customer_id),
  KEY idx_branches_tenant_city (tenant_id, city),
  KEY idx_branches_status (tenant_id, status),
  FULLTEXT KEY ft_branches_search (search_norm),
  UNIQUE KEY uq_branches_tenant_customer_erp (tenant_id, customer_erp_id, erp_id),
  CONSTRAINT fk_branches_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_branches_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_branches_manager FOREIGN KEY (manager_employee_id) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Spaces — owned by a branch (customer_id denormalized for scoping/queries)
-- ---------------------------------------------------------------------------
CREATE TABLE spaces (
  id             BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id      BIGINT NOT NULL,
  customer_id    BIGINT NOT NULL,
  branch_id      BIGINT NOT NULL,
  code           VARCHAR(40) NOT NULL,
  erp_id         VARCHAR(160) NULL,
  branch_erp_id  VARCHAR(160) NULL,
  name           VARCHAR(200) NOT NULL,
  space_type     VARCHAR(120),
  capacity       INT,
  floor          VARCHAR(40),
  hourly_price   DECIMAL(10,2),
  daily_price    DECIMAL(10,2),
  weekend_hourly_price DECIMAL(10,2),
  image_url      VARCHAR(512),
  description    TEXT,
  status         VARCHAR(20) NOT NULL DEFAULT 'available',
  amenities      JSON NULL,
  min_duration_minutes INT NOT NULL DEFAULT 60,
  slot_step_minutes    INT NOT NULL DEFAULT 30,
  buffer_minutes       INT NOT NULL DEFAULT 0,
  visits_count   INT NOT NULL DEFAULT 0,
  bookings_count INT NOT NULL DEFAULT 0,
  last_visit_at  DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  search_norm    VARCHAR(768) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  KEY idx_spaces_branch (branch_id),
  KEY idx_spaces_customer (customer_id),
  KEY idx_spaces_tenant_type (tenant_id, space_type),
  KEY idx_spaces_status (tenant_id, status),
  FULLTEXT KEY ft_spaces_search (search_norm),
  UNIQUE KEY uq_spaces_tenant_branch_erp (tenant_id, branch_erp_id, erp_id),
  CONSTRAINT fk_spaces_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_spaces_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_spaces_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE connectors (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(160) NOT NULL,
  base_url VARCHAR(500) NOT NULL,
  target_entity VARCHAR(20) NOT NULL DEFAULT 'customers',
  response_encoding VARCHAR(30) NOT NULL DEFAULT 'auto',
  method VARCHAR(10) NOT NULL DEFAULT 'GET',
  auth_type     VARCHAR(20) NOT NULL DEFAULT 'bearer',
  credentials_enc TEXT NULL,
  body_template TEXT NULL,
  headers       JSON NULL,
  mappings JSON NOT NULL,
  schedule_minutes INT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  timeout_ms INT NOT NULL DEFAULT 30000,
  retry_count INT NOT NULL DEFAULT 3,
  last_run_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_connector_tenant_name (tenant_id, name),
  KEY idx_connector_schedule (enabled, schedule_minutes, last_run_at),
  CONSTRAINT fk_connectors_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sync_runs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  connector_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  started_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  records_seen INT NOT NULL DEFAULT 0,
  records_upserted INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  KEY idx_sync_runs_connector (connector_id, started_at),
  CONSTRAINT fk_sync_runs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_sync_runs_connector FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Tags (shared vocabulary)
-- ---------------------------------------------------------------------------
CREATE TABLE tags (
  id    BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(80) NOT NULL,
  slug  VARCHAR(80) NOT NULL UNIQUE,
  color VARCHAR(30) NOT NULL DEFAULT 'blue'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customer_tags (
  customer_id BIGINT NOT NULL,
  tag_id      BIGINT NOT NULL,
  PRIMARY KEY (customer_id, tag_id),
  KEY idx_ct_tag (tag_id),
  CONSTRAINT fk_ct_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_ct_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- History tables (customer-scoped)
-- ---------------------------------------------------------------------------
CREATE TABLE bookings (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id   BIGINT NOT NULL,
  customer_id BIGINT NOT NULL,
  branch_id   BIGINT NULL,
  space_id    BIGINT NULL,
  employee_id BIGINT NULL,
  starts_at   DATETIME NOT NULL,
  ends_at     DATETIME NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  amount      DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_bookings_customer_time (customer_id, starts_at),
  KEY idx_bookings_tenant_starts (tenant_id, starts_at),
  KEY idx_bookings_space (space_id),
  CONSTRAINT fk_bookings_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE visits (
  id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id      BIGINT NOT NULL,
  branch_id        BIGINT NULL,
  space_id         BIGINT NULL,
  visited_at       DATETIME NOT NULL,
  duration_minutes INT,
  visit_type       VARCHAR(20) NOT NULL DEFAULT 'visit',
  status           VARCHAR(20) NOT NULL DEFAULT 'completed',
  KEY idx_visits_customer_time (customer_id, visited_at),
  KEY idx_visits_space (space_id),
  CONSTRAINT fk_visits_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  booking_id  BIGINT NULL,
  amount      DECIMAL(10,2) NOT NULL,
  method      VARCHAR(20),
  status      VARCHAR(20) NOT NULL DEFAULT 'paid',
  paid_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_payments_customer_time (customer_id, paid_at),
  CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE communications (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  channel     VARCHAR(20) NOT NULL,
  direction   VARCHAR(20) NOT NULL DEFAULT 'outbound',
  subject     VARCHAR(255),
  body        TEXT,
  recipient   VARCHAR(255),
  delivery_status VARCHAR(20) NOT NULL DEFAULT 'logged',
  employee_id BIGINT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_comm_customer_time (customer_id, created_at),
  CONSTRAINT fk_comm_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE documents (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  name        VARCHAR(255) NOT NULL,
  mime_type   VARCHAR(120),
  size_bytes  BIGINT,
  url         VARCHAR(512),
  category    VARCHAR(60) NOT NULL DEFAULT 'general',
  description VARCHAR(500),
  uploaded_by BIGINT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_docs_customer_time (customer_id, created_at),
  CONSTRAINT fk_docs_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notes (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  body        TEXT NOT NULL,
  title       VARCHAR(200),
  body_html   MEDIUMTEXT,
  category    VARCHAR(60) NOT NULL DEFAULT 'general',
  is_pinned   TINYINT(1) NOT NULL DEFAULT 0,
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  employee_id BIGINT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notes_customer_time (customer_id, created_at),
  CONSTRAINT fk_notes_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE activities (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id   BIGINT NOT NULL,
  customer_id BIGINT NOT NULL,
  type        VARCHAR(40) NOT NULL,
  description VARCHAR(400),
  details     JSON NULL,
  branch_id   BIGINT NULL,
  space_id    BIGINT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_act_customer_time (customer_id, created_at),
  KEY idx_act_tenant_created (tenant_id, created_at),
  CONSTRAINT fk_act_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE follow_ups (
  id                   BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  customer_id          BIGINT NOT NULL,
  title                VARCHAR(200) NOT NULL,
  description          VARCHAR(1000) NULL,
  due_at               DATETIME NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'open',
  assigned_employee_id BIGINT NULL,
  created_by           BIGINT NULL,
  completed_at         DATETIME NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_followups_tenant_due (tenant_id, status, due_at),
  KEY idx_followups_customer_due (customer_id, status, due_at),
  CONSTRAINT fk_followups_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_followups_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_followups_employee FOREIGN KEY (assigned_employee_id) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Dynamic custom fields (typed-value architecture)
-- ---------------------------------------------------------------------------
CREATE TABLE custom_field_definitions (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT NOT NULL,
  entity_type   VARCHAR(20) NOT NULL,
  name          VARCHAR(120) NOT NULL,
  `key`         VARCHAR(120) NOT NULL,
  field_type    VARCHAR(40) NOT NULL,
  required      TINYINT(1) NOT NULL DEFAULT 0,
  searchable    TINYINT(1) NOT NULL DEFAULT 0,
  filterable    TINYINT(1) NOT NULL DEFAULT 0,
  visible_in_list TINYINT(1) NOT NULL DEFAULT 0,
  settings      JSON,
  section       VARCHAR(120),
  sort_order    INT NOT NULL DEFAULT 0,
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cfd (tenant_id, entity_type, `key`),
  KEY idx_cfd_entity (tenant_id, entity_type, active, sort_order),
  CONSTRAINT fk_cfd_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customer_custom_field_values (
  id                  BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id         BIGINT NOT NULL,
  field_definition_id BIGINT NOT NULL,
  text_value          VARCHAR(500),
  number_value        DECIMAL(20,4),
  date_value          DATE,
  boolean_value       TINYINT(1),
  json_value          JSON,
  UNIQUE KEY uq_ccfv (customer_id, field_definition_id),
  KEY idx_ccfv_field_text (field_definition_id, text_value),
  KEY idx_ccfv_field_num (field_definition_id, number_value),
  CONSTRAINT fk_ccfv_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_ccfv_def FOREIGN KEY (field_definition_id) REFERENCES custom_field_definitions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE branch_custom_field_values (
  id                  BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  branch_id           BIGINT NOT NULL,
  field_definition_id BIGINT NOT NULL,
  text_value          VARCHAR(500),
  number_value        DECIMAL(20,4),
  date_value          DATE,
  boolean_value       TINYINT(1),
  json_value          JSON,
  UNIQUE KEY uq_bcfv (branch_id, field_definition_id),
  CONSTRAINT fk_bcfv_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_bcfv_def FOREIGN KEY (field_definition_id) REFERENCES custom_field_definitions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE space_custom_field_values (
  id                  BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  space_id            BIGINT NOT NULL,
  field_definition_id BIGINT NOT NULL,
  text_value          VARCHAR(500),
  number_value        DECIMAL(20,4),
  date_value          DATE,
  boolean_value       TINYINT(1),
  json_value          JSON,
  UNIQUE KEY uq_scfv (space_id, field_definition_id),
  CONSTRAINT fk_scfv_space FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_scfv_def FOREIGN KEY (field_definition_id) REFERENCES custom_field_definitions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
