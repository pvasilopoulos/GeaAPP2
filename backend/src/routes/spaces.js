import { Router } from 'express';
import { query } from '../db.js';
import { clampLimit } from '../lib/cursor.js';
import { normalize, normalizeFields } from '../lib/normalize.js';
import { searchClause } from '../lib/search.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { logActivity } from '../lib/activity.js';
import { isSpaceStatus, parseJson, sanitizeAmenities } from '../lib/masterData.js';
import { loadEntityCustomFields, saveEntityCustomFields } from '../lib/customFields.js';
import { diffRecords, snapshotFields, packDetails, changeSummary } from '../lib/activityDiff.js';
import { enqueuePush } from '../lib/pushSync.js';

export const spacesRouter = Router();
spacesRouter.use(authorize(PERMISSIONS.SPACES_READ));

const FIELDS = ['name', 'space_type', 'capacity', 'floor', 'hourly_price', 'daily_price',
  'weekend_hourly_price', 'description', 'image_url'];

function numOrNull(v) {
  if (v === undefined) return undefined;
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function shapeSpace(row) {
  if (!row) return row;
  return { ...row, amenities: parseJson(row.amenities, []) };
}

// GET /api/spaces?q=&branchId=&limit= — spaces within the tenant.
spacesRouter.get('/', async (req, res, next) => {
  try {
    const qnorm = normalize(String(req.query.q || ''));
    const limit = clampLimit(req.query.limit, 20, 50);
    const params = [req.user.tenantId];
    const where = ['s.tenant_id = ?'];
    if (qnorm) { const sc = searchClause(qnorm, 's.search_norm'); where.push(sc.clause); params.push(...sc.params); }
    if (req.query.branchId) { where.push('s.branch_id = ?'); params.push(Number(req.query.branchId)); }
    const { rows } = await query(
      `SELECT s.id, s.customer_id, s.branch_id, s.code, s.name, s.space_type, s.capacity, s.image_url,
              s.status, s.hourly_price, b.name AS branch_name, b.city
       FROM spaces s JOIN branches b ON b.id = s.branch_id
       WHERE ${where.join(' AND ')} ORDER BY b.city, s.name LIMIT ${limit}`, params);
    res.json({ results: rows });
  } catch (err) { next(err); }
});

// POST /api/spaces — create a space under a branch.
spacesRouter.post('/', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const b = req.body || {};
    const branchId = Number(b.branchId);
    if (!branchId || !b.name) return res.status(400).json({ error: 'Απαιτούνται υποκατάστημα και όνομα' });
    const branch = (await query('SELECT id, customer_id, name FROM branches WHERE id = ? AND tenant_id = ?', [branchId, req.user.tenantId])).rows[0];
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    const status = isSpaceStatus(b.status) ? b.status : 'available';
    const amenities = JSON.stringify(sanitizeAmenities(b.amenities));

    const tmp = `TMP-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const r = await query(
      `INSERT INTO spaces (tenant_id, customer_id, branch_id, code, name, space_type, capacity, floor,
        hourly_price, daily_price, weekend_hourly_price, image_url, description, status, amenities,
        min_duration_minutes, slot_step_minutes, buffer_minutes, search_norm)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.tenantId, branch.customer_id, branchId, tmp, b.name, b.space_type || null,
        numOrNull(b.capacity), b.floor || null, numOrNull(b.hourly_price), numOrNull(b.daily_price),
        numOrNull(b.weekend_hourly_price), b.image_url || null, b.description || null, status, amenities,
        Number(b.min_duration_minutes) || 60, Number(b.slot_step_minutes) || 30,
        Number(b.buffer_minutes) || 0, '']);
    const id = r.rows.insertId;
    const code = `S-${1000000 + id}`;
    await query('UPDATE spaces SET code = ?, search_norm = ? WHERE id = ?',
      [code, normalizeFields(b.name, b.space_type, code, branch.name), id]);
    await query('UPDATE branches SET spaces_count = spaces_count + 1 WHERE id = ?', [branchId]);
    await query('UPDATE customers SET spaces_count = spaces_count + 1 WHERE id = ?', [branch.customer_id]);
    await logActivity({
      tenantId: req.user.tenantId, customerId: branch.customer_id, type: 'space_created',
      description: `Νέος χώρος: ${b.name}`, branchId, spaceId: id,
      details: packDetails(req, {
        fields: snapshotFields({
          name: b.name, space_type: b.space_type, capacity: b.capacity, floor: b.floor,
          hourly_price: b.hourly_price, daily_price: b.daily_price, status: b.status,
        }, ['name', 'space_type', 'capacity', 'floor', 'hourly_price', 'daily_price', 'status']),
      }),
    });
    enqueuePush({ tenantId: req.user.tenantId, entityType: 'spaces', entityId: id })
      .catch((e) => console.error('[pushSync] enqueue failed:', e.message));
    res.status(201).json({ id, code });
  } catch (err) { next(err); }
});

