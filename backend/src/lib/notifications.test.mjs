import assert from 'node:assert/strict';
import {
  NOTIFICATION_TYPES, SOURCE_TYPES,
  buildNotificationCopy, followUpRecipientIds, quoteExpiredRecipientIds,
  userIdsWithPermission, notificationTarget, publicNotification,
  createNotification, createNotificationsForUsers, sendBroadcast,
  sanitizeRichPush, cancelBroadcast, recordNotificationClick, sendScheduledBroadcasts,
  publicPushBroadcast, publicPushTemplate,
} from './notifications.js';
import { PERMISSIONS } from './permissions.js';

const overdue = buildNotificationCopy(NOTIFICATION_TYPES.FOLLOW_UP_OVERDUE, { title: 'Κλήση', customerName: 'Άννα' });
assert.equal(overdue.title, 'Εκπρόθεσμη υπενθύμιση');
assert.equal(overdue.body, 'Κλήση · Άννα');

const assigned = buildNotificationCopy(NOTIFICATION_TYPES.FOLLOW_UP_ASSIGNED, { title: 'Follow-up' });
assert.equal(assigned.title, 'Νέα ανάθεση υπενθύμισης');
assert.equal(assigned.body, 'Follow-up');

const failed = buildNotificationCopy(NOTIFICATION_TYPES.CONNECTOR_RUN_FAILED, {
  connectorName: 'Customers', errorMessage: 'ERP returned 500',
});
assert.equal(failed.title, 'Αποτυχία συγχρονισμού ERP');
assert.match(failed.body, /Customers/);
assert.match(failed.body, /500/);

const expired = buildNotificationCopy(NOTIFICATION_TYPES.QUOTE_EXPIRED, {
  series: '7001', quoteNumber: 12, customerName: 'GEA',
});
assert.equal(expired.title, 'Η προσφορά έληξε');
assert.equal(expired.body, '7001-12 · GEA');

assert.deepEqual(followUpRecipientIds({ assignedUserId: 7, viewerUserIds: [1, 2, 7], notifyAssigneeOnly: true }), [7]);
assert.deepEqual(
  followUpRecipientIds({ assignedUserId: 7, viewerUserIds: [1, 2, 7], notifyAssigneeOnly: false }).sort((a, b) => a - b),
  [1, 2, 7],
);
assert.deepEqual(followUpRecipientIds({ assignedUserId: null, viewerUserIds: [3, 3, 4] }), [3, 4]);

assert.deepEqual(quoteExpiredRecipientIds({ createdBy: 9, sellerUserId: 11, quoteViewerIds: [1, 2] }), [9, 11]);
assert.deepEqual(quoteExpiredRecipientIds({ createdBy: null, sellerUserId: null, quoteViewerIds: [4, 5] }), [4, 5]);

const users = [
  { id: 1, roleKey: 'owner', permissions: [] },
  { id: 2, roleKey: 'admin', permissions: [PERMISSIONS.SETTINGS_MANAGE] },
  { id: 3, roleKey: 'agent', permissions: [PERMISSIONS.CUSTOMERS_READ] },
];
assert.deepEqual(userIdsWithPermission(users, PERMISSIONS.SETTINGS_MANAGE).sort((a, b) => a - b), [1, 2]);
assert.ok(userIdsWithPermission(users, PERMISSIONS.CUSTOMERS_READ).includes(3));

const mapped = notificationTarget({
  source_type: SOURCE_TYPES.FOLLOW_UP, source_id: 44, customer_id: 8,
  payload: { customer_name: 'Νίκος' },
});
assert.deepEqual(mapped, { kind: 'customer', customerId: 8, followUpId: 44, customerName: 'Νίκος' });
assert.equal(notificationTarget({ source_type: SOURCE_TYPES.QUOTE, source_id: 3, customer_id: 1 }).kind, 'quote');
assert.equal(notificationTarget({
  source_type: SOURCE_TYPES.SYNC_RUN, source_id: 99, payload: { connector_id: 5 },
}).kind, 'connector');

const pub = publicNotification({
  id: 1, type: 'follow_up_overdue', title: 'x', body: 'y', source_type: 'follow_up',
  source_id: 2, customer_id: 3, payload: '{"a":1}', read_at: null, created_at: '2030-01-01',
});
assert.equal(pub.unread, true);
assert.deepEqual(pub.payload, { a: 1 });

