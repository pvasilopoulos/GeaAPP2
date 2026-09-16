import { parseVoiceFill } from './voiceFill.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const cases = [
  ['βάλε επώνυμο Βασιλόπουλος', { last_name: 'Βασιλόπουλος' }],
  ['όνομα πελάτη ΒΑΣΙΛΟΠΟΥΛΟΣ', { last_name: 'Βασιλοπουλος' }],
  ['όνομα πελάτη βασιλόπουλος', { last_name: 'Βασιλόπουλος' }],
  ['όνομα Γιώργος επώνυμο Βασιλόπουλος', { first_name: 'Γιώργος', last_name: 'Βασιλόπουλος' }],
  ['last name Smith first name George', { last_name: 'Smith', first_name: 'George' }],
  ['customer name Vasilopoulos', { last_name: 'Vasilopoulos' }],
  ['email john at gmail dot com', { email: 'john@gmail.com' }],
  ['τηλέφωνο 210 123 4567 κινητό 69 12 345 6789', { phone: '2101234567', mobile: '69123456789' }],
  ['πόλη Αθήνα διεύθυνση Ερμού 12', { city: 'Αθήνα', address_line: 'Ερμού 12' }],
  ['city Athens address 12 Ermou street', { city: 'Athens', address_line: '12 Ermou Street' }],
  ['αφμ 123456789', { tax_id: '123456789' }],
  ['είναι εταιρεία επωνυμία Αιγαίον Systems', { customer_type: 'company', company: 'Αιγαίον Systems' }],
  ['VIP', { is_vip: true }],
  ['Βασιλόπουλος', { last_name: 'Βασιλόπουλος' }],
  ['Γιώργος Βασιλόπουλος', { first_name: 'Γιώργος', last_name: 'Βασιλόπουλος' }],
  ['full name Mary Papadopoulos', { first_name: 'Mary', last_name: 'Papadopoulos' }],
  ['set last name Vasilopoulos and phone plus 30 210 111 1111', { last_name: 'Vasilopoulos', phone: '+302101111111' }],
  ['όνομα Γιώργος και επώνυμο Βασιλόπουλος', { first_name: 'Γιώργος', last_name: 'Βασιλόπουλος' }],
  ['όνομα George last name Smith', { first_name: 'George', last_name: 'Smith' }],
  ['first name Γιώργος επώνυμο Vasilopoulos', { first_name: 'Γιώργος', last_name: 'Vasilopoulos' }],
  ['email maria παπάκι outlook τελεία com', { email: 'maria@outlook.com' }],
  ['ιδιώτης', { customer_type: 'individual' }],
  ['εταιρεία', { customer_type: 'company' }],
  ['is a company company name Aegean Systems', { customer_type: 'company', company: 'Aegean Systems' }],
  // Dictation returns a spoken date in several shapes; the form field only
  // accepts yyyy-MM-dd, so anything else used to be dropped silently.
  ['ημερομηνία γέννησης 12/3/1985', { date_of_birth: '1985-03-12' }],
  ['ημερομηνία γέννησης 12 Μαρτίου 1985', { date_of_birth: '1985-03-12' }],
  ['ημερομηνια γεννησης 12 Μαρτιου 1985', { date_of_birth: '1985-03-12' }],
  ['ημερομηνία γέννησης 3 Μάιος 1985', { date_of_birth: '1985-05-03' }],
  ['ημερομηνία γέννησης 9 Μαΐου 1985', { date_of_birth: '1985-05-09' }],
  ['ημερομηνία γέννησης 12 3 1985', { date_of_birth: '1985-03-12' }],
  ['ημερομηνία γέννησης 12 του 3 1985', { date_of_birth: '1985-03-12' }],
  ['ημερομηνία γέννησης 12-03-1985', { date_of_birth: '1985-03-12' }],
  ['ημερομηνία γέννησης 12.3.85', { date_of_birth: '1985-03-12' }],
  ['ημερομηνία γέννησης 1985-03-12', { date_of_birth: '1985-03-12' }],
  ['ημερομηνία γέννησης 12031985', { date_of_birth: '1985-03-12' }],
  ['date of birth 12 March 1985', { date_of_birth: '1985-03-12' }],
  ['birthday 1 December 2000', { date_of_birth: '2000-12-01' }],
  ['επώνυμο Παπαδόπουλος ημερομηνία γέννησης 12 Μαρτίου 1985 πόλη Βόλος',
    { last_name: 'Παπαδόπουλος', date_of_birth: '1985-03-12', city: 'Βόλος' }],
];

let failed = 0;
for (const [input, expected] of cases) {
  const { patches } = parseVoiceFill(input);
  for (const [k, v] of Object.entries(expected)) {
    if (patches[k] !== v) {
      failed += 1;
      console.error(`FAIL "${input}" ${k}: got ${JSON.stringify(patches[k])} expected ${JSON.stringify(v)}`, patches);
    }
  }
}
// An impossible or unreadable date must not reach the date input, which would
// discard it without a word. It is reported back instead.
const rejected = [
  'ημερομηνία γέννησης 31 Φεβρουαρίου 1985',
  'ημερομηνία γέννησης 45/13/1985',
  'ημερομηνία γέννησης 12 Μαρτίου 2099',
  'ημερομηνία γέννησης χθες',
];
for (const input of rejected) {
  const { patches, unresolved } = parseVoiceFill(input);
  if (patches.date_of_birth !== undefined) {
    failed += 1;
    console.error(`FAIL "${input}" should not set a date, got ${JSON.stringify(patches.date_of_birth)}`);
  }
  if (!unresolved.includes('date_of_birth')) {
    failed += 1;
    console.error(`FAIL "${input}" should report date_of_birth as unresolved, got ${JSON.stringify(unresolved)}`);
  }
}

// A field that parsed fine is never reported as unresolved.
const clean = parseVoiceFill('ημερομηνία γέννησης 12 Μαρτίου 1985');
if (clean.unresolved.length) {
  failed += 1;
  console.error(`FAIL a readable date should not be unresolved, got ${JSON.stringify(clean.unresolved)}`);
}
if (!clean.unresolvedLabels || clean.unresolvedLabels.length) {
  failed += 1;
  console.error('FAIL unresolvedLabels should be an empty array for a readable date');
}

if (failed) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
}
console.log(`voiceFill parser: ${cases.length + rejected.length + 1} cases ok`);
