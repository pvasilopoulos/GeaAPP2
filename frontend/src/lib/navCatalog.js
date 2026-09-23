// Fixed catalog of nav items and their default grouping/order for the desktop
// sidebar. This is the single source of truth for ids/labels/icons/perms — the
// configurable menu system (frontend/src/lib/menu.js) only reorders or
// hides/shows these existing ids; it never introduces new ones.
import { PERMS } from './perms.js';

export const NAV = [
  { id: 'dashboard', type: 'dashboard', label: 'Αρχική', icon: 'home' },
  { id: 'customers', type: 'customers', label: 'Πελάτες', icon: 'users' },
  { id: 'bookings', type: 'bookings', label: 'Κρατήσεις', icon: 'calendar' },
  { id: 'branches', type: 'branches', label: 'Υποκαταστήματα', icon: 'building' },
  { id: 'spaces', type: 'spaces', label: 'Χώροι', icon: 'grid' },
  { id: 'calendar', type: 'calendar', label: 'Ημερολόγιο', icon: 'calendar', perms: [PERMS.BOOKINGS_VIEW, PERMS.CUSTOMERS_READ] },
  { id: 'reports', type: 'reports', label: 'Αναφορές', icon: 'chart' },
  { id: 'communications', type: 'communications', label: 'Επικοινωνίες', icon: 'message' },
  { id: 'documents', type: 'documents', label: 'Έγγραφα', icon: 'file' },
  { id: 'branch-actions', type: 'branch-actions', label: 'Ενέργειες ανά υποκατάστημα', icon: 'activity' },
  { id: 'invoices', type: 'invoices', label: 'Τιμολόγια', icon: 'file' },
  { id: 'quotes', type: 'quotes', label: 'Προσφορές', icon: 'file', perms: [PERMS.QUOTES_VIEW] },
  { id: 'settings', type: 'settings', label: 'Ρυθμίσεις', icon: 'settings', perms: [PERMS.SETTINGS_MANAGE, PERMS.APP_SETTINGS_MANAGE, PERMS.MESSAGING_MANAGE, PERMS.REMINDERS_MANAGE, PERMS.MENU_MANAGE, PERMS.CUSTOM_FIELDS_MANAGE, PERMS.ERP_SYNC_MANAGE, PERMS.NOTIFICATIONS_MANAGE, PERMS.AUDIT_VIEW, PERMS.SELLERS_MANAGE, PERMS.USERS_MANAGE, PERMS.ROLES_MANAGE, PERMS.TENANT_MANAGE, PERMS.TENANTS_PLATFORM] },
  { id: 'audit', type: 'audit', label: 'Ιστορικό αλλαγών', icon: 'clock', perms: [PERMS.AUDIT_VIEW, PERMS.SETTINGS_MANAGE] },
];

export const NAV_GROUPS = [
  { id: 'workspace', label: 'Workspace', items: ['dashboard', 'calendar', 'reports'] },
  { id: 'customers', label: 'Πελατειακή διαχείριση', items: ['customers', 'branches', 'spaces', 'branch-actions', 'invoices'] },
  { id: 'operations', label: 'Λειτουργίες', items: ['bookings', 'quotes', 'communications', 'documents'] },
  { id: 'admin', label: 'Διαχείριση', items: ['settings'] },
];

export const NAV_ITEM_IDS = NAV.map((n) => n.id);
export const NAV_BY_ID = Object.fromEntries(NAV.map((n) => [n.id, n]));

// Flattened default order (mirrors NAV_GROUPS order) — matches today's fixed
// behaviour, used as the ultimate fallback when no tenant/personal config exists.
export const DEFAULT_SIDEBAR_ORDER = NAV_GROUPS.flatMap((g) => g.items);

export const DEFAULT_MOBILE_FOOTER_ITEMS = ['dashboard', 'customers', 'quotes', 'bookings', 'settings'];
export const MOBILE_FOOTER_MIN_MAX = 3;
export const MOBILE_FOOTER_MAX_MAX = 5;
export const MOBILE_FOOTER_DEFAULT_MAX = 5;
