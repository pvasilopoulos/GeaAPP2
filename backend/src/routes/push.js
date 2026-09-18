import { Router } from 'express';
import { config } from '../config.js';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { logAuditFromReq } from '../lib/audit.js';
import {
  pushEnabled, saveSubscription, removeSubscription, subscriptionCountForUser, pushToUser,
} from '../lib/push.js';
import { sendBroadcast } from '../lib/notifications.js';

// Not sensitive (just the public VAPID key the browser needs to subscribe) —
// mounted before the auth middleware so it's reachable pre-login too.
export const pushPublicRouter = Router();
pushPublicRouter.get('/public-key', (_req, res) => {
  res.json({ publicKey: pushEnabled() ? config.push.publicKey : null });
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

// Manual admin broadcast: creates an in-app notification (+ Web Push mirror)
// for every active tenant user, or a chosen subset.
pushRouter.post('/broadcast', manageGuard, async (req, res, next) => {
  try {
    const {
      title, body, url, recipients,
    } = req.body || {};
    const result = await sendBroadcast({
      tenantId: req.user.tenantId,
      senderUserId: req.user.id,
      title,
      body,
      url,
      recipients,
    });
    await logAuditFromReq(query, req, {
      action: 'notify',
      entityType: 'push_broadcast',
      entityId: result.broadcastId,
      summary: `Αποστολή ειδοποίησης σε ${result.recipients} χρήστες`,
      details: result,
    });
    res.status(201).json(result);
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
});

// Recent broadcast history for the admin panel.
pushRouter.get('/broadcasts', manageGuard, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT b.id, b.title, b.body, b.url, b.recipient_type, b.recipient_count,
              b.push_sent_count, b.created_at, u.full_name AS sender_name
       FROM push_broadcasts b
       LEFT JOIN users u ON u.id = b.sender_user_id
       WHERE b.tenant_id = ?
       ORDER BY b.created_at DESC
       LIMIT 30`,
      [req.user.tenantId],
    );
    res.json({ broadcasts: rows });
  } catch (e) { next(e); }
});
