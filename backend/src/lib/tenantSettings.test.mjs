import { slugify, mergeTenantSettings, publicAppSettings } from './tenantSettings.js';

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

console.log('tenantSettings slugify: ok');