const inserts = [];
async function fakeQuery(sql, params) {
  if (String(sql).includes('INSERT')) {
    const key = `${params[0]}:${params[1]}:${params[2]}:${params[6]}`;
    if (inserts.includes(key)) {
      const err = new Error('dup');
      err.code = 'ER_DUP_ENTRY';
      throw err;
    }
    inserts.push(key);
    return { rows: { insertId: inserts.length } };
  }
  return { rows: [] };
}

const first = await createNotification({
  tenantId: 1, userId: 2, type: NOTIFICATION_TYPES.FOLLOW_UP_OVERDUE,
  title: 't', body: 'b', sourceType: SOURCE_TYPES.FOLLOW_UP, sourceId: 10,
}, fakeQuery);
assert.equal(first.inserted, true);
const dup = await createNotification({
  tenantId: 1, userId: 2, type: NOTIFICATION_TYPES.FOLLOW_UP_OVERDUE,
  title: 't', body: 'b', sourceType: SOURCE_TYPES.FOLLOW_UP, sourceId: 10,
}, fakeQuery);
assert.equal(dup.inserted, false);
assert.equal(dup.reason, 'duplicate');

const invalid = await createNotification({ tenantId: 1, userId: 2, type: 'x' }, fakeQuery);
assert.equal(invalid.inserted, false);

const batch = await createNotificationsForUsers([2, 2, 3], {
  tenantId: 1, type: NOTIFICATION_TYPES.FOLLOW_UP_DUE_SOON, title: 'soon',
  sourceType: SOURCE_TYPES.FOLLOW_UP, sourceId: 11,
}, fakeQuery);
assert.equal(batch.inserted, 2);

// --- sendBroadcast ---------------------------------------------------------
const broadcastUsers = [
  { id: 1, is_active: 1 },
  { id: 2, is_active: 1 },
  { id: 3, is_active: 1 },
];
let broadcastRowId = 0;
let broadcastUpdatedCount = null;
const notificationInserts = [];
async function broadcastFakeQuery(sql, params) {
  const s = String(sql);
  if (s.includes('SELECT id FROM users')) {
    if (s.includes('IN (')) {
      const ids = params.slice(1);
      return { rows: broadcastUsers.filter((u) => ids.includes(u.id)) };
    }
    return { rows: broadcastUsers };
  }
  if (s.includes('INSERT INTO push_broadcasts')) {
    broadcastRowId += 1;
    return { rows: { insertId: broadcastRowId } };
  }
  if (s.includes('UPDATE push_broadcasts')) {
    broadcastUpdatedCount = params[0];
    return { rows: {} };
  }
  if (s.includes('INSERT INTO notifications')) {
    notificationInserts.push(params);
    return { rows: { insertId: notificationInserts.length } };
  }
  return { rows: [] };
}

const allResult = await sendBroadcast({
  tenantId: 1, senderUserId: 9, title: 'Νέα έκδοση', body: 'Δοκιμή', recipients: 'all',
}, broadcastFakeQuery);
assert.equal(allResult.recipients, 3);
assert.equal(allResult.notified, 3);
assert.equal(allResult.pushSent, 0); // VAPID not configured in tests
assert.equal(broadcastUpdatedCount, 0);

notificationInserts.length = 0;
const subsetResult = await sendBroadcast({
  tenantId: 1, senderUserId: 9, title: 'Μόνο σε δύο', recipients: [1, 2],
}, broadcastFakeQuery);
assert.equal(subsetResult.recipients, 2);
assert.equal(notificationInserts.length, 2);

await assert.rejects(() => sendBroadcast({
  tenantId: 1, senderUserId: 9, title: '', recipients: 'all',
}, broadcastFakeQuery), /τίτλος/);
await assert.rejects(() => sendBroadcast({
  tenantId: 1, senderUserId: 9, title: 'x', recipients: [],
}, broadcastFakeQuery), /παραλήπτη/);

// --- sanitizeRichPush -------------------------------------------------------
const richDefaults = sanitizeRichPush({});
assert.equal(richDefaults.urgency, 'normal');
assert.equal(richDefaults.ttlSeconds, 259200);
assert.equal(richDefaults.actions.length, 0);
assert.equal(richDefaults.vibrate, '');

