import assert from 'node:assert/strict';
import {
  rangeForView, monthMatrix, weekDays, eventsForDay, isOnDay,
  computeDragMove, computeResize, slotDateTime, startOfWeek,
} from './calendarEvents.js';

// --- startOfWeek / weekDays: Monday-first ---
{
  // 2030-01-02 is a Wednesday.
  const monday = startOfWeek(new Date('2030-01-02T15:00:00'));
  assert.equal(monday.getDay(), 1, 'startOfWeek should land on a Monday');
  const days = weekDays(new Date('2030-01-02T00:00:00'));
  assert.equal(days.length, 7);
  assert.equal(days[0].getDay(), 1);
  assert.equal(days[6].getDay(), 0);
}

// --- rangeForView ---
{
  const { from, to } = rangeForView('day', new Date('2030-03-15T10:00:00'));
  assert.equal(to.getTime() - from.getTime(), 86400000);
}
{
  const { from, to } = rangeForView('week', new Date('2030-03-15T10:00:00'));
  assert.equal(to.getTime() - from.getTime(), 7 * 86400000);
  assert.equal(from.getDay(), 1);
}
{
  // Month view pads to full weeks, so the range is always a multiple of 7 days.
  const { from, to } = rangeForView('month', new Date('2030-02-10T00:00:00'));
  assert.equal((to.getTime() - from.getTime()) % (7 * 86400000), 0);
  assert.ok(from <= new Date('2030-02-01'));
  assert.ok(to >= new Date('2030-03-01'));
}

// --- monthMatrix: 6 weeks x 7 days, in/out-of-month flags ---
{
  const weeks = monthMatrix(new Date('2030-02-10T00:00:00'));
  assert.equal(weeks.length * 7, weeks.flat().length);
  for (const week of weeks) assert.equal(week.length, 7);
  const flat = weeks.flat();
  assert.ok(flat.some((c) => c.inMonth && c.date.getDate() === 1 && c.date.getMonth() === 1));
  assert.ok(flat.some((c) => !c.inMonth));
}

// --- eventsForDay: overlap filtering, including follow-ups (point events) ---
// Uses local-time strings throughout (both the events and the queried day)
// so the comparison is timezone-agnostic — event instants and day boundaries
// are computed from the same local calendar, exactly as Calendar.jsx does.
{
  const events = [
    { id: 'a', start: '2030-01-05T09:00:00', end: '2030-01-05T09:30:00' },
    { id: 'b', start: '2030-01-05T23:30:00', end: '2030-01-06T00:30:00' }, // spans midnight
    { id: 'c', start: '2030-01-06T10:00:00', end: '2030-01-06T11:00:00' },
  ];
  const day5 = eventsForDay(events, new Date('2030-01-05T00:00:00'));
  assert.deepEqual(day5.map((e) => e.id), ['a', 'b']);
  const day6 = eventsForDay(events, new Date('2030-01-06T00:00:00'));
  assert.deepEqual(day6.map((e) => e.id), ['b', 'c']);
}
assert.equal(isOnDay({ start: '2030-01-05T09:00:00' }, new Date('2030-01-05T22:00:00')), true);
assert.equal(isOnDay({ start: '2030-01-05T09:00:00' }, new Date('2030-01-06T00:00:00')), false);

// --- computeDragMove: preserves duration, moves to the new start ---
{
  const event = { start: '2030-01-05T09:00:00.000Z', end: '2030-01-05T10:30:00.000Z' };
  const moved = computeDragMove(event, new Date('2030-01-10T14:00:00.000Z'));
  assert.equal(moved.start, '2030-01-10T14:00:00.000Z');
  assert.equal(moved.end, '2030-01-10T15:30:00.000Z');
}
{
  // Follow-ups are point events (start === end going in); drag just moves the point.
  const event = { start: '2030-01-05T09:00:00.000Z', end: '2030-01-05T09:00:00.000Z' };
  const moved = computeDragMove(event, new Date('2030-01-06T08:00:00.000Z'));
  assert.equal(moved.start, moved.end);
}

// --- computeResize: keeps start fixed, clamps to a minimum duration ---
{
  const event = { start: '2030-01-05T09:00:00.000Z', end: '2030-01-05T10:00:00.000Z' };
  const resized = computeResize(event, new Date('2030-01-05T11:00:00.000Z'));
  assert.equal(resized.start, event.start);
  assert.equal(resized.end, '2030-01-05T11:00:00.000Z');
}
{
  const event = { start: '2030-01-05T09:00:00.000Z', end: '2030-01-05T10:00:00.000Z' };
  // Dragging the resize handle above the minimum duration clamps instead of inverting.
  const resized = computeResize(event, new Date('2030-01-05T09:05:00.000Z'), 15);
  assert.equal(resized.end, '2030-01-05T09:15:00.000Z');
}

// --- slotDateTime: snaps a click offset within a day column to a step ---
{
  const dt = slotDateTime(new Date('2030-01-05T00:00:00'), 97, 30);
  assert.equal(dt.getHours(), 1);
  assert.equal(dt.getMinutes(), 30);
}

console.log('calendarEvents tests passed');
