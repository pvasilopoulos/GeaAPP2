// Generic offline-mutation queue: persists write requests that could not
// reach the network so they can be retried automatically once connectivity
// returns. Handlers at the bottom cover customer create/update, follow-ups,
// and notes. The storage/flush engine and `registerHandler` API stay generic.
import { api } from '../api.js';

const DB_NAME = 'spacehub-offline';
// Bumped from 1 -> 2: some already-installed clients ended up with a
// `spacehub-offline` database at version 1 that never received the
// `pending_mutations` object store (onupgradeneeded only fires when the
// requested version is higher than the existing one). Raising the version
// forces those installs to run the upgrade and create the missing store,
// fixing "One of the specified object stores was not found" errors.
const DB_VERSION = 2;
const STORE = 'pending_mutations';
const LS_KEY = 'spacehub_offline_queue';
export const QUEUE_EVENT = 'spacehub:offline-queue';

// ---- pure helpers (no browser storage needed — covered by unit tests) ----

/**
 * True only for genuine connectivity failures: the browser reports itself
 * offline, or `fetch` itself threw (a TypeError) because it could never
 * reach the network. A response that came back from the server — including
 * 4xx/5xx errors, which api.js turns into a plain `Error` — is NOT a network
 * failure and must be surfaced to the user instead of queued.
 */
export function isNetworkFailure(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return err instanceof TypeError;
}

export function makeIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Builds a queue record for a mutation. Exported for testing. */
export function buildMutation(type, payload, meta = {}, idempotencyKey) {
  const now = Date.now();
  return {
    id: makeIdempotencyKey(),
    type,
    payload,
    meta,
    idempotencyKey: idempotencyKey || makeIdempotencyKey(),
    status: 'pending', // 'pending' (will auto-retry) | 'error' (needs user action)
    error: null,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------- storage engine -------------------------------

let memoryCache = null;
let dbPromise = null;
let flushing = false;
const listeners = new Set();
const handlers = new Map();

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

function openDb() {
  if (!hasIndexedDb()) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        // Defensive self-heal: if an already-installed client somehow still
        // ends up with a database missing the store (corrupted state,
        // blocked upgrade, etc.), don't let it crash the app — drop the
        // database so the *next* open starts clean, and fall back to
        // localStorage for the rest of this session.
        if (!db.objectStoreNames.contains(STORE)) {
          db.close();
          indexedDB.deleteDatabase(DB_NAME);
          resolve(null);
          return;
        }
        resolve(db);
      };
      req.onerror = () => resolve(null);
    });
  }
  return dbPromise;
}

function lsRead() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function lsWrite(items) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch { /* storage unavailable/full: best effort only */ }
}

async function ensureLoaded() {
  if (memoryCache) return;
  const db = await openDb();
  if (db) {
    memoryCache = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } else {
    memoryCache = lsRead();
  }
  memoryCache.sort((a, b) => a.createdAt - b.createdAt);
}

async function persist(item) {
  const db = await openDb();
  if (db) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } else {
    lsWrite(memoryCache);
  }
}

async function persistDelete(id) {
  const db = await openDb();
  if (db) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } else {
    lsWrite(memoryCache);
  }
}

function getSnapshotSync() {
  const items = memoryCache ? [...memoryCache] : [];
  return {
    items,
    count: items.filter((i) => i.status === 'pending').length,
    errorCount: items.filter((i) => i.status === 'error').length,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    syncing: flushing,
  };
}

function notify(extra) {
  const detail = { ...getSnapshotSync(), ...extra };
  for (const fn of listeners) fn(detail);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail }));
}

async function saveItem(item) {
  await ensureLoaded();
  const idx = memoryCache.findIndex((i) => i.id === item.id);
  if (idx >= 0) memoryCache[idx] = item; else memoryCache.push(item);
  await persist(item);
  return item;
}

async function deleteItem(id) {
  await ensureLoaded();
  memoryCache = memoryCache.filter((i) => i.id !== id);
  await persistDelete(id);
}

// ------------------------------ public API ---------------------------------

export async function enqueueMutation(type, payload, meta, idempotencyKey) {
  const item = buildMutation(type, payload, meta, idempotencyKey);
  await saveItem(item);
  notify();
  return item;
}

