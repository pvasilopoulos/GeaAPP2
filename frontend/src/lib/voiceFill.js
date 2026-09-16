// Parse spoken Greek/English commands into customer form field patches.
// Examples:
//   "βάλε επώνυμο Βασιλόπουλος"
//   "όνομα πελάτη VASILOPOULOS"
//   "first name George last name Smith phone 210 123 4567"
//   "email john at gmail dot com"

export const FIELD_LABELS = {
  first_name: 'Όνομα',
  last_name: 'Επώνυμο',
  company: 'Επωνυμία',
  tax_id: 'ΑΦΜ',
  email: 'Email',
  phone: 'Τηλέφωνο',
  mobile: 'Κινητό',
  address_line: 'Διεύθυνση',
  city: 'Πόλη',
  postal_code: 'Τ.Κ.',
  country: 'Χώρα',
  profile_note: 'Σημείωση',
  date_of_birth: 'Ημ. γέννησης',
  customer_type: 'Τύπος',
  status: 'Κατάσταση',
  is_vip: 'VIP',
};

export const FIELD_LABELS_EN = {
  first_name: 'First name',
  last_name: 'Last name',
  company: 'Company',
  tax_id: 'VAT',
  email: 'Email',
  phone: 'Phone',
  mobile: 'Mobile',
  address_line: 'Address',
  city: 'City',
  postal_code: 'Postal code',
  country: 'Country',
  profile_note: 'Note',
  date_of_birth: 'Date of birth',
  customer_type: 'Type',
  status: 'Status',
  is_vip: 'VIP',
};

const KEYWORDS = [
  { key: 'last_name', labels: ['όνομα πελάτη', 'ονομα πελατη', 'customer last name', 'customer surname', 'customer name', 'επώνυμο πελάτη', 'επωνυμο πελατη', 'επώνυμο', 'επωνυμο', 'last name', 'surname', 'family name'] },
  { key: 'first_name', labels: ['first name', 'given name', 'όνομα', 'ονομα'] },
  { key: 'company', labels: ['επωνυμία εταιρείας', 'επωνυμια εταιρειας', 'company name', 'επωνυμία', 'επωνυμια', 'εταιρεία', 'εταιρεια', 'company'] },
  { key: 'tax_id', labels: ['vat number', 'tax id', 'αφμ', 'vat', 'tax'] },
  { key: 'email', labels: ['e-mail', 'email', 'ιμέιλ', 'ιμειλ', 'ηλεκτρονικό', 'mail'] },
  { key: 'mobile', labels: ['cell phone', 'cellphone', 'κινητό', 'κινητο', 'mobile', 'cell'] },
  { key: 'phone', labels: ['phone number', 'τηλέφωνο', 'τηλεφωνο', 'landline', 'phone'] },
  { key: 'address_line', labels: ['διεύθυνση', 'διευθυνση', 'address'] },
  { key: 'postal_code', labels: ['ταχυδρομικός κώδικας', 'ταχυδρομικος κωδικας', 'postal code', 'post code', 'zip code', 'τ.κ.', 'τκ', 'zip'] },
  { key: 'city', labels: ['πόλη', 'πολη', 'city'] },
  { key: 'country', labels: ['χώρα', 'χωρα', 'country'] },
  { key: 'profile_note', labels: ['σημείωση', 'σημειωση', 'notes', 'note'] },
  { key: 'date_of_birth', labels: ['ημερομηνία γέννησης', 'ημερομηνια γεννησης', 'date of birth', 'birth date', 'birthday'] },
  { key: 'full_name', labels: ['ονοματεπώνυμο', 'ονοματεπωνυμο', 'full name'] },
];

const FILLER = /^(βάλε|βαλε|θέσε|θεσε|συμπλήρωσε|συμπληρωσε|γράψε|γραψε|κάνε|κανε|set|put|fill|add|please|παρακαλώ|the|το|τον|την|τον πελάτη|τον πελατη)\s+/i;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
}

const CATALOG = KEYWORDS
  .flatMap((k) => k.labels.map((label) => ({
    key: k.key,
    len: label.length,
    re: new RegExp(`^${escapeRe(label)}(?=$|\\s)`, 'i'),
  })))
  .sort((a, b) => b.len - a.len);

function stripFillers(text) {
  let t = text.trim().replace(/\s+/g, ' ');
  for (let i = 0; i < 4; i++) {
    const next = t.replace(FILLER, '');
    if (next === t) break;
    t = next.trim();
  }
  return t;
}

