import { renderBody } from './richText.js';

export const CHANNELS = ['email', 'viber', 'viber_routee', 'sms', 'telegram'];

export const CHANNEL_META = {
  email: { label: 'Email', recipientKind: 'email' },
  viber: { label: 'Viber', recipientKind: 'phone' },
  viber_routee: { label: 'Viber Routee', recipientKind: 'phone' },
  sms: { label: 'SMS', recipientKind: 'phone' },
  telegram: { label: 'Telegram', recipientKind: 'telegram' },
};

// What the composer may offer per channel, driven by what each provider's API
// actually accepts — richText/subject/maxLength/encoding/attachments/button
// are read by the frontend to show/hide fields instead of hardcoding a
// channel list there.
// - attachments: provider accepts a file/image alongside the text (email can
//   carry several; the chat channels carry exactly one per message).
// - button: provider can render a single tappable call-to-action link.
export const CHANNEL_CAPS = {
  email: { richText: true, subject: true, maxLength: null, encoding: 'unicode', attachments: true, attachmentsMax: 8, button: true },
  telegram: { richText: true, subject: false, maxLength: 4096, encoding: 'unicode', attachments: true, attachmentsMax: 1, button: true },
  viber: { richText: false, subject: false, maxLength: 7000, encoding: 'unicode', attachments: true, attachmentsMax: 1, button: true },
  viber_routee: { richText: false, subject: false, maxLength: 1000, encoding: 'unicode', attachments: true, attachmentsMax: 1, button: true },
  sms: { richText: false, subject: false, maxLength: 1530, encoding: 'gsm', attachments: false, attachmentsMax: 0, button: false },
};

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

// The Viber PA REST API answers with HTTP 200 even when the message itself
// was rejected — the real outcome is the body's { status, status_message },
// where status 0 means delivered. Without this check a bad media URL or
// missing field would look like a success.
async function postViber(body, token) {
  const text = await postJson('https://chatapi.viber.com/pa/send_message', body, { 'X-Viber-Auth-Token': token });
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON response, fall through */ }
  if (json && json.status) throw new Error(json.status_message ? `Viber: ${json.status_message}` : `Viber error ${json.status}`);
  return json;
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

// Chat-provider APIs need a fetchable HTTPS URL for attachments/buttons; the
// composer only ever knows the app's own relative /uploads/... path, so this
// turns it absolute using the configured public origin (falling back to
// whatever origin the request itself came in on).
export function absoluteUrl(url, publicBaseUrl) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (!publicBaseUrl) return u;
  return `${publicBaseUrl.replace(/\/+$/, '')}${u.startsWith('/') ? '' : '/'}${u}`;
}

