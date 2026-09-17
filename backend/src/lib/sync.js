import { query, withConnection } from '../db.js';
import { decryptCredentials } from './connectorCrypto.js';
import { getPath, mapRecord, validateMappings } from './mapping.js';
import { retryDelay } from './schedulerPolicy.js';
import { parseEncodedJson } from './responseEncoding.js';
import { normalizeFields } from './normalize.js';
import { valueColumns } from './customFields.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function recordsAt(payload, source) {
  const value = getPath(payload, source);
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return [value];
  if (Array.isArray(payload)) return payload;
  return [];
}

function applyCredentials(headers, credentials, authType) {
  if (!credentials) return;
  if (authType === 'api-key' && credentials.key && credentials.value) {
    headers[credentials.key] = credentials.value;
  } else if (authType === 'basic' && credentials.username) {
    headers.Authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.password || ''}`).toString('base64')}`;
  } else if (credentials.token) {
    headers.Authorization = `Bearer ${credentials.token}`;
  }
}

async function request(connector) {
  const headers = parseJson(connector.headers);
  applyCredentials(headers, decryptCredentials(connector.credentials_enc), connector.auth_type);
  const options = { method: connector.method || 'GET', headers };
  const body = connector.body_template;
  if (body && !['GET', 'HEAD'].includes(options.method.toUpperCase())) {
    options.body = body;
    if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(connector.timeout_ms) || 30000);
  try {
    const response = await fetch(connector.base_url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`ERP returned ${response.status}`);
    const buffer = await response.arrayBuffer();
    return parseEncodedJson(Buffer.from(buffer), {
      encoding: connector.response_encoding || 'auto',
      contentType: response.headers.get('content-type') || '',
    }).value;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(connector) {
  let error;
  const retries = Math.min(5, Math.max(0, Number(connector.retry_count ?? 3)));
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await request(connector);
    } catch (err) {
      error = err;
      if (attempt < retries) await sleep(retryDelay(attempt));
    }
  }
  throw error;
}

const ENTITY_FIELDS = {
  customers: ['code', 'first_name', 'last_name', 'company', 'email', 'phone', 'mobile', 'tax_id', 'customer_type', 'address_line', 'city', 'postal_code', 'status'],
  branches: ['customer_id', 'customer_erp_id', 'code', 'name', 'address_line', 'city', 'phone', 'status'],
  spaces: ['customer_id', 'branch_id', 'branch_erp_id', 'code', 'name', 'space_type', 'status'],
};

function searchNorm(table, data) {
  if (table === 'customers') {
    return normalizeFields(data.code, data.first_name, data.last_name, data.company, data.email, data.phone, data.mobile, data.tax_id, data.address_line, data.city);
  }

  return normalizeFields(data.code, data.name, data.address_line, data.city, data.phone, data.space_type, data.status);
}

function mapEntityRecord(entity, raw, mapping) {
  const data = mapRecord(raw, mapping);
  if (entity === 'customers') {
    const aliases = {
      erp_id: ['customer_id', 'id'],
      code: ['code'],
      company: ['company_name', 'trade_name'],
      address_line: ['address_street', 'address'],
      postal_code: ['address_postal', 'postal_code', 'postalCode'],
      city: ['address_city', 'city'],
      mobile: ['mobile', 'mobile_phone'],
      tax_id: ['vat_number', 'tax_id'],
      customer_type: ['customer_type'],
      email: ['email'],
      phone: ['phone'],
      status: ['status'],
    };
    for (const [field, paths] of Object.entries(aliases)) {
      if (data[field] !== undefined && data[field] !== null && data[field] !== '') continue;
      const fallback = paths.map((path) => getPath(raw, path)).find((value) => value !== undefined && value !== null && value !== '');
      if (fallback !== undefined) data[field] = fallback;
    }
  }
  return data;
}

async function loadCustomDefinitions(conn, tenantId, entity) {
  const [rows] = await conn.query(
    'SELECT id, `key`, field_type FROM custom_field_definitions WHERE tenant_id = ? AND entity_type = ? AND active = 1',
    [tenantId, entity],
  );
  return rows;
}

function mapCustomFields(raw, mapping, definitions) {
  const configured = mapping?.custom_fields;
  if (!configured || typeof configured !== 'object') return {};
  const byKey = new Map(definitions.map((definition) => [String(definition.key), definition]));
  const byId = new Map(definitions.map((definition) => [String(definition.id), definition]));
  const values = {};
  for (const [field, path] of Object.entries(configured)) {
    const definition = byKey.get(String(field)) || byId.get(String(field));
    if (!definition || !path) continue;
    const value = getPath(raw, path);
    if (value !== undefined) values[definition.id] = value;
  }
  return values;
}

