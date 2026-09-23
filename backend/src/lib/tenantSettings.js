import { mergeMessaging } from './messaging.js';
import { mergeReminderSettings } from './reminderSettings.js';
import { DEFAULT_MENU_CONFIG, sanitizeMenuConfig } from './menu.js';

export const APP_SETTING_KEYS = [
  'default_country', 'date_format', 'week_starts_on',
  'default_customer_status', 'require_email', 'strict_duplicates',
  'voice_lang', 'allow_vip', 'map_provider', 'view_preferences',
  'quote_api', 'quote_push_api', 'app_name', 'browser_tab_title', 'branding',
];

// Data-URI images accepted for branding fields (logo/favicon/icons/push
// icon+badge). Kept generous but bounded so a tenant can't bloat the
// `tenants.settings` JSON column with huge uploads — ~260KB decoded per image.
const BRANDING_IMAGE_MAX_LENGTH = 350000;
const BRANDING_IMAGE_FIELDS = [
  'logo_url', 'favicon_url', 'apple_touch_icon_url',
  'pwa_icon_192', 'pwa_icon_512', 'push_icon_url', 'push_badge_url',
];
const DATA_URI_IMAGE_RE = /^data:image\/(png|jpeg|jpg|webp|svg\+xml|x-icon);base64,[A-Za-z0-9+/]+=*$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

export const MAP_PROVIDER_IDS = ['google', 'osm', 'apple', 'bing'];
const CUSTOMER_ROW_HEIGHT_MIN = 44;
const CUSTOMER_ROW_HEIGHT_MAX = 180;
const APP_NAME_MAX_LENGTH = 60;
const BROWSER_TAB_TITLE_MAX_LENGTH = 100;

export const DEFAULT_TENANT_SETTINGS = {
  default_country: 'Ελλάδα',
  date_format: 'DD/MM/YYYY',
  week_starts_on: 1,
  default_customer_status: 'active',
  require_email: false,
  strict_duplicates: false,
  voice_lang: 'el-GR',
  allow_vip: true,
  map_provider: 'google',
  // App-wide branding text (distinct from the tenant/organization name in `tenants.name`).
  app_name: 'SpaceHub',
  browser_tab_title: 'SpaceHub — Διαχείριση Πελατών',
  // Per-tenant logos/icons. Images are stored as data URIs (like
  // google_maps_api_key, no upload/file-storage infra needed) and served at
  // stable, unauthenticated URLs by routes/branding.js — that route falls
  // back to the shipped defaults in public/app-icons when a field is empty,
  // so the sidebar, favicon, PWA manifest and Web Push icon/badge all degrade
  // gracefully for tenants that haven't customized anything.
  branding: {
    logo_url: '',
    favicon_url: '',
    apple_touch_icon_url: '',
    pwa_icon_192: '',
    pwa_icon_512: '',
    push_icon_url: '',
    push_badge_url: '',
    theme_color: '#4f46e5',
    background_color: '#f6f7f9',
  },
  quote_api: {
    enabled: true,
    url: '',
    method: 'POST',
    body_template: '{"customerId":"{{customerId}}","customerErpId":"{{customerErpId}}","customerCode":"{{customerCode}}","customerName":"{{customerName}}","customerCompany":"{{customerCompany}}","customerTaxId":"{{customerTaxId}}","customerEmail":"{{customerEmail}}","customerPhone":"{{customerPhone}}","branchId":"{{branchId}}","branchErpId":"{{branchErpId}}","branchCode":"{{branchCode}}","branchName":"{{branchName}}","branchCity":"{{branchCity}}","branchAddress":"{{branchAddress}}","series":"{{series}}","quoteNumber":"{{quoteNumber}}","quoteDate":"{{quoteDate}}","validUntil":"{{validUntil}}","paymentTerms":"{{paymentTerms}}","sellerId":"{{sellerId}}","referenceStartYear":"{{referenceStartYear}}","referenceEndYear":"{{referenceEndYear}}","paymentDueDate":"{{paymentDueDate}}"}',
    headers: '{}',
    response_path: 'data.lines',
    line_field_mappings: {},
    response_encoding: 'auto',
    timeout_ms: 30000,
    auth: { type: 'none', token: '', username: '', password: '', api_key_name: '', api_key_value: '', api_key_in: 'header' },
    debug: false,
  },
  // Reverse direction of quote_api: pushes a finalized quote (header + lines)
  // TO the ERP when the user clicks "Αποστολή στο ERP" on a quote. Uses the
  // same {{field}} templating engine as connectors' two-way sync
  // (renderPushTemplate in pushSync.js) — {{lines}} expands to the full JSON
  // array of quote lines, every other placeholder is a scalar header field.
  quote_push_api: {
    enabled: true,
    url: '',
    method: 'POST',
    headers: '{}',
    body_template: JSON.stringify({
      series: '{{series}}', number: '{{quoteNumber}}', date: '{{quoteDate}}', validUntil: '{{validUntil}}', status: '{{status}}',
      customer: { id: '{{customerId}}', erpId: '{{customerErpId}}', name: '{{customerName}}', company: '{{customerCompany}}' },
      branch: { id: '{{branchId}}', erpId: '{{branchErpId}}', name: '{{branchName}}' },
      seller: '{{sellerId}}',
      paymentTerms: '{{paymentTerms}}', paymentDueDate: '{{paymentDueDate}}',
      referenceStartYear: '{{referenceStartYear}}', referenceEndYear: '{{referenceEndYear}}',
      totals: { subtotal: '{{subtotal}}', tax: '{{taxTotal}}', total: '{{total}}' },
      lines: '{{lines}}',
    }, null, 2)
      // JSON.stringify above quotes the placeholders (needed so the object is
      // itself valid JSON); strip those quotes so renderPushTemplate's
      // JSON.stringify(value) substitution produces correctly-typed output.
      .replace(/"(\{\{[\w.]+}})"/g, '$1'),
    response_id_path: 'id',
    timeout_ms: 30000,
    auth: { type: 'none', token: '', username: '', password: '', api_key_name: '', api_key_value: '', api_key_in: 'header' },
    debug: false,
  },
  google_maps_api_key: '',
  // Tenant-wide default sidebar/mobile-footer nav configuration. Defaults
  // mirror the current hardcoded nav so untouched tenants are unaffected.
  menu: DEFAULT_MENU_CONFIG,
  view_preferences: {
    customer_profile: {
      default_tab: 'overview',
      customer_list_row_height: 68,
      show_contacts: true,
      show_branches: true,
      show_bookings: true,
      show_payments: true,
      show_communications: true,
      show_documents: true,
      show_notes: true,
      show_activity: true,
      show_branch_actions: true,
      show_branch_invoices: true,
      tabs: [
        { key: 'overview', label: 'Σύνοψη', icon: 'home', group: 'Πελάτης', enabled: true },
        { key: 'contacts', label: 'Επαφές', icon: 'users', group: 'Πελάτης', enabled: true },
        { key: 'branches', label: 'Υποκαταστήματα & Χώροι', icon: 'building', group: 'Πελάτης', enabled: true },
        { key: 'bookings', label: 'Κρατήσεις', icon: 'calendar', group: 'Συναλλαγές', enabled: true },
        { key: 'payments', label: 'Πληρωμές', icon: 'wallet', group: 'Συναλλαγές', enabled: true },
        { key: 'communications', label: 'Επικοινωνίες', icon: 'message', group: 'Επικοινωνία', enabled: true },
        { key: 'documents', label: 'Έγγραφα', icon: 'file', group: 'Επικοινωνία', enabled: true },
        { key: 'notes', label: 'Σημειώσεις', icon: 'note', group: 'Επικοινωνία', enabled: true },
        { key: 'activity', label: 'Δραστηριότητα', icon: 'activity', group: 'Επικοινωνία', enabled: true },
        { key: 'branch_actions', label: 'Ενέργειες ανά υποκατάστημα', icon: 'activity', group: 'Συναλλαγές', enabled: true },
        { key: 'branch_invoices', label: 'Τιμολόγια ανά υποκατάστημα', icon: 'file', group: 'Συναλλαγές', enabled: true },
      ],
    },
    branch_detail: {
      branch_expanded: false,
      show_hours: false,
      show_map: false,
      show_kpis: true,
      show_spaces: true,
      show_visits: true,
      spaces_expanded: false,
      visits_expanded: false,
    },
  },
};

