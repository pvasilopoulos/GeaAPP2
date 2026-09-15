import { ROLE_TEMPLATES } from './permissions.js';

// Inserts the default role set for a tenant and returns a { key: id } map.
// `query` is the shared db.query wrapper (returns { rows }).
export async function insertTenantRoles(query, tenantId) {
  const rows = ROLE_TEMPLATES.map((r) => [tenantId, r.key, r.name, JSON.stringify(r.permissions), 1]);
  await query('INSERT INTO roles (tenant_id, `key`, name, permissions, is_system) VALUES ?', [rows]);
  const res = await query('SELECT id, `key` FROM roles WHERE tenant_id = ?', [tenantId]);
  const map = {};
  for (const row of res.rows) map[row.key] = row.id;
  return map;
}
