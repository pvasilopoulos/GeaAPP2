import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { normalize } from '../lib/normalize.js';

export const customFieldsRouter = Router();
customFieldsRouter.use(authorize(PERMISSIONS.CUSTOM_FIELDS_MANAGE, PERMISSIONS.SETTINGS_MANAGE));

const ENTITIES = ['customer', 'branch', 'space'];
const FLAGS = ['required', 'searchable', 'filterable', 'visible_in_list', 'active'];

function parseSettings(v) {
  if (v && typeof v === 'object') return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return {}; } }
  return {};
}
function serialize(rows) {
  for (const r of rows) { r.settings = parseSettings(r.settings); for (const f of FLAGS) r[f] = !!r[f]; }
  return rows;
}

async function uniqueKey(tenantId, entity, name) {
  let base = normalize(name).replace(/\s+/g, '_').slice(0, 100) || 'field';
  let key = base; let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while ((await query('SELECT id FROM custom_field_definitions WHERE tenant_id=? AND entity_type=? AND `key`=?', [tenantId, entity, key])).rows.length) {
    key = `${base}_${++n}`;
  }
  return key;
}
async function ownDef(id, tenantId) {
  const { rows } = await query('SELECT * FROM custom_field_definitions WHERE id=? AND tenant_id=?', [id, tenantId]);
  return rows[0] || null;
}

// GET /api/custom-fields?entity=customer|branch|space
customFieldsRouter.get('/', async (req, res, next) => {
  try {
    const entity = ENTITIES.includes(req.query.entity) ? req.query.entity : 'customer';
    const { rows } = await query(
      `SELECT id, entity_type, name, \`key\`, field_type, required, searchable, filterable,
              visible_in_list, settings, section, sort_order, active, created_at
       FROM custom_field_definitions WHERE tenant_id=? AND entity_type=?
       ORDER BY sort_order, id`, [req.user.tenantId, entity]);
    res.json({ fields: serialize(rows) });
  } catch (err) { next(err); }
});

// POST /api/custom-fields — create a definition.
customFieldsRouter.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const entity = ENTITIES.includes(b.entity_type) ? b.entity_type : 'customer';
    if (!b.name || !b.field_type) return res.status(400).json({ error: 'Απαιτούνται όνομα και τύπος' });
    const key = await uniqueKey(req.user.tenantId, entity, b.name);
    const order = (await query('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM custom_field_definitions WHERE tenant_id=? AND entity_type=?', [req.user.tenantId, entity])).rows[0].n;
    const r = await query(
      `INSERT INTO custom_field_definitions
        (tenant_id, entity_type, name, \`key\`, field_type, required, searchable, filterable, visible_in_list, settings, section, sort_order, active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`,
      [req.user.tenantId, entity, b.name, key, b.field_type, b.required ? 1 : 0, b.searchable ? 1 : 0,
        b.filterable ? 1 : 0, b.visible_in_list ? 1 : 0, JSON.stringify(b.settings || {}), b.section || null, order]);
    res.status(201).json({ id: r.rows.insertId, key });
  } catch (err) { next(err); }
});

// PATCH /api/custom-fields/reorder — persist a new order for an entity's fields.
customFieldsRouter.patch('/reorder', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
    for (let i = 0; i < ids.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await query('UPDATE custom_field_definitions SET sort_order=? WHERE id=? AND tenant_id=?', [i + 1, ids[i], req.user.tenantId]);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /api/custom-fields/:id — update a definition.
customFieldsRouter.patch('/:id', async (req, res, next) => {
  try {
    const def = await ownDef(Number(req.params.id), req.user.tenantId);
    if (!def) return res.status(404).json({ error: 'Το πεδίο δεν βρέθηκε' });
    const b = req.body || {};
    const sets = [];
    const params = [];
    if (b.name !== undefined) { sets.push('name=?'); params.push(b.name); }
    if (b.field_type !== undefined) { sets.push('field_type=?'); params.push(b.field_type); }
    if (b.section !== undefined) { sets.push('section=?'); params.push(b.section || null); }
    if (b.settings !== undefined) { sets.push('settings=?'); params.push(JSON.stringify(b.settings || {})); }
    for (const f of FLAGS) if (b[f] !== undefined) { sets.push(`${f}=?`); params.push(b[f] ? 1 : 0); }
    if (!sets.length) return res.status(400).json({ error: 'Καμία αλλαγή' });
    params.push(def.id);
    await query(`UPDATE custom_field_definitions SET ${sets.join(', ')} WHERE id=?`, params);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/custom-fields/:id/duplicate
customFieldsRouter.post('/:id/duplicate', async (req, res, next) => {
  try {
    const d = await ownDef(Number(req.params.id), req.user.tenantId);
    if (!d) return res.status(404).json({ error: 'Το πεδίο δεν βρέθηκε' });
    const name = `${d.name} (αντίγραφο)`;
    const key = await uniqueKey(req.user.tenantId, d.entity_type, name);
    const order = (await query('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM custom_field_definitions WHERE tenant_id=? AND entity_type=?', [req.user.tenantId, d.entity_type])).rows[0].n;
    const r = await query(
      `INSERT INTO custom_field_definitions
        (tenant_id, entity_type, name, \`key\`, field_type, required, searchable, filterable, visible_in_list, settings, section, sort_order, active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.tenantId, d.entity_type, name, key, d.field_type, d.required, d.searchable, d.filterable,
        d.visible_in_list, typeof d.settings === 'string' ? d.settings : JSON.stringify(d.settings || {}), d.section, order, d.active]);
    res.status(201).json({ id: r.rows.insertId, key });
  } catch (err) { next(err); }
});

// DELETE /api/custom-fields/:id
customFieldsRouter.delete('/:id', async (req, res, next) => {
  try {
    const d = await ownDef(Number(req.params.id), req.user.tenantId);
    if (!d) return res.status(404).json({ error: 'Το πεδίο δεν βρέθηκε' });
    await query('DELETE FROM custom_field_definitions WHERE id=?', [d.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