const richFull = sanitizeRichPush({
  imageUrl: 'https://x/img.png',
  iconUrl: 'https://x/icon.png',
  badgeUrl: 'https://x/badge.png',
  actions: [
    { title: 'Άνοιγμα', url: 'https://x/1' },
    { title: 'Απόρριψη', url: 'https://x/2' },
    { title: 'Θα αγνοηθεί (3η)', url: 'https://x/3' },
  ],
  requireInteraction: true,
  silent: true,
  renotify: true,
  tag: 'maintenance',
  vibrate: '9999,-5,100',
  urgency: 'bogus',
  ttlSeconds: 30,
});
assert.equal(richFull.actions.length, 2);
assert.equal(richFull.actions[0].title, 'Άνοιγμα');
assert.ok(richFull.actions[0].action);
assert.equal(richFull.requireInteraction, true);
assert.equal(richFull.silent, true);
assert.equal(richFull.renotify, true);
assert.equal(richFull.tag, 'maintenance');
assert.equal(richFull.vibrate, '5000,0,100'); // clamped 0..5000
assert.equal(richFull.urgency, 'normal'); // invalid value falls back to default
assert.equal(richFull.ttlSeconds, 60); // clamped to MIN_TTL_SECONDS

const richCsvVibrate = sanitizeRichPush({ vibrate: '200,100,200' });
assert.equal(richCsvVibrate.vibrate, '200,100,200');

// --- publicPushBroadcast / publicPushTemplate row shaping -------------------
const shapedBroadcast = publicPushBroadcast({
  id: 5, title: 't', body: 'b', url: null, recipient_type: 'all', recipient_role_id: null,
  recipient_count: 3, push_sent_count: 2, clicked_count: 1, image_url: '', icon_url: '', badge_url: '',
  actions: '[{"action":"a1","title":"Go","url":"https://x"}]', require_interaction: 1, silent: 0,
  vibrate: '', tag: '', renotify: 0, urgency: 'normal', ttl_seconds: 259200, send_at: null, status: 'sent',
  created_at: '2030-01-01', sender_name: 'Admin',
});
assert.equal(shapedBroadcast.require_interaction, true);
assert.deepEqual(shapedBroadcast.actions, [{ action: 'a1', title: 'Go', url: 'https://x' }]);
assert.equal(publicPushTemplate(null), null);
assert.equal(publicPushBroadcast(null), null);

// --- sendBroadcast: role targeting + scheduling + rich fields ---------------
const roleUsers = [
  { id: 1, is_active: 1, role_id: 10 },
  { id: 2, is_active: 1, role_id: 10 },
  { id: 3, is_active: 1, role_id: 20 },
];
let roleBroadcastId = 0;
const roleInsertedRows = [];
async function roleFakeQuery(sql, params) {
  const s = String(sql);
  if (s.includes('SELECT id FROM users') && s.includes('role_id')) {
    return { rows: roleUsers.filter((u) => u.role_id === params[1]) };
  }
  if (s.includes('INSERT INTO push_broadcasts')) {
    roleBroadcastId += 1;
    roleInsertedRows.push(params);
    return { rows: { insertId: roleBroadcastId } };
  }
  if (s.includes('UPDATE push_broadcasts')) return { rows: {} };
  if (s.includes('INSERT INTO notifications')) return { rows: { insertId: 1 } };
  return { rows: [] };
}

const roleResult = await sendBroadcast({
  tenantId: 1, senderUserId: 9, title: 'Σε ρόλο', recipients: 'role', roleId: 10,
  imageUrl: 'https://x/img.png', urgency: 'high', ttlSeconds: 600,
}, roleFakeQuery);
assert.equal(roleResult.recipients, 2);
assert.equal(roleResult.scheduled, undefined);

await assert.rejects(() => sendBroadcast({
  tenantId: 1, senderUserId: 9, title: 'x', recipients: 'role',
}, roleFakeQuery), /ρόλο/);

