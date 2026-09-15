import { create } from 'zustand';
import { api, getToken, setToken } from '../api.js';
import { useTabs } from './tabs.js';
import { useOffline } from './offline.js';
import { clearOfflineCache } from '../lib/offlineCache.js';

// The signed-in profile is mirrored next to the token so a cold start without
// network can still render the app (permissions included) instead of bouncing
// the user to the login screen.
const USER_KEY = 'spacehub_user';

function cacheUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch { /* storage full or blocked */ }
}

function cachedUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}

export const useAuth = create((set, get) => ({
  user: null,
  status: getToken() ? 'loading' : 'anon', // loading | authed | anon
  offlineSession: false,
  // Load the current user if a token exists (called on app boot).
  bootstrap: async () => {
    if (!getToken()) { set({ status: 'anon', user: null }); return; }
    try {
      const { user } = await api.me();
      cacheUser(user);
      set({ user, status: 'authed', offlineSession: false });
      useOffline.getState().setScope(user.id);
    } catch (err) {
      const fallback = err?.offline ? cachedUser() : null;
      if (fallback) {
        set({ user: fallback, status: 'authed', offlineSession: true });
        useOffline.getState().setScope(fallback.id);
        return;
      }
      setToken(null);
      cacheUser(null);
      set({ user: null, status: 'anon', offlineSession: false });
    }
  },
  login: async (email, password) => {
    const { token, user } = await api.login(email, password);
    setToken(token);
    cacheUser(user);
    set({ user, status: 'authed', offlineSession: false });
    useOffline.getState().setScope(user.id);
    return user;
  },
  register: async (payload) => {
    const { token, user } = await api.register(payload);
    setToken(token);
    cacheUser(user);
    set({ user, status: 'authed', offlineSession: false });
    useOffline.getState().setScope(user.id);
    return user;
  },
  logout: () => {
    setToken(null);
    cacheUser(null);
    set({ user: null, status: 'anon', offlineSession: false });
    useOffline.getState().setScope(null);
    clearOfflineCache().catch(() => {});
    // Reset the workspace so tabs don't leak across sessions/tenants.
    useTabs.setState({ tabs: [{ id: 'customers', type: 'customers', title: 'Πελάτες', icon: 'users' }], activeId: 'customers' });
  },
  hasPerm: (code) => {
    const u = get().user;
    if (!u) return false;
    if (code === 'tenants.platform' && u.isPlatformAdmin) return true;
    return !!u.permissions?.includes(code);
  },
}));

// A 401 from any request forces logout.
window.addEventListener('spacehub:unauthorized', () => {
  useAuth.getState().logout();
});
