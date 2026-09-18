import { encodeCursor, decodeCursor, clampLimit } from './cursor.js';

export const AUDIT_ACTIONS = [
  'create', 'update', 'delete', 'login', 'status', 'sync', 'export',
];

export const AUDIT_ENTITY_TYPES = [
  'customer', 'follow_up', 'quote', 'settings', 'user', 'role', 'connector', 'note',
];

const SECRET_KEY_RE = /(password|passwd|secret|token|credential|authorization|api[_-]?key|smtp_pass|auth_token|bot_token|private[_-]?key)/i;

const REDACTED = '[redacted]';

function isSecretKey(key) {
  if (key == null) return false;
  return SECRET_KEY_RE.test(String(key));
}

/** Deep-redact secrets (passwords, tokens, connector credentials, Authorization). */
export function redactAuditDetails(value, key = '') {
  if (value == null) return value;
  if (isSecretKey(key)) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => redactAuditDetails(item, key));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (isSecretKey(k)) {
        out[k] = REDACTED;
        continue;
      }
      // Connector/quote API headers often carry Authorization or API keys.
      if (k.toLowerCase() === 'headers' && v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = redactHeaders(v);
        continue;
      }
      out[k] = redactAuditDetails(v, k);
    }
    return out;
  }
  if (typeof value === 'string' && looksLikeSecretString(value, key)) return REDACTED;
  return value;
}

function redactHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = isSecretKey(k) || /^authorization$/i.test(k) ? REDACTED : redactAuditDetails(v, k);
  }
  return out;
}

function looksLikeSecretString(value, key) {
  if (isSecretKey(key)) return true;
  const s = String(value);
  if (/^bearer\s+/i.test(s)) return true;
  if (/^basic\s+[a-z0-9+/=]+$/i.test(s)) return true;
  return false;
}

export function clientIp(req) {
  if (!req) return null;
  const xf = req.headers?.['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim().slice(0, 64) || null;
  const ip = req.ip || req.socket?.remoteAddress || null;
  return ip ? String(ip).slice(0, 64) : null;
}

export function actorSnapshot(req) {
  const user = req?.user;
  if (!user) return { actorUserId: null, actorName: null };
  return {
    actorUserId: user.id ?? null,
    actorName: user.fullName || user.email || null,
  };
}

function escapeLike(s) {
  return String(s).replace(/[\\%_]/g, '\\$&');
}

function startOfDay(value) {
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`;
  return s;
}

function endExclusive(value) {
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 23:59:59`;
  return s;
}

/**
 * Tenant-scoped list filters for GET /api/audit.
 * `tenantId` is always the first bound parameter — callers must never omit it.
 */
export function buildAuditFilters(tenantId, {
  from, to, actorId, entityType, q, cursor,
} = {}) {
  const where = ['ae.tenant_id = ?'];
  const params = [tenantId];

  if (from) {
    where.push('ae.created_at >= ?');
    params.push(startOfDay(from));
  }
  if (to) {
    where.push('ae.created_at <= ?');
    params.push(endExclusive(to));
  }
  const actor = actorId != null && actorId !== '' ? Number(actorId) : null;
  if (Number.isInteger(actor) && actor > 0) {
    where.push('ae.actor_user_id = ?');
    params.push(actor);
  }
  if (entityType && AUDIT_ENTITY_TYPES.includes(String(entityType))) {
    where.push('ae.entity_type = ?');
    params.push(String(entityType));
  }
  const term = q != null ? String(q).trim() : '';
  if (term) {
    const like = `%${escapeLike(term)}%`;
    where.push('(ae.summary LIKE ? OR ae.actor_name LIKE ? OR ae.entity_type LIKE ? OR ae.action LIKE ?)');
    params.push(like, like, like, like);
  }
  const decoded = decodeCursor(cursor);
  if (decoded?.created_at && decoded?.id != null) {
    where.push('(ae.created_at < ? OR (ae.created_at = ? AND ae.id < ?))');
    params.push(decoded.created_at, decoded.created_at, decoded.id);
  }

  return { whereSql: where.join(' AND '), params };
}

export function nextAuditCursor(rows, limit) {
  if (!rows?.length || rows.length < limit) return null;
  const last = rows[rows.length - 1];
  return encodeCursor({ created_at: last.created_at, id: last.id });
}

export async function logAudit(queryFn, {
  tenantId, actorUserId = null, actorName = null, action, entityType,
  entityId = null, customerId = null, summary, details = null, ip = null,
} = {}) {
  if (!queryFn || !tenantId || !action || !entityType) return;
  const safeDetails = details == null ? null : redactAuditDetails(details);
  try {
    await queryFn(
      `INSERT INTO audit_events
        (tenant_id, actor_user_id, actor_name, action, entity_type, entity_id, customer_id, summary, details, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        actorUserId || null,
        actorName ? String(actorName).slice(0, 160) : null,
        String(action).slice(0, 40),
        String(entityType).slice(0, 40),
        entityId || null,
        customerId || null,
        summary ? String(summary).slice(0, 2000) : null,
        safeDetails == null ? null : JSON.stringify(safeDetails),
        ip ? String(ip).slice(0, 64) : null,
      ],
    );
  } catch (err) {
    console.error('[audit] failed to write event:', err.message);
  }
}

/** Convenience wrapper that snapshots the request actor + IP. */
export async function logAuditFromReq(queryFn, req, fields) {
  const { actorUserId, actorName } = actorSnapshot(req);
  return logAudit(queryFn, {
    tenantId: req?.user?.tenantId,
    actorUserId,
    actorName,
    ip: clientIp(req),
    ...fields,
  });
}

export { clampLimit };
