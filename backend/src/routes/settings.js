import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { loadTenant, getPlatformSettings, setPlatformSetting } from '../lib/tenants.js';
import { mergeTenantSettings, parseJson, DEFAULT_PLATFORM_SETTINGS, publicAppSettings, applyAppSettingsPatch } from '../lib/tenantSettings.js';
import { applyMessagingPatch, channelStatuses, publicMessaging } from '../lib/messaging.js';
import { applyReminderSettingsPatch, publicReminderSettings } from '../lib/reminderSettings.js';
import { sanitizeMenuConfig, sanitizePersonalMenuConfig, NAV_ITEM_IDS } from '../lib/menu.js';
import { logAuditFromReq, redactAuditDetails } from '../lib/audit.js';

export const settingsRouter = Router();

settingsRouter.get('/organization', authorize(PERMISSIONS.TENANT_MANAGE, PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    const tenant = await loadTenant(query, req.user.tenantId);
    res.json({ tenant });
  } catch (err) { next(err); }
});

settingsRouter.patch('/organization', authorize(PERMISSIONS.TENANT_MANAGE), async (req, res, next) => {
  try {
    const b = req.body || {};
    const sets = [];
    const params = [];
    if (b.name !== undefined) { sets.push('name = ?'); params.push(String(b.name).trim()); }
    if (b.locale !== undefined) { sets.push('locale = ?'); params.push(b.locale); }
    if (b.timezone !== undefined) { sets.push('timezone = ?'); params.push(b.timezone); }
    if (b.currency !== undefined) { sets.push('currency = ?'); params.push(b.currency); }
    if (b.contact_email !== undefined) { sets.push('contact_email = ?'); params.push(b.contact_email || null); }
    if (b.contact_phone !== undefined) { sets.push('contact_phone = ?'); params.push(b.contact_phone || null); }
    if (b.notes !== undefined) { sets.push('notes = ?'); params.push(b.notes || null); }
    if (!sets.length) return res.status(400).json({ error: 'Καμία αλλαγή' });
    sets.push('updated_at = NOW()');
    params.push(req.user.tenantId);
    await query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`, params);
    await logAuditFromReq(query, req, {
      action: 'update', entityType: 'settings', entityId: req.user.tenantId,
      summary: 'Ενημέρωση στοιχείων οργανισμού',
      details: { keys: Object.keys(b).filter((k) => b[k] !== undefined) },
    });
    res.json({ tenant: await loadTenant(query, req.user.tenantId) });
  } catch (err) { next(err); }
});

settingsRouter.get('/app', authorize(PERMISSIONS.APP_SETTINGS_MANAGE, PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.TENANT_MANAGE), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId]);
    res.json({ settings: publicAppSettings(rows[0]?.settings) });
  } catch (err) { next(err); }
});

settingsRouter.patch('/app', authorize(PERMISSIONS.APP_SETTINGS_MANAGE, PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId]);
    const current = parseJson(rows[0]?.settings, {}) || {};
    const nextSettings = applyAppSettingsPatch(current, req.body || {});
    await query('UPDATE tenants SET settings = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(nextSettings), req.user.tenantId]);
    await logAuditFromReq(query, req, {
      action: 'update', entityType: 'settings', entityId: req.user.tenantId,
      summary: 'Ενημέρωση ρυθμίσεων εφαρμογής / εμφάνισης',
      details: redactAuditDetails({ keys: Object.keys(req.body || {}) }),
    });
    res.json({ settings: publicAppSettings(nextSettings) });
  } catch (err) { next(err); }
});

settingsRouter.get('/messaging/channels', authorize(PERMISSIONS.CUSTOMERS_READ, PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId]);
    const settings = mergeTenantSettings(rows[0]?.settings);
    res.json({ channels: channelStatuses(settings.messaging) });
  } catch (err) { next(err); }
});

settingsRouter.get('/messaging', authorize(PERMISSIONS.MESSAGING_MANAGE, PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId]);
    const settings = mergeTenantSettings(rows[0]?.settings);
    res.json({ messaging: publicMessaging(settings.messaging) });
  } catch (err) { next(err); }
});

settingsRouter.patch('/messaging', authorize(PERMISSIONS.MESSAGING_MANAGE, PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId]);
    const current = parseJson(rows[0]?.settings, {}) || {};
    const nextSettings = mergeTenantSettings({
      ...current,
      messaging: applyMessagingPatch(current.messaging, req.body || {}),
    });
    await query('UPDATE tenants SET settings = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(nextSettings), req.user.tenantId]);
    await logAuditFromReq(query, req, {
      action: 'update', entityType: 'settings', entityId: req.user.tenantId,
      summary: 'Ενημέρωση ρυθμίσεων μηνυμάτων',
      details: { keys: Object.keys(req.body || {}) },
    });
    res.json({ messaging: publicMessaging(nextSettings.messaging) });
  } catch (err) { next(err); }
});

settingsRouter.get('/reminders', authorize(PERMISSIONS.REMINDERS_MANAGE, PERMISSIONS.CUSTOMERS_READ, PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId]);
    res.json({ reminders: publicReminderSettings(mergeTenantSettings(rows[0]?.settings).reminders) });
  } catch (err) { next(err); }
});

settingsRouter.patch('/reminders', authorize(PERMISSIONS.REMINDERS_MANAGE, PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId]);
    const current = parseJson(rows[0]?.settings, {}) || {};
    const nextReminders = applyReminderSettingsPatch(current.reminders, req.body || {});
    const nextSettings = mergeTenantSettings({ ...current, reminders: nextReminders });
    await query('UPDATE tenants SET settings = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(nextSettings), req.user.tenantId]);
    await logAuditFromReq(query, req, {
      action: 'update', entityType: 'settings', entityId: req.user.tenantId,
      summary: 'Ενημέρωση ρυθμίσεων υπενθυμίσεων',
    });
    res.json({ reminders: nextSettings.reminders });
  } catch (err) { next(err); }
});

// ---- Nav menu configuration -------------------------------------------------
// Tenant-wide default: readable by any authenticated user (needed to render
// their own sidebar/mobile footer), editable only by SETTINGS_MANAGE. This
// never bypasses permissions — it only controls order/visibility/grouping/
// labels among the items a user's role already permits (enforced client-side
// on top of this, and role-restriction is re-checked client-side too).
async function tenantRoleKeys(tenantId) {
  const { rows } = await query('SELECT `key` FROM roles WHERE tenant_id = ?', [tenantId]);
  return rows.map((r) => r.key);
}

settingsRouter.get('/menu', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId]);
    res.json({ menu: mergeTenantSettings(rows[0]?.settings).menu });
  } catch (err) { next(err); }
});

// Tenant's role keys, for the admin menu editor's role-restriction picker.
// Scoped to authorize(SETTINGS_MANAGE) (rather than USERS_MANAGE/ROLES_MANAGE)
// since it's specifically for this editor and must never leak across tenants.
settingsRouter.get('/menu/roles', authorize(PERMISSIONS.MENU_MANAGE, PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT `key`, name FROM roles WHERE tenant_id = ? ORDER BY id', [req.user.tenantId]);
    res.json({ roles: rows });
  } catch (err) { next(err); }
});

settingsRouter.patch('/menu', authorize(PERMISSIONS.MENU_MANAGE, PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId]);
    const current = parseJson(rows[0]?.settings, {}) || {};
    const currentMenu = mergeTenantSettings(current).menu;
    const validRoleKeys = await tenantRoleKeys(req.user.tenantId);
    const nextMenu = sanitizeMenuConfig({ ...currentMenu, ...(req.body || {}) }, { validRoleKeys });
    const nextSettings = mergeTenantSettings({ ...current, menu: nextMenu });
    await query('UPDATE tenants SET settings = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(nextSettings), req.user.tenantId]);
    await logAuditFromReq(query, req, {
      action: 'update', entityType: 'settings', entityId: req.user.tenantId,
      summary: 'Ενημέρωση μενού οργανισμού',
    });
    res.json({ menu: nextSettings.menu });
  } catch (err) { next(err); }
});

// Personal per-user override — always scoped to the caller's own row, never
// another user's, and independent from the admin-only tenant default above.
// `allowedIds` includes the tenant's current custom link ids (in addition to
// the fixed catalog) so a user can still personally reorder/hide those links.
settingsRouter.get('/menu/me', async (req, res, next) => {
  try {
    const [{ rows: userRows }, { rows: tenantRows }] = await Promise.all([
      query('SELECT menu_preferences FROM users WHERE id = ? AND tenant_id = ?', [req.user.id, req.user.tenantId]),
      query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId]),
    ]);
    const tenantMenu = mergeTenantSettings(tenantRows[0]?.settings).menu;
    const allowedIds = [...NAV_ITEM_IDS, ...tenantMenu.links.map((l) => l.id)];
    res.json({ menu: sanitizePersonalMenuConfig(parseJson(userRows[0]?.menu_preferences, null), allowedIds) });
  } catch (err) { next(err); }
});

settingsRouter.patch('/menu/me', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (body.clear) {
      await query('UPDATE users SET menu_preferences = NULL WHERE id = ? AND tenant_id = ?', [req.user.id, req.user.tenantId]);
      return res.json({ menu: null });
    }
    const { rows } = await query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId]);
    const tenantMenu = mergeTenantSettings(rows[0]?.settings).menu;
    const allowedIds = [...NAV_ITEM_IDS, ...tenantMenu.links.map((l) => l.id)];
    const next = sanitizePersonalMenuConfig(body, allowedIds);
    await query('UPDATE users SET menu_preferences = ? WHERE id = ? AND tenant_id = ?',
      [next ? JSON.stringify(next) : null, req.user.id, req.user.tenantId]);
    res.json({ menu: next });
  } catch (err) { next(err); }
});

function requirePlatform(req, res, next) {
  if (req.user?.isPlatformAdmin || req.user?.permissions?.includes(PERMISSIONS.TENANTS_PLATFORM)) return next();
  return res.status(403).json({ error: 'Απαιτείται πρόσβαση διαχειριστή πλατφόρμας' });
}

settingsRouter.get('/platform', requirePlatform, async (_req, res, next) => {
  try {
    res.json({ settings: await getPlatformSettings(query) });
  } catch (err) { next(err); }
});

settingsRouter.patch('/platform', requirePlatform, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (b.app_name !== undefined) {
      const appName = String(b.app_name || '').trim().slice(0, 60);
      await setPlatformSetting(query, 'app_name', appName || DEFAULT_PLATFORM_SETTINGS.app_name);
    }
    if (b.allow_self_register !== undefined) await setPlatformSetting(query, 'allow_self_register', !!b.allow_self_register);
    if (b.min_password_length !== undefined) {
      const n = Math.max(6, Math.min(32, Number(b.min_password_length) || 6));
      await setPlatformSetting(query, 'min_password_length', n);
    }
    res.json({ settings: { ...DEFAULT_PLATFORM_SETTINGS, ...(await getPlatformSettings(query)) } });
  } catch (err) { next(err); }
});
