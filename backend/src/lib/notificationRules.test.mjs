import assert from 'node:assert/strict';
import { evaluateConditions, renderTemplate, evaluateNotificationRules, dispatchRule, sweepScheduleTriggers, ALL_CHANNELS } from './notificationRules.js';

// --- condition evaluator ----------------------------------------------------
assert.equal(evaluateConditions([], { a: 1 }), true);
assert.equal(evaluateConditions([{ field: 'total', operator: 'gt', value: 100 }], { total: 150 }), true);
assert.equal(evaluateConditions([{ field: 'total', operator: 'gt', value: 100 }], { total: 50 }), false);
assert.equal(evaluateConditions([
  { field: 'total', operator: 'gte', value: 100 },
  { field: 'customerName', operator: 'contains', value: 'gea' },
], { total: 100, customerName: 'GEA Αθήνα' }), true);
assert.equal(evaluateConditions([
  { field: 'toStatus', operator: 'eq', value: 'won' },
], { toStatus: 'lost' }), false);
// unknown/malformed conditions never block a rule from firing
assert.equal(evaluateConditions([{ field: 'x', operator: 'bogus', value: 1 }], {}), true);

// --- template renderer -------------------------------------------------------
assert.equal(renderTemplate('Γεια {{customerName}}!', { customerName: 'Νίκος' }), 'Γεια Νίκος!');
assert.equal(renderTemplate('{{missing}}', {}), '');
assert.equal(renderTemplate(null, {}), '');
assert.equal(renderTemplate('{{a.b}}', { a: { b: 'ναι' } }), 'ναι');

assert.deepEqual(ALL_CHANNELS.sort(), ['app', 'email', 'sms', 'telegram', 'viber']);

// --- evaluateNotificationRules: static + dynamic recipients, throttle, prefs
function makeDb({ rules = [], users = [], throttleRows = [], prefRows = [] } = {}) {
  const inAppInserts = [];
  const throttleUpdates = [];
  const firedUpdates = [];
  const db = async (sql, params = []) => {
    const s = String(sql);
    if (s.includes('FROM notification_rules WHERE tenant_id')) return { rows: rules };
    if (s.includes('UPDATE notification_rules SET last_fired_at')) { firedUpdates.push(params[0]); return { rows: {} }; }
    if (s.includes('FROM users WHERE tenant_id = ? AND is_active = 1 AND role_id')) {
      return { rows: users.filter((u) => u.role_id === params[1]) };
    }
    if (s.includes('FROM users WHERE tenant_id = ? AND is_active = 1 AND id IN')) {
      const ids = params.slice(1);
      return { rows: users.filter((u) => ids.includes(u.id)) };
    }
    if (s.includes('FROM users WHERE tenant_id = ? AND is_active = 1')) return { rows: users };
    if (s.includes('SELECT email, phone, telegram_chat_id FROM users')) {
      const user = users.find((u) => u.id === params[0]);
      return { rows: user ? [user] : [] };
    }
    if (s.includes('FROM notification_rule_throttle WHERE rule_id')) {
      const row = throttleRows.find((r) => r.rule_id === params[0] && r.user_id === params[1]);
      return { rows: row ? [row] : [] };
    }
    if (s.includes('INSERT INTO notification_rule_throttle')) { throttleUpdates.push(params); return { rows: {} }; }
    if (s.includes('FROM notification_preferences WHERE tenant_id')) {
      return { rows: prefRows.filter((r) => r.user_id === params[1] && r.event_key === params[2]) };
    }
    if (s.includes('INSERT INTO notifications')) {
      inAppInserts.push(params);
      return { rows: { insertId: inAppInserts.length } };
    }
    return { rows: [] };
  };
  return { db, inAppInserts, throttleUpdates, firedUpdates };
}

