import assert from 'node:assert/strict';
import {
  parseDateRange, canViewBookings, canViewFollowUps, mapBookingToEvent, mapFollowUpToEvent,
  FOLLOW_UP_DEFAULT_DURATION_MINUTES,
} from './calendar.js';

const BOOKINGS_VIEW = 'bookings.view';
const CUSTOMERS_READ = 'customers.read';

// --- date-range parsing / validation (used by GET /api/calendar) ---
assert.equal(parseDateRange({}).error, 'Απαιτούνται παράμετροι from και to');
assert.equal(parseDateRange({ from: '2030-01-01', to: 'not-a-date' }).error, 'Μη έγκυρο εύρος ημερομηνιών');
assert.equal(
  parseDateRange({ from: '2030-02-01', to: '2030-01-01' }).error,
  'Η ημερομηνία λήξης πρέπει να είναι μετά την έναρξη',
);
assert.match(parseDateRange({ from: '2030-01-01', to: '2032-01-01' }).error, /370 ημέρες/);
{
  const { from, to, error } = parseDateRange({ from: '2030-01-01T00:00:00Z', to: '2030-02-01T00:00:00Z' });
  assert.equal(error, undefined);
  assert.ok(from instanceof Date && to instanceof Date);
  assert.ok(to > from);
}

// --- permission-gated inclusion (tenant/permission isolation for the feed) ---
assert.equal(canViewBookings([BOOKINGS_VIEW], BOOKINGS_VIEW), true);
assert.equal(canViewBookings([CUSTOMERS_READ], BOOKINGS_VIEW), false);
assert.equal(canViewBookings([], BOOKINGS_VIEW), false);
assert.equal(canViewFollowUps([CUSTOMERS_READ], CUSTOMERS_READ), true);
assert.equal(canViewFollowUps([BOOKINGS_VIEW], CUSTOMERS_READ), false);

// --- booking row -> calendar event shape ---
{
  const event = mapBookingToEvent({
    id: 7, customer_id: 3, customer_name: 'Acme AE', branch_id: 1, branch_name: 'Αθήνα',
    space_id: 2, space_name: 'Αίθουσα Α', employee_id: 5, employee_name: 'Γιώργος',
    starts_at: '2030-01-02T10:00:00.000Z', ends_at: '2030-01-02T11:00:00.000Z', status: 'confirmed', amount: 40,
  });
  assert.equal(event.id, 'booking-7');
  assert.equal(event.type, 'booking');
  assert.equal(event.raw_id, 7);
  assert.equal(event.title, 'Acme AE');
  assert.equal(event.start, '2030-01-02T10:00:00.000Z');
  assert.equal(event.end, '2030-01-02T11:00:00.000Z');
  assert.equal(event.overdue, false);
}

// --- follow-up row -> calendar event shape (point-in-time -> default duration block) ---
{
  const row = {
    id: 9, customer_id: 4, customer_name: 'Μαρία Παπά', title: 'Τηλεφώνημα', description: 'Follow up',
    due_at: '2020-01-01T09:00:00.000Z', status: 'open', assigned_employee_id: 6, assigned_employee: 'Νίκος',
  };
  const event = mapFollowUpToEvent(row, { now: new Date('2030-01-01T00:00:00Z') });
  assert.equal(event.id, 'follow_up-9');
  assert.equal(event.type, 'follow_up');
  assert.equal(event.start, '2020-01-01T09:00:00.000Z');
  assert.equal(new Date(event.end).getTime() - new Date(event.start).getTime(), FOLLOW_UP_DEFAULT_DURATION_MINUTES * 60000);
  // Past-due open follow-up viewed "now" in 2030 must surface as overdue so
  // the calendar can color-code it distinctly from regular follow-ups.
  assert.equal(event.computed_status, 'overdue');
  assert.equal(event.overdue, true);
}
{
  // A completed follow-up is never "overdue" regardless of its due date.
  const event = mapFollowUpToEvent({
    id: 10, customer_id: 4, title: 'Done', due_at: '2020-01-01T09:00:00.000Z', status: 'completed',
  }, { now: new Date('2030-01-01T00:00:00Z') });
  assert.equal(event.computed_status, 'completed');
  assert.equal(event.overdue, false);
}

console.log('calendar tests passed');
