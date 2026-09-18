import { Router } from 'express';
import { query } from '../db.js';
import { encodeCursor, decodeCursor, clampLimit } from '../lib/cursor.js';
import { buildFilters, resolveSort } from '../lib/customerFilters.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { normalizeFields } from '../lib/normalize.js';
import { loadEntityCustomFields, saveEntityCustomFields } from '../lib/customFields.js';
import { logActivity } from '../lib/activity.js';
import { parseJson } from '../lib/masterData.js';
import { CHANNELS, CHANNEL_META, deliverMessage, mergeMessaging } from '../lib/messaging.js';
import { mergeTenantSettings } from '../lib/tenantSettings.js';
import { loadTenant } from '../lib/tenants.js';
import { computeReminderState } from '../lib/reminderSettings.js';
import { diffRecords, snapshotFields, packDetails, changeSummary, parseDetails } from '../lib/activityDiff.js';
import { parseNotePayload, noteReminderState } from '../lib/notes.js';
import { extractClientRequestId, isDuplicateKeyError } from '../lib/idempotency.js';

const CUSTOMER_FIELDS = ['first_name', 'last_name', 'email', 'phone', 'mobile', 'company',
  'tax_id', 'customer_type', 'status', 'is_vip', 'date_of_birth', 'address_line', 'city',
  'postal_code', 'country', 'profile_note', 'assigned_employee_id', 'avatar_url',
  'next_action_at', 'next_action_note'];

function customerSearchNorm(r) {
  return normalizeFields(r.first_name, r.last_name, r.email, r.phone, r.mobile, r.company, r.tax_id, r.code, r.address_line, r.city, r.postal_code);
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
    const { key: sortKey, cfg, idDir } = resolveSort(req);

    const customFields = `(SELECT COALESCE(JSON_OBJECTAGG(d.key, COALESCE(v.text_value, v.number_value, v.date_value, v.boolean_value, v.json_value)), JSON_OBJECT())
      FROM custom_field_definitions d
      LEFT JOIN customer_custom_field_values v ON v.field_definition_id = d.id AND v.customer_id = c.id
      WHERE d.tenant_id = c.tenant_id AND d.entity_type = 'customer' AND d.active = 1) AS custom_fields`;
    const listCols = `c.*, e.full_name AS assigned_employee, ${customFields}`;

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
        sort: sortKey, sortDir: cfg.dir, tookMs: Date.now() - t0,
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
      SELECT c.*, e.full_name AS assigned_employee, ${customFields},
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

    res.json({ results: page, nextCursor, hasMore, sort: sortKey, sortDir: cfg.dir, tookMs: Date.now() - t0 });
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

// POST /api/customers/check-duplicates — same tenant, email/phone/mobile/tax_id.
customersRouter.post('/check-duplicates', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const b = req.body || {};
    const excludeId = Number(b.excludeId) || 0;
    const email = String(b.email || '').trim().toLowerCase();
    const phone = String(b.phone || '').trim();
    const mobile = String(b.mobile || '').trim();
    const taxId = String(b.tax_id || '').trim();
    const clauses = [];
    const params = [req.user.tenantId];
    if (email) { clauses.push('LOWER(c.email) = ?'); params.push(email); }
    if (phone) { clauses.push('c.phone = ? OR c.mobile = ?'); params.push(phone, phone); }
    if (mobile && mobile !== phone) { clauses.push('c.phone = ? OR c.mobile = ?'); params.push(mobile, mobile); }
    if (taxId) { clauses.push('c.tax_id = ?'); params.push(taxId); }
    if (!clauses.length) return res.json({ matches: [] });
    if (excludeId) { params.push(excludeId); }
    const { rows } = await query(
      `SELECT c.id, c.code, c.full_name, c.email, c.phone, c.mobile, c.tax_id, c.company, c.city, c.customer_type
       FROM customers c
       WHERE c.tenant_id = ? AND (${clauses.join(' OR ')}) ${excludeId ? 'AND c.id <> ?' : ''}
       ORDER BY c.id DESC LIMIT 8`, params);
    const matches = rows.map((r) => {
      const reasons = [];
      if (email && String(r.email || '').toLowerCase() === email) reasons.push('email');
      if (phone && (r.phone === phone || r.mobile === phone)) reasons.push('τηλέφωνο');
      if (mobile && mobile !== phone && (r.phone === mobile || r.mobile === mobile)) reasons.push('κινητό');
      if (taxId && r.tax_id === taxId) reasons.push('ΑΦΜ');
      return { ...r, reasons };
    });
    res.json({ matches });
  } catch (err) { next(err); }
});

