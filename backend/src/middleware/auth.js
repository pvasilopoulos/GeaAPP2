import { query } from '../db.js';
import { verifyToken } from '../lib/auth.js';
import { TENANT_PERMISSIONS } from '../lib/permissions.js';

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
      `SELECT u.id, u.tenant_id, u.email, u.full_name, u.is_active, u.is_platform_admin,
              r.key AS role_key, r.name AS role_name, r.permissions,
              t.name AS tenant_name, t.slug AS tenant_slug, t.status AS tenant_status
       FROM users u JOIN roles r ON r.id = u.role_id JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = ?`, [payload.sub]);
    if (!rows.length || !rows[0].is_active) return res.status(401).json({ error: 'Ο λογαριασμός δεν είναι διαθέσιμος' });

    const u = rows[0];
    if (u.tenant_status === 'suspended' && !u.is_platform_admin) {
      return res.status(403).json({ error: 'Ο οργανισμός έχει ανασταλεί' });
    }
    const permissions = u.role_key === 'owner' ? [...TENANT_PERMISSIONS] : parsePerms(u.permissions);
    req.user = {
      id: u.id,
      tenantId: u.tenant_id,
      email: u.email,
      fullName: u.full_name,
      roleKey: u.role_key,
      roleName: u.role_name,
      permissions,
      tenantName: u.tenant_name,
      tenantSlug: u.tenant_slug,
      isPlatformAdmin: !!u.is_platform_admin,
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
