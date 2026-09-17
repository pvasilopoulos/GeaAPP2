import assert from 'node:assert/strict';
import { getPath, mapRecord, validateMappings } from './mapping.js';
assert.equal(getPath({ customer: { id: 7 }, rows: [{ name: 'x' }] }, 'customer.id'), 7);
assert.equal(getPath({ rows: [{ name: 'x' }] }, 'rows[0].name'), 'x');
assert.deepEqual(mapRecord({ id: 3, name: 'A' }, { erp_id: 'id', label: 'name' }), { erp_id: 3, label: 'A' });
assert.ok(validateMappings({}).length);
assert.equal(validateMappings({ customers: { erp_id: 'id', name: 'name' }, branches: { erp_id: 'id', name: 'n' }, spaces: { erp_id: 'id', name: 'n' } }).length, 0);
console.log('mapping tests passed');
