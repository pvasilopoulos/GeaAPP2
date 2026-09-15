import { slugify } from './tenantSettings.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(slugify('Demo Α.Ε.') === 'demo', slugify('Demo Α.Ε.'));
assert(slugify('Acme Ltd') === 'acme-ltd', slugify('Acme Ltd'));
assert(slugify('  ') === 'tenant', slugify('  '));
console.log('tenantSettings slugify: ok');
