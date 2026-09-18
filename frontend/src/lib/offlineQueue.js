// Generic offline-mutation queue: persists write requests that could not
// reach the network so they can be retried automatically once connectivity
// returns. Currently only customer creation is wired up (see the
// `create_customer` handler at the bottom), but the storage/flush engine and
// `registerHandler` API are generic so other mutations can reuse it later.
import { api } from '../api.js';

const DB_NAME = 'spacehub-offline';
const DB_VERSION = 1;
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
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
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

// -------------------------- customer creation ------------------------------

registerHandler('create_customer', async (item) => {
  const res = await api.createCustomer(item.payload.fields, { headers: { 'Idempotency-Key': item.idempotencyKey } });
  const customFields = item.payload.customFields;
  if (customFields && Object.keys(customFields).length) {
    // Best effort: the customer record itself is the part that must not be
    // lost/duplicated; custom-field values are a secondary save that the
    // user can redo from the profile if this ever fails.
    await api.saveCustomerCustomFields(res.id, customFields).catch(() => {});
  }
  return res;
});

/**
 * Attempts to create a customer online; if that fails purely for
 * connectivity reasons, queues it for later sync and returns an optimistic
 * placeholder instead of throwing. Real validation/HTTP errors are rethrown
 * so the form can show them to the user as before.
 */
export async function submitCustomerCreate(fields, customFields) {
  const idempotencyKey = makeIdempotencyKey();
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new TypeError('offline: navigator.onLine is false');
    }
    const res = await api.createCustomer(fields, { headers: { 'Idempotency-Key': idempotencyKey } });
    return { ...res, pendingSync: false };
  } catch (err) {
    if (!isNetworkFailure(err)) throw err;
    const item = await enqueueMutation('create_customer', { fields, customFields }, {}, idempotencyKey);
    return {
      id: null, code: null, pendingSync: true, offlineId: item.id,
      full_name: `${fields.first_name || ''} ${fields.last_name || ''}`.trim(),
    };
  }
}
