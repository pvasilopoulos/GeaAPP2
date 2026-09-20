// Two-way sync: push local create/update changes on customers/branches/spaces
// back out to a connector's ERP endpoint. Complements sync.js (which pulls
// ERP → app). Enqueue happens from the entity route handlers; a scheduler
// tick then drains the queue (see scheduler.js).
import { query as dbQuery } from '../db.js';
import { decryptCredentials } from './connectorCrypto.js';
import { applyCredentials } from './sync.js';
import { getPath } from './mapping.js';
import { evaluateNotificationRules } from './notificationRules.js';

const ENTITY_TABLES = {
  customers: 'customers',
  branches: 'branches',
  spaces: 'spaces',
};

// Flat set of columns available to {{placeholders}} in push_body_template,
// per entity — mirrors ENTITY_FIELDS in sync.js plus id/erp_id.
const ENTITY_TEMPLATE_FIELDS = {
  customers: ['id', 'erp_id', 'code', 'first_name', 'last_name', 'company', 'email', 'phone', 'mobile', 'tax_id', 'customer_type', 'address_line', 'city', 'postal_code', 'status'],
  branches: ['id', 'erp_id', 'customer_id', 'customer_erp_id', 'code', 'name', 'address_line', 'city', 'phone', 'status'],
  spaces: ['id', 'erp_id', 'customer_id', 'branch_id', 'branch_erp_id', 'code', 'name', 'space_type', 'status'],
};

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

/**
 * Renders a JSON body template containing `{{field}}` placeholders. Each
 * placeholder is replaced with `JSON.stringify(value)`, so authors write the
 * template WITHOUT surrounding quotes (e.g. `{"code": {{code}}}`) and both
 * strings and numbers/null come out as valid JSON. For backward/forward
 * compatibility, placeholders that ARE written wrapped in manual quotes
 * (e.g. `{"code": "{{code}}"}`) are also handled correctly: the surrounding
 * quotes are treated as part of the placeholder and dropped in favour of
 * `JSON.stringify`'s own quoting — otherwise a string value would end up
 * double-quoted (`""value""`) and break the resulting JSON.
 */
export function renderPushTemplate(template, data) {
  const src = template && String(template).trim() ? String(template) : '{}';
  const substitute = (key) => {
    const value = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    return JSON.stringify(value === undefined ? null : value);
  };
  const rendered = src
    .replace(/"\{\{\s*([\w.]+)\s*}}"/g, (_match, key) => substitute(key))
    .replace(/\{\{\s*([\w.]+)\s*}}/g, (_match, key) => substitute(key));
  return JSON.parse(rendered); // throws if the template + values don't produce valid JSON
}

/** Outbound backoff schedule (in minutes) for failed push attempts. */
function nextAttemptMinutes(attempts) {
  const schedule = [1, 5, 15, 60];
  return schedule[Math.min(attempts - 1, schedule.length - 1)];
}

const MAX_ATTEMPTS = 5;

/**
 * Queues a push for every enabled connector matching this tenant/entity that
 * has two-way sync turned on. Called (fire-and-forget) right after a local
 * create/update of a customer, branch, or space.
 */
export async function enqueuePush({ tenantId, entityType, entityId }, queryFn = dbQuery) {
  if (!ENTITY_TABLES[entityType]) return { queued: 0 };
  const { rows: connectors } = await queryFn(
    'SELECT id FROM connectors WHERE tenant_id = ? AND target_entity = ? AND push_enabled = 1',
    [tenantId, entityType],
  );
  if (!connectors.length) return { queued: 0 };
  const { rows: entityRows } = await queryFn(
    `SELECT erp_id FROM ${ENTITY_TABLES[entityType]} WHERE id = ? AND tenant_id = ?`,
    [entityId, tenantId],
  );
  if (!entityRows.length) return { queued: 0 };
  const action = entityRows[0].erp_id ? 'update' : 'create';
  for (const connector of connectors) {
    await queryFn(
      `INSERT INTO sync_outbox (tenant_id, connector_id, entity_type, entity_id, action)
       VALUES (?, ?, ?, ?, ?)`,
      [tenantId, connector.id, entityType, entityId, action],
    );
  }
  return { queued: connectors.length };
}

