import { Router } from 'express';
import { query } from '../db.js';

export const metaRouter = Router();

// GET /api/meta — data needed to render filters and selectors.
metaRouter.get('/', async (_req, res, next) => {
  try {
    const [tags, employees, branches, totals] = await Promise.all([
      query('SELECT id, name, slug, color FROM tags ORDER BY name'),
      query('SELECT id, full_name FROM employees ORDER BY full_name'),
      query('SELECT id, name, city FROM branches ORDER BY city, name'),
      query('SELECT reltuples::bigint AS est FROM pg_class WHERE relname = $1', ['customers']),
    ]);
    res.json({
      tags: tags.rows,
      employees: employees.rows,
      branches: branches.rows,
      statuses: [
        { value: 'active', label: 'Ενεργός' },
        { value: 'inactive', label: 'Ανενεργός' },
        { value: 'prospect', label: 'Υποψήφιος' },
      ],
      customerTypes: [
        { value: 'individual', label: 'Ιδιώτης' },
        { value: 'company', label: 'Εταιρεία' },
      ],
      estimatedCustomers: Number(totals.rows[0]?.est || 0),
    });
  } catch (err) {
    next(err);
  }
});
