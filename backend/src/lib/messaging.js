import { renderBody } from './richText.js';

export const CHANNELS = ['email', 'viber', 'viber_routee', 'sms', 'telegram'];

export const CHANNEL_META = {
  email: { label: 'Email', recipientKind: 'email' },
  viber: { label: 'Viber', recipientKind: 'phone' },
  viber_routee: { label: 'Viber Routee', recipientKind: 'phone' },
  sms: { label: 'SMS', recipientKind: 'phone' },
  telegram: { label: 'Telegram', recipientKind: 'telegram' },
};

export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const DOC_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
];

/**
 * What each provider can actually carry. The composer is built from this, so a
 * channel never offers a control the API behind it would reject.
 *
 * transport: 'inline' attaches bytes, 'url' hands the provider a public link —
 * which means media on Viber and Telegram needs the app on a reachable host.
 */
export const CHANNEL_CAPS = {
  email: {
    richText: true,
    subject: true,
    maxLength: 0,
    encoding: 'unicode',
    attachments: { max: 5, accept: [...IMAGE_MIMES, ...DOC_MIMES], transport: 'inline' },
    button: false,
  },
  viber: {
    richText: false,
    subject: false,
    maxLength: 7000,
    encoding: 'unicode',
    attachments: { max: 1, accept: IMAGE_MIMES, transport: 'url' },
    button: false,
  },
  viber_routee: {
    richText: false,
    subject: false,
    maxLength: 1000,
    encoding: 'unicode',
    attachments: { max: 1, accept: IMAGE_MIMES, transport: 'url' },
    button: true,
  },
  sms: {
    richText: false,
    subject: false,
    maxLength: 1530,
    encoding: 'gsm',
    attachments: null,
    button: false,
  },
  telegram: {
    richText: true,
    subject: false,
    maxLength: 4096,
    encoding: 'unicode',
    attachments: { max: 1, accept: [...IMAGE_MIMES, ...DOC_MIMES], transport: 'url' },
    button: false,
  },
};

export function channelCaps(channel) {
  return CHANNEL_CAPS[channel] || CHANNEL_CAPS.sms;
}

function absoluteUrl(url, baseUrl) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return `${String(baseUrl || '').replace(/\/+$/, '')}${u.startsWith('/') ? '' : '/'}${u}`;
}

/**
 * Turns the stored message into exactly what one provider accepts: the right
 * text flavour, only the attachments it can carry, and nothing it would reject.
 */
export function buildDeliveryPayload(channel, msg, { baseUrl } = {}) {
  const caps = channelCaps(channel);
  const format = msg.bodyFormat === 'html' ? 'html' : 'text';
  const attachments = (caps.attachments ? msg.attachments || [] : [])
    .slice(0, caps.attachments?.max || 0)
    .map((a) => ({ ...a, absoluteUrl: absoluteUrl(a.url, baseUrl) }));

  return {
    to: msg.to,
    subject: caps.subject ? msg.subject : undefined,
    text: renderBody(msg.body, format, channel === 'telegram' ? 'telegram' : 'text'),
    html: channel === 'email' ? renderBody(msg.body, format, 'html') : undefined,
    attachments,
    button: caps.button && msg.button?.url ? msg.button : undefined,
  };
}

/** Server-side guard so a stale or scripted client cannot bypass the composer. */
export function validateMessage(channel, msg) {
  const caps = channelCaps(channel);
  const text = renderBody(msg.body, msg.bodyFormat === 'html' ? 'html' : 'text', 'text');
  if (!text.trim()) return 'Απαιτείται κείμενο μηνύματος';
  if (caps.maxLength && text.length > caps.maxLength) {
    return `Το μήνυμα ξεπερνά το όριο των ${caps.maxLength} χαρακτήρων για ${CHANNEL_META[channel]?.label || channel}`;
  }
  const files = msg.attachments || [];
  if (files.length && !caps.attachments) {
    return `Το κανάλι ${CHANNEL_META[channel]?.label || channel} δεν υποστηρίζει συνημμένα`;
  }
  if (caps.attachments && files.length > caps.attachments.max) {
    return `Έως ${caps.attachments.max} συνημμένα για ${CHANNEL_META[channel]?.label || channel}`;
  }
  for (const f of files) {
    if (caps.attachments && !caps.attachments.accept.includes(String(f.mime || '').toLowerCase())) {
      return `Ο τύπος αρχείου ${f.mime || '—'} δεν υποστηρίζεται σε ${CHANNEL_META[channel]?.label || channel}`;
    }
  }
  return null;
}