export const DEFAULT_PLATFORM_SETTINGS = {
  allow_self_register: true,
  min_password_length: 6,
};

export const TENANT_STATUSES = ['active', 'trial', 'suspended'];
export const PLANS = ['trial', 'standard', 'business', 'enterprise'];

export function parseJson(v, fallback) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return fallback; }
  }
  return fallback;
}

// Deep-merges a persisted quote_api/quote_push_api config with its defaults so
// tenants that saved a config before new fields (auth, timeout_ms, debug,
// enabled…) were introduced still get sane defaults for the missing ones,
// instead of losing them entirely to the top-level shallow spread below.
function mergeErpConfig(defaultConfig, saved) {
  const cfg = saved && typeof saved === 'object' ? saved : {};
  return {
    ...defaultConfig,
    ...cfg,
    auth: { ...defaultConfig.auth, ...(cfg.auth && typeof cfg.auth === 'object' ? cfg.auth : {}) },
  };
}

function sanitizeBrandingText(value, fallback, maxLength) {
  if (value == null) return fallback;
  const trimmed = String(value).trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function sanitizeBrandingImage(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed || trimmed.length > BRANDING_IMAGE_MAX_LENGTH) return '';
  return DATA_URI_IMAGE_RE.test(trimmed) ? trimmed : '';
}

function sanitizeBrandingColor(value, fallback) {
  if (value == null) return fallback;
  const trimmed = String(value).trim();
  return HEX_COLOR_RE.test(trimmed) ? trimmed : fallback;
}

