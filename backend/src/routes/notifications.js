import { Router } from 'express';
import { query } from '../db.js';
import { publicNotification } from '../lib/notifications.js';

export const notificationsRouter = Router();

async function loadOwned(req, id) {
  const { rows } = await query(
    'SELECT * FROM notifications WHERE id = ? AND tenant_id = ? AND user_id = ?',
    [id, req.user.tenantId, req.user.id],
  );
  return rows[0] || null;
}

notificationsRouter.get('/', async (req, res, next) => {
  try {
    const unread = req.query.unread === '1' || req.query.unread === 'true';
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const where = ['tenant_id = ?', 'user_id = ?', 'dismissed_at IS NULL'];
    const params = [req.user.tenantId, req.user.id];
    if (unread) where.push('read_at IS NULL');
    params.push(limit);
    const { rows } = await query(
      `SELECT * FROM notifications WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`,
      params,
    );
    res.json({ results: rows.map(publicNotification) });
  } catch (err) { next(err); }
});

notificationsRouter.get('/unread-count', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT COUNT(*) AS c FROM notifications
       WHERE tenant_id = ? AND user_id = ? AND read_at IS NULL AND dismissed_at IS NULL`,
      [req.user.tenantId, req.user.id],
    );
    res.json({ count: Number(rows[0].c) });
  } catch (err) { next(err); }
});

notificationsRouter.patch('/:id/read', async (req, res, next) => {
  try {
    const row = await loadOwned(req, Number(req.params.id));
    if (!row || row.dismissed_at) return res.status(404).json({ error: 'Η ειδοποίηση δεν βρέθηκε' });
    if (!row.read_at) {
      await query(
        'UPDATE notifications SET read_at = NOW() WHERE id = ? AND tenant_id = ? AND user_id = ?',
        [row.id, req.user.tenantId, req.user.id],
      );
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

notificationsRouter.patch('/:id/dismiss', async (req, res, next) => {
  try {
    const row = await loadOwned(req, Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Η ειδοποίηση δεν βρέθηκε' });
    await query(
      `UPDATE notifications SET dismissed_at = COALESCE(dismissed_at, NOW()), read_at = COALESCE(read_at, NOW())
       WHERE id = ? AND tenant_id = ? AND user_id = ?`,
      [row.id, req.user.tenantId, req.user.id],
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

notificationsRouter.post('/mark-all-read', async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE notifications SET read_at = NOW()
       WHERE tenant_id = ? AND user_id = ? AND read_at IS NULL AND dismissed_at IS NULL`,
      [req.user.tenantId, req.user.id],
    );
    res.json({ ok: true, updated: Number(result.rows.affectedRows || 0) });
  } catch (err) { next(err); }
});