function titleCase(value) {
  return String(value).replace(/\S+/g, (w) => {
    if (/[@.]/.test(w) || /^\d/.test(w)) return w;
    return w.charAt(0).toLocaleUpperCase('el-GR') + w.slice(1).toLocaleLowerCase('el-GR');
  });
}

function digits(value) {
  const plus = /^\s*\+/.test(value) || /^\s*(plus|συν)\b/i.test(value);
  const n = String(value).replace(/[^\d]/g, '');
  return n ? (plus ? `+${n}` : n) : '';
}

function emailValue(value) {
  let s = String(value).trim().toLowerCase();
  s = s.replace(/\s+(παπάκι|παπακι|at|στο)\s+/gi, '@');
  s = s.replace(/\s+(τελεία|τελεια|dot)\s+/gi, '.');
  s = s.replace(/\s+/g, '');
  return s;
}

function typeValue(value) {
  const s = String(value).toLowerCase();
  if (/εταιρ|company|business/.test(s)) return 'company';
  if (/ιδιώτ|ιδιωτ|individual|person/.test(s)) return 'individual';
  return null;
}

function statusValue(value) {
  const s = String(value).toLowerCase();
  if (/ανενεργ|inactive/.test(s)) return 'inactive';
  if (/υποψήφ|υποψηφ|prospect/.test(s)) return 'prospect';
  if (/ενεργ|active/.test(s)) return 'active';
  return null;
}

// Matched by stem so both nominative and genitive forms work ("Μάρτιος",
// "Μαρτίου"), which is what dictation actually returns for a spoken date.
const MONTH_STEMS = [
  ['ιανουαρ', 1], ['φεβρουαρ', 2], ['μαρτ', 3], ['απριλ', 4], ['μαι', 5], ['ιουν', 6],
  ['ιουλ', 7], ['αυγουστ', 8], ['σεπτεμβρ', 9], ['οκτωβρ', 10], ['νοεμβρ', 11], ['δεκεμβρ', 12],
  ['jan', 1], ['feb', 2], ['mar', 3], ['apr', 4], ['may', 5], ['jun', 6],
  ['jul', 7], ['aug', 8], ['sep', 9], ['oct', 10], ['nov', 11], ['dec', 12],
];

