// Resolves the effective nav menu (desktop sidebar + mobile bottom footer)
// from: the fixed catalog (navCatalog.js) + the tenant-wide default config +
// the current user's personal override + the user's actual permissions.
//
// Resolution order per section (sidebar / mobile_footer):
//   personal override (if set for that section) > tenant default > hardcoded default
//
// Permissions are always applied FIRST and cannot be widened by any config —
// a hidden-by-permission item never appears regardless of order/visibility
// settings, and configuration can only reorder/hide/show items the user
// already has permission to see.
import {
  NAV, NAV_BY_ID, NAV_GROUPS, NAV_ITEM_IDS,
  DEFAULT_SIDEBAR_ORDER, DEFAULT_MOBILE_FOOTER_ITEMS, MOBILE_FOOTER_DEFAULT_MAX,
} from './navCatalog.js';

function isPermitted(item, hasPerm) {
  return !item.perms || item.perms.some((p) => hasPerm(p));
}

function pickSection(personal, tenant, key, fallback) {
  if (personal && personal[key]) return personal[key];
  if (tenant && tenant[key]) return tenant[key];
  return fallback;
}

/**
 * Returns the ordered, permission-filtered, deduped sidebar item list plus
 * whether it matches the untouched hardcoded default (so callers can keep
 * rendering the original grouped UI when nothing has been customized).
 */
export function resolveSidebarMenu({ tenantMenu, userMenu, hasPerm }) {
  const permitted = NAV.filter((n) => isPermitted(n, hasPerm));
  const permittedIds = new Set(permitted.map((n) => n.id));

  const sidebarCfg = pickSection(userMenu, tenantMenu, 'sidebar', { order: DEFAULT_SIDEBAR_ORDER, hidden: [] });
  const order = Array.isArray(sidebarCfg.order) && sidebarCfg.order.length ? sidebarCfg.order : DEFAULT_SIDEBAR_ORDER;
  const hidden = new Set(Array.isArray(sidebarCfg.hidden) ? sidebarCfg.hidden : []);

  const isDefault = !userMenu?.sidebar && !tenantMenu?.sidebar;

  const seen = new Set();
  const items = [];
  for (const id of order) {
    if (!permittedIds.has(id) || hidden.has(id) || seen.has(id)) continue;
    seen.add(id);
    items.push(NAV_BY_ID[id]);
  }
  // Any permitted catalog item missing from a stale/partial order is still
  // shown (appended), so nothing silently disappears when the catalog grows.
  for (const n of permitted) {
    if (!seen.has(n.id) && !hidden.has(n.id)) { seen.add(n.id); items.push(n); }
  }

  return { items, isDefault };
}

/** Same resolved items as resolveSidebarMenu, but grouped like the original hardcoded NAV_GROUPS (used when nothing has been customized). */
export function resolveSidebarGroups({ items }) {
  const byId = new Map(items.map((n) => [n.id, n]));
  return NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.map((id) => byId.get(id)).filter(Boolean) }))
    .filter((group) => group.items.length);
}

/** Resolves the curated subset for the mobile bottom footer bar. */
export function resolveMobileFooterMenu({ tenantMenu, userMenu, hasPerm }) {
  const permitted = NAV.filter((n) => isPermitted(n, hasPerm));
  const permittedIds = new Set(permitted.map((n) => n.id));

  const footerCfg = pickSection(userMenu, tenantMenu, 'mobile_footer', { items: DEFAULT_MOBILE_FOOTER_ITEMS, max: MOBILE_FOOTER_DEFAULT_MAX });
  const configured = Array.isArray(footerCfg.items) && footerCfg.items.length ? footerCfg.items : DEFAULT_MOBILE_FOOTER_ITEMS;
  const max = Number.isFinite(footerCfg.max) ? footerCfg.max : MOBILE_FOOTER_DEFAULT_MAX;

  const seen = new Set();
  const items = [];
  for (const id of configured) {
    if (items.length >= max) break;
    if (!permittedIds.has(id) || seen.has(id) || !NAV_BY_ID[id]) continue;
    seen.add(id);
    items.push(NAV_BY_ID[id]);
  }
  // Backfill from the curated default (then any permitted item) if the
  // configured set left the bar under-populated because of permissions.
  if (items.length < Math.min(max, permitted.length)) {
    for (const id of [...DEFAULT_MOBILE_FOOTER_ITEMS, ...NAV_ITEM_IDS]) {
      if (items.length >= max) break;
      if (!permittedIds.has(id) || seen.has(id)) continue;
      seen.add(id);
      items.push(NAV_BY_ID[id]);
    }
  }
  return items;
}
