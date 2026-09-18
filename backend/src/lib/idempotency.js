// Idempotency-key handling shared by mutation routes that need to be safely
// retried (e.g. offline clients replaying a queued request once back online).
import { createHash } from 'node:crypto';

const HEADER_NAME = 'idempotency-key';
const MAX_LEN = 100;

/**
 * Reads a client-supplied idempotency key from the request: either the
 * `Idempotency-Key` header or a `client_request_id` body field. Returns a
 * trimmed, length-capped string, or null when no usable key was supplied
 * (callers must treat null as "no idempotency requested" and keep the
 * pre-existing, non-idempotent behaviour).
 */
export function extractClientRequestId(req) {
  const header = typeof req.get === 'function' ? req.get(HEADER_NAME) : req.headers?.[HEADER_NAME];
  const raw = (header == null || header === '') ? req.body?.client_request_id : header;
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_LEN);
}

/** True for MySQL duplicate-key errors (races on the unique index). */
export function isDuplicateKeyError(err) {
  return err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062;
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/** SHA-256 of the request body, ignoring `client_request_id` itself. */
export function fingerprintBody(body) {
  const src = (body && typeof body === 'object' && !Array.isArray(body)) ? { ...body } : { value: body ?? null };
  delete src.client_request_id;
  return createHash('sha256').update(stableStringify(src)).digest('hex');
}

export function parseStoredResponse(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

/**
 * Decide whether a stored idempotency row should be replayed, rejected as a
 * conflicting reuse of the same key, or ignored so the caller can proceed.
 */
export function decideIdempotencyReplay(existing, requestHash) {
  if (!existing) return { action: 'proceed' };
  if (existing.request_hash && existing.request_hash !== requestHash) {
    return { action: 'conflict' };
  }
  return {
    action: 'replay',
    status: Number(existing.status_code) || 200,
    body: parseStoredResponse(existing.response_json) ?? { ok: true },
  };
}

export function idempotencyPath(req) {
  const base = req.baseUrl || '';
  const routePath = req.route?.path;
  const p = routePath && routePath !== '/' ? routePath : (req.path || '');
  return `${base}${p}`.slice(0, 255);
}

const CONFLICT_BODY = { error: 'Το Idempotency-Key χρησιμοποιήθηκε ήδη με διαφορετικό αίτημα' };

async function findIdempotency(queryFn, tenantId, userId, key) {
  const { rows } = await queryFn(
    `SELECT request_hash, status_code, response_json
     FROM idempotency_keys WHERE tenant_id = ? AND user_id = ? AND idempotency_key = ?`,
    [tenantId, userId, key]);
  return rows[0] || null;
}

async function saveIdempotency(queryFn, rec) {
  await queryFn(
    `INSERT INTO idempotency_keys
      (tenant_id, user_id, idempotency_key, method, path, request_hash, status_code, response_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [rec.tenantId, rec.userId, rec.key, rec.method, rec.path, rec.requestHash, rec.statusCode,
      JSON.stringify(rec.body)]);
}

/**
 * Runs `execute` unless this Idempotency-Key already completed. Successful
 * 2xx results are stored so a later retry returns the same body without a
 * second write. 4xx from `execute` are not stored (the client can correct
 * the payload). `execute` must return `{ status, body }` and not write `res`.
 */
export async function withIdempotency(queryFn, req, execute) {
  const key = extractClientRequestId(req);
  const hash = fingerprintBody(req.body);
  const tenantId = req.user?.tenantId;
  const userId = req.user?.id;
  if (key && tenantId != null && userId != null) {
    const existing = await findIdempotency(queryFn, tenantId, userId, key);
    const decision = decideIdempotencyReplay(existing, hash);
    if (decision.action === 'conflict') return { status: 409, body: CONFLICT_BODY };
    if (decision.action === 'replay') return { status: decision.status, body: decision.body, replay: true };
  }
  const result = await execute();
  if (key && tenantId != null && userId != null && result.status >= 200 && result.status < 300) {
    try {
      await saveIdempotency(queryFn, {
        tenantId, userId, key,
        method: String(req.method || 'POST').slice(0, 10),
        path: idempotencyPath(req),
        requestHash: hash,
        statusCode: result.status,
        body: result.body,
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        const existing = await findIdempotency(queryFn, tenantId, userId, key);
        const decision = decideIdempotencyReplay(existing, hash);
        if (decision.action === 'conflict') return { status: 409, body: CONFLICT_BODY };
        if (decision.action === 'replay') return { status: decision.status, body: decision.body, replay: true };
      } else {
        throw err;
      }
    }
  }
  return result;
}
