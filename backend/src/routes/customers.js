import { Router } from 'express';
import { query } from '../db.js';
import { encodeCursor, decodeCursor, clampLimit } from '../lib/cursor.js';
import { SORTS, buildFilters } from '../lib/customerFilters.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { normalizeFields } from '../lib/normalize.js';
import { valueColumns } from '../lib/customFields.js';

const CUSTOMER_FIELDS = ['first_name', 'last_name', 'email', 'phone', 'mobile', 'company',
  'tax_id', 'customer_type', 'status', 'is_vip', 'date_of_birth', 'address_line', 'city',
  'postal_code', 'profile_note', 'assigned_employee_id'];

function customerSearchNorm(r) {
  return normalizeFields(r.first_name, r.last_name, r.email, r.phone, r.mobile, r.company, r.tax_id, r.code);
}

export const customersRouter = Router();

// All customer reads require the customers.read permission.
customersRouter.use(authorize(PERMISSIONS.CUSTOMERS_READ));

// Verify any :id customer belongs to the caller's tenant (tenant isolation).
customersRouter.param('id', async (req, res, next, id) => {
  try {
    const cid = Number(id);
    if (!Number.isInteger(cid)) return res.status(400).json({ error: 'Μη έγκυρο id' });
    const { rows } = await query('SELECT id FROM customers WHERE id = ? AND tenant_id = ?', [cid, req.user.tenantId]);
    if (!rows.length) return res.status(404).json({ error: 'Customer not found' });
    next();
  } catch (err) { next(err); }
});

