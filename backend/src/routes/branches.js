import { Router } from 'express';
import { query } from '../db.js';
import { clampLimit } from '../lib/cursor.js';
import { normalize, normalizeFields } from '../lib/normalize.js';
import { searchClause } from '../lib/search.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';

export const branchesRouter = Router();
branchesRouter.use(authorize(PERMISSIONS.BRANCHES_READ));

const FIELDS = ['name', 'address_line', 'city', 'area', 'postal_code', 'phone', 'email'];

// Ensures a customer belongs to the caller's tenant; returns it or null.
async function tenantCustomer(customerId, tenantId) {
  const { rows } = await query('SELECT id FROM customers WHERE id = ? AND tenant_id = ?', [customerId, tenantId]);
  return rows[0] || null;
}

// GET /api/branches?q=&customerId=&limit= — branches within the tenant.
branchesRouter.get('/', async (req, res, next) => {
  try {
    const qnorm = normalize(String(req.query.q || ''));
    const limit = clampLimit(req.query.limit, 20, 50);
    const params = [req.user.tenantId];
    const where = ['b.tenant_id = ?'];
    if (qnorm) { const sc = searchClause(qnorm, 'b.search_norm'); where.push(sc.clause); params.push(...sc.params); }
    if (req.query.customerId) { where.push('b.customer_id = ?'); params.push(Number(req.query.customerId)); }
    const { rows } = await query(
      `SELECT b.id, b.customer_id, b.code, b.name, b.city, b.area, b.address_line, b.spaces_count, b.image_url
       FROM branches b WHERE ${where.join(' AND ')} ORDER BY b.city, b.name LIMIT ${limit}`, params);
    res.json({ results: rows });
  } catch (err) { next(err); }
});

// POST /api/branches — create a branch owned by a customer.
branchesRouter.post('/', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const b = req.body || {};
    const customerId = Number(b.customerId);
    if (!customerId || !b.name) return res.status(400).json({ error: 'Απαιτούνται πελάτης και όνομα' });
    if (!(await tenantCustomer(customerId, req.user.tenantId))) return res.status(404).json({ error: 'Customer not found' });

    const tmp = `TMP-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const r = await query(
      `INSERT INTO branches (tenant_id, customer_id, code, name, address_line, city, area, postal_code, phone, email, is_primary, search_norm)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.tenantId, customerId, tmp, b.name, b.address_line || null, b.city || null, b.area || null,
        b.postal_code || null, b.phone || null, b.email || null, b.is_primary ? 1 : 0, '']);
    const id = r.rows.insertId;
    const code = `B-${100000 + id}`;
    await query('UPDATE branches SET code = ?, search_norm = ? WHERE id = ?',
      [code, normalizeFields(b.name, b.city, b.area, code, b.address_line), id]);
    if (b.is_primary) await query('UPDATE branches SET is_primary = 0 WHERE customer_id = ? AND id <> ?', [customerId, id]);
    await query('UPDATE customers SET branches_count = branches_count + 1 WHERE id = ?', [customerId]);
    res.status(201).json({ id, code });
  } catch (err) { next(err); }
});

branchesRouter.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM branches WHERE id = ? AND tenant_id = ?',
      [Number(req.params.id), req.user.tenantId]);
    if (!rows.length) return res.status(404).json({ error: 'Branch not found' });
    res.json({ branch: rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/branches/:id — edit a branch.
branchesRouter.patch('/:id', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cur = (await query('SELECT * FROM branches WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId])).rows[0];
    if (!cur) return res.status(404).json({ error: 'Branch not found' });
    const b = req.body || {};
    const sets = [];
    const params = [];
    for (const f of FIELDS) if (b[f] !== undefined) { sets.push(`${f} = ?`); params.push(b[f] === '' ? null : b[f]); }
    if (b.is_primary !== undefined) { sets.push('is_primary = ?'); params.push(b.is_primary ? 1 : 0); }
    const merged = { ...cur, ...b };
    sets.push('search_norm = ?'); params.push(normalizeFields(merged.name, merged.city, merged.area, cur.code, merged.address_line));
    params.push(id);
    await query(`UPDATE branches SET ${sets.join(', ')} WHERE id = ?`, params);
    if (b.is_primary) await query('UPDATE branches SET is_primary = 0 WHERE customer_id = ? AND id <> ?', [cur.customer_id, id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/branches/:id — remove a branch (and its spaces via cascade).
branchesRouter.delete('/:id', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cur = (await query('SELECT customer_id, spaces_count FROM branches WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId])).rows[0];
    if (!cur) return res.status(404).json({ error: 'Branch not found' });
    await query('DELETE FROM branches WHERE id = ?', [id]);
    await query('UPDATE customers SET branches_count = GREATEST(branches_count - 1, 0), spaces_count = GREATEST(spaces_count - ?, 0) WHERE id = ?',
      [cur.spaces_count, cur.customer_id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
