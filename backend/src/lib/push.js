import crypto from 'node:crypto';
import webpush from 'web-push';
import { query as dbQuery } from '../db.js';
import { config } from '../config.js';

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  if (!config.push.publicKey || !config.push.privateKey) return false;
  webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey);
  configured = true;
  return true;
}

/** Whether VAPID keys are set — used to gate the public-key endpoint and skip sends. */
export function pushEnabled() {
  return ensureConfigured();
}

export function endpointHash(endpoint) {
  return crypto.createHash('sha256').update(String(endpoint)).digest('hex');
}

export async function saveSubscription({
  tenantId, userId, subscription, userAgent,
}, queryFn = dbQuery) {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    const err = new Error('Μη έγκυρο push subscription');
    err.status = 400;
    throw err;
  }
  const hash = endpointHash(endpoint);
  await queryFn(
    `INSERT INTO push_subscriptions (tenant_id, user_id, endpoint, endpoint_hash, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       tenant_id = VALUES(tenant_id), user_id = VALUES(user_id),
       endpoint = VALUES(endpoint), p256dh = VALUES(p256dh), auth = VALUES(auth),
       user_agent = VALUES(user_agent), last_seen_at = NOW()`,
    [tenantId, userId, endpoint.slice(0, 1000), hash, p256dh, auth, userAgent ? String(userAgent).slice(0, 255) : null],
  );
  return { ok: true };
}

export async function removeSubscription({ tenantId, userId, endpoint }, queryFn = dbQuery) {
  if (!endpoint) return { removed: false };
  const result = await queryFn(
    'DELETE FROM push_subscriptions WHERE tenant_id = ? AND user_id = ? AND endpoint_hash = ?',
    [tenantId, userId, endpointHash(endpoint)],
  );
  return { removed: Number(result.rows.affectedRows || 0) > 0 };
}

export async function subscriptionCountForUser({ tenantId, userId }, queryFn = dbQuery) {
  const { rows } = await queryFn(
    'SELECT COUNT(*) AS c FROM push_subscriptions WHERE tenant_id = ? AND user_id = ?',
    [tenantId, userId],
  );
  return Number(rows[0]?.c || 0);
}

/**
 * Deliver a Web Push message to every device a user has subscribed on.
 * Best-effort: individual failures are swallowed (and expired subscriptions
 * pruned) so a bad device never breaks the caller's request/insert flow.
 * `options.ttl`/`options.urgency` control the push *transport* (how long the
 * push service should retry, and its delivery priority on the recipient's
 * device) — they are never part of the JSON `payload` the browser renders.
 */
export async function pushToUser({
  tenantId, userId, payload, options,
}, queryFn = dbQuery) {
  if (!ensureConfigured()) return { sent: 0, skipped: 'not_configured' };
  const { rows } = await queryFn(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE tenant_id = ? AND user_id = ?',
    [tenantId, userId],
  );
  if (!rows.length) return { sent: 0 };
  // icon/badge are resolved by the browser against the SW's own origin, so a
  // root-relative path is enough — no need to know the public base URL here.
  // The branding route itself falls back to the shipped default asset when a
  // tenant hasn't customized these, so this is always safe to send.
  const enrichedPayload = {
    ...payload,
    icon: payload.icon || `/api/branding/${tenantId}/push-icon`,
    badge: payload.badge || `/api/branding/${tenantId}/push-badge`,
  };
  const body = JSON.stringify(enrichedPayload);
  const sendOptions = {};
  if (options?.ttl != null) sendOptions.TTL = options.ttl;
  if (options?.urgency) sendOptions.urgency = options.urgency;
  if (options?.topic) sendOptions.topic = options.topic;
  let sent = 0;
  await Promise.all(rows.map(async (row) => {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        body,
        sendOptions,
      );
      sent += 1;
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await queryFn('DELETE FROM push_subscriptions WHERE id = ?', [row.id]).catch(() => {});
      } else {
        console.error('[push] send failed:', err?.statusCode || '', err?.message || err);
      }
    }
  }));
  return { sent };
}
