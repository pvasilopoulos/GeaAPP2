import { Router } from 'express';
import { query } from '../db.js';
import { clampLimit } from '../lib/cursor.js';
import { normalize } from '../lib/normalize.js';
import { searchClause } from '../lib/search.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';

export const branchesRouter = Router();
branchesRouter.use(authorize(PERMISSIONS.BRANCHES_READ));

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
  } catch (err) {
    next(err);
  }
});

branchesRouter.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM branches WHERE id = ? AND tenant_id = ?',
      [Number(req.params.id), req.user.tenantId]);
    if (!rows.length) return res.status(404).json({ error: 'Branch not found' });
    res.json({ branch: rows[0] });
  } catch (err) {
    next(err);
  }
});
