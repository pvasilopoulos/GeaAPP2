import { decodeResponse } from './responseEncoding.js';

// Shared HTTP client for tenant-configured ERP integrations (quotes fetch-lines
// and push-to-ERP so far). Centralizes auth injection, timeout handling, GET
// query-string building and the redacted request/response "debug" snapshot
// used by the `debug` toggle in Settings → Προσφορές / ERP API.

const DEFAULT_TIMEOUT_MS = 30000;
const MIN_TIMEOUT_MS = 2000;
const MAX_TIMEOUT_MS = 120000;

export function clampTimeout(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(n)));
}

function maskSecret(value) {
  const s = String(value ?? '');
  if (!s) return '';
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

// Injects the configured auth strategy into headers/url so users don't have
// to hand-author Authorization headers into the raw Headers JSON textarea.
export function applyAuth(auth, { url, headers }) {
  const type = auth?.type || 'none';
  const nextHeaders = { ...headers };
  let nextUrl = url;
  if (type === 'bearer' && auth.token) {
    nextHeaders.Authorization = `Bearer ${auth.token}`;
  } else if (type === 'basic' && (auth.username || auth.password)) {
    nextHeaders.Authorization = `Basic ${Buffer.from(`${auth.username || ''}:${auth.password || ''}`).toString('base64')}`;
  } else if (type === 'apikey' && auth.api_key_name && auth.api_key_value) {
    if (auth.api_key_in === 'query') {
      const parsedUrl = new URL(nextUrl);
      parsedUrl.searchParams.set(auth.api_key_name, auth.api_key_value);
      nextUrl = parsedUrl.toString();
    } else {
      nextHeaders[auth.api_key_name] = auth.api_key_value;
    }
  }
  return { url: nextUrl, headers: nextHeaders };
}

// Masks header values that look like credentials so `debug` snapshots can be
// shown in the UI without leaking secrets in full.
export function maskHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    out[key] = /authorization|api[-_]?key|token|secret|password/i.test(key) ? maskSecret(value) : value;
  }
  return out;
}

// GET requests can't carry a JSON body, so the rendered template becomes the
// query string instead.
export function toQueryString(renderedBody) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(renderedBody || {})) {
    if (value === null || value === undefined) continue;
    params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  return params.toString();
}

export class ErpCallError extends Error {
  constructor(message, { status = 502, requestSnapshot = null } = {}) {
    super(message);
    this.status = status;
    this.requestSnapshot = requestSnapshot;
  }
}

/**
 * Calls a tenant-configured ERP endpoint.
 * @param {object} config - quote_api / quote_push_api settings (url, method, headers, auth, timeout_ms, enabled).
 * @param {object} customHeaders - already-parsed headers object from config.headers.
 * @param {object} rendered - the rendered body template (object).
 * @returns {{ response: Response, rawBody: Buffer, requestSnapshot: object }}
 */
export async function callConfiguredErp(config, customHeaders, rendered) {
  if (config?.enabled === false) {
    throw new ErpCallError('Η ενσωμάτωση με το ERP είναι απενεργοποιημένη (δες Ρυθμίσεις → Προσφορές / ERP API).', { status: 422 });
  }
  if (!config?.url) {
    throw new ErpCallError('Δεν έχει ρυθμιστεί URL στο Ρυθμίσεις → Προσφορές / ERP API', { status: 422 });
  }
  const method = config.method === 'GET' ? 'GET' : (config.method || 'POST');
  const { url: authedUrl, headers: authedHeaders } = applyAuth(config.auth, {
    url: config.url,
    headers: { 'Content-Type': 'application/json', ...customHeaders },
  });
  let url = authedUrl;
  let body;
  if (method === 'GET') {
    const qs = toQueryString(rendered);
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  } else {
    body = JSON.stringify(rendered);
  }
  const timeoutMs = clampTimeout(config.timeout_ms);
  const requestSnapshot = { url, method, headers: maskHeaders(authedHeaders), body: method === 'GET' ? null : rendered, timeout_ms: timeoutMs };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let rawBody;
  try {
    response = await fetch(url, { method, headers: authedHeaders, body, signal: controller.signal });
    rawBody = Buffer.from(await response.arrayBuffer());
  } catch (fetchError) {
    const message = fetchError.name === 'AbortError'
      ? `Λήξη χρόνου αναμονής (${timeoutMs}ms) κατά την κλήση στο ERP.`
      : `Αποτυχία σύνδεσης με το ERP: ${fetchError.message}`;
    throw new ErpCallError(message, { status: 502, requestSnapshot });
  } finally {
    clearTimeout(timer);
  }
  return { response, rawBody, requestSnapshot };
}

export function responseSnapshot(response, rawBody, limit = 2000) {
  const contentType = response.headers.get('content-type') || '';
  const { text, charset } = decodeResponse(rawBody, { encoding: 'auto', contentType });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    charset,
    body: text.slice(0, limit),
  };
}
