// Resolves the effective nav menu (desktop sidebar + mobile bottom footer)
// from: the fixed catalog (navCatalog.js) + the tenant-wide default config +
// the current user's personal override + the user's actual permissions/role.
//
// Resolution order:
//   1. permission filter (unchanged, first and non-negotiable — a hidden-by-
//      permission item never appears regardless of any config)
//   2. role restriction filter (`roles` field on groups/items/links, checked
//      against the user's roleKey; null/empty roles = visible to all roles)
//   3. tenant-wide config resolves the grouped list: custom groups + per-item
//      label/icon overrides + custom external links
//   4. personal override (order/visibility only) applied on top, per section
//      (sidebar / mobile_footer), exactly as before
import {
  NAV, NAV_GROUPS, NAV_ITEM_IDS,
  DEFAULT_SIDEBAR_ORDER, DEFAULT_MOBILE_FOOTER_ITEMS, MOBILE_FOOTER_DEFAULT_MAX,
} from './navCatalog.js';

const FALLBACK_GROUP_ID = 'other';
const FALLBACK_GROUP_LABEL = 'Άλλα';

function isPermitted(item, hasPerm) {
  return !item.perms || item.perms.some((p) => hasPerm(p));
}

// Custom groups/links/overrides carry an optional `roles` restriction: null
// or empty means visible to every role (still subject to permissions above).
function isRoleAllowed(roles, roleKey) {
  if (!Array.isArray(roles) || !roles.length) return true;
  return roleKey != null && roles.includes(roleKey);
}

function pickSection(personal, tenant, key, fallback) {
  if (personal && personal[key]) return personal[key];
  if (tenant && tenant[key]) return tenant[key];
  return fallback;
}

export function builtinGroupIdFor(itemId) {
  const g = NAV_GROUPS.find((grp) => grp.items.includes(itemId));
  return g ? g.id : null;
}

export { FALLBACK_GROUP_ID, FALLBACK_GROUP_LABEL };

/**
 * Builds the resolved catalog: every built-in nav item (with label/icon/
 * roles/group_id overrides applied — id/type/perms stay authoritative) plus
 * every custom external link (flagged `external: true`, no perms — links
 * carry no internal permission since they aren't tied to app functionality).
 * Returns a plain `{ id: resolvedItem }` map. Exported for reuse by the admin
 * menu editor (frontend/src/pages/settings/MenuPanel.jsx), which needs the
 * same resolved shape (label/icon overrides, links) to preview/edit it.
 */
export function buildResolvedCatalog(tenantMenu) {
  const overrides = tenantMenu?.overrides || {};
  const links = Array.isArray(tenantMenu?.links) ? tenantMenu.links : [];
  const byId = {};
  for (const n of NAV) {
    const ov = overrides[n.id] || {};
    byId[n.id] = {
      ...n,
      label: ov.label || n.label,
      icon: ov.icon || n.icon,
      roles: ov.roles || null,
      group_id: ov.group_id || null,
      external: false,
    };
  }
  for (const l of links) {
    byId[l.id] = {
      id: l.id,
      type: 'external-link',
      label: l.label,
      icon: l.icon || 'globe',
      url: l.url,
      roles: l.roles || null,
      group_id: l.group_id || null,
      external: true,
    };
  }
  return byId;
}

function isPermittedEntry(entry, hasPerm) {
  // Links carry no internal permission — only built-in items are perms-gated.
  return entry.external ? true : isPermitted(entry, hasPerm);
}

/**
 * Returns the ordered, permission-and-role-filtered, deduped sidebar item
 * list plus whether it matches the untouched hardcoded default (so callers
 * can keep rendering the exact original grouped UI when nothing has been
 * customized at all).
 */
