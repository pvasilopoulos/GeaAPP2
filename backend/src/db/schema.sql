-- ============================================================================
-- SpaceHub schema — MariaDB / MySQL
-- Customers · Branches · Spaces · Custom Fields, for 350k+ customers.
--
-- Smart search: a precomputed ASCII `search_norm` column (lowercased +
-- transliterated Greek→Latin in the application layer) enables fast,
-- accent/case/script-insensitive substring search with plain LIKE, without
-- relying on DB extensions. B-tree indexes cover exact match, sort and keyset
-- pagination.
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS customer_custom_field_values;
DROP TABLE IF EXISTS branch_custom_field_values;
DROP TABLE IF EXISTS space_custom_field_values;
DROP TABLE IF EXISTS custom_field_definitions;
DROP TABLE IF EXISTS activities;
DROP TABLE IF EXISTS communications;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS visits;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS customer_tags;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS customer_spaces;
DROP TABLE IF EXISTS customer_branches;
DROP TABLE IF EXISTS spaces;
DROP TABLE IF EXISTS branches;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS employees;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
CREATE TABLE employees (
  id         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(120) NOT NULL,
  last_name  VARCHAR(120) NOT NULL,
  full_name  VARCHAR(255) GENERATED ALWAYS AS (CONCAT(first_name, ' ', last_name)) STORED,
  email      VARCHAR(255),
  role       VARCHAR(120),
  avatar_url VARCHAR(512)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
CREATE TABLE branches (
  id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code         VARCHAR(40) NOT NULL UNIQUE,
  name         VARCHAR(200) NOT NULL,
  address_line VARCHAR(255),
  city         VARCHAR(120),
  area         VARCHAR(120),
  postal_code  VARCHAR(20),
  phone        VARCHAR(40),
  email        VARCHAR(255),
  image_url    VARCHAR(512),
  lat          DOUBLE,
  lng          DOUBLE,
  spaces_count INT NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  search_norm  VARCHAR(768) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  KEY idx_branches_city (city),
  FULLTEXT KEY ft_branches_search (search_norm)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
CREATE TABLE spaces (
  id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  branch_id    BIGINT NOT NULL,
  code         VARCHAR(40) NOT NULL UNIQUE,
  name         VARCHAR(200) NOT NULL,
  space_type   VARCHAR(120),
  capacity     INT,
  floor        VARCHAR(40),
  hourly_price DECIMAL(10,2),
  image_url    VARCHAR(512),
  description  TEXT,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  search_norm  VARCHAR(768) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  KEY idx_spaces_branch (branch_id),
  KEY idx_spaces_type (space_type),
  FULLTEXT KEY ft_spaces_search (search_norm),
  CONSTRAINT fk_spaces_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
CREATE TABLE customers (
  id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code             VARCHAR(40) NOT NULL UNIQUE,
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
  -- Sort helper for keyset pagination (NULL last-visits collate last).
  last_visit_sort  DATETIME NOT NULL DEFAULT '1000-01-01 00:00:00',
  search_norm      VARCHAR(768) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  KEY idx_customers_status (status),
  KEY idx_customers_type (customer_type),
  KEY idx_customers_vip (is_vip),
  KEY idx_customers_email (email),
  KEY idx_customers_phone (phone),
  KEY idx_customers_mobile (mobile),
  KEY idx_customers_tax (tax_id),
  KEY idx_customers_city (city),
  KEY idx_customers_lastvisit_keyset (last_visit_sort, id),
  KEY idx_customers_value_keyset (total_value, id),
  KEY idx_customers_created_keyset (created_at, id),
  KEY idx_customers_name_keyset (full_name, id),
  KEY idx_customers_employee (assigned_employee_id),
  FULLTEXT KEY ft_customers_search (search_norm),
  CONSTRAINT fk_customers_employee FOREIGN KEY (assigned_employee_id) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
CREATE TABLE customer_branches (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id   BIGINT NOT NULL,
  branch_id     BIGINT NOT NULL,
  is_primary    TINYINT(1) NOT NULL DEFAULT 0,
  visits_count  INT NOT NULL DEFAULT 0,
  spaces_count  INT NOT NULL DEFAULT 0,
  total_value   DECIMAL(12,2) NOT NULL DEFAULT 0,
  first_visit_at DATETIME NULL,
  last_visit_at DATETIME NULL,
  UNIQUE KEY uq_cb (customer_id, branch_id),
  KEY idx_cb_branch (branch_id),
  CONSTRAINT fk_cb_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_cb_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customer_spaces (
  id             BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id    BIGINT NOT NULL,
  space_id       BIGINT NOT NULL,
  branch_id      BIGINT NOT NULL,
  visits_count   INT NOT NULL DEFAULT 0,
  bookings_count INT NOT NULL DEFAULT 0,
  last_visit_at  DATETIME NULL,
  UNIQUE KEY uq_cs (customer_id, space_id),
  KEY idx_cs_space (space_id),
  KEY idx_cs_branch (branch_id),
  CONSTRAINT fk_cs_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_cs_space FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_cs_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
CREATE TABLE bookings (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
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
  KEY idx_bookings_starts (starts_at),
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
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_docs_customer_time (customer_id, created_at),
  CONSTRAINT fk_docs_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notes (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  body        TEXT NOT NULL,
  employee_id BIGINT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notes_customer_time (customer_id, created_at),
  CONSTRAINT fk_notes_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE activities (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  type        VARCHAR(40) NOT NULL,
  description VARCHAR(400),
  branch_id   BIGINT NULL,
  space_id    BIGINT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_act_customer_time (customer_id, created_at),
  KEY idx_act_created (created_at),
  CONSTRAINT fk_act_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Dynamic custom fields (typed-value architecture)
-- ---------------------------------------------------------------------------
CREATE TABLE custom_field_definitions (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
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
  UNIQUE KEY uq_cfd (entity_type, `key`),
  KEY idx_cfd_entity (entity_type, active, sort_order)
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
