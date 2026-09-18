import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { hashPassword } from '../lib/auth.js';
import { PERMISSIONS, PERMISSION_CATALOG, isValidPermission, expandPermissions } from '../lib/permissions.js';
import { logAuditFromReq } from '../lib/audit.js';

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
async function ownerCount(tenantId) {
  const { rows } = await query(
    `SELECT COUNT(*) AS c FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.tenant_id = ? AND r.\`key\` = 'owner'`, [tenantId]);
  return Number(rows[0].c);
}

async function loadUserRow(id, tenantId) {
  const { rows } = await query(
    `SELECT u.id, u.tenant_id, u.email, u.first_name, u.last_name, u.is_active, r.\`key\` AS role_key
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.tenant_id = ?`,
    [id, tenantId]);
  return rows[0] || null;
}

// ---- Permission catalog ----------------------------------------------------
usersRouter.get('/permissions', authorize(PERMISSIONS.ROLES_MANAGE), (_req, res) => {
  res.json({ permissions: PERMISSION_CATALOG.filter((p) => p.code !== PERMISSIONS.TENANTS_PLATFORM) });
});

// ---- Roles (tenant-scoped) -------------------------------------------------
usersRouter.get('/roles', authorize(PERMISSIONS.USERS_MANAGE, PERMISSIONS.ROLES_MANAGE), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.id, r.\`key\`, r.name, r.permissions, r.is_system,
              (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count
       FROM roles r WHERE r.tenant_id = ? ORDER BY r.id`, [req.user.tenantId]);
    for (const r of rows) { r.permissions = expandPermissions(parsePerms(r.permissions)); r.user_count = Number(r.user_count); }
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
    await logAuditFromReq(query, req, {
      action: 'create', entityType: 'role', entityId: r.rows.insertId,
      summary: `Δημιουργία ρόλου: ${String(name).trim()}`,
    });
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
    await logAuditFromReq(query, req, {
      action: 'update', entityType: 'role', entityId: id,
      summary: `Ενημέρωση ρόλου: ${rows[0].key}`,
      details: { keys: Object.keys(req.body || {}).filter((k) => req.body[k] !== undefined) },
    });
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
    await logAuditFromReq(query, req, {
      action: 'delete', entityType: 'role', entityId: id,
      summary: `Διαγραφή ρόλου: ${rows[0].key}`,
    });
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
    await logAuditFromReq(query, req, {
      action: 'create', entityType: 'user', entityId: r.rows.insertId,
      summary: `Δημιουργία χρήστη: ${String(email).toLowerCase()}`,
      details: { roleKey, email: String(email).toLowerCase() },
    });
    res.status(201).json({ id: r.rows.insertId });
  } catch (err) { next(err); }
});

usersRouter.patch('/users/:id', authorize(PERMISSIONS.USERS_MANAGE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = await loadUserRow(id, req.user.tenantId);
    if (!target) return res.status(404).json({ error: 'Ο χρήστης δεν βρέθηκε' });
    const sets = [];
    const params = [];
    if (req.body.firstName !== undefined) {
      const v = String(req.body.firstName || '').trim();
      if (!v) return res.status(400).json({ error: 'Το όνομα είναι υποχρεωτικό' });
      sets.push('first_name = ?'); params.push(v);
    }
    if (req.body.lastName !== undefined) {
      sets.push('last_name = ?'); params.push(String(req.body.lastName || '').trim());
    }
    if (req.body.email !== undefined) {
      const email = String(req.body.email).trim().toLowerCase();
      if (!email) return res.status(400).json({ error: 'Το email είναι υποχρεωτικό' });
      const exists = await query('SELECT id FROM users WHERE email = ? AND id <> ?', [email, id]);
      if (exists.rows.length) return res.status(409).json({ error: 'Το email χρησιμοποιείται ήδη' });
      sets.push('email = ?'); params.push(email);
    }
    if (req.body.password) {
      if (String(req.body.password).length < 6) return res.status(400).json({ error: 'Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες' });
      sets.push('password_hash = ?'); params.push(await hashPassword(String(req.body.password)));
    }
    if (req.body.roleKey) {
      const role = await roleByKey(req.user.tenantId, req.body.roleKey);
      if (!role) return res.status(400).json({ error: 'Άγνωστος ρόλος' });
      if (req.body.roleKey === 'owner' && req.user.roleKey !== 'owner') {
        return res.status(403).json({ error: 'Μόνο ο ιδιοκτήτης μπορεί να ορίσει ρόλο ιδιοκτήτη' });
      }
      if (target.role_key === 'owner' && req.body.roleKey !== 'owner' && (await ownerCount(req.user.tenantId)) <= 1) {
        return res.status(400).json({ error: 'Δεν μπορεί να μείνει ο οργανισμός χωρίς ιδιοκτήτη' });
      }
      if (id === req.user.id && req.body.roleKey !== target.role_key && target.role_key === 'owner') {
        return res.status(400).json({ error: 'Δεν μπορείτε να αλλάξετε τον δικό σας ρόλο ιδιοκτήτη' });
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
    const changed = Object.keys(req.body || {}).filter((k) => req.body[k] !== undefined && k !== 'password');
    if (req.body.password) changed.push('passwordChanged');
    await logAuditFromReq(query, req, {
      action: 'update', entityType: 'user', entityId: id,
      summary: `Ενημέρωση χρήστη: ${target.email}`,
      details: { keys: changed, roleKey: req.body.roleKey || undefined },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

usersRouter.delete('/users/:id', authorize(PERMISSIONS.USERS_MANAGE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'Δεν μπορείτε να διαγράψετε τον εαυτό σας' });
    const target = await loadUserRow(id, req.user.tenantId);
    if (!target) return res.status(404).json({ error: 'Ο χρήστης δεν βρέθηκε' });
    if (target.role_key === 'owner' && (await ownerCount(req.user.tenantId)) <= 1) {
      return res.status(400).json({ error: 'Δεν μπορεί να μείνει ο οργανισμός χωρίς ιδιοκτήτη' });
    }
    await query('DELETE FROM users WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId]);
    await logAuditFromReq(query, req, {
      action: 'delete', entityType: 'user', entityId: id,
      summary: `Διαγραφή χρήστη: ${target.email}`,
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