// A send_at far in the future is scheduled, not delivered immediately.
const futureIso = new Date(Date.now() + 3600000).toISOString();
const scheduledResult = await sendBroadcast({
  tenantId: 1, senderUserId: 9, title: 'Προγραμματισμένη', recipients: 'all', sendAt: futureIso,
}, broadcastFakeQuery);
assert.equal(scheduledResult.scheduled, true);
assert.equal(scheduledResult.recipients, 3);
assert.equal(scheduledResult.notified, 0);

// A send_at only seconds away sends immediately (not treated as scheduled).
const nearIso = new Date(Date.now() + 5000).toISOString();
const nearResult = await sendBroadcast({
  tenantId: 1, senderUserId: 9, title: 'Σχεδόν τώρα', recipients: 'all', sendAt: nearIso,
}, broadcastFakeQuery);
assert.equal(nearResult.scheduled, undefined);
assert.equal(nearResult.recipients, 3);

// --- cancelBroadcast ---------------------------------------------------------
let cancelUpdateParams = null;
async function cancelFakeQuery(sql, params) {
  cancelUpdateParams = params;
  return { rows: { affectedRows: params[0] === 42 ? 1 : 0 } };
}
const cancelled = await cancelBroadcast({ tenantId: 1, broadcastId: 42 }, cancelFakeQuery);
assert.equal(cancelled.cancelled, true);
assert.deepEqual(cancelUpdateParams, [42, 1]);
const notCancelled = await cancelBroadcast({ tenantId: 1, broadcastId: 7 }, cancelFakeQuery);
assert.equal(notCancelled.cancelled, false);

// --- recordNotificationClick -------------------------------------------------
async function clickFakeQuery(sql, params) {
  const s = String(sql);
  if (s.includes('SELECT tenant_id')) {
    if (params[0] === 100) return { rows: [{ tenant_id: 1, source_type: SOURCE_TYPES.BROADCAST, source_id: 55 }] };
    if (params[0] === 200) return { rows: [{ tenant_id: 1, source_type: SOURCE_TYPES.FOLLOW_UP, source_id: 1 }] };
    return { rows: [] };
  }
  if (s.includes('UPDATE push_broadcasts')) return { rows: {} };
  return { rows: [] };
}
assert.equal((await recordNotificationClick({ notificationId: 100 }, clickFakeQuery)).recorded, true);
assert.equal((await recordNotificationClick({ notificationId: 200 }, clickFakeQuery)).recorded, false);
assert.equal((await recordNotificationClick({ notificationId: 999 }, clickFakeQuery)).recorded, false);

// --- sendScheduledBroadcasts --------------------------------------------------
const duePending = [
  {
    id: 1, tenant_id: 1, title: 'Due now', body: 'b', url: null, recipient_type: 'all', recipient_role_id: null,
    recipient_ids: null, image_url: null, icon_url: null, badge_url: null, actions: null, require_interaction: 0,
    silent: 0, vibrate: null, tag: null, renotify: 0, urgency: 'normal', ttl_seconds: 259200,
  },
  {
    id: 2, tenant_id: 1, title: 'No recipients', body: null, url: null, recipient_type: 'role', recipient_role_id: 999,
    recipient_ids: null, image_url: null, icon_url: null, badge_url: null, actions: null, require_interaction: 0,
    silent: 0, vibrate: null, tag: null, renotify: 0, urgency: 'normal', ttl_seconds: 259200,
  },
];
const sweepUpdates = [];
async function sweepFakeQuery(sql, params) {
  const s = String(sql);
  if (s.includes("SELECT * FROM push_broadcasts WHERE status = 'pending'")) return { rows: duePending };
  if (s.includes('SELECT id FROM users') && s.includes('role_id')) {
    return { rows: params[1] === 999 ? [] : broadcastUsers };
  }
  if (s.includes('SELECT id FROM users')) return { rows: broadcastUsers };
  if (s.includes("UPDATE push_broadcasts SET status = 'failed'")) { sweepUpdates.push(['failed', params[0]]); return { rows: {} }; }
  if (s.includes('UPDATE push_broadcasts')) return { rows: {} };
  if (s.includes('INSERT INTO notifications')) return { rows: { insertId: 1 } };
  return { rows: [] };
}
const sweepResult = await sendScheduledBroadcasts(sweepFakeQuery);
assert.equal(sweepResult.delivered, 1);
assert.deepEqual(sweepUpdates, [['failed', 2]]);

console.log('notifications tests passed');
