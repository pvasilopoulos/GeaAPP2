// Admin-defined automatic notification rules — the "v2" engine: "when
// <event happens> OR <a scheduled moment relative to a date field arrives>,
// and <conditions> match, notify <recipients> via <channels>, optionally run
// <extra actions>, escalate if unacknowledged, and respect quiet hours /
// digest batching." This is now the SOLE source of automated notifications:
// every event site (route handlers, sweep* functions in notifications.js,
// sync.js/pushSync.js failure paths) calls evaluateNotificationRules(eventKey,
// ctx) exclusively — there is no parallel hardcoded notification pipeline
// anymore. If zero rules match/are enabled for an event, nothing is sent.
//
// Two trigger types (`notification_rules.trigger_type`):
//  - 'event'    → fired synchronously from route handlers / the existing
//                 sweep* functions via evaluateNotificationRules(eventKey, ctx).
//  - 'schedule' → fired by sweepScheduleTriggers(), which periodically scans
//                 the entities in scheduleEntities.js for rows whose
//                 (date field + offset) instant has just arrived.
// Both converge on the same dispatchRule() so recipients/channels/templates/
// throttle/quiet-hours/digest/escalation/extra-actions work identically.
//
// Five channels (`notification_rules.channels`):
//  - `app`   → in-app inbox entry + Web Push mirror (reuses createNotification,
//              which already couples the two — see notifications.js).
//  - email/sms/viber/telegram → lib/messaging.js's deliverMessage(), using
//    the tenant's configured messaging providers and the recipient's
//    users.email / users.phone / users.telegram_chat_id.
import { query as dbQuery } from '../db.js';
import { createNotification, sanitizeRichPush, userIdForEmployee } from './notifications.js';
import { mergeMessaging, deliverMessage } from './messaging.js';
import { mergeTenantSettings } from './tenantSettings.js';
import { EVENT_CATALOG } from './notificationEvents.js';
import { SCHEDULE_ENTITIES } from './scheduleEntities.js';

export const ALL_CHANNELS = ['app', 'email', 'sms', 'viber', 'viber_routee', 'telegram'];

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return fallback;
}

function getPathValue(context, path) {
  return String(path).split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), context);
}

const OPERATORS = {
  eq: (a, b) => String(a ?? '') === String(b ?? ''),
  neq: (a, b) => String(a ?? '') !== String(b ?? ''),
  gt: (a, b) => Number(a) > Number(b),
  gte: (a, b) => Number(a) >= Number(b),
  lt: (a, b) => Number(a) < Number(b),
  lte: (a, b) => Number(a) <= Number(b),
  contains: (a, b) => String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase()),
  changed_to: (a, b) => String(a ?? '') === String(b ?? ''), // evaluated against context.toStatus by convention
  changed_from: (a, b) => String(a ?? '') === String(b ?? ''), // evaluated against context.fromStatus by convention
};

function evaluateConditionList(list, context) {
  return list.every(({ field, operator, value }) => {
    const op = OPERATORS[operator];
    if (!op || !field) return true;
    return op(getPathValue(context, field), value);
  });
}

/**
 * All conditions must match (AND) — an empty/missing list always matches.
 * Also supports condition GROUPS: pass an array-of-arrays (each inner array
 * is an AND-group) plus `logic = 'or'` to OR the groups together, e.g.
 * `evaluateConditions([[{...}, {...}], [{...}]], ctx, 'or')` matches when
 * either group fully matches. `logic` defaults to 'and' (groups all AND'd),
 * and a flat (non-grouped) list is treated exactly as before.
 */
export function evaluateConditions(conditions, context, logic = 'and') {
  const list = Array.isArray(conditions) ? conditions : [];
  if (!list.length) return true;
  const isGrouped = list.every((item) => Array.isArray(item));
  if (isGrouped) {
    const results = list.map((group) => evaluateConditionList(group, context));
    return logic === 'or' ? results.some(Boolean) : results.every(Boolean);
  }
  return evaluateConditionList(list, context);
}

/** Renders `{{field}}` / `{{a.b}}` placeholders in a plain-text template as strings (not JSON). */
export function renderTemplate(template, context) {
  if (!template) return '';
  return String(template).replace(/\{\{\s*([\w.]+)\s*}}/g, (_match, path) => {
    const value = getPathValue(context, path);
    return value == null ? '' : String(value);
  });
}

