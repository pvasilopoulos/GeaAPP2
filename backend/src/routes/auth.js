import { Router } from 'express';
import { query } from '../db.js';
import { hashPassword, verifyPassword, signToken } from '../lib/auth.js';
import { authenticate } from '../middleware/auth.js';
import { normalize } from '../lib/normalize.js';

export const authRouter = Router();

function publicUser(u) {
  return {
    id: u.id, email: u.email, fullName: u.fullName ?? u.full_name,
    roleKey: u.roleKey ?? u.role_key, roleName: u.roleName ?? u.role_name,
    permissions: u.permissions,
    tenantId: u.tenantId ?? u.tenant_id,
    tenantName: u.tenantName ?? u.tenant_name,
  };
}

async function uniqueSlug(base) {
  let slug = normalize(base).replace(/\s+/g, '-').slice(0, 140) || 'tenant';
  let candidate = slug;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while ((await query('SELECT id FROM tenants WHERE slug = ?', [candidate])).rows.length) {
    candidate = `${slug}-${++n}`;
  }
  return candidate;
}

// POST /api/auth/register — self-service signup: creates a tenant + owner user.
authRouter.post('/register', async (req, res, next) => {
  try {
    const { tenantName, firstName, lastName, email, password } = req.body || {};
    if (!tenantName || !firstName || !email || !password) {
      return res.status(400).json({ error: 'Συμπληρώστε επωνυμία, όνομα, email και κωδικό' });
    }
    if (String(password).length < 6) return res.status(400).json({ error: 'Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες' });

    const exists = await query('SELECT id FROM users WHERE email = ?', [String(email).toLowerCase()]);
    if (exists.rows.length) return res.status(409).json({ error: 'Το email χρησιμοποιείται ήδη' });

    const slug = await uniqueSlug(tenantName);
    const t = await query('INSERT INTO tenants (name, slug) VALUES (?, ?)', [tenantName, slug]);
    const tenantId = t.rows.insertId;
    const role = await query("SELECT id FROM roles WHERE `key` = 'owner'");
    const hash = await hashPassword(String(password));
    const u = await query(
      `INSERT INTO users (tenant_id, role_id, email, password_hash, first_name, last_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId, role.rows[0].id, String(email).toLowerCase(), hash, firstName, lastName || '']);

    const token = signToken({ sub: u.rows.insertId });
    const me = await loadUser(u.rows.insertId);
    res.status(201).json({ token, user: publicUser(me) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Συμπληρώστε email και κωδικό' });
    const { rows } = await query('SELECT * FROM users WHERE email = ?', [String(email).toLowerCase()]);
    const user = rows[0];
    if (!user || !user.is_active) return res.status(401).json({ error: 'Λάθος στοιχεία σύνδεσης' });
    const ok = await verifyPassword(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Λάθος στοιχεία σύνδεσης' });
    await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
    const token = signToken({ sub: user.id });
    const me = await loadUser(user.id);
    res.json({ token, user: publicUser(me) });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — current authenticated user.
authRouter.get('/me', authenticate, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

async function loadUser(id) {
  const { rows } = await query(
    `SELECT u.id, u.tenant_id, u.email, u.full_name,
            r.key AS role_key, r.name AS role_name, r.permissions,
            t.name AS tenant_name
     FROM users u JOIN roles r ON r.id = u.role_id JOIN tenants t ON t.id = u.tenant_id
     WHERE u.id = ?`, [id]);
  const u = rows[0];
  u.permissions = Array.isArray(u.permissions) ? u.permissions
    : (typeof u.permissions === 'string' ? JSON.parse(u.permissions) : []);
  return u;
}
