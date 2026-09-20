import { query as dbQuery } from '../db.js';
import { isDuplicateKeyError } from './idempotency.js';
import { computeReminderState, mergeReminderSettings } from './reminderSettings.js';
import { PERMISSIONS, expandPermissions } from './permissions.js';
import { pushToUser } from './push.js';
import { evaluateNotificationRules, sweepScheduleTriggers, sweepEscalations, sweepDigests } from './notificationRules.js';

export const NOTIFICATION_TYPES = {
  FOLLOW_UP_OVERDUE: 'follow_up_overdue',
  FOLLOW_UP_DUE_SOON: 'follow_up_due_soon',
  FOLLOW_UP_ASSIGNED: 'follow_up_assigned',
  CONNECTOR_RUN_FAILED: 'connector_run_failed',
  QUOTE_EXPIRED: 'quote_expired',
  ADMIN_MESSAGE: 'admin_message',
};

export const SOURCE_TYPES = {
  FOLLOW_UP: 'follow_up',
  QUOTE: 'quote',
  SYNC_RUN: 'sync_run',
  BROADCAST: 'push_broadcast',
};

function parsePerms(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return []; }
  }
  return [];
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return fallback;
}

export function publicNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    source_type: row.source_type,
    source_id: row.source_id,
    customer_id: row.customer_id,
    payload: parseJson(row.payload, null),
    read_at: row.read_at || null,
    dismissed_at: row.dismissed_at || null,
    created_at: row.created_at,
    unread: !row.read_at,
  };
}

export function notificationTarget(row) {
  const payload = parseJson(row?.payload, {}) || {};
  switch (row?.source_type) {
    case SOURCE_TYPES.FOLLOW_UP:
      return {
        kind: 'customer',
        customerId: row.customer_id || payload.customer_id || null,
        followUpId: Number(row.source_id),
        customerName: payload.customer_name || null,
      };
    case SOURCE_TYPES.QUOTE:
      return {
        kind: 'quote',
        quoteId: Number(row.source_id),
        customerId: row.customer_id || null,
      };
    case SOURCE_TYPES.SYNC_RUN:
      return {
        kind: 'connector',
        connectorId: payload.connector_id || null,
        runId: Number(row.source_id),
      };
    case SOURCE_TYPES.BROADCAST:
      return payload.url ? { kind: 'url', url: payload.url } : { kind: 'none' };
    default:
      if (row?.customer_id) {
        return { kind: 'customer', customerId: row.customer_id, customerName: payload.customer_name || null };
      }
      return null;
  }
}

export function buildNotificationCopy(type, ctx = {}) {
  switch (type) {
    case NOTIFICATION_TYPES.FOLLOW_UP_OVERDUE:
      return { title: 'Εκπρόθεσμη υπενθύμιση', body: [ctx.title, ctx.customerName].filter(Boolean).join(' · ') };
    case NOTIFICATION_TYPES.FOLLOW_UP_DUE_SOON:
      return { title: 'Υπενθύμιση προσεχώς', body: [ctx.title, ctx.customerName].filter(Boolean).join(' · ') };
    case NOTIFICATION_TYPES.FOLLOW_UP_ASSIGNED:
      return { title: 'Νέα ανάθεση υπενθύμισης', body: [ctx.title, ctx.customerName].filter(Boolean).join(' · ') };
    case NOTIFICATION_TYPES.CONNECTOR_RUN_FAILED:
      return {
        title: 'Αποτυχία συγχρονισμού ERP',
        body: [ctx.connectorName, ctx.errorMessage].filter(Boolean).join(' · ').slice(0, 1000),
      };
    case NOTIFICATION_TYPES.QUOTE_EXPIRED: {
      const label = ctx.series && ctx.quoteNumber != null ? `${ctx.series}-${ctx.quoteNumber}` : (ctx.title || '');
      return { title: 'Η προσφορά έληξε', body: [label, ctx.customerName].filter(Boolean).join(' · ') };
    }
    case NOTIFICATION_TYPES.ADMIN_MESSAGE:
      return { title: ctx.title || 'Ειδοποίηση', body: ctx.body || '' };
    default:
      return { title: ctx.title || 'Ειδοποίηση', body: ctx.body || '' };
  }
}

