// Placeholder resolution for message templates. Runs on the server both when a
// template is inserted in the composer and again right before delivery, so a
// stale client can never put a raw {{placeholder}} in front of a customer.

/** Groups offered in the settings editor; `cf.*` is added per tenant at runtime. */
export const TEMPLATE_VARIABLES = [
  { key: 'customer.full_name', label: 'Ονοματεπώνυμο πελάτη' },
  { key: 'customer.first_name', label: 'Όνομα πελάτη' },
  { key: 'customer.last_name', label: 'Επώνυμο πελάτη' },
  { key: 'customer.code', label: 'Κωδικός πελάτη' },
  { key: 'customer.company', label: 'Επωνυμία' },
  { key: 'customer.email', label: 'Email πελάτη' },
  { key: 'customer.phone', label: 'Τηλέφωνο πελάτη' },
  { key: 'customer.mobile', label: 'Κινητό πελάτη' },
  { key: 'customer.city', label: 'Πόλη πελάτη' },
  { key: 'branch.name', label: 'Κύριο υποκατάστημα' },
  { key: 'branch.address', label: 'Διεύθυνση υποκαταστήματος' },
  { key: 'branch.phone', label: 'Τηλέφωνο υποκαταστήματος' },
  { key: 'tenant.name', label: 'Επωνυμία οργανισμού' },
  { key: 'tenant.phone', label: 'Τηλέφωνο οργανισμού' },
  { key: 'tenant.email', label: 'Email οργανισμού' },
  { key: 'user.full_name', label: 'Όνομα χρήστη που στέλνει' },
  { key: 'date.today', label: 'Σημερινή ημερομηνία' },
];

function greekDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function addressOf(b = {}) {
  return [b.address_line, b.postal_code || b.area, b.city].filter(Boolean).join(', ');
}

/** Flat lookup table consumed by `resolveTemplate`. */
export function buildTemplateContext({ customer, branch, tenant, user, customFields }) {
  const c = customer || {};
  const b = branch || {};
  const t = tenant || {};
  const u = user || {};
  const ctx = {
    'customer.full_name': c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' '),
    'customer.first_name': c.first_name,
    'customer.last_name': c.last_name,
    'customer.code': c.code,
    'customer.company': c.company,
    'customer.email': c.email,
    'customer.phone': c.phone,
    'customer.mobile': c.mobile || c.phone,
    'customer.city': c.city,
    'branch.name': b.name,
    'branch.address': addressOf(b),
    'branch.phone': b.phone,
    'tenant.name': t.name,
    'tenant.phone': t.contact_phone,
    'tenant.email': t.contact_email,
    'user.full_name': u.fullName || u.full_name,
    'date.today': greekDate(),
  };
  for (const [key, value] of Object.entries(customFields || {})) ctx[`cf.${key}`] = value;
  return ctx;
}

/**
 * Replaces `{{key}}` and `{{key|fallback}}`. Unknown or empty values collapse
 * to the fallback, or to an empty string, so a half-filled record never leaks
 * template syntax into a message.
 */
export function resolveTemplate(text, context = {}) {
  return String(text || '').replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*(?:\|([^}]*))?\}\}/g, (_m, key, fallback) => {
    const raw = context[key];
    const value = raw == null ? '' : String(raw).trim();
    if (value) return value;
    return (fallback ?? '').trim();
  });
}

/** Variables used by a template, for the "λείπουν στοιχεία" hint in the UI. */
export function templateVariables(text) {
  const out = [];
  const re = /\{\{\s*([a-zA-Z0-9_.]+)\s*(?:\|[^}]*)?\}\}/g;
  let m = re.exec(String(text || ''));
  while (m) {
    if (!out.includes(m[1])) out.push(m[1]);
    m = re.exec(String(text || ''));
  }
  return out;
}
