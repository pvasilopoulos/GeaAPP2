import { resolveSidebarMenu, resolveSidebarGroups, resolveMobileFooterMenu } from './menu.js';
import { NAV_ITEM_IDS, DEFAULT_SIDEBAR_ORDER, DEFAULT_MOBILE_FOOTER_ITEMS } from './navCatalog.js';
import { PERMS } from './perms.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const allPerm = () => true;
const noQuotesNoSettings = (p) => p !== PERMS.QUOTES_VIEW && p !== PERMS.SETTINGS_MANAGE && p !== PERMS.USERS_MANAGE
  && p !== PERMS.ROLES_MANAGE && p !== PERMS.TENANT_MANAGE && p !== PERMS.TENANTS_PLATFORM;

// --- Backward compatibility: no config at all → identical to today's fixed nav.
{
  const { items, isDefault } = resolveSidebarMenu({ tenantMenu: null, userMenu: null, hasPerm: allPerm });
  assert(isDefault, 'no config => default sidebar');
  assert(JSON.stringify(items.map((i) => i.id)) === JSON.stringify(DEFAULT_SIDEBAR_ORDER), 'default sidebar order matches catalog order');
  const groups = resolveSidebarGroups({ items });
  assert(groups.length === 4, 'default grouping preserved (4 groups)');
  assert(groups[0].id === 'workspace' && groups[0].items[0].id === 'dashboard', 'group order preserved');
}

// --- Permissions always filter first, regardless of any config.
{
  const { items } = resolveSidebarMenu({ tenantMenu: null, userMenu: null, hasPerm: noQuotesNoSettings });
  assert(!items.some((i) => i.id === 'quotes'), 'quotes hidden without permission');
  assert(!items.some((i) => i.id === 'settings'), 'settings hidden without permission');
}
{
  // Even if tenant/user config tries to show a permission-gated item, it must never appear.
  const tenantMenu = { sidebar: { order: ['quotes', 'dashboard'], hidden: [] } };
  const { items } = resolveSidebarMenu({ tenantMenu, userMenu: null, hasPerm: noQuotesNoSettings });
  assert(!items.some((i) => i.id === 'quotes'), 'config cannot bypass missing permission');
}

// --- Tenant-wide default reordering/hiding is respected.
{
  const tenantMenu = { sidebar: { order: ['settings', 'dashboard', 'customers'], hidden: ['bookings'] } };
  const { items, isDefault } = resolveSidebarMenu({ tenantMenu, userMenu: null, hasPerm: allPerm });
  assert(!isDefault, 'customized tenant config is not the default');
  assert(items[0].id === 'settings', 'tenant order respected');
  assert(!items.some((i) => i.id === 'bookings'), 'tenant hidden respected');
  // Items not mentioned in a partial order are still shown (appended), nothing silently lost.
  assert(items.some((i) => i.id === 'reports'), 'items missing from order still appear');
}

// --- Personal override wins over tenant default when set.
{
  const tenantMenu = { sidebar: { order: ['settings', 'dashboard'], hidden: ['bookings'] } };
  const userMenu = { sidebar: { order: ['customers', 'dashboard'], hidden: [] } };
  const { items } = resolveSidebarMenu({ tenantMenu, userMenu, hasPerm: allPerm });
  assert(items[0].id === 'customers', 'personal order overrides tenant order');
  assert(items.some((i) => i.id === 'bookings'), 'personal (empty hidden) overrides tenant hidden entirely');
}

// --- Personal override can target only one section, leaving the other to fall back to tenant.
{
  const tenantMenu = { sidebar: { order: ['settings', 'dashboard'], hidden: [] }, mobile_footer: { items: ['settings'], max: 3 } };
  const userMenu = { mobile_footer: { items: ['customers'], max: 3 } };
  const sidebar = resolveSidebarMenu({ tenantMenu, userMenu, hasPerm: allPerm });
  assert(sidebar.items[0].id === 'settings', 'sidebar falls back to tenant default when user has no sidebar override');
  const footer = resolveMobileFooterMenu({ tenantMenu, userMenu, hasPerm: allPerm });
  assert(footer[0].id === 'customers', 'mobile footer uses personal override independent of sidebar');
}

// --- Mobile footer default subset, capped and permission-filtered.
{
  const footer = resolveMobileFooterMenu({ tenantMenu: null, userMenu: null, hasPerm: allPerm });
  assert(JSON.stringify(footer.map((i) => i.id)) === JSON.stringify(DEFAULT_MOBILE_FOOTER_ITEMS), 'default footer matches curated subset');
}
{
  const footer = resolveMobileFooterMenu({ tenantMenu: null, userMenu: null, hasPerm: noQuotesNoSettings });
  assert(!footer.some((i) => i.id === 'settings'), 'footer respects permissions');
  assert(footer.length <= 5, 'footer stays within bound');
  assert(footer.length > 0, 'footer backfills with permitted items when defaults are gated out');
}
{
  const tenantMenu = { mobile_footer: { items: NAV_ITEM_IDS, max: 3 } };
  const footer = resolveMobileFooterMenu({ tenantMenu, userMenu: null, hasPerm: allPerm });
  assert(footer.length === 3, 'footer capped to configured max');
}

console.log('menu.test.mjs (frontend) ok');