async function saveMappedCustomFields(conn, entity, entityId, values) {
  if (!entityId || !Object.keys(values).length) return;
  const metadata = {
    customers: { table: 'customer_custom_field_values', column: 'customer_id' },
    branches: { table: 'branch_custom_field_values', column: 'branch_id' },
    spaces: { table: 'space_custom_field_values', column: 'space_id' },
  }[entity];
  if (!metadata) return;
  const [definitions] = await conn.query(
    'SELECT id, field_type FROM custom_field_definitions WHERE id IN (?)',
    [Object.keys(values).map(Number)],
  );
  const byId = new Map(definitions.map((definition) => [String(definition.id), definition]));
  for (const [definitionId, rawValue] of Object.entries(values)) {
    const definition = byId.get(String(definitionId));
    if (!definition) continue;
    const columns = valueColumns(definition.field_type, rawValue);
    if (Object.values(columns).every((value) => value === null)) {
      await conn.query(
        `DELETE FROM ${metadata.table} WHERE ${metadata.column} = ? AND field_definition_id = ?`,
        [entityId, definitionId],
      );
    } else {
      await conn.query(
        `INSERT INTO ${metadata.table}
          (${metadata.column}, field_definition_id, text_value, number_value, date_value, boolean_value, json_value)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE text_value = VALUES(text_value), number_value = VALUES(number_value),
           date_value = VALUES(date_value), boolean_value = VALUES(boolean_value), json_value = VALUES(json_value)`,
        [entityId, definitionId, columns.text_value, columns.number_value, columns.date_value, columns.boolean_value, columns.json_value],
      );
    }
  }
}

async function findByErpId(conn, table, tenantId, erpId, parentErpId = null, fullRow = false) {
  const parentColumn = table === 'branches' ? 'customer_erp_id' : table === 'spaces' ? 'branch_erp_id' : null;
  const parentClause = parentColumn ? ` AND ${parentColumn} = ?` : '';
  const params = parentColumn ? [tenantId, parentErpId, erpId] : [tenantId, erpId];
  const [rows] = await conn.query(`SELECT ${fullRow ? '*' : 'id'} FROM ${table} WHERE tenant_id = ?${parentClause} AND erp_id = ? LIMIT 1`, params);
  return rows[0] || null;
}

