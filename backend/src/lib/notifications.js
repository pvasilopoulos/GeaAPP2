import { query as dbQuery } from '../db.js';
import { isDuplicateKeyError } from './idempotency.js';
import { computeReminderState, mergeReminderSettings } from './reminderSettings.js';
import { PERMISSIONS, expandPermissions } from './permissions.js';
import { pushToUser } from './push.js';

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

export async function createNotification({
  tenantId, userId, type, title, body, sourceType, sourceId, customerId = null, payload = null,
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
    // can await it; other callers simply let it run fire-and-forget.
    const pushPromise = pushToUser({
      tenantId,
      userId,
      payload: {
        title: String(title || 'Ειδοποίηση').slice(0, 200),
        body: body ? String(body).slice(0, 1000) : '',
        notificationId: result.rows.insertId,
        target: { source_type: sourceType || null, source_id: sourceId, customer_id: customerId || null, payload },
      },
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
 * Admin-triggered message: creates an in-app notification (and its Web Push
 * mirror, via createNotification) for every active user, or a chosen subset.
 * Logged in `push_broadcasts` for a history/audit trail.
 */
export async function sendBroadcast({
  tenantId, senderUserId, title, body, url, recipients,
}, queryFn = dbQuery) {
  const cleanTitle = String(title || '').trim().slice(0, 200);
  if (!cleanTitle) throw badRequest('Ο τίτλος είναι υποχρεωτικός');
  const cleanBody = body ? String(body).trim().slice(0, 1000) : null;
  const cleanUrl = url ? String(url).trim().slice(0, 500) : null;
  const isAll = recipients === 'all';

  let targetIds;
  if (isAll) {
    const { rows } = await queryFn('SELECT id FROM users WHERE tenant_id = ? AND is_active = 1', [tenantId]);
    targetIds = rows.map((r) => Number(r.id));
  } else {
    const ids = [...new Set((Array.isArray(recipients) ? recipients : []).map(Number).filter(Boolean))];
    if (!ids.length) throw badRequest('Επίλεξε τουλάχιστον έναν παραλήπτη');
    const placeholders = ids.map(() => '?').join(',');
    const { rows } = await queryFn(
      `SELECT id FROM users WHERE tenant_id = ? AND is_active = 1 AND id IN (${placeholders})`,
      [tenantId, ...ids],
    );
    targetIds = rows.map((r) => Number(r.id));
  }
  if (!targetIds.length) throw badRequest('Δεν βρέθηκαν ενεργοί παραλήπτες');

  const insertResult = await queryFn(
    `INSERT INTO push_broadcasts (tenant_id, sender_user_id, title, body, url, recipient_type, recipient_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, senderUserId, cleanTitle, cleanBody, cleanUrl, isAll ? 'all' : 'users', targetIds.length],
  );
  const broadcastId = insertResult.rows.insertId;

  let notified = 0;
  let pushSent = 0;
  await Promise.all(targetIds.map(async (userId) => {
    const created = await createNotification({
      tenantId,
      userId,
      type: NOTIFICATION_TYPES.ADMIN_MESSAGE,
      title: cleanTitle,
      body: cleanBody,
      sourceType: SOURCE_TYPES.BROADCAST,
      sourceId: broadcastId,
      payload: cleanUrl ? { url: cleanUrl } : null,
    }, queryFn);
    if (created.inserted) {
      notified += 1;
      const pushResult = await created.pushPromise;
      pushSent += pushResult?.sent || 0;
    }
  }));

  await queryFn('UPDATE push_broadcasts SET push_sent_count = ? WHERE id = ?', [pushSent, broadcastId]).catch(() => {});
  return {
    broadcastId, recipients: targetIds.length, notified, pushSent,
  };
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

async function userIdForEmployee(tenantId, employeeId, queryFn) {
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
  return createNotificationsForUsers(userIds, {
    tenantId,
    type: NOTIFICATION_TYPES.CONNECTOR_RUN_FAILED,
    ...copy,
    sourceType: SOURCE_TYPES.SYNC_RUN,
    sourceId: runId,
    payload: { connector_id: Number(connectorId), connector_name: connectorName },
  }, queryFn);
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
  }
  return { inserted, scanned: rows.length };
}

async function sweepExpiredQuotes(queryFn) {
  const { rows } = await queryFn(
    `SELECT q.id, q.tenant_id, q.series, q.quote_number, q.customer_id, q.created_by, q.seller_id, q.valid_until,
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
    return { followUps, quotes, syncs };
  } finally {
    sweeping = false;
  }
}
