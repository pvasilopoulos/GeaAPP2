// Catalog of events the admin rule builder (lib/notificationRules.js) can
// react to. Each entry describes: `fields` usable inside a rule's
// `conditions` (operators applied against the live event context) and
// `variables` usable inside `{{...}}` title/body/url templates — the two
// lists usually overlap but are kept separate since some context (e.g.
// ids used only for routing) isn't meaningful as a condition field.
//
// Adding a new event = add a catalog entry here + call
// `evaluateNotificationRules(eventKey, context)` from the trigger point
// (see lib/notificationRules.js for the engine, and scheduler.js/routes/*
// for where each event fires). Nothing else needs to change — the rule
// builder UI reads this catalog to render the right pickers.

export const RECIPIENT_DYNAMIC_OPTIONS = {
  follow_up_overdue: ['assigned_user'],
  follow_up_due_soon: ['assigned_user'],
  follow_up_assigned: ['assigned_user'],
  connector_run_failed: [],
  quote_expired: ['created_by', 'seller'],
  quote_status_changed: ['created_by', 'seller'],
  quote_created: ['created_by', 'seller'],
  customer_assigned: ['assigned_user'],
  booking_created: ['assigned_user'],
};

export const DYNAMIC_RECIPIENT_LABELS = {
  assigned_user: 'Ο ανατεθειμένος χρήστης',
  created_by: 'Ο δημιουργός της εγγραφής',
  seller: 'Ο πωλητής',
};

