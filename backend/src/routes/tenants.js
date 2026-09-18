import { Router } from 'express';
import { query } from '../db.js';
import { PERMISSIONS } from '../lib/permissions.js';
import {
  publicTenant, loadTenant, createTenantWithOwner, uniqueSlug,
} from '../lib/tenants.js';
import { TENANT_STATUSES, PLANS, mergeTenantSettings, parseJson } from '../lib/tenantSettings.js';

export const tenantsRouter = Router();

function requirePlatform(req, res, next) {
  if (req.user?.isPlatformAdmin || req.user?.permissions?.includes(PERMISSIONS.TENANTS_PLATFORM)) return next();
  return res.status(403).json({ error: 'Απαιτείται πρόσβαση διαχειριστή πλατφόρμας' });
}

tenantsRouter.use(requirePlatform);

tenantsRouter.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const params = [];
    let where = '';
    if (q) {
      where = 'WHERE t.name LIKE ? OR t.slug LIKE ? OR t.contact_email LIKE ?';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const { rows } = await query(
      `SELECT t.*,
              (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS users_count,
              (SELECT COUNT(*) FROM customers c WHERE c.tenant_id = t.id) AS customers_count,
              (SELECT u.email FROM users u JOIN roles r ON r.id = u.role_id
               WHERE u.tenant_id = t.id AND r.\`key\` = 'owner' ORDER BY u.id LIMIT 1) AS owner_email
       FROM tenants t ${where}
       ORDER BY t.created_at DESC`, params);
    res.json({ tenants: rows.map(publicTenant) });
  } catch (err) { next(err); }
});

tenantsRouter.get('/:id', async (req, res, next) => {
  try {
    const tenant = await loadTenant(query, Number(req.params.id));
    if (!tenant) return res.status(404).json({ error: 'Ο οργανισμός δεν βρέθηκε' });
    res.json({ tenant });
  } catch (err) { next(err); }
});

tenantsRouter.post('/', async (req, res, next) => {
  try {
    const tenant = await createTenantWithOwner(query, req.body || {});
    res.status(201).json({ tenant });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

tenantsRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cur = (await query('SELECT * FROM tenants WHERE id = ?', [id])).rows[0];
    if (!cur) return res.status(404).json({ error: 'Ο οργανισμός δεν βρέθηκε' });
    const b = req.body || {};
    const sets = [];
    const params = [];
    if (b.name !== undefined) { sets.push('name = ?'); params.push(String(b.name).trim()); }
    if (b.slug !== undefined) {
      const slug = await uniqueSlug(query, b.slug, id);
      sets.push('slug = ?'); params.push(slug);
    }
    if (b.status !== undefined) {
      if (!TENANT_STATUSES.includes(b.status)) return res.status(400).json({ error: 'Άγνωστη κατάσταση' });
      sets.push('status = ?'); params.push(b.status);
    }
    if (b.locale !== undefined) { sets.push('locale = ?'); params.push(b.locale); }
    if (b.timezone !== undefined) { sets.push('timezone = ?'); params.push(b.timezone); }
    if (b.currency !== undefined) { sets.push('currency = ?'); params.push(b.currency); }
    if (b.plan !== undefined) {
      if (!PLANS.includes(b.plan)) return res.status(400).json({ error: 'Άγνωστο πλάνο' });
      sets.push('plan = ?'); params.push(b.plan);
    }
    if (b.contact_email !== undefined) { sets.push('contact_email = ?'); params.push(b.contact_email || null); }
    if (b.contact_phone !== undefined) { sets.push('contact_phone = ?'); params.push(b.contact_phone || null); }
    if (b.notes !== undefined) { sets.push('notes = ?'); params.push(b.notes || null); }
    if (b.settings !== undefined) {
      sets.push('settings = ?');
      params.push(JSON.stringify(mergeTenantSettings({ ...parseJson(cur.settings, {}), ...b.settings })));
    }
    if (!sets.length) return res.status(400).json({ error: 'Καμία αλλαγή' });
    sets.push('updated_at = NOW()');
    params.push(id);
    await query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ tenant: await loadTenant(query, id) });
  } catch (err) { next(err); }
});

tenantsRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cur = (await query('SELECT id, slug, name FROM tenants WHERE id = ?', [id])).rows[0];
    if (!cur) return res.status(404).json({ error: 'Ο οργανισμός δεν βρέθηκε' });
    if (id === req.user.tenantId) {
      return res.status(400).json({ error: 'Δεν μπορείτε να διαγράψετε τον οργανισμό στον οποίο είστε συνδεδεμένοι' });
    }
    const confirm = String(req.body?.confirmSlug || req.query.confirmSlug || '').trim();
    if (confirm !== cur.slug) {
      return res.status(400).json({ error: `Πληκτρολογήστε το slug «${cur.slug}» για επιβεβαίωση` });
    }
    const remaining = await query('SELECT COUNT(*) AS c FROM users WHERE is_platform_admin = 1 AND tenant_id <> ?', [id]);
    if (!Number(remaining.rows[0].c) && req.user.tenantId === id) {
      return res.status(400).json({ error: 'Δεν μπορεί να μείνει η πλατφόρμα χωρίς διαχειριστή' });
    }
    await query('DELETE FROM users WHERE tenant_id = ?', [id]);
    await query('DELETE FROM tenants WHERE id = ?', [id]);
    res.json({ ok: true, deleted: cur.name });
  } catch (err) { next(err); }
});
