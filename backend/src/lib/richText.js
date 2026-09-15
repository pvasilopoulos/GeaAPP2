// Conversions for composer output. The editor produces a small, constrained
// HTML subset; each provider accepts a different slice of it, so every message
// is rendered from the stored body right before delivery.

const VOID_TAGS = new Set(['br', 'hr', 'img']);

// Tags the composer is allowed to store. Anything else is unwrapped (the text
// survives, the markup does not) so pasted content cannot smuggle markup in.
const SAFE_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'del', 'a', 'br', 'p',
  'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'h1', 'h2', 'h3',
]);

// contentEditable emits a div per line in most browsers, and the older
// presentational tags still show up in pasted markup.
const TAG_ALIAS = { div: 'p', strike: 's', ins: 'u' };

// Telegram rejects the whole message when it meets a tag it does not know,
// so block-level markup is flattened to newlines instead.
const TELEGRAM_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'del', 'a', 'code', 'pre', 'blockquote']);

const BLOCK_TAGS = new Set(['p', 'div', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'pre', 'tr']);

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'",
};

export function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, name) => {
    const key = name.toLowerCase();
    if (ENTITIES[key] !== undefined) return ENTITIES[key];
    if (key.startsWith('#x')) {
      const code = parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    if (key.startsWith('#')) {
      const code = parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return m;
  });
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeHref(raw) {
  const href = decodeEntities(String(raw || '')).trim();
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  return null;
}

function stripDangerousBlocks(html) {
  return String(html || '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Walks the markup once and hands every tag and text run to the caller.
 * Regex is enough here because the input is our own editor output, and
 * anything unrecognised is dropped rather than trusted.
 */
function walk(html, { onText, onTag }) {
  const src = stripDangerousBlocks(html);
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let last = 0;
  let m = re.exec(src);
  while (m) {
    if (m.index > last) onText(src.slice(last, m.index));
    const closing = m[0][1] === '/';
    onTag(m[1].toLowerCase(), closing, m[2] || '');
    last = m.index + m[0].length;
    m = re.exec(src);
  }
  if (last < src.length) onText(src.slice(last));
}

function attr(rawAttrs, name) {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = re.exec(rawAttrs || '');
  if (!m) return null;
  return m[2] ?? m[3] ?? m[4] ?? null;
}

/** Keeps only the whitelisted subset, drops every attribute except safe links. */
export function sanitizeHtml(html) {
  let out = '';
  walk(html, {
    onText: (t) => { out += t; },
    onTag: (raw, closing, rawAttrs) => {
      const tag = TAG_ALIAS[raw] || raw;
      if (!SAFE_TAGS.has(tag)) return;
      if (closing) { out += VOID_TAGS.has(tag) ? '' : `</${tag}>`; return; }
      if (tag === 'br') { out += '<br>'; return; }
      if (tag === 'a') {
        const href = safeHref(attr(rawAttrs, 'href'));
        out += href ? `<a href="${escapeHtml(href)}">` : '<a>';
        return;
      }
      out += `<${tag}>`;
    },
  });
  return out.trim();
}

/** Readable plain text for SMS, Viber and the text part of an email. */
export function htmlToText(html) {
  let out = '';
  let linkHref = null;
  let linkText = '';

  const push = (t) => { if (linkHref !== null) linkText += t; else out += t; };
  // One line break between blocks, never a run of them.
  const breakLine = () => { if (out && !out.endsWith('\n')) out += '\n'; };

  walk(html, {
    onText: (t) => push(decodeEntities(t)),
    onTag: (raw, closing, rawAttrs) => {
      const tag = TAG_ALIAS[raw] || raw;
      if (tag === 'br') { push('\n'); return; }
      if (tag === 'a') {
        if (!closing) { linkHref = safeHref(attr(rawAttrs, 'href')); linkText = ''; return; }
        const text = linkText.trim();
        const href = linkHref;
        linkHref = null;
        linkText = '';
        if (!href) { out += text; return; }
        out += !text || text === href ? href : `${text} (${href})`;
        return;
      }
      if (tag === 'li') {
        breakLine();
        if (!closing) out += '• ';
        return;
      }
      if (BLOCK_TAGS.has(tag)) breakLine();
    },
  });

  return out
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Telegram `parse_mode: HTML` accepts only inline tags; blocks become newlines. */
export function htmlToTelegram(html) {
  let out = '';
  const open = [];
  const breakLine = () => { if (out && !out.endsWith('\n')) out += '\n'; };

  walk(html, {
    onText: (t) => { out += escapeHtml(decodeEntities(t)); },
    onTag: (raw, closing, rawAttrs) => {
      const tag = TAG_ALIAS[raw] || raw;
      if (tag === 'br') { out += '\n'; return; }
      if (tag === 'li') {
        breakLine();
        if (!closing) out += '• ';
        return;
      }
      if (TELEGRAM_TAGS.has(tag)) {
        if (closing) {
          const idx = open.lastIndexOf(tag);
          if (idx === -1) return;
          open.splice(idx, 1);
          out += `</${tag}>`;
          return;
        }
        if (tag === 'a') {
          const href = safeHref(attr(rawAttrs, 'href'));
          if (!href) return;
          open.push(tag);
          out += `<a href="${escapeHtml(href)}">`;
          return;
        }
        open.push(tag);
        out += `<${tag}>`;
        return;
      }
      if (BLOCK_TAGS.has(tag)) breakLine();
    },
  });

  // Close anything the editor left dangling, newest first.
  while (open.length) out += `</${open.pop()}>`;

  return out.replace(/\n{3,}/g, '\n\n').trim();
}

export function textToHtml(text) {
  return escapeHtml(String(text || '')).replace(/\r?\n/g, '<br>');
}

/**
 * One body, rendered for whichever channel is about to send it.
 * `format` is what the composer stored: 'html' or 'text'.
 */
export function renderBody(body, format, target) {
  const isHtml = format === 'html';
  if (target === 'html') return isHtml ? sanitizeHtml(body) : textToHtml(body);
  if (target === 'telegram') return isHtml ? htmlToTelegram(body) : escapeHtml(String(body || ''));
  return isHtml ? htmlToText(body) : String(body || '');
}