function isWithinQuietHours(startTime, endTime) {
  if (!startTime || !endTime) return false;
  const toMinutes = (t) => {
    const [h, m] = String(t).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start === end) return false;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  return start < end ? (cur >= start && cur < end) : (cur >= start || cur < end); // wraps past midnight
}

async function resolveStaticRecipients(rule, tenantId, queryFn) {
  if (rule.recipient_type === 'all') {
    const { rows } = await queryFn('SELECT id FROM users WHERE tenant_id = ? AND is_active = 1', [tenantId]);
    return rows.map((r) => Number(r.id));
  }
  if (rule.recipient_type === 'role') {
    if (!rule.recipient_role_id) return [];
    const { rows } = await queryFn(
      'SELECT id FROM users WHERE tenant_id = ? AND is_active = 1 AND role_id = ?',
      [tenantId, rule.recipient_role_id],
    );
    return rows.map((r) => Number(r.id));
  }
  if (rule.recipient_type === 'users') {
    const ids = [...new Set((parseJson(rule.recipient_ids, []) || []).map(Number).filter(Boolean))];
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    const { rows } = await queryFn(
      `SELECT id FROM users WHERE tenant_id = ? AND is_active = 1 AND id IN (${placeholders})`,
      [tenantId, ...ids],
    );
    return rows.map((r) => Number(r.id));
  }
  return [];
}

/** Dynamic recipient: resolved from the event/entity context rather than a fixed list. */
async function resolveDynamicRecipient(rule, context) {
  if (rule.recipient_dynamic === 'assigned_user') {
    if (context.assignedUserId) return [Number(context.assignedUserId)];
    if (context.assignedEmployeeId) {
      const userId = await userIdForEmployee(context.tenantId, context.assignedEmployeeId, dbQuery);
      return userId ? [Number(userId)] : [];
    }
    return [];
  }
  if (rule.recipient_dynamic === 'created_by' && context.createdByUserId) return [Number(context.createdByUserId)];
  if (rule.recipient_dynamic === 'seller') {
    if (context.sellerUserId) return [Number(context.sellerUserId)];
    if (context.sellerEmployeeId) {
      const userId = await userIdForEmployee(context.tenantId, context.sellerEmployeeId, dbQuery);
      return userId ? [Number(userId)] : [];
    }
    return [];
  }
  return [];
}

async function isThrottled(ruleId, userId, throttleSeconds, queryFn) {
  if (!throttleSeconds) return false;
  const { rows } = await queryFn(
    'SELECT last_fired_at FROM notification_rule_throttle WHERE rule_id = ? AND user_id = ?',
    [ruleId, userId],
  );
  if (!rows.length) return false;
  const elapsedMs = Date.now() - new Date(rows[0].last_fired_at).getTime();
  return elapsedMs < throttleSeconds * 1000;
}

async function recordFired(ruleId, userId, queryFn) {
  await queryFn(
    `INSERT INTO notification_rule_throttle (rule_id, user_id, last_fired_at) VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE last_fired_at = NOW()`,
    [ruleId, userId],
  );
}

/** Per-user channel preferences for one event; missing row = enabled (opt-out model). */
async function loadPreferenceOverrides(tenantId, userId, eventKey, queryFn) {
  const { rows } = await queryFn(
    'SELECT channel, enabled FROM notification_preferences WHERE tenant_id = ? AND user_id = ? AND event_key = ?',
    [tenantId, userId, eventKey],
  );
  const map = new Map(rows.map((r) => [r.channel, !!r.enabled]));
  return (channel) => map.has(channel) ? map.get(channel) : true;
}

async function loadQuietHours(tenantId, userId, queryFn) {
  const { rows } = await queryFn(
    'SELECT quiet_hours_start, quiet_hours_end FROM users WHERE id = ? AND tenant_id = ?',
    [userId, tenantId],
  );
  const row = rows[0];
  if (!row || !row.quiet_hours_start || !row.quiet_hours_end) return null;
  return { start: row.quiet_hours_start, end: row.quiet_hours_end };
}

async function loadMessagingCfg(tenantId, queryFn) {
  const { rows } = await queryFn('SELECT settings FROM tenants WHERE id = ?', [tenantId]);
  return mergeMessaging(mergeTenantSettings(parseJson(rows[0]?.settings, {})).messaging);
}

