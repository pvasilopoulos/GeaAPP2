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
export const BOOKING_STATUS = {
  confirmed: 'Επιβεβαιωμένη', completed: 'Ολοκληρώθηκε', pending: 'Εκκρεμεί',
  cancelled: 'Ακυρώθηκε', no_show: 'Μη προσέλευση',
};
