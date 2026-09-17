// Advanced reminders / follow-up notification preferences, tenant scoped.
// Stored inside the same `tenants.settings` JSON blob as messaging/app
// settings (see tenantSettings.js) so no dedicated table/migration is needed.

export const REMINDER_CHANNELS = ['in_app', 'email', 'sms', 'viber', 'telegram'];
export const OVERDUE_BEHAVIORS = ['always', 'respect_working_hours'];
export const LEAD_MINUTES_CHOICES = [15, 30, 60, 120, 240, 1440, 2880];
export const SNOOZE_MINUTES_CHOICES = [15, 30, 60, 240, 1440, 2880];

export const DEFAULT_REMINDER_SETTINGS = {
  enabled: true,
  // Wall-clock time (HH:MM) applied when a reminder is created without an
  // explicit time (date-only input).
  defaultTime: '09:00',
  // How long before `due_at` a reminder should be surfaced as "due soon".
  defaultLeadMinutes: 60,
  leadMinutesOptions: [15, 60, 240, 1440],
  // Working calendar used by the `respect_working_hours` overdue behavior.
  workingDays: [1, 2, 3, 4, 5], // 0 = Sunday ... 6 = Saturday
  workingHoursStart: '09:00',
  workingHoursEnd: '18:00',
  // 'always': a past-due open reminder is immediately "overdue".
  // 'respect_working_hours': stays "due_soon" outside the working calendar
  // and only flips to "overdue" once a working moment has passed.
  overdueBehavior: 'always',
  snoozeMinutesOptions: [15, 60, 240, 1440],
  channels: ['in_app'],
  // When true, only the assigned employee (not every user) is notified.
  notifyAssigneeOnly: true,
};

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function isHM(v) {
  return typeof v === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(v);
}

function sanitizeHM(v, fallback) {
  return isHM(v) ? v : fallback;
}

function sanitizeDays(v, fallback) {
  if (!Array.isArray(v)) return fallback;
  const days = [...new Set(v.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
  return days.length ? days.sort((a, b) => a - b) : fallback;
}

function sanitizeMinutesList(v, fallback) {
  if (!Array.isArray(v)) return fallback;
  const mins = [...new Set(v.map((n) => Math.round(Number(n))).filter((n) => Number.isFinite(n) && n > 0 && n <= 10080))];
  return mins.length ? mins.sort((a, b) => a - b) : fallback;
}

function sanitizeChannels(v, fallback) {
  if (!Array.isArray(v)) return fallback;
  const ch = v.filter((c) => REMINDER_CHANNELS.includes(c));
  return ch.length ? [...new Set(ch)] : fallback;
}

export function mergeReminderSettings(raw) {
  const src = asObject(raw);
  const defaultLeadMinutes = Number(src.defaultLeadMinutes);
  return {
    ...DEFAULT_REMINDER_SETTINGS,
    enabled: src.enabled === undefined ? DEFAULT_REMINDER_SETTINGS.enabled : !!src.enabled,
    defaultTime: sanitizeHM(src.defaultTime, DEFAULT_REMINDER_SETTINGS.defaultTime),
    defaultLeadMinutes: Number.isFinite(defaultLeadMinutes) && defaultLeadMinutes > 0
      ? Math.min(10080, defaultLeadMinutes)
      : DEFAULT_REMINDER_SETTINGS.defaultLeadMinutes,
    leadMinutesOptions: sanitizeMinutesList(src.leadMinutesOptions, DEFAULT_REMINDER_SETTINGS.leadMinutesOptions),
    workingDays: sanitizeDays(src.workingDays, DEFAULT_REMINDER_SETTINGS.workingDays),
    workingHoursStart: sanitizeHM(src.workingHoursStart, DEFAULT_REMINDER_SETTINGS.workingHoursStart),
    workingHoursEnd: sanitizeHM(src.workingHoursEnd, DEFAULT_REMINDER_SETTINGS.workingHoursEnd),
    overdueBehavior: OVERDUE_BEHAVIORS.includes(src.overdueBehavior) ? src.overdueBehavior : DEFAULT_REMINDER_SETTINGS.overdueBehavior,
    snoozeMinutesOptions: sanitizeMinutesList(src.snoozeMinutesOptions, DEFAULT_REMINDER_SETTINGS.snoozeMinutesOptions),
    channels: sanitizeChannels(src.channels, DEFAULT_REMINDER_SETTINGS.channels),
    notifyAssigneeOnly: src.notifyAssigneeOnly === undefined ? DEFAULT_REMINDER_SETTINGS.notifyAssigneeOnly : !!src.notifyAssigneeOnly,
  };
}

export function applyReminderSettingsPatch(current, patch) {
  const merged = mergeReminderSettings(current);
  const src = asObject(patch);
  return mergeReminderSettings({ ...merged, ...src });
}

export function publicReminderSettings(raw) {
  return mergeReminderSettings(raw);
}

/** Weekday (0-6) and HH:MM wall-clock time for `date` in the given IANA timezone. */
function partsInTimeZone(date, timeZone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const hour = map.hour === '24' ? 0 : Number(map.hour);
    return { day: WEEKDAYS[map.weekday], hour, minute: Number(map.minute) };
  } catch {
    return { day: date.getUTCDay(), hour: date.getUTCHours(), minute: date.getUTCMinutes() };
  }
}

/** Whether `date` falls within the tenant's configured working days/hours. */
export function isWorkingMoment(date, settings, timezone = 'UTC') {
  const s = mergeReminderSettings(settings);
  if (!s.workingDays.length) return true;
  const { day, hour, minute } = partsInTimeZone(date, timezone);
  if (!s.workingDays.includes(day)) return false;
  const [startH, startM] = s.workingHoursStart.split(':').map(Number);
  const [endH, endM] = s.workingHoursEnd.split(':').map(Number);
  const minutes = hour * 60 + minute;
  return minutes >= startH * 60 + startM && minutes <= endH * 60 + endM;
}

/**
 * Rich reminder state used by dashboard/customer-card UI:
 * 'completed' | 'cancelled' | 'due_soon' | 'overdue' | 'upcoming'.
 * Falls back to plain due_at comparison when settings/timezone are omitted.
 */
export function computeReminderState(dueAt, status = 'open', settings = DEFAULT_REMINDER_SETTINGS, now = new Date(), timezone = 'UTC') {
  if (status !== 'open') return status;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return 'open';
  const s = mergeReminderSettings(settings);
  const diffMs = due.getTime() - now.getTime();
  if (diffMs > 0) {
    const leadMs = s.defaultLeadMinutes * 60000;
    return diffMs <= leadMs ? 'due_soon' : 'upcoming';
  }
  if (s.overdueBehavior === 'respect_working_hours' && !isWorkingMoment(now, s, timezone)) {
    return 'due_soon';
  }
  return 'overdue';
}
