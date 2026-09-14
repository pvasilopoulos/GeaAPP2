import { query } from '../db.js';
import { verifyToken } from '../lib/auth.js';

function parsePerms(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return [];
}

// Verifies the Bearer token, loads the current user (with role + tenant), and
// attaches req.user. Loading from the DB each request keeps role/permission and
// active-state changes effective immediately.
export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Απαιτείται σύνδεση' });

    let payload;
    try { payload = verifyToken(token); } catch { return res.status(401).json({ error: 'Μη έγκυρο token' }); }

    const { rows } = await query(
      `SELECT u.id, u.tenant_id, u.email, u.full_name, u.is_active,
              r.key AS role_key, r.name AS role_name, r.permissions,
              t.name AS tenant_name, t.slug AS tenant_slug
       FROM users u JOIN roles r ON r.id = u.role_id JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = ?`, [payload.sub]);
    if (!rows.length || !rows[0].is_active) return res.status(401).json({ error: 'Ο λογαριασμός δεν είναι διαθέσιμος' });

    const u = rows[0];
    req.user = {
      id: u.id,
      tenantId: u.tenant_id,
      email: u.email,
      fullName: u.full_name,
      roleKey: u.role_key,
      roleName: u.role_name,
      permissions: parsePerms(u.permissions),
      tenantName: u.tenant_name,
      tenantSlug: u.tenant_slug,
    };
    next();
  } catch (err) {
    next(err);
  }
}

// Guards a route by required permission(s). Any one of the listed permissions
// grants access.
export function authorize(...required) {
  return (req, res, next) => {
    const perms = req.user?.permissions || [];
    if (required.some((p) => perms.includes(p))) return next();
    return res.status(403).json({ error: 'Δεν έχετε δικαίωμα για αυτή την ενέργεια' });
  };
}
