import { Router } from 'express';
import { query } from '../db.js';
import { mergeTenantSettings, DEFAULT_TENANT_SETTINGS } from '../lib/tenantSettings.js';

// Public (unauthenticated) branding assets. `tenantId` is not secret and the
// data served here is only images/colors, so this can safely be mounted
// before the auth middleware. It exists because <link rel="icon">,
// <link rel="manifest">, the PWA install icons and the service worker's
// Web Push renderer all fetch these *without* a JWT — there is no other way
// to serve per-tenant assets to them. See docs/APPLICATION-GUIDE.md §Branding.
export const brandingPublicRouter = Router();

const FIELD_TO_SETTING = {
  logo: 'logo_url',
  favicon: 'favicon_url',
  'apple-touch': 'apple_touch_icon_url',
  'pwa-192': 'pwa_icon_192',
  'pwa-512': 'pwa_icon_512',
  'push-icon': 'push_icon_url',
  'push-badge': 'push_badge_url',
};
// Fallback to the shipped static defaults (public/app-icons) when a tenant
// hasn't customized a given slot, so every consumer degrades gracefully.
const FIELD_DEFAULTS = {
  logo: '/app-icons/icon-512.png',
  favicon: '/app-icons/icon-192.png',
  'apple-touch': '/app-icons/apple-touch-icon.png',
  'pwa-192': '/app-icons/icon-192.png',
  'pwa-512': '/app-icons/icon-512.png',
  'push-icon': '/app-icons/icon-192.png',
  'push-badge': '/app-icons/icon-badge.png',
};

function decodeDataUri(value) {
  const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(value || '');
  if (!match) return null;
  try {
    return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
  } catch {
    return null;
  }
}

async function loadBranding(tenantId) {
  const id = Number(tenantId);
  if (!Number.isFinite(id)) return null;
  const { rows } = await query('SELECT settings, name FROM tenants WHERE id = ?', [id]);
  if (!rows.length) return null;
  return mergeTenantSettings(rows[0].settings);
}

// Manifest route must be declared before the generic `/:field` route below
// (both start with `/:tenantId/...` and would otherwise collide).
brandingPublicRouter.get('/:tenantId/manifest.webmanifest', async (req, res, next) => {
  try {
    const merged = await loadBranding(req.params.tenantId);
    const name = merged?.app_name || DEFAULT_TENANT_SETTINGS.app_name;
    const branding = merged?.branding || DEFAULT_TENANT_SETTINGS.branding;
    const base = `/api/branding/${req.params.tenantId}`;
    res.set('Content-Type', 'application/manifest+json');
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      id: '/',
      name,
      short_name: name.slice(0, 30),
      description: 'CRM & ERP',
      lang: 'el',
      dir: 'ltr',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'any',
      background_color: branding.background_color,
      theme_color: branding.theme_color,
      prefer_related_applications: false,
      icons: [
        { src: `${base}/pwa-192`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: `${base}/pwa-512`, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: `${base}/pwa-192`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: `${base}/pwa-512`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    });
  } catch (err) { next(err); }
});

brandingPublicRouter.get('/:tenantId/:field', async (req, res, next) => {
  try {
    const fieldKey = String(req.params.field).replace(/\.(png|svg|webp|jpg|jpeg|ico)$/i, '');
    const settingKey = FIELD_TO_SETTING[fieldKey];
    const fallback = FIELD_DEFAULTS[fieldKey];
    if (!settingKey) return res.status(404).end();
    const merged = await loadBranding(req.params.tenantId);
    const decoded = decodeDataUri(merged?.branding?.[settingKey]);
    if (!decoded) return res.redirect(302, fallback);
    res.set('Content-Type', decoded.mime);
    res.set('Cache-Control', 'public, max-age=300');
    res.send(decoded.buffer);
  } catch (err) { next(err); }
});