/** Fires the connector_run_failed rule (same event sync.js uses for pull failures) for a push-outbox job that exhausted its retries. */
async function notifyPushFailure({
  tenantId, connectorName, errorMessage,
}, queryFn) {
  return evaluateNotificationRules('connector_run_failed', {
    tenantId,
    entityId: Date.now(), // outbox failures have no single sync_run id; timestamp keeps dedupe from colliding
    connectorName: `${connectorName} (αποστολή προς ERP)`,
    errorMessage: errorMessage ? String(errorMessage).slice(0, 400) : '',
  }, queryFn);
}

async function sendOne(job, queryFn) {
  const { rows: connectorRows } = await queryFn('SELECT * FROM connectors WHERE id = ? AND tenant_id = ?', [job.connector_id, job.tenant_id]);
  const connector = connectorRows[0];
  if (!connector || !connector.push_enabled) {
    await queryFn('UPDATE sync_outbox SET status = ?, last_error = ? WHERE id = ?', ['failed', 'Ο connector δεν υπάρχει πια ή το two-way sync είναι απενεργοποιημένο', job.id]);
    return;
  }
  const table = ENTITY_TABLES[job.entity_type];
  const { rows: entityRows } = await queryFn(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ?`, [job.entity_id, job.tenant_id]);
  const entity = entityRows[0];
  if (!entity) {
    await queryFn('UPDATE sync_outbox SET status = ?, last_error = ? WHERE id = ?', ['failed', 'Η εγγραφή διαγράφηκε τοπικά πριν σταλεί', job.id]);
    return;
  }

  const data = Object.fromEntries(ENTITY_TEMPLATE_FIELDS[job.entity_type].map((field) => [field, entity[field] ?? null]));
  const headers = parseJson(connector.headers);
  applyCredentials(headers, decryptCredentials(connector.credentials_enc), connector.auth_type);
  if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';

  let body;
  try {
    body = JSON.stringify(renderPushTemplate(connector.push_body_template, data));
  } catch (err) {
    await queryFn('UPDATE sync_outbox SET status = ?, attempts = attempts + 1, last_error = ? WHERE id = ?', ['failed', `Μη έγκυρο body template: ${err.message}`, job.id]);
    return;
  }

  const url = connector.push_url || connector.base_url;
  const method = connector.push_method || 'POST';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(connector.timeout_ms) || 30000);
  try {
    const response = await fetch(url, {
      method, headers, body, signal: controller.signal,
    });
    const text = await response.text().catch(() => '');
    if (!response.ok) throw new Error(`ERP returned ${response.status}${text ? `: ${text.slice(0, 300)}` : ''}`);

    if (job.action === 'create') {
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { /* non-JSON response, skip id capture */ }
      const newErpId = parsed ? getPath(parsed, connector.push_response_id_path || 'id') : null;
      if (newErpId != null && newErpId !== '') {
        await queryFn(`UPDATE ${table} SET erp_id = ? WHERE id = ? AND tenant_id = ?`, [String(newErpId), job.entity_id, job.tenant_id]);
      }
    }
    await queryFn('UPDATE sync_outbox SET status = ?, sent_at = NOW() WHERE id = ?', ['sent', job.id]);
  } catch (err) {
    const attempts = job.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await queryFn('UPDATE sync_outbox SET status = ?, attempts = ?, last_error = ? WHERE id = ?', ['failed', attempts, err.message, job.id]);
      await notifyPushFailure({
        tenantId: job.tenant_id, connectorName: connector.name, entityType: job.entity_type, errorMessage: err.message,
      }, queryFn).catch((e) => console.error('[pushSync] notify failed:', e.message));
    } else {
      const delayMin = nextAttemptMinutes(attempts);
      await queryFn(
        'UPDATE sync_outbox SET attempts = ?, last_error = ?, next_attempt_at = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?',
        [attempts, err.message, delayMin, job.id],
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Drains a batch of pending outbox jobs. Called from the scheduler tick. */
export async function processOutbox(limit = 20, queryFn = dbQuery) {
  const { rows: jobs } = await queryFn(
    `SELECT * FROM sync_outbox WHERE status = 'pending' AND next_attempt_at <= NOW() ORDER BY created_at LIMIT ?`,
    [limit],
  );
  for (const job of jobs) {
    // eslint-disable-next-line no-await-in-loop -- outbox jobs are sent sequentially to avoid hammering the ERP
    await sendOne(job, queryFn).catch((err) => console.error('[pushSync] job failed:', err.message));
  }
  return { processed: jobs.length };
}
