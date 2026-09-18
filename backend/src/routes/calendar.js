import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { loadTenant } from '../lib/tenants.js';
import {
  parseDateRange, canViewBookings, canViewFollowUps, mapBookingToEvent, mapFollowUpToEvent,
} from '../lib/calendar.js';

export const calendarRouter = Router();
// Least-restrictive gate: a viewer who can see either bookings or
// customers/follow-ups can open the calendar. What actually gets included in
// the response is still scoped per-permission below.
calendarRouter.use(authorize(PERMISSIONS.BOOKINGS_VIEW, PERMISSIONS.CUSTOMERS_READ));

const BOOKING_SELECT = `SELECT b.id, b.customer_id, b.branch_id, b.space_id, b.employee_id,
  b.starts_at, b.ends_at, b.status, b.amount,
  c.full_name AS customer_name, br.name AS branch_name, s.name AS space_name,
  e.full_name AS employee_name
  FROM bookings b
  JOIN customers c ON c.id = b.customer_id
  LEFT JOIN branches br ON br.id = b.branch_id
  LEFT JOIN spaces s ON s.id = b.space_id
  LEFT JOIN employees e ON e.id = b.employee_id`;

const FOLLOW_UP_SELECT = `SELECT f.id, f.customer_id, f.branch_id, f.title, f.description, f.due_at, f.status,
  f.assigned_employee_id, c.full_name AS customer_name, br.name AS branch_name, e.full_name AS assigned_employee
  FROM follow_ups f
  JOIN customers c ON c.id = f.customer_id
  LEFT JOIN branches br ON br.id = f.branch_id
  LEFT JOIN employees e ON e.id = f.assigned_employee_id`;

// GET /api/calendar?from=&to=&employeeId= — unified bookings + follow-ups feed.
calendarRouter.get('/', async (req, res, next) => {
  try {
    const { from, to, error } = parseDateRange(req.query);
    if (error) return res.status(400).json({ error });

    const perms = req.user.permissions || [];
    const includeBookings = canViewBookings(perms, PERMISSIONS.BOOKINGS_VIEW);
    const includeFollowUps = canViewFollowUps(perms, PERMISSIONS.CUSTOMERS_READ);
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;

    const events = [];

    if (includeBookings) {
      const params = [req.user.tenantId, to, from];
      const where = ['b.tenant_id = ?', 'b.starts_at <= ?', 'b.ends_at >= ?'];
      if (employeeId) { where.push('b.employee_id = ?'); params.push(employeeId); }
      const { rows } = await query(`${BOOKING_SELECT} WHERE ${where.join(' AND ')} ORDER BY b.starts_at ASC`, params);
      events.push(...rows.map(mapBookingToEvent));
    }

    if (includeFollowUps) {
      const params = [req.user.tenantId, to, from];
      const where = ['f.tenant_id = ?', 'f.due_at <= ?', 'f.due_at >= ?'];
      if (employeeId) { where.push('f.assigned_employee_id = ?'); params.push(employeeId); }
      const [{ rows }, tenant] = await Promise.all([
        query(`${FOLLOW_UP_SELECT} WHERE ${where.join(' AND ')} ORDER BY f.due_at ASC`, params),
        loadTenant(query, req.user.tenantId),
      ]);
      const ctx = { reminders: tenant?.settings?.reminders, timezone: tenant?.timezone || 'UTC', now: new Date() };
      events.push(...rows.map((r) => mapFollowUpToEvent(r, ctx)));
    }

    res.json({
      results: events,
      permissions: { bookings: includeBookings, followUps: includeFollowUps },
    });
  } catch (err) { next(err); }
});