export async function listMutations(type) {
  await ensureLoaded();
  return type ? memoryCache.filter((i) => i.type === type) : [...memoryCache];
}

/** Synchronous snapshot for initial render; refine via `subscribe`. */
export function getSnapshot() { return getSnapshotSync(); }

export function subscribe(fn) {
  listeners.add(fn);
  fn(getSnapshotSync());
  return () => listeners.delete(fn);
}

/** Registers the handler used to (re)send a queued mutation of `type`. */
export function registerHandler(type, fn) { handlers.set(type, fn); }

/** Puts a failed item back into the auto-retry queue. */
export async function retryMutation(id) {
  await ensureLoaded();
  const item = memoryCache.find((i) => i.id === id);
  if (!item) return;
  await saveItem({ ...item, status: 'pending', error: null, updatedAt: Date.now() });
  notify();
  return flushQueue();
}

/** Drops a queued mutation without sending it (e.g. user gives up after an error). */
export async function discardMutation(id) {
  await deleteItem(id);
  notify();
}

/**
 * Sends every pending mutation, in order. Stops at the first genuine network
 * failure (connectivity is still down — remaining items stay queued for the
 * next trigger). A definitive server-side rejection marks that single item
 * as `error` (so it stops auto-retrying) and continues with the rest.
 */
export async function flushQueue() {
  if (flushing) return { flushed: 0 };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { flushed: 0 };
  flushing = true;
  notify();
  let flushed = 0;
  try {
    await ensureLoaded();
    const pending = memoryCache.filter((i) => i.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
    for (const item of pending) {
      const handler = handlers.get(item.type);
      if (!handler) continue;
      try {
        const result = await handler(item);
        await deleteItem(item.id);
        flushed += 1;
        notify({ synced: { item, result } });
      } catch (err) {
        if (isNetworkFailure(err)) break; // still offline: keep the rest queued, try again later
        await saveItem({
          ...item, status: 'error', error: err?.message || 'Ο συγχρονισμός απέτυχε',
          attempts: (item.attempts || 0) + 1, updatedAt: Date.now(),
        });
        notify({ failed: { item, error: err?.message } });
      }
    }
  } finally {
    flushing = false;
    notify();
  }
  return { flushed };
}

let initialized = false;
/** Wires up automatic flush triggers: online event, load, focus, and a light periodic check. */
export function initOfflineSync() {
  if (initialized || typeof window === 'undefined') return () => {};
  initialized = true;
  const onOnline = () => { flushQueue(); };
  const onFocus = () => { flushQueue(); };
  window.addEventListener('online', onOnline);
  window.addEventListener('focus', onFocus);
  flushQueue();
  const timer = setInterval(() => { flushQueue(); }, 20000);
  return () => {
    initialized = false;
    window.removeEventListener('online', onOnline);
    window.removeEventListener('focus', onFocus);
    clearInterval(timer);
  };
}

// -------------------------- mutation handlers ------------------------------

function idempotencyHeaders(item) {
  return { headers: { 'Idempotency-Key': item.idempotencyKey } };
}

registerHandler('create_customer', async (item) => {
  const res = await api.createCustomer(item.payload.fields, idempotencyHeaders(item));
  const customFields = item.payload.customFields;
  if (customFields && Object.keys(customFields).length) {
    // Best effort: the customer record itself is the part that must not be
    // lost/duplicated; custom-field values are a secondary save that the
    // user can redo from the profile if this ever fails.
    await api.saveCustomerCustomFields(res.id, customFields).catch(() => {});
  }
  return res;
});

registerHandler('update_customer', async (item) => {
  const res = await api.updateCustomer(item.payload.id, item.payload.fields, idempotencyHeaders(item));
  const customFields = item.payload.customFields;
  if (customFields && Object.keys(customFields).length) {
    await api.saveCustomerCustomFields(item.payload.id, customFields).catch(() => {});
  }
  return res;
});

registerHandler('create_follow_up', async (item) => (
  api.createFollowUp(item.payload, idempotencyHeaders(item))
));

registerHandler('update_follow_up', async (item) => {
  if (item.payload.snoozeMinutes != null) {
    return api.snoozeFollowUp(item.payload.id, item.payload.snoozeMinutes, idempotencyHeaders(item));
  }
  return api.updateFollowUp(item.payload.id, item.payload.patch, idempotencyHeaders(item));
});

registerHandler('create_note', async (item) => (
  api.createCustomerNote(item.payload.customerId, item.payload.note, idempotencyHeaders(item))
));

registerHandler('update_note', async (item) => (
  api.updateCustomerNote(item.payload.customerId, item.payload.noteId, item.payload.note, idempotencyHeaders(item))
));

/**
 * Attempts a mutation online; on a genuine connectivity failure, queues it
 * for later sync (reusing `idempotencyKey` so retries do not duplicate).
 * Real validation/HTTP errors are rethrown.
 */
export async function submitOnlineOrQueue(type, payload, send, extra = {}) {
  const idempotencyKey = makeIdempotencyKey();
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new TypeError('offline: navigator.onLine is false');
    }
    const res = await send(idempotencyKey);
    if (res && typeof res === 'object') return { ...res, pendingSync: false };
    return { pendingSync: false };
  } catch (err) {
    if (!isNetworkFailure(err)) throw err;
    const item = await enqueueMutation(type, payload, extra.meta || {}, idempotencyKey);
    return { pendingSync: true, offlineId: item.id, ...extra.queued };
  }
}