const SECRET_FIELDS = {
  email: ['smtp_pass'],
  sms: ['api_key'],
  viber: ['auth_token'],
  viber_routee: ['application_secret'],
  telegram: ['bot_token'],
};

export const DEFAULT_MESSAGING = {
  email: {
    enabled: true,
    from_name: '',
    from_email: '',
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_pass: '',
    smtp_secure: false,
  },
  viber: {
    enabled: true,
    sender_name: '',
    auth_token: '',
  },
  viber_routee: {
    enabled: true,
    application_id: '',
    application_secret: '',
    sender_info_tracking_id: '',
  },
  sms: {
    enabled: true,
    provider: 'generic',
    sender_id: '',
    api_url: '',
    api_key: '',
  },
  telegram: {
    enabled: true,
    bot_token: '',
    bot_username: '',
  },
};

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

export function mergeMessaging(raw) {
  const parsed = asObject(raw);
  const out = {};
  for (const ch of CHANNELS) {
    const src = asObject(parsed[ch]);
    out[ch] = { ...DEFAULT_MESSAGING[ch], ...src };
    if (ch === 'email') {
      out[ch].smtp_port = Math.max(1, Math.min(65535, Number(out[ch].smtp_port) || 587));
      out[ch].smtp_secure = !!out[ch].smtp_secure;
    }
    out[ch].enabled = src.enabled === undefined ? DEFAULT_MESSAGING[ch].enabled : !!src.enabled;
  }
  return out;
}

export function isConfigured(channel, cfg = {}) {
  if (channel === 'email') return !!(cfg.from_email && cfg.smtp_host);
  if (channel === 'sms') return !!(cfg.api_url && cfg.api_key);
  if (channel === 'viber') return !!cfg.auth_token;
  if (channel === 'viber_routee') {
    return !!(cfg.application_id && cfg.application_secret && cfg.sender_info_tracking_id);
  }
  if (channel === 'telegram') return !!cfg.bot_token;
  return false;
}

export function applyMessagingPatch(current, patch) {
  const next = mergeMessaging(current);
  const src = asObject(patch);
  for (const ch of CHANNELS) {
    const incoming = asObject(src[ch]);
    for (const [k, v] of Object.entries(incoming)) {
      if (!(k in DEFAULT_MESSAGING[ch])) continue;
      if (SECRET_FIELDS[ch]?.includes(k)) {
        if (v === undefined || v === null || v === '' || String(v).startsWith('•')) continue;
        next[ch][k] = String(v);
        continue;
      }
      if (k === 'enabled' || k === 'smtp_secure') {
        next[ch][k] = !!v;
        continue;
      }
      if (k === 'smtp_port') {
        next[ch][k] = Math.max(1, Math.min(65535, Number(v) || 587));
        continue;
      }
      next[ch][k] = v == null ? '' : String(v);
    }
  }
  return next;
}

export function publicMessaging(raw) {
  const m = mergeMessaging(raw);
  const out = {};
  for (const ch of CHANNELS) {
    const c = { ...m[ch] };
    for (const secret of SECRET_FIELDS[ch] || []) {
      const set = !!(c[secret] && String(c[secret]).length);
      delete c[secret];
      c[`has_${secret}`] = set;
    }
    c.configured = isConfigured(ch, m[ch]);
    out[ch] = c;
  }
  return out;
}