export const EVENT_CATALOG = {
  follow_up_overdue: {
    label: 'Υπενθύμιση εκπρόθεσμη',
    description: 'Μια ανοιχτή υπενθύμιση πέρασε την προθεσμία της.',
    fields: [
      { key: 'title', label: 'Τίτλος υπενθύμισης', type: 'text' },
      { key: 'customerName', label: 'Όνομα πελάτη', type: 'text' },
      { key: 'daysOverdue', label: 'Ημέρες καθυστέρησης', type: 'number' },
      { key: 'customerPhone', label: 'Τηλέφωνο πελάτη', type: 'text' },
      { key: 'customerMobile', label: 'Κινητό πελάτη', type: 'text' },
      { key: 'customerEmail', label: 'Email πελάτη', type: 'text' },
    ],
  },
  follow_up_due_soon: {
    label: 'Υπενθύμιση προσεχώς',
    description: 'Μια ανοιχτή υπενθύμιση πλησιάζει στην προθεσμία της.',
    fields: [
      { key: 'title', label: 'Τίτλος υπενθύμισης', type: 'text' },
      { key: 'customerName', label: 'Όνομα πελάτη', type: 'text' },
      { key: 'customerPhone', label: 'Τηλέφωνο πελάτη', type: 'text' },
      { key: 'customerMobile', label: 'Κινητό πελάτη', type: 'text' },
      { key: 'customerEmail', label: 'Email πελάτη', type: 'text' },
    ],
  },
  follow_up_assigned: {
    label: 'Ανάθεση υπενθύμισης',
    description: 'Μια υπενθύμιση ανατέθηκε (ή άλλαξε ανάθεση) σε χρήστη.',
    fields: [
      { key: 'title', label: 'Τίτλος υπενθύμισης', type: 'text' },
      { key: 'customerName', label: 'Όνομα πελάτη', type: 'text' },
      { key: 'customerPhone', label: 'Τηλέφωνο πελάτη', type: 'text' },
      { key: 'customerMobile', label: 'Κινητό πελάτη', type: 'text' },
      { key: 'customerEmail', label: 'Email πελάτη', type: 'text' },
    ],
  },
  connector_run_failed: {
    label: 'Αποτυχία συγχρονισμού ERP',
    description: 'Ένας ERP connector απέτυχε σε μια εκτέλεση συγχρονισμού.',
    fields: [
      { key: 'connectorName', label: 'Όνομα connector', type: 'text' },
      { key: 'errorMessage', label: 'Μήνυμα σφάλματος', type: 'text' },
    ],
  },
  quote_expired: {
    label: 'Προσφορά έληξε',
    description: 'Η ημερομηνία ισχύος μιας προσφοράς πέρασε χωρίς να κλείσει.',
    fields: [
      { key: 'customerName', label: 'Όνομα πελάτη', type: 'text' },
      { key: 'total', label: 'Συνολική αξία', type: 'number' },
      { key: 'customerPhone', label: 'Τηλέφωνο πελάτη', type: 'text' },
      { key: 'customerMobile', label: 'Κινητό πελάτη', type: 'text' },
      { key: 'customerEmail', label: 'Email πελάτη', type: 'text' },
    ],
  },
  quote_status_changed: {
    label: 'Αλλαγή κατάστασης προσφοράς',
    description: 'Η κατάσταση μιας προσφοράς άλλαξε (π.χ. σε won/lost/sent).',
    fields: [
      { key: 'fromStatus', label: 'Από κατάσταση', type: 'text' },
      { key: 'toStatus', label: 'Σε κατάσταση', type: 'text' },
      { key: 'customerName', label: 'Όνομα πελάτη', type: 'text' },
      { key: 'total', label: 'Συνολική αξία', type: 'number' },
      { key: 'customerPhone', label: 'Τηλέφωνο πελάτη', type: 'text' },
      { key: 'customerMobile', label: 'Κινητό πελάτη', type: 'text' },
      { key: 'customerEmail', label: 'Email πελάτη', type: 'text' },
    ],
  },
  quote_created: {
    label: 'Νέα προσφορά',
    description: 'Δημιουργήθηκε μια νέα προσφορά — χρήσιμο π.χ. για κατώφλι αξίας.',
    fields: [
      { key: 'customerName', label: 'Όνομα πελάτη', type: 'text' },
      { key: 'total', label: 'Συνολική αξία', type: 'number' },
      { key: 'customerPhone', label: 'Τηλέφωνο πελάτη', type: 'text' },
      { key: 'customerMobile', label: 'Κινητό πελάτη', type: 'text' },
      { key: 'customerEmail', label: 'Email πελάτη', type: 'text' },
    ],
  },
  customer_assigned: {
    label: 'Ανάθεση πελάτη',
    description: 'Ένας πελάτης ανατέθηκε (ή άλλαξε ανάθεση) σε υπάλληλο.',
    fields: [
      { key: 'customerName', label: 'Όνομα πελάτη', type: 'text' },
      { key: 'customerPhone', label: 'Τηλέφωνο πελάτη', type: 'text' },
      { key: 'customerMobile', label: 'Κινητό πελάτη', type: 'text' },
      { key: 'customerEmail', label: 'Email πελάτη', type: 'text' },
    ],
  },
  booking_created: {
    label: 'Νέο ραντεβού/κράτηση',
    description: 'Δημιουργήθηκε μια νέα κράτηση.',
    fields: [
      { key: 'customerName', label: 'Όνομα πελάτη', type: 'text' },
      { key: 'branchName', label: 'Υποκατάστημα', type: 'text' },
      { key: 'spaceName', label: 'Χώρος', type: 'text' },
      { key: 'customerPhone', label: 'Τηλέφωνο πελάτη', type: 'text' },
      { key: 'customerMobile', label: 'Κινητό πελάτη', type: 'text' },
      { key: 'customerEmail', label: 'Email πελάτη', type: 'text' },
    ],
  },
};

export function eventCatalogList() {
  return Object.entries(EVENT_CATALOG).map(([key, meta]) => ({
    key,
    label: meta.label,
    description: meta.description,
    fields: meta.fields,
    dynamicRecipients: (RECIPIENT_DYNAMIC_OPTIONS[key] || []).map((id) => ({ id, label: DYNAMIC_RECIPIENT_LABELS[id] })),
  }));
}
