import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { hashPassword } from '../lib/auth.js';
import { PERMISSIONS, ROLE_KEYS } from '../lib/permissions.js';

export const usersRouter = Router();

// GET /api/roles — available roles for assignment.
usersRouter.get('/roles', authorize(PERMISSIONS.USERS_MANAGE), async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT id, `key`, name, permissions FROM roles ORDER BY id');
    for (const r of rows) {
      if (typeof r.permissions === 'string') { try { r.permissions = JSON.parse(r.permissions); } catch { r.permissions = []; } }
    }
    res.json({ roles: rows });
  } catch (err) { next(err); }
});

// GET /api/users — users within the current tenant.
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

async function roleIdByKey(key) {
  const { rows } = await query('SELECT id FROM roles WHERE `key` = ?', [key]);
  return rows[0]?.id || null;
}

// POST /api/users — create a user in the current tenant.
usersRouter.post('/users', authorize(PERMISSIONS.USERS_MANAGE), async (req, res, next) => {
  try {
    const { email, firstName, lastName, password, roleKey } = req.body || {};
    if (!email || !firstName || !password || !roleKey) {
      return res.status(400).json({ error: 'Συμπληρώστε email, όνομα, κωδικό και ρόλο' });
    }
    if (!ROLE_KEYS.includes(roleKey)) return res.status(400).json({ error: 'Άγνωστος ρόλος' });
    if (roleKey === 'owner' && req.user.roleKey !== 'owner') {
      return res.status(403).json({ error: 'Μόνο ο ιδιοκτήτης μπορεί να ορίσει ρόλο ιδιοκτήτη' });
    }
    if (String(password).length < 6) return res.status(400).json({ error: 'Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες' });
    const exists = await query('SELECT id FROM users WHERE email = ?', [String(email).toLowerCase()]);
    if (exists.rows.length) return res.status(409).json({ error: 'Το email χρησιμοποιείται ήδη' });

    const roleId = await roleIdByKey(roleKey);
    const hash = await hashPassword(String(password));
    const r = await query(
      `INSERT INTO users (tenant_id, role_id, email, password_hash, first_name, last_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.tenantId, roleId, String(email).toLowerCase(), hash, firstName, lastName || '']);
    res.status(201).json({ id: r.rows.insertId });
  } catch (err) { next(err); }
});

// PATCH /api/users/:id — update role / active state (same tenant only).
usersRouter.patch('/users/:id', authorize(PERMISSIONS.USERS_MANAGE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = await query('SELECT id, tenant_id, role_id FROM users WHERE id = ?', [id]);
    if (!target.rows.length || target.rows[0].tenant_id !== req.user.tenantId) {
      return res.status(404).json({ error: 'Ο χρήστης δεν βρέθηκε' });
    }
    const sets = [];
    const params = [];
    if (req.body.roleKey) {
      if (!ROLE_KEYS.includes(req.body.roleKey)) return res.status(400).json({ error: 'Άγνωστος ρόλος' });
      if (req.body.roleKey === 'owner' && req.user.roleKey !== 'owner') {
        return res.status(403).json({ error: 'Μόνο ο ιδιοκτήτης μπορεί να ορίσει ρόλο ιδιοκτήτη' });
      }
      sets.push('role_id = ?'); params.push(await roleIdByKey(req.body.roleKey));
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
