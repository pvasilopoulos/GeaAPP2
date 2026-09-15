const EL = 'el-GR';

export function formatDate(value, opts = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(EL, opts);
}

export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(EL, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString(EL, { hour: '2-digit', minute: '2-digit' });
}

export function relativeDate(value) {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return 'σήμερα';
  if (days === 1) return 'χθες';
  if (days < 30) return `πριν ${days} ημέρες`;
  if (days < 365) return `πριν ${Math.floor(days / 30)} μήνες`;
  return `πριν ${Math.floor(days / 365)} χρόνια`;
}

export function formatCurrency(value) {
  const n = Number(value || 0);
  return `€${n.toLocaleString(EL, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString(EL);
}

export function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
}

// Deterministic avatar gradient from a string.
export function avatarColor(seed) {
  const palettes = [
    ['#6366f1', '#8b5cf6'], ['#0ea5e9', '#2563eb'], ['#10b981', '#059669'],
    ['#f59e0b', '#d97706'], ['#ec4899', '#db2777'], ['#14b8a6', '#0d9488'],
    ['#f43f5e', '#e11d48'], ['#8b5cf6', '#6d28d9'],
  ];
  let h = 0;
  for (let i = 0; i < String(seed).length; i++) h = (h * 31 + String(seed).charCodeAt(i)) >>> 0;
  const [a, b] = palettes[h % palettes.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

export const STATUS_LABELS = { active: 'Ενεργός', inactive: 'Ανενεργός', prospect: 'Υποψήφιος' };
export const TYPE_LABELS = { individual: 'Ιδιώτης', company: 'Εταιρεία' };
export const BRANCH_STATUS_LABELS = { active: 'Ενεργό', renovation: 'Ανακαίνιση', closed: 'Κλειστό' };
export const SPACE_STATUS_LABELS = { available: 'Διαθέσιμος', maintenance: 'Συντήρηση', inactive: 'Ανενεργός' };
export const AMENITY_LABELS = {
  wifi: 'Wi‑Fi', projector: 'Projector', whiteboard: 'Whiteboard', parking: 'Parking',
  accessible: 'Προσβασιμότητα ΑμεΑ', video_conf: 'Video conference', coffee: 'Καφές / κουζίνα', ac: 'Κλιματισμός',
};
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
  return {
    mon: { ...day }, tue: { ...day }, wed: { ...day }, thu: { ...day }, fri: { ...day },
    sat: { open: '10:00', close: '16:00', closed: true },
    sun: { open: '10:00', close: '16:00', closed: true },
  };
}
export function mapUrl(branch) {
  if (branch?.lat != null && branch?.lng != null && branch.lat !== '' && branch.lng !== '') {
    return `https://www.openstreetmap.org/?mlat=${branch.lat}&mlon=${branch.lng}#map=16/${branch.lat}/${branch.lng}`;
  }
  const q = encodeURIComponent([branch?.address_line, branch?.city, branch?.postal_code].filter(Boolean).join(', '));
  return q ? `https://www.openstreetmap.org/search?query=${q}` : null;
}
export function hoursSummary(hours) {
  if (!hours) return '—';
  const open = WEEKDAYS.filter((d) => hours[d.key] && !hours[d.key].closed);
  if (!open.length) return 'Κλειστό';
  const first = hours[open[0].key];
  return `${open[0].short}–${open[open.length - 1].short} ${first.open}–${first.close}`;
}
export const BOOKING_STATUS = {
  confirmed: 'Επιβεβαιωμένη', completed: 'Ολοκληρώθηκε', pending: 'Εκκρεμεί',
  cancelled: 'Ακυρώθηκε', no_show: 'Μη προσέλευση',
};
