import { Router } from 'express';
import { query } from '../db.js';

export const statsRouter = Router();

// GET /api/stats/overview — dashboard KPIs (Αρχική).
statsRouter.get('/overview', async (_req, res, next) => {
  try {
    const [totals, vip, upcoming, topBranches, recent] = await Promise.all([
      query(`SELECT COUNT(*) AS total_customers,
                    SUM(status = 'active') AS active_customers,
                    COALESCE(SUM(total_value), 0) AS total_value
             FROM customers`),
      query('SELECT COUNT(*) AS vip FROM customers WHERE is_vip = 1'),
      query('SELECT COUNT(*) AS upcoming FROM bookings WHERE starts_at >= NOW()'),
      query(`SELECT b.id, b.name, b.city, COUNT(*) AS customers
             FROM customer_branches cb JOIN branches b ON b.id = cb.branch_id
             GROUP BY b.id, b.name, b.city ORDER BY customers DESC LIMIT 6`),
      // Read the newest activities via the created_at index first, then join
      // customers (avoids a filesort over the whole activities table).
      query(`SELECT a.type, a.description, a.created_at, c.full_name, c.code
             FROM (SELECT type, description, created_at, customer_id
                   FROM activities ORDER BY created_at DESC LIMIT 8) a
             JOIN customers c ON c.id = a.customer_id
             ORDER BY a.created_at DESC`),
    ]);
    res.json({
      totalCustomers: Number(totals.rows[0].total_customers),
      activeCustomers: Number(totals.rows[0].active_customers),
      totalValue: Number(totals.rows[0].total_value),
      vipCustomers: Number(vip.rows[0].vip),
      upcomingBookings: Number(upcoming.rows[0].upcoming),
      topBranches: topBranches.rows.map((r) => ({ ...r, customers: Number(r.customers) })),
      recentActivity: recent.rows,
    });
  } catch (err) {
    next(err);
  }
});
