import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { logActivity } from '../lib/activity.js';
import { packDetails } from '../lib/activityDiff.js';
import { parseFollowUpPayload, followUpStatus } from '../lib/followUps.js';

export const followUpsRouter = Router();
followUpsRouter.use(authorize(PERMISSIONS.CUSTOMERS_READ));

const SELECT = `SELECT f.id, f.customer_id, f.title, f.description, f.due_at, f.status,
  f.completed_at, f.created_at, f.updated_at, f.assigned_employee_id,
  c.full_name AS customer_name, c.code AS customer_code,
  e.full_name AS assigned_employee
  FROM follow_ups f JOIN customers c ON c.id = f.customer_id
  LEFT JOIN employees e ON e.id = f.assigned_employee_id`;

function mapRow(row) {
  return { ...row, computed_status: followUpStatus(row.due_at, row.status) };
}

async function validateEmployee(tenantId, employeeId) {
  if (employeeId == null) return true;
  const { rows } = await query('SELECT id FROM employees WHERE id = ? AND tenant_id = ?', [employeeId, tenantId]);
  return rows.length > 0;
}

followUpsRouter.get('/', async (req, res, next) => {
  try {
    const params = [req.user.tenantId];
    const where = ['f.tenant_id = ?'];
    if (req.query.customerId) { where.push('f.customer_id = ?'); params.push(Number(req.query.customerId)); }
    if (req.query.scope === 'today') where.push("f.status = 'open' AND DATE(f.due_at) = CURDATE()");
    if (req.query.scope === 'overdue') where.push("f.status = 'open' AND f.due_at < NOW()");
    if (req.query.scope === 'open') where.push("f.status = 'open'");
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    params.push(limit);
    const { rows } = await query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY f.status = 'open' DESC, f.due_at ASC LIMIT ?`, params);
    res.json({ results: rows.map(mapRow) });
  } catch (err) { next(err); }
});

followUpsRouter.post('/', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const customerId = Number(req.body?.customerId ?? req.body?.customer_id);
    if (!Number.isInteger(customerId)) return res.status(400).json({ error: 'Απαιτείται πελάτης' });
    const customer = await query('SELECT id FROM customers WHERE id = ? AND tenant_id = ?', [customerId, req.user.tenantId]);
    if (!customer.rows.length) return res.status(404).json({ error: 'Customer not found' });
    const parsed = parseFollowUpPayload(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    if (!(await validateEmployee(req.user.tenantId, parsed.assignedEmployeeId))) return res.status(400).json({ error: 'Ο υπεύθυνος δεν ανήκει στον οργανισμό' });
    const r = await query(
      `INSERT INTO follow_ups (tenant_id, customer_id, title, description, due_at, assigned_employee_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.tenantId, customerId, parsed.title, parsed.description || null, parsed.dueAt, parsed.assignedEmployeeId ?? null, req.user.id]);
    await query('UPDATE customers SET next_action_at = ?, next_action_note = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?',
      [parsed.dueAt, parsed.title, customerId, req.user.tenantId]);
    await logActivity({ tenantId: req.user.tenantId, customerId, type: 'follow_up_created', description: `Υπενθύμιση: ${parsed.title}`, details: packDetails(req, { followUpId: r.rows.insertId }) });
    res.status(201).json({ id: r.rows.insertId });
  } catch (err) { next(err); }
});

followUpsRouter.patch('/:id', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const current = (await query('SELECT * FROM follow_ups WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId])).rows[0];
    if (!current) return res.status(404).json({ error: 'Follow-up not found' });
    const parsed = parseFollowUpPayload(req.body, { partial: true });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const fields = [];
    const params = [];
    if (parsed.title !== undefined) { fields.push('title = ?'); params.push(parsed.title); }
    if (parsed.description !== undefined) { fields.push('description = ?'); params.push(parsed.description); }
    if (parsed.dueAt !== undefined) { fields.push('due_at = ?'); params.push(parsed.dueAt); }
    if (parsed.assignedEmployeeId !== undefined) { fields.push('assigned_employee_id = ?'); params.push(parsed.assignedEmployeeId); }
    if (parsed.status !== undefined) {
      fields.push('status = ?', 'completed_at = ?');
      params.push(parsed.status, parsed.status === 'completed' ? new Date() : null);
    }
    if (!fields.length) return res.json({ ok: true });
    if (parsed.assignedEmployeeId !== undefined && !(await validateEmployee(req.user.tenantId, parsed.assignedEmployeeId))) {
      return res.status(400).json({ error: 'Ο υπεύθυνος δεν ανήκει στον οργανισμό' });
    }
    fields.push('updated_at = NOW()');
    params.push(id, req.user.tenantId);
    await query(`UPDATE follow_ups SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
    if (parsed.status === 'completed') {
      await logActivity({ tenantId: req.user.tenantId, customerId: current.customer_id, type: 'follow_up_completed', description: `Ολοκληρώθηκε: ${parsed.title || current.title}`, details: packDetails(req, { followUpId: id }) });
      await query('UPDATE customers SET next_action_at = NULL, next_action_note = NULL, updated_at = NOW() WHERE id = ? AND tenant_id = ? AND next_action_note = ?',
        [current.customer_id, req.user.tenantId, current.title]);
    } else if (parsed.dueAt !== undefined || parsed.title !== undefined) {
      await query('UPDATE customers SET next_action_at = ?, next_action_note = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ? AND (next_action_note = ? OR next_action_note IS NULL)',
        [parsed.dueAt || current.due_at, parsed.title || current.title, current.customer_id, req.user.tenantId, current.title]);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

followUpsRouter.delete('/:id', authorize(PERMISSIONS.CUSTOMERS_DELETE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const current = (await query('SELECT customer_id, title FROM follow_ups WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId])).rows[0];
    if (!current) return res.status(404).json({ error: 'Follow-up not found' });
    await query('DELETE FROM follow_ups WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId]);
    await query('UPDATE customers SET next_action_at = NULL, next_action_note = NULL, updated_at = NOW() WHERE id = ? AND tenant_id = ? AND next_action_note = ?',
      [current.customer_id, req.user.tenantId, current.title]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
