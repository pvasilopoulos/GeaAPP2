import { Router } from 'express';
import { query } from '../db.js';
import { clampLimit } from '../lib/cursor.js';
import { normalize, normalizeFields } from '../lib/normalize.js';
import { searchClause } from '../lib/search.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { logActivity } from '../lib/activity.js';
import {
  defaultOpeningHours, isBranchStatus, parseJson, sanitizeHours,
} from '../lib/masterData.js';
import { loadEntityCustomFields, saveEntityCustomFields } from '../lib/customFields.js';

export const branchesRouter = Router();
branchesRouter.use(authorize(PERMISSIONS.BRANCHES_READ));

const FIELDS = ['name', 'address_line', 'city', 'area', 'postal_code', 'phone', 'email', 'image_url'];

async function tenantCustomer(customerId, tenantId) {
  const { rows } = await query('SELECT id FROM customers WHERE id = ? AND tenant_id = ?', [customerId, tenantId]);
  return rows[0] || null;
}

function shapeBranch(row) {
  if (!row) return row;
  return { ...row, opening_hours: parseJson(row.opening_hours, defaultOpeningHours()) };
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
      `SELECT b.id, b.customer_id, b.code, b.name, b.city, b.area, b.address_line, b.spaces_count,
              b.image_url, b.status, b.lat, b.lng
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
    const status = isBranchStatus(b.status) ? b.status : 'active';
    const hours = JSON.stringify(sanitizeHours(b.opening_hours));
    const managerId = b.manager_employee_id ? Number(b.manager_employee_id) : null;

    const tmp = `TMP-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const r = await query(
      `INSERT INTO branches (tenant_id, customer_id, code, name, address_line, city, area, postal_code,
        phone, email, image_url, lat, lng, is_primary, status, manager_employee_id, opening_hours, search_norm)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.tenantId, customerId, tmp, b.name, b.address_line || null, b.city || null, b.area || null,
        b.postal_code || null, b.phone || null, b.email || null, b.image_url || null,
        b.lat != null && b.lat !== '' ? Number(b.lat) : null,
        b.lng != null && b.lng !== '' ? Number(b.lng) : null,
        b.is_primary ? 1 : 0, status, managerId, hours, '']);
    const id = r.rows.insertId;
    const code = `B-${100000 + id}`;
    await query('UPDATE branches SET code = ?, search_norm = ? WHERE id = ?',
      [code, normalizeFields(b.name, b.city, b.area, code, b.address_line), id]);
    if (b.is_primary) await query('UPDATE branches SET is_primary = 0 WHERE customer_id = ? AND id <> ?', [customerId, id]);
    await query('UPDATE customers SET branches_count = branches_count + 1 WHERE id = ?', [customerId]);
    await logActivity({
      tenantId: req.user.tenantId, customerId, type: 'branch_created',
      description: `Νέο υποκατάστημα: ${b.name}`, branchId: id,
    });
    res.status(201).json({ id, code });
  } catch (err) { next(err); }
});

branchesRouter.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT b.*, e.full_name AS manager_name
       FROM branches b LEFT JOIN employees e ON e.id = b.manager_employee_id
       WHERE b.id = ? AND b.tenant_id = ?`,
      [Number(req.params.id), req.user.tenantId]);
    if (!rows.length) return res.status(404).json({ error: 'Branch not found' });
    res.json({ branch: shapeBranch(rows[0]) });
  } catch (err) { next(err); }
});

branchesRouter.get('/:id/custom-fields', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cur = (await query('SELECT id FROM branches WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId])).rows[0];
    if (!cur) return res.status(404).json({ error: 'Branch not found' });
    const fields = await loadEntityCustomFields(query, {
      tenantId: req.user.tenantId, entityType: 'branch', entityId: id,
    });
    res.json({ fields });
  } catch (err) { next(err); }
});

branchesRouter.put('/:id/custom-fields', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cur = (await query('SELECT id FROM branches WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId])).rows[0];
    if (!cur) return res.status(404).json({ error: 'Branch not found' });
    await saveEntityCustomFields(query, {
      tenantId: req.user.tenantId, entityType: 'branch', entityId: id, values: req.body?.values || {},
    });
    res.json({ ok: true });
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
    if (b.status !== undefined) {
      if (!isBranchStatus(b.status)) return res.status(400).json({ error: 'Μη έγκυρη κατάσταση υποκαταστήματος' });
      sets.push('status = ?'); params.push(b.status);
    }
    if (b.manager_employee_id !== undefined) {
      sets.push('manager_employee_id = ?'); params.push(b.manager_employee_id ? Number(b.manager_employee_id) : null);
    }
    if (b.opening_hours !== undefined) { sets.push('opening_hours = ?'); params.push(JSON.stringify(sanitizeHours(b.opening_hours))); }
    if (b.lat !== undefined) { sets.push('lat = ?'); params.push(b.lat === '' || b.lat == null ? null : Number(b.lat)); }
    if (b.lng !== undefined) { sets.push('lng = ?'); params.push(b.lng === '' || b.lng == null ? null : Number(b.lng)); }
    const merged = { ...cur, ...b };
    sets.push('search_norm = ?'); params.push(normalizeFields(merged.name, merged.city, merged.area, cur.code, merged.address_line));
    params.push(id);
    await query(`UPDATE branches SET ${sets.join(', ')} WHERE id = ?`, params);
    if (b.is_primary) await query('UPDATE branches SET is_primary = 0 WHERE customer_id = ? AND id <> ?', [cur.customer_id, id]);
    await logActivity({
      tenantId: req.user.tenantId, customerId: cur.customer_id, type: 'branch_updated',
      description: `Ενημέρωση υποκαταστήματος: ${merged.name || cur.name}`, branchId: id,
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/branches/:id — remove a branch (and its spaces via cascade).
branchesRouter.delete('/:id', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cur = (await query('SELECT customer_id, spaces_count, name FROM branches WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId])).rows[0];
    if (!cur) return res.status(404).json({ error: 'Branch not found' });
    await query('DELETE FROM branches WHERE id = ?', [id]);
    await query('UPDATE customers SET branches_count = GREATEST(branches_count - 1, 0), spaces_count = GREATEST(spaces_count - ?, 0) WHERE id = ?',
      [cur.spaces_count, cur.customer_id]);
    await logActivity({
      tenantId: req.user.tenantId, customerId: cur.customer_id, type: 'branch_deleted',
      description: `Διαγραφή υποκαταστήματος: ${cur.name}`,
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
