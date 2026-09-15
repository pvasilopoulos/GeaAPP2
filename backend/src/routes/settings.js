import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { loadTenant, getPlatformSettings, setPlatformSetting } from '../lib/tenants.js';
import { mergeTenantSettings, parseJson, DEFAULT_PLATFORM_SETTINGS, publicAppSettings, applyAppSettingsPatch } from '../lib/tenantSettings.js';
import { applyMessagingPatch, channelStatuses, publicMessaging } from '../lib/messaging.js';

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
    res.json({ tenant: await loadTenant(query, req.user.tenantId) });
  } catch (err) { next(err); }
});

settingsRouter.get('/app', authorize(PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.TENANT_MANAGE), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId]);
    res.json({ settings: publicAppSettings(rows[0]?.settings) });
  } catch (err) { next(err); }
});

settingsRouter.patch('/app', authorize(PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId]);
    const current = parseJson(rows[0]?.settings, {}) || {};
    const nextSettings = applyAppSettingsPatch(current, req.body || {});
    await query('UPDATE tenants SET settings = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(nextSettings), req.user.tenantId]);
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

settingsRouter.get('/messaging', authorize(PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId]);
    const settings = mergeTenantSettings(rows[0]?.settings);
    res.json({ messaging: publicMessaging(settings.messaging) });
  } catch (err) { next(err); }
});

settingsRouter.patch('/messaging', authorize(PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId]);
    const current = parseJson(rows[0]?.settings, {}) || {};
    const nextSettings = mergeTenantSettings({
      ...current,
      messaging: applyMessagingPatch(current.messaging, req.body || {}),
    });
    await query('UPDATE tenants SET settings = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(nextSettings), req.user.tenantId]);
    res.json({ messaging: publicMessaging(nextSettings.messaging) });
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
    if (b.allow_self_register !== undefined) await setPlatformSetting(query, 'allow_self_register', !!b.allow_self_register);
    if (b.min_password_length !== undefined) {
      const n = Math.max(6, Math.min(32, Number(b.min_password_length) || 6));
      await setPlatformSetting(query, 'min_password_length', n);
    }
    res.json({ settings: { ...DEFAULT_PLATFORM_SETTINGS, ...(await getPlatformSettings(query)) } });
  } catch (err) { next(err); }
});
