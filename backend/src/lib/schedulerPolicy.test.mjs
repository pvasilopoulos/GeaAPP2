import assert from 'node:assert/strict';
import { isDue, retryDelay } from './schedulerPolicy.js';
assert.equal(isDue(null, 5), true);
assert.equal(isDue(new Date(Date.now() - 6 * 60000), 5), true);
assert.equal(isDue(new Date(), 5), false);
assert.equal(retryDelay(3), 2000);
assert.equal(retryDelay(20), 30000);
console.log('scheduler policy tests passed');
