import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';

export const customerViewsRouter = Router();
customerViewsRouter.use(authorize(PERMISSIONS.CUSTOMERS_READ));

function parseConfig(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function serialize(row) {
  return { ...row, config: parseConfig(row.config_json) };
}

customerViewsRouter.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, name, config_json, is_default, created_at, updated_at FROM customer_saved_views WHERE tenant_id = ? AND user_id = ? ORDER BY is_default DESC, name',
      [req.user.tenantId, req.user.id],
    );
    res.json({ views: rows.map(serialize) });
  } catch (err) { next(err); }
});

customerViewsRouter.post('/', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Το όνομα της προβολής είναι υποχρεωτικό' });
    const config = req.body?.config;
    if (!config || typeof config !== 'object') return res.status(400).json({ error: 'Μη έγκυρη διαμόρφωση προβολής' });
    const conn = await query(
      'INSERT INTO customer_saved_views (tenant_id, user_id, name, config_json, is_default) VALUES (?, ?, ?, ?, ?)',
      [req.user.tenantId, req.user.id, name, JSON.stringify(config), req.body.is_default ? 1 : 0],
    );
    if (req.body.is_default) {
      await query('UPDATE customer_saved_views SET is_default = 0 WHERE tenant_id = ? AND user_id = ? AND id <> ?', [req.user.tenantId, req.user.id, conn.rows.insertId]);
    }
    const { rows } = await query('SELECT id, name, config_json, is_default, created_at, updated_at FROM customer_saved_views WHERE id = ? AND tenant_id = ? AND user_id = ?', [conn.rows.insertId, req.user.tenantId, req.user.id]);
    res.status(201).json({ view: serialize(rows[0]) });
  } catch (err) { next(err); }
});

customerViewsRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await query('SELECT id FROM customer_saved_views WHERE id = ? AND tenant_id = ? AND user_id = ?', [id, req.user.tenantId, req.user.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Η προβολή δεν βρέθηκε' });
    const sets = []; const params = [];
    if (req.body.name !== undefined) { const name = String(req.body.name).trim(); if (!name) return res.status(400).json({ error: 'Το όνομα είναι υποχρεωτικό' }); sets.push('name = ?'); params.push(name); }
    if (req.body.config !== undefined) { if (!req.body.config || typeof req.body.config !== 'object') return res.status(400).json({ error: 'Μη έγκυρη διαμόρφωση' }); sets.push('config_json = ?'); params.push(JSON.stringify(req.body.config)); }
    if (req.body.is_default !== undefined) { sets.push('is_default = ?'); params.push(req.body.is_default ? 1 : 0); }
    if (!sets.length) return res.status(400).json({ error: 'Καμία αλλαγή' });
    params.push(id, req.user.tenantId, req.user.id);
    await query(`UPDATE customer_saved_views SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ? AND user_id = ?`, params);
    if (req.body.is_default) await query('UPDATE customer_saved_views SET is_default = 0 WHERE tenant_id = ? AND user_id = ? AND id <> ?', [req.user.tenantId, req.user.id, id]);
    const { rows } = await query('SELECT id, name, config_json, is_default, created_at, updated_at FROM customer_saved_views WHERE id = ? AND tenant_id = ? AND user_id = ?', [id, req.user.tenantId, req.user.id]);
    res.json({ view: serialize(rows[0]) });
  } catch (err) { next(err); }
});

customerViewsRouter.delete('/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM customer_saved_views WHERE id = ? AND tenant_id = ? AND user_id = ?', [Number(req.params.id), req.user.tenantId, req.user.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});
