import assert from 'node:assert/strict';
import { formatRelativeTime, notificationIcon, notificationTarget } from './notifications.js';

const now = Date.parse('2030-06-10T12:00:00Z');
assert.equal(formatRelativeTime('2030-06-10T11:59:30Z', now), 'μόλις τώρα');
assert.equal(formatRelativeTime('2030-06-10T11:50:00Z', now), 'πριν 10 λεπτά');
assert.equal(formatRelativeTime('2030-06-10T10:00:00Z', now), 'πριν 2 ώρες');
assert.equal(formatRelativeTime('2030-06-09T12:00:00Z', now), 'χθες');
assert.equal(formatRelativeTime(null, now), '');

assert.equal(notificationIcon('follow_up_overdue'), 'clock');
assert.equal(notificationIcon('quote_expired'), 'file');
assert.equal(notificationIcon('unknown'), 'bell');

assert.deepEqual(
  notificationTarget({ source_type: 'follow_up', customer_id: 8, payload: { customer_name: 'Άννα' } }),
  { kind: 'customer', customerId: 8, customerName: 'Άννα' },
);
assert.equal(notificationTarget({ source_type: 'quote', source_id: 3 }).kind, 'quote');
assert.equal(notificationTarget({ source_type: 'sync_run', payload: { connector_id: 4 } }).kind, 'connector');

console.log('frontend notifications tests passed');
