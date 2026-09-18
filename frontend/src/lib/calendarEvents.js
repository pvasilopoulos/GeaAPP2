// Pure calendar-grid helpers shared by frontend/src/pages/Calendar.jsx.
// Kept dependency-free (no date library) and side-effect-free so they can be
// unit tested directly (see calendarEvents.test.mjs).

const DAY_MS = 86400000;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Monday-first start of the week containing `date`. */
export function startOfWeek(date) {
  const d = startOfDay(date);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  return addDays(d, -dow);
}

/** Inclusive-exclusive [from, to) range to fetch for a given view + anchor date. */
export function rangeForView(view, anchorDate) {
  const day = startOfDay(anchorDate);
  if (view === 'day') {
    return { from: day, to: addDays(day, 1) };
  }
  if (view === 'week') {
    const from = startOfWeek(day);
    return { from, to: addDays(from, 7) };
  }
  // Month view: pad to full weeks (Mon-Sun) so the grid has no gaps.
  const monthStart = new Date(day.getFullYear(), day.getMonth(), 1);
  const monthEnd = new Date(day.getFullYear(), day.getMonth() + 1, 1);
  const from = startOfWeek(monthStart);
  const gridEnd = addDays(startOfWeek(addDays(monthEnd, -1)), 7);
  return { from, to: gridEnd };
}

/** 6 rows x 7 days grid for month view, each cell flagged in/out of month. */
export function monthMatrix(anchorDate) {
  const { from, to } = rangeForView('month', anchorDate);
  const days = [];
  for (let d = from; d < to; d = addDays(d, 1)) {
    days.push({ date: d, inMonth: d.getMonth() === anchorDate.getMonth() });
  }
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

/** The 7 dates (Mon-Sun) of the week containing `anchorDate`. */
export function weekDays(anchorDate) {
  const from = startOfWeek(anchorDate);
  return Array.from({ length: 7 }, (_, i) => addDays(from, i));
}

function sameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/** Events whose [start, end) span overlaps the given calendar day. */
export function eventsForDay(events, date) {
  const dayStart = startOfDay(date).getTime();
  const dayEnd = dayStart + DAY_MS;
  return events.filter((e) => {
    const start = new Date(e.start).getTime();
    const end = new Date(e.end || e.start).getTime();
    return start < dayEnd && end > dayStart;
  }).sort((a, b) => new Date(a.start) - new Date(b.start));
}

/** True when a follow-up/booking event is on the exact calendar day (used for month cells). */
export function isOnDay(event, date) {
  return sameDay(event.start, date);
}

/**
 * Applies a drag-to-reschedule: moves an event to `newStart`, preserving its
 * original duration. Returns the new `{ start, end }` ISO strings to send to
 * the backend (booking PATCH uses both; follow-up PATCH only needs `start`
 * as the new due_at).
 */
export function computeDragMove(event, newStart) {
  const oldStart = new Date(event.start);
  const oldEnd = new Date(event.end || event.start);
  const durationMs = Math.max(oldEnd.getTime() - oldStart.getTime(), 0);
  const start = new Date(newStart);
  const end = new Date(start.getTime() + durationMs);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Applies a resize (dragging a booking's bottom edge): keeps `start` fixed
 * and clamps `newEnd` to at least `minMinutes` after start.
 */
export function computeResize(event, newEnd, minMinutes = 15) {
  const start = new Date(event.start);
  const minEnd = new Date(start.getTime() + minMinutes * 60000);
  const end = new Date(newEnd);
  return { start: start.toISOString(), end: (end < minEnd ? minEnd : end).toISOString() };
}

/** Maps a click position within a day column (week/day view) to a date-time, snapped to `stepMinutes`. */
export function slotDateTime(day, offsetMinutes, stepMinutes = 30) {
  const snapped = Math.round(offsetMinutes / stepMinutes) * stepMinutes;
  const d = startOfDay(day);
  d.setMinutes(snapped);
  return d;
}

export const HOUR_RANGE = { start: 7, end: 21 }; // 07:00-21:00 displayed in week/day grids
