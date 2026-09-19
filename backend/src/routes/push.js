import { Router } from 'express';
import { config } from '../config.js';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { logAuditFromReq } from '../lib/audit.js';
import {
  pushEnabled, saveSubscription, removeSubscription, subscriptionCountForUser, pushToUser,
} from '../lib/push.js';
import {
  sendBroadcast, cancelBroadcast, recordNotificationClick, sanitizeRichPush,
  publicPushBroadcast, publicPushTemplate,
} from '../lib/notifications.js';

// Not sensitive (just the public VAPID key the browser needs to subscribe) —
// mounted before the auth middleware so it's reachable pre-login too.
export const pushPublicRouter = Router();
pushPublicRouter.get('/public-key', (_req, res) => {
  res.json({ publicKey: pushEnabled() ? config.push.publicKey : null });
});

// Click-through beacon fired by the service worker's notificationclick
// handler. Unauthenticated on purpose: the SW has no JWT lying around, and
// all this does is bump a counter for a notification id that must already
// exist — no data is read or exposed back to the caller.
pushPublicRouter.post('/click', async (req, res) => {
  const notificationId = Number(req.body?.notificationId);
  if (!notificationId) return res.status(400).json({ error: 'notificationId απαιτείται' });
  const result = await recordNotificationClick({ notificationId }).catch(() => ({ recorded: false }));
  res.json(result);
});

export const pushRouter = Router();

pushRouter.get('/status', async (req, res, next) => {
  try {
    const count = await subscriptionCountForUser({ tenantId: req.user.tenantId, userId: req.user.id });
    res.json({ enabled: pushEnabled(), subscriptions: count });
  } catch (e) { next(e); }
});

pushRouter.post('/subscribe', async (req, res, next) => {
  try {
    if (!pushEnabled()) return res.status(503).json({ error: 'Οι push ειδοποιήσεις δεν έχουν ρυθμιστεί στον server' });
    await saveSubscription({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      subscription: req.body?.subscription,
      userAgent: req.headers['user-agent'],
    });
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
});

pushRouter.post('/unsubscribe', async (req, res, next) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint απαιτείται' });
    const result = await removeSubscription({ tenantId: req.user.tenantId, userId: req.user.id, endpoint });
    res.json({ ok: true, removed: result.removed });
  } catch (e) { next(e); }
});

// Sends an immediate push straight to the current user's devices, bypassing
// the notification/reminder pipeline entirely — used to isolate whether a
// delivery problem is in the push transport itself or further upstream.
pushRouter.post('/test', async (req, res, next) => {
  try {
    if (!pushEnabled()) return res.status(503).json({ error: 'Οι push ειδοποιήσεις δεν έχουν ρυθμιστεί στον server' });
    const count = await subscriptionCountForUser({ tenantId: req.user.tenantId, userId: req.user.id });
    if (!count) return res.status(400).json({ error: 'Δεν έχεις ενεργοποιήσει ειδοποιήσεις σε καμία συσκευή' });
    const result = await pushToUser({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      payload: { title: 'Δοκιμαστική ειδοποίηση', body: 'Αν βλέπεις αυτό, οι push ειδοποιήσεις δουλεύουν σωστά.', target: null },
    });
    res.json({ ok: true, ...result, subscriptions: count });
  } catch (e) { next(e); }
});

const manageGuard = authorize(PERMISSIONS.SETTINGS_MANAGE);

// Active tenant users with their current device (push subscription) count —
// powers the recipient picker in the admin "send notification" panel.
pushRouter.get('/recipients', manageGuard, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.full_name, u.email, r.key AS role_key,
              (SELECT COUNT(*) FROM push_subscriptions ps
                WHERE ps.tenant_id = u.tenant_id AND ps.user_id = u.id) AS device_count
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.tenant_id = ? AND u.is_active = 1
       ORDER BY u.full_name`,
      [req.user.tenantId],
    );
    res.json({ users: rows });
  } catch (e) { next(e); }
});

// Roles for the "target a role" recipient mode — kept on the push router
// (guarded by settings.manage) rather than reusing /api/users/roles so an
// admin who can manage settings/push but not users/roles can still target by
// role.
pushRouter.get('/roles', manageGuard, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.id, r.name, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id AND u.is_active = 1) AS user_count
       FROM roles r WHERE r.tenant_id = ? ORDER BY r.name`,
      [req.user.tenantId],
    );
    res.json({ roles: rows.map((r) => ({ ...r, user_count: Number(r.user_count) })) });
  } catch (e) { next(e); }
});

