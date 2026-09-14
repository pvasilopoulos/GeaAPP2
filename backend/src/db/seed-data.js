// Static data pools + helpers used by the seed generator.

export const maleFirst = [
  'Γιώργος', 'Δημήτρης', 'Κώστας', 'Νίκος', 'Γιάννης', 'Παναγιώτης', 'Βασίλης',
  'Χρήστος', 'Θανάσης', 'Αντώνης', 'Σπύρος', 'Μιχάλης', 'Στέφανος', 'Αλέξανδρος',
  'Ανδρέας', 'Πέτρος', 'Θοδωρής', 'Μανώλης', 'Στράτος', 'Λευτέρης', 'Φώτης',
  'Ηλίας', 'Μάριος', 'Χαράλαμπος', 'Απόστολος', 'Ευάγγελος', 'Σωτήρης', 'Άγγελος',
];

export const femaleFirst = [
  'Μαρία', 'Ελένη', 'Κατερίνα', 'Σοφία', 'Αναστασία', 'Δήμητρα', 'Γεωργία',
  'Βασιλική', 'Χριστίνα', 'Ιωάννα', 'Αγγελική', 'Παναγιώτα', 'Ευαγγελία',
  'Δέσποινα', 'Αθηνά', 'Ναταλία', 'Ζωή', 'Φωτεινή', 'Ειρήνη', 'Στέλλα',
  'Θεοδώρα', 'Κωνσταντίνα', 'Μαρίνα', 'Όλγα', 'Ραφαέλα', 'Χαρά', 'Άννα',
];

export const lastNames = [
  'Παπαδόπουλος', 'Παπαδοπούλου', 'Γεωργίου', 'Οικονόμου', 'Παππάς', 'Παππά',
  'Νικολάου', 'Δημητρίου', 'Βασιλείου', 'Αντωνίου', 'Κωνσταντίνου', 'Ιωάννου',
  'Αναγνώστου', 'Μακρής', 'Μακρή', 'Παπαγεωργίου', 'Αλεξίου', 'Θεοδώρου',
  'Καραγιάννης', 'Καραγιάννη', 'Σταθόπουλος', 'Σταθοπούλου', 'Χατζής', 'Χατζή',
  'Ανδρέου', 'Πετρόπουλος', 'Πετροπούλου', 'Μιχαηλίδης', 'Μιχαηλίδου',
  'Κωστόπουλος', 'Κωστοπούλου', 'Σαμαράς', 'Σαμαρά', 'Βλάχος', 'Βλάχου',
  'Γιαννόπουλος', 'Γιαννοπούλου', 'Ρούσσος', 'Ρούσσου', 'Μαυρίδης', 'Μαυρίδου',
];

export const companies = [
  'Αιγαίον Systems', 'Ελλάς Τεχνική', 'Ολυμπία Trading', 'Δελφοί Consulting',
  'Ερμής Logistics', 'Αθηνά Digital', 'Ποσειδών Marine', 'Ήφαιστος Industries',
  'Γαία Energy', 'Κρόνος Finance', 'Ίκαρος Aero', 'Θησέας Retail', 'Νίκη Sports',
  'Απόλλων Media', 'Δήμητρα Foods', 'Ζευς Holdings', 'Ήλιος Solar', 'Ναυτίλος Tech',
];

export const companySuffix = ['Α.Ε.', 'Ε.Π.Ε.', 'Ο.Ε.', 'Ι.Κ.Ε.'];

// Greek cities with representative areas.
export const cities = [
  { city: 'Αθήνα', areas: ['Κηφισιά', 'Μαρούσι', 'Γλυφάδα', 'Χαλάνδρι', 'Κολωνάκι', 'Νέα Σμύρνη'] },
  { city: 'Θεσσαλονίκη', areas: ['Καλαμαριά', 'Τούμπα', 'Κέντρο', 'Πυλαία'] },
  { city: 'Πάτρα', areas: ['Κέντρο', 'Ρίο', 'Αγυιά'] },
  { city: 'Ηράκλειο', areas: ['Κέντρο', 'Νέα Αλικαρνασσός'] },
  { city: 'Λάρισα', areas: ['Κέντρο', 'Νεάπολη'] },
  { city: 'Βόλος', areas: ['Κέντρο', 'Νέα Ιωνία'] },
  { city: 'Ιωάννινα', areas: ['Κέντρο', 'Ανατολή'] },
  { city: 'Ρόδος', areas: ['Κέντρο', 'Ιαλυσός'] },
  { city: 'Χανιά', areas: ['Κέντρο', 'Νέα Χώρα'] },
  { city: 'Καβάλα', areas: ['Κέντρο', 'Περιγιάλι'] },
];

export const streets = [
  'Λεωφ. Κηφισίας', 'Τσιμισκή', 'Αγ. Νικολάου', 'Λεωφ. Δημοκρατίας', 'Ερμού',
  'Μητροπόλεως', 'Πανεπιστημίου', 'Σταδίου', 'Βασ. Σοφίας', 'Εθν. Αντιστάσεως',
  'Παπάγου', 'Ελ. Βενιζέλου', 'Αριστοτέλους', 'Ιπποκράτους',
];