// Looks up a previously created customer by its idempotency key, so a retried
// request (e.g. an offline client replaying a queued submission) can be
// answered with the existing record instead of erroring or duplicating.
async function findByClientRequestId(tenantId, clientRequestId) {
  const { rows } = await query(
    'SELECT id, code FROM customers WHERE tenant_id = ? AND client_request_id = ?',
    [tenantId, clientRequestId]);
  return rows[0] || null;
}

// POST /api/customers — create a customer in the caller's tenant.
customersRouter.post('/', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.first_name || !b.last_name) return res.status(400).json({ error: 'Συμπληρώστε όνομα και επώνυμο' });
    const clientRequestId = extractClientRequestId(req);
    if (clientRequestId) {
      const existing = await findByClientRequestId(req.user.tenantId, clientRequestId);
      if (existing) return res.status(200).json({ id: existing.id, code: existing.code, idempotentReplay: true });
    }
    const tmpCode = `TMP-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const vals = {
      tenant_id: req.user.tenantId, code: tmpCode,
      first_name: b.first_name, last_name: b.last_name, email: b.email || null,
      phone: b.phone || null, mobile: b.mobile || null, company: b.company || null,
      tax_id: b.tax_id || null, customer_type: b.customer_type || 'individual',
      status: b.status || 'active', is_vip: b.is_vip ? 1 : 0, date_of_birth: b.date_of_birth || null,
      address_line: b.address_line || null, city: b.city || null, postal_code: b.postal_code || null,
      country: b.country || 'Ελλάδα', avatar_url: b.avatar_url || null,
      profile_note: b.profile_note || null, assigned_employee_id: b.assigned_employee_id || null,
      search_norm: '', client_request_id: clientRequestId,
    };
    const cols = Object.keys(vals);
    let id;
    try {
      const r = await query(`INSERT INTO customers (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
        cols.map((c) => vals[c]));
      id = r.rows.insertId;
    } catch (err) {
      // A retried request can race the first attempt's commit; if the
      // unique (tenant, client_request_id) index rejected us, the customer
      // already exists — return it instead of surfacing a duplicate error.
      if (clientRequestId && isDuplicateKeyError(err)) {
        const existing = await findByClientRequestId(req.user.tenantId, clientRequestId);
        if (existing) return res.status(200).json({ id: existing.id, code: existing.code, idempotentReplay: true });
      }
      throw err;
    }
    const code = `C-${100000 + id}`;
    await query('UPDATE customers SET code = ?, search_norm = ? WHERE id = ?',
      [code, customerSearchNorm({ ...vals, code }), id]);
    await logActivity({
      tenantId: req.user.tenantId, customerId: id, type: 'customer_created',
      description: `Δημιουργία πελάτη: ${b.first_name} ${b.last_name}`,
      details: packDetails(req, { fields: snapshotFields(vals, CUSTOMER_FIELDS) }),
    });
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
    const patch = {};
    for (const f of CUSTOMER_FIELDS) {
      if (b[f] !== undefined) patch[f] = f === 'is_vip' ? (b[f] ? 1 : 0) : (b[f] === '' ? null : b[f]);
    }
    const changes = diffRecords(cur, patch);
    if (changes.length) {
      await logActivity({
        tenantId: req.user.tenantId, customerId: id, type: 'customer_updated',
        description: changeSummary('Ενημέρωση πελάτη', changes, 'Ενημέρωση στοιχείων πελάτη'),
        details: packDetails(req, { changes }),
      });
    }
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

    const contacts = await query(
      `SELECT id, first_name, last_name, role, email, phone, mobile, is_primary, notes
       FROM customer_contacts WHERE customer_id = ?
       ORDER BY is_primary DESC, last_name, first_name`, [id]);

    res.json({
      customer,
      tags: tags.rows,
      nextBooking: nextBooking.rows[0] || null,
      contacts: contacts.rows,
      primaryContact: contacts.rows.find((c) => c.is_primary) || contacts.rows[0] || null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id/branches — the customer's own branches, each with its spaces.
customersRouter.get('/:id/branches', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const branches = await query(
      `SELECT b.id, b.is_primary, b.visits_count, b.spaces_count, b.total_value, b.last_visit_at,
              b.name, b.address_line, b.city, b.area, b.phone, b.email, b.image_url, b.lat, b.lng,
              b.status, b.opening_hours, b.manager_employee_id, e.full_name AS manager_name,
              b.postal_code
       FROM branches b LEFT JOIN employees e ON e.id = b.manager_employee_id
       WHERE b.customer_id = ?
       ORDER BY b.is_primary DESC, b.visits_count DESC`, [id]);

    const spaces = await query(
      `SELECT id, branch_id, visits_count, bookings_count, last_visit_at,
              name, space_type, image_url, capacity, floor, status, amenities,
              hourly_price, daily_price, weekend_hourly_price
       FROM spaces WHERE customer_id = ?
       ORDER BY visits_count DESC`, [id]);

    const byBranch = {};
    for (const s of spaces.rows) {
      s.amenities = parseJson(s.amenities, []);
      (byBranch[s.branch_id] ||= []).push(s);
    }
    res.json({
      branches: branches.rows.map((b) => ({
        ...b,
        opening_hours: parseJson(b.opening_hours, null),
        spaces: byBranch[b.id] || [],
      })),
    });
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
    s.amenities = parseJson(s.amenities, []);
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
  `SELECT a.id, a.type, a.description, a.details, a.created_at, br.name AS branch_name, s.name AS space_name
   FROM activities a
   LEFT JOIN branches br ON br.id = a.branch_id
   LEFT JOIN spaces s ON s.id = a.space_id
   WHERE a.customer_id = ? ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
  (r) => ({ ...r, details: parseDetails(r.details) })));

customersRouter.get('/:id/follow-ups', async (req, res, next) => {
  try {
    const [{ rows }, tenant] = await Promise.all([
      query(
        `SELECT f.id, f.title, f.description, f.due_at, f.status, f.completed_at,
                f.assigned_employee_id, e.full_name AS assigned_employee
         FROM follow_ups f LEFT JOIN employees e ON e.id = f.assigned_employee_id
         WHERE f.customer_id = ? AND f.tenant_id = ? ORDER BY f.status = 'open' DESC, f.due_at ASC`,
        [Number(req.params.id), req.user.tenantId]),
      loadTenant(query, req.user.tenantId),
    ]);
    const reminders = tenant?.settings?.reminders;
    const timezone = tenant?.timezone || 'UTC';
    res.json({ results: rows.map((r) => ({ ...r, computed_status: computeReminderState(r.due_at, r.status, reminders, new Date(), timezone) })) });
  } catch (err) { next(err); }
});


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
  `SELECT id, channel, direction, subject, body, recipient, delivery_status, created_at FROM communications
   WHERE customer_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`));

customersRouter.post('/:id/messages', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const customerId = Number(req.params.id);
    const channel = String(req.body?.channel || '').trim();
    const to = String(req.body?.to || '').trim();
    const subject = String(req.body?.subject || '').trim().slice(0, 255);
    const body = String(req.body?.body || '').trim();
    if (!CHANNELS.includes(channel)) return res.status(400).json({ error: 'Μη έγκυρο κανάλι' });
    if (!to) return res.status(400).json({ error: 'Απαιτείται παραλήπτης' });
    if (!body) return res.status(400).json({ error: 'Απαιτείται κείμενο μηνύματος' });

    const { rows: tenantRows } = await query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId]);
    const messaging = mergeMessaging(mergeTenantSettings(tenantRows[0]?.settings).messaging);
    const cfg = messaging[channel];
    if (!cfg?.enabled) return res.status(400).json({ error: `Το κανάλι ${CHANNEL_META[channel].label} είναι απενεργοποιημένο στις ρυθμίσεις` });

    const delivery = await deliverMessage(channel, cfg, { to, subject, body });
    const channelLabel = CHANNEL_META[channel].label;
    const subjectLine = subject || `${channelLabel} προς ${to}`;

    const ins = await query(
      `INSERT INTO communications (customer_id, channel, direction, subject, body, recipient, delivery_status, employee_id)
       VALUES (?,?,?,?,?,?,?,?)`,
      [customerId, channel, 'outbound', subjectLine, body, to, delivery.status, req.user.id]);

    await logActivity({
      tenantId: req.user.tenantId,
      customerId,
      type: 'message_sent',
      description: `${channelLabel} προς ${to}`,
      details: packDetails(req, {
        message: {
          channel,
          channel_label: channelLabel,
          to,
          subject: subject || null,
          body,
          delivery_status: delivery.status,
          delivery_detail: delivery.detail || null,
        },
      }),
    });

    res.status(201).json({
      id: ins.rows.insertId,
      channel,
      to,
      subject: subjectLine,
      body,
      delivery,
    });
  } catch (err) { next(err); }
});

customersRouter.get('/:id/documents', subResource(
  `SELECT id, name, mime_type, size_bytes, url, category, description, uploaded_by, created_at FROM documents
   WHERE customer_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`));

customersRouter.post('/:id/documents', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim().slice(0, 255);
    const url = String(req.body?.url || '').trim();
    if (!name || !url) return res.status(400).json({ error: 'Απαιτείται όνομα και αρχείο' });
    const r = await query(
      `INSERT INTO documents (customer_id, name, mime_type, size_bytes, url, category, description, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [Number(req.params.id), name, String(req.body?.mime_type || '').slice(0, 120), Number(req.body?.size_bytes) || 0, url, String(req.body?.category || 'general').slice(0, 60), String(req.body?.description || '').slice(0, 500) || null, req.user.id]);
    res.status(201).json({ id: r.rows.insertId });
  } catch (err) { next(err); }
});