const baseRule = {
  id: 1, tenant_id: 1, event_key: 'quote_created', enabled: 1,
  conditions: JSON.stringify([{ field: 'total', operator: 'gte', value: 1000 }]),
  recipient_type: 'all', recipient_role_id: null, recipient_ids: null, recipient_dynamic: null,
  channels: JSON.stringify(['app']),
  title_template: 'Νέα προσφορά {{total}}€', body_template: 'Για τον πελάτη {{customerName}}', url_template: null,
  image_url: null, icon_url: null, badge_url: null, actions: null,
  require_interaction: 0, silent: 0, vibrate: null, tag: null, renotify: 0,
  urgency: 'normal', ttl_seconds: 259200, throttle_seconds: 0,
};

// 1) condition not met -> no delivery
{
  const { db, inAppInserts } = makeDb({ rules: [baseRule], users: [{ id: 1, is_active: 1 }] });
  const result = await evaluateNotificationRules('quote_created', { tenantId: 1, entityId: 5, total: 100, customerName: 'X' }, db);
  assert.equal(result.fired, 0);
  assert.equal(inAppInserts.length, 0);
}

// 2) condition met, recipient_type=all -> delivers to every active user
{
  const users = [{ id: 1, is_active: 1 }, { id: 2, is_active: 1 }];
  const { db, inAppInserts } = makeDb({ rules: [baseRule], users });
  const result = await evaluateNotificationRules('quote_created', { tenantId: 1, entityId: 5, total: 5000, customerName: 'ACME' }, db);
  assert.equal(result.fired, 2);
  assert.equal(inAppInserts.length, 2);
  assert.match(inAppInserts[0][3], /5000/); // rendered title
}

// 3) dynamic recipient (assigned_user)
{
  const dynamicRule = { ...baseRule, event_key: 'customer_assigned', recipient_type: 'dynamic', recipient_dynamic: 'assigned_user', conditions: '[]' };
  const { db, inAppInserts } = makeDb({ rules: [dynamicRule] });
  const result = await evaluateNotificationRules('customer_assigned', { tenantId: 1, entityId: 9, assignedUserId: 42, customerName: 'Y' }, db);
  assert.equal(result.fired, 1);
  assert.equal(inAppInserts[0][1], 42); // user_id column
}

// 4) throttle suppresses a repeat fire within the window
{
  const throttledRule = { ...baseRule, conditions: '[]', throttle_seconds: 600 };
  const { db, inAppInserts } = makeDb({
    rules: [throttledRule],
    users: [{ id: 1, is_active: 1 }],
    throttleRows: [{ rule_id: 1, user_id: 1, last_fired_at: new Date().toISOString() }],
  });
  const result = await evaluateNotificationRules('quote_created', { tenantId: 1, entityId: 5, total: 5000 }, db);
  assert.equal(result.fired, 0);
  assert.equal(inAppInserts.length, 0);
}

// 5) per-user preference opt-out on the 'app' channel blocks delivery
{
  const rule = { ...baseRule, conditions: '[]' };
  const { db, inAppInserts } = makeDb({
    rules: [rule],
    users: [{ id: 1, is_active: 1 }],
    prefRows: [{ user_id: 1, event_key: 'quote_created', channel: 'app', enabled: 0 }],
  });
  const result = await evaluateNotificationRules('quote_created', { tenantId: 1, entityId: 5, total: 5000 }, db);
  assert.equal(result.fired, 0);
  assert.equal(inAppInserts.length, 0);
}

// 6) disabled rule / unknown event never throws and reports 0
{
  const result = await evaluateNotificationRules('not_a_real_event', { tenantId: 1 }, async () => ({ rows: [] }));
  assert.equal(result.fired, 0);
}

