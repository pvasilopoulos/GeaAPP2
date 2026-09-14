import { Router } from 'express';
import { query } from '../db.js';
import { encodeCursor, decodeCursor, clampLimit } from '../lib/cursor.js';

export const customersRouter = Router();

// Sort configurations for keyset pagination. Each entry defines the ordering
// expression, direction, comparison operator for the "after" cursor, the SQL
// type used to cast the cursor value, and the alias exposed for the next cursor.
const SORTS = {
  last_visit: { expr: 'COALESCE(c.last_visit_at, to_timestamp(0))', dir: 'DESC', cmp: '<', cast: 'timestamptz' },
  value:      { expr: 'c.total_value',                              dir: 'DESC', cmp: '<', cast: 'numeric' },
  created:    { expr: 'c.created_at',                               dir: 'DESC', cmp: '<', cast: 'timestamptz' },
  name:       { expr: 'f_unaccent(lower(c.full_name))',             dir: 'ASC',  cmp: '>', cast: 'text' },
};

// ---------------------------------------------------------------------------
// GET /api/customers/search — high-performance server-side directory search.
// ---------------------------------------------------------------------------
customersRouter.get('/search', async (req, res, next) => {
  try {
    const t0 = Date.now();
    const {
      q, branchId, spaceId, status, customerType, tag, isVip,
      lastVisitFrom, lastVisitTo, employeeId,
    } = req.query;
    const limit = clampLimit(req.query.limit);

    const params = [];
    const where = [];
    const p = (v) => { params.push(v); return `$${params.length}`; };

    let relevanceExpr = null;
    if (q && String(q).trim()) {
      const qn = String(q).trim();
      const qParam = p(qn);
      where.push(`f_unaccent(lower(c.search_text)) LIKE '%' || f_unaccent(lower(${qParam})) || '%'`);
      // Relevance score: prefix/exact boosts + trigram similarity on name & company.
      relevanceExpr = `(
        (CASE WHEN c.code ILIKE ${qParam} THEN 3.0 ELSE 0 END) +
        (CASE WHEN f_unaccent(lower(c.full_name)) LIKE f_unaccent(lower(${qParam})) || '%' THEN 1.5 ELSE 0 END) +
        GREATEST(
          similarity(f_unaccent(lower(c.full_name)), f_unaccent(lower(${qParam}))),
          similarity(f_unaccent(lower(COALESCE(c.company,''))), f_unaccent(lower(${qParam})))
        )
      )`;
    }

    if (status) where.push(`c.status = ANY(${p(String(status).split(','))})`);
    if (customerType) where.push(`c.customer_type = ${p(customerType)}`);
    if (isVip === 'true') where.push('c.is_vip = true');
    if (employeeId) where.push(`c.assigned_employee_id = ${p(Number(employeeId))}`);
    if (lastVisitFrom) where.push(`c.last_visit_at >= ${p(lastVisitFrom)}`);
    if (lastVisitTo) where.push(`c.last_visit_at <= ${p(lastVisitTo)}`);
    if (tag) where.push(`EXISTS (SELECT 1 FROM customer_tags ct JOIN tags t ON t.id = ct.tag_id
      WHERE ct.customer_id = c.id AND t.slug = ${p(tag)})`);
    if (branchId) where.push(`EXISTS (SELECT 1 FROM customer_branches cb
      WHERE cb.customer_id = c.id AND cb.branch_id = ${p(Number(branchId))})`);
    if (spaceId) where.push(`EXISTS (SELECT 1 FROM customer_spaces cs
      WHERE cs.customer_id = c.id AND cs.space_id = ${p(Number(spaceId))})`);

    // Choose sort. Relevance is the default when a query is present.
    let sortKey = req.query.sort;
    if (!sortKey) sortKey = relevanceExpr ? 'relevance' : 'last_visit';
    let orderExpr, dir, cmp, cast;
    if (sortKey === 'relevance' && relevanceExpr) {
      orderExpr = relevanceExpr; dir = 'DESC'; cmp = '<'; cast = 'double precision';
    } else {
      const cfg = SORTS[sortKey] || SORTS.last_visit;
      ({ expr: orderExpr, dir, cmp, cast } = cfg);
      sortKey = SORTS[sortKey] ? sortKey : 'last_visit';
    }
    const idDir = dir === 'ASC' ? 'ASC' : 'DESC';

    // Keyset "after" cursor.
    const cursor = decodeCursor(req.query.cursor);
    if (cursor && cursor.v !== undefined) {
      const vp = p(cursor.v);
      const ip = p(cursor.id);
      where.push(`(${orderExpr}, c.id) ${cmp} (${vp}::${cast}, ${ip}::bigint)`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `
      SELECT c.id, c.code, c.full_name, c.email, c.phone, c.mobile, c.company,
             c.customer_type, c.status, c.is_vip, c.city, c.avatar_url,
             c.branches_count, c.spaces_count, c.bookings_count, c.visits_count,
             c.total_value, c.last_visit_at, c.next_booking_at,
             e.full_name AS assigned_employee,
             ${orderExpr} AS __cursor_val
      FROM customers c
      LEFT JOIN employees e ON e.id = c.assigned_employee_id
      ${whereSql}
      ORDER BY ${orderExpr} ${dir}, c.id ${idDir}
      LIMIT ${limit + 1}`;

    const { rows } = await query(sql, params);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor = hasMore && last
      ? encodeCursor({ v: last.__cursor_val, id: last.id })
      : null;
    page.forEach((r) => delete r.__cursor_val);

    res.json({
      results: page,
      nextCursor,
      hasMore,
      sort: sortKey,
      tookMs: Date.now() - t0,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/count — approximate/exact total for the current filters.
// Uses the same predicates without ordering; capped for very broad queries.
customersRouter.get('/count', async (req, res, next) => {
  try {
    const { q, status, customerType, isVip, tag, branchId, spaceId } = req.query;
    const params = [];
    const where = [];
    const p = (v) => { params.push(v); return `$${params.length}`; };
    if (q && String(q).trim()) {
      where.push(`f_unaccent(lower(c.search_text)) LIKE '%' || f_unaccent(lower(${p(String(q).trim())})) || '%'`);
    }
    if (status) where.push(`c.status = ANY(${p(String(status).split(','))})`);
    if (customerType) where.push(`c.customer_type = ${p(customerType)}`);
    if (isVip === 'true') where.push('c.is_vip = true');
    if (tag) where.push(`EXISTS (SELECT 1 FROM customer_tags ct JOIN tags t ON t.id=ct.tag_id WHERE ct.customer_id=c.id AND t.slug=${p(tag)})`);
    if (branchId) where.push(`EXISTS (SELECT 1 FROM customer_branches cb WHERE cb.customer_id=c.id AND cb.branch_id=${p(Number(branchId))})`);
    if (spaceId) where.push(`EXISTS (SELECT 1 FROM customer_spaces cs WHERE cs.customer_id=c.id AND cs.space_id=${p(Number(spaceId))})`);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await query(`SELECT count(*)::bigint AS total FROM customers c ${whereSql}`, params);
    res.json({ total: Number(rows[0].total) });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id — Customer 360 header + basic info + stats + tags.
customersRouter.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await query(
      `SELECT c.*, e.full_name AS assigned_employee, e.role AS assigned_employee_role
       FROM customers c LEFT JOIN employees e ON e.id = c.assigned_employee_id
       WHERE c.id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Customer not found' });
    const customer = rows[0];

    const tags = await query(
      `SELECT t.id, t.name, t.slug, t.color FROM customer_tags ct
       JOIN tags t ON t.id = ct.tag_id WHERE ct.customer_id = $1 ORDER BY t.name`, [id]);

    const nextBooking = await query(
      `SELECT b.id, b.starts_at, b.ends_at, b.status, s.name AS space_name, br.name AS branch_name
       FROM bookings b
       LEFT JOIN spaces s ON s.id = b.space_id
       LEFT JOIN branches br ON br.id = b.branch_id
       WHERE b.customer_id = $1 AND b.starts_at >= now()
       ORDER BY b.starts_at ASC LIMIT 1`, [id]);

    res.json({ customer, tags: tags.rows, nextBooking: nextBooking.rows[0] || null });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id/branches — branches related to this customer + spaces.
customersRouter.get('/:id/branches', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const branches = await query(
      `SELECT cb.branch_id AS id, cb.is_primary, cb.visits_count, cb.spaces_count,
              cb.total_value, cb.last_visit_at,
              b.name, b.address_line, b.city, b.area, b.phone, b.email, b.image_url, b.lat, b.lng
       FROM customer_branches cb JOIN branches b ON b.id = cb.branch_id
       WHERE cb.customer_id = $1
       ORDER BY cb.is_primary DESC, cb.visits_count DESC`, [id]);

    const spaces = await query(
      `SELECT cs.space_id AS id, cs.branch_id, cs.visits_count, cs.bookings_count, cs.last_visit_at,
              s.name, s.space_type, s.image_url, s.capacity, s.floor
       FROM customer_spaces cs JOIN spaces s ON s.id = cs.space_id
       WHERE cs.customer_id = $1
       ORDER BY cs.visits_count DESC`, [id]);

    const byBranch = {};
    for (const s of spaces.rows) {
      (byBranch[s.branch_id] ||= []).push(s);
    }
    const result = branches.rows.map((b) => ({ ...b, spaces: byBranch[b.id] || [] }));
    res.json({ branches: result });
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
       JOIN branches b ON b.id = s.branch_id WHERE s.id = $1`, [spaceId]);
    if (!space.rows.length) return res.status(404).json({ error: 'Space not found' });

    const usage = await query(
      `SELECT visits_count, bookings_count, last_visit_at FROM customer_spaces
       WHERE customer_id = $1 AND space_id = $2`, [id, spaceId]);

    const bookings = await query(
      `SELECT id, starts_at, ends_at, status, amount FROM bookings
       WHERE customer_id = $1 AND space_id = $2 ORDER BY starts_at DESC LIMIT 10`, [id, spaceId]);

    const visits = await query(
      `SELECT id, visited_at, duration_minutes, visit_type, status FROM visits
       WHERE customer_id = $1 AND space_id = $2 ORDER BY visited_at DESC LIMIT 10`, [id, spaceId]);

    res.json({
      space: space.rows[0],
      usage: usage.rows[0] || { visits_count: 0, bookings_count: 0, last_visit_at: null },
      bookings: bookings.rows,
      visits: visits.rows,
    });
  } catch (err) {
    next(err);
  }
});

// Generic paged sub-resource loader (activities, bookings, visits, payments, ...).
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
   WHERE a.customer_id = $1 ORDER BY a.created_at DESC LIMIT $2 OFFSET $3`));

customersRouter.get('/:id/bookings', subResource(
  `SELECT b.id, b.starts_at, b.ends_at, b.status, b.amount,
          br.name AS branch_name, s.name AS space_name
   FROM bookings b
   LEFT JOIN branches br ON br.id = b.branch_id
   LEFT JOIN spaces s ON s.id = b.space_id
   WHERE b.customer_id = $1 ORDER BY b.starts_at DESC LIMIT $2 OFFSET $3`));

customersRouter.get('/:id/visits', subResource(
  `SELECT v.id, v.visited_at, v.duration_minutes, v.visit_type, v.status,
          br.name AS branch_name, s.name AS space_name
   FROM visits v
   LEFT JOIN branches br ON br.id = v.branch_id
   LEFT JOIN spaces s ON s.id = v.space_id
   WHERE v.customer_id = $1 ORDER BY v.visited_at DESC LIMIT $2 OFFSET $3`));

customersRouter.get('/:id/payments', subResource(
  `SELECT id, amount, method, status, paid_at FROM payments
   WHERE customer_id = $1 ORDER BY paid_at DESC LIMIT $2 OFFSET $3`));

customersRouter.get('/:id/communications', subResource(
  `SELECT id, channel, direction, subject, body, created_at FROM communications
   WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`));

customersRouter.get('/:id/documents', subResource(
  `SELECT id, name, mime_type, size_bytes, url, created_at FROM documents
   WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`));

customersRouter.get('/:id/notes', subResource(
  `SELECT id, body, created_at FROM notes
   WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`));

// GET /api/customers/:id/custom-fields — definitions + this customer's values.
customersRouter.get('/:id/custom-fields', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await query(
      `SELECT d.id, d.name, d.key, d.field_type, d.section, d.sort_order, d.settings,
              d.searchable, d.filterable,
              v.text_value, v.number_value, v.date_value, v.boolean_value, v.json_value
       FROM custom_field_definitions d
       LEFT JOIN customer_custom_field_values v
         ON v.field_definition_id = d.id AND v.customer_id = $1
       WHERE d.entity_type = 'customer' AND d.active
       ORDER BY d.sort_order, d.id`, [id]);
    res.json({ fields: rows });
  } catch (err) {
    next(err);
  }
});