async function upsert(conn, table, tenantId, data) {
  const erpId = String(data.erp_id || '').trim();
  if (!erpId) throw new Error(`${table}.erp_id is empty`);
  const parentErpId = table === 'branches' ? String(data.customer_erp_id || '').trim()
    : table === 'spaces' ? String(data.branch_erp_id || '').trim() : null;
  if (table !== 'customers' && !parentErpId) throw new Error(`${table}.${table === 'branches' ? 'customer_erp_id' : 'branch_erp_id'} is empty`);
  const existing = await findByErpId(conn, table, tenantId, erpId, parentErpId, true);
  const existingId = existing?.id || null;
  const fields = ENTITY_FIELDS[table].filter((field) => data[field] !== undefined);
  const values = fields.map((field) => data[field]);
  const normalized = searchNorm(table, { ...existing, ...data });

  if (existingId) {
    if (fields.length) {
      const updates = fields.map((field) => `${field} = ?`);
      updates.push('search_norm = ?');
      if (table === 'customers') updates.push('updated_at = NOW()');
      await conn.query(`UPDATE ${table} SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, [...values, normalized, existingId, tenantId]);
    }
    return existingId;
  }

  if (table === 'customers') {
    await conn.query(
      `INSERT INTO customers (tenant_id, erp_id, code, first_name, last_name, company, email, phone, mobile, tax_id, customer_type, address_line, city, postal_code, status, search_norm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, erpId, data.code || `ERP-${tenantId}-${erpId}`, data.first_name || data.name || data.company || erpId,
        data.last_name || '', data.company, data.email, data.phone, data.mobile, data.tax_id, data.customer_type || 'individual',
        data.address_line, data.city, data.postal_code, data.status || 'active', normalized],
    );
  } else if (table === 'branches') {
    await conn.query(
      `INSERT INTO branches (tenant_id, customer_id, customer_erp_id, erp_id, code, name, address_line, city, phone, status, search_norm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, data.customer_id, parentErpId, erpId, data.code || `ERP-${tenantId}-${erpId}`, data.name || erpId,
        data.address_line, data.city, data.phone, data.status || 'active', normalized],
    );
  } else {
    await conn.query(
      `INSERT INTO spaces (tenant_id, customer_id, branch_id, branch_erp_id, erp_id, code, name, space_type, status, search_norm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, data.customer_id, data.branch_id, parentErpId, erpId, data.code || `ERP-${tenantId}-${erpId}`,
        data.name || erpId, data.space_type, data.status || 'available', normalized],
    );
  }
  return (await findByErpId(conn, table, tenantId, erpId, parentErpId))?.id;
}

async function resolveCustomer(conn, tenantId, current, data) {
  const erpId = data.customer_erp_id || data.customer_id;
  const customerId = current.get(String(erpId)) || (await findByErpId(conn, 'customers', tenantId, erpId))?.id;
  if (!customerId) throw new Error(`Branch ${data.erp_id} references unknown customer ${erpId}`);
  return customerId;
}

async function resolveBranch(conn, tenantId, current, data) {
  const erpId = data.branch_erp_id || data.branch_id;
  const [branchRows] = await conn.query(
    'SELECT id, customer_id, erp_id FROM branches WHERE tenant_id = ? AND erp_id = ? LIMIT 1',
    [tenantId, erpId],
  );
  const branchId = current.get(String(erpId)) || branchRows[0]?.id;
  if (!branchId) throw new Error(`Space ${data.erp_id} references unknown branch ${erpId}`);
  const rows = branchRows.length
    ? branchRows
    : (await conn.query('SELECT customer_id, erp_id FROM branches WHERE id = ? AND tenant_id = ?', [branchId, tenantId]))[0];
  if (!rows.length) throw new Error(`Space ${data.erp_id} references an invalid branch`);
  return { branchId, customerId: rows[0].customer_id, branchErpId: rows[0].erp_id };
}

export async function runSync(tenantId, connectorId) {
  const { rows } = await query('SELECT * FROM connectors WHERE id = ? AND tenant_id = ?', [connectorId, tenantId]);
  if (!rows.length) throw new Error('Connector not found');
  const connector = rows[0];
  const targetEntity = ['customers', 'branches', 'spaces'].includes(connector.target_entity)
    ? connector.target_entity : 'customers';
  const active = await query(
    'SELECT id FROM sync_runs WHERE connector_id = ? AND tenant_id = ? AND status = ? ORDER BY started_at DESC LIMIT 1',
    [connectorId, tenantId, 'running'],
  );
  if (active.rows.length) {
    const error = new Error('A sync is already running for this connector');
    error.code = 'SYNC_IN_PROGRESS';
    throw error;
  }
  const mappings = parseJson(connector.mappings);
  const validation = validateMappings(mappings, targetEntity);
  if (validation.length) throw new Error(validation.join('; '));

  const run = await query(
    'INSERT INTO sync_runs (tenant_id, connector_id, status, started_at) VALUES (?, ?, ?, NOW())',
    [tenantId, connectorId, 'running'],
  );
  const runId = run.rows.insertId;

  try {
    const payload = await fetchWithRetry(connector);
    const entities = Object.fromEntries(Object.keys(ENTITY_FIELDS).map((entity) => {
      if (entity !== targetEntity) return [entity, []];
      const source = mappings.sources?.[entity] || entity;
      return [entity, recordsAt(payload, source)];
    }));
    let upserted = 0;
    const recordsSeen = Object.values(entities).reduce((sum, records) => sum + records.length, 0);
    if (!recordsSeen) {
      throw new Error('Το response δεν περιέχει records. Έλεγξε το JSON path στο sources ή αν το ERP επιστρέφει data/items.');
    }

    await withConnection(async (conn) => {
      await conn.beginTransaction();
      try {
        const customers = new Map();
        const branches = new Map();
        const customDefinitions = {};
        for (const entity of Object.keys(ENTITY_FIELDS)) {
          customDefinitions[entity] = await loadCustomDefinitions(conn, tenantId, entity);
        }
        for (const raw of entities.customers) {
          const data = mapEntityRecord('customers', raw, mappings.customers);
          const id = await upsert(conn, 'customers', tenantId, data);
          await saveMappedCustomFields(conn, 'customers', id, mapCustomFields(raw, mappings.customers, customDefinitions.customers));
          customers.set(String(data.erp_id), id);
          upserted += 1;
        }
        for (const raw of entities.branches) {
          const data = mapEntityRecord('branches', raw, mappings.branches);
          data.customer_id = await resolveCustomer(conn, tenantId, customers, data);
          const id = await upsert(conn, 'branches', tenantId, data);
          await saveMappedCustomFields(conn, 'branches', id, mapCustomFields(raw, mappings.branches, customDefinitions.branches));
          branches.set(String(data.erp_id), id);
          upserted += 1;
        }
        for (const raw of entities.spaces) {
          const data = mapEntityRecord('spaces', raw, mappings.spaces);
          const parent = await resolveBranch(conn, tenantId, branches, data);
          data.branch_id = parent.branchId;
          data.customer_id = parent.customerId;
          data.branch_erp_id = data.branch_erp_id || parent.branchErpId;
          const id = await upsert(conn, 'spaces', tenantId, data);
          await saveMappedCustomFields(conn, 'spaces', id, mapCustomFields(raw, mappings.spaces, customDefinitions.spaces));
          upserted += 1;
        }
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      }
    });

    await query(
      'UPDATE sync_runs SET status = ?, finished_at = NOW(), records_seen = ?, records_upserted = ? WHERE id = ? AND tenant_id = ?',
      ['success', recordsSeen, upserted, runId, tenantId],
    );
    await query('UPDATE connectors SET last_run_at = NOW() WHERE id = ? AND tenant_id = ?', [connectorId, tenantId]);
    return { runId, status: 'success', recordsSeen, recordsUpserted: upserted };
  } catch (error) {
    await query(
      'UPDATE sync_runs SET status = ?, finished_at = NOW(), error_count = 1, error_message = ? WHERE id = ? AND tenant_id = ?',
      ['failed', error.message, runId, tenantId],
    );
    throw error;
  }
}