export const spaceTypes = [
  'Αίθουσα συνεδριάσεων', 'Ιδιωτικό γραφείο', 'Co-working', 'Lounge',
  'Αίθουσα εκδηλώσεων', 'Studio', 'Αίθουσα εκπαίδευσης',
];

export const spaceImages = [
  'https://images.unsplash.com/photo-1497366216548-37526070297c?w=640&q=70',
  'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=640&q=70',
  'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=640&q=70',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=640&q=70',
  'https://images.unsplash.com/photo-1531973576160-7125cd663d86?w=640&q=70',
  'https://images.unsplash.com/photo-1604328698692-f76ea9498e76?w=640&q=70',
];

export const branchImages = [
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=70',
  'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=800&q=70',
  'https://images.unsplash.com/photo-1503389152951-9f343605f61e?w=800&q=70',
  'https://images.unsplash.com/photo-1554469384-e58fac16e23a?w=800&q=70',
];

export const tags = [
  { name: 'VIP', slug: 'vip', color: 'gold' },
  { name: 'Συχνός πελάτης', slug: 'frequent', color: 'blue' },
  { name: 'Εταιρικός', slug: 'corporate', color: 'indigo' },
  { name: 'Υψηλής αξίας', slug: 'high-value', color: 'green' },
  { name: 'Νέος πελάτης', slug: 'new', color: 'teal' },
  { name: 'Γυμναστήριο', slug: 'gym', color: 'purple' },
  { name: 'Μακροχρόνιος', slug: 'long-term', color: 'slate' },
];

export const employees = [
  { first: 'Αναστασία', last: 'Κωνσταντίνου', role: 'Διαχειριστής' },
  { first: 'Νίκος', last: 'Παπαδόπουλος', role: 'Account Manager' },
  { first: 'Ελένη', last: 'Γεωργίου', role: 'Account Manager' },
  { first: 'Γιώργος', last: 'Δημητρίου', role: 'Σύμβουλος' },
  { first: 'Μαρία', last: 'Νικολάου', role: 'Σύμβουλος' },
  { first: 'Κώστας', last: 'Βασιλείου', role: 'Υποστήριξη' },
  { first: 'Σοφία', last: 'Αντωνίου', role: 'Υποστήριξη' },
  { first: 'Δημήτρης', last: 'Μακρής', role: 'Account Manager' },
];

// Custom field definitions to seed (spec §14/§15).
export const customFieldDefs = [
  { entity_type: 'customer', name: 'Αριθμός μέλους', key: 'member_no', field_type: 'text', searchable: true, filterable: true, visible_in_list: true, section: 'Συνδρομή', sort_order: 1 },
  { entity_type: 'customer', name: 'Τύπος συνδρομής', key: 'membership_type', field_type: 'select', filterable: true, visible_in_list: true, section: 'Συνδρομή', sort_order: 2, settings: { options: ['Basic', 'Premium', 'Business', 'Enterprise'] } },
  { entity_type: 'customer', name: 'Ημερομηνία λήξης', key: 'expiry_date', field_type: 'date', filterable: true, section: 'Συνδρομή', sort_order: 3 },
  { entity_type: 'customer', name: 'Νόμιμος εκπρόσωπος', key: 'legal_rep', field_type: 'text', searchable: true, section: 'Εταιρικά στοιχεία', sort_order: 4, settings: { showIf: { field: 'customer_type', equals: 'company' } } },
  { entity_type: 'customer', name: 'ΓΕΜΗ', key: 'gemi', field_type: 'text', searchable: true, section: 'Εταιρικά στοιχεία', sort_order: 5, settings: { showIf: { field: 'customer_type', equals: 'company' } } },
  { entity_type: 'branch', name: 'Ώρες λειτουργίας', key: 'opening_hours', field_type: 'text', section: 'Γενικά', sort_order: 1 },
  { entity_type: 'branch', name: 'Θέσεις parking', key: 'parking', field_type: 'number', filterable: true, section: 'Γενικά', sort_order: 2 },
  { entity_type: 'space', name: 'Χωρητικότητα', key: 'capacity', field_type: 'number', filterable: true, visible_in_list: true, section: 'Χαρακτηριστικά', sort_order: 1 },
  { entity_type: 'space', name: 'Projector', key: 'projector', field_type: 'boolean', filterable: true, section: 'Χαρακτηριστικά', sort_order: 2, settings: { showIf: { field: 'space_type', equals: 'Αίθουσα συνεδριάσεων' } } },
  { entity_type: 'space', name: 'Video conferencing', key: 'video_conf', field_type: 'boolean', filterable: true, section: 'Χαρακτηριστικά', sort_order: 3 },
];

// --- helpers ---------------------------------------------------------------

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function chance(p) {
  return Math.random() < p;
}

const GREEK_TO_LATIN = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i',
  κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's',
  ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
  ά: 'a', έ: 'e', ή: 'i', ί: 'i', ό: 'o', ύ: 'y', ώ: 'o', ϊ: 'i', ϋ: 'y', ΐ: 'i', ΰ: 'y',
};

export function greeklish(text) {
  return text
    .toLowerCase()
    .split('')
    .map((ch) => (GREEK_TO_LATIN[ch] !== undefined ? GREEK_TO_LATIN[ch] : /[a-z0-9]/.test(ch) ? ch : ''))
    .join('');
}
