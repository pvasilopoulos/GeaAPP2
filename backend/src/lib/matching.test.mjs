import assert from 'node:assert/strict';
import { normalizeErpId, buildEntityKey, ensureParent } from './matching.js';
assert.equal(normalizeErpId(' 42 '), '42');
assert.equal(buildEntityKey(2, 'customer', '42'), '2:customer:42');
assert.deepEqual(ensureParent({ name: 'x' }, 'customer_id', 4), { name: 'x', customer_id: 4 });
assert.throws(() => ensureParent({}, 'branch_id', null));
console.log('matching tests passed');