// --- v2: condition groups (AND/OR) -----------------------------------------
{
  // group A: total >= 1000 AND status = 'sent'   (fails, status is 'draft')
  // group B: customerName contains 'VIP'          (passes)
  // logic 'or' between groups -> overall match
  const groups = [
    [{ field: 'total', operator: 'gte', value: 1000 }, { field: 'status', operator: 'eq', value: 'sent' }],
    [{ field: 'customerName', operator: 'contains', value: 'VIP' }],
  ];
  assert.equal(evaluateConditions(groups, { total: 5000, status: 'draft', customerName: 'VIP Πελάτης' }, 'or'), true);
  assert.equal(evaluateConditions(groups, { total: 5000, status: 'draft', customerName: 'Απλός' }, 'or'), false);
  // logic 'and' (default) requires every group to match
  assert.equal(evaluateConditions(groups, { total: 5000, status: 'sent', customerName: 'VIP' }, 'and'), true);
  assert.equal(evaluateConditions(groups, { total: 5000, status: 'sent', customerName: 'Απλός' }, 'and'), false);
}

// --- v2: dispatchRule — run log, quiet hours, dry-run, digest, escalation --
function makeDbV2(overrides = {}) {
  const state = {
    notifications: [], runs: [], digestQueue: [], escalations: [], throttle: [],
    users: overrides.users || [{ id: 1, is_active: 1, quiet_hours_start: null, quiet_hours_end: null, email: 'a@x.com', phone: null, telegram_chat_id: null }],
  };
  const db = async (sql, params = []) => {
    const s = String(sql);
    if (s.includes('FROM users WHERE tenant_id = ? AND is_active = 1 AND id IN')) {
      const ids = params.slice(1);
      return { rows: state.users.filter((u) => ids.includes(u.id)) };
    }
    if (s.includes('FROM users WHERE tenant_id = ? AND is_active = 1')) return { rows: state.users };
    if (s.includes('SELECT quiet_hours_start, quiet_hours_end FROM users')) {
      const u = state.users.find((x) => x.id === params[0]);
      return { rows: u ? [u] : [] };
    }
    if (s.includes('SELECT email, phone, telegram_chat_id FROM users')) {
      const u = state.users.find((x) => x.id === params[0]);
      return { rows: u ? [u] : [] };
    }
    if (s.includes('FROM notification_rule_throttle')) return { rows: [] };
    if (s.includes('FROM notification_preferences')) return { rows: [] };
    if (s.includes('INSERT INTO notifications')) { state.notifications.push(params); return { rows: { insertId: state.notifications.length } }; }
    if (s.includes('INSERT INTO notification_rule_runs')) { state.runs.push(params); return { rows: {} }; }
    if (s.includes('INSERT INTO notification_digest_queue')) { state.digestQueue.push(params); return { rows: {} }; }
    if (s.includes('INSERT INTO notification_rule_escalations')) { state.escalations.push(params); return { rows: {} }; }
    if (s.includes('UPDATE notification_rules SET last_fired_at')) return { rows: {} };
    return { rows: [] };
  };
  return { db, state };
}

const v2Rule = {
  id: 10, tenant_id: 1, recipient_type: 'all', channels: JSON.stringify(['app']),
  title_template: 'Τίτλος', body_template: 'Σώμα', url_template: null,
  actions: null, throttle_seconds: 0, respect_quiet_hours: 0, priority: 'normal',
  digest_mode: 'none', dry_run: 0, escalation: null,
};

// dry_run: logged as 'dry_run', no in-app row inserted, still counts as fired
{
  const { db, state } = makeDbV2();
  const rule = { ...v2Rule, dry_run: 1 };
  const result = await dispatchRule(rule, { tenantId: 1, entityId: 1 }, db);
  assert.equal(result.fired, 1);
  assert.equal(state.notifications.length, 0);
  assert.equal(state.runs.some((r) => r[4] === 'dry_run'), true);
}

// digest_mode: queues instead of sending immediately
{
  const { db, state } = makeDbV2();
  const rule = { ...v2Rule, digest_mode: 'daily' };
  const result = await dispatchRule(rule, { tenantId: 1, entityId: 1 }, db);
  assert.equal(result.fired, 1);
  assert.equal(state.notifications.length, 0);
  assert.equal(state.digestQueue.length, 1);
}

