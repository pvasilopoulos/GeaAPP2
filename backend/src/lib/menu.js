// Configurable navigation menu — tenant-wide defaults + per-user overrides.
//
// The catalog of selectable ids intentionally mirrors the fixed nav entries
// rendered by the frontend (see frontend/src/lib/navCatalog.js). Reordering,
// hiding, custom labels/icons, role restriction, custom groups and custom
// external links are supported, but menu configuration can never introduce
// arbitrary *behaviour*: a built-in item's id/type/perms stay authoritative,
// and actual visibility is always re-checked against the user's permissions
// on top of whatever this config produces.
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

// Mirrors the built-in group ids from frontend/src/lib/navCatalog.js
// (NAV_GROUPS), plus the frontend's fallback "Other" group id (FALLBACK_GROUP_ID
// in frontend/src/lib/menu.js). Kept in sync manually — these ids let an admin
// rename/reorder the existing built-in groups (or explicitly assign an item to
// the automatic fallback group) via the same `groups` list used for custom
// groups, without having to duplicate every item into a brand-new group.
export const BUILTIN_GROUP_IDS = ['workspace', 'customers', 'operations', 'admin', 'other'];

// Mirrors the supported icon names from frontend/src/components/Icon.jsx
// (`Object.keys(P)`). Kept in sync manually so the backend can whitelist icon
// overrides/links without importing frontend code. Any icon override/link
// icon not in this list is rejected server-side.
export const ICON_NAMES = [
  'home', 'users', 'calendar', 'building', 'grid', 'chart', 'message', 'file', 'settings',
  'search', 'phone', 'mail', 'pin', 'cake', 'edit', 'copy', 'plus', 'chevronRight', 'chevronDown',
  'chevronUp', 'arrowLeft', 'more', 'tag', 'clock', 'wallet', 'star', 'filter', 'check', 'x',
  'download', 'map', 'layers', 'bell', 'refresh', 'globe', 'briefcase', 'activity', 'note', 'mic',
  'send', 'telegram', 'sms', 'viber', 'archive', 'wifiOff', 'eye', 'eyeOff', 'save', 'sort',
];

export const DEFAULT_MENU_CONFIG = {
  sidebar: { order: DEFAULT_SIDEBAR_ORDER, hidden: [] },
  mobile_footer: { items: DEFAULT_MOBILE_FOOTER_ITEMS, max: MOBILE_FOOTER_DEFAULT_MAX },
  groups: [],
  overrides: {},
  links: [],
};

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const ROLE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const GROUP_LABEL_MAX = 60;
const ITEM_LABEL_MAX = 60;
const LINK_URL_MAX = 500;
const MAX_GROUPS = 40;
const MAX_LINKS = 50;

function uniqueIds(list, allowedIds) {
  if (!Array.isArray(list)) return null;
  const allowed = new Set(allowedIds);
  const seen = new Set();
  const out = [];
  for (const id of list) {
    if (typeof id !== 'string') continue;
    if (!allowed.has(id)) continue;
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

function sanitizeSidebarSection(raw, fallback, allowedIds) {
  if (!raw || typeof raw !== 'object') return fallback;
  const order = uniqueIds(raw.order, allowedIds) ?? fallback.order;
  const hidden = uniqueIds(raw.hidden, allowedIds) ?? fallback.hidden;
  return { order, hidden };
}

function sanitizeMobileFooterSection(raw, fallback, allowedIds) {
  if (!raw || typeof raw !== 'object') return fallback;
  const max = sanitizeMax(raw.max, fallback.max ?? MOBILE_FOOTER_DEFAULT_MAX);
  const items = (uniqueIds(raw.items, allowedIds) ?? fallback.items).slice(0, max);
  return { items, max };
}

function sanitizeLabel(raw, maxLength) {
  if (typeof raw !== 'string') return null;
  const label = raw.trim().slice(0, maxLength);
  return label || null;
}

function sanitizeId(raw) {
  if (typeof raw !== 'string') return null;
  const id = raw.trim().toLowerCase().slice(0, 40);
  return ID_PATTERN.test(id) ? id : null;
}

function sanitizeIcon(raw) {
  return typeof raw === 'string' && ICON_NAMES.includes(raw) ? raw : null;
}

/**
 * Role restriction list: null/empty means "visible to all roles" (still
 * subject to permissions). When `validRoleKeys` is supplied (the tenant's
 * actual role keys, looked up from the `roles` table), unknown role keys are
 * rejected; when omitted (e.g. re-sanitizing already-stored data without a DB
 * round-trip) only the key format is checked, keeping sanitization idempotent.
 */
function sanitizeRoles(raw, validRoleKeys) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    if (typeof r !== 'string') continue;
    const key = r.trim().toLowerCase();
    if (!key || !ROLE_KEY_PATTERN.test(key)) continue;
    if (validRoleKeys && !validRoleKeys.includes(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out.length ? out : null;
}

/** Custom (and/or renamed/reordered built-in) sidebar groups. */
function sanitizeGroups(raw, validRoleKeys) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const g of raw) {
    if (!g || typeof g !== 'object') continue;
    const id = sanitizeId(g.id);
    const label = sanitizeLabel(g.label, GROUP_LABEL_MAX);
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label, roles: sanitizeRoles(g.roles, validRoleKeys) });
    if (out.length >= MAX_GROUPS) break;
  }
  return out;
}

