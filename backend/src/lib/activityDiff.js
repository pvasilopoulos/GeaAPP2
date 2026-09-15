import { AMENITIES, WEEKDAYS } from './masterData.js';

export const FIELD_LABELS = {
  first_name: 'Όνομα',
  last_name: 'Επώνυμο',
  email: 'Email',
  phone: 'Τηλέφωνο',
  mobile: 'Κινητό',
  company: 'Επωνυμία',
  tax_id: 'ΑΦΜ',
  customer_type: 'Τύπος',
  status: 'Κατάσταση',
  is_vip: 'VIP',
  is_primary: 'Κύριο',
  date_of_birth: 'Ημ. γέννησης',
  address_line: 'Διεύθυνση',
  city: 'Πόλη',
  area: 'Περιοχή',
  postal_code: 'Τ.Κ.',
  country: 'Χώρα',
  profile_note: 'Σημείωση',
  assigned_employee_id: 'Υπεύθυνος',
  avatar_url: 'Φωτογραφία',
  image_url: 'Φωτογραφία',
  name: 'Όνομα',
  code: 'Κωδικός',
  role: 'Ρόλος',
  notes: 'Σημειώσεις',
  lat: 'Γεωγρ. πλάτος',
  lng: 'Γεωγρ. μήκος',
  manager_employee_id: 'Υπεύθυνος',
  opening_hours: 'Ωράριο',
  space_type: 'Τύπος χώρου',
  capacity: 'Χωρητικότητα',
  floor: 'Όροφος',
  hourly_price: 'Τιμή/ώρα',
  daily_price: 'Τιμή/ημέρα',
  weekend_hourly_price: 'Τιμή Σαβ/Κυρ',
  description: 'Περιγραφή',
  amenities: 'Παροχές',
  min_duration_minutes: 'Ελάχ. διάρκεια',
  slot_step_minutes: 'Βήμα',
  buffer_minutes: 'Buffer',
};

const STATUS_LABELS = {
  active: 'Ενεργός',
  inactive: 'Ανενεργός',
  prospect: 'Υποψήφιος',
  renovation: 'Ανακαίνιση',
  closed: 'Κλειστό',
  available: 'Διαθέσιμος',
  maintenance: 'Συντήρηση',
};

const AMENITY_LABEL = Object.fromEntries(AMENITIES.map((a) => [a.key, a.label]));

function parseMaybeJson(v) {
  if (v == null) return v;
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
      try { return JSON.parse(s); } catch { return v; }
    }
  }
  return v;
}

function formatHours(raw) {
  const hours = parseMaybeJson(raw);
  if (!hours || typeof hours !== 'object') return String(raw);
  return WEEKDAYS.map((d) => {
    const row = hours[d.key];
    if (!row || row.closed) return `${d.short} κλειστό`;
    return `${d.short} ${(row.open || '').slice(0, 5)}–${(row.close || '').slice(0, 5)}`;
  }).join(' · ');
}

function formatAmenities(raw) {
  const list = parseMaybeJson(raw);
  const arr = Array.isArray(list) ? list : [];
  if (!arr.length) return '—';
  return arr.map((k) => AMENITY_LABEL[k] || k).join(', ');
}

function isEmpty(v) {
  return v === undefined || v === null || v === '';
}

export function formatField(key, value) {
  if (isEmpty(value) && value !== 0 && value !== false) return '—';
  if (key === 'is_vip' || key === 'is_primary') {
    return (value === true || value === 1 || value === '1') ? 'Ναι' : 'Όχι';
  }
  if (key === 'status') return STATUS_LABELS[value] || String(value);
  if (key === 'customer_type') return value === 'company' ? 'Εταιρεία' : 'Ιδιώτης';
  if (key === 'image_url' || key === 'avatar_url') {
    const s = String(value);
    return s.length > 80 ? 'αρχείο εικόνας' : s;
  }
  if (key === 'opening_hours') return formatHours(value);
  if (key === 'amenities') return formatAmenities(value);
  if (typeof value === 'object') {
    try { return JSON.stringify(parseMaybeJson(value)); } catch { return String(value); }
  }
  return String(value);
}

export function diffRecords(before = {}, patch = {}, keys) {
  const list = keys || Object.keys(patch);
  const changes = [];
  for (const key of list) {
    if (patch[key] === undefined) continue;
    if (key === 'search_norm' || key === 'updated_at' || key === 'code') continue;
    const from = formatField(key, before[key]);
    const to = formatField(key, patch[key]);
    if (from === to) continue;
    changes.push({ field: key, label: FIELD_LABELS[key] || key, from, to });
  }
  return changes;
}

export function snapshotFields(obj = {}, keys) {
  return (keys || Object.keys(obj))
    .filter((k) => k !== 'search_norm' && k !== 'updated_at' && !isEmpty(obj[k]) && obj[k] !== false && obj[k] !== 0)
    .map((k) => ({ field: k, label: FIELD_LABELS[k] || k, to: formatField(k, obj[k]) }));
}

export function parseDetails(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

export function actorFrom(req) {
  if (!req?.user) return null;
  return { id: req.user.id, name: req.user.fullName || req.user.email || null };
}

export function packDetails(req, extra = {}) {
  const actor = actorFrom(req);
  const out = { ...extra };
  if (actor) out.actor = actor;
  if (!out.changes?.length) delete out.changes;
  if (!out.fields?.length) delete out.fields;
  return Object.keys(out).length ? out : null;
}

export function changeSummary(prefix, changes, fallback) {
  if (!changes?.length) return fallback || prefix;
  if (changes.length === 1) {
    const c = changes[0];
    const line = `${prefix}: ${c.label} ${c.from} → ${c.to}`;
    return line.length > 400 ? line.slice(0, 397) + '…' : line;
  }
  return `${fallback || prefix} (${changes.length} αλλαγές)`;
}