/**
 * Attempts to create a customer online; if that fails purely for
 * connectivity reasons, queues it for later sync and returns an optimistic
 * placeholder instead of throwing. Real validation/HTTP errors are rethrown
 * so the form can show them to the user as before.
 */
export async function submitCustomerCreate(fields, customFields) {
  return submitOnlineOrQueue(
    'create_customer',
    { fields, customFields },
    (key) => api.createCustomer(fields, { headers: { 'Idempotency-Key': key } }),
    { queued: { id: null, code: null, full_name: `${fields.first_name || ''} ${fields.last_name || ''}`.trim() } },
  );
}

export async function submitCustomerUpdate(id, fields, customFields) {
  const result = await submitOnlineOrQueue(
    'update_customer',
    { id, fields, customFields },
    (key) => api.updateCustomer(id, fields, { headers: { 'Idempotency-Key': key } }),
    { meta: { customerId: id }, queued: { id } },
  );
  if (!result.pendingSync && customFields && Object.keys(customFields).length) {
    await api.saveCustomerCustomFields(id, customFields).catch(() => {});
  }
  return result;
}

export function submitFollowUpCreate(payload) {
  return submitOnlineOrQueue('create_follow_up', payload, (key) => (
    api.createFollowUp(payload, { headers: { 'Idempotency-Key': key } })
  ), { meta: { customerId: payload.customerId } });
}

export function submitFollowUpUpdate(id, patch, { customerId, snoozeMinutes } = {}) {
  const payload = snoozeMinutes != null ? { id, snoozeMinutes } : { id, patch };
  return submitOnlineOrQueue('update_follow_up', payload, (key) => {
    const opts = { headers: { 'Idempotency-Key': key } };
    return snoozeMinutes != null ? api.snoozeFollowUp(id, snoozeMinutes, opts) : api.updateFollowUp(id, patch, opts);
  }, { meta: { customerId } });
}

export function submitNoteCreate(customerId, note) {
  return submitOnlineOrQueue('create_note', { customerId, note }, (key) => (
    api.createCustomerNote(customerId, note, { headers: { 'Idempotency-Key': key } })
  ), { meta: { customerId } });
}

export function submitNoteUpdate(customerId, noteId, note) {
  return submitOnlineOrQueue('update_note', { customerId, noteId, note }, (key) => (
    api.updateCustomerNote(customerId, noteId, note, { headers: { 'Idempotency-Key': key } })
  ), { meta: { customerId } });
}

/** Query keys to refresh after a queued mutation has synced. */
export function queryKeysForMutation(type) {
  if (type === 'create_customer' || type === 'update_customer') return ['customers', 'customer', 'meta', 'stats'];
  if (type === 'create_follow_up' || type === 'update_follow_up') return ['c-follow-ups', 'calendar', 'stats', 'customer'];
  if (type === 'create_note' || type === 'update_note') return ['knowledge'];
  return [];
}