spacesRouter.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.*, b.name AS branch_name, b.city FROM spaces s
       JOIN branches b ON b.id = s.branch_id WHERE s.id = ? AND s.tenant_id = ?`,
      [Number(req.params.id), req.user.tenantId]);
    if (!rows.length) return res.status(404).json({ error: 'Space not found' });
    res.json({ space: shapeSpace(rows[0]) });
  } catch (err) { next(err); }
});

spacesRouter.get('/:id/custom-fields', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cur = (await query('SELECT id FROM spaces WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId])).rows[0];
    if (!cur) return res.status(404).json({ error: 'Space not found' });
    const fields = await loadEntityCustomFields(query, {
      tenantId: req.user.tenantId, entityType: 'space', entityId: id,
    });
    res.json({ fields });
  } catch (err) { next(err); }
});

spacesRouter.put('/:id/custom-fields', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cur = (await query('SELECT id FROM spaces WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId])).rows[0];
    if (!cur) return res.status(404).json({ error: 'Space not found' });
    await saveEntityCustomFields(query, {
      tenantId: req.user.tenantId, entityType: 'space', entityId: id, values: req.body?.values || {},
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /api/spaces/:id — edit a space.
spacesRouter.patch('/:id', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cur = (await query(`SELECT s.*, b.name AS branch_name FROM spaces s JOIN branches b ON b.id = s.branch_id
      WHERE s.id = ? AND s.tenant_id = ?`, [id, req.user.tenantId])).rows[0];
    if (!cur) return res.status(404).json({ error: 'Space not found' });
    const b = req.body || {};
    const sets = [];
    const params = [];
    for (const f of FIELDS) {
      if (b[f] !== undefined) {
        const numeric = ['capacity', 'hourly_price', 'daily_price', 'weekend_hourly_price'].includes(f);
        sets.push(`${f} = ?`);
        params.push(numeric ? numOrNull(b[f]) : (b[f] === '' ? null : b[f]));
      }
    }
    if (b.status !== undefined) {
      if (!isSpaceStatus(b.status)) return res.status(400).json({ error: 'Μη έγκυρη κατάσταση χώρου' });
      sets.push('status = ?'); params.push(b.status);
    }
    if (b.amenities !== undefined) { sets.push('amenities = ?'); params.push(JSON.stringify(sanitizeAmenities(b.amenities))); }
    for (const f of ['min_duration_minutes', 'slot_step_minutes', 'buffer_minutes']) {
      if (b[f] !== undefined) { sets.push(`${f} = ?`); params.push(Number(b[f]) || 0); }
    }
    const merged = { ...cur, ...b };
    sets.push('search_norm = ?'); params.push(normalizeFields(merged.name, merged.space_type, cur.code, cur.branch_name));
    params.push(id);
    await query(`UPDATE spaces SET ${sets.join(', ')} WHERE id = ?`, params);
    const patch = {};
    for (const f of FIELDS) {
      if (b[f] !== undefined) {
        const numeric = ['capacity', 'hourly_price', 'daily_price', 'weekend_hourly_price'].includes(f);
        patch[f] = numeric ? numOrNull(b[f]) : (b[f] === '' ? null : b[f]);
      }
    }
    if (b.status !== undefined) patch.status = b.status;
    if (b.amenities !== undefined) patch.amenities = sanitizeAmenities(b.amenities);
    for (const f of ['min_duration_minutes', 'slot_step_minutes', 'buffer_minutes']) {
      if (b[f] !== undefined) patch[f] = Number(b[f]) || 0;
    }
    const changes = diffRecords(cur, patch);
    await logActivity({
      tenantId: req.user.tenantId, customerId: cur.customer_id, type: 'space_updated',
      description: changeSummary(`Ενημέρωση χώρου: ${merged.name || cur.name}`, changes, `Ενημέρωση χώρου: ${merged.name || cur.name}`),
      branchId: cur.branch_id, spaceId: id,
      details: packDetails(req, { changes }),
    });
    enqueuePush({ tenantId: req.user.tenantId, entityType: 'spaces', entityId: id })
      .catch((e) => console.error('[pushSync] enqueue failed:', e.message));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/spaces/:id — remove a space.
spacesRouter.delete('/:id', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cur = (await query('SELECT customer_id, branch_id, name FROM spaces WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId])).rows[0];
    if (!cur) return res.status(404).json({ error: 'Space not found' });
    await query('DELETE FROM spaces WHERE id = ?', [id]);
    await query('UPDATE branches SET spaces_count = GREATEST(spaces_count - 1, 0) WHERE id = ?', [cur.branch_id]);
    await query('UPDATE customers SET spaces_count = GREATEST(spaces_count - 1, 0) WHERE id = ?', [cur.customer_id]);
    await logActivity({
      tenantId: req.user.tenantId, customerId: cur.customer_id, type: 'space_deleted',
      description: `Διαγραφή χώρου: ${cur.name}`, branchId: cur.branch_id,
      details: packDetails(req, { fields: snapshotFields(cur, ['name']) }),
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
