// api.js reads the token and reacts to 401s through browser globals.
globalThis.localStorage ??= {
  store: new Map(),
  getItem(k) { return this.store.get(k) ?? null; },
  setItem(k, v) { this.store.set(k, String(v)); },
  removeItem(k) { this.store.delete(k); },
};
globalThis.location ??= { pathname: '/' };
globalThis.window ??= { dispatchEvent() {}, addEventListener() {} };

const {
  CONFLICT, FAILED, MAX_RETRIES, PENDING,
  describeItem, isOfflineError, isRetryable, kindMeta, pendingCustomerRows, replayItems,
} = await import('./outbox.js');
const { selectCounts } = await import('../store/offline.js');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Answers API calls by path so the replay loop can be driven end to end. */
function mockApi(routes) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url);
    calls.push({ path, method: init.method || 'GET' });
    for (const [match, reply] of Object.entries(routes)) {
      if (path.includes(match)) return reply();
    }
    throw new Error(`unexpected call ${path}`);
  };
  return calls;
}

const jsonRes = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const noNetwork = () => { throw new TypeError('Failed to fetch'); };

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

// --- replay ----------------------------------------------------------------

mockApi({
  '/customers/check-duplicates': () => jsonRes({ matches: [] }),
  '/customers': () => jsonRes({ id: 77 }),
});
let out = await replayItems([create]);
assert(out.sent === 1 && out.failed === 0, 'clean create is sent');
assert(out.customerIds[0] === 77, 'new server id reported for invalidation');

mockApi({
  '/customers/check-duplicates': () => jsonRes({ matches: [{ id: 5, full_name: 'Μαρία Π.', code: 'C-5' }] }),
});
out = await replayItems([create]);
assert(out.conflicts === 1 && out.sent === 0, 'duplicate becomes a conflict instead of a write');

mockApi({ '/customers': () => jsonRes({ id: 78 }) });
out = await replayItems([{ ...create, payload: { ...create.payload, force: true } }]);
assert(out.sent === 1, 'forced create skips the duplicate check');

mockApi({ '/customers/check-duplicates': noNetwork });
out = await replayItems([create, { ...create, id: 'local-2' }]);
assert(out.stopped === true && out.sent === 0, 'a dead network stops the replay');
assert(out.failed === 0, 'offline items stay queued rather than failing');

mockApi({
  '/customers/check-duplicates': () => jsonRes({ matches: [] }),
  '/customers': () => jsonRes({ error: 'Λείπει το όνομα' }, 400),
});
out = await replayItems([create]);
assert(out.failed === 1 && out.stopped === false, 'a server rejection fails just that item');

const calls = mockApi({
  '/contacts': () => jsonRes({ id: 9 }),
  '/customers/12': () => jsonRes({ ok: true }),
});
out = await replayItems([
  { id: 'a', kind: 'customer.update', status: PENDING, createdAt: 1, payload: { id: 12, customer: { city: 'Χανιά' } } },
  { id: 'b', kind: 'contact.create', status: PENDING, createdAt: 2, payload: { customerId: 12, contact: { first_name: 'Νίκος' } } },
]);
assert(out.sent === 2, 'mixed kinds replay');
assert(calls[0].method === 'PATCH' && calls[1].method === 'POST', 'queue order preserved');

console.log('outbox: ok');
