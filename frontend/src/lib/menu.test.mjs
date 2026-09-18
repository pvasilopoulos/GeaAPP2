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
  const { items, isDefault } = resolveSidebarMenu({ tenantMenu: null, userMenu: null, hasPerm: allPerm, roleKey: 'owner' });
  assert(isDefault, 'no config => default sidebar');
  assert(NAV_ITEM_IDS.includes('audit'), 'audit id is whitelisted');
  assert(!DEFAULT_SIDEBAR_ORDER.includes('audit'), 'audit is not in the default sidebar');
  assert(JSON.stringify(items.map((i) => i.id)) === JSON.stringify(DEFAULT_SIDEBAR_ORDER), 'default sidebar order matches catalog order');
  assert(!items.some((i) => i.id === 'audit'), 'default sidebar does not auto-append audit');
  const groups = resolveSidebarGroups({ tenantMenu: null, items });
  assert(groups.length === 4, 'default grouping preserved (4 groups)');
  assert(groups[0].id === 'workspace' && groups[0].items[0].id === 'dashboard', 'group order preserved');
}

// --- Permissions always filter first, regardless of any config.
{
  const { items } = resolveSidebarMenu({ tenantMenu: null, userMenu: null, hasPerm: noQuotesNoSettings, roleKey: 'owner' });
  assert(!items.some((i) => i.id === 'quotes'), 'quotes hidden without permission');
  assert(!items.some((i) => i.id === 'settings'), 'settings hidden without permission');
}
{
  // Even if tenant/user config tries to show a permission-gated item, it must never appear.
  const tenantMenu = { sidebar: { order: ['quotes', 'dashboard'], hidden: [] } };
  const { items } = resolveSidebarMenu({ tenantMenu, userMenu: null, hasPerm: noQuotesNoSettings, roleKey: 'owner' });
  assert(!items.some((i) => i.id === 'quotes'), 'config cannot bypass missing permission');
}

// --- Tenant-wide default reordering/hiding is respected.
{
  const tenantMenu = { sidebar: { order: ['settings', 'dashboard', 'customers'], hidden: ['bookings'] } };
  const { items, isDefault } = resolveSidebarMenu({ tenantMenu, userMenu: null, hasPerm: allPerm, roleKey: 'owner' });
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
  const { items } = resolveSidebarMenu({ tenantMenu, userMenu, hasPerm: allPerm, roleKey: 'owner' });
  assert(items[0].id === 'customers', 'personal order overrides tenant order');
  assert(items.some((i) => i.id === 'bookings'), 'personal (empty hidden) overrides tenant hidden entirely');
}

// --- Personal override can target only one section, leaving the other to fall back to tenant.
{
  const tenantMenu = { sidebar: { order: ['settings', 'dashboard'], hidden: [] }, mobile_footer: { items: ['settings'], max: 3 } };
  const userMenu = { mobile_footer: { items: ['customers'], max: 3 } };
  const sidebar = resolveSidebarMenu({ tenantMenu, userMenu, hasPerm: allPerm, roleKey: 'owner' });
  assert(sidebar.items[0].id === 'settings', 'sidebar falls back to tenant default when user has no sidebar override');
  const footer = resolveMobileFooterMenu({ tenantMenu, userMenu, hasPerm: allPerm, roleKey: 'owner' });
  assert(footer[0].id === 'customers', 'mobile footer uses personal override independent of sidebar');
}

// --- Mobile footer default subset, capped and permission-filtered.
{
  const footer = resolveMobileFooterMenu({ tenantMenu: null, userMenu: null, hasPerm: allPerm, roleKey: 'owner' });
  assert(JSON.stringify(footer.map((i) => i.id)) === JSON.stringify(DEFAULT_MOBILE_FOOTER_ITEMS), 'default footer matches curated subset');
}
{
  const footer = resolveMobileFooterMenu({ tenantMenu: null, userMenu: null, hasPerm: noQuotesNoSettings, roleKey: 'owner' });
  assert(!footer.some((i) => i.id === 'settings'), 'footer respects permissions');
  assert(footer.length <= 5, 'footer stays within bound');
  assert(footer.length > 0, 'footer backfills with permitted items when defaults are gated out');
}
{
  const tenantMenu = { mobile_footer: { items: NAV_ITEM_IDS, max: 3 } };
  const footer = resolveMobileFooterMenu({ tenantMenu, userMenu: null, hasPerm: allPerm, roleKey: 'owner' });
  assert(footer.length === 3, 'footer capped to configured max');
}

