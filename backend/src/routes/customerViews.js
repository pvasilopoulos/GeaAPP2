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
  return {
    ...row,
    visibility: row.visibility || 'personal',
    is_owner: Number(row.user_id) === Number(row.viewer_id),
    config: parseConfig(row.config_json),
  };
}

customerViewsRouter.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT v.id, v.name, v.config_json, v.is_default, v.visibility, v.user_id,
              u.full_name AS owner_name, ? AS viewer_id, v.created_at, v.updated_at
       FROM customer_saved_views v
       JOIN users u ON u.id = v.user_id
       WHERE v.tenant_id = ? AND (v.user_id = ? OR v.visibility = 'shared')
       ORDER BY v.is_default DESC, v.visibility, v.name`,
      [req.user.id, req.user.tenantId, req.user.id],
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
    const visibility = req.body?.visibility === 'shared' ? 'shared' : 'personal';
    const conn = await query(
      'INSERT INTO customer_saved_views (tenant_id, user_id, name, config_json, visibility, is_default) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.tenantId, req.user.id, name, JSON.stringify(config), visibility, req.body.is_default ? 1 : 0],
    );
    if (req.body.is_default) {
      await clearDefaults(req.user, visibility, conn.rows.insertId);
    }
    const { rows } = await viewById(req.user, conn.rows.insertId);
    res.status(201).json({ view: serialize(rows[0]) });
  } catch (err) { next(err); }
});

async function viewById(user, id) {
  return query(
    `SELECT v.id, v.name, v.config_json, v.is_default, v.visibility, v.user_id,
            u.full_name AS owner_name, ? AS viewer_id, v.created_at, v.updated_at
     FROM customer_saved_views v JOIN users u ON u.id = v.user_id
     WHERE v.id = ? AND v.tenant_id = ? AND (v.user_id = ? OR v.visibility = 'shared')`,
    [user.id, id, user.tenantId, user.id],
  );
}

async function clearDefaults(user, visibility, id) {
  const scope = visibility === 'shared'
    ? 'tenant_id = ? AND visibility = ?'
    : 'tenant_id = ? AND user_id = ? AND visibility = ?';
  const params = visibility === 'shared'
    ? [user.tenantId, visibility, id]
    : [user.tenantId, user.id, visibility, id];
  await query(`UPDATE customer_saved_views SET is_default = 0 WHERE ${scope} AND id <> ?`, params);
}

customerViewsRouter.post('/:id/duplicate', async (req, res, next) => {
  try {
    const source = await viewById(req.user, Number(req.params.id));
    if (!source.rows.length) return res.status(404).json({ error: 'Η προβολή δεν βρέθηκε' });
    const original = source.rows[0];
    const visibility = req.body?.visibility === 'shared' ? 'shared' : 'personal';
    const requested = String(req.body?.name || `${original.name} (αντίγραφο)`).trim();
    let name = requested;
    let suffix = 2;
    while (true) {
      const existing = await query('SELECT id FROM customer_saved_views WHERE tenant_id = ? AND user_id = ? AND name = ?', [req.user.tenantId, req.user.id, name]);
      if (!existing.rows.length) break;
      name = `${requested} ${suffix++}`;
    }
    const conn = await query(
      'INSERT INTO customer_saved_views (tenant_id, user_id, name, config_json, visibility, is_default) VALUES (?, ?, ?, ?, ?, 0)',
      [req.user.tenantId, req.user.id, name, original.config_json, visibility],
    );
    const created = await viewById(req.user, conn.rows.insertId);
    res.status(201).json({ view: serialize(created.rows[0]) });
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
    if (req.body.visibility !== undefined) { if (!['personal', 'shared'].includes(req.body.visibility)) return res.status(400).json({ error: 'Μη έγκυρη εμβέλεια προβολής' }); sets.push('visibility = ?'); params.push(req.body.visibility); }
    if (req.body.is_default !== undefined) { sets.push('is_default = ?'); params.push(req.body.is_default ? 1 : 0); }
    if (!sets.length) return res.status(400).json({ error: 'Καμία αλλαγή' });
    params.push(id, req.user.tenantId, req.user.id);
    await query(`UPDATE customer_saved_views SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ? AND user_id = ?`, params);
    const current = await viewById(req.user, id);
    if (req.body.is_default) await clearDefaults(req.user, req.body.visibility || current.rows[0].visibility, id);
    const { rows } = await viewById(req.user, id);
    res.json({ view: serialize(rows[0]) });
  } catch (err) { next(err); }
});

customerViewsRouter.delete('/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM customer_saved_views WHERE id = ? AND tenant_id = ? AND user_id = ?', [Number(req.params.id), req.user.tenantId, req.user.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});