function mapNoteRow(row) {
  const tags = parseJson(row.tags, []) || [];
  return { ...row, tags, reminder_state: noteReminderState(row.due_at, row.is_archived) };
}

// GET /:id/notes — supports free-text search, category/tag/pin filters,
// archive scoping and reminder-due filtering for the customer notes timeline.
customersRouter.get('/:id/notes', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const limit = clampLimit(req.query.limit, 15, 50);
    const offset = Number(req.query.offset) || 0;
    const where = ['n.customer_id = ?'];
    const params = [id];
    const archived = String(req.query.archived || '0');
    if (archived === '1') where.push('n.is_archived = 1');
    else if (archived !== 'all') where.push('n.is_archived = 0');
    if (req.query.category) { where.push('n.category = ?'); params.push(String(req.query.category).trim().slice(0, 60)); }
    if (req.query.pinned === '1') where.push('n.is_pinned = 1');
    if (req.query.tag) { where.push('JSON_CONTAINS(n.tags, JSON_QUOTE(?))'); params.push(String(req.query.tag).trim().slice(0, 30)); }
    if (req.query.due === 'overdue') where.push('n.due_at IS NOT NULL AND n.due_at < NOW() AND n.is_archived = 0');
    else if (req.query.due === 'upcoming') where.push('n.due_at IS NOT NULL AND n.due_at >= NOW()');
    else if (req.query.due === 'has_due') where.push('n.due_at IS NOT NULL');
    const q = String(req.query.q || '').trim();
    if (q) { where.push('(n.title LIKE ? OR n.body LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    params.push(limit + 1, offset);
    const { rows } = await query(
      `SELECT n.id, n.body, n.title, n.body_html, n.category, n.is_pinned, n.is_archived, n.due_at, n.tags,
              n.employee_id, n.created_at, n.updated_at, e.full_name AS author_name
       FROM notes n LEFT JOIN employees e ON e.id = n.employee_id
       WHERE ${where.join(' AND ')}
       ORDER BY n.is_pinned DESC, COALESCE(n.due_at, '9999-12-31') ASC, n.created_at DESC
       LIMIT ? OFFSET ?`, params);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).map(mapNoteRow);
    res.json({ results: page, hasMore, nextOffset: offset + limit });
  } catch (err) { next(err); }
});

