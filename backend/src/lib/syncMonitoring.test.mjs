import assert from 'node:assert/strict';
import { canRetrySyncRun, summarizeSyncRuns } from './syncMonitoring.js';

assert.equal(canRetrySyncRun('failed'), true);
assert.equal(canRetrySyncRun('success'), false);
assert.equal(canRetrySyncRun('running'), false);

assert.deepEqual(summarizeSyncRuns([
  { status: 'success', records_seen: 4, records_upserted: 3, error_count: 0 },
  { status: 'failed', records_seen: 2, records_upserted: 0, error_count: 1 },
  { status: 'running', records_seen: 0, records_upserted: 0, error_count: 0 },
]), {
  total: 3,
  successful: 1,
  failed: 1,
  running: 1,
  recordsSeen: 6,
  recordsUpserted: 3,
  errors: 1,
});

console.log('sync monitoring tests passed');
