import { create } from 'zustand';
import {
  CONFLICT, FAILED, PENDING,
  enqueue, flushOutbox, listOutbox, removeItem, retryItem,
} from '../lib/outbox.js';
import { setCacheScope } from '../lib/offlineCache.js';

function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

export const useOffline = create((set, get) => ({
  online: isOnline(),
  scope: null,
  items: [],
  flushing: false,
  lastSyncAt: null,

  setOnline: (online) => {
    const was = get().online;
    set({ online });
    if (online && !was) get().flush();
  },

  // Called on login/bootstrap so the queue and read cache follow the account.
  setScope: async (id) => {
    setCacheScope(id);
    set({ scope: id == null ? null : String(id) });
    await get().refresh();
    if (id != null && get().online) get().flush();
  },

  refresh: async () => {
    const { scope } = get();
    set({ items: await listOutbox(scope) });
  },

  add: async (kind, payload) => {
    const item = await enqueue(kind, payload, { scope: get().scope });
    await get().refresh();
    return item;
  },

  discard: async (id) => {
    await removeItem(id);
    await get().refresh();
  },

  retry: async (id, opts) => {
    await retryItem(id, opts);
    await get().refresh();
    return get().flush();
  },

  flush: async () => {
    const { flushing, scope, online } = get();
    if (flushing || !online || scope == null) return null;
    set({ flushing: true });
    try {
      const summary = await flushOutbox(scope);
      await get().refresh();
      set({ lastSyncAt: Date.now() });
      if (summary.sent > 0) {
        window.dispatchEvent(new CustomEvent('spacehub:synced', { detail: summary }));
      }
      if (summary.stopped) set({ online: isOnline() });
      return summary;
    } finally {
      set({ flushing: false });
    }
  },
}));

export function selectCounts(state) {
  let pending = 0;
  let conflicts = 0;
  let failed = 0;
  for (const it of state.items) {
    if (it.status === CONFLICT) conflicts += 1;
    else if (it.status === FAILED) failed += 1;
    else if (it.status === PENDING) pending += 1;
  }
  return { pending, conflicts, failed, total: state.items.length };
}

/** Flush when the network returns, and whenever the app comes back to the foreground. */
export function installOfflineWatchers() {
  const store = useOffline.getState;
  const sync = () => store().setOnline(isOnline());
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      store().setOnline(isOnline());
      store().flush();
    }
  });
  sync();
}