customersRouter.post('/:id/notes', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const customerId = Number(req.params.id);
    const parsed = parseNotePayload(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const r = await query(
      `INSERT INTO notes (customer_id, body, title, body_html, category, is_pinned, due_at, tags, employee_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [customerId, parsed.body, parsed.title, parsed.bodyHtml, parsed.category, parsed.isPinned, parsed.dueAt,
        JSON.stringify(parsed.tags), req.user.id]);
    res.status(201).json({ id: r.rows.insertId });
  } catch (err) { next(err); }
});

customersRouter.patch('/:id/notes/:noteId', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const parsed = parseNotePayload(req.body, { partial: true });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const fields = [];
    const params = [];
    if (parsed.title !== undefined) { fields.push('title = ?'); params.push(parsed.title); }
    if (parsed.body !== undefined) { fields.push('body = ?', 'body_html = ?'); params.push(parsed.body, parsed.bodyHtml); }
    if (parsed.category !== undefined) { fields.push('category = ?'); params.push(parsed.category); }
    if (parsed.isPinned !== undefined) { fields.push('is_pinned = ?'); params.push(parsed.isPinned); }
    if (parsed.isArchived !== undefined) { fields.push('is_archived = ?'); params.push(parsed.isArchived); }
    if (parsed.dueAt !== undefined) { fields.push('due_at = ?'); params.push(parsed.dueAt); }
    if (parsed.tags !== undefined) { fields.push('tags = ?'); params.push(JSON.stringify(parsed.tags)); }
    if (!fields.length) return res.json({ ok: true });
    params.push(Number(req.params.noteId), Number(req.params.id));
    await query(`UPDATE notes SET ${fields.join(', ')} WHERE id = ? AND customer_id = ?`, params);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

customersRouter.delete('/:id/notes/:noteId', authorize(PERMISSIONS.CUSTOMERS_DELETE), async (req, res, next) => {
  try { await query('DELETE FROM notes WHERE id = ? AND customer_id = ?', [Number(req.params.noteId), Number(req.params.id)]); res.json({ ok: true }); }
  catch (err) { next(err); }
});

// ---- Tags -----------------------------------------------------------------
customersRouter.post('/:id/tags', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    let tagId = Number(req.body?.tagId);
    const name = String(req.body?.name || '').trim();
    if (!tagId && name) {
      const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `tag-${Date.now()}`;
      const color = ['blue', 'green', 'gold', 'indigo', 'teal', 'purple', 'slate'][Math.floor(Math.random() * 7)];
      const existing = (await query('SELECT id FROM tags WHERE slug = ?', [slug])).rows[0];
      if (existing) tagId = existing.id;
      else {
        const r = await query('INSERT INTO tags (name, slug, color) VALUES (?,?,?)', [name, slug, req.body?.color || color]);
        tagId = r.rows.insertId;
      }
    }
    if (!tagId) return res.status(400).json({ error: 'Απαιτείται ετικέτα' });
    await query('INSERT IGNORE INTO customer_tags (customer_id, tag_id) VALUES (?,?)', [id, tagId]);
    const tag = (await query('SELECT id, name, slug, color FROM tags WHERE id = ?', [tagId])).rows[0];
    res.status(201).json({ tag });
  } catch (err) { next(err); }
});

customersRouter.delete('/:id/tags/:tagId', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    await query('DELETE FROM customer_tags WHERE customer_id = ? AND tag_id = ?',
      [Number(req.params.id), Number(req.params.tagId)]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---- Contacts -------------------------------------------------------------
customersRouter.get('/:id/contacts', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, first_name, last_name, role, email, phone, mobile, is_primary, notes, created_at
       FROM customer_contacts WHERE customer_id = ?
       ORDER BY is_primary DESC, last_name, first_name`, [Number(req.params.id)]);
    res.json({ contacts: rows });
  } catch (err) { next(err); }
});

