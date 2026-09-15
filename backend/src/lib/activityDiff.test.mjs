import { diffRecords, formatField, snapshotFields, changeSummary, parseDetails } from './activityDiff.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(formatField('is_vip', 1) === 'Ναι', 'vip yes');
assert(formatField('is_vip', 0) === 'Όχι', 'vip no');
assert(formatField('customer_type', 'company') === 'Εταιρεία', 'company');
assert(formatField('status', 'prospect') === 'Υποψήφιος', 'status');
assert(formatField('city', '') === '—', 'empty');

const changes = diffRecords(
  { city: 'Αθήνα', email: 'a@a.gr', is_vip: 0 },
  { city: 'Βόλος', email: 'a@a.gr', is_vip: 1 },
);
assert(changes.length === 2, `expected 2 changes, got ${changes.length}`);
assert(changes.find((c) => c.field === 'city').from === 'Αθήνα', 'city from');
assert(changes.find((c) => c.field === 'city').to === 'Βόλος', 'city to');
assert(changes.find((c) => c.field === 'is_vip').to === 'Ναι', 'vip to');

assert(diffRecords({ city: 'Αθήνα' }, { city: 'Αθήνα' }).length === 0, 'no-op');

const snap = snapshotFields({ first_name: 'Μαρία', last_name: 'Παπα', city: '' }, ['first_name', 'last_name', 'city']);
assert(snap.length === 2, 'snapshot skips empty');
assert(snap[0].to === 'Μαρία', 'snapshot value');

assert(changeSummary('Ενημέρωση', changes, 'Ενημέρωση πελάτη').includes('2 αλλαγές'), 'summary count');
assert(parseDetails('{"a":1}').a === 1, 'parse string');
assert(parseDetails({ a: 1 }).a === 1, 'parse object');
assert(parseDetails(null) === null, 'parse null');

const hours = formatField('opening_hours', { mon: { open: '09:00', close: '17:00', closed: false }, tue: { closed: true } });
assert(hours.includes('Δευ 09:00–17:00'), hours);
assert(hours.includes('Τρί κλειστό'), hours);

console.log('activityDiff: ok');
