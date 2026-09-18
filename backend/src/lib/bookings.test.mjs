import assert from 'node:assert/strict';
import { parseBookingPayload, BOOKING_STATUSES } from './bookings.js';

// Full create payload
{
  const parsed = parseBookingPayload({
    branchId: 1, spaceId: 2, employeeId: 3,
    startsAt: '2030-01-02T10:00:00Z', endsAt: '2030-01-02T11:00:00Z', status: 'confirmed', amount: 25.5,
  });
  assert.equal(parsed.branchId, 1);
  assert.equal(parsed.spaceId, 2);
  assert.equal(parsed.employeeId, 3);
  assert.ok(parsed.startsAt instanceof Date, 'startsAt should be a Date instance');
  assert.ok(parsed.endsAt instanceof Date, 'endsAt should be a Date instance');
  assert.equal(parsed.status, 'confirmed');
  assert.equal(parsed.amount, 25.5);
}

// Missing required starts/ends on a full (non-partial) payload.
assert.equal(parseBookingPayload({}).error, 'Απαιτείται έγκυρη ώρα έναρξης');
assert.equal(parseBookingPayload({ startsAt: '2030-01-02T10:00:00Z' }).error, 'Απαιτείται έγκυρη ώρα λήξης');

// ends must be after starts.
assert.equal(
  parseBookingPayload({ startsAt: '2030-01-02T12:00:00Z', endsAt: '2030-01-02T11:00:00Z' }).error,
  'Η ώρα λήξης πρέπει να είναι μετά την έναρξη',
);
assert.equal(
  parseBookingPayload({ startsAt: '2030-01-02T12:00:00Z', endsAt: '2030-01-02T12:00:00Z' }).error,
  'Η ώρα λήξης πρέπει να είναι μετά την έναρξη',
);

// Invalid status is rejected against the fixed catalog.
assert.equal(parseBookingPayload({ startsAt: '2030-01-02T10:00:00Z', endsAt: '2030-01-02T11:00:00Z', status: 'bogus' }).error, 'Μη έγκυρη κατάσταση κράτησης');
assert.ok(BOOKING_STATUSES.includes('confirmed'));

// Negative/invalid amount rejected.
assert.equal(parseBookingPayload({ startsAt: '2030-01-02T10:00:00Z', endsAt: '2030-01-02T11:00:00Z', amount: -5 }).error, 'Μη έγκυρο ποσό');

// Partial update: only the drag-provided fields are validated/returned,
// mirroring how the follow-ups PATCH endpoint only touches provided fields
// (used by the calendar's drag-to-reschedule for bookings).
{
  const parsed = parseBookingPayload({ startsAt: '2030-02-01T09:00:00Z', endsAt: '2030-02-01T10:00:00Z' }, { partial: true });
  assert.deepEqual(Object.keys(parsed).sort(), ['endsAt', 'startsAt']);
}
{
  const parsed = parseBookingPayload({ status: 'cancelled' }, { partial: true });
  assert.deepEqual(parsed, { status: 'cancelled' });
}
// Partial payload with no recognized fields returns an empty (non-error) result.
assert.deepEqual(parseBookingPayload({}, { partial: true }), {});

console.log('bookings tests passed');
