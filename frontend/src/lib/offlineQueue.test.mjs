import assert from 'node:assert/strict';
import { isNetworkFailure, buildMutation, makeIdempotencyKey } from './offlineQueue.js';

// navigator is undefined in Node, so only the TypeError branch is exercised here.
assert.equal(isNetworkFailure(new TypeError('Failed to fetch')), true);
assert.equal(isNetworkFailure(new Error('Request failed: 400')), false);
assert.equal(isNetworkFailure(new Error('Request failed: 500')), false);
assert.equal(isNetworkFailure(null), false);

const key = makeIdempotencyKey();
assert.equal(typeof key, 'string');
assert.ok(key.length > 0);
assert.notEqual(key, makeIdempotencyKey(), 'keys should be unique across calls');

const payload = { fields: { first_name: 'A', last_name: 'B' }, customFields: {} };
const item = buildMutation('create_customer', payload, { note: 'x' });
assert.equal(item.type, 'create_customer');
assert.deepEqual(item.payload, payload);
assert.equal(item.status, 'pending');
assert.equal(item.attempts, 0);
assert.ok(item.id);
assert.ok(item.idempotencyKey);
assert.notEqual(item.id, item.idempotencyKey, 'record id and idempotency key are independent identifiers');

const reused = buildMutation('create_customer', payload, {}, 'fixed-key');
assert.equal(reused.idempotencyKey, 'fixed-key', 'an explicit idempotency key is preserved (e.g. reused from a failed online attempt)');

console.log('offlineQueue tests passed');
