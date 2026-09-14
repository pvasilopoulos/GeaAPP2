import { Router } from 'express';
import { query } from '../db.js';
import { clampLimit } from '../lib/cursor.js';

export const branchesRouter = Router();

// GET /api/branches?q=&limit= — async searchable selector source.
branchesRouter.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = clampLimit(req.query.limit, 20, 50);
    const params = [];
    let where = '';
    if (q) {
      params.push(`%${q}%`);
      where = `WHERE f_unaccent(lower(search_text)) LIKE f_unaccent(lower($1))`;
    }
    params.push(limit);
    const { rows } = await query(
      `SELECT id, code, name, city, area, address_line, spaces_count, image_url
       FROM branches ${where} ORDER BY city, name LIMIT $${params.length}`, params);
    res.json({ results: rows });
  } catch (err) {
    next(err);
  }
});

branchesRouter.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM branches WHERE id = $1', [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Branch not found' });
    res.json({ branch: rows[0] });
  } catch (err) {
    next(err);
  }
});
