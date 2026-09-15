import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { hashPassword } from '../lib/auth.js';
import { PERMISSIONS, PERMISSION_CATALOG, isValidPermission } from '../lib/permissions.js';

export const usersRouter = Router();

function parsePerms(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return [];
}
async function roleByKey(tenantId, key) {
  const { rows } = await query('SELECT id, `key` FROM roles WHERE tenant_id = ? AND `key` = ?', [tenantId, key]);
  return rows[0] || null;
}

// ---- Permission catalog ----------------------------------------------------
usersRouter.get('/permissions', authorize(PERMISSIONS.ROLES_MANAGE), (_req, res) => {
  res.json({ permissions: PERMISSION_CATALOG });
});

// ---- Roles (tenant-scoped) -------------------------------------------------
usersRouter.get('/roles', authorize(PERMISSIONS.USERS_MANAGE, PERMISSIONS.ROLES_MANAGE), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.id, r.\`key\`, r.name, r.permissions, r.is_system,
              (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count
       FROM roles r WHERE r.tenant_id = ? ORDER BY r.id`, [req.user.tenantId]);
    for (const r of rows) { r.permissions = parsePerms(r.permissions); r.user_count = Number(r.user_count); }
    res.json({ roles: rows });
  } catch (err) { next(err); }
});

usersRouter.post('/roles', authorize(PERMISSIONS.ROLES_MANAGE), async (req, res, next) => {
  try {
    const { name, permissions } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Δώστε όνομα ρόλου' });
    const perms = Array.isArray(permissions) ? permissions.filter(isValidPermission) : [];
    const key = `custom-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
    const r = await query(
      'INSERT INTO roles (tenant_id, `key`, name, permissions, is_system) VALUES (?, ?, ?, ?, 0)',
      [req.user.tenantId, key, String(name).trim(), JSON.stringify(perms)]);
    res.status(201).json({ id: r.rows.insertId, key });
  } catch (err) { next(err); }
});

usersRouter.patch('/roles/:id', authorize(PERMISSIONS.ROLES_MANAGE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await query('SELECT id, `key` FROM roles WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId]);
    if (!rows.length) return res.status(404).json({ error: 'Ο ρόλος δεν βρέθηκε' });
    if (rows[0].key === 'owner') return res.status(400).json({ error: 'Ο ρόλος Ιδιοκτήτη έχει πάντα όλα τα δικαιώματα και δεν επεξεργάζεται' });

    const sets = [];
    const params = [];
    if (req.body.name !== undefined) { sets.push('name = ?'); params.push(String(req.body.name).trim()); }
    if (req.body.permissions !== undefined) {
      const perms = Array.isArray(req.body.permissions) ? req.body.permissions.filter(isValidPermission) : [];
      sets.push('permissions = ?'); params.push(JSON.stringify(perms));
    }
    if (!sets.length) return res.status(400).json({ error: 'Καμία αλλαγή' });
    params.push(id);
    await query(`UPDATE roles SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

usersRouter.delete('/roles/:id', authorize(PERMISSIONS.ROLES_MANAGE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await query('SELECT id, `key` FROM roles WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId]);
    if (!rows.length) return res.status(404).json({ error: 'Ο ρόλος δεν βρέθηκε' });
    if (rows[0].key === 'owner') return res.status(400).json({ error: 'Ο ρόλος Ιδιοκτήτη δεν διαγράφεται' });
    const inUse = await query('SELECT COUNT(*) AS c FROM users WHERE role_id = ?', [id]);
    if (Number(inUse.rows[0].c) > 0) return res.status(400).json({ error: 'Ο ρόλος χρησιμοποιείται από χρήστες — αλλάξτε τους πρώτα' });
    await query('DELETE FROM roles WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---- Users -----------------------------------------------------------------
usersRouter.get('/users', authorize(PERMISSIONS.USERS_MANAGE), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.first_name, u.last_name, u.is_active,
              u.last_login_at, u.created_at, r.key AS role_key, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.tenant_id = ? ORDER BY u.created_at DESC`, [req.user.tenantId]);
    res.json({ users: rows });
  } catch (err) { next(err); }
});

usersRouter.post('/users', authorize(PERMISSIONS.USERS_MANAGE), async (req, res, next) => {
  try {
    const { email, firstName, lastName, password, roleKey } = req.body || {};
    if (!email || !firstName || !password || !roleKey) {
      return res.status(400).json({ error: 'Συμπληρώστε email, όνομα, κωδικό και ρόλο' });
    }
    const role = await roleByKey(req.user.tenantId, roleKey);
    if (!role) return res.status(400).json({ error: 'Άγνωστος ρόλος' });
    if (roleKey === 'owner' && req.user.roleKey !== 'owner') {
      return res.status(403).json({ error: 'Μόνο ο ιδιοκτήτης μπορεί να ορίσει ρόλο ιδιοκτήτη' });
    }
    if (String(password).length < 6) return res.status(400).json({ error: 'Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες' });
    const exists = await query('SELECT id FROM users WHERE email = ?', [String(email).toLowerCase()]);
    if (exists.rows.length) return res.status(409).json({ error: 'Το email χρησιμοποιείται ήδη' });

    const hash = await hashPassword(String(password));
    const r = await query(
      `INSERT INTO users (tenant_id, role_id, email, password_hash, first_name, last_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.tenantId, role.id, String(email).toLowerCase(), hash, firstName, lastName || '']);
    res.status(201).json({ id: r.rows.insertId });
  } catch (err) { next(err); }
});

usersRouter.patch('/users/:id', authorize(PERMISSIONS.USERS_MANAGE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = await query('SELECT id, tenant_id FROM users WHERE id = ?', [id]);
    if (!target.rows.length || target.rows[0].tenant_id !== req.user.tenantId) {
      return res.status(404).json({ error: 'Ο χρήστης δεν βρέθηκε' });
    }
    const sets = [];
    const params = [];
    if (req.body.roleKey) {
      const role = await roleByKey(req.user.tenantId, req.body.roleKey);
      if (!role) return res.status(400).json({ error: 'Άγνωστος ρόλος' });
      if (req.body.roleKey === 'owner' && req.user.roleKey !== 'owner') {
        return res.status(403).json({ error: 'Μόνο ο ιδιοκτήτης μπορεί να ορίσει ρόλο ιδιοκτήτη' });
      }
      sets.push('role_id = ?'); params.push(role.id);
    }
    if (req.body.isActive !== undefined) {
      if (id === req.user.id && !req.body.isActive) return res.status(400).json({ error: 'Δεν μπορείτε να απενεργοποιήσετε τον εαυτό σας' });
      sets.push('is_active = ?'); params.push(req.body.isActive ? 1 : 0);
    }
    if (!sets.length) return res.status(400).json({ error: 'Καμία αλλαγή' });
    params.push(id);
    await query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
