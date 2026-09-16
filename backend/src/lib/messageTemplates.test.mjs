import { buildTemplateContext, resolveTemplate, templateVariables } from './messageTemplates.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const ctx = buildTemplateContext({
  customer: { first_name: 'Μαρία', last_name: 'Παπαδοπούλου', code: 'C-42', city: 'Βόλος', company: '' },
  branch: { name: 'Κέντρο', address_line: 'Ερμού 10', postal_code: '38221', area: 'Παλιά', city: 'Βόλος', phone: '2421000000' },
  tenant: { name: 'Gaia', contact_phone: '2100000000' },
  user: { fullName: 'Πρόδρομος Β.' },
  customFields: { loyalty_tier: 'Gold', empty_field: '' },
});

assert(ctx['customer.full_name'] === 'Μαρία Παπαδοπούλου', 'full name composed from parts');
assert(ctx['branch.address'] === 'Ερμού 10, 38221, Βόλος', 'branch address prefers the postal code');
assert(ctx['cf.loyalty_tier'] === 'Gold', 'custom fields are addressable');
assert(/^\d{2}\/\d{2}\/\d{4}$/.test(ctx['date.today']), 'today is greek-formatted');

assert(resolveTemplate('Γεια {{customer.first_name}}!', ctx) === 'Γεια Μαρία!', 'substitutes a value');
assert(resolveTemplate('{{ customer.code }}', ctx) === 'C-42', 'tolerates inner spaces');
assert(resolveTemplate('Βαθμίδα: {{cf.loyalty_tier}}', ctx) === 'Βαθμίδα: Gold', 'substitutes a custom field');

// A half-filled record must never leak template syntax to a customer.
assert(resolveTemplate('Εταιρεία: {{customer.company}}', ctx) === 'Εταιρεία: ', 'empty value collapses');
assert(resolveTemplate('Εταιρεία: {{customer.company|—}}', ctx) === 'Εταιρεία: —', 'fallback is used when empty');
assert(resolveTemplate('{{cf.empty_field|κανένα}}', ctx) === 'κανένα', 'blank custom field uses the fallback');
assert(resolveTemplate('{{totally.unknown}}', ctx) === '', 'unknown key resolves to nothing');
assert(resolveTemplate('{{totally.unknown|—}}', ctx) === '—', 'unknown key can still have a fallback');
assert(resolveTemplate('τίποτα εδώ', ctx) === 'τίποτα εδώ', 'plain text passes through');

const vars = templateVariables('Γεια {{customer.first_name}}, {{cf.loyalty_tier|—}} και {{customer.first_name}}');
assert(vars.length === 2, 'variables are listed once each');
assert(vars.includes('customer.first_name') && vars.includes('cf.loyalty_tier'), 'variable names extracted');

console.log('messageTemplates: ok');
