import { Router } from 'express';
import { query } from '../db.js';

export const customFieldsRouter = Router();

// GET /api/custom-fields?entity=customer|branch|space — admin listing.
customFieldsRouter.get('/', async (req, res, next) => {
  try {
    const entity = String(req.query.entity || 'customer');
    const { rows } = await query(
      `SELECT id, entity_type, name, key, field_type, required, searchable, filterable,
              visible_in_list, settings, section, sort_order, active, created_at
       FROM custom_field_definitions
       WHERE entity_type = $1
       ORDER BY sort_order, id`, [entity]);
    res.json({ fields: rows });
  } catch (err) {
    next(err);
  }
});
