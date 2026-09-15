export const MESSAGE_CHANNELS = [
  { id: 'email', label: 'Email', icon: 'mail', color: '#2563eb', recipientKind: 'email',
    hint: 'Email μέσω SMTP', placeholder: 'email@domain.gr' },
  { id: 'viber', label: 'Viber', icon: 'viber', color: '#7360f2', recipientKind: 'phone',
    hint: 'Viber bot (Public Account)', placeholder: '30XXXXXXXXXX' },
  { id: 'viber_routee', label: 'Viber Routee', icon: 'viber', color: '#5b4fc9', recipientKind: 'phone',
    hint: 'Viber σε κινητό μέσω Routee', placeholder: '+3069XXXXXXXX' },
  { id: 'sms', label: 'SMS', icon: 'sms', color: '#059669', recipientKind: 'phone',
    hint: 'Γραπτό μήνυμα', placeholder: '30XXXXXXXXXX' },
  { id: 'telegram', label: 'Telegram', icon: 'telegram', color: '#229ed9', recipientKind: 'telegram',
    hint: 'Telegram Bot', placeholder: '@username ή chat id' },
];

export function channelMeta(id) {
  return MESSAGE_CHANNELS.find((c) => c.id === id) || MESSAGE_CHANNELS[0];
}

// Mirrors the strictest channel. The real capabilities come from
// GET /settings/messaging/channels so a new channel needs no UI change; this is
// only what the composer assumes until that response lands.
export const FALLBACK_CAPS = {
  richText: false,
  subject: false,
  maxLength: 1530,
  encoding: 'gsm',
  attachments: null,
  button: false,
};

// GSM-7 default alphabet. Anything outside it — Greek lowercase included —
// forces the whole SMS into UCS-2, which halves the characters per segment.
const GSM7 = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?'
  + '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT = '^{}\\[~]|€';

export function smsSegments(text) {
  const s = String(text || '');
  let unicode = false;
  let units = 0;
  for (const ch of s) {
    if (GSM7_EXT.includes(ch)) { units += 2; continue; }
    if (GSM7.includes(ch)) { units += 1; continue; }
    unicode = true;
    break;
  }
  if (unicode) {
    // UCS-2 counts code units, so emoji outside the BMP cost two.
    units = s.length;
    const per = units <= 70 ? 70 : 67;
    return { unicode: true, units, perSegment: per, segments: Math.max(1, Math.ceil(units / per)) };
  }
  const per = units <= 160 ? 160 : 153;
  return { unicode: false, units, perSegment: per, segments: Math.max(1, Math.ceil(units / per)) };
}

export function recipientSuggestions(channelId, customer = {}, contacts = []) {
  const kind = channelMeta(channelId).recipientKind;
  const items = [];
  const add = (value, label) => {
    const v = String(value || '').trim();
    if (!v || items.some((x) => x.value === v)) return;
    items.push({ value: v, label: label || v });
  };
  const name = customer.full_name || 'Πελάτης';
  if (kind === 'email') {
    add(customer.email, name);
    for (const c of contacts) add(c.email, `${c.first_name} ${c.last_name}`.trim());
  } else {
    add(customer.mobile, name);
    add(customer.phone, name);
    for (const c of contacts) {
      add(c.mobile, `${c.first_name} ${c.last_name}`.trim());
      add(c.phone, `${c.first_name} ${c.last_name}`.trim());
    }
  }
  return items;
}

const STRIP_KEYS = ['configured', 'has_smtp_pass', 'has_api_key', 'has_auth_token', 'has_application_secret', 'has_bot_token'];

export function messagingSavePayload(form) {
  const payload = {};
  for (const ch of MESSAGE_CHANNELS) {
    const row = { ...(form?.[ch.id] || {}) };
    for (const k of STRIP_KEYS) delete row[k];
    payload[ch.id] = row;
  }
  return payload;
}
