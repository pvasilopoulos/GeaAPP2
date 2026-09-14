import { Router } from 'express';
import { query } from '../db.js';
import { clampLimit } from '../lib/cursor.js';
import { normalize } from '../lib/normalize.js';
import { searchClause } from '../lib/search.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';

export const spacesRouter = Router();
spacesRouter.use(authorize(PERMISSIONS.SPACES_READ));

// GET /api/spaces?q=&branchId=&limit= — spaces within the tenant.
spacesRouter.get('/', async (req, res, next) => {
  try {
    const qnorm = normalize(String(req.query.q || ''));
    const limit = clampLimit(req.query.limit, 20, 50);
    const params = [req.user.tenantId];
    const where = ['s.tenant_id = ?'];
    if (qnorm) { const sc = searchClause(qnorm, 's.search_norm'); where.push(sc.clause); params.push(...sc.params); }
    if (req.query.branchId) { where.push('s.branch_id = ?'); params.push(Number(req.query.branchId)); }
    const { rows } = await query(
      `SELECT s.id, s.customer_id, s.branch_id, s.code, s.name, s.space_type, s.capacity, s.image_url,
              b.name AS branch_name, b.city
       FROM spaces s JOIN branches b ON b.id = s.branch_id
       WHERE ${where.join(' AND ')} ORDER BY b.city, s.name LIMIT ${limit}`, params);
    res.json({ results: rows });
  } catch (err) {
    next(err);
  }
});

spacesRouter.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.*, b.name AS branch_name, b.city FROM spaces s
       JOIN branches b ON b.id = s.branch_id WHERE s.id = ? AND s.tenant_id = ?`,
      [Number(req.params.id), req.user.tenantId]);
    if (!rows.length) return res.status(404).json({ error: 'Space not found' });
    res.json({ space: rows[0] });
  } catch (err) {
    next(err);
  }
});
