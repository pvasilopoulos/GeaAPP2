// Configurable navigation menu — tenant-wide defaults + per-user overrides.
//
// The catalog of selectable ids intentionally mirrors the fixed nav entries
// rendered by the frontend (see frontend/src/lib/navCatalog.js). Only
// reordering/hiding of these existing ids is supported: menu configuration
// can never introduce arbitrary entries, and it never grants access — actual
// visibility is always re-checked against the user's permissions on top of
// whatever order/hidden list is configured here.
export const NAV_ITEM_IDS = [
  'dashboard', 'customers', 'bookings', 'branches', 'spaces', 'calendar',
  'reports', 'communications', 'documents', 'branch-actions', 'invoices',
  'quotes', 'settings',
];

// Matches the current hardcoded NAV_GROUPS order in App.jsx so behaviour is
// unchanged until an admin customizes the tenant-wide menu.
export const DEFAULT_SIDEBAR_ORDER = [
  'dashboard', 'calendar', 'reports',
  'customers', 'branches', 'spaces', 'branch-actions', 'invoices',
  'bookings', 'quotes', 'communications', 'documents',
  'settings',
];

// Curated default subset for the mobile bottom footer bar (constrained space).
export const DEFAULT_MOBILE_FOOTER_ITEMS = ['dashboard', 'customers', 'quotes', 'bookings', 'settings'];

export const MOBILE_FOOTER_MIN_MAX = 3;
export const MOBILE_FOOTER_MAX_MAX = 5;
export const MOBILE_FOOTER_DEFAULT_MAX = 5;

export const DEFAULT_MENU_CONFIG = {
  sidebar: { order: DEFAULT_SIDEBAR_ORDER, hidden: [] },
  mobile_footer: { items: DEFAULT_MOBILE_FOOTER_ITEMS, max: MOBILE_FOOTER_DEFAULT_MAX },
};

function uniqueKnownIds(list) {
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  const out = [];
  for (const id of list) {
    if (typeof id !== 'string') continue;
    if (!NAV_ITEM_IDS.includes(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function sanitizeMax(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MOBILE_FOOTER_MAX_MAX, Math.max(MOBILE_FOOTER_MIN_MAX, Math.round(n)));
}

function sanitizeSidebarSection(raw, fallback) {
  if (!raw || typeof raw !== 'object') return fallback;
  const order = uniqueKnownIds(raw.order) ?? fallback.order;
  const hidden = uniqueKnownIds(raw.hidden) ?? fallback.hidden;
  return { order, hidden };
}

function sanitizeMobileFooterSection(raw, fallback) {
  if (!raw || typeof raw !== 'object') return fallback;
  const max = sanitizeMax(raw.max, fallback.max ?? MOBILE_FOOTER_DEFAULT_MAX);
  const items = (uniqueKnownIds(raw.items) ?? fallback.items).slice(0, max);
  return { items, max };
}

/** Full tenant-wide menu config, always fully populated (safe defaults for untouched tenants). */
export function sanitizeMenuConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    sidebar: sanitizeSidebarSection(src.sidebar, DEFAULT_MENU_CONFIG.sidebar),
    mobile_footer: sanitizeMobileFooterSection(src.mobile_footer, DEFAULT_MENU_CONFIG.mobile_footer),
  };
}

/**
 * Per-user personal override. Returns null when the user has no override
 * (falls back to the tenant default). Each section (sidebar / mobile_footer)
 * may be set independently — an unset section falls back to the tenant
 * default for that section only.
 */
export function sanitizePersonalMenuConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  if (raw.sidebar && typeof raw.sidebar === 'object') {
    out.sidebar = sanitizeSidebarSection(raw.sidebar, { order: [], hidden: [] });
  }
  if (raw.mobile_footer && typeof raw.mobile_footer === 'object') {
    out.mobile_footer = sanitizeMobileFooterSection(raw.mobile_footer, { items: [], max: MOBILE_FOOTER_DEFAULT_MAX });
  }
  return Object.keys(out).length ? out : null;
}
