import assert from 'node:assert/strict';
import {
  endpointHash, saveSubscription, removeSubscription, subscriptionCountForUser, pushEnabled,
} from './push.js';

// No VAPID keys set in the test environment — sends must no-op, never throw.
assert.equal(pushEnabled(), false);

const rows = [];
async function fakeQuery(sql, params) {
  const s = String(sql);
  if (s.includes('INSERT INTO push_subscriptions')) {
    const [tenantId, userId, endpoint, hash, p256dh, auth, userAgent] = params;
    const existing = rows.find((r) => r.endpoint_hash === hash);
    if (existing) Object.assign(existing, { tenant_id: tenantId, user_id: userId, endpoint, p256dh, auth, user_agent: userAgent });
    else rows.push({ id: rows.length + 1, tenant_id: tenantId, user_id: userId, endpoint, endpoint_hash: hash, p256dh, auth, user_agent: userAgent });
    return { rows: { insertId: rows.length } };
  }
  if (s.includes('DELETE FROM push_subscriptions')) {
    const [tenantId, userId, hash] = params;
    const before = rows.length;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i].tenant_id === tenantId && rows[i].user_id === userId && rows[i].endpoint_hash === hash) rows.splice(i, 1);
    }
    return { rows: { affectedRows: before - rows.length } };
  }
  if (s.includes('SELECT COUNT(*)')) {
    const [tenantId, userId] = params;
    return { rows: [{ c: rows.filter((r) => r.tenant_id === tenantId && r.user_id === userId).length }] };
  }
  return { rows: [] };
}

assert.equal(endpointHash('https://fcm.googleapis.com/a'), endpointHash('https://fcm.googleapis.com/a'));
assert.notEqual(endpointHash('a'), endpointHash('b'));

await saveSubscription({
  tenantId: 1, userId: 5, subscription: { endpoint: 'https://fcm.example/1', keys: { p256dh: 'p', auth: 'a' } }, userAgent: 'UA',
}, fakeQuery);
assert.equal(await subscriptionCountForUser({ tenantId: 1, userId: 5 }, fakeQuery), 1);

// Re-subscribing the same endpoint upserts instead of duplicating.
await saveSubscription({
  tenantId: 1, userId: 5, subscription: { endpoint: 'https://fcm.example/1', keys: { p256dh: 'p2', auth: 'a2' } },
}, fakeQuery);
assert.equal(await subscriptionCountForUser({ tenantId: 1, userId: 5 }, fakeQuery), 1);
assert.equal(rows[0].p256dh, 'p2');

await assert.rejects(() => saveSubscription({ tenantId: 1, userId: 5, subscription: { endpoint: 'x' } }, fakeQuery));

const removed = await removeSubscription({ tenantId: 1, userId: 5, endpoint: 'https://fcm.example/1' }, fakeQuery);
assert.equal(removed.removed, true);
assert.equal(await subscriptionCountForUser({ tenantId: 1, userId: 5 }, fakeQuery), 0);

console.log('push tests passed');