function firstAttachment(attachments) {
  return Array.isArray(attachments) && attachments.length ? attachments[0] : null;
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

// Builds the ordered list of Routee Viber message bodies to send for one
// outbound message. Exported for unit testing.
//
// Reference: Routee "Send a Viber Single Message" API
// (https://docs.routee.net/reference/viber/send-a-viber-single-message) and
// "Other Viber Messaging concept"
// (https://docs.routee.net/docs/other-viber-messaging-concept).
//
//   body.text            string, optional, max 1000 chars.
//   body.imageURL         string, optional, HTTPS, max 1000 chars.
//   body.action           object, optional CTA button.
//     .caption             string, required if action present, 1-30 chars.
//     .targetUrl           string, required if action present.
//
// Non-image attachments (documents, PDFs, spreadsheets, ...) are NOT sent
// via Routee's `viberFile` message type. In practice Routee rejects it with
// the opaque errorCode 019 "Provided viber file is not valid" even for
// files that satisfy every documented constraint (≤600KB, ≤25-char name,
// whitelisted extension, valid content, reachable HTTPS URL) — see the
// investigation in git history for #27/#29. Instead, a non-image attachment
// is delivered as a "Text + Button" message (a supported, reliably
// delivered layout) whose button links straight to the file's own URL, so
// the recipient taps the button to open/download the file in their browser.
//
// Supported message layouts (unsupported combinations are rejected as
// errorCode 007 "Invalid viber message type combination"):
//   Text only · Image only · Text + Button ·
//   Text + Image + Button · Video only · Video + Text ·
//   Video + Text + Button · Carousel
// Explicitly unsupported: Text + Image (no button) · Image + Button ·
// Video + Button — hence an image with caption text but no button is split
// into two messages.
export function buildViberRouteeMessages({ text, attachment, action }) {
  const isImage = attachment && String(attachment.mime || '').startsWith('image/');
  const messages = [];
  if (attachment && !isImage) {
    // The attachment becomes the button's target — a user-provided button
    // caption is kept, otherwise the file name (or a generic label) is used.
    const caption = (action?.caption || attachment.name || 'Άνοιγμα αρχείου').slice(0, 30);
    const linkAction = { caption, targetUrl: attachment.url };
    messages.push({ text: text || caption, action: linkAction });
  } else if (isImage) {
    // Routee's Viber module only accepts specific message-type combinations
    // (errorCode 007 lists e.g. "Text, Image, File, Text + Action,
    // Text + Action + Image, ..."); a plain "Text + Image" with no button
    // is not one of them, so an image + caption text needs a button to stay
    // in one message — otherwise split into a text message and an image-only
    // message, same pattern used for non-image files.
    if (text && !action) {
      messages.push({ text });
      messages.push({ imageURL: attachment.url });
    } else {
      const msgBody = { text: text || undefined, imageURL: attachment.url };
      if (action) msgBody.action = action;
      messages.push(msgBody);
    }
  } else {
    messages.push({ text, action });
  }
  return messages;
}

async function sendViberRoutee(cfg, payload) {
  const to = toE164(payload.to);
  const text = String(payload.body || '').slice(0, 1000);
  const att = firstAttachment(payload.attachments);
  const action = payload.button?.label && payload.button?.url
    ? { caption: payload.button.label.slice(0, 30), targetUrl: absoluteUrl(payload.button.url, payload.publicBaseUrl) }
    : undefined;
  const attachment = att ? { ...att, url: absoluteUrl(att.url, payload.publicBaseUrl) } : null;
  const messages = buildViberRouteeMessages({ text, attachment, action });

  const sendOnce = async (token, msgBody) => {
    const body = { senderInfoTrackingId: String(cfg.sender_info_tracking_id || '').trim(), to, body: msgBody };
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
      const text2 = await res.text();
      return { res, text: text2 };
    } finally {
      clearTimeout(t);
    }
  };

  let auth = await routeeAccessToken(cfg.application_id, cfg.application_secret);
  // Routee's HTTP response only confirms the request was queued, not that
  // Viber actually delivered it — collect the accepted body + raw response
  // for every message (attempting all of them even if one fails, so a
  // preceding text message still reaches the customer) so a "sent but
  // nothing arrived" case, or the exact reason a specific message (e.g. the
  // file) was rejected, can be diagnosed directly from the app
  // (Δραστηριότητα) instead of server logs.
  const diagnostics = [];
  let failure = null;
  for (const msgBody of messages) {
    const kind = msgBody.imageURL ? 'image' : (msgBody.action ? 'text+button' : 'text');
    const mediaUrl = msgBody.imageURL || msgBody.action?.targetUrl || '';
    let { res, text: respText } = await sendOnce(auth.token, msgBody);
    if (res.status === 401 || res.status === 403) {
      routeeTokenCache.delete(auth.key);
      auth = await routeeAccessToken(cfg.application_id, cfg.application_secret, { force: true });
      ({ res, text: respText } = await sendOnce(auth.token, msgBody));
    }
    diagnostics.push(`${kind}${mediaUrl ? ` [${mediaUrl}]` : ''}: HTTP ${res.status} ${respText.slice(0, 400)}`);
    console.log(`[messaging][viber_routee] ${res.status}`, JSON.stringify(msgBody), '->', respText.slice(0, 300));
    if (!res.ok && !failure) failure = `${kind}: ${routeeErrorMessage(respText, res.status)}`;
  }
  if (failure) throw new Error(`${failure} (${diagnostics.join(' | ')})`);
  return diagnostics;
}

// A styled call-to-action the plain-text part renders as "label: url" (since
// text has no clickable buttons) and the HTML part renders as a real button.
function buttonHtml(button) {
  if (!button?.label || !button?.url) return '';
  const label = String(button.label).replace(/[<>&]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m]));
  return `<div style="margin-top:16px"><a href="${button.url}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${label}</a></div>`;
}