export function followUpRecipientIds({ assignedUserId, viewerUserIds = [], notifyAssigneeOnly = true }) {
  if (assignedUserId) {
    if (notifyAssigneeOnly) return [assignedUserId];
    return [...new Set([assignedUserId, ...viewerUserIds])];
  }
  return [...new Set(viewerUserIds)];
}

export function userIdsWithPermission(users, permission) {
  const ids = [];
  for (const user of users || []) {
    const perms = expandPermissions(parsePerms(user.permissions));
    if (user.roleKey === 'owner' || user.role_key === 'owner' || perms.includes(permission)) {
      ids.push(Number(user.id));
    }
  }
  return [...new Set(ids.filter(Boolean))];
}

export function quoteExpiredRecipientIds({ createdBy, sellerUserId, quoteViewerIds = [] }) {
  const ids = [createdBy, sellerUserId].filter(Boolean).map(Number);
  if (ids.length) return [...new Set(ids)];
  return [...new Set((quoteViewerIds || []).map(Number).filter(Boolean))];
}

export function publicPushBroadcast(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    url: row.url,
    recipient_type: row.recipient_type,
    recipient_role_id: row.recipient_role_id ?? null,
    recipient_count: row.recipient_count,
    push_sent_count: row.push_sent_count,
    clicked_count: row.clicked_count,
    image_url: row.image_url || '',
    icon_url: row.icon_url || '',
    badge_url: row.badge_url || '',
    actions: parseJson(row.actions, []) || [],
    require_interaction: !!row.require_interaction,
    silent: !!row.silent,
    vibrate: row.vibrate || '',
    tag: row.tag || '',
    renotify: !!row.renotify,
    urgency: row.urgency,
    ttl_seconds: row.ttl_seconds,
    send_at: row.send_at,
    status: row.status,
    created_at: row.created_at,
    sender_name: row.sender_name,
  };
}

