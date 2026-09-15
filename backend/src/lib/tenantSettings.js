import { mergeMessaging } from './messaging.js';

export const APP_SETTING_KEYS = [
  'default_country', 'date_format', 'week_starts_on',
  'default_customer_status', 'require_email', 'strict_duplicates',
  'voice_lang', 'allow_vip', 'map_provider',
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
  return {
    ...DEFAULT_TENANT_SETTINGS,
    ...parsed,
    map_provider,
    messaging: mergeMessaging(parsed.messaging),
  };
}

export function publicAppSettings(raw) {
  const merged = mergeTenantSettings(raw);
  const out = {};
  for (const k of APP_SETTING_KEYS) out[k] = merged[k];
  return out;
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
