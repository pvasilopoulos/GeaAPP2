// Last-known-good copies of read-only API responses, so the screens a user
// already visited still render when the device drops off the network.
import { idb, STORE_CACHE } from './idb.js';

// Cached rows are namespaced per user: a shared tablet must not show the
// previous account's customers after a logout.
let scope = 'anon';

export function setCacheScope(id) {
  scope = id == null ? 'anon' : String(id);
}

function fullKey(key) {
  return `${scope}::${key}`;
}

export async function readCache(key) {
  const row = await idb.get(STORE_CACHE, fullKey(key));
  return row ? { data: row.data, savedAt: row.savedAt } : null;
}

export async function writeCache(key, data) {
  await idb.put(STORE_CACHE, { key: fullKey(key), data, savedAt: Date.now() });
}

export async function clearOfflineCache() {
  await idb.clear(STORE_CACHE);
}

/** Keep per-record caches (customer profiles) from growing without bound. */
export async function trimCache(prefix, max) {
  const rows = await idb.all(STORE_CACHE);
  const full = `${scope}::${prefix}`;
  const mine = rows.filter((r) => String(r.key).startsWith(full)).sort((a, b) => b.savedAt - a.savedAt);
  for (const row of mine.slice(max)) await idb.del(STORE_CACHE, row.key);
}

/**
 * Wrap a React Query `queryFn` so successful payloads are mirrored to
 * IndexedDB and replayed when the request fails because of connectivity.
 * Server errors still propagate — only offline failures fall back. A null key
 * opts a query out of caching entirely (e.g. filtered result pages).
 */
export function offlineFirst(key, fn, { keep } = {}) {
  return async (ctx) => {
    if (!key) return fn(ctx);
    try {
      const data = await fn(ctx);
      writeCache(key, data)
        .then(() => (keep ? trimCache(keep.prefix, keep.max) : null))
        .catch(() => {});
      return data;
    } catch (err) {
      if (!err?.offline) throw err;
      const hit = await readCache(key);
      if (hit) return hit.data;
      throw err;
    }
  };
}
