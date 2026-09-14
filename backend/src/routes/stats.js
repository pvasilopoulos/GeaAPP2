import { Router } from 'express';
import { query } from '../db.js';

export const statsRouter = Router();

// GET /api/stats/overview — dashboard KPIs (Αρχική).
statsRouter.get('/overview', async (_req, res, next) => {
  try {
    const [totals, vip, upcoming, topBranches, recent] = await Promise.all([
      query(`SELECT
               (SELECT reltuples::bigint FROM pg_class WHERE relname='customers') AS total_customers,
               (SELECT count(*) FROM customers WHERE status='active') AS active_customers,
               (SELECT coalesce(sum(total_value),0) FROM customers) AS total_value`),
      query(`SELECT count(*)::int AS vip FROM customers WHERE is_vip`),
      query(`SELECT count(*)::int AS upcoming FROM bookings WHERE starts_at >= now()`),
      query(`SELECT b.id, b.name, b.city, count(*)::int AS customers
             FROM customer_branches cb JOIN branches b ON b.id = cb.branch_id
             GROUP BY b.id, b.name, b.city ORDER BY customers DESC LIMIT 6`),
      query(`SELECT a.type, a.description, a.created_at, c.full_name, c.code
             FROM activities a JOIN customers c ON c.id = a.customer_id
             ORDER BY a.created_at DESC LIMIT 8`),
    ]);
    res.json({
      totalCustomers: Number(totals.rows[0].total_customers),
      activeCustomers: Number(totals.rows[0].active_customers),
      totalValue: Number(totals.rows[0].total_value),
      vipCustomers: vip.rows[0].vip,
      upcomingBookings: upcoming.rows[0].upcoming,
      topBranches: topBranches.rows,
      recentActivity: recent.rows,
    });
  } catch (err) {
    next(err);
  }
});
