import assert from 'node:assert/strict';
import {
  renderPushTemplate, enqueuePush, processOutbox,
} from './pushSync.js';

// --- renderPushTemplate -----------------------------------------------------
assert.deepEqual(
  renderPushTemplate('{"code": {{code}}, "name": {{name}}}', { code: 'C-1', name: 'Άννα' }),
  { code: 'C-1', name: 'Άννα' },
);
assert.deepEqual(renderPushTemplate('{"n": {{missing}}}', {}), { n: null });
assert.deepEqual(renderPushTemplate('', { a: 1 }), {});
assert.throws(() => renderPushTemplate('{"bad": {{code}', { code: 'x' }));
// Placeholders written wrapped in manual quotes (a common authoring mistake /
// legacy convention, e.g. the quotes-module default template) must not
// produce double-quoted strings — the surrounding quotes are dropped in
// favour of JSON.stringify's own quoting.
assert.deepEqual(
  renderPushTemplate('{"customerId":"{{customerId}}","paymentDueDate":"{{paymentDueDate}}","branchId":"{{branchId}}"}', { customerId: 15, paymentDueDate: '2026-11-01', branchId: null }),
  { customerId: 15, paymentDueDate: '2026-11-01', branchId: null },
);

// --- in-memory fake store ----------------------------------------------------
const state = {
  connectors: [
    {
      id: 10, tenant_id: 1, name: 'Entersoft', target_entity: 'customers', push_enabled: 1,
      push_url: 'https://erp.example/customers', push_method: 'POST',
      push_body_template: '{"code": {{code}}, "email": {{email}}}',
      push_response_id_path: 'id', headers: '{}', auth_type: 'none', credentials_enc: null, timeout_ms: 5000,
    },
    {
      id: 11, tenant_id: 1, name: 'Disabled connector', target_entity: 'customers', push_enabled: 0,
      push_url: null, push_method: 'POST', push_body_template: '{}', push_response_id_path: 'id',
      headers: '{}', auth_type: 'none', credentials_enc: null, timeout_ms: 5000,
    },
  ],
  customers: [
    { id: 100, tenant_id: 1, erp_id: null, code: 'C-100', email: 'a@example.com' },
  ],
  outbox: [],
};
let outboxAutoId = 0;

async function fakeQuery(sql, params) {
  const s = String(sql);
  if (s.startsWith('SELECT id FROM connectors WHERE tenant_id')) {
    const [tenantId, entityType] = params;
    return { rows: state.connectors.filter((c) => c.tenant_id === tenantId && c.target_entity === entityType && c.push_enabled).map((c) => ({ id: c.id })) };
  }
  if (s.startsWith('SELECT erp_id FROM customers')) {
    const [id, tenantId] = params;
    const row = state.customers.find((c) => c.id === id && c.tenant_id === tenantId);
    return { rows: row ? [{ erp_id: row.erp_id }] : [] };
  }
  if (s.startsWith('INSERT INTO sync_outbox')) {
    const [tenantId, connectorId, entityType, entityId, action] = params;
    outboxAutoId += 1;
    state.outbox.push({
      id: outboxAutoId, tenant_id: tenantId, connector_id: connectorId, entity_type: entityType,
      entity_id: entityId, action, status: 'pending', attempts: 0, last_error: null, next_attempt_at: new Date(0),
    });
    return { rows: { insertId: outboxAutoId } };
  }
  if (s.startsWith("SELECT * FROM sync_outbox WHERE status = 'pending'")) {
    return { rows: state.outbox.filter((j) => j.status === 'pending' && new Date(j.next_attempt_at) <= new Date()) };
  }
  if (s.startsWith('SELECT * FROM connectors WHERE id')) {
    const [id, tenantId] = params;
    return { rows: state.connectors.filter((c) => c.id === id && c.tenant_id === tenantId) };
  }
  if (s.startsWith('SELECT * FROM customers WHERE id')) {
    const [id, tenantId] = params;
    return { rows: state.customers.filter((c) => c.id === id && c.tenant_id === tenantId) };
  }
  if (s.startsWith('UPDATE customers SET erp_id')) {
    const [erpId, id] = params;
    const row = state.customers.find((c) => c.id === id);
    if (row) row.erp_id = erpId;
    return { rows: {} };
  }
  if (s.startsWith('UPDATE sync_outbox SET status = ?, sent_at')) {
    const [status, id] = params;
    const job = state.outbox.find((j) => j.id === id);
    if (job) job.status = status;
    return { rows: {} };
  }
  if (s.startsWith('UPDATE sync_outbox SET attempts = ?, last_error')) {
    const [attempts, lastError, delayMin, id] = params;
    const job = state.outbox.find((j) => j.id === id);
    if (job) {
      job.attempts = attempts; job.last_error = lastError;
      job.next_attempt_at = new Date(Date.now() + delayMin * 60000);
    }
    return { rows: {} };
  }
  if (s.startsWith('UPDATE sync_outbox SET status = ?, attempts = ?, last_error')) {
    const [status, attempts, lastError, id] = params;
    const job = state.outbox.find((j) => j.id === id);
    if (job) { job.status = status; job.attempts = attempts; job.last_error = lastError; }
    return { rows: {} };
  }
  if (s.startsWith('UPDATE sync_outbox SET status = ?, last_error')) {
    const [status, lastError, id] = params;
    const job = state.outbox.find((j) => j.id === id);
    if (job) { job.status = status; job.last_error = lastError; }
    return { rows: {} };
  }
  if (s.startsWith('SELECT u.id, r.key AS role_key')) {
    return { rows: [{ id: 9, role_key: 'owner', permissions: [] }] };
  }
  if (s.startsWith('INSERT INTO notifications')) {
    return { rows: { insertId: 1 } };
  }
  throw new Error(`unexpected query: ${s}`);
}

// --- enqueuePush -------------------------------------------------------------
const enq = await enqueuePush({ tenantId: 1, entityType: 'customers', entityId: 100 }, fakeQuery);
assert.equal(enq.queued, 1); // only the push-enabled connector
assert.equal(state.outbox.length, 1);
assert.equal(state.outbox[0].action, 'create'); // customer has no erp_id yet

// --- processOutbox: success + erp_id capture on create ----------------------
const originalFetch = global.fetch;
global.fetch = async () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ id: 'ERP-999' }),
});
try {
  await processOutbox(10, fakeQuery);
} finally {
  global.fetch = originalFetch;
}
assert.equal(state.outbox[0].status, 'sent');
assert.equal(state.customers[0].erp_id, 'ERP-999');

// --- processOutbox: failure path increments attempts, then gives up --------
outboxAutoId += 1;
state.outbox.push({
  id: outboxAutoId, tenant_id: 1, connector_id: 10, entity_type: 'customers', entity_id: 100,
  action: 'update', status: 'pending', attempts: 0, last_error: null, next_attempt_at: new Date(0),
});
global.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
try {
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await processOutbox(10, fakeQuery);
    const job = state.outbox[state.outbox.length - 1];
    job.next_attempt_at = new Date(0); // force it eligible again immediately for the test
  }
} finally {
  global.fetch = originalFetch;
}
const failedJob = state.outbox[state.outbox.length - 1];
assert.equal(failedJob.status, 'failed');
assert.equal(failedJob.attempts, 5);

console.log('pushSync tests passed');