async function recordRun(queryFn, { tenantId, ruleId, recipientUserId, channel, status, reason, entityId }) {
  await queryFn(
    `INSERT INTO notification_rule_runs (tenant_id, rule_id, recipient_user_id, channel, status, reason, entity_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, ruleId, recipientUserId ?? null, channel ?? null, status, reason ?? null, entityId != null ? String(entityId) : null],
  ).catch(() => {});
}

async function deliverToChannel(channel, { tenantId, userId, title, body, url, rich, messagingCfg }, queryFn) {
  if (channel === 'app') {
    const pushOverrides = {
      icon: rich.iconUrl || undefined,
      badge: rich.badgeUrl || undefined,
      image: rich.imageUrl || undefined,
      actions: rich.actions?.length ? rich.actions : undefined,
      requireInteraction: rich.requireInteraction || undefined,
      silent: rich.silent || undefined,
      vibrate: rich.vibrate ? rich.vibrate.split(',').map(Number) : undefined,
      tag: rich.tag || undefined,
      renotify: rich.renotify || undefined,
      ttl: rich.ttlSeconds,
      urgency: rich.urgency,
    };
    const created = await createNotification({
      tenantId, userId, type: `rule_${rich.ruleId}`, title, body,
      sourceType: 'notification_rule', sourceId: rich.sourceId,
      payload: url ? { url } : null, push: pushOverrides,
    }, queryFn);
    return created.inserted;
  }
  const { rows } = await queryFn('SELECT email, phone, telegram_chat_id FROM users WHERE id = ? AND tenant_id = ?', [userId, tenantId]);
  const user = rows[0];
  if (!user) return false;
  const to = channel === 'email' ? user.email : channel === 'telegram' ? user.telegram_chat_id : user.phone;
  if (!to) return false;
  const result = await deliverMessage(channel, messagingCfg[channel], { to, subject: title, body: [title, body].filter(Boolean).join('\n\n') });
  return result.status === 'sent';
}

/** Executes a rule's extra (non-notification) actions once it has fired for at least one recipient. */
async function runExtraActions(rule, context, queryFn) {
  const actions = parseJson(rule.extra_actions, []);
  if (!Array.isArray(actions) || !actions.length) return;
  for (const action of actions) {
    try {
      if (action.type === 'create_follow_up' && context.customerId) {
        await queryFn(
          `INSERT INTO follow_ups (tenant_id, customer_id, title, due_at, assigned_employee_id, status, created_at)
           VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), ?, 'open', NOW())`,
          [
            context.tenantId, context.customerId,
            renderTemplate(action.title, context).slice(0, 200) || 'Follow-up από κανόνα ειδοποίησης',
            Number(action.dueInDays) || 1,
            context.assignedEmployeeId ?? null,
          ],
        );
      } else if (action.type === 'add_tag' && context.customerId && action.tagId) {
        await queryFn(
          'INSERT IGNORE INTO customer_tags (customer_id, tag_id) VALUES (?, ?)',
          [context.customerId, Number(action.tagId)],
        );
      } else if (action.type === 'webhook' && action.url) {
        await fetch(action.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rule: rule.name, ruleId: rule.id, eventKey: rule.event_key, context }),
        }).catch((err) => console.error(`[notificationRules] webhook action failed rule=${rule.id}:`, err.message));
      }
    } catch (err) {
      console.error(`[notificationRules] extra action failed rule=${rule.id} type=${action?.type}:`, err.message);
    }
  }
}

/**
 * Resolves recipients + channels for one already-matched rule and delivers
 * to every recipient×channel, honoring throttle, per-user opt-out
 * preferences, quiet hours, digest batching, and dry-run — logging every
 * outcome to notification_rule_runs. Shared by both the event-based flow
 * (evaluateNotificationRules) and the schedule-based flow
 * (sweepScheduleTriggers). Never throws.
 */
export async function dispatchRule(rule, context, queryFn = dbQuery) {
  const tenantId = context.tenantId;
  try {
    const userIds = [...new Set((
      rule.recipient_type === 'dynamic'
        ? await resolveDynamicRecipient(rule, { ...context, tenantId })
        : await resolveStaticRecipients(rule, tenantId, queryFn)
    ).filter(Boolean))];
    if (!userIds.length) return { fired: 0 };

    const channels = (parseJson(rule.channels, []) || []).filter((c) => ALL_CHANNELS.includes(c));
    if (!channels.length) return { fired: 0 };

    const messagingCfg = channels.some((c) => c !== 'app') ? await loadMessagingCfg(tenantId, queryFn) : null;
    const rich = {
      ...sanitizeRichPush({ ...rule, actions: parseJson(rule.actions, []) }),
      ruleId: rule.id,
      sourceId: context.entityId ?? rule.id,
    };
    const title = renderTemplate(rule.title_template, context).slice(0, 200) || 'Ειδοποίηση';
    const body = renderTemplate(rule.body_template, context).slice(0, 1000);
    const url = renderTemplate(rule.url_template, context).slice(0, 500);
    const prefsEventKey = rule.event_key || `schedule_${rule.id}`;

    let fired = 0;
    for (const userId of userIds) {
      if (await isThrottled(rule.id, userId, rule.throttle_seconds, queryFn)) {
        await recordRun(queryFn, { tenantId, ruleId: rule.id, recipientUserId: userId, status: 'throttled', entityId: context.entityId });
        continue;
      }
      const isChannelEnabled = await loadPreferenceOverrides(tenantId, userId, prefsEventKey, queryFn);
      const quiet = rule.respect_quiet_hours ? await loadQuietHours(tenantId, userId, queryFn) : null;
      let anySent = false;
      for (const channel of channels) {
        if (!isChannelEnabled(channel)) {
          await recordRun(queryFn, { tenantId, ruleId: rule.id, recipientUserId: userId, channel, status: 'opted_out', entityId: context.entityId });
          continue;
        }
        if (quiet && channel !== 'email' && rule.priority !== 'urgent' && isWithinQuietHours(quiet.start, quiet.end)) {
          await recordRun(queryFn, { tenantId, ruleId: rule.id, recipientUserId: userId, channel, status: 'quiet_hours', entityId: context.entityId });
          continue;
        }
        if (rule.digest_mode && rule.digest_mode !== 'none') {
          await queryFn(
            `INSERT INTO notification_digest_queue (tenant_id, rule_id, user_id, channel, title, body, url) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [tenantId, rule.id, userId, channel, title, body || null, url || null],
          );
          await recordRun(queryFn, { tenantId, ruleId: rule.id, recipientUserId: userId, channel, status: 'queued_digest', entityId: context.entityId });
          anySent = true;
          continue;
        }
        if (rule.dry_run) {
          await recordRun(queryFn, { tenantId, ruleId: rule.id, recipientUserId: userId, channel, status: 'dry_run', entityId: context.entityId });
          anySent = true;
          continue;
        }
        const ok = await deliverToChannel(channel, { tenantId, userId, title, body, url, rich, messagingCfg }, queryFn).catch((err) => {
          console.error(`[notificationRules] delivery failed rule=${rule.id} channel=${channel}:`, err.message);
          return false;
        });
        await recordRun(queryFn, { tenantId, ruleId: rule.id, recipientUserId: userId, channel, status: ok ? 'sent' : 'failed', entityId: context.entityId });
        if (ok) anySent = true;
      }
      if (anySent) {
        fired += 1;
        if (rule.throttle_seconds) await recordFired(rule.id, userId, queryFn);
        const escalation = parseJson(rule.escalation, null);
        if (escalation && Number(escalation.afterMinutes) > 0) {
          await queryFn(
            `INSERT INTO notification_rule_escalations (tenant_id, rule_id, entity_id, recipient_user_id, title, body, url)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [tenantId, rule.id, context.entityId != null ? String(context.entityId) : null, userId, title, body || null, url || null],
          );
        }
      }
    }
    if (fired > 0) await runExtraActions(rule, { ...context, tenantId }, queryFn);
    await queryFn(
      'UPDATE notification_rules SET last_fired_at = NOW(), fired_count = fired_count + 1 WHERE id = ?',
      [rule.id],
    ).catch(() => {});
    return { fired };
  } catch (err) {
    console.error(`[notificationRules] dispatchRule failed rule=${rule.id}:`, err.message);
    return { fired: 0, error: err.message };
  }
}

/**
 * Fires every enabled EVENT-based rule for `eventKey` whose conditions match
 * `context`. `context` must include `tenantId` and, for dynamic recipients,
 * whichever of `assignedUserId`/`assignedEmployeeId`/`createdByUserId`/
 * `sellerUserId`/`sellerEmployeeId` applies to the event — plus `entityId`,
 * a stable id used as the in-app dedupe key. Always resolves (never
 * throws) — callers should still `.catch()` for safety.
 */
export async function evaluateNotificationRules(eventKey, context, queryFn = dbQuery) {
  try {
    const tenantId = context?.tenantId;
    if (!tenantId || !EVENT_CATALOG[eventKey]) return { fired: 0 };
    const { rows: rules } = await queryFn(
      `SELECT * FROM notification_rules WHERE tenant_id = ? AND event_key = ? AND enabled = 1 AND (trigger_type = 'event' OR trigger_type IS NULL)`,
      [tenantId, eventKey],
    );
    if (!rules.length) return { fired: 0 };
    let fired = 0;
    for (const rule of rules) {
      const conditions = parseJson(rule.conditions, []);
      if (!evaluateConditions(conditions, context, rule.condition_logic || 'and')) continue;
      const result = await dispatchRule(rule, context, queryFn);
      fired += result.fired;
    }
    return { fired };
  } catch (err) {
    console.error(`[notificationRules] evaluate failed for event=${eventKey}:`, err.message);
    return { fired: 0, error: err.message };
  }
}

/**
 * Scans every enabled SCHEDULE-based rule against its target entity table
 * for rows whose (date field + offset) instant has just arrived (within a
 * short trailing window, so a periodic sweep never misses or double-fires
 * one), and dispatches those that still match the rule's conditions.
 * Dedup'd per (rule, entity row, fired_key) via notification_schedule_fired
 * so the same due-instance never fires twice — `fired_key` is 'once' for
 * schedule_recurrence='once' or today's date for 'recurring' (fires at most
 * once per calendar day while the row stays eligible, e.g. a stale customer
 * that's still inactive tomorrow gets nagged again).
 */
export async function sweepScheduleTriggers(queryFn = dbQuery, windowMinutes = 15) {
  try {
    const { rows: rules } = await queryFn(
      "SELECT * FROM notification_rules WHERE enabled = 1 AND trigger_type = 'schedule'",
    );
    let fired = 0;
    for (const rule of rules) {
      const entity = SCHEDULE_ENTITIES[rule.schedule_entity];
      const field = entity?.dateFields?.[rule.schedule_date_field];
      if (!entity || !field) continue;
      const offsetMinutes = Number(rule.schedule_offset_minutes) || 0;
      const sql = `SELECT ${entity.select},
                     TIMESTAMPDIFF(MINUTE, DATE_ADD(${field.expr}, INTERVAL ? MINUTE), NOW()) AS diff_min
                   FROM ${entity.table} ${entity.joins || ''}
                   WHERE ${entity.activeFilter} AND ${field.expr} IS NOT NULL
                   HAVING diff_min >= 0 AND diff_min < ?`;
      const { rows } = await queryFn(sql, [offsetMinutes, windowMinutes]).catch((err) => {
        console.error(`[notificationRules] schedule scan failed rule=${rule.id}:`, err.message);
        return { rows: [] };
      });
      for (const row of rows) {
        const entityId = String(row.id);
        const firedKey = rule.schedule_recurrence === 'recurring' ? new Date().toISOString().slice(0, 10) : 'once';
        const { rows: already } = await queryFn(
          'SELECT 1 FROM notification_schedule_fired WHERE rule_id = ? AND entity_id = ? AND fired_key = ?',
          [rule.id, entityId, firedKey],
        );
        if (already.length) continue;
        const context = { tenantId: Number(row.tenant_id), ...entity.buildContext(row) };
        const conditions = parseJson(rule.conditions, []);
        if (!evaluateConditions(conditions, context, rule.condition_logic || 'and')) continue;
        await queryFn(
          'INSERT IGNORE INTO notification_schedule_fired (rule_id, entity_id, fired_key) VALUES (?, ?, ?)',
          [rule.id, entityId, firedKey],
        );
        const result = await dispatchRule(rule, context, queryFn);
        fired += result.fired;
      }
    }
    return { fired };
  } catch (err) {
    console.error('[notificationRules] sweepScheduleTriggers failed:', err.message);
    return { fired: 0 };
  }
}

/**
 * Checks pending rows in notification_rule_escalations and, once
 * `escalation.afterMinutes` has elapsed since the original fire, notifies
 * the configured escalation recipients/channels (e.g. "tell the manager too
 * if this hasn't been handled in 30 minutes").
 */
export async function sweepEscalations(queryFn = dbQuery) {
  try {
    const { rows: pending } = await queryFn(
      `SELECT e.*, r.escalation, r.name AS rule_name
       FROM notification_rule_escalations e
       JOIN notification_rules r ON r.id = e.rule_id
       WHERE e.escalated_at IS NULL`,
    );
    let escalated = 0;
    for (const row of pending) {
      const esc = parseJson(row.escalation, null);
      if (!esc || !Number(esc.afterMinutes)) {
        await queryFn('UPDATE notification_rule_escalations SET escalated_at = NOW() WHERE id = ?', [row.id]).catch(() => {});
        continue;
      }
      const dueAt = new Date(row.fired_at).getTime() + Number(esc.afterMinutes) * 60000;
      if (Date.now() < dueAt) continue;

      let userIds = [];
      if (esc.recipientType === 'role' && esc.recipientRoleId) {
        const { rows } = await queryFn(
          'SELECT id FROM users WHERE tenant_id = ? AND is_active = 1 AND role_id = ?',
          [row.tenant_id, esc.recipientRoleId],
        );
        userIds = rows.map((r) => Number(r.id));
      } else if (Array.isArray(esc.recipientIds)) {
        userIds = esc.recipientIds.map(Number).filter(Boolean);
      }
      const channels = (Array.isArray(esc.channels) ? esc.channels : ['app']).filter((c) => ALL_CHANNELS.includes(c));
      const messagingCfg = channels.some((c) => c !== 'app') ? await loadMessagingCfg(row.tenant_id, queryFn) : null;
      for (const userId of userIds) {
        for (const channel of channels) {
          const ok = await deliverToChannel(channel, {
            tenantId: row.tenant_id, userId,
            title: `⏫ Κλιμάκωση: ${row.title || row.rule_name || 'Ειδοποίηση'}`,
            body: row.body || '', url: row.url,
            rich: { ruleId: row.rule_id, sourceId: `escalation_${row.id}` }, messagingCfg,
          }, queryFn).catch(() => false);
          await recordRun(queryFn, {
            tenantId: row.tenant_id, ruleId: row.rule_id, recipientUserId: userId, channel,
            status: ok ? 'sent' : 'failed', reason: 'escalation', entityId: row.entity_id,
          });
        }
      }
      await queryFn('UPDATE notification_rule_escalations SET escalated_at = NOW() WHERE id = ?', [row.id]).catch(() => {});
      escalated += 1;
    }
    return { escalated };
  } catch (err) {
    console.error('[notificationRules] sweepEscalations failed:', err.message);
    return { escalated: 0 };
  }
}

/**
 * Flushes queued digest-mode notifications: 'hourly' rules flush every
 * sweep, 'daily' rules flush only during the 08:00 server-time sweep — one
 * aggregated message per (rule, user, channel) group listing every queued
 * item since the last flush.
 */
export async function sweepDigests(queryFn = dbQuery) {
  try {
    const { rows: rules } = await queryFn(
      "SELECT * FROM notification_rules WHERE enabled = 1 AND digest_mode IN ('hourly', 'daily')",
    );
    let sent = 0;
    const currentHour = new Date().getHours();
    for (const rule of rules) {
      if (rule.digest_mode === 'daily' && currentHour !== 8) continue;
      const { rows: groups } = await queryFn(
        'SELECT DISTINCT user_id, channel FROM notification_digest_queue WHERE rule_id = ? AND sent_at IS NULL',
        [rule.id],
      );
      for (const { user_id: userId, channel } of groups) {
        const { rows: items } = await queryFn(
          'SELECT id, title, body, url FROM notification_digest_queue WHERE rule_id = ? AND user_id = ? AND channel = ? AND sent_at IS NULL ORDER BY created_at ASC',
          [rule.id, userId, channel],
        );
        if (!items.length) continue;
        const title = `${rule.name} — ${items.length} ειδοποιήσεις`;
        const body = items.map((it) => `• ${it.title}${it.body ? `: ${it.body}` : ''}`).join('\n').slice(0, 1000);
        const messagingCfg = channel !== 'app' ? await loadMessagingCfg(rule.tenant_id, queryFn) : null;
        const ok = await deliverToChannel(channel, {
          tenantId: rule.tenant_id, userId, title, body, url: items[0]?.url,
          rich: { ruleId: rule.id, sourceId: `digest_${rule.id}_${Date.now()}` }, messagingCfg,
        }, queryFn).catch(() => false);
        if (ok) {
          const ids = items.map((it) => it.id);
          await queryFn(`UPDATE notification_digest_queue SET sent_at = NOW() WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
          sent += 1;
        }
        await recordRun(queryFn, {
          tenantId: rule.tenant_id, ruleId: rule.id, recipientUserId: userId, channel,
          status: ok ? 'sent' : 'failed', reason: 'digest',
        });
      }
    }
    return { sent };
  } catch (err) {
    console.error('[notificationRules] sweepDigests failed:', err.message);
    return { sent: 0 };
  }
}
