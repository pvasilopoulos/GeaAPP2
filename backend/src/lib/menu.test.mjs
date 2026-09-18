import {
  NAV_ITEM_IDS, DEFAULT_MENU_CONFIG, DEFAULT_SIDEBAR_ORDER, DEFAULT_MOBILE_FOOTER_ITEMS,
  MOBILE_FOOTER_MIN_MAX, MOBILE_FOOTER_MAX_MAX,
  sanitizeMenuConfig, sanitizePersonalMenuConfig,
} from './menu.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Untouched tenant → unchanged behaviour (matches current hardcoded nav).
const defaults = sanitizeMenuConfig(null);
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

console.log('menu.test.mjs ok');