export function channelStatuses(raw) {
  const m = mergeMessaging(raw);
  return CHANNELS.map((id) => ({
    id,
    label: CHANNEL_META[id].label,
    recipientKind: CHANNEL_META[id].recipientKind,
    enabled: m[id].enabled !== false,
    configured: isConfigured(id, m[id]),
    caps: CHANNEL_CAPS[id],
  }));
}

async function postJson(url, body, headers = {}, timeoutMs = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text.slice(0, 240) || `HTTP ${res.status}`);
    return text;
  } finally {
    clearTimeout(t);
  }
}

function toE164(raw, defaultCc = '30') {
  let s = String(raw || '').trim().replace(/[\s().-]/g, '');
  if (!s) return s;
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (s.startsWith('+')) return s;
  if (s.startsWith(defaultCc)) return `+${s}`;
  if (s.startsWith('0')) return `+${defaultCc}${s.slice(1)}`;
  return `+${defaultCc}${s}`;
}

function routeeErrorMessage(text, status) {
  try {
    const j = JSON.parse(text);
    const msg = j.developerMessage || j.message || j.error_description || j.error;
    if (msg) return String(msg).slice(0, 240);
  } catch { /* plain text */ }
  if (status === 401 || status === 403) return 'Λάθος Application ID ή Application Secret (Routee)';
  return (text || `HTTP ${status}`).slice(0, 240);
}

const routeeTokenCache = new Map();

async function routeeAccessToken(applicationId, applicationSecret, { force } = {}) {
  const key = `${applicationId}:${applicationSecret.slice(-8)}`;
  if (!force) {
    const hit = routeeTokenCache.get(key);
    if (hit && hit.expiresAt > Date.now() + 15000) return { token: hit.token, key };
  }
  const basic = Buffer.from(`${applicationId}:${applicationSecret}`).toString('base64');
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12000);
  try {
    const res = await fetch('https://auth.routee.net/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: ac.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(routeeErrorMessage(text, res.status));
    let json = {};
    try { json = JSON.parse(text); } catch { throw new Error('Άκυρη απάντηση από το Routee OAuth'); }
    const token = json.access_token;
    if (!token) throw new Error('Το Routee δεν επέστρεψε access token');
    const ttlMs = Math.max(60, Number(json.expires_in) || 3600) * 1000;
    routeeTokenCache.set(key, { token, expiresAt: Date.now() + ttlMs });
    return { token, key };
  } finally {
    clearTimeout(t);
  }
}

async function sendViberRoutee(cfg, payload) {
  const to = toE164(payload.to);
  const image = (payload.attachments || []).find((a) => IMAGE_MIMES.includes(String(a.mime || '').toLowerCase()));
  const body = {
    senderInfoTrackingId: String(cfg.sender_info_tracking_id || '').trim(),
    to,
    body: {
      text: String(payload.text || '').slice(0, 1000),
      ...(image ? { imageURL: image.absoluteUrl } : {}),
      ...(payload.button?.url ? {
        action: { caption: payload.button.caption || 'Άνοιγμα', targetUrl: payload.button.url },
      } : {}),
    },
  };
  const sendOnce = async (token) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15000);
    try {
      const res = await fetch('https://connect.routee.net/viber', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      const text = await res.text();
      return { res, text };
    } finally {
      clearTimeout(t);
    }
  };

  let auth = await routeeAccessToken(cfg.application_id, cfg.application_secret);
  let { res, text } = await sendOnce(auth.token);
  if (res.status === 401 || res.status === 403) {
    routeeTokenCache.delete(auth.key);
    auth = await routeeAccessToken(cfg.application_id, cfg.application_secret, { force: true });
    ({ res, text } = await sendOnce(auth.token));
  }
  if (!res.ok) throw new Error(routeeErrorMessage(text, res.status));
}

