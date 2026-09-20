// Admin-defined automatic notification rules ("when <event> happens and
// <conditions> match, notify <recipients> via <channels>"). This sits
// ADDITIVELY next to the hardcoded notification helpers in notifications.js
// (notifyFollowUpAssigned, notifyConnectorFailure, the sweep* functions) —
// callers invoke both; this module never replaces the existing pipeline, it
// only adds custom rules + per-user opt-out + extra channels on top.
//
// Two channel "families":
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

export const ALL_CHANNELS = ['app', 'email', 'sms', 'viber', 'telegram'];

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

/** All conditions must match (AND) — an empty/missing list always matches. */
export function evaluateConditions(conditions, context) {
  const list = Array.isArray(conditions) ? conditions : [];
  return list.every(({ field, operator, value }) => {
    const op = OPERATORS[operator];
    if (!op || !field) return true;
    return op(getPathValue(context, field), value);
  });
}

/** Renders `{{field}}` / `{{a.b}}` placeholders in a plain-text template as strings (not JSON). */
export function renderTemplate(template, context) {
  if (!template) return '';
  return String(template).replace(/\{\{\s*([\w.]+)\s*}}/g, (_match, path) => {
    const value = getPathValue(context, path);
    return value == null ? '' : String(value);
  });
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

/** Dynamic recipient: resolved from the event context rather than a fixed list. */
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

/**
 * Fires every enabled rule for `eventKey` whose conditions match `context`.
 * `context` must include `tenantId` and, for dynamic recipients, whichever of
 * `assignedUserId`/`assignedEmployeeId`/`createdByUserId`/`sellerUserId`/
 * `sellerEmployeeId` applies to the event — plus `entityId`, a stable id
 * (follow-up/quote/customer/booking id) used as the in-app dedupe key.
 * Always resolves (never throws) — callers should still `.catch()` for safety.
 */
export async function evaluateNotificationRules(eventKey, context, queryFn = dbQuery) {
  try {
    const tenantId = context?.tenantId;
    if (!tenantId || !EVENT_CATALOG[eventKey]) return { fired: 0 };
    const { rows: rules } = await queryFn(
      'SELECT * FROM notification_rules WHERE tenant_id = ? AND event_key = ? AND enabled = 1',
      [tenantId, eventKey],
    );
    if (!rules.length) return { fired: 0 };

    let messagingCfg = null;
    let fired = 0;
    for (const rule of rules) {
      const conditions = parseJson(rule.conditions, []);
      if (!evaluateConditions(conditions, context)) continue;

      const userIds = [...new Set((
        rule.recipient_type === 'dynamic'
          ? await resolveDynamicRecipient(rule, { ...context, tenantId })
          : await resolveStaticRecipients(rule, tenantId, queryFn)
      ).filter(Boolean))];
      if (!userIds.length) continue;

      const channels = (parseJson(rule.channels, []) || []).filter((c) => ALL_CHANNELS.includes(c));
      if (!channels.length) continue;
      if (channels.some((c) => c !== 'app') && !messagingCfg) {
        const { rows: tRows } = await queryFn('SELECT settings FROM tenants WHERE id = ?', [tenantId]);
        messagingCfg = mergeMessaging(mergeTenantSettings(parseJson(tRows[0]?.settings, {})).messaging);
      }

      const rich = {
        ...sanitizeRichPush({ ...rule, actions: parseJson(rule.actions, []) }),
        ruleId: rule.id,
        sourceId: context.entityId ?? rule.id,
      };
      const title = renderTemplate(rule.title_template, context).slice(0, 200) || 'Ειδοποίηση';
      const body = renderTemplate(rule.body_template, context).slice(0, 1000);
      const url = renderTemplate(rule.url_template, context).slice(0, 500);

      for (const userId of userIds) {
        if (await isThrottled(rule.id, userId, rule.throttle_seconds, queryFn)) continue;
        const isChannelEnabled = await loadPreferenceOverrides(tenantId, userId, eventKey, queryFn);
        let anySent = false;
        for (const channel of channels) {
          if (!isChannelEnabled(channel)) continue;
          const ok = await deliverToChannel(channel, {
            tenantId, userId, title, body, url, rich, messagingCfg,
          }, queryFn).catch((err) => {
            console.error(`[notificationRules] delivery failed rule=${rule.id} channel=${channel}:`, err.message);
            return false;
          });
          if (ok) anySent = true;
        }
        if (anySent) {
          fired += 1;
          if (rule.throttle_seconds) await recordFired(rule.id, userId, queryFn);
        }
      }
      await queryFn(
        'UPDATE notification_rules SET last_fired_at = NOW(), fired_count = fired_count + 1 WHERE id = ?',
        [rule.id],
      ).catch(() => {});
    }
    return { fired };
  } catch (err) {
    console.error(`[notificationRules] evaluate failed for event=${eventKey}:`, err.message);
    return { fired: 0, error: err.message };
  }
}
