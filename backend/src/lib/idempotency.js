// Idempotency-key handling shared by mutation routes that need to be safely
// retried (e.g. offline clients replaying a queued request once back online).

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
