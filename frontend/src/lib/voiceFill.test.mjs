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
if (failed) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
}
console.log(`voiceFill parser: ${cases.length} cases ok`);