// --- Role restriction: hides an item/group/link from roles not listed, even
// when the user otherwise has permission (permission check still applies too).
{
  const tenantMenu = { overrides: { customers: { roles: ['owner', 'admin'] } } };
  const asOwner = resolveSidebarMenu({ tenantMenu, userMenu: null, hasPerm: allPerm, roleKey: 'owner' });
  const asAgent = resolveSidebarMenu({ tenantMenu, userMenu: null, hasPerm: allPerm, roleKey: 'agent' });
  assert(asOwner.items.some((i) => i.id === 'customers'), 'role-restricted item visible to an allowed role');
  assert(!asAgent.items.some((i) => i.id === 'customers'), 'role-restricted item hidden from a disallowed role');
}
{
  // A role restriction can never override a missing permission.
  const tenantMenu = { overrides: { quotes: { roles: ['agent'] } } };
  const asAgentNoPerm = resolveSidebarMenu({ tenantMenu, userMenu: null, hasPerm: noQuotesNoSettings, roleKey: 'agent' });
  assert(!asAgentNoPerm.items.some((i) => i.id === 'quotes'), 'role restriction cannot bypass a missing permission');
}

// --- Custom label/icon overrides apply without touching id/type/perms.
{
  const tenantMenu = { overrides: { customers: { label: 'Πελατολόγιο', icon: 'star' } } };
  const { items } = resolveSidebarMenu({ tenantMenu, userMenu: null, hasPerm: allPerm, roleKey: 'owner' });
  const customers = items.find((i) => i.id === 'customers');
  assert(customers.label === 'Πελατολόγιο', 'custom label applied');
  assert(customers.icon === 'star', 'custom icon applied');
  assert(customers.type === 'customers', 'underlying type/route stays authoritative despite cosmetic override');
}

// --- Custom groups: renaming/creating groups and reassigning items.
{
  const tenantMenu = {
    groups: [{ id: 'docs', label: 'Έγγραφα & Σύνδεσμοι' }],
    overrides: { customers: { group_id: 'docs' } },
  };
  const { items } = resolveSidebarMenu({ tenantMenu, userMenu: null, hasPerm: allPerm, roleKey: 'owner' });
  const groups = resolveSidebarGroups({ tenantMenu, items });
  const docsGroup = groups.find((g) => g.id === 'docs');
  assert(docsGroup && docsGroup.label === 'Έγγραφα & Σύνδεσμοι', 'custom group created with custom label');
  assert(docsGroup.items.some((i) => i.id === 'customers'), 'item reassigned into the custom group');
  assert(!groups.find((g) => g.id === 'customers').items.some((i) => i.id === 'customers'), 'item removed from its original built-in group');
}

// --- Custom external links: excluded from perms/internal routing, flagged external, role-restrictable.
{
  const tenantMenu = {
    links: [{ id: 'docs-link', label: 'Τεκμηρίωση', icon: 'globe', url: 'https://docs.example.com', roles: ['owner'] }],
  };
  const asOwner = resolveSidebarMenu({ tenantMenu, userMenu: null, hasPerm: allPerm, roleKey: 'owner' });
  const link = asOwner.items.find((i) => i.id === 'docs-link');
  assert(link, 'custom link appears in resolved sidebar items');
  assert(link.external === true, 'custom link flagged external (must not go through internal tab/routing)');
  assert(link.url === 'https://docs.example.com', 'custom link carries its url');
  assert(!link.type || link.type === 'external-link', 'custom link type is not one of the internal tab types');
  const asAgent = resolveSidebarMenu({ tenantMenu, userMenu: null, hasPerm: allPerm, roleKey: 'agent' });
  assert(!asAgent.items.some((i) => i.id === 'docs-link'), 'custom link respects its own role restriction');
}
{
  // Even without any permission at all, a link with no roles restriction is visible (links carry no internal permission).
  const tenantMenu = { links: [{ id: 'open-link', label: 'Open', url: 'https://example.com' }] };
  const { items } = resolveSidebarMenu({ tenantMenu, userMenu: null, hasPerm: () => false, roleKey: 'viewer' });
  assert(items.some((i) => i.id === 'open-link'), 'unrestricted custom link visible regardless of permissions (it has none to check)');
}

console.log('menu.test.mjs (frontend) ok');