// Manual admin broadcast: creates an in-app notification (+ Web Push mirror)
// for every active tenant user, a role, or a chosen subset — with full
// media/behavior/priority/scheduling control. See sanitizeRichPush() /
// sendBroadcast() in lib/notifications.js for the field contract.
pushRouter.post('/broadcast', manageGuard, async (req, res, next) => {
  try {
    const {
      title, body, url, recipients, roleId, sendAt,
      imageUrl, iconUrl, badgeUrl, actions, requireInteraction, silent, vibrate, tag, renotify, urgency, ttlSeconds,
    } = req.body || {};
    const result = await sendBroadcast({
      tenantId: req.user.tenantId,
      senderUserId: req.user.id,
      title,
      body,
      url,
      recipients,
      roleId,
      sendAt,
      imageUrl,
      iconUrl,
      badgeUrl,
      actions,
      requireInteraction,
      silent,
      vibrate,
      tag,
      renotify,
      urgency,
      ttlSeconds,
    });
    await logAuditFromReq(query, req, {
      action: 'notify',
      entityType: 'push_broadcast',
      entityId: result.broadcastId,
      summary: result.scheduled
        ? `Προγραμματισμός ειδοποίησης για ${result.recipients} χρήστες`
        : `Αποστολή ειδοποίησης σε ${result.recipients} χρήστες`,
      details: result,
    });
    res.status(201).json(result);
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
});

// Cancels a scheduled (not-yet-sent) broadcast.
pushRouter.post('/broadcasts/:id/cancel', manageGuard, async (req, res, next) => {
  try {
    const result = await cancelBroadcast({ tenantId: req.user.tenantId, broadcastId: Number(req.params.id) });
    if (!result.cancelled) return res.status(400).json({ error: 'Δεν βρέθηκε προγραμματισμένη αποστολή προς ακύρωση' });
    res.json(result);
  } catch (e) { next(e); }
});

// Recent broadcast history for the admin panel (sent, pending/scheduled, cancelled, failed).
pushRouter.get('/broadcasts', manageGuard, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT b.*, u.full_name AS sender_name
       FROM push_broadcasts b
       LEFT JOIN users u ON u.id = b.sender_user_id
       WHERE b.tenant_id = ?
       ORDER BY COALESCE(b.send_at, b.created_at) DESC, b.created_at DESC
       LIMIT 50`,
      [req.user.tenantId],
    );
    res.json({ broadcasts: rows.map(publicPushBroadcast) });
  } catch (e) { next(e); }
});

// ---- Reusable notification templates --------------------------------------

pushRouter.get('/templates', manageGuard, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM push_templates WHERE tenant_id = ? ORDER BY name',
      [req.user.tenantId],
    );
    res.json({ templates: rows.map(publicPushTemplate) });
  } catch (e) { next(e); }
});

pushRouter.post('/templates', manageGuard, async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim().slice(0, 120);
    const title = String(req.body?.title || '').trim().slice(0, 200);
    if (!name) return res.status(400).json({ error: 'Το όνομα προτύπου είναι υποχρεωτικό' });
    if (!title) return res.status(400).json({ error: 'Ο τίτλος είναι υποχρεωτικός' });
    const body = req.body?.body ? String(req.body.body).trim().slice(0, 1000) : null;
    const url = req.body?.url ? String(req.body.url).trim().slice(0, 500) : null;
    const rich = sanitizeRichPush(req.body || {});
    const result = await query(
      `INSERT INTO push_templates
        (tenant_id, created_by, name, title, body, url, image_url, icon_url, badge_url, actions,
         require_interaction, silent, vibrate, tag, renotify, urgency, ttl_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), body = VALUES(body), url = VALUES(url),
         image_url = VALUES(image_url), icon_url = VALUES(icon_url), badge_url = VALUES(badge_url),
         actions = VALUES(actions), require_interaction = VALUES(require_interaction), silent = VALUES(silent),
         vibrate = VALUES(vibrate), tag = VALUES(tag), renotify = VALUES(renotify),
         urgency = VALUES(urgency), ttl_seconds = VALUES(ttl_seconds)`,
      [
        req.user.tenantId, req.user.id, name, title, body, url,
        rich.imageUrl || null, rich.iconUrl || null, rich.badgeUrl || null, rich.actions.length ? JSON.stringify(rich.actions) : null,
        rich.requireInteraction ? 1 : 0, rich.silent ? 1 : 0, rich.vibrate || null, rich.tag || null, rich.renotify ? 1 : 0,
        rich.urgency, rich.ttlSeconds,
      ],
    );
    const { rows } = await query('SELECT * FROM push_templates WHERE tenant_id = ? AND name = ?', [req.user.tenantId, name]);
    res.status(result.rows.affectedRows === 1 ? 201 : 200).json({ template: publicPushTemplate(rows[0]) });
  } catch (e) { next(e); }
});

pushRouter.delete('/templates/:id', manageGuard, async (req, res, next) => {
  try {
    await query('DELETE FROM push_templates WHERE id = ? AND tenant_id = ?', [Number(req.params.id), req.user.tenantId]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