// quiet hours: current time inside window (00:00-23:59) suppresses non-email channel
{
  const { db, state } = makeDbV2({ users: [{ id: 1, is_active: 1, quiet_hours_start: '00:00', quiet_hours_end: '23:59', email: 'a@x.com' }] });
  const rule = { ...v2Rule, respect_quiet_hours: 1 };
  const result = await dispatchRule(rule, { tenantId: 1, entityId: 1 }, db);
  assert.equal(result.fired, 0);
  assert.equal(state.notifications.length, 0);
  assert.equal(state.runs.some((r) => r[4] === 'quiet_hours'), true);
}

// quiet hours ignored for 'urgent' priority
{
  const { db, state } = makeDbV2({ users: [{ id: 1, is_active: 1, quiet_hours_start: '00:00', quiet_hours_end: '23:59', email: 'a@x.com' }] });
  const rule = { ...v2Rule, respect_quiet_hours: 1, priority: 'urgent' };
  const result = await dispatchRule(rule, { tenantId: 1, entityId: 1 }, db);
  assert.equal(result.fired, 1);
  assert.equal(state.notifications.length, 1);
}

// escalation: firing queues a pending escalation row
{
  const { db, state } = makeDbV2();
  const rule = { ...v2Rule, escalation: JSON.stringify({ afterMinutes: 30, channels: ['app'], recipientIds: [1] }) };
  const result = await dispatchRule(rule, { tenantId: 1, entityId: 1 }, db);
  assert.equal(result.fired, 1);
  assert.equal(state.escalations.length, 1);
}

// --- v2: sweepScheduleTriggers — fires once, then dedupes on re-sweep ------
{
  const quoteRow = {
    id: 77, tenant_id: 1, customer_id: 5, created_by: 9, seller_id: null, total: 2000,
    status: 'sent', valid_until: '2099-01-01', created_at: '2099-01-01', customer_name: 'Δοκιμή ΑΕ',
    diff_min: 0,
  };
  const scheduleRule = {
    id: 20, tenant_id: 1, enabled: 1, trigger_type: 'schedule',
    schedule_entity: 'quote', schedule_date_field: 'valid_until', schedule_offset_minutes: -4320,
    schedule_recurrence: 'once', condition_logic: 'and', conditions: '[]',
    recipient_type: 'all', channels: JSON.stringify(['app']),
    title_template: 'Η προσφορά {{customerName}} λήγει σύντομα', body_template: null, url_template: null,
    actions: null, throttle_seconds: 0, respect_quiet_hours: 0, priority: 'normal', digest_mode: 'none', dry_run: 0, escalation: null,
  };
  const fired = new Set();
  const notifications = [];
  const db = async (sql, params = []) => {
    const s = String(sql);
    if (s.includes("trigger_type = 'schedule'")) return { rows: [scheduleRule] };
    if (s.includes('FROM quotes q')) return { rows: [quoteRow] };
    if (s.includes('FROM notification_schedule_fired')) {
      const key = `${params[0]}:${params[1]}:${params[2]}`;
      return { rows: fired.has(key) ? [{ 1: 1 }] : [] };
    }
    if (s.includes('INSERT IGNORE INTO notification_schedule_fired')) { fired.add(`${params[0]}:${params[1]}:${params[2]}`); return { rows: {} }; }
    if (s.includes('FROM users WHERE tenant_id = ? AND is_active = 1')) return { rows: [{ id: 1, is_active: 1 }] };
    if (s.includes('FROM notification_rule_throttle')) return { rows: [] };
    if (s.includes('FROM notification_preferences')) return { rows: [] };
    if (s.includes('INSERT INTO notifications')) { notifications.push(params); return { rows: { insertId: notifications.length } }; }
    if (s.includes('UPDATE notification_rules SET last_fired_at')) return { rows: {} };
    return { rows: [] };
  };
  const first = await sweepScheduleTriggers(db);
  assert.equal(first.fired, 1);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0][3], /Δοκιμή ΑΕ/);
  // second sweep sees the same row but it's already dedup'd -> no repeat fire
  const second = await sweepScheduleTriggers(db);
  assert.equal(second.fired, 0);
  assert.equal(notifications.length, 1);
}

console.log('notificationRules tests passed');
