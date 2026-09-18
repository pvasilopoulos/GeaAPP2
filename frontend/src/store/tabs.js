import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// In-app multi-tab workspace. Each tab is an open view (dashboard, directory,
// settings, users, or a specific customer). Open customer panels stay mounted
// so their state (active section, scroll) is preserved while switching tabs.
const MAX_TABS = 12;

const DEFAULT_TABS = [
  { id: 'dashboard', type: 'dashboard', title: 'Αρχική', icon: 'home' },
];

export const useTabs = create(persist((set, get) => ({
  tabs: DEFAULT_TABS,
  activeId: 'dashboard',

  openTab: (tab) => set((s) => {
    if (s.tabs.some((t) => t.id === tab.id)) return { activeId: tab.id };
    let tabs = [...s.tabs, tab];
    // Evict the oldest non-pinned tab past the limit (LRU-ish).
    if (tabs.length > MAX_TABS) tabs = [tabs[0], ...tabs.slice(2)];
    return { tabs, activeId: tab.id };
  }),

  activateTab: (id) => set({ activeId: id }),

  renameTab: (id, title) => set((s) => ({
    tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
  })),

  closeTab: (id) => set((s) => {
    const idx = s.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return s;
    const tabs = s.tabs.filter((t) => t.id !== id);
    if (tabs.length === 0) return { tabs: DEFAULT_TABS, activeId: 'dashboard' };
    let activeId = s.activeId;
    if (activeId === id) activeId = (tabs[idx] || tabs[idx - 1] || tabs[0]).id;
    return { tabs, activeId };
  }),

  openCustomer: (customer) => get().openTab({
    id: `customer:${customer.id}`,
    type: 'customer',
    customerId: customer.id,
    title: customer.full_name || customer.name || `#${customer.code || customer.id}`,
    icon: 'users',
  }),
}), { name: 'spacehub_tabs' }));
