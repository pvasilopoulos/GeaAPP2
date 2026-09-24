import assert from 'node:assert/strict';
import { buildFilters } from './customerFilters.js';

const { where, params } = buildFilters({
  user: { tenantId: 7 },
  query: { q: 'mercato' },
});

assert.match(where.join(' '), /FROM customers c_match[\s\S]*MATCH\(c_match\.search_norm\) AGAINST/);
assert.match(where.join(' '), /FROM branches b[\s\S]*MATCH\(b\.search_norm\) AGAINST/);
assert.match(where.join(' '), /FROM spaces s[\s\S]*MATCH\(s\.search_norm\) AGAINST/);
assert.deepEqual(params, [
  7,
  7,
  '+mercato*',
  7,
  '+mercato*',
  7,
  '+mercato*',
]);

console.log('customer filter tests passed');
