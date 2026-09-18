import assert from 'node:assert/strict';
import {
  extractClientRequestId, isDuplicateKeyError, fingerprintBody,
  decideIdempotencyReplay, parseStoredResponse, idempotencyPath, withIdempotency,
} from './idempotency.js';

// Header takes precedence, is trimmed, and over-long values are capped.
assert.equal(extractClientRequestId({ get: () => ' abc-123 ', body: {} }), 'abc-123');
assert.equal(extractClientRequestId({ get: () => null, body: { client_request_id: 'from-body' } }), 'from-body');
assert.equal(extractClientRequestId({ get: () => '', body: { client_request_id: 'fallback' } }), 'fallback');
assert.equal(extractClientRequestId({ get: () => undefined, body: {} }), null);
assert.equal(extractClientRequestId({ get: () => '   ', body: {} }), null);
assert.equal(extractClientRequestId({ headers: { 'idempotency-key': 'raw-header' }, body: {} }), 'raw-header');
assert.equal(extractClientRequestId({ get: () => 'x'.repeat(200), body: {} }).length, 100);

assert.equal(isDuplicateKeyError({ code: 'ER_DUP_ENTRY' }), true);
assert.equal(isDuplicateKeyError({ errno: 1062 }), true);
assert.equal(isDuplicateKeyError({ code: 'ER_BAD_FIELD_ERROR' }), false);
assert.equal(isDuplicateKeyError(null), false);

assert.equal(
  fingerprintBody({ title: 'Call', client_request_id: 'aaa' }),
  fingerprintBody({ client_request_id: 'bbb', title: 'Call' }),
  'client_request_id is excluded and key order does not change the hash',
);
assert.notEqual(fingerprintBody({ title: 'Call' }), fingerprintBody({ title: 'Email' }));

assert.deepEqual(parseStoredResponse('{"ok":true}'), { ok: true });
assert.deepEqual(parseStoredResponse({ id: 7 }), { id: 7 });

assert.equal(decideIdempotencyReplay(null, 'abc').action, 'proceed');
assert.equal(decideIdempotencyReplay({ request_hash: 'abc', status_code: 201, response_json: { id: 3 } }, 'abc').action, 'replay');
assert.equal(decideIdempotencyReplay({ request_hash: 'abc', status_code: 201, response_json: { id: 3 } }, 'abc').status, 201);
assert.deepEqual(decideIdempotencyReplay({ request_hash: 'abc', status_code: 201, response_json: { id: 3 } }, 'abc').body, { id: 3 });
assert.equal(decideIdempotencyReplay({ request_hash: 'abc', status_code: 200, response_json: { ok: true } }, 'zzz').action, 'conflict');

assert.equal(
  idempotencyPath({ baseUrl: '/api/follow-ups', route: { path: '/:id' }, path: '/12' }),
  '/api/follow-ups/:id',
);

{
  const rows = [];
  const queryFn = async (sql, params) => {
    if (String(sql).includes('SELECT')) {
      const found = rows.find((r) => r.tenant_id === params[0] && r.user_id === params[1] && r.idempotency_key === params[2]);
      return { rows: found ? [found] : [] };
    }
    rows.push({
      tenant_id: params[0], user_id: params[1], idempotency_key: params[2],
      request_hash: params[5], status_code: params[6], response_json: JSON.parse(params[7]),
    });
    return { rows: { insertId: rows.length } };
  };
  const req = {
    get: () => 'follow-up-1',
    body: { title: 'Call', customerId: 9 },
    user: { tenantId: 1, id: 4 },
    method: 'POST',
    baseUrl: '/api/follow-ups',
    route: { path: '/' },
  };
  let writes = 0;
  const first = await withIdempotency(queryFn, req, async () => {
    writes += 1;
    return { status: 201, body: { id: 42 } };
  });
  const second = await withIdempotency(queryFn, req, async () => {
    writes += 1;
    return { status: 201, body: { id: 99 } };
  });
  assert.equal(first.status, 201);
  assert.deepEqual(first.body, { id: 42 });
  assert.equal(second.replay, true);
  assert.deepEqual(second.body, { id: 42 });
  assert.equal(writes, 1, 'replay must not apply a second write');

  const conflictReq = { ...req, body: { title: 'Different', customerId: 9 } };
  const conflict = await withIdempotency(queryFn, conflictReq, async () => {
    writes += 1;
    return { status: 201, body: { id: 100 } };
  });
  assert.equal(conflict.status, 409);
  assert.equal(writes, 1);

  const noKeyReq = { ...req, get: () => null, body: { title: 'Call', customerId: 9 } };
  const unkeyed = await withIdempotency(queryFn, noKeyReq, async () => ({ status: 400, body: { error: 'nope' } }));
  assert.equal(unkeyed.status, 400);
  assert.equal(rows.length, 1, '4xx responses are not stored');
}

console.log('idempotency tests passed');
