import { computeReminderState } from './reminderSettings.js';

const MAX_RANGE_DAYS = 370;
// Follow-ups are point-in-time reminders (no duration column), so the
// calendar renders them as a short block for visibility in week/day views.
export const FOLLOW_UP_DEFAULT_DURATION_MINUTES = 30;

/**
 * Validates the `from`/`to` query params of GET /api/calendar. Returns
 * `{ from, to }` (Date instances) or `{ error }`. Keeps the range bounded so
 * a client can't request an unbounded/huge scan of the tables.
 */
export function parseDateRange(query = {}) {
  const fromRaw = query.from;
  const toRaw = query.to;
  if (!fromRaw || !toRaw) return { error: 'Απαιτούνται παράμετροι from και to' };
  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return { error: 'Μη έγκυρο εύρος ημερομηνιών' };
  if (to <= from) return { error: 'Η ημερομηνία λήξης πρέπει να είναι μετά την έναρξη' };
  const days = (to.getTime() - from.getTime()) / 86400000;
  if (days > MAX_RANGE_DAYS) return { error: `Το εύρος δεν μπορεί να υπερβαίνει τις ${MAX_RANGE_DAYS} ημέρες` };
  return { from, to };
}

/** Whether the viewer's permission set allows seeing bookings on the calendar. */
export function canViewBookings(perms = [], BOOKINGS_VIEW) {
  return perms.includes(BOOKINGS_VIEW);
}

/** Whether the viewer's permission set allows seeing follow-ups on the calendar. */
export function canViewFollowUps(perms = [], CUSTOMERS_READ) {
  return perms.includes(CUSTOMERS_READ);
}

/** Maps a `bookings` row (joined with customer/branch/space/employee names) into a calendar event. */
export function mapBookingToEvent(row) {
  return {
    id: `booking-${row.id}`,
    type: 'booking',
    raw_id: row.id,
    title: row.customer_name || row.space_name || 'Κράτηση',
    start: row.starts_at,
    end: row.ends_at,
    status: row.status,
    customer_id: row.customer_id,
    customer_name: row.customer_name || null,
    employee_id: row.employee_id,
    employee_name: row.employee_name || null,
    branch_id: row.branch_id,
    branch_name: row.branch_name || null,
    space_id: row.space_id,
    space_name: row.space_name || null,
    amount: row.amount,
    overdue: false,
  };
}

/** Maps a `follow_ups` row into a calendar event (point-in-time, default duration). */
export function mapFollowUpToEvent(row, ctx = {}) {
  const start = new Date(row.due_at);
  const end = new Date(start.getTime() + FOLLOW_UP_DEFAULT_DURATION_MINUTES * 60000);
  const computedStatus = computeReminderState(row.due_at, row.status, ctx.reminders, ctx.now || new Date(), ctx.timezone || 'UTC');
  return {
    id: `follow_up-${row.id}`,
    type: 'follow_up',
    raw_id: row.id,
    title: row.title,
    description: row.description || null,
    start: row.due_at,
    end,
    status: row.status,
    computed_status: computedStatus,
    customer_id: row.customer_id,
    customer_name: row.customer_name || null,
    employee_id: row.assigned_employee_id,
    employee_name: row.assigned_employee || null,
    branch_id: row.branch_id,
    branch_name: row.branch_name || null,
    overdue: computedStatus === 'overdue',
  };
}
