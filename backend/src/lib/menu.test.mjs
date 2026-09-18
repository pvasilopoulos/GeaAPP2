import {
  NAV_ITEM_IDS, DEFAULT_MENU_CONFIG, DEFAULT_SIDEBAR_ORDER, DEFAULT_MOBILE_FOOTER_ITEMS,
  MOBILE_FOOTER_MIN_MAX, MOBILE_FOOTER_MAX_MAX, ICON_NAMES,
  sanitizeMenuConfig, sanitizePersonalMenuConfig,
} from './menu.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Untouched tenant → unchanged behaviour (matches current hardcoded nav).
const defaults = sanitizeMenuConfig(null);
assert(NAV_ITEM_IDS.includes('audit'), 'audit id is whitelisted');
assert(!DEFAULT_SIDEBAR_ORDER.includes('audit'), 'audit is not in the default sidebar');
assert(JSON.stringify(defaults.sidebar.order) === JSON.stringify(DEFAULT_SIDEBAR_ORDER), 'default sidebar order matches current nav');
assert(defaults.sidebar.hidden.length === 0, 'default sidebar hidden is empty');
assert(JSON.stringify(defaults.mobile_footer.items) === JSON.stringify(DEFAULT_MOBILE_FOOTER_ITEMS), 'default mobile footer matches curated subset');
assert(defaults.mobile_footer.items.length <= MOBILE_FOOTER_MAX_MAX, 'default footer within max');

// Reordering / hiding known ids is respected.
const custom = sanitizeMenuConfig({
  sidebar: { order: ['settings', 'dashboard'], hidden: ['quotes'] },
  mobile_footer: { items: ['dashboard', 'settings'], max: 4 },
});
assert(custom.sidebar.order[0] === 'settings', 'custom order kept');
assert(custom.sidebar.hidden.includes('quotes'), 'custom hidden kept');
assert(custom.mobile_footer.max === 4, 'custom footer max kept');

// Arbitrary / unknown ids are dropped — no custom menu entries allowed.
const withJunk = sanitizeMenuConfig({
  sidebar: { order: ['dashboard', 'not-a-real-id', 'dashboard'], hidden: ['bogus'] },
  mobile_footer: { items: ['dashboard', 'bogus-item', 'bogus-item'] },
});
assert(withJunk.sidebar.order.length === 1 && withJunk.sidebar.order[0] === 'dashboard', 'unknown/duplicate ids stripped from order');
assert(withJunk.sidebar.hidden.length === 0, 'unknown id stripped from hidden');
assert(withJunk.mobile_footer.items.length === 1, 'unknown/duplicate id stripped from footer items');

// Mobile footer max is clamped to a sensible bound.
const clampedHigh = sanitizeMenuConfig({ mobile_footer: { items: NAV_ITEM_IDS, max: 99 } });
assert(clampedHigh.mobile_footer.max === MOBILE_FOOTER_MAX_MAX, 'max clamped to upper bound');
assert(clampedHigh.mobile_footer.items.length === MOBILE_FOOTER_MAX_MAX, 'footer items truncated to clamped max');
const clampedLow = sanitizeMenuConfig({ mobile_footer: { max: 0 } });
assert(clampedLow.mobile_footer.max === MOBILE_FOOTER_MIN_MAX, 'max clamped to lower bound');

// Personal preference: null / empty input means "no override" (fall back to tenant default).
assert(sanitizePersonalMenuConfig(null) === null, 'null personal pref stays null');
assert(sanitizePersonalMenuConfig({}) === null, 'empty personal pref normalizes to null');
assert(sanitizePersonalMenuConfig('not-an-object') === null, 'non-object personal pref normalizes to null');

// Personal preference can override just one section, leaving the other unset
// (resolver falls back to tenant default for the untouched section).
const partial = sanitizePersonalMenuConfig({ mobile_footer: { items: ['customers', 'settings'] } });
assert(partial.sidebar === undefined, 'sidebar left unset when not provided');
assert(JSON.stringify(partial.mobile_footer.items) === JSON.stringify(['customers', 'settings']), 'personal footer override kept');

// Personal preference is independently sanitized against the same catalog.
const personalJunk = sanitizePersonalMenuConfig({ sidebar: { order: ['customers', 'nope'], hidden: ['nope'] } });
assert(personalJunk.sidebar.order.length === 1 && personalJunk.sidebar.order[0] === 'customers', 'personal order sanitized');
assert(personalJunk.sidebar.hidden.length === 0, 'personal hidden sanitized');

// DEFAULT_MENU_CONFIG itself is a valid, already-sanitized shape.
assert(JSON.stringify(sanitizeMenuConfig(DEFAULT_MENU_CONFIG)) === JSON.stringify(DEFAULT_MENU_CONFIG), 'DEFAULT_MENU_CONFIG is idempotent under sanitization');

// Backward compatible with the untouched shape: groups/overrides/links default empty.
assert(Array.isArray(defaults.groups) && defaults.groups.length === 0, 'defaults have no groups');
assert(JSON.stringify(defaults.overrides) === '{}', 'defaults have no overrides');
assert(Array.isArray(defaults.links) && defaults.links.length === 0, 'defaults have no links');

