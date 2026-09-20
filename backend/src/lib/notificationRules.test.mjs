import assert from 'node:assert/strict';
import { evaluateConditions, renderTemplate, evaluateNotificationRules, ALL_CHANNELS } from './notificationRules.js';

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

console.log('notificationRules tests passed');
