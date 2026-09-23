import { Router } from 'express';
import { query, withConnection } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { logAuditFromReq } from '../lib/audit.js';

export const sellersRouter = Router();
const manageSellers = authorize(PERMISSIONS.SELLERS_MANAGE, PERMISSIONS.SETTINGS_MANAGE);

function sellerPayload(body = {}) {
  const firstName = String(body.firstName || '').trim();
  const lastName = String(body.lastName || '').trim();
  if (!firstName || !lastName) throw new Error('Συμπληρώστε όνομα και επώνυμο');
  return {
    firstName,
    lastName,
    email: body.email ? String(body.email).trim().toLowerCase() : null,
    role: body.role ? String(body.role).trim() : 'Πωλητής',
    avatarUrl: body.avatarUrl ? String(body.avatarUrl).trim() : null,
  };
}

sellersRouter.get('/', manageSellers, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, first_name, last_name, full_name, email, role, avatar_url FROM employees WHERE tenant_id = ? ORDER BY full_name',
      [req.user.tenantId],
    );
    res.json({ sellers: rows });
  } catch (err) { next(err); }
});

sellersRouter.post('/', manageSellers, async (req, res, next) => {
  try {
    const seller = sellerPayload(req.body);
    const result = await query(
      'INSERT INTO employees (tenant_id, first_name, last_name, email, role, avatar_url) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.tenantId, seller.firstName, seller.lastName, seller.email, seller.role, seller.avatarUrl],
    );
    await logAuditFromReq(query, req, {
      action: 'create', entityType: 'seller', entityId: result.rows.insertId,
      summary: `Δημιουργία πωλητή: ${seller.firstName} ${seller.lastName}`,
    });
    res.status(201).json({ id: result.rows.insertId });
  } catch (err) {
    if (err.message === 'Συμπληρώστε όνομα και επώνυμο') return res.status(400).json({ error: err.message });
    next(err);
  }
});

sellersRouter.patch('/:id', manageSellers, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await query('SELECT id FROM employees WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId]);
    if (!rows.length) return res.status(404).json({ error: 'Ο πωλητής δεν βρέθηκε' });
    const seller = sellerPayload(req.body);
    await query(
      'UPDATE employees SET first_name = ?, last_name = ?, email = ?, role = ?, avatar_url = ? WHERE id = ? AND tenant_id = ?',
      [seller.firstName, seller.lastName, seller.email, seller.role, seller.avatarUrl, id, req.user.tenantId],
    );
    await logAuditFromReq(query, req, {
      action: 'update', entityType: 'seller', entityId: id,
      summary: `Ενημέρωση πωλητή: ${seller.firstName} ${seller.lastName}`,
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.message === 'Συμπληρώστε όνομα και επώνυμο') return res.status(400).json({ error: err.message });
    next(err);
  }
});

sellersRouter.delete('/:id', manageSellers, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await query('SELECT full_name FROM employees WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId]);
    if (!rows.length) return res.status(404).json({ error: 'Ο πωλητής δεν βρέθηκε' });
    await withConnection(async (conn) => {
      await conn.beginTransaction();
      try {
        await conn.query('UPDATE quotes SET seller_id = NULL WHERE tenant_id = ? AND seller_id = ?', [req.user.tenantId, id]);
        await conn.query('UPDATE bookings SET employee_id = NULL WHERE tenant_id = ? AND employee_id = ?', [req.user.tenantId, id]);
        await conn.query('UPDATE communications SET employee_id = NULL WHERE employee_id = ?', [id]);
        await conn.query('UPDATE documents SET uploaded_by = NULL WHERE uploaded_by = ?', [id]);
        await conn.query('UPDATE notes SET employee_id = NULL WHERE employee_id = ?', [id]);
        await conn.query('DELETE FROM employees WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId]);
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      }
    });
    await logAuditFromReq(query, req, {
      action: 'delete', entityType: 'seller', entityId: id,
      summary: `Διαγραφή πωλητή: ${rows[0].full_name}`,
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
