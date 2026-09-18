import { slugify, mergeTenantSettings, publicAppSettings, clientTenantSettings, applyAppSettingsPatch } from './tenantSettings.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(slugify('Demo Α.Ε.') === 'demo', slugify('Demo Α.Ε.'));
assert(slugify('Acme Ltd') === 'acme-ltd', slugify('Acme Ltd'));
assert(slugify('  ') === 'tenant', slugify('  '));

const app = publicAppSettings({ default_country: 'Κύπρος', messaging: { email: { smtp_pass: 'secret' } } });
assert(app.default_country === 'Κύπρος', 'app country');
assert(app.messaging === undefined, 'messaging stripped from app settings');
assert(mergeTenantSettings({}).messaging.email.enabled === true, 'default messaging');
assert(mergeTenantSettings({}).map_provider === 'google', 'default maps');
assert(mergeTenantSettings({ map_provider: 'osm' }).map_provider === 'osm', 'osm maps');
assert(mergeTenantSettings({ map_provider: 'nope' }).map_provider === 'google', 'invalid maps fallback');
assert(publicAppSettings({ map_provider: 'apple' }).map_provider === 'apple', 'app maps key');
assert(publicAppSettings({ google_maps_api_key: 'AIzaSecret' }).google_maps_api_key === '', 'maps key masked');
assert(publicAppSettings({ google_maps_api_key: 'AIzaSecret' }).has_google_maps_api_key === true, 'maps key flag');
assert(clientTenantSettings({ google_maps_api_key: 'AIzaSecret', messaging: { sms: { api_key: 'sms' } } }).google_maps_api_key === 'AIzaSecret', 'client maps key');
assert(clientTenantSettings({ messaging: { sms: { api_key: 'sms' } } }).messaging === undefined, 'messaging stripped from client settings');

const kept = applyAppSettingsPatch({ google_maps_api_key: 'keep-me', map_provider: 'osm' }, { map_provider: 'google', google_maps_api_key: '' });
assert(kept.google_maps_api_key === 'keep-me', 'blank maps key does not wipe');
assert(kept.map_provider === 'google', 'provider still patches');
const updated = applyAppSettingsPatch({ google_maps_api_key: 'keep-me' }, { google_maps_api_key: 'AIzaNew' });
assert(updated.google_maps_api_key === 'AIzaNew', 'maps key updates');
const masked = applyAppSettingsPatch({ google_maps_api_key: 'keep-me' }, { google_maps_api_key: '••••••••' });
assert(masked.google_maps_api_key === 'keep-me', 'bullet placeholder does not wipe');

assert(mergeTenantSettings({}).app_name === 'SpaceHub', 'default app_name');
assert(mergeTenantSettings({}).browser_tab_title === 'SpaceHub — Διαχείριση Πελατών', 'default browser_tab_title');
assert(mergeTenantSettings({ app_name: 'Acme' }).app_name === 'Acme', 'custom app_name kept');
assert(mergeTenantSettings({ app_name: '  ' }).app_name === 'SpaceHub', 'blank app_name falls back to default');
assert(mergeTenantSettings({ app_name: 'a'.repeat(200) }).app_name.length === 60, 'app_name capped to max length');
assert(publicAppSettings({ app_name: 'Acme' }).app_name === 'Acme', 'app_name exposed via publicAppSettings');
const brandedPatch = applyAppSettingsPatch({}, { app_name: 'Acme', browser_tab_title: 'Acme — CRM' });
assert(brandedPatch.app_name === 'Acme', 'patch updates app_name');
assert(brandedPatch.browser_tab_title === 'Acme — CRM', 'patch updates browser_tab_title');

console.log('tenantSettings slugify: ok');
