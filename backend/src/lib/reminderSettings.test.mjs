import assert from 'node:assert/strict';
import {
  DEFAULT_REMINDER_SETTINGS, mergeReminderSettings, applyReminderSettingsPatch,
  computeReminderState, isWorkingMoment,
} from './reminderSettings.js';

// Defaults + idempotent merge (merging defaults again is a no-op).
const merged = mergeReminderSettings(null);
assert.deepEqual(merged, DEFAULT_REMINDER_SETTINGS);
assert.deepEqual(mergeReminderSettings(merged), merged);

// Invalid/garbage input falls back to safe defaults instead of throwing.
const sanitized = mergeReminderSettings({
  enabled: 'yes', // truthy, not a bool
  defaultTime: 'not-a-time',
  defaultLeadMinutes: -5,
  workingDays: ['x', 1, 1, 9, 3],
  workingHoursStart: '25:99',
  overdueBehavior: 'nonsense',
  channels: ['email', 'carrier_pigeon'],
  snoozeMinutesOptions: [0, -10, 30, 30],
});
assert.equal(sanitized.enabled, true);
assert.equal(sanitized.defaultTime, DEFAULT_REMINDER_SETTINGS.defaultTime);
assert.equal(sanitized.defaultLeadMinutes, DEFAULT_REMINDER_SETTINGS.defaultLeadMinutes);
assert.deepEqual(sanitized.workingDays, [1, 3]);
assert.equal(sanitized.workingHoursStart, DEFAULT_REMINDER_SETTINGS.workingHoursStart);
assert.equal(sanitized.overdueBehavior, 'always');
assert.deepEqual(sanitized.channels, ['email']);
assert.deepEqual(sanitized.snoozeMinutesOptions, [30]);

// Patch applies only provided keys, keeping the rest merged with defaults.
const patched = applyReminderSettingsPatch({ enabled: true, defaultLeadMinutes: 30 }, { enabled: false });
assert.equal(patched.enabled, false);
assert.equal(patched.defaultLeadMinutes, 30);

// computeReminderState: terminal statuses pass through unchanged.
assert.equal(computeReminderState('2020-01-01T00:00:00Z', 'completed'), 'completed');
assert.equal(computeReminderState('2020-01-01T00:00:00Z', 'cancelled'), 'cancelled');

// Upcoming vs due_soon based on lead time.
const now = new Date('2030-06-10T12:00:00Z');
const settings = mergeReminderSettings({ defaultLeadMinutes: 60 });
assert.equal(computeReminderState('2030-06-10T12:30:00Z', 'open', settings, now), 'due_soon');
assert.equal(computeReminderState('2030-06-12T12:00:00Z', 'open', settings, now), 'upcoming');

// Past due + 'always' overdue behavior => immediately overdue.
assert.equal(computeReminderState('2030-06-10T11:00:00Z', 'open', settings, now), 'overdue');

// Past due + 'respect_working_hours' outside the working calendar => stays
// due_soon instead of overdue until a working moment passes.
const weekendSettings = mergeReminderSettings({ overdueBehavior: 'respect_working_hours', workingDays: [1, 2, 3, 4, 5] });
const saturdayNoon = new Date('2030-06-15T12:00:00Z'); // a Saturday
assert.equal(computeReminderState('2030-06-14T09:00:00Z', 'open', weekendSettings, saturdayNoon, 'UTC'), 'due_soon');

// ...but during working hours on a working day it does flip to overdue.
const mondayMorning = new Date('2030-06-17T10:00:00Z'); // a Monday, 10:00 UTC
assert.equal(computeReminderState('2030-06-14T09:00:00Z', 'open', weekendSettings, mondayMorning, 'UTC'), 'overdue');

// isWorkingMoment sanity checks.
assert.equal(isWorkingMoment(mondayMorning, weekendSettings, 'UTC'), true);
assert.equal(isWorkingMoment(saturdayNoon, weekendSettings, 'UTC'), false);

console.log('reminderSettings tests passed');
