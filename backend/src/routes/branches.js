import { Router } from 'express';
import { query } from '../db.js';
import { clampLimit } from '../lib/cursor.js';
import { normalize } from '../lib/normalize.js';

export const branchesRouter = Router();

// GET /api/branches?q=&limit= — async searchable selector source.
branchesRouter.get('/', async (req, res, next) => {
  try {
    const qnorm = normalize(String(req.query.q || ''));
    const limit = clampLimit(req.query.limit, 20, 50);
    const params = [];
    let where = '';
    if (qnorm) { where = 'WHERE search_norm LIKE ?'; params.push(`%${qnorm}%`); }
    const { rows } = await query(
      `SELECT id, code, name, city, area, address_line, spaces_count, image_url
       FROM branches ${where} ORDER BY city, name LIMIT ${limit}`, params);
    res.json({ results: rows });
  } catch (err) {
    next(err);
  }
});

branchesRouter.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM branches WHERE id = ?', [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Branch not found' });
    res.json({ branch: rows[0] });
  } catch (err) {
    next(err);
  }
});
