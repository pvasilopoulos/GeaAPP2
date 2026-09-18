import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { computeReminderState } from '../lib/reminderSettings.js';
import { loadTenant } from '../lib/tenants.js';

export const statsRouter = Router();
statsRouter.use(authorize(PERMISSIONS.CUSTOMERS_READ, PERMISSIONS.REPORTS_READ));

// GET /api/stats/overview — dashboard KPIs (tenant-scoped).
statsRouter.get('/overview', async (req, res, next) => {
  try {
    const t = req.user.tenantId;
    const [totals, vip, upcoming, topCities, recent, followUps, followUpCounts, tenant] = await Promise.all([
      query(`SELECT COUNT(*) AS total_customers,
                    SUM(status = 'active') AS active_customers,
                    COALESCE(SUM(total_value), 0) AS total_value
             FROM customers WHERE tenant_id = ?`, [t]),
      query('SELECT COUNT(*) AS vip FROM customers WHERE tenant_id = ? AND is_vip = 1', [t]),
      query('SELECT COUNT(*) AS upcoming FROM bookings WHERE tenant_id = ? AND starts_at >= NOW()', [t]),
      query(`SELECT city, COUNT(DISTINCT customer_id) AS customers
             FROM branches WHERE tenant_id = ? AND city IS NOT NULL
             GROUP BY city ORDER BY customers DESC LIMIT 6`, [t]),
      query(`SELECT a.type, a.description, a.created_at, c.full_name, c.code
             FROM activities a JOIN customers c ON c.id = a.customer_id
             WHERE a.tenant_id = ?
             ORDER BY a.created_at DESC LIMIT 8`, [t]),
      query(`SELECT f.id, f.customer_id, f.title, f.description, f.due_at, f.status,
                    c.full_name AS customer_name, c.code AS customer_code
             FROM follow_ups f JOIN customers c ON c.id = f.customer_id
             WHERE f.tenant_id = ? AND f.status = 'open'
             ORDER BY f.due_at ASC LIMIT 12`, [t]),
      // Counted over ALL open follow-ups (not just the top-12 slice above),
      // otherwise the dashboard badges undercount once a tenant has more
      // than 12 open reminders.
      query(`SELECT SUM(DATE(due_at) = CURDATE()) AS today, SUM(due_at < NOW()) AS overdue
             FROM follow_ups WHERE tenant_id = ? AND status = 'open'`, [t]),
      loadTenant(query, t),
    ]);
    const reminders = tenant?.settings?.reminders;
    const timezone = tenant?.timezone || 'UTC';
    const now = new Date();
    res.json({
      totalCustomers: Number(totals.rows[0].total_customers),
      activeCustomers: Number(totals.rows[0].active_customers),
      totalValue: Number(totals.rows[0].total_value),
      vipCustomers: Number(vip.rows[0].vip),
      upcomingBookings: Number(upcoming.rows[0].upcoming),
      topCities: topCities.rows.map((r) => ({ ...r, customers: Number(r.customers) })),
      recentActivity: recent.rows,
      followUps: followUps.rows.map((r) => ({ ...r, computed_status: computeReminderState(r.due_at, r.status, reminders, now, timezone) })),
      followUpCounts: {
        today: Number(followUpCounts.rows[0].today || 0),
        overdue: Number(followUpCounts.rows[0].overdue || 0),
      },
      remindersEnabled: reminders ? reminders.enabled !== false : true,
    });
  } catch (err) {
    next(err);
  }
});
