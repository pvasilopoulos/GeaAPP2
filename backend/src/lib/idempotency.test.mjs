import assert from 'node:assert/strict';
import { extractClientRequestId, isDuplicateKeyError } from './idempotency.js';

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

console.log('idempotency tests passed');
