import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { logActivity } from '../lib/activity.js';
import { packDetails } from '../lib/activityDiff.js';
import { parseFollowUpPayload, parseSnoozeMinutes, syncCustomerNextAction } from '../lib/followUps.js';
import { computeReminderState } from '../lib/reminderSettings.js';
import { loadTenant } from '../lib/tenants.js';
import { withIdempotency } from '../lib/idempotency.js';
import { evaluateNotificationRules } from '../lib/notificationRules.js';
import { logAuditFromReq } from '../lib/audit.js';


export const followUpsRouter = Router();
followUpsRouter.use(authorize(PERMISSIONS.CUSTOMERS_READ));

const SELECT = `SELECT f.id, f.customer_id, f.branch_id, f.title, f.description, f.due_at, f.status,
  f.completed_at, f.created_at, f.updated_at, f.assigned_employee_id,
  c.full_name AS customer_name, c.code AS customer_code,
  b.name AS branch_name,
  e.full_name AS assigned_employee
  FROM follow_ups f JOIN customers c ON c.id = f.customer_id
  LEFT JOIN branches b ON b.id = f.branch_id
  LEFT JOIN employees e ON e.id = f.assigned_employee_id`;

// Loads the tenant's reminder preferences + timezone so overdue/due-soon
// status reflects the configured working calendar and lead time.
async function loadReminderContext(tenantId) {
  const tenant = await loadTenant(query, tenantId);
  return { reminders: tenant?.settings?.reminders, timezone: tenant?.timezone || 'UTC' };
}

function mapRow(row, ctx) {
  return { ...row, computed_status: computeReminderState(row.due_at, row.status, ctx.reminders, new Date(), ctx.timezone) };
}

async function validateEmployee(tenantId, employeeId) {
  if (employeeId == null) return true;
  const { rows } = await query('SELECT id FROM employees WHERE id = ? AND tenant_id = ?', [employeeId, tenantId]);
  return rows.length > 0;
}

// A follow-up's branch (if set) must belong to the same customer/tenant —
// prevents tagging a reminder with an unrelated branch.
async function validateBranch(tenantId, customerId, branchId) {
  if (branchId == null) return true;
  const { rows } = await query('SELECT id FROM branches WHERE id = ? AND customer_id = ? AND tenant_id = ?', [branchId, customerId, tenantId]);
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
    const [{ rows }, ctx] = await Promise.all([
      query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY f.status = 'open' DESC, f.due_at ASC LIMIT ?`, params),
      loadReminderContext(req.user.tenantId),
    ]);
    res.json({ results: rows.map((r) => mapRow(r, ctx)) });
  } catch (err) { next(err); }
});

followUpsRouter.post('/', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const result = await withIdempotency(query, req, async () => {
      const customerId = Number(req.body?.customerId ?? req.body?.customer_id);
      if (!Number.isInteger(customerId)) return { status: 400, body: { error: 'Απαιτείται πελάτης' } };
      const customer = await query('SELECT id, full_name FROM customers WHERE id = ? AND tenant_id = ?', [customerId, req.user.tenantId]);
      if (!customer.rows.length) return { status: 404, body: { error: 'Customer not found' } };
      const parsed = parseFollowUpPayload(req.body);
      if (parsed.error) return { status: 400, body: { error: parsed.error } };
      if (!(await validateEmployee(req.user.tenantId, parsed.assignedEmployeeId))) return { status: 400, body: { error: 'Ο υπεύθυνος δεν ανήκει στον οργανισμό' } };
      if (!(await validateBranch(req.user.tenantId, customerId, parsed.branchId))) return { status: 400, body: { error: 'Το υποκατάστημα δεν ανήκει στον πελάτη' } };
      const r = await query(
        `INSERT INTO follow_ups (tenant_id, customer_id, branch_id, title, description, due_at, assigned_employee_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.tenantId, customerId, parsed.branchId ?? null, parsed.title, parsed.description || null, parsed.dueAt, parsed.assignedEmployeeId ?? null, req.user.id]);
      await syncCustomerNextAction(req.user.tenantId, customerId);
      await logActivity({ tenantId: req.user.tenantId, customerId, type: 'follow_up_created', description: `Υπενθύμιση: ${parsed.title}`, details: packDetails(req, { followUpId: r.rows.insertId }) });
      await logAuditFromReq(query, req, {
        action: 'create', entityType: 'follow_up', entityId: r.rows.insertId, customerId,
        summary: `Νέα υπενθύμιση: ${parsed.title}`,
      });
      if (parsed.assignedEmployeeId) {
        await evaluateNotificationRules('follow_up_assigned', {
          tenantId: req.user.tenantId,
          entityId: r.rows.insertId,
          customerId,
          title: parsed.title,
          customerName: customer.rows[0].full_name,
          assignedEmployeeId: parsed.assignedEmployeeId,
        }).catch((e) => console.error('[notificationRules]', e.message));
      }
      return { status: 201, body: { id: r.rows.insertId } };
    });
    res.status(result.status).json(result.body);
  } catch (err) { next(err); }
});