export function resolveSidebarMenu({ tenantMenu, userMenu, hasPerm, roleKey }) {
  const byId = buildResolvedCatalog(tenantMenu);
  const allIds = Object.keys(byId);
  const permittedIds = new Set(
    allIds.filter((id) => isPermittedEntry(byId[id], hasPerm) && isRoleAllowed(byId[id].roles, roleKey)),
  );

  const sidebarCfg = pickSection(userMenu, tenantMenu, 'sidebar', { order: DEFAULT_SIDEBAR_ORDER, hidden: [] });
  const order = Array.isArray(sidebarCfg.order) && sidebarCfg.order.length ? sidebarCfg.order : DEFAULT_SIDEBAR_ORDER;
  const hidden = new Set(Array.isArray(sidebarCfg.hidden) ? sidebarCfg.hidden : []);

  const hasTenantCustomization = !!(
    tenantMenu?.groups?.length || Object.keys(tenantMenu?.overrides || {}).length || tenantMenu?.links?.length
  );
  const isDefault = !userMenu?.sidebar && !tenantMenu?.sidebar && !hasTenantCustomization;

  const seen = new Set();
  const items = [];
  for (const id of order) {
    if (!permittedIds.has(id) || hidden.has(id) || seen.has(id)) continue;
    seen.add(id);
    items.push(byId[id]);
  }
  // Any permitted catalog/link item missing from a stale/partial order is
  // still shown (appended), so nothing silently disappears when the catalog
  // (or the set of configured links) grows.
  for (const id of allIds) {
    if (!permittedIds.has(id) || hidden.has(id) || seen.has(id)) continue;
    seen.add(id);
    items.push(byId[id]);
  }

  return { items, isDefault, byId };
}

/**
 * Groups the resolved sidebar items using the tenant's custom `groups` list
 * (which may also rename/reorder built-in group ids) combined with the
 * built-in NAV_GROUPS as a fallback for anything left unconfigured. Falls
 * back to the exact original 4 hardcoded groups when nothing has been
 * customized.
 */
export function resolveSidebarGroups({ tenantMenu, items, includeEmpty = false }) {
  const customGroups = Array.isArray(tenantMenu?.groups) ? tenantMenu.groups : [];
  const labelById = new Map(NAV_GROUPS.map((g) => [g.id, g.label]));
  for (const g of customGroups) labelById.set(g.id, g.label);
  if (!labelById.has(FALLBACK_GROUP_ID)) labelById.set(FALLBACK_GROUP_ID, FALLBACK_GROUP_LABEL);

  // Admin-declared group order first, then any remaining built-in groups in
  // their default order, then the fallback group last.
  const orderIds = [];
  for (const g of customGroups) if (!orderIds.includes(g.id)) orderIds.push(g.id);
  for (const g of NAV_GROUPS) if (!orderIds.includes(g.id)) orderIds.push(g.id);
  if (!orderIds.includes(FALLBACK_GROUP_ID)) orderIds.push(FALLBACK_GROUP_ID);

  const buckets = new Map(orderIds.map((id) => [id, []]));
  for (const item of items) {
    const gid = item.group_id || builtinGroupIdFor(item.id) || FALLBACK_GROUP_ID;
    if (!buckets.has(gid)) buckets.set(gid, []);
    buckets.get(gid).push(item);
  }

  return orderIds
    .map((id) => ({ id, label: labelById.get(id) || id, items: buckets.get(id) || [] }))
    .filter((group) => includeEmpty || group.items.length);
}

/** Resolves the curated subset for the mobile bottom footer bar. */
export function resolveMobileFooterMenu({ tenantMenu, userMenu, hasPerm, roleKey }) {
  const byId = buildResolvedCatalog(tenantMenu);
  const allIds = Object.keys(byId);
  const permittedIds = new Set(
    allIds.filter((id) => isPermittedEntry(byId[id], hasPerm) && isRoleAllowed(byId[id].roles, roleKey)),
  );

  const footerCfg = pickSection(userMenu, tenantMenu, 'mobile_footer', { items: DEFAULT_MOBILE_FOOTER_ITEMS, max: MOBILE_FOOTER_DEFAULT_MAX });
  const configured = Array.isArray(footerCfg.items) && footerCfg.items.length ? footerCfg.items : DEFAULT_MOBILE_FOOTER_ITEMS;
  const max = Number.isFinite(footerCfg.max) ? footerCfg.max : MOBILE_FOOTER_DEFAULT_MAX;

  const seen = new Set();
  const items = [];
  for (const id of configured) {
    if (items.length >= max) break;
    if (!permittedIds.has(id) || seen.has(id) || !byId[id]) continue;
    seen.add(id);
    items.push(byId[id]);
  }
  // Backfill from the curated default (then any permitted item) if the
  // configured set left the bar under-populated because of permissions.
  if (items.length < Math.min(max, permittedIds.size)) {
    for (const id of [...DEFAULT_MOBILE_FOOTER_ITEMS, ...NAV_ITEM_IDS]) {
      if (items.length >= max) break;
      if (!permittedIds.has(id) || seen.has(id)) continue;
      seen.add(id);
      items.push(byId[id]);
    }
  }
  return items;
}