// Validates/clamps a saved `branding` object: unknown or malformed image
// values (not a small `data:image/...;base64,...` string) are dropped back to
// empty (→ default asset), invalid colors fall back to the tenant's current
// theme/background color.
export function sanitizeBranding(raw, base = DEFAULT_TENANT_SETTINGS.branding) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const field of BRANDING_IMAGE_FIELDS) out[field] = sanitizeBrandingImage(src[field]);
  out.theme_color = sanitizeBrandingColor(src.theme_color, base.theme_color);
  out.background_color = sanitizeBrandingColor(src.background_color, base.background_color);
  return out;
}

export function mergeTenantSettings(raw) {
  const parsed = parseJson(raw, {}) || {};
  const map_provider = MAP_PROVIDER_IDS.includes(parsed.map_provider) ? parsed.map_provider : DEFAULT_TENANT_SETTINGS.map_provider;
  const google_maps_api_key = parsed.google_maps_api_key == null ? '' : String(parsed.google_maps_api_key);
  const app_name = sanitizeBrandingText(parsed.app_name, DEFAULT_TENANT_SETTINGS.app_name, APP_NAME_MAX_LENGTH);
  const browser_tab_title = sanitizeBrandingText(parsed.browser_tab_title, DEFAULT_TENANT_SETTINGS.browser_tab_title, BROWSER_TAB_TITLE_MAX_LENGTH);
  const rawViews = parsed.view_preferences && typeof parsed.view_preferences === 'object' ? parsed.view_preferences : {};
  const customerProfile = rawViews.customer_profile || {};
  const requestedRowHeight = Number(customerProfile.customer_list_row_height);
  const customer_list_row_height = Number.isFinite(requestedRowHeight)
    ? Math.min(CUSTOMER_ROW_HEIGHT_MAX, Math.max(CUSTOMER_ROW_HEIGHT_MIN, requestedRowHeight))
    : DEFAULT_TENANT_SETTINGS.view_preferences.customer_profile.customer_list_row_height;
  return {
    ...DEFAULT_TENANT_SETTINGS,
    ...parsed,
    map_provider,
    google_maps_api_key,
    app_name,
    browser_tab_title,
    view_preferences: {
      customer_profile: {
        ...DEFAULT_TENANT_SETTINGS.view_preferences.customer_profile,
        ...customerProfile,
        customer_list_row_height,
        tabs: Array.isArray(rawViews.customer_profile?.tabs)
          ? rawViews.customer_profile.tabs.map((tab, index) => ({ ...tab, order: tab.order ?? index }))
          : DEFAULT_TENANT_SETTINGS.view_preferences.customer_profile.tabs,
      },
      branch_detail: { ...DEFAULT_TENANT_SETTINGS.view_preferences.branch_detail, ...(rawViews.branch_detail || {}) },
    },
    messaging: mergeMessaging(parsed.messaging),
    reminders: mergeReminderSettings(parsed.reminders),
    menu: sanitizeMenuConfig(parsed.menu),
    quote_api: mergeErpConfig(DEFAULT_TENANT_SETTINGS.quote_api, parsed.quote_api),
    quote_push_api: mergeErpConfig(DEFAULT_TENANT_SETTINGS.quote_push_api, parsed.quote_push_api),
    branding: sanitizeBranding(parsed.branding),
  };
}

function pickAppKeys(merged) {
  const out = {};
  for (const k of APP_SETTING_KEYS) out[k] = merged[k];
  return out;
}

export function publicAppSettings(raw) {
  const merged = mergeTenantSettings(raw);
  return {
    ...pickAppKeys(merged),
    google_maps_api_key: '',
    has_google_maps_api_key: !!(merged.google_maps_api_key && String(merged.google_maps_api_key).trim()),
    quote_api: merged.quote_api,
  };
}

/** Settings safe for the logged-in app UI (no messaging secrets). */
export function clientTenantSettings(raw) {
  const merged = mergeTenantSettings(raw);
  return {
    ...pickAppKeys(merged),
    google_maps_api_key: merged.google_maps_api_key || '',
  };
}

export function applyAppSettingsPatch(current, body) {
  const src = body && typeof body === 'object' ? body : {};
  const merged = mergeTenantSettings(current);
  const patch = {};
  for (const k of APP_SETTING_KEYS) {
    if (src[k] !== undefined) patch[k] = k === 'view_preferences'
      ? {
        customer_profile: {
          ...merged.view_preferences.customer_profile,
          ...(src[k]?.customer_profile || {}),
          ...(Array.isArray(src[k]?.customer_profile?.tabs) ? { tabs: src[k].customer_profile.tabs } : {}),
        },
        branch_detail: { ...merged.view_preferences.branch_detail, ...(src[k]?.branch_detail || {}) },
      }
      : k === 'branding'
        ? { ...merged.branding, ...(src[k] || {}) }
        : src[k];
  }
  const next = mergeTenantSettings({ ...merged, ...patch, messaging: merged.messaging });
  const incomingKey = src.google_maps_api_key;
  if (incomingKey !== undefined && incomingKey !== null) {
    const v = String(incomingKey).trim();
    if (v && !v.startsWith('•')) next.google_maps_api_key = v;
  }
  return next;
}

export function slugify(name) {
  const base = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
  return base || 'tenant';
}