async function sendEmail(cfg, { to, subject, body, bodyFormat, attachments, button, publicBaseUrl }) {
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
  let text = renderBody(body, bodyFormat, 'text');
  let html = renderBody(body, bodyFormat, 'html');
  if (button?.label && button?.url) {
    text += `\n\n${button.label}: ${button.url}`;
    html += buttonHtml(button);
  }
  await transporter.sendMail({
    from: cfg.from_name ? `"${cfg.from_name.replace(/"/g, '')}" <${cfg.from_email}>` : cfg.from_email,
    to,
    subject: subject || '(χωρίς θέμα)',
    text,
    html,
    attachments: (attachments || []).slice(0, CHANNEL_CAPS.email.attachmentsMax).map((a) => ({
      filename: a.name || 'attachment',
      path: absoluteUrl(a.url, publicBaseUrl),
      contentType: a.mime || undefined,
    })),
  });
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
      const chatId = String(payload.to || '').replace(/^@/, '').trim();
      const text = renderBody(payload.body, payload.bodyFormat, 'telegram');
      const replyMarkup = payload.button?.label && payload.button?.url
        ? { inline_keyboard: [[{ text: String(payload.button.label).slice(0, 60), url: payload.button.url }]] }
        : undefined;
      const att = firstAttachment(payload.attachments);
      const base = `https://api.telegram.org/bot${c.bot_token}`;
      if (att) {
        const isImage = String(att.mime || '').startsWith('image/');
        const method = isImage ? 'sendPhoto' : 'sendDocument';
        const field = isImage ? 'photo' : 'document';
        const mediaUrl = absoluteUrl(att.url, payload.publicBaseUrl);
        if (text && text.length > 1024) {
          // Caption is capped at 1024 chars — send the full text first, then
          // the media (still carrying the button) as a follow-up message.
          await postJson(`${base}/sendMessage`, { chat_id: chatId, text, parse_mode: 'HTML' });
          await postJson(`${base}/${method}`, { chat_id: chatId, [field]: mediaUrl, reply_markup: replyMarkup });
        } else {
          await postJson(`${base}/${method}`, {
            chat_id: chatId, [field]: mediaUrl,
            caption: text || undefined, parse_mode: text ? 'HTML' : undefined,
            reply_markup: replyMarkup,
          });
        }
      } else {
        await postJson(`${base}/sendMessage`, { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: replyMarkup });
      }
      return { status: 'sent' };
    }
    if (channel === 'viber') {
      const receiver = String(payload.to || '').replace(/\s+/g, '');
      const sender = { name: c.sender_name || 'SpaceHub' };
      const text = renderBody(payload.body, payload.bodyFormat, 'text');
      // Viber's "keyboard" object rides on any message type and renders as a
      // single tappable button under the bubble.
      const keyboard = payload.button?.label && payload.button?.url ? {
        Type: 'keyboard', DefaultHeight: false, BgColor: '#FFFFFF',
        Buttons: [{
          Columns: 6, Rows: 1, BgColor: '#2db9b9', ActionType: 'open-url',
          ActionBody: payload.button.url, Text: String(payload.button.label).slice(0, 30),
          TextVAlign: 'middle', TextHAlign: 'center', TextSize: 'regular',
        }],
      } : undefined;
      const att = firstAttachment(payload.attachments);
      const send = (body) => postViber(body, c.auth_token);
      if (att) {
        const mediaUrl = absoluteUrl(att.url, payload.publicBaseUrl);
        const isImage = String(att.mime || '').startsWith('image/');
        // "file" messages have no caption field, so text goes out separately.
        if (text && !isImage) await send({ receiver, type: 'text', text, sender });
        await send(isImage
          ? { receiver, type: 'picture', media: mediaUrl, text: text || undefined, sender, keyboard }
          : { receiver, type: 'file', media: mediaUrl, file_name: att.name || 'file', size: att.size || 0, sender, keyboard });
      } else {
        await send({ receiver, type: 'text', text, sender, keyboard });
      }
      return { status: 'sent' };
    }
    if (channel === 'viber_routee') {
      const diagnostics = await sendViberRoutee(c, { ...payload, body: renderBody(payload.body, payload.bodyFormat, 'text') });
      return { status: 'sent', detail: diagnostics.join(' | ').slice(0, 500) };
    }
    if (channel === 'sms') {
      const headers = c.api_key ? { Authorization: `Bearer ${c.api_key}` } : {};
      await postJson(c.api_url, {
        to: payload.to,
        from: c.sender_id || undefined,
        body: renderBody(payload.body, payload.bodyFormat, 'text'),
      }, headers);
      return { status: 'sent' };
    }
    return { status: 'logged' };
  } catch (err) {
    return { status: 'failed', detail: err.message || 'Η αποστολή απέτυχε' };
  }
}
