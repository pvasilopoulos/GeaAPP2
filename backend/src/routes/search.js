import { Router } from 'express';
import { query } from '../db.js';
import { normalize } from '../lib/normalize.js';
import { searchClause } from '../lib/search.js';

export const searchRouter = Router();

// GET /api/search/global?q= — grouped global search across entities.
searchRouter.get('/global', async (req, res, next) => {
  try {
    const qnorm = normalize(String(req.query.q || ''));
    if (qnorm.length < 2) return res.json({ customers: [], branches: [], spaces: [] });

    const c = searchClause(qnorm, 'c.search_norm');
    const b = searchClause(qnorm, 'search_norm');
    const s = searchClause(qnorm, 's.search_norm');

    const [customers, branches, spaces] = await Promise.all([
      query(
        `SELECT c.id, c.code, c.full_name, c.status, c.is_vip, c.city,
                (SELECT b.name FROM customer_branches cb JOIN branches b ON b.id = cb.branch_id
                 WHERE cb.customer_id = c.id ORDER BY cb.is_primary DESC LIMIT 1) AS primary_branch
         FROM customers c
         WHERE ${c.clause}
         ORDER BY c.last_visit_sort DESC LIMIT 6`, c.params),
      query(
        `SELECT id, code, name, city, area FROM branches WHERE ${b.clause} LIMIT 5`, b.params),
      query(
        `SELECT s.id, s.code, s.name, s.space_type, b.name AS branch_name, b.city
         FROM spaces s JOIN branches b ON b.id = s.branch_id
         WHERE ${s.clause} LIMIT 5`, s.params),
    ]);

    res.json({ customers: customers.rows, branches: branches.rows, spaces: spaces.rows });
  } catch (err) {
    next(err);
  }
});
