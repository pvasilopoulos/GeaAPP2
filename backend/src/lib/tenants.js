import { hashPassword } from './auth.js';
import { insertTenantRoles } from './roles.js';
import { insertTenantCustomFields } from './customFields.js';
import {
  DEFAULT_TENANT_SETTINGS, DEFAULT_PLATFORM_SETTINGS, TENANT_STATUSES, PLANS, mergeTenantSettings, slugify, parseJson,
} from './tenantSettings.js';

export async function uniqueSlug(query, base, excludeId) {
  let slug = slugify(base);
  let candidate = slug;
  let n = 1;
  for (;;) {
    const { rows } = await query(
      excludeId
        ? 'SELECT id FROM tenants WHERE slug = ? AND id <> ?'
        : 'SELECT id FROM tenants WHERE slug = ?',
      excludeId ? [candidate, excludeId] : [candidate]);
    if (!rows.length) return candidate;
    candidate = `${slug}-${++n}`;
  }
}

export function publicTenant(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status || 'active',
    locale: row.locale || 'el',
    timezone: row.timezone || 'Europe/Athens',
    currency: row.currency || 'EUR',
    plan: row.plan || 'standard',
    contact_email: row.contact_email || '',
    contact_phone: row.contact_phone || '',
    notes: row.notes || '',
    settings: mergeTenantSettings(row.settings),
    created_at: row.created_at,
    updated_at: row.updated_at,
    users_count: Number(row.users_count || 0),
    customers_count: Number(row.customers_count || 0),
    owner_email: row.owner_email || null,
  };
}

export async function loadTenant(query, id) {
  const { rows } = await query(
    `SELECT t.*,
            (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS users_count,
            (SELECT COUNT(*) FROM customers c WHERE c.tenant_id = t.id) AS customers_count,
            (SELECT u.email FROM users u JOIN roles r ON r.id = u.role_id
             WHERE u.tenant_id = t.id AND r.\`key\` = 'owner' ORDER BY u.id LIMIT 1) AS owner_email
     FROM tenants t WHERE t.id = ?`, [id]);
  return rows[0] ? publicTenant(rows[0]) : null;
}

export async function createTenantWithOwner(query, body) {
  const name = String(body.name || '').trim();
  const owner = body.owner || {};
  if (!name) { const e = new Error('Δώστε επωνυμία οργανισμού'); e.status = 400; throw e; }
  if (!owner.email || !owner.firstName || !owner.password) {
    const e = new Error('Συμπληρώστε όνομα, email και κωδικό ιδιοκτήτη'); e.status = 400; throw e;
  }
  if (String(owner.password).length < 6) {
    const e = new Error('Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες'); e.status = 400; throw e;
  }
  const exists = await query('SELECT id FROM users WHERE email = ?', [String(owner.email).toLowerCase()]);
  if (exists.rows.length) { const e = new Error('Το email χρησιμοποιείται ήδη'); e.status = 409; throw e; }

  const slug = await uniqueSlug(query, body.slug || name);
  const status = TENANT_STATUSES.includes(body.status) ? body.status : 'trial';
  const plan = PLANS.includes(body.plan) ? body.plan : 'standard';
  const settings = { ...DEFAULT_TENANT_SETTINGS, ...parseJson(body.settings, {}) };

  const t = await query(
    `INSERT INTO tenants (name, slug, status, locale, timezone, currency, plan,
                          contact_email, contact_phone, notes, settings)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name, slug, status,
      body.locale || 'el',
      body.timezone || 'Europe/Athens',
      body.currency || 'EUR',
      plan,
      body.contact_email || owner.email || null,
      body.contact_phone || null,
      body.notes || null,
      JSON.stringify(settings),
    ]);
  const tenantId = t.rows.insertId;
  const roleMap = await insertTenantRoles(query, tenantId);
  await insertTenantCustomFields(query, tenantId);
  const hash = await hashPassword(String(owner.password));
  await query(
    `INSERT INTO users (tenant_id, role_id, email, password_hash, first_name, last_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tenantId, roleMap.owner, String(owner.email).toLowerCase(), hash, owner.firstName, owner.lastName || '']);
  return loadTenant(query, tenantId);
}

export async function getPlatformSetting(query, key, fallback) {
  const { rows } = await query('SELECT svalue FROM platform_settings WHERE skey = ?', [key]);
  if (!rows.length) return fallback;
  try { return JSON.parse(rows[0].svalue); } catch { return rows[0].svalue; }
}

export async function setPlatformSetting(query, key, value) {
  await query(
    `INSERT INTO platform_settings (skey, svalue) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)`,
    [key, JSON.stringify(value)]);
}

export async function getPlatformSettings(query) {
  const { rows } = await query('SELECT skey, svalue FROM platform_settings');
  const out = { ...DEFAULT_PLATFORM_SETTINGS };
  for (const r of rows) {
    try { out[r.skey] = JSON.parse(r.svalue); } catch { out[r.skey] = r.svalue; }
  }
  return out;
}
