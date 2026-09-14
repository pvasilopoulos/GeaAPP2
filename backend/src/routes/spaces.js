import { Router } from 'express';
import { query } from '../db.js';
import { clampLimit } from '../lib/cursor.js';
import { normalize } from '../lib/normalize.js';

export const spacesRouter = Router();

// GET /api/spaces?q=&branchId=&limit= — async searchable selector source.
spacesRouter.get('/', async (req, res, next) => {
  try {
    const qnorm = normalize(String(req.query.q || ''));
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const limit = clampLimit(req.query.limit, 20, 50);
    const params = [];
    const where = [];
    if (qnorm) { where.push('s.search_norm LIKE ?'); params.push(`%${qnorm}%`); }
    if (branchId) { where.push('s.branch_id = ?'); params.push(branchId); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT s.id, s.code, s.name, s.space_type, s.capacity, s.image_url,
              b.name AS branch_name, b.city
       FROM spaces s JOIN branches b ON b.id = s.branch_id
       ${whereSql} ORDER BY b.city, s.name LIMIT ${limit}`, params);
    res.json({ results: rows });
  } catch (err) {
    next(err);
  }
});

spacesRouter.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.*, b.name AS branch_name, b.city FROM spaces s
       JOIN branches b ON b.id = s.branch_id WHERE s.id = ?`, [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Space not found' });
    res.json({ space: rows[0] });
  } catch (err) {
    next(err);
  }
});
