import {
  CONFLICT, FAILED, MAX_RETRIES, PENDING,
  describeItem, isOfflineError, isRetryable, kindMeta, pendingCustomerRows,
} from './outbox.js';
import { selectCounts } from '../store/offline.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const create = {
  id: 'local-1', kind: 'customer.create', status: PENDING, retries: 0, createdAt: 1,
  payload: { customer: { first_name: 'Μαρία', last_name: 'Παπαδοπούλου', city: 'Βόλος' } },
};

assert(describeItem(create) === 'Μαρία Παπαδοπούλου', 'describes a queued customer');
assert(describeItem({ kind: 'customer.create', payload: {} }) === 'Πελάτης χωρίς όνομα', 'nameless fallback');
assert(kindMeta('customer.create').label === 'Νέος πελάτης', 'kind label');
assert(kindMeta('nope').label === 'nope', 'unknown kind degrades');

assert(isOfflineError({ offline: true }) === true, 'offline flag detected');
assert(isOfflineError(new Error('400')) === false, 'server error is not offline');

assert(isRetryable(create) === true, 'pending is retryable');
assert(isRetryable({ status: FAILED, retries: 1 }) === true, 'failed retries again');
assert(isRetryable({ status: FAILED, retries: MAX_RETRIES }) === false, 'gives up after max retries');
assert(isRetryable({ status: CONFLICT }) === false, 'conflict waits for the user');

const rows = pendingCustomerRows([create, { kind: 'contact.create', payload: {} }]);
assert(rows.length === 1, 'only customer creates become rows');
assert(rows[0].pending === true && rows[0].city === 'Βόλος', 'row carries form data');
assert(rows[0].branches_count === 0, 'row has neutral counters');

const counts = selectCounts({
  items: [create, { status: CONFLICT }, { status: FAILED }, { status: FAILED }],
});
assert(counts.pending === 1 && counts.conflicts === 1 && counts.failed === 2 && counts.total === 4, 'counts by status');

console.log('outbox: ok');