// --- Custom groups -----------------------------------------------------------
{
  const cfg = sanitizeMenuConfig({
    groups: [
      { id: 'docs', label: 'Έγγραφα & Σύνδεσμοι' },
      { id: 'docs', label: 'duplicate id ignored' },
      { id: 'Bad Id!', label: 'invalid id dropped' },
      { id: 'restricted', label: 'Only managers', roles: ['manager', 'not-real'] },
    ],
  }, { validRoleKeys: ['owner', 'admin', 'manager'] });
  assert(cfg.groups.length === 2, 'duplicate/invalid group ids dropped');
  assert(cfg.groups[0].id === 'docs' && cfg.groups[0].label === 'Έγγραφα & Σύνδεσμοι', 'valid group kept');
  assert(cfg.groups[1].roles && cfg.groups[1].roles.length === 1 && cfg.groups[1].roles[0] === 'manager', 'unknown role key rejected from group roles');
}

// --- Per-item label/icon overrides (id/type/perms stay authoritative) -------
{
  const cfg = sanitizeMenuConfig({
    overrides: {
      customers: { label: 'Πελατολόγιο', icon: 'star', roles: ['owner'] },
      'not-a-real-id': { label: 'ignored' },
      quotes: { icon: 'not-a-real-icon' },
    },
  }, { validRoleKeys: ['owner', 'admin'] });
  assert(cfg.overrides.customers.label === 'Πελατολόγιο', 'label override kept');
  assert(cfg.overrides.customers.icon === 'star', 'icon override kept when in whitelist');
  assert(!cfg.overrides['not-a-real-id'], 'override for unknown catalog id dropped');
  assert(!cfg.overrides.quotes || !cfg.overrides.quotes.icon, 'icon override rejected when not in ICON_NAMES whitelist');
  assert(ICON_NAMES.includes('star') && !ICON_NAMES.includes('not-a-real-icon'), 'icon whitelist sanity check');
}

// --- Custom external links --------------------------------------------------
{
  const cfg = sanitizeMenuConfig({
    links: [
      { id: 'docs-site', label: 'Τεκμηρίωση', icon: 'globe', url: 'https://docs.example.com/help' },
      { label: 'no id provided', icon: 'file', url: 'https://example.com' },
      { label: 'bad url', url: 'javascript:alert(1)' },
      { label: 'ftp url', url: 'ftp://example.com/file' },
      { label: '', url: 'https://example.com' },
    ],
  });
  assert(cfg.links.length === 2, 'invalid links (bad url / empty label) dropped, valid ones kept with generated ids');
  assert(cfg.links[0].id === 'docs-site', 'explicit valid id kept');
  assert(cfg.links[1].id && cfg.links[1].id !== 'docs-site', 'missing id generated uniquely');
  assert(cfg.links.every((l) => l.url.startsWith('http')), 'only http(s) urls accepted');
}

// --- Group id whitelist applies to overrides/links group_id reassignment ---
{
  const cfg = sanitizeMenuConfig({
    groups: [{ id: 'docs', label: 'Docs' }],
    overrides: { customers: { group_id: 'docs' }, quotes: { group_id: 'no-such-group' } },
    links: [{ id: 'lnk', label: 'Link', url: 'https://a.example.com', group_id: 'workspace' }, { id: 'lnk2', label: 'Link2', url: 'https://b.example.com', group_id: 'bogus' }],
  });
  assert(cfg.overrides.customers.group_id === 'docs', 'custom group id accepted for override');
  assert(!cfg.overrides.quotes || !cfg.overrides.quotes.group_id, 'unknown group id rejected for override');
  assert(cfg.links[0].group_id === 'workspace', 'built-in group id accepted for link reassignment');
  assert(cfg.links[1].group_id === null, 'unknown group id rejected for link, falls back to null (ungrouped)');
}

// --- Link ids become valid sidebar/mobile_footer order/hidden entries ------
{
  const cfg = sanitizeMenuConfig({
    links: [{ id: 'docs-link', label: 'Docs', url: 'https://example.com' }],
    sidebar: { order: ['docs-link', 'dashboard'], hidden: [] },
    mobile_footer: { items: ['docs-link'], max: 3 },
  });
  assert(cfg.sidebar.order[0] === 'docs-link', 'link id allowed in sidebar order');
  assert(cfg.mobile_footer.items.includes('docs-link'), 'link id allowed in mobile footer items');
}

// --- Personal override sanitization accepts an extended allowed-id set -----
{
  const personal = sanitizePersonalMenuConfig({ sidebar: { order: ['custom-link', 'dashboard'], hidden: [] } }, [...NAV_ITEM_IDS, 'custom-link']);
  assert(personal.sidebar.order.includes('custom-link'), 'personal sanitizer respects extended allowedIds for tenant links');
  const personalDefault = sanitizePersonalMenuConfig({ sidebar: { order: ['custom-link', 'dashboard'], hidden: [] } });
  assert(!personalDefault.sidebar.order.includes('custom-link'), 'personal sanitizer defaults to NAV_ITEM_IDS only when allowedIds omitted');
}

console.log('menu.test.mjs ok');
