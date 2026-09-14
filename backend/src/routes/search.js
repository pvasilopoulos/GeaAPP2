import { Router } from 'express';
import { query } from '../db.js';
import { normalize } from '../lib/normalize.js';
import { searchClause } from '../lib/search.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';

export const searchRouter = Router();
searchRouter.use(authorize(PERMISSIONS.CUSTOMERS_READ));

// GET /api/search/global?q= — grouped global search across entities (tenant-scoped).
searchRouter.get('/global', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const qnorm = normalize(String(req.query.q || ''));
    if (qnorm.length < 2) return res.json({ customers: [], branches: [], spaces: [] });

    const c = searchClause(qnorm, 'c.search_norm');
    const b = searchClause(qnorm, 'b.search_norm');
    const s = searchClause(qnorm, 's.search_norm');

    const [customers, branches, spaces] = await Promise.all([
      query(
        `SELECT c.id, c.code, c.full_name, c.status, c.is_vip, c.city,
                (SELECT b.name FROM branches b WHERE b.customer_id = c.id
                 ORDER BY b.is_primary DESC LIMIT 1) AS primary_branch
         FROM customers c
         WHERE c.tenant_id = ? AND ${c.clause}
         ORDER BY c.last_visit_sort DESC LIMIT 6`, [tenantId, ...c.params]),
      query(
        `SELECT b.id, b.customer_id, b.code, b.name, b.city, b.area
         FROM branches b WHERE b.tenant_id = ? AND ${b.clause} LIMIT 5`, [tenantId, ...b.params]),
      query(
        `SELECT s.id, s.customer_id, s.code, s.name, s.space_type, b.name AS branch_name, b.city
         FROM spaces s JOIN branches b ON b.id = s.branch_id
         WHERE s.tenant_id = ? AND ${s.clause} LIMIT 5`, [tenantId, ...s.params]),
    ]);

    res.json({ customers: customers.rows, branches: branches.rows, spaces: spaces.rows });
  } catch (err) {
    next(err);
  }
});
