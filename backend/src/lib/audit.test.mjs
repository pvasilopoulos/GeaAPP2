import {
  redactAuditDetails, buildAuditFilters, AUDIT_ENTITY_TYPES, nextAuditCursor,
} from './audit.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// --- Redaction ----------------------------------------------------------------
{
  const raw = {
    email: 'a@b.gr',
    password: 'hunter2',
    password_hash: 'abc',
    token: 'tok_live_123',
    credentials: { token: 'secret-token', username: 'erp' },
    headers: { Authorization: 'Bearer abc.def', 'Content-Type': 'application/json' },
    quote_api: { url: 'https://erp.example/lines', headers: { Authorization: 'Bearer xyz' } },
    google_maps_api_key: 'AIza-secret',
    smtp_pass: 'mail-secret',
    nested: { auth_token: 'viber-token', from_name: 'SpaceHub' },
  };
  const redacted = redactAuditDetails(raw);
  assert(redacted.email === 'a@b.gr', 'non-secret kept');
  assert(redacted.password === '[redacted]', 'password redacted');
  assert(redacted.password_hash === '[redacted]', 'password_hash redacted');
  assert(redacted.token === '[redacted]', 'token redacted');
  assert(redacted.credentials === '[redacted]', 'credentials key redacted');
  assert(redacted.headers.Authorization === '[redacted]', 'Authorization header redacted');
  assert(redacted.headers['Content-Type'] === 'application/json', 'non-secret header kept');
  assert(redacted.quote_api.url === 'https://erp.example/lines', 'quote url kept');
  assert(redacted.quote_api.headers.Authorization === '[redacted]', 'nested quote Authorization redacted');
  assert(redacted.google_maps_api_key === '[redacted]', 'maps api key redacted');
  assert(redacted.smtp_pass === '[redacted]', 'smtp_pass redacted');
  assert(redacted.nested.auth_token === '[redacted]', 'nested auth_token redacted');
  assert(redacted.nested.from_name === 'SpaceHub', 'nested non-secret kept');
  assert(redactAuditDetails('Bearer abc') === '[redacted]', 'bearer string redacted');
}

// --- Query filters (tenant always first, no cross-tenant predicate) ----------
{
  const { whereSql, params } = buildAuditFilters(42, {});
  assert(whereSql === 'ae.tenant_id = ?', 'tenant-only where');
  assert(params.length === 1 && params[0] === 42, 'tenant id is first/only param');
}
{
  const { whereSql, params } = buildAuditFilters(7, {
    from: '2026-01-01',
    to: '2026-01-31',
    actorId: '12',
    entityType: 'customer',
    q: 'τιμολόγιο',
  });
  assert(params[0] === 7, 'tenant id remains first');
  assert(whereSql.includes('ae.created_at >= ?'), 'from bound');
  assert(whereSql.includes('ae.created_at <= ?'), 'to bound');
  assert(whereSql.includes('ae.actor_user_id = ?'), 'actor bound');
  assert(whereSql.includes('ae.entity_type = ?'), 'entity type bound');
  assert(whereSql.includes('ae.summary LIKE ?'), 'search bound');
  assert(params.includes('2026-01-01 00:00:00'), 'from normalized');
  assert(params.includes('2026-01-31 23:59:59'), 'to normalized');
  assert(params.includes(12), 'actor coerced to number');
  assert(params.includes('customer'), 'entity type kept');
  assert(params.filter((p) => p === '%τιμολόγιο%').length === 4, 'search applied to 4 columns');
}
{
  const ignored = buildAuditFilters(1, { entityType: 'not-a-real-type', actorId: 'nope' });
  assert(!ignored.whereSql.includes('entity_type'), 'unknown entity type ignored');
  assert(!ignored.whereSql.includes('actor_user_id'), 'non-numeric actor ignored');
  assert(ignored.params[0] === 1 && ignored.params.length === 1, 'only tenant remains');
}
{
  const other = buildAuditFilters(99, { q: 'x' });
  assert(other.params[0] === 99, 'different tenant does not leak into filters');
  assert(!other.params.includes(42), 'no leftover tenant from other calls');
}
{
  assert(AUDIT_ENTITY_TYPES.includes('customer') && AUDIT_ENTITY_TYPES.includes('settings'), 'catalog has core types');
  assert(nextAuditCursor([], 25) === null, 'empty page has no cursor');
  assert(nextAuditCursor([{ id: 1, created_at: 't' }], 25) === null, 'short page has no cursor');
  const cur = nextAuditCursor(Array.from({ length: 2 }, (_, i) => ({ id: i + 1, created_at: '2026-01-01' })), 2);
  assert(typeof cur === 'string' && cur.length > 0, 'full page yields cursor');
}

console.log('audit: ok');