async function unsetOtherPrimary(customerId, keepId) {
  await query('UPDATE customer_contacts SET is_primary = 0 WHERE customer_id = ? AND id <> ?', [customerId, keepId || 0]);
}

customersRouter.post('/:id/contacts', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const customerId = Number(req.params.id);
    const b = req.body || {};
    if (!b.first_name || !b.last_name) return res.status(400).json({ error: 'Συμπληρώστε όνομα και επώνυμο' });
    const r = await query(
      `INSERT INTO customer_contacts
        (tenant_id, customer_id, first_name, last_name, role, email, phone, mobile, is_primary, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [req.user.tenantId, customerId, b.first_name, b.last_name, b.role || null, b.email || null,
        b.phone || null, b.mobile || null, b.is_primary ? 1 : 0, b.notes || null]);
    const id = r.rows.insertId;
    if (b.is_primary) await unsetOtherPrimary(customerId, id);
    await logActivity({
      tenantId: req.user.tenantId, customerId, type: 'contact_added',
      description: `Προστέθηκε επαφή: ${b.first_name} ${b.last_name}`,
      details: packDetails(req, {
        fields: snapshotFields({
          first_name: b.first_name, last_name: b.last_name, role: b.role,
          email: b.email, phone: b.phone, mobile: b.mobile, is_primary: b.is_primary ? 1 : 0, notes: b.notes,
        }, ['first_name', 'last_name', 'role', 'email', 'phone', 'mobile', 'is_primary', 'notes']),
      }),
    });
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

customersRouter.patch('/:id/contacts/:contactId', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const customerId = Number(req.params.id);
    const contactId = Number(req.params.contactId);
    const cur = (await query(
      'SELECT * FROM customer_contacts WHERE id = ? AND customer_id = ?', [contactId, customerId])).rows[0];
    if (!cur) return res.status(404).json({ error: 'Η επαφή δεν βρέθηκε' });
    const b = req.body || {};
    const fields = ['first_name', 'last_name', 'role', 'email', 'phone', 'mobile', 'notes'];
    const sets = []; const params = [];
    for (const f of fields) if (b[f] !== undefined) { sets.push(`${f} = ?`); params.push(b[f] === '' ? null : b[f]); }
    if (b.is_primary !== undefined) { sets.push('is_primary = ?'); params.push(b.is_primary ? 1 : 0); }
    if (!sets.length) return res.status(400).json({ error: 'Καμία αλλαγή' });
    params.push(contactId);
    await query(`UPDATE customer_contacts SET ${sets.join(', ')} WHERE id = ?`, params);
    if (b.is_primary) await unsetOtherPrimary(customerId, contactId);
    const patch = {};
    for (const f of fields) if (b[f] !== undefined) patch[f] = b[f] === '' ? null : b[f];
    if (b.is_primary !== undefined) patch.is_primary = b.is_primary ? 1 : 0;
    const changes = diffRecords(cur, patch);
    if (changes.length) {
      await logActivity({
        tenantId: req.user.tenantId, customerId, type: 'contact_updated',
        description: changeSummary(`Ενημέρωση επαφής: ${cur.first_name} ${cur.last_name}`, changes, `Ενημέρωση επαφής: ${cur.first_name} ${cur.last_name}`),
        details: packDetails(req, { changes }),
      });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

customersRouter.delete('/:id/contacts/:contactId', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const customerId = Number(req.params.id);
    const contactId = Number(req.params.contactId);
    const cur = (await query(
      'SELECT first_name, last_name FROM customer_contacts WHERE id = ? AND customer_id = ?',
      [contactId, customerId])).rows[0];
    if (!cur) return res.status(404).json({ error: 'Η επαφή δεν βρέθηκε' });
    await query('DELETE FROM customer_contacts WHERE id = ?', [contactId]);
    await logActivity({
      tenantId: req.user.tenantId, customerId, type: 'contact_removed',
      description: `Διαγράφηκε επαφή: ${cur.first_name} ${cur.last_name}`,
      details: packDetails(req, {
        fields: snapshotFields(cur, ['first_name', 'last_name', 'role', 'email', 'phone', 'mobile']),
      }),
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/customers/:id/custom-fields — definitions + this customer's values.
customersRouter.get('/:id/custom-fields', async (req, res, next) => {
  try {
    const fields = await loadEntityCustomFields(query, {
      tenantId: req.user.tenantId, entityType: 'customer', entityId: Number(req.params.id),
    });
    res.json({ fields });
  } catch (err) {
    next(err);
  }
});

// PUT /api/customers/:id/custom-fields — upsert this customer's custom field values.
customersRouter.put('/:id/custom-fields', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    await saveEntityCustomFields(query, {
      tenantId: req.user.tenantId, entityType: 'customer',
      entityId: Number(req.params.id), values: req.body?.values || {},
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
