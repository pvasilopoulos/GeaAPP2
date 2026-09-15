export const CHANNELS = ['email', 'viber', 'sms', 'telegram'];

export const CHANNEL_META = {
  email: { label: 'Email', recipientKind: 'email' },
  viber: { label: 'Viber', recipientKind: 'phone' },
  sms: { label: 'SMS', recipientKind: 'phone' },
  telegram: { label: 'Telegram', recipientKind: 'telegram' },
};

const SECRET_FIELDS = {
  email: ['smtp_pass'],
  sms: ['api_key'],
  viber: ['auth_token'],
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

async function sendEmail(cfg, { to, subject, body }) {
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
    text: body,
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
      await postJson(`https://api.telegram.org/bot${c.bot_token}/sendMessage`, {
        chat_id: chatId,
        text: payload.body,
      });
      return { status: 'sent' };
    }
    if (channel === 'viber') {
      await postJson('https://chatapi.viber.com/pa/send_message', {
        receiver: String(payload.to || '').replace(/\s+/g, ''),
        type: 'text',
        text: payload.body,
        sender: { name: c.sender_name || 'SpaceHub' },
      }, { 'X-Viber-Auth-Token': c.auth_token });
      return { status: 'sent' };
    }
    if (channel === 'sms') {
      const headers = c.api_key ? { Authorization: `Bearer ${c.api_key}` } : {};
      await postJson(c.api_url, {
        to: payload.to,
        from: c.sender_id || undefined,
        body: payload.body,
      }, headers);
      return { status: 'sent' };
    }
    return { status: 'logged' };
  } catch (err) {
    return { status: 'failed', detail: err.message || 'Η αποστολή απέτυχε' };
  }
}
