import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { logActivity } from '../lib/activity.js';
import { packDetails, snapshotFields, diffRecords, changeSummary } from '../lib/activityDiff.js';
import { parseBookingPayload, validateBranch, validateSpace, validateEmployee } from '../lib/bookings.js';

export const bookingsRouter = Router();
bookingsRouter.use(authorize(PERMISSIONS.BOOKINGS_VIEW));

const SELECT = `SELECT b.id, b.customer_id, b.branch_id, b.space_id, b.employee_id,
  b.starts_at, b.ends_at, b.status, b.amount, b.created_at,
  c.full_name AS customer_name, br.name AS branch_name, s.name AS space_name,
  e.full_name AS employee_name
  FROM bookings b
  JOIN customers c ON c.id = b.customer_id
  LEFT JOIN branches br ON br.id = b.branch_id
  LEFT JOIN spaces s ON s.id = b.space_id
  LEFT JOIN employees e ON e.id = b.employee_id`;

// GET /api/bookings?from=&to=&employeeId=&customerId= — bookings within the tenant.
bookingsRouter.get('/', async (req, res, next) => {
  try {
    const params = [req.user.tenantId];
    const where = ['b.tenant_id = ?'];
    if (req.query.from) { where.push('b.ends_at >= ?'); params.push(new Date(req.query.from)); }
    if (req.query.to) { where.push('b.starts_at <= ?'); params.push(new Date(req.query.to)); }
    if (req.query.employeeId) { where.push('b.employee_id = ?'); params.push(Number(req.query.employeeId)); }
    if (req.query.customerId) { where.push('b.customer_id = ?'); params.push(Number(req.query.customerId)); }
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    params.push(limit);
    const { rows } = await query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY b.starts_at ASC LIMIT ?`, params);
    res.json({ results: rows });
  } catch (err) { next(err); }
});

bookingsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = (await query(`${SELECT} WHERE b.id = ? AND b.tenant_id = ?`, [id, req.user.tenantId])).rows[0];
    if (!row) return res.status(404).json({ error: 'Booking not found' });
    res.json({ booking: row });
  } catch (err) { next(err); }
});

// POST /api/bookings — create a booking for a customer.
bookingsRouter.post('/', authorize(PERMISSIONS.BOOKINGS_CREATE), async (req, res, next) => {
  try {
    const customerId = Number(req.body?.customerId ?? req.body?.customer_id);
    if (!Number.isInteger(customerId)) return res.status(400).json({ error: 'Απαιτείται πελάτης' });
    const customer = await query('SELECT id FROM customers WHERE id = ? AND tenant_id = ?', [customerId, req.user.tenantId]);
    if (!customer.rows.length) return res.status(404).json({ error: 'Customer not found' });
    const parsed = parseBookingPayload(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    if (!(await validateBranch(req.user.tenantId, parsed.branchId))) return res.status(400).json({ error: 'Το υποκατάστημα δεν ανήκει στον οργανισμό' });
    if (!(await validateSpace(req.user.tenantId, parsed.spaceId, parsed.branchId))) return res.status(400).json({ error: 'Ο χώρος δεν ανήκει στο υποκατάστημα' });
    if (!(await validateEmployee(req.user.tenantId, parsed.employeeId))) return res.status(400).json({ error: 'Ο υπάλληλος δεν ανήκει στον οργανισμό' });
    const r = await query(
      `INSERT INTO bookings (tenant_id, customer_id, branch_id, space_id, employee_id, starts_at, ends_at, status, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.tenantId, customerId, parsed.branchId ?? null, parsed.spaceId ?? null, parsed.employeeId ?? null,
        parsed.startsAt, parsed.endsAt, parsed.status || 'confirmed', parsed.amount ?? 0]);
    const id = r.rows.insertId;
    await logActivity({
      tenantId: req.user.tenantId, customerId, type: 'booking_created', description: 'Νέα κράτηση',
      branchId: parsed.branchId ?? null, spaceId: parsed.spaceId ?? null,
      details: packDetails(req, { bookingId: id, fields: snapshotFields({ starts_at: parsed.startsAt, ends_at: parsed.endsAt, status: parsed.status || 'confirmed' }, ['starts_at', 'ends_at', 'status']) }),
    });
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

// PATCH /api/bookings/:id — reschedule (drag/resize), reassign or edit status/amount.
bookingsRouter.patch('/:id', authorize(PERMISSIONS.BOOKINGS_EDIT), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const current = (await query('SELECT * FROM bookings WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId])).rows[0];
    if (!current) return res.status(404).json({ error: 'Booking not found' });
    const parsed = parseBookingPayload(req.body, { partial: true });
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    // Merge with current values so a partial update (e.g. only startsAt/endsAt
    // from a drag) can still be validated as a whole (ends after starts).
    const merged = {
      branchId: parsed.branchId !== undefined ? parsed.branchId : current.branch_id,
      spaceId: parsed.spaceId !== undefined ? parsed.spaceId : current.space_id,
      employeeId: parsed.employeeId !== undefined ? parsed.employeeId : current.employee_id,
      startsAt: parsed.startsAt !== undefined ? parsed.startsAt : new Date(current.starts_at),
      endsAt: parsed.endsAt !== undefined ? parsed.endsAt : new Date(current.ends_at),
    };
    if (merged.endsAt <= merged.startsAt) return res.status(400).json({ error: 'Η ώρα λήξης πρέπει να είναι μετά την έναρξη' });
    if (parsed.branchId !== undefined && !(await validateBranch(req.user.tenantId, parsed.branchId))) {
      return res.status(400).json({ error: 'Το υποκατάστημα δεν ανήκει στον οργανισμό' });
    }
    if (parsed.spaceId !== undefined && !(await validateSpace(req.user.tenantId, parsed.spaceId, merged.branchId))) {
      return res.status(400).json({ error: 'Ο χώρος δεν ανήκει στο υποκατάστημα' });
    }
    if (parsed.employeeId !== undefined && !(await validateEmployee(req.user.tenantId, parsed.employeeId))) {
      return res.status(400).json({ error: 'Ο υπάλληλος δεν ανήκει στον οργανισμό' });
    }

    const fields = [];
    const params = [];
    if (parsed.branchId !== undefined) { fields.push('branch_id = ?'); params.push(parsed.branchId); }
    if (parsed.spaceId !== undefined) { fields.push('space_id = ?'); params.push(parsed.spaceId); }
    if (parsed.employeeId !== undefined) { fields.push('employee_id = ?'); params.push(parsed.employeeId); }
    if (parsed.startsAt !== undefined) { fields.push('starts_at = ?'); params.push(parsed.startsAt); }
    if (parsed.endsAt !== undefined) { fields.push('ends_at = ?'); params.push(parsed.endsAt); }
    if (parsed.status !== undefined) { fields.push('status = ?'); params.push(parsed.status); }
    if (parsed.amount !== undefined) { fields.push('amount = ?'); params.push(parsed.amount); }
    if (!fields.length) return res.json({ ok: true });
    params.push(id, req.user.tenantId);
    await query(`UPDATE bookings SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, params);

    const changes = diffRecords(
      { starts_at: current.starts_at, ends_at: current.ends_at, status: current.status },
      { ...(parsed.startsAt !== undefined ? { starts_at: parsed.startsAt } : {}),
        ...(parsed.endsAt !== undefined ? { ends_at: parsed.endsAt } : {}),
        ...(parsed.status !== undefined ? { status: parsed.status } : {}) },
    );
    await logActivity({
      tenantId: req.user.tenantId, customerId: current.customer_id, type: 'booking_updated',
      description: changeSummary('Ενημέρωση κράτησης', changes, 'Ενημέρωση κράτησης'),
      branchId: current.branch_id, spaceId: current.space_id,
      details: packDetails(req, { bookingId: id, changes }),
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

bookingsRouter.delete('/:id', authorize(PERMISSIONS.BOOKINGS_DELETE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const current = (await query('SELECT customer_id FROM bookings WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId])).rows[0];
    if (!current) return res.status(404).json({ error: 'Booking not found' });
    await query('DELETE FROM bookings WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId]);
    await logActivity({ tenantId: req.user.tenantId, customerId: current.customer_id, type: 'booking_deleted', description: 'Διαγραφή κράτησης' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
