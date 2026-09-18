import { create } from 'zustand';
import { api, getToken, setToken } from '../api.js';
import { useTabs } from './tabs.js';

export const useAuth = create((set, get) => ({
  user: null,
  status: getToken() ? 'loading' : 'anon', // loading | authed | anon
  // Load the current user if a token exists (called on app boot).
  bootstrap: async () => {
    if (!getToken()) { set({ status: 'anon', user: null }); return; }
    try {
      const { user } = await api.me();
      set({ user, status: 'authed' });
    } catch {
      setToken(null);
      set({ user: null, status: 'anon' });
    }
  },
  login: async (email, password) => {
    const { token, user } = await api.login(email, password);
    setToken(token);
    set({ user, status: 'authed' });
    return user;
  },
  register: async (payload) => {
    const { token, user } = await api.register(payload);
    setToken(token);
    set({ user, status: 'authed' });
    return user;
  },
  logout: () => {
    setToken(null);
    set({ user: null, status: 'anon' });
    // Reset the workspace so tabs don't leak across sessions/tenants.
    useTabs.setState({ tabs: [{ id: 'dashboard', type: 'dashboard', title: 'Αρχική', icon: 'home' }], activeId: 'dashboard' });
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