followUpsRouter.patch('/:id', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const result = await withIdempotency(query, req, async () => {
      const id = Number(req.params.id);
      const current = (await query('SELECT * FROM follow_ups WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId])).rows[0];
      if (!current) return { status: 404, body: { error: 'Follow-up not found' } };
      const parsed = parseFollowUpPayload(req.body, { partial: true });
      if (parsed.error) return { status: 400, body: { error: parsed.error } };
      const fields = [];
      const params = [];
      if (parsed.title !== undefined) { fields.push('title = ?'); params.push(parsed.title); }
      if (parsed.description !== undefined) { fields.push('description = ?'); params.push(parsed.description); }
      if (parsed.dueAt !== undefined) { fields.push('due_at = ?'); params.push(parsed.dueAt); }
      if (parsed.assignedEmployeeId !== undefined) { fields.push('assigned_employee_id = ?'); params.push(parsed.assignedEmployeeId); }
      if (parsed.branchId !== undefined) { fields.push('branch_id = ?'); params.push(parsed.branchId); }
      if (parsed.status !== undefined) {
        fields.push('status = ?', 'completed_at = ?');
        params.push(parsed.status, parsed.status === 'completed' ? new Date() : null);
      }
      if (!fields.length) return { status: 200, body: { ok: true } };
      if (parsed.assignedEmployeeId !== undefined && !(await validateEmployee(req.user.tenantId, parsed.assignedEmployeeId))) {
        return { status: 400, body: { error: 'Ο υπεύθυνος δεν ανήκει στον οργανισμό' } };
      }
      if (parsed.branchId !== undefined && !(await validateBranch(req.user.tenantId, current.customer_id, parsed.branchId))) {
        return { status: 400, body: { error: 'Το υποκατάστημα δεν ανήκει στον πελάτη' } };
      }
      fields.push('updated_at = NOW()');
      params.push(id, req.user.tenantId);
      await query(`UPDATE follow_ups SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
      if (parsed.status === 'completed') {
        await logActivity({ tenantId: req.user.tenantId, customerId: current.customer_id, type: 'follow_up_completed', description: `Ολοκληρώθηκε: ${parsed.title || current.title}`, details: packDetails(req, { followUpId: id }) });
        await logAuditFromReq(query, req, {
          action: 'status', entityType: 'follow_up', entityId: id, customerId: current.customer_id,
          summary: `Ολοκλήρωση υπενθύμισης: ${parsed.title || current.title}`,
        });
      }
      // Always resync from the single source of truth (open follow_ups) rather
      // than patching customers.next_action_* by matching on title text, which
      // used to go stale whenever a title changed or was reused.
      if (parsed.status !== undefined || parsed.dueAt !== undefined || parsed.title !== undefined) {
        await syncCustomerNextAction(req.user.tenantId, current.customer_id);
      }
      if (parsed.assignedEmployeeId !== undefined && parsed.assignedEmployeeId
          && parsed.assignedEmployeeId !== current.assigned_employee_id) {
        const customer = (await query('SELECT full_name FROM customers WHERE id = ? AND tenant_id = ?', [current.customer_id, req.user.tenantId])).rows[0];
        await evaluateNotificationRules('follow_up_assigned', {
          tenantId: req.user.tenantId,
          entityId: id,
          customerId: current.customer_id,
          title: parsed.title || current.title,
          customerName: customer?.full_name,
          assignedEmployeeId: parsed.assignedEmployeeId,
        }).catch((e) => console.error('[notificationRules]', e.message));
      }
      return { status: 200, body: { ok: true } };
    });
    res.status(result.status).json(result.body);
  } catch (err) { next(err); }
});

// Snoozes an open reminder by pushing its due date forward from "now" (or
// its current due date, whichever is later) by the requested minutes.
followUpsRouter.patch('/:id/snooze', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const result = await withIdempotency(query, req, async () => {
      const id = Number(req.params.id);
      const current = (await query('SELECT * FROM follow_ups WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId])).rows[0];
      if (!current) return { status: 404, body: { error: 'Follow-up not found' } };
      if (current.status !== 'open') return { status: 400, body: { error: 'Μόνο ανοιχτές υπενθυμίσεις μπορούν να αναβληθούν' } };
      const parsed = parseSnoozeMinutes(req.body?.minutes);
      if (parsed.error) return { status: 400, body: { error: parsed.error } };
      const base = new Date(Math.max(Date.now(), new Date(current.due_at).getTime()));
      const nextDue = new Date(base.getTime() + parsed.minutes * 60000);
      await query('UPDATE follow_ups SET due_at = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?', [nextDue, id, req.user.tenantId]);
      await syncCustomerNextAction(req.user.tenantId, current.customer_id);
      await logActivity({ tenantId: req.user.tenantId, customerId: current.customer_id, type: 'follow_up_snoozed', description: `Αναβολή: ${current.title}`, details: packDetails(req, { followUpId: id, minutes: parsed.minutes }) });
      await logAuditFromReq(query, req, {
        action: 'update', entityType: 'follow_up', entityId: id, customerId: current.customer_id,
        summary: `Αναβολή υπενθύμισης: ${current.title}`,
        details: { minutes: parsed.minutes },
      });
      return { status: 200, body: { ok: true, due_at: nextDue.toISOString() } };
    });
    res.status(result.status).json(result.body);
  } catch (err) { next(err); }
});

followUpsRouter.delete('/:id', authorize(PERMISSIONS.CUSTOMERS_DELETE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const current = (await query('SELECT customer_id, title FROM follow_ups WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId])).rows[0];
    if (!current) return res.status(404).json({ error: 'Follow-up not found' });
    await query('DELETE FROM follow_ups WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId]);
    await syncCustomerNextAction(req.user.tenantId, current.customer_id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
