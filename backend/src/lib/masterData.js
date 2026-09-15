// Catalogs for branch/space operational master data (statuses, amenities, hours).

export const BRANCH_STATUSES = [
  { value: 'active', label: 'Ενεργό' },
  { value: 'renovation', label: 'Ανακαίνιση' },
  { value: 'closed', label: 'Κλειστό' },
];

export const SPACE_STATUSES = [
  { value: 'available', label: 'Διαθέσιμος' },
  { value: 'maintenance', label: 'Συντήρηση' },
  { value: 'inactive', label: 'Ανενεργός' },
];

export const AMENITIES = [
  { key: 'wifi', label: 'Wi‑Fi' },
  { key: 'projector', label: 'Projector' },
  { key: 'whiteboard', label: 'Whiteboard' },
  { key: 'parking', label: 'Parking' },
  { key: 'accessible', label: 'Προσβασιμότητα ΑμεΑ' },
  { key: 'video_conf', label: 'Video conference' },
  { key: 'coffee', label: 'Καφές / κουζίνα' },
  { key: 'ac', label: 'Κλιματισμός' },
];

export const WEEKDAYS = [
  { key: 'mon', label: 'Δευτέρα', short: 'Δευ' },
  { key: 'tue', label: 'Τρίτη', short: 'Τρί' },
  { key: 'wed', label: 'Τετάρτη', short: 'Τετ' },
  { key: 'thu', label: 'Πέμπτη', short: 'Πέμ' },
  { key: 'fri', label: 'Παρασκευή', short: 'Παρ' },
  { key: 'sat', label: 'Σάββατο', short: 'Σάβ' },
  { key: 'sun', label: 'Κυριακή', short: 'Κυρ' },
];

export const CONTACT_ROLES = [
  'Κύρια επαφή', 'Διευθυντής', 'Υπεύθυνος χώρων', 'Λογιστήριο',
  'Γραμματεία', 'IT', 'Νόμιμος εκπρόσωπος', 'Άλλο',
];

export function defaultOpeningHours() {
  const day = { open: '09:00', close: '18:00', closed: false };
  const weekend = { open: '10:00', close: '16:00', closed: true };
  return {
    mon: { ...day }, tue: { ...day }, wed: { ...day }, thu: { ...day }, fri: { ...day },
    sat: { ...weekend }, sun: { ...weekend, closed: true },
  };
}

export function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

export function isBranchStatus(v) {
  return BRANCH_STATUSES.some((s) => s.value === v);
}
export function isSpaceStatus(v) {
  return SPACE_STATUSES.some((s) => s.value === v);
}

export function sanitizeAmenities(list) {
  const allowed = new Set(AMENITIES.map((a) => a.key));
  return (Array.isArray(list) ? list : []).filter((k) => allowed.has(k));
}

export function sanitizeHours(input) {
  const base = defaultOpeningHours();
  const src = parseJson(input, null);
  if (!src || typeof src !== 'object') return base;
  for (const d of WEEKDAYS) {
    const row = src[d.key];
    if (!row || typeof row !== 'object') continue;
    base[d.key] = {
      open: typeof row.open === 'string' ? row.open.slice(0, 5) : '09:00',
      close: typeof row.close === 'string' ? row.close.slice(0, 5) : '18:00',
      closed: !!row.closed,
    };
  }
  return base;
}
