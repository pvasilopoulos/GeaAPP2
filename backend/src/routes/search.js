import { Router } from 'express';
import { query } from '../db.js';

export const searchRouter = Router();

// GET /api/search/global?q= — grouped global search across entities.
searchRouter.get('/global', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ customers: [], branches: [], spaces: [] });
    const like = `%${q}%`;

    const [customers, branches, spaces] = await Promise.all([
      query(
        `SELECT c.id, c.code, c.full_name, c.status, c.is_vip, c.city,
                (SELECT b.name FROM customer_branches cb JOIN branches b ON b.id = cb.branch_id
                 WHERE cb.customer_id = c.id ORDER BY cb.is_primary DESC LIMIT 1) AS primary_branch
         FROM customers c
         WHERE f_unaccent(lower(c.search_text)) LIKE f_unaccent(lower($1))
         ORDER BY (c.code ILIKE $2) DESC,
                  similarity(f_unaccent(lower(c.full_name)), f_unaccent(lower($3))) DESC
         LIMIT 6`, [like, q, q]),
      query(
        `SELECT id, code, name, city, area FROM branches
         WHERE f_unaccent(lower(search_text)) LIKE f_unaccent(lower($1))
         ORDER BY similarity(f_unaccent(lower(name)), f_unaccent(lower($2))) DESC
         LIMIT 5`, [like, q]),
      query(
        `SELECT s.id, s.code, s.name, s.space_type, b.name AS branch_name, b.city
         FROM spaces s JOIN branches b ON b.id = s.branch_id
         WHERE f_unaccent(lower(s.search_text)) LIKE f_unaccent(lower($1))
         ORDER BY similarity(f_unaccent(lower(s.name)), f_unaccent(lower($2))) DESC
         LIMIT 5`, [like, q]),
    ]);

    res.json({ customers: customers.rows, branches: branches.rows, spaces: spaces.rows });
  } catch (err) {
    next(err);
  }
});