async function sendEmail(cfg, { to, subject, html, text, attachments }) {
  const nodemailer = (await import('nodemailer')).default;
  const transporter = nodemailer.createTransport({
    host: cfg.smtp_host,
    port: Number(cfg.smtp_port) || 587,
    secure: !!cfg.smtp_secure,
    auth: cfg.smtp_user ? { user: cfg.smtp_user, pass: cfg.smtp_pass || '' } : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });
  await transporter.sendMail({
    from: cfg.from_name ? `"${cfg.from_name.replace(/"/g, '')}" <${cfg.from_email}>` : cfg.from_email,
    to,
    subject: subject || '(χωρίς θέμα)',
    // Always ship a plain-text alternative alongside HTML: clients that cannot
    // render it still get the message, and it scores better against spam.
    text,
    html: html || undefined,
    attachments: (attachments || []).map((a) => ({ filename: a.name, path: a.absoluteUrl })),
  });
}

function isImage(att) {
  return IMAGE_MIMES.includes(String(att?.mime || '').toLowerCase());
}

async function sendTelegram(cfg, { to, text, attachments }) {
  const chatId = String(to || '').replace(/^@/, '').trim();
  const base = `https://api.telegram.org/bot${cfg.bot_token}`;
  const file = attachments?.[0];
  if (!file) {
    await postJson(`${base}/sendMessage`, { chat_id: chatId, text, parse_mode: 'HTML' });
    return;
  }
  // A caption tops out well below a message body, so long text is sent
  // separately and the media follows it.
  const caption = text.length <= 1024 ? text : '';
  if (isImage(file)) {
    if (!caption && text) await postJson(`${base}/sendMessage`, { chat_id: chatId, text, parse_mode: 'HTML' });
    await postJson(`${base}/sendPhoto`, { chat_id: chatId, photo: file.absoluteUrl, caption, parse_mode: 'HTML' });
    return;
  }
  if (!caption && text) await postJson(`${base}/sendMessage`, { chat_id: chatId, text, parse_mode: 'HTML' });
  await postJson(`${base}/sendDocument`, { chat_id: chatId, document: file.absoluteUrl, caption, parse_mode: 'HTML' });
}

async function sendViberBot(cfg, { to, text, attachments }) {
  const receiver = String(to || '').replace(/\s+/g, '');
  const sender = { name: cfg.sender_name || 'SpaceHub' };
  const file = attachments?.[0];
  if (file && isImage(file)) {
    await postJson('https://chatapi.viber.com/pa/send_message', {
      receiver, type: 'picture', text, media: file.absoluteUrl, sender,
    }, { 'X-Viber-Auth-Token': cfg.auth_token });
    return;
  }
  await postJson('https://chatapi.viber.com/pa/send_message', {
    receiver, type: 'text', text, sender,
  }, { 'X-Viber-Auth-Token': cfg.auth_token });
}

export async function deliverMessage(channel, cfg, payload) {
  const c = cfg || {};
  if (!isConfigured(channel, c)) {
    return { status: 'logged', detail: 'Χωρίς διαπιστευτήρια — καταχωρήθηκε στο ιστορικό' };
  }
  try {
    if (channel === 'email') {
      await sendEmail(c, payload);
      return { status: 'sent' };
    }
    if (channel === 'telegram') {
      await sendTelegram(c, payload);
      return { status: 'sent' };
    }
    if (channel === 'viber') {
      await sendViberBot(c, payload);
      return { status: 'sent' };
    }
    if (channel === 'viber_routee') {
      await sendViberRoutee(c, payload);
      return { status: 'sent' };
    }
    if (channel === 'sms') {
      const headers = c.api_key ? { Authorization: `Bearer ${c.api_key}` } : {};
      await postJson(c.api_url, {
        to: payload.to,
        from: c.sender_id || undefined,
        body: payload.text,
      }, headers);
      return { status: 'sent' };
    }
    return { status: 'logged' };
  } catch (err) {
    return { status: 'failed', detail: err.message || 'Η αποστολή απέτυχε' };
  }
}