// GET /api/customers/search — high-performance server-side directory search.
customersRouter.get('/search', async (req, res, next) => {
  try {
    const t0 = Date.now();
    const limit = clampLimit(req.query.limit);
    const { params, where } = buildFilters(req);

    // Default ordering is by most recent visit; the FULLTEXT/LIKE search
    // predicate (if any) is applied in the WHERE by buildFilters().
    let sortKey = req.query.sort && SORTS[req.query.sort] ? req.query.sort : 'last_visit';
    const cfg = SORTS[sortKey];
    const idDir = cfg.dir === 'ASC' ? 'ASC' : 'DESC';

    const listCols = `c.id, c.code, c.full_name, c.email, c.phone, c.mobile, c.company,
             c.customer_type, c.status, c.is_vip, c.city, c.avatar_url,
             c.branches_count, c.spaces_count, c.bookings_count, c.visits_count,
             c.total_value, c.last_visit_at, c.next_booking_at,
             e.full_name AS assigned_employee`;

    // Page-based pagination (numbered pages) when `page` is provided.
    if (req.query.page !== undefined) {
      const pageSize = clampLimit(req.query.limit, 50, 100);
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const offset = (page - 1) * pageSize;
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const countRes = await query(`SELECT COUNT(*) AS total FROM customers c ${whereSql}`, params);
      const total = Number(countRes.rows[0].total);
      const { rows } = await query(
        `SELECT ${listCols}
         FROM customers c LEFT JOIN employees e ON e.id = c.assigned_employee_id
         ${whereSql}
         ORDER BY ${cfg.expr} ${cfg.dir}, c.id ${idDir}
         LIMIT ${pageSize} OFFSET ${offset}`, params);
      return res.json({
        results: rows, page, pageSize, total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        sort: sortKey, tookMs: Date.now() - t0,
      });
    }

    const selectCursor = `${cfg.expr} AS __cursor_val`;
    const cursor = decodeCursor(req.query.cursor);

    if (cursor && cursor.v !== undefined) {
      where.push(`(${cfg.expr}, c.id) ${cfg.cmp} (?, ?)`);
      params.push(cursor.v, cursor.id);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `
      SELECT c.id, c.code, c.full_name, c.email, c.phone, c.mobile, c.company,
             c.customer_type, c.status, c.is_vip, c.city, c.avatar_url,
             c.branches_count, c.spaces_count, c.bookings_count, c.visits_count,
             c.total_value, c.last_visit_at, c.next_booking_at,
             e.full_name AS assigned_employee,
             ${selectCursor}
      FROM customers c
      LEFT JOIN employees e ON e.id = c.assigned_employee_id
      ${whereSql}
      ORDER BY ${cfg.expr} ${cfg.dir}, c.id ${idDir}
      LIMIT ${limit + 1}`;
    const { rows } = await query(sql, params);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor({ v: last.__cursor_val, id: last.id }) : null;
    page.forEach((r) => delete r.__cursor_val);

    res.json({ results: page, nextCursor, hasMore, sort: sortKey, tookMs: Date.now() - t0 });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/count — result count for current filters.
customersRouter.get('/count', async (req, res, next) => {
  try {
    const { params, where } = buildFilters(req);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await query(`SELECT COUNT(*) AS total FROM customers c ${whereSql}`, params);
    res.json({ total: Number(rows[0].total) });
  } catch (err) {
    next(err);
  }
});

// POST /api/customers — create a customer in the caller's tenant.
customersRouter.post('/', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.first_name || !b.last_name) return res.status(400).json({ error: 'Συμπληρώστε όνομα και επώνυμο' });
    const tmpCode = `TMP-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const vals = {
      tenant_id: req.user.tenantId, code: tmpCode,
      first_name: b.first_name, last_name: b.last_name, email: b.email || null,
      phone: b.phone || null, mobile: b.mobile || null, company: b.company || null,
      tax_id: b.tax_id || null, customer_type: b.customer_type || 'individual',
      status: b.status || 'active', is_vip: b.is_vip ? 1 : 0, date_of_birth: b.date_of_birth || null,
      address_line: b.address_line || null, city: b.city || null, postal_code: b.postal_code || null,
      profile_note: b.profile_note || null, assigned_employee_id: b.assigned_employee_id || null,
      search_norm: '',
    };
    const cols = Object.keys(vals);
    const r = await query(`INSERT INTO customers (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      cols.map((c) => vals[c]));
    const id = r.rows.insertId;
    const code = `C-${100000 + id}`;
    await query('UPDATE customers SET code = ?, search_norm = ? WHERE id = ?',
      [code, customerSearchNorm({ ...vals, code }), id]);
    res.status(201).json({ id, code });
  } catch (err) { next(err); }
});

// PATCH /api/customers/:id — edit a customer (tenant verified by param).
customersRouter.patch('/:id', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cur = (await query('SELECT * FROM customers WHERE id = ?', [id])).rows[0];
    const b = req.body || {};
    const sets = [];
    const params = [];
    for (const f of CUSTOMER_FIELDS) {
      if (b[f] !== undefined) {
        sets.push(`${f} = ?`);
        params.push(f === 'is_vip' ? (b[f] ? 1 : 0) : (b[f] === '' ? null : b[f]));
      }
    }
    const merged = { ...cur, ...b, code: cur.code };
    sets.push('search_norm = ?'); params.push(customerSearchNorm(merged));
    sets.push('updated_at = NOW()');
    params.push(id);
    await query(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/customers/:id — remove a customer and all its data (cascade).
customersRouter.delete('/:id', authorize(PERMISSIONS.CUSTOMERS_DELETE), async (req, res, next) => {
  try {
    await query('DELETE FROM customers WHERE id = ? AND tenant_id = ?', [Number(req.params.id), req.user.tenantId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/customers/:id — Customer 360 header + stats + tags.
customersRouter.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await query(
      `SELECT c.*, e.full_name AS assigned_employee, e.role AS assigned_employee_role
       FROM customers c LEFT JOIN employees e ON e.id = c.assigned_employee_id
       WHERE c.id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Customer not found' });
    const customer = rows[0];

    const tags = await query(
      `SELECT t.id, t.name, t.slug, t.color FROM customer_tags ct
       JOIN tags t ON t.id = ct.tag_id WHERE ct.customer_id = ? ORDER BY t.name`, [id]);

    const nextBooking = await query(
      `SELECT b.id, b.starts_at, b.ends_at, b.status, s.name AS space_name, br.name AS branch_name
       FROM bookings b
       LEFT JOIN spaces s ON s.id = b.space_id
       LEFT JOIN branches br ON br.id = b.branch_id
       WHERE b.customer_id = ? AND b.starts_at >= NOW()
       ORDER BY b.starts_at ASC LIMIT 1`, [id]);

    res.json({ customer, tags: tags.rows, nextBooking: nextBooking.rows[0] || null });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id/branches — the customer's own branches, each with its spaces.
customersRouter.get('/:id/branches', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const branches = await query(
      `SELECT id, is_primary, visits_count, spaces_count, total_value, last_visit_at,
              name, address_line, city, area, phone, email, image_url, lat, lng
       FROM branches WHERE customer_id = ?
       ORDER BY is_primary DESC, visits_count DESC`, [id]);

    const spaces = await query(
      `SELECT id, branch_id, visits_count, bookings_count, last_visit_at,
              name, space_type, image_url, capacity, floor
       FROM spaces WHERE customer_id = ?
       ORDER BY visits_count DESC`, [id]);

    const byBranch = {};
    for (const s of spaces.rows) (byBranch[s.branch_id] ||= []).push(s);
    res.json({ branches: branches.rows.map((b) => ({ ...b, spaces: byBranch[b.id] || [] })) });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id/spaces/:spaceId/usage — space drawer content.
customersRouter.get('/:id/spaces/:spaceId/usage', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const spaceId = Number(req.params.spaceId);
    const space = await query(
      `SELECT s.*, b.name AS branch_name, b.city FROM spaces s
       JOIN branches b ON b.id = s.branch_id
       WHERE s.id = ? AND s.customer_id = ?`, [spaceId, id]);
    if (!space.rows.length) return res.status(404).json({ error: 'Space not found' });

    const bookings = await query(
      `SELECT id, starts_at, ends_at, status, amount FROM bookings
       WHERE customer_id = ? AND space_id = ? ORDER BY starts_at DESC LIMIT 10`, [id, spaceId]);
    const visits = await query(
      `SELECT id, visited_at, duration_minutes, visit_type, status FROM visits
       WHERE customer_id = ? AND space_id = ? ORDER BY visited_at DESC LIMIT 10`, [id, spaceId]);

    const s = space.rows[0];
    res.json({
      space: s,
      usage: { visits_count: s.visits_count, bookings_count: s.bookings_count, last_visit_at: s.last_visit_at },
      bookings: bookings.rows,
      visits: visits.rows,
    });
  } catch (err) {
    next(err);
  }
});

// Generic paged sub-resource loader.
function subResource(sql, mapRow) {
  return async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const limit = clampLimit(req.query.limit, 15, 50);
      const offset = Number(req.query.offset) || 0;
      const { rows } = await query(sql, [id, limit + 1, offset]);
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit).map(mapRow || ((r) => r));
      res.json({ results: page, hasMore, nextOffset: offset + limit });
    } catch (err) {
      next(err);
    }
  };
}

customersRouter.get('/:id/activities', subResource(
  `SELECT a.id, a.type, a.description, a.created_at, br.name AS branch_name, s.name AS space_name
   FROM activities a
   LEFT JOIN branches br ON br.id = a.branch_id
   LEFT JOIN spaces s ON s.id = a.space_id
   WHERE a.customer_id = ? ORDER BY a.created_at DESC LIMIT ? OFFSET ?`));

customersRouter.get('/:id/bookings', subResource(
  `SELECT b.id, b.starts_at, b.ends_at, b.status, b.amount, br.name AS branch_name, s.name AS space_name
   FROM bookings b
   LEFT JOIN branches br ON br.id = b.branch_id
   LEFT JOIN spaces s ON s.id = b.space_id
   WHERE b.customer_id = ? ORDER BY b.starts_at DESC LIMIT ? OFFSET ?`));

customersRouter.get('/:id/visits', subResource(
  `SELECT v.id, v.visited_at, v.duration_minutes, v.visit_type, v.status, br.name AS branch_name, s.name AS space_name
   FROM visits v
   LEFT JOIN branches br ON br.id = v.branch_id
   LEFT JOIN spaces s ON s.id = v.space_id
   WHERE v.customer_id = ? ORDER BY v.visited_at DESC LIMIT ? OFFSET ?`));

customersRouter.get('/:id/payments', subResource(
  `SELECT id, amount, method, status, paid_at FROM payments
   WHERE customer_id = ? ORDER BY paid_at DESC LIMIT ? OFFSET ?`));

customersRouter.get('/:id/communications', subResource(
  `SELECT id, channel, direction, subject, body, created_at FROM communications
   WHERE customer_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`));

customersRouter.get('/:id/documents', subResource(
  `SELECT id, name, mime_type, size_bytes, url, created_at FROM documents
   WHERE customer_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`));

customersRouter.get('/:id/notes', subResource(
  `SELECT id, body, created_at FROM notes
   WHERE customer_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`));

// GET /api/customers/:id/custom-fields — definitions + this customer's values.
customersRouter.get('/:id/custom-fields', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await query(
      `SELECT d.id, d.name, d.\`key\`, d.field_type, d.section, d.sort_order, d.settings, d.required,
              d.searchable, d.filterable,
              v.text_value, v.number_value, v.date_value, v.boolean_value, v.json_value
       FROM custom_field_definitions d
       LEFT JOIN customer_custom_field_values v
         ON v.field_definition_id = d.id AND v.customer_id = ?
       WHERE d.entity_type = 'customer' AND d.active = 1 AND d.tenant_id = ?
       ORDER BY d.sort_order, d.id`, [id, req.user.tenantId]);
    for (const r of rows) {
      if (typeof r.settings === 'string') { try { r.settings = JSON.parse(r.settings); } catch { r.settings = {}; } }
      if (typeof r.json_value === 'string') { try { r.json_value = JSON.parse(r.json_value); } catch { /* keep */ } }
    }
    res.json({ fields: rows });
  } catch (err) {
    next(err);
  }
});

// PUT /api/customers/:id/custom-fields — upsert this customer's custom field values.
customersRouter.put('/:id/custom-fields', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const values = req.body?.values || {};
    const defs = (await query(
      'SELECT id, field_type FROM custom_field_definitions WHERE tenant_id = ? AND entity_type = ?',
      [req.user.tenantId, 'customer'])).rows;
    const byId = new Map(defs.map((d) => [String(d.id), d]));
    for (const [defId, val] of Object.entries(values)) {
      const def = byId.get(String(defId));
      if (!def) continue;
      const c = valueColumns(def.field_type, val);
      const empty = c.text_value == null && c.number_value == null && c.date_value == null && c.boolean_value == null && c.json_value == null;
      if (empty) {
        await query('DELETE FROM customer_custom_field_values WHERE customer_id=? AND field_definition_id=?', [id, defId]);
      } else {
        await query(
          `INSERT INTO customer_custom_field_values
            (customer_id, field_definition_id, text_value, number_value, date_value, boolean_value, json_value)
           VALUES (?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE text_value=VALUES(text_value), number_value=VALUES(number_value),
             date_value=VALUES(date_value), boolean_value=VALUES(boolean_value), json_value=VALUES(json_value)`,
          [id, defId, c.text_value, c.number_value, c.date_value, c.boolean_value, c.json_value]);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