export function publicPushTemplate(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    body: row.body,
    url: row.url,
    image_url: row.image_url || '',
    icon_url: row.icon_url || '',
    badge_url: row.badge_url || '',
    actions: parseJson(row.actions, []) || [],
    require_interaction: !!row.require_interaction,
    silent: !!row.silent,
    vibrate: row.vibrate || '',
    tag: row.tag || '',
    renotify: !!row.renotify,
    urgency: row.urgency,
    ttl_seconds: row.ttl_seconds,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const URGENCY_VALUES = ['very-low', 'low', 'normal', 'high'];
const MAX_ACTIONS = 2;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 2419200; // 28 days — the practical ceiling push services honor
const DEFAULT_TTL_SECONDS = 259200; // 3 days

/**
 * Normalizes every "rich" push-composer field (media, action buttons,
 * behavior, priority) shared by both `push_broadcasts` and `push_templates`.
 * Anything malformed is dropped/clamped rather than rejected, so the
 * composer never hard-fails on a stray field.
 */
export function sanitizeRichPush(input = {}) {
  const url = (v) => (v ? String(v).trim().slice(0, 500) : '');
  const imageUrl = url(input.imageUrl ?? input.image_url);
  const iconUrl = url(input.iconUrl ?? input.icon_url);
  const badgeUrl = url(input.badgeUrl ?? input.badge_url);
  const rawActions = Array.isArray(input.actions) ? input.actions : [];
  const actions = rawActions
    .slice(0, MAX_ACTIONS)
    .map((a, i) => ({
      action: String(a?.action || `action${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30) || `action${i + 1}`,
      title: String(a?.title || '').trim().slice(0, 40),
      url: url(a?.url),
    }))
    .filter((a) => a.title);
  const rawVibrate = Array.isArray(input.vibrate)
    ? input.vibrate
    : (typeof input.vibrate === 'string' && input.vibrate.trim() ? input.vibrate.split(',') : []);
  const vibrate = rawVibrate
    .map((v) => Math.max(0, Math.min(5000, Math.round(Number(v)) || 0)))
    .slice(0, 8)
    .join(',');
  const tag = input.tag ? String(input.tag).trim().slice(0, 100) : '';
  const urgency = URGENCY_VALUES.includes(input.urgency) ? input.urgency : 'normal';
  const ttlNumber = Number(input.ttlSeconds ?? input.ttl_seconds);
  const ttlSeconds = Number.isFinite(ttlNumber)
    ? Math.max(MIN_TTL_SECONDS, Math.min(MAX_TTL_SECONDS, Math.round(ttlNumber)))
    : DEFAULT_TTL_SECONDS;
  return {
    imageUrl,
    iconUrl,
    badgeUrl,
    actions,
    requireInteraction: !!(input.requireInteraction ?? input.require_interaction),
    silent: !!input.silent,
    vibrate,
    tag,
    renotify: !!input.renotify,
    urgency,
    ttlSeconds,
  };
}

/**
 * Resolves the actual recipient user ids for a broadcast at *send* time
 * (rather than at composition time) so `all`/`role` targeting always reaches
 * whoever is currently active — important for scheduled sends where the
 * user list may have changed between scheduling and delivery.
 */
async function resolveRecipients({
  tenantId, recipientType, recipientRoleId, recipientIds,
}, queryFn) {
  if (recipientType === 'all') {
    const { rows } = await queryFn('SELECT id FROM users WHERE tenant_id = ? AND is_active = 1', [tenantId]);
    return rows.map((r) => Number(r.id));
  }
  if (recipientType === 'role') {
    if (!recipientRoleId) return [];
    const { rows } = await queryFn(
      'SELECT id FROM users WHERE tenant_id = ? AND is_active = 1 AND role_id = ?',
      [tenantId, recipientRoleId],
    );
    return rows.map((r) => Number(r.id));
  }
  const ids = [...new Set((recipientIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const { rows } = await queryFn(
    `SELECT id FROM users WHERE tenant_id = ? AND is_active = 1 AND id IN (${placeholders})`,
    [tenantId, ...ids],
  );
  return rows.map((r) => Number(r.id));
}

/** Builds the extra push-payload/transport fields from a rich broadcast/template row. */
function pushOverridesFromRich(rich) {
  return {
    icon: rich.iconUrl || undefined,
    badge: rich.badgeUrl || undefined,
    image: rich.imageUrl || undefined,
    actions: rich.actions?.length ? rich.actions : undefined,
    requireInteraction: rich.requireInteraction || undefined,
    silent: rich.silent || undefined,
    vibrate: rich.vibrate ? rich.vibrate.split(',').map(Number) : undefined,
    tag: rich.tag || undefined,
    renotify: rich.renotify || undefined,
    ttl: rich.ttlSeconds,
    urgency: rich.urgency,
  };
}

/** Actually delivers a (immediate or now-due scheduled) broadcast to its resolved recipients. */
async function deliverBroadcast({
  id, tenantId, title, body, url, recipientIds, rich,
}, queryFn) {
  const push = pushOverridesFromRich(rich);
  let notified = 0;
  let pushSent = 0;
  await Promise.all(recipientIds.map(async (userId) => {
    const created = await createNotification({
      tenantId,
      userId,
      type: NOTIFICATION_TYPES.ADMIN_MESSAGE,
      title,
      body,
      sourceType: SOURCE_TYPES.BROADCAST,
      sourceId: id,
      payload: url ? { url } : null,
      push,
    }, queryFn);
    if (created.inserted) {
      notified += 1;
      const pushResult = await created.pushPromise;
      pushSent += pushResult?.sent || 0;
    }
  }));
  await queryFn(
    'UPDATE push_broadcasts SET push_sent_count = ?, recipient_count = ?, status = ? WHERE id = ?',
    [pushSent, recipientIds.length, 'sent', id],
  ).catch(() => {});
  return { notified, pushSent };
}

export async function createNotification({
  tenantId, userId, type, title, body, sourceType, sourceId, customerId = null, payload = null, push = null,
}, queryFn = dbQuery) {
  if (!tenantId || !userId || !type || sourceId == null) return { inserted: false, reason: 'invalid' };
  try {
    const result = await queryFn(
      `INSERT INTO notifications
        (tenant_id, user_id, type, title, body, source_type, source_id, customer_id, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId, userId, type,
        String(title || 'Ειδοποίηση').slice(0, 200),
        body ? String(body).slice(0, 1000) : null,
        sourceType || null,
        sourceId,
        customerId || null,
        payload ? JSON.stringify(payload) : null,
      ],
    );
    // Best-effort Web Push mirror of the in-app notification — captured as a
    // promise so callers that need delivery counts (e.g. admin broadcasts)
    // can await it; other callers simply let it run fire-and-forget. `push`
    // carries the optional rich-composer overrides (image/actions/vibrate/…
    // plus ttl/urgency transport options) — see sanitizeRichPush().
    const pushPayload = {
      title: String(title || 'Ειδοποίηση').slice(0, 200),
      body: body ? String(body).slice(0, 1000) : '',
      notificationId: result.rows.insertId,
      target: { source_type: sourceType || null, source_id: sourceId, customer_id: customerId || null, payload },
    };
    if (push) {
      for (const key of ['icon', 'badge', 'image', 'actions', 'requireInteraction', 'silent', 'vibrate', 'tag', 'renotify']) {
        if (push[key] !== undefined) pushPayload[key] = push[key];
      }
    }
    const pushPromise = pushToUser({
      tenantId,
      userId,
      payload: pushPayload,
      options: push ? { ttl: push.ttl, urgency: push.urgency } : undefined,
    }, queryFn).catch((err) => {
      console.error('[push] mirror failed:', err.message);
      return { sent: 0, error: err.message };
    });
    return { inserted: true, id: result.rows.insertId, pushPromise };
  } catch (err) {
    if (isDuplicateKeyError(err)) return { inserted: false, reason: 'duplicate' };
    throw err;
  }
}

export async function createNotificationsForUsers(userIds, base, queryFn = dbQuery) {
  let inserted = 0;
  for (const userId of [...new Set((userIds || []).filter(Boolean))]) {
    const result = await createNotification({ ...base, userId }, queryFn);
    if (result.inserted) inserted += 1;
  }
  return { inserted };
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/**
 * Admin-triggered rich push notification: title/body plus optional image,
 * icon/badge overrides, up to 2 action buttons, behavior flags
 * (require-interaction/silent/tag/renotify/vibration pattern), delivery
 * priority (urgency/TTL), targeting (all users / a role / an explicit user
 * list) and optional scheduling (`sendAt` in the future defers delivery to
 * the scheduler sweep instead of sending immediately). Every send is logged
 * in `push_broadcasts` for history, click tracking and cancellation.
 */
export async function sendBroadcast({
  tenantId, senderUserId, title, body, url, recipients, roleId, sendAt, ...richInput
}, queryFn = dbQuery) {
  const cleanTitle = String(title || '').trim().slice(0, 200);
  if (!cleanTitle) throw badRequest('Ο τίτλος είναι υποχρεωτικός');
  const cleanBody = body ? String(body).trim().slice(0, 1000) : null;
  const cleanUrl = url ? String(url).trim().slice(0, 500) : null;

  const recipientType = recipients === 'all' ? 'all' : recipients === 'role' ? 'role' : 'users';
  const recipientRoleId = recipientType === 'role' ? Number(roleId) || null : null;
  const recipientIdsInput = recipientType === 'users'
    ? [...new Set((Array.isArray(recipients) ? recipients : []).map(Number).filter(Boolean))]
    : null;
  if (recipientType === 'role' && !recipientRoleId) throw badRequest('Επίλεξε ρόλο παραληπτών');
  if (recipientType === 'users' && !recipientIdsInput.length) throw badRequest('Επίλεξε τουλάχιστον έναν παραλήπτη');

  const rich = sanitizeRichPush(richInput);

  const targetIds = await resolveRecipients({
    tenantId, recipientType, recipientRoleId, recipientIds: recipientIdsInput,
  }, queryFn);
  if (!targetIds.length) throw badRequest('Δεν βρέθηκαν ενεργοί παραλήπτες');

  const scheduledDate = sendAt ? new Date(sendAt) : null;
  // A send_at more than a minute out is treated as scheduled; anything
  // sooner (or in the past) just sends immediately to avoid a spurious
  // "pending" row the scheduler sweep would fire a few seconds later.
  const isScheduled = !!(scheduledDate && !Number.isNaN(scheduledDate.getTime()) && scheduledDate.getTime() > Date.now() + 60000);

  const insertResult = await queryFn(
    `INSERT INTO push_broadcasts
      (tenant_id, sender_user_id, title, body, url, recipient_type, recipient_role_id, recipient_ids, recipient_count,
       image_url, icon_url, badge_url, actions, require_interaction, silent, vibrate, tag, renotify, urgency, ttl_seconds,
       send_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId, senderUserId, cleanTitle, cleanBody, cleanUrl,
      recipientType, recipientRoleId, recipientIdsInput ? JSON.stringify(recipientIdsInput) : null, targetIds.length,
      rich.imageUrl || null, rich.iconUrl || null, rich.badgeUrl || null, rich.actions.length ? JSON.stringify(rich.actions) : null,
      rich.requireInteraction ? 1 : 0, rich.silent ? 1 : 0, rich.vibrate || null, rich.tag || null, rich.renotify ? 1 : 0,
      rich.urgency, rich.ttlSeconds,
      isScheduled ? scheduledDate : null, isScheduled ? 'pending' : 'sent',
    ],
  );
  const broadcastId = insertResult.rows.insertId;

  if (isScheduled) {
    return {
      broadcastId, scheduled: true, sendAt: scheduledDate.toISOString(), recipients: targetIds.length, notified: 0, pushSent: 0,
    };
  }

  const delivery = await deliverBroadcast({
    id: broadcastId, tenantId, title: cleanTitle, body: cleanBody, url: cleanUrl, recipientIds: targetIds, rich,
  }, queryFn);
  return {
    broadcastId, recipients: targetIds.length, notified: delivery.notified, pushSent: delivery.pushSent,
  };
}

/** Cancels a scheduled broadcast that hasn't been delivered yet. */
export async function cancelBroadcast({ tenantId, broadcastId }, queryFn = dbQuery) {
  const result = await queryFn(
    "UPDATE push_broadcasts SET status = 'cancelled' WHERE id = ? AND tenant_id = ? AND status = 'pending'",
    [broadcastId, tenantId],
  );
  return { cancelled: Number(result.rows.affectedRows || 0) > 0 };
}

/** Records a click on a delivered notification, attributing it back to its broadcast for analytics. */
export async function recordNotificationClick({ notificationId }, queryFn = dbQuery) {
  const { rows } = await queryFn(
    'SELECT tenant_id, source_type, source_id FROM notifications WHERE id = ?',
    [notificationId],
  );
  const row = rows[0];
  if (!row || row.source_type !== SOURCE_TYPES.BROADCAST) return { recorded: false };
  await queryFn(
    'UPDATE push_broadcasts SET clicked_count = clicked_count + 1 WHERE id = ? AND tenant_id = ?',
    [row.source_id, row.tenant_id],
  );
  return { recorded: true };
}

/** Scheduler sweep: delivers any pending broadcast whose `send_at` is now due. */
export async function sendScheduledBroadcasts(queryFn = dbQuery) {
  const { rows } = await queryFn(
    `SELECT * FROM push_broadcasts WHERE status = 'pending' AND send_at IS NOT NULL AND send_at <= NOW() LIMIT 100`,
  );
  let delivered = 0;
  for (const row of rows) {
    const rich = sanitizeRichPush({
      imageUrl: row.image_url,
      iconUrl: row.icon_url,
      badgeUrl: row.badge_url,
      actions: parseJson(row.actions, []),
      requireInteraction: row.require_interaction,
      silent: row.silent,
      vibrate: row.vibrate,
      tag: row.tag,
      renotify: row.renotify,
      urgency: row.urgency,
      ttlSeconds: row.ttl_seconds,
    });
    const targetIds = await resolveRecipients({
      tenantId: row.tenant_id,
      recipientType: row.recipient_type,
      recipientRoleId: row.recipient_role_id,
      recipientIds: parseJson(row.recipient_ids, []),
    }, queryFn);
    if (!targetIds.length) {
      await queryFn("UPDATE push_broadcasts SET status = 'failed' WHERE id = ?", [row.id]).catch(() => {});
      continue;
    }
    await deliverBroadcast({
      id: row.id, tenantId: row.tenant_id, title: row.title, body: row.body, url: row.url, recipientIds: targetIds, rich,
    }, queryFn);
    delivered += 1;
  }
  return { delivered, scanned: rows.length };
}


async function loadTenantUsers(tenantId, queryFn) {
  const { rows } = await queryFn(
    `SELECT u.id, r.key AS role_key, r.permissions
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.tenant_id = ? AND u.is_active = 1`,
    [tenantId],
  );
  return rows.map((row) => ({ id: row.id, roleKey: row.role_key, permissions: parsePerms(row.permissions) }));
}

async function employeeUserMap(tenantId, queryFn) {
  const { rows } = await queryFn(
    `SELECT e.id AS employee_id, u.id AS user_id
     FROM employees e
     JOIN users u ON u.tenant_id = e.tenant_id AND LOWER(u.email) = LOWER(e.email)
     WHERE e.tenant_id = ? AND e.email IS NOT NULL AND e.email <> '' AND u.is_active = 1`,
    [tenantId],
  );
  return new Map(rows.map((row) => [Number(row.employee_id), Number(row.user_id)]));
}

export async function userIdForEmployee(tenantId, employeeId, queryFn) {
  if (!employeeId) return null;
  const { rows } = await queryFn(
    `SELECT u.id FROM employees e
     JOIN users u ON u.tenant_id = e.tenant_id AND LOWER(u.email) = LOWER(e.email)
     WHERE e.id = ? AND e.tenant_id = ? AND e.email IS NOT NULL AND e.email <> '' AND u.is_active = 1
     LIMIT 1`,
    [employeeId, tenantId],
  );
  return rows[0]?.id ?? null;
}

export async function notifyFollowUpAssigned({
  tenantId, followUpId, customerId, customerName, title, assignedEmployeeId,
}, queryFn = dbQuery) {
  const userId = await userIdForEmployee(tenantId, assignedEmployeeId, queryFn);
  if (!userId) return { inserted: 0 };
  const copy = buildNotificationCopy(NOTIFICATION_TYPES.FOLLOW_UP_ASSIGNED, { title, customerName });
  const result = await createNotification({
    tenantId,
    userId,
    type: NOTIFICATION_TYPES.FOLLOW_UP_ASSIGNED,
    ...copy,
    sourceType: SOURCE_TYPES.FOLLOW_UP,
    sourceId: followUpId,
    customerId,
    payload: { customer_name: customerName, assigned_employee_id: assignedEmployeeId },
  }, queryFn);
  return { inserted: result.inserted ? 1 : 0 };
}

export async function notifyConnectorFailure({
  tenantId, connectorId, runId, connectorName, errorMessage,
}, queryFn = dbQuery) {
  const users = await loadTenantUsers(tenantId, queryFn);
  const userIds = userIdsWithPermission(users, PERMISSIONS.SETTINGS_MANAGE);
  const copy = buildNotificationCopy(NOTIFICATION_TYPES.CONNECTOR_RUN_FAILED, {
    connectorName,
    errorMessage: errorMessage ? String(errorMessage).slice(0, 400) : '',
  });
  const result = await createNotificationsForUsers(userIds, {
    tenantId,
    type: NOTIFICATION_TYPES.CONNECTOR_RUN_FAILED,
    ...copy,
    sourceType: SOURCE_TYPES.SYNC_RUN,
    sourceId: runId,
    payload: { connector_id: Number(connectorId), connector_name: connectorName },
  }, queryFn);
  await evaluateNotificationRules('connector_run_failed', {
    tenantId, entityId: runId, connectorName, errorMessage: errorMessage ? String(errorMessage).slice(0, 400) : '',
  }, queryFn).catch((e) => console.error('[notificationRules]', e.message));
  return result;
}

function inAppRemindersEnabled(settings) {
  const reminders = mergeReminderSettings(settings);
  return reminders.enabled && reminders.channels.includes('in_app');
}

async function sweepFollowUpReminders(queryFn) {
  const { rows } = await queryFn(
    `SELECT f.id, f.tenant_id, f.customer_id, f.title, f.due_at, f.status, f.assigned_employee_id,
            c.full_name AS customer_name, t.timezone, t.settings
     FROM follow_ups f
     JOIN customers c ON c.id = f.customer_id
     JOIN tenants t ON t.id = f.tenant_id
     WHERE f.status = 'open'
       AND f.due_at < DATE_ADD(NOW(), INTERVAL 8 DAY)
       AND f.due_at > DATE_SUB(NOW(), INTERVAL 90 DAY)
     ORDER BY f.due_at ASC
     LIMIT 500`,
  );
  const now = new Date();
  const cache = new Map();
  let inserted = 0;
  for (const row of rows) {
    const settings = parseJson(row.settings, {}) || {};
    if (!inAppRemindersEnabled(settings.reminders)) continue;
    const reminders = mergeReminderSettings(settings.reminders);
    const state = computeReminderState(row.due_at, row.status, reminders, now, row.timezone || 'UTC');
    const type = state === 'overdue'
      ? NOTIFICATION_TYPES.FOLLOW_UP_OVERDUE
      : state === 'due_soon'
        ? NOTIFICATION_TYPES.FOLLOW_UP_DUE_SOON
        : null;
    if (!type) continue;
    if (!cache.has(row.tenant_id)) {
      const users = await loadTenantUsers(row.tenant_id, queryFn);
      cache.set(row.tenant_id, {
        users,
        viewers: userIdsWithPermission(users, PERMISSIONS.CUSTOMERS_READ),
        employees: await employeeUserMap(row.tenant_id, queryFn),
        reminders,
      });
    }
    const ctx = cache.get(row.tenant_id);
    const assignedUserId = row.assigned_employee_id ? ctx.employees.get(Number(row.assigned_employee_id)) || null : null;
    if (row.assigned_employee_id && !assignedUserId && ctx.reminders.notifyAssigneeOnly) continue;
    const userIds = followUpRecipientIds({
      assignedUserId,
      viewerUserIds: ctx.viewers,
      notifyAssigneeOnly: ctx.reminders.notifyAssigneeOnly,
    });
    const copy = buildNotificationCopy(type, { title: row.title, customerName: row.customer_name });
    const result = await createNotificationsForUsers(userIds, {
      tenantId: row.tenant_id,
      type,
      ...copy,
      sourceType: SOURCE_TYPES.FOLLOW_UP,
      sourceId: row.id,
      customerId: row.customer_id,
      payload: { customer_name: row.customer_name, due_at: row.due_at },
    }, queryFn);
    inserted += result.inserted;
    await evaluateNotificationRules(type, {
      tenantId: row.tenant_id,
      entityId: row.id,
      title: row.title,
      customerName: row.customer_name,
      assignedUserId,
    }, queryFn).catch((e) => console.error('[notificationRules]', e.message));
  }
  return { inserted, scanned: rows.length };
}

async function sweepExpiredQuotes(queryFn) {
  const { rows } = await queryFn(
    `SELECT q.id, q.tenant_id, q.series, q.quote_number, q.customer_id, q.created_by, q.seller_id, q.valid_until, q.total,
            c.full_name AS customer_name
     FROM quotes q
     JOIN customers c ON c.id = q.customer_id
     WHERE q.valid_until IS NOT NULL
       AND q.valid_until < CURDATE()
       AND q.status NOT IN ('expired', 'cancelled', 'accepted', 'rejected')
       AND q.valid_until >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
     ORDER BY q.valid_until ASC
     LIMIT 500`,
  );
  const cache = new Map();
  let inserted = 0;
  for (const row of rows) {
    if (!cache.has(row.tenant_id)) {
      const users = await loadTenantUsers(row.tenant_id, queryFn);
      cache.set(row.tenant_id, {
        userIds: new Set(users.map((u) => Number(u.id))),
        viewers: userIdsWithPermission(users, PERMISSIONS.QUOTES_VIEW),
        employees: await employeeUserMap(row.tenant_id, queryFn),
      });
    }
    const ctx = cache.get(row.tenant_id);
    const createdBy = ctx.userIds.has(Number(row.created_by)) ? Number(row.created_by) : null;
    const sellerUserId = row.seller_id ? ctx.employees.get(Number(row.seller_id)) : null;
    const userIds = quoteExpiredRecipientIds({
      createdBy,
      sellerUserId,
      quoteViewerIds: ctx.viewers,
    });
    const copy = buildNotificationCopy(NOTIFICATION_TYPES.QUOTE_EXPIRED, {
      series: row.series,
      quoteNumber: row.quote_number,
      customerName: row.customer_name,
    });
    const result = await createNotificationsForUsers(userIds, {
      tenantId: row.tenant_id,
      type: NOTIFICATION_TYPES.QUOTE_EXPIRED,
      ...copy,
      sourceType: SOURCE_TYPES.QUOTE,
      sourceId: row.id,
      customerId: row.customer_id,
      payload: { customer_name: row.customer_name, valid_until: row.valid_until },
    }, queryFn);
    inserted += result.inserted;
    await evaluateNotificationRules('quote_expired', {
      tenantId: row.tenant_id,
      entityId: row.id,
      customerName: row.customer_name,
      total: row.total,
      createdByUserId: createdBy,
      sellerEmployeeId: row.seller_id || null,
    }, queryFn).catch((e) => console.error('[notificationRules]', e.message));
  }
  return { inserted, scanned: rows.length };
}

async function sweepFailedSyncRuns(queryFn) {
  const { rows } = await queryFn(
    `SELECT r.id, r.tenant_id, r.connector_id, r.error_message, c.name AS connector_name
     FROM sync_runs r
     JOIN connectors c ON c.id = r.connector_id
     WHERE r.status = 'failed' AND r.finished_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
     ORDER BY r.finished_at DESC
     LIMIT 200`,
  );
  let inserted = 0;
  for (const row of rows) {
    const result = await notifyConnectorFailure({
      tenantId: row.tenant_id,
      connectorId: row.connector_id,
      runId: row.id,
      connectorName: row.connector_name,
      errorMessage: row.error_message,
    }, queryFn);
    inserted += result.inserted;
  }
  return { inserted, scanned: rows.length };
}

let sweeping = false;

export async function sweepNotifications(queryFn = dbQuery) {
  if (sweeping) return { skipped: true };
  sweeping = true;
  try {
    const followUps = await sweepFollowUpReminders(queryFn);
    const quotes = await sweepExpiredQuotes(queryFn);
    const syncs = await sweepFailedSyncRuns(queryFn);
    // Notification rules engine v2: schedule-based triggers ("N days
    // before/after a date field"), pending escalations, and digest
    // batching — all additive, all self-guarded against throwing.
    const scheduleRules = await sweepScheduleTriggers(queryFn).catch(() => ({ fired: 0 }));
    const escalations = await sweepEscalations(queryFn).catch(() => ({ escalated: 0 }));
    const digests = await sweepDigests(queryFn).catch(() => ({ sent: 0 }));
    return { followUps, quotes, syncs, scheduleRules, escalations, digests };
  } finally {
    sweeping = false;
  }
}
