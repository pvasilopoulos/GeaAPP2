import iconv from 'iconv-lite';

const CHARSET_ALIASES = {
  utf8: 'utf8', 'utf-8': 'utf8',
  windows1253: 'windows-1253', 'windows-1253': 'windows-1253', cp1253: 'windows-1253',
  windows1258: 'windows-1258', 'windows-1258': 'windows-1258', cp1258: 'windows-1258',
};

export function normalizeCharset(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[\s_]/g, '');
  return CHARSET_ALIASES[key] || null;
}

export function charsetFromContentType(contentType) {
  const match = String(contentType || '').match(/charset\s*=\s*["']?([^;"'\s]+)/i);
  return normalizeCharset(match?.[1]);
}

function candidatesFor(options) {
  const configured = normalizeCharset(options.encoding);
  const detected = charsetFromContentType(options.contentType);
  return configured && configured !== 'auto'
    ? [configured]
    : [detected, 'utf8', 'windows-1253', 'windows-1258'].filter(Boolean);
}

function scoreDecodedText(text) {
  const greek = (text.match(/[\u0370-\u03ff\u1f00-\u1fff]/g) || []).length;
  const replacement = (text.match(/\ufffd/g) || []).length;
  return (greek * 10) - (replacement * 100);
}

export function decodeResponse(buffer, options = {}) {
  let lastError;
  for (const charset of [...new Set(candidatesFor(options))]) {
    try {
      const text = iconv.decode(Buffer.from(buffer), charset);
      return { text, charset };
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Δεν ήταν δυνατή η αποκωδικοποίηση του ERP response');
}

export function parseEncodedJson(buffer, options = {}) {
  let lastError;
  const parsed = [];
  for (const charset of [...new Set(candidatesFor(options))]) {
    try {
      const text = iconv.decode(Buffer.from(buffer), charset);
      parsed.push({ value: JSON.parse(text), charset, score: scoreDecodedText(text) });
    } catch (error) { lastError = error; }
  }
  if (parsed.length) return parsed.sort((a, b) => b.score - a.score)[0];
  throw new Error(`Το ERP response δεν είναι έγκυρο JSON ή έχει λάθος encoding (${lastError?.message || 'unknown error'})`);
}
