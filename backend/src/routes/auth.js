import { Router } from 'express';
import { query } from '../db.js';
import { verifyPassword, signToken } from '../lib/auth.js';
import { authenticate } from '../middleware/auth.js';
import { TENANT_PERMISSIONS, expandPermissions } from '../lib/permissions.js';
import { createTenantWithOwner, getPlatformSetting, getPlatformSettings } from '../lib/tenants.js';
import { logAudit, clientIp } from '../lib/audit.js';

export const authRouter = Router();

function parsePerms(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return [];
}

function publicUser(u) {
  const permissions = u.roleKey === 'owner' || u.role_key === 'owner'
    ? [...TENANT_PERMISSIONS]
    : expandPermissions(u.permissions || []);
  return {
    id: u.id, email: u.email, fullName: u.fullName ?? u.full_name,
    roleKey: u.roleKey ?? u.role_key, roleName: u.roleName ?? u.role_name,
    permissions,
    tenantId: u.tenantId ?? u.tenant_id,
    tenantName: u.tenantName ?? u.tenant_name,
    tenantSlug: u.tenantSlug ?? u.tenant_slug,
    isPlatformAdmin: !!(u.isPlatformAdmin ?? u.is_platform_admin),
  };
}

authRouter.get('/public-settings', async (_req, res, next) => {
  try {
    const settings = await getPlatformSettings(query);
    res.json({ allow_self_register: settings.allow_self_register !== false });
  } catch (err) { next(err); }
});

authRouter.post('/register', async (req, res, next) => {
  try {
    const allow = await getPlatformSetting(query, 'allow_self_register', true);
    if (!allow) return res.status(403).json({ error: 'Η αυτόματη εγγραφή οργανισμών είναι απενεργοποιημένη' });
    const { tenantName, firstName, lastName, email, password } = req.body || {};
    const tenant = await createTenantWithOwner(query, {
      name: tenantName,
      owner: { firstName, lastName, email, password },
      status: 'trial',
      plan: 'trial',
    });
    const { rows } = await query('SELECT id FROM users WHERE email = ?', [String(email).toLowerCase()]);
    const token = signToken({ sub: rows[0].id });
    const me = await loadUser(rows[0].id);
    res.status(201).json({ token, user: publicUser(me), tenant });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Συμπληρώστε email και κωδικό' });
    const { rows } = await query(
      `SELECT u.*, t.status AS tenant_status
       FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.email = ?`,
      [String(email).toLowerCase()]);
    const user = rows[0];
    if (!user || !user.is_active) return res.status(401).json({ error: 'Λάθος στοιχεία σύνδεσης' });
    const ok = await verifyPassword(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Λάθος στοιχεία σύνδεσης' });
    if (user.tenant_status === 'suspended' && !user.is_platform_admin) {
      return res.status(403).json({ error: 'Ο οργανισμός έχει ανασταλεί' });
    }
    await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
    const token = signToken({ sub: user.id });
    const me = await loadUser(user.id);
    await logAudit(query, {
      tenantId: user.tenant_id,
      actorUserId: user.id,
      actorName: user.full_name || user.email,
      action: 'login',
      entityType: 'user',
      entityId: user.id,
      summary: 'Επιτυχής σύνδεση',
      ip: clientIp(req),
    });
    res.json({ token, user: publicUser(me) });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', authenticate, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

async function loadUser(id) {
  const { rows } = await query(
    `SELECT u.id, u.tenant_id, u.email, u.full_name, u.is_platform_admin,
            r.key AS role_key, r.name AS role_name, r.permissions,
            t.name AS tenant_name, t.slug AS tenant_slug
     FROM users u JOIN roles r ON r.id = u.role_id JOIN tenants t ON t.id = u.tenant_id
     WHERE u.id = ?`, [id]);
  const u = rows[0];
  u.permissions = parsePerms(u.permissions);
  return u;
}
