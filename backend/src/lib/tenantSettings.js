import { mergeMessaging } from './messaging.js';

export const APP_SETTING_KEYS = [
  'default_country', 'date_format', 'week_starts_on',
  'default_customer_status', 'require_email', 'strict_duplicates',
  'voice_lang', 'allow_vip', 'map_provider', 'view_preferences',
  'quote_api',
];

export const MAP_PROVIDER_IDS = ['google', 'osm', 'apple', 'bing'];

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
  quote_api: {
    url: '',
    method: 'POST',
    body_template: '{"customerId":"{{customerId}}","branchId":"{{branchId}}","referenceStartYear":"{{referenceStartYear}}","referenceEndYear":"{{referenceEndYear}}","paymentDueDate":"{{paymentDueDate}}"}',
    headers: '{}',
    response_path: 'lines',
  },
  google_maps_api_key: '',
  view_preferences: {
    customer_profile: {
      default_tab: 'overview',
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

export function mergeTenantSettings(raw) {
  const parsed = parseJson(raw, {}) || {};
  const map_provider = MAP_PROVIDER_IDS.includes(parsed.map_provider) ? parsed.map_provider : DEFAULT_TENANT_SETTINGS.map_provider;
  const google_maps_api_key = parsed.google_maps_api_key == null ? '' : String(parsed.google_maps_api_key);
  const rawViews = parsed.view_preferences && typeof parsed.view_preferences === 'object' ? parsed.view_preferences : {};
  return {
    ...DEFAULT_TENANT_SETTINGS,
    ...parsed,
    map_provider,
    google_maps_api_key,
    view_preferences: {
      customer_profile: {
        ...DEFAULT_TENANT_SETTINGS.view_preferences.customer_profile,
        ...(rawViews.customer_profile || {}),
        tabs: Array.isArray(rawViews.customer_profile?.tabs)
          ? rawViews.customer_profile.tabs.map((tab, index) => ({ ...tab, order: tab.order ?? index }))
          : DEFAULT_TENANT_SETTINGS.view_preferences.customer_profile.tabs,
      },
      branch_detail: { ...DEFAULT_TENANT_SETTINGS.view_preferences.branch_detail, ...(rawViews.branch_detail || {}) },
    },
    messaging: mergeMessaging(parsed.messaging),
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
