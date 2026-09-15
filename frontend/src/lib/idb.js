// Small IndexedDB wrapper for offline data. Every call resolves to null
// instead of throwing when storage is unavailable (Safari private mode,
// blocked storage), so callers can treat offline support as best-effort.
const DB_NAME = 'spacehub-offline';
const DB_VERSION = 1;

export const STORE_OUTBOX = 'outbox';
export const STORE_CACHE = 'cache';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) db.createObjectStore(STORE_OUTBOX, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_CACHE)) db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function run(store, mode, work) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let result;
    const req = work(tx.objectStore(store));
    if (req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result === undefined ? null : result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

async function safe(promise, fallback) {
  try { return await promise; } catch { return fallback; }
}

export const idb = {
  get: (store, key) => safe(run(store, 'readonly', (s) => s.get(key)), null),
  all: (store) => safe(run(store, 'readonly', (s) => s.getAll()), []).then((v) => v || []),
  put: (store, value) => safe(run(store, 'readwrite', (s) => s.put(value)), null),
  del: (store, key) => safe(run(store, 'readwrite', (s) => s.delete(key)), null),
  clear: (store) => safe(run(store, 'readwrite', (s) => s.clear()), null),
};
