import assert from 'node:assert/strict';
import {
  NOTIFICATION_TYPES, SOURCE_TYPES,
  buildNotificationCopy, followUpRecipientIds, quoteExpiredRecipientIds,
  userIdsWithPermission, notificationTarget, publicNotification,
  createNotification, createNotificationsForUsers, sendBroadcast,
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

console.log('notifications tests passed');