/**
 * Per built-in nav item cosmetic overrides (label/icon), plus optional role
 * restriction and group reassignment. The item's id/type/perms from
 * NAV_ITEM_IDS stay authoritative — only these fields are ever stored here.
 */
function sanitizeOverrides(raw, validRoleKeys, validGroupIds) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [id, val] of Object.entries(raw)) {
    if (!NAV_ITEM_IDS.includes(id) || !val || typeof val !== 'object') continue;
    const entry = {};
    const label = sanitizeLabel(val.label, ITEM_LABEL_MAX);
    if (label) entry.label = label;
    const icon = sanitizeIcon(val.icon);
    if (icon) entry.icon = icon;
    const roles = sanitizeRoles(val.roles, validRoleKeys);
    if (roles) entry.roles = roles;
    if (typeof val.group_id === 'string' && validGroupIds.includes(val.group_id)) entry.group_id = val.group_id;
    if (Object.keys(entry).length) out[id] = entry;
  }
  return out;
}

/** Well-formed http(s) URL, or null if invalid/unsafe. */
function sanitizeUrl(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().slice(0, LINK_URL_MAX);
  if (!value) return null;
  let parsed;
  try { parsed = new URL(value); } catch { return null; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.toString();
}

/**
 * Custom external-link menu entries. These carry no internal permission
 * (they aren't tied to app functionality) but do respect role restriction
 * and are orderable/hideable like any other item via sidebar/mobile_footer
 * order+hidden lists (their generated `id` is added to the allowed id set).
 */
function sanitizeLinks(raw, validRoleKeys, validGroupIds) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  let n = 0;
  for (const l of raw) {
    if (!l || typeof l !== 'object') continue;
    const label = sanitizeLabel(l.label, ITEM_LABEL_MAX);
    const url = sanitizeUrl(l.url);
    if (!label || !url) continue;
    let id = sanitizeId(l.id);
    if (!id || seen.has(id)) id = `link-${++n}`;
    while (seen.has(id)) id = `link-${++n}`;
    seen.add(id);
    const icon = sanitizeIcon(l.icon) || 'globe';
    const group_id = typeof l.group_id === 'string' && validGroupIds.includes(l.group_id) ? l.group_id : null;
    const roles = sanitizeRoles(l.roles, validRoleKeys);
    out.push({ id, label, icon, url, group_id, roles });
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}

/**
 * Full tenant-wide menu config, always fully populated (safe defaults for
 * untouched tenants). Pass `{ validRoleKeys }` (the tenant's real role keys)
 * when sanitizing user input from a request so unknown role keys are
 * rejected; omit it when re-sanitizing already-persisted/trusted data.
 */
export function sanitizeMenuConfig(raw, opts = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const validRoleKeys = Array.isArray(opts.validRoleKeys) ? opts.validRoleKeys : null;
  const groups = sanitizeGroups(src.groups, validRoleKeys);
  const validGroupIds = [...BUILTIN_GROUP_IDS, ...groups.map((g) => g.id)];
  const links = sanitizeLinks(src.links, validRoleKeys, validGroupIds);
  const overrides = sanitizeOverrides(src.overrides, validRoleKeys, validGroupIds);
  const allowedIds = [...NAV_ITEM_IDS, ...links.map((l) => l.id)];
  return {
    sidebar: sanitizeSidebarSection(src.sidebar, DEFAULT_MENU_CONFIG.sidebar, allowedIds),
    mobile_footer: sanitizeMobileFooterSection(src.mobile_footer, DEFAULT_MENU_CONFIG.mobile_footer, allowedIds),
    groups,
    overrides,
    links,
  };
}

/**
 * Per-user personal override. Returns null when the user has no override
 * (falls back to the tenant default). Each section (sidebar / mobile_footer)
 * may be set independently — an unset section falls back to the tenant
 * default for that section only. The personal layer stays focused on
 * order/visibility only (no custom groups/links/labels of its own); `allowedIds`
 * should include the tenant's current custom link ids (in addition to
 * NAV_ITEM_IDS) so a user can still reorder/hide those links personally.
 */
export function sanitizePersonalMenuConfig(raw, allowedIds = NAV_ITEM_IDS) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  if (raw.sidebar && typeof raw.sidebar === 'object') {
    out.sidebar = sanitizeSidebarSection(raw.sidebar, { order: [], hidden: [] }, allowedIds);
  }
  if (raw.mobile_footer && typeof raw.mobile_footer === 'object') {
    out.mobile_footer = sanitizeMobileFooterSection(raw.mobile_footer, { items: [], max: MOBILE_FOOTER_DEFAULT_MAX }, allowedIds);
  }
  return Object.keys(out).length ? out : null;
}