function deaccent(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function monthFromWord(word) {
  const w = deaccent(word);
  for (const [stem, n] of MONTH_STEMS) {
    if (w.startsWith(stem)) return n;
  }
  return null;
}

/** Builds the yyyy-MM-dd the date input needs, or null if the date is not real. */
function isoDate(year, month, day) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const y = year < 100 ? (year > 30 ? 1900 + year : 2000 + year) : year;
  if (y < 1900 || y > new Date().getFullYear()) return null;
  const dt = new Date(Date.UTC(y, month - 1, day));
  // Round-tripping rejects 31/02 and month 13, which the input would drop silently.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return `${String(y).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function birthValue(value) {
  // Dictation spells dates out in several shapes: "12/3/1985", "12 3 1985",
  // "12 Μαρτίου 1985", "12 του 3 1985". Drop the connecting words first.
  // \b is ASCII-only in JavaScript, so Greek words need explicit boundaries.
  const s = String(value)
    .replace(/(?:^|\s)(?:του|της|στις|στη|στον|of|on|the)(?=\s|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;

  let m = s.match(/(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));

  m = s.match(/(\d{1,2})\s+([^\s\d]+)\s+(\d{2,4})/);
  if (m) {
    const month = monthFromWord(m[2]);
    if (month) return isoDate(Number(m[3]), month, Number(m[1]));
  }

  m = s.match(/(\d{1,2})\s*[-./\s]\s*(\d{1,2})\s*[-./\s]\s*(\d{2,4})/);
  if (m) return isoDate(Number(m[3]), Number(m[2]), Number(m[1]));

  const bare = s.replace(/\D/g, '');
  if (bare.length === 8 || bare.length === 6) {
    return isoDate(Number(bare.slice(4)), Number(bare.slice(2, 4)), Number(bare.slice(0, 2)));
  }
  return null;
}

function formatValue(key, raw) {
  const v = String(raw || '')
    .trim()
    .replace(/^[:\-,]+/, '')
    .replace(/^(?:και|and|&)\s+/i, '')
    .replace(/\s+(?:και|and|&)\s*$/i, '')
    .trim();
  if (!v) return null;
  switch (key) {
    case 'email': return emailValue(v);
    case 'phone':
    case 'mobile':
    case 'tax_id':
    case 'postal_code': return digits(v) || v;
    case 'customer_type': return typeValue(v);
    case 'status': return statusValue(v);
    case 'date_of_birth': return birthValue(v);
    case 'profile_note': return v;
    default: return titleCase(v);
  }
}

function findSpans(text) {
  const spans = [];
  let i = 0;
  while (i < text.length) {
    if (i > 0 && !/\s/.test(text[i - 1])) { i += 1; continue; }
    const slice = text.slice(i);
    let best = null;
    for (const item of CATALOG) {
      const m = slice.match(item.re);
      if (m && (!best || m[0].length > best.len)) best = { key: item.key, at: i, len: m[0].length };
    }
    if (best) {
      spans.push(best);
      i += best.len;
      while (i < text.length && /\s/.test(text[i])) i += 1;
    } else {
      i += 1;
    }
  }
  return spans;
}

function applyVip(text, patches) {
  if (/(?:^|\s)(?:είναι\s+|is\s+|make\s+(?:them|him|her)\s+)?vip(?:\s+πελάτη|\s+customer)?(?:\s|$)/i.test(text)) {
    patches.is_vip = !/(όχι|not|remove|no)\s+vip/i.test(text);
  }
}

function applyStandaloneTypeStatus(text, patches) {
  if (patches.customer_type == null) {
    const isCompany = /είναι\s+εταιρ|is\s+(?:an?\s+)?(?:a\s+)?company/i.test(text)
      || (/εταιρ/i.test(text) && !/επωνυμ/i.test(text))
      || (/\bcompany\b/i.test(text) && !/company\s+name/i.test(text));
    if (isCompany) {
      patches.customer_type = 'company';
    } else if (/(?:είναι\s+)?ιδιώτης|(?:is\s+an?\s*)?individual/i.test(text)) {
      patches.customer_type = 'individual';
    }
  }
  if (patches.status == null) {
    const st = statusValue(text);
    if (st && /κατάσταση|κατασταση|status|ενεργ|ανενεργ|υποψήφ|inactive|prospect|active/.test(text.toLowerCase())) {
      patches.status = st;
    }
  }
}

/**
 * @param {string} transcript
 * @returns {{
 *   patches: Record<string, any>, labels: string[], labelsEn: string[],
 *   unresolved: string[], unresolvedLabels: string[], unresolvedLabelsEn: string[],
 * }}
 */
export function parseVoiceFill(transcript) {
  const patches = {};
  // Fields the speaker clearly asked for but whose value could not be read,
  // so the UI can say so instead of leaving the form silently untouched.
  const unresolved = [];
  const original = stripFillers(String(transcript || ''));
  if (!original) {
    return { patches, labels: [], labelsEn: [], unresolved, unresolvedLabels: [], unresolvedLabelsEn: [] };
  }

  applyVip(original, patches);

  const spans = findSpans(original);
  if (!spans.length) {
    const words = original.split(/\s+/).filter((w) => !/^vip$/i.test(w));
    if (words.length >= 1 && words.length <= 3 && !/@/.test(original) && !/\d{5,}/.test(original)) {
      if (words.length >= 2) {
        patches.first_name = titleCase(words[0]);
        patches.last_name = titleCase(words.slice(1).join(' '));
      } else {
        patches.last_name = titleCase(words[0]);
      }
    }
  } else {
    for (let i = 0; i < spans.length; i++) {
      const start = spans[i].at + spans[i].len;
      const end = i + 1 < spans.length ? spans[i + 1].at : original.length;
      const raw = original.slice(start, end);
      if (spans[i].key === 'full_name') {
        const parts = titleCase(raw).split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
          patches.first_name = parts[0];
          patches.last_name = parts.slice(1).join(' ');
        } else if (parts[0]) patches.last_name = parts[0];
        continue;
      }
      const formatted = formatValue(spans[i].key, raw);
      if (formatted != null && formatted !== '') patches[spans[i].key] = formatted;
      else if (raw.trim() && !unresolved.includes(spans[i].key)) unresolved.push(spans[i].key);
    }
  }

  applyStandaloneTypeStatus(original, patches);

  const labels = Object.keys(patches).map((k) => FIELD_LABELS[k] || k);
  const labelsEn = Object.keys(patches).map((k) => FIELD_LABELS_EN[k] || k);
  const stillMissing = unresolved.filter((k) => patches[k] == null);
  return {
    patches,
    labels,
    labelsEn,
    unresolved: stillMissing,
    unresolvedLabels: stillMissing.map((k) => FIELD_LABELS[k] || k),
    unresolvedLabelsEn: stillMissing.map((k) => FIELD_LABELS_EN[k] || k),
  };
}

export function speechSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
