import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { logAuditFromReq } from '../lib/audit.js';
import { sanitizeRichPush } from '../lib/notifications.js';
import { ALL_CHANNELS, dispatchRule } from '../lib/notificationRules.js';
import { eventCatalogList, EVENT_CATALOG } from '../lib/notificationEvents.js';
import { SCHEDULE_ENTITIES, scheduleEntityCatalogList } from '../lib/scheduleEntities.js';

export const notificationRulesRouter = Router();

const manageGuard = authorize(PERMISSIONS.SETTINGS_MANAGE);

function publicRule(row) {
  return {
    id: row.id,
    name: row.name,
    triggerType: row.trigger_type || 'event',
    eventKey: row.event_key,
    scheduleEntity: row.schedule_entity,
    scheduleDateField: row.schedule_date_field,
    scheduleOffsetMinutes: row.schedule_offset_minutes != null ? Number(row.schedule_offset_minutes) : null,
    scheduleRecurrence: row.schedule_recurrence || 'once',
    enabled: !!row.enabled,
    conditions: parseJson(row.conditions, []),
    conditionLogic: row.condition_logic || 'and',
    recipientType: row.recipient_type,
    recipientRoleId: row.recipient_role_id,
    recipientIds: parseJson(row.recipient_ids, []),
    recipientDynamic: row.recipient_dynamic,
    channels: parseJson(row.channels, []),
    titleTemplate: row.title_template,
    bodyTemplate: row.body_template,
    urlTemplate: row.url_template,
    imageUrl: row.image_url,
    iconUrl: row.icon_url,
    badgeUrl: row.badge_url,
    actions: parseJson(row.actions, []),
    requireInteraction: !!row.require_interaction,
    silent: !!row.silent,
    vibrate: row.vibrate,
    tag: row.tag,
    renotify: !!row.renotify,
    urgency: row.urgency,
    ttlSeconds: row.ttl_seconds,
    throttleSeconds: row.throttle_seconds,
    extraActions: parseJson(row.extra_actions, []),
    escalation: parseJson(row.escalation, null),
    digestMode: row.digest_mode || 'none',
    respectQuietHours: !!row.respect_quiet_hours,
    priority: row.priority || 'normal',
    dryRun: !!row.dry_run,
    lastFiredAt: row.last_fired_at,
    firedCount: row.fired_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return fallback;
}

function badRequest(res, message) {
  res.status(400).json({ error: message });
  return true;
}

const RECIPIENT_TYPES = ['all', 'role', 'users', 'dynamic'];
const DIGEST_MODES = ['none', 'hourly', 'daily'];
const PRIORITIES = ['normal', 'urgent'];

function validateRulePayload(body, res) {
  const triggerType = body.triggerType === 'schedule' ? 'schedule' : 'event';
  if (triggerType === 'event') {
    const eventKey = String(body.eventKey || '');
    if (!EVENT_CATALOG[eventKey]) return badRequest(res, 'Άγνωστο event');
  } else {
    const entity = SCHEDULE_ENTITIES[body.scheduleEntity];
    if (!entity) return badRequest(res, 'Άγνωστη οντότητα προγραμματισμού');
    if (!entity.dateFields[body.scheduleDateField]) return badRequest(res, 'Άγνωστο πεδίο ημερομηνίας');
    if (!Number.isFinite(Number(body.scheduleOffsetMinutes))) return badRequest(res, 'Μη έγκυρη μετατόπιση χρόνου');
  }
  const name = String(body.name || '').trim();
  if (!name) return badRequest(res, 'Το όνομα του κανόνα είναι υποχρεωτικό');
  const recipientType = RECIPIENT_TYPES.includes(body.recipientType) ? body.recipientType : null;
  if (!recipientType) return badRequest(res, 'Μη έγκυρος τύπος παραλήπτη');
  const channels = Array.isArray(body.channels) ? body.channels.filter((c) => ALL_CHANNELS.includes(c)) : [];
  if (!channels.length) return badRequest(res, 'Επίλεξε τουλάχιστον ένα κανάλι');
  const titleTemplate = String(body.titleTemplate || '').trim();
  if (!titleTemplate) return badRequest(res, 'Ο τίτλος είναι υποχρεωτικός');
  return false;
}

function sanitizeExtraActions(value) {
  const actions = Array.isArray(value) ? value : [];
  return actions.map((a) => {
    if (a?.type === 'create_follow_up') {
      return { type: 'create_follow_up', title: String(a.title || '').slice(0, 200), dueInDays: Math.max(0, Math.min(365, Number(a.dueInDays) || 1)) };
    }
    if (a?.type === 'add_tag') {
      return { type: 'add_tag', tagId: Number(a.tagId) || null };
    }
    if (a?.type === 'webhook') {
      return { type: 'webhook', url: String(a.url || '').slice(0, 500) };
    }
    return null;
  }).filter(Boolean).slice(0, 10);
}

function sanitizeEscalation(value) {
  if (!value || !Number(value.afterMinutes)) return null;
  return {
    afterMinutes: Math.max(1, Math.min(43200, Number(value.afterMinutes))),
    recipientType: value.recipientType === 'role' ? 'role' : 'users',
    recipientRoleId: value.recipientRoleId ? Number(value.recipientRoleId) : null,
    recipientIds: Array.isArray(value.recipientIds) ? value.recipientIds.map(Number).filter(Boolean) : [],
    channels: Array.isArray(value.channels) ? value.channels.filter((c) => ALL_CHANNELS.includes(c)) : ['app'],
  };
}

// ---- Event catalog (used by the rule builder UI) --------------------------
notificationRulesRouter.get('/events', manageGuard, async (_req, res) => {
  res.json({ events: eventCatalogList(), channels: ALL_CHANNELS });
});

// ---- Schedule-trigger entity catalog (date fields available for "N
// minutes/hours/days before/after <field>" triggers) ------------------------
notificationRulesRouter.get('/schedule-entities', manageGuard, async (_req, res) => {
  res.json({ entities: scheduleEntityCatalogList() });
});

// Tags for the "add tag" extra action picker.
notificationRulesRouter.get('/tags', manageGuard, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, name, color FROM tags ORDER BY name', []);
    res.json({ tags: rows });
  } catch (e) { next(e); }
});

// ---- Admin rule CRUD --------------------------------------------------------
notificationRulesRouter.get('/', manageGuard, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM notification_rules WHERE tenant_id = ? ORDER BY created_at DESC',
      [req.user.tenantId],
    );
    res.json({ rules: rows.map(publicRule) });
  } catch (e) { next(e); }
});

notificationRulesRouter.post('/', manageGuard, async (req, res, next) => {
  try {
    const body = req.body || {};
    if (validateRulePayload(body, res)) return;
    const rich = sanitizeRichPush(body);
    const triggerType = body.triggerType === 'schedule' ? 'schedule' : 'event';
    const result = await query(
      `INSERT INTO notification_rules
        (tenant_id, created_by, name, event_key, enabled, conditions,
         recipient_type, recipient_role_id, recipient_ids, recipient_dynamic, channels,
         title_template, body_template, url_template,
         image_url, icon_url, badge_url, actions, require_interaction, silent, vibrate, tag, renotify,
         urgency, ttl_seconds, throttle_seconds,
         trigger_type, schedule_entity, schedule_date_field, schedule_offset_minutes, schedule_recurrence,
         condition_logic, extra_actions, escalation, digest_mode, respect_quiet_hours, priority, dry_run)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.tenantId, req.user.id,
        String(body.name).trim().slice(0, 150), triggerType === 'event' ? String(body.eventKey) : null,
        body.enabled === false ? 0 : 1,
        JSON.stringify(Array.isArray(body.conditions) ? body.conditions : []),
        body.recipientType, body.recipientRoleId || null,
        JSON.stringify(Array.isArray(body.recipientIds) ? body.recipientIds : []),
        body.recipientType === 'dynamic' ? String(body.recipientDynamic || '') : null,
        JSON.stringify(body.channels.filter((c) => ALL_CHANNELS.includes(c))),
        String(body.titleTemplate).trim().slice(0, 300),
        body.bodyTemplate ? String(body.bodyTemplate).trim().slice(0, 1500) : null,
        body.urlTemplate ? String(body.urlTemplate).trim().slice(0, 500) : null,
        rich.imageUrl || null, rich.iconUrl || null, rich.badgeUrl || null,
        rich.actions.length ? JSON.stringify(rich.actions) : null,
        rich.requireInteraction ? 1 : 0, rich.silent ? 1 : 0, rich.vibrate || null, rich.tag || null, rich.renotify ? 1 : 0,
        rich.urgency, rich.ttlSeconds,
        Math.max(0, Math.min(86400, Number(body.throttleSeconds) || 0)),
        triggerType,
        triggerType === 'schedule' ? String(body.scheduleEntity) : null,
        triggerType === 'schedule' ? String(body.scheduleDateField) : null,
        triggerType === 'schedule' ? Math.round(Number(body.scheduleOffsetMinutes)) : null,
        triggerType === 'schedule' && body.scheduleRecurrence === 'recurring' ? 'recurring' : 'once',
        body.conditionLogic === 'or' ? 'or' : 'and',
        JSON.stringify(sanitizeExtraActions(body.extraActions)),
        JSON.stringify(sanitizeEscalation(body.escalation)),
        DIGEST_MODES.includes(body.digestMode) ? body.digestMode : 'none',
        body.respectQuietHours ? 1 : 0,
        PRIORITIES.includes(body.priority) ? body.priority : 'normal',
        body.dryRun ? 1 : 0,
      ],
    );
    const { rows } = await query('SELECT * FROM notification_rules WHERE id = ?', [result.rows.insertId]);
    await logAuditFromReq(query, req, {
      action: 'create', entityType: 'notification_rule', entityId: result.rows.insertId,
      summary: `Δημιουργία κανόνα ειδοποίησης "${body.name}"`,
    });
    res.status(201).json({ rule: publicRule(rows[0]) });
  } catch (e) { next(e); }
});

async function loadOwnedRule(req) {
  const { rows } = await query('SELECT * FROM notification_rules WHERE id = ? AND tenant_id = ?', [Number(req.params.id), req.user.tenantId]);
  return rows[0] || null;
}

notificationRulesRouter.patch('/:id', manageGuard, async (req, res, next) => {
  try {
    const existing = await loadOwnedRule(req);
    if (!existing) return res.status(404).json({ error: 'Ο κανόνας δεν βρέθηκε' });
    const body = req.body || {};
    if (validateRulePayload(body, res)) return;
    const rich = sanitizeRichPush(body);
    const triggerType = body.triggerType === 'schedule' ? 'schedule' : 'event';
    await query(
      `UPDATE notification_rules SET
        name = ?, event_key = ?, enabled = ?, conditions = ?,
        recipient_type = ?, recipient_role_id = ?, recipient_ids = ?, recipient_dynamic = ?, channels = ?,
        title_template = ?, body_template = ?, url_template = ?,
        image_url = ?, icon_url = ?, badge_url = ?, actions = ?, require_interaction = ?, silent = ?,
        vibrate = ?, tag = ?, renotify = ?, urgency = ?, ttl_seconds = ?, throttle_seconds = ?,
        trigger_type = ?, schedule_entity = ?, schedule_date_field = ?, schedule_offset_minutes = ?, schedule_recurrence = ?,
        condition_logic = ?, extra_actions = ?, escalation = ?, digest_mode = ?, respect_quiet_hours = ?, priority = ?, dry_run = ?
       WHERE id = ? AND tenant_id = ?`,
      [
        String(body.name).trim().slice(0, 150), triggerType === 'event' ? String(body.eventKey) : null,
        body.enabled === false ? 0 : 1,
        JSON.stringify(Array.isArray(body.conditions) ? body.conditions : []),
        body.recipientType, body.recipientRoleId || null,
        JSON.stringify(Array.isArray(body.recipientIds) ? body.recipientIds : []),
        body.recipientType === 'dynamic' ? String(body.recipientDynamic || '') : null,
        JSON.stringify(body.channels.filter((c) => ALL_CHANNELS.includes(c))),
        String(body.titleTemplate).trim().slice(0, 300),
        body.bodyTemplate ? String(body.bodyTemplate).trim().slice(0, 1500) : null,
        body.urlTemplate ? String(body.urlTemplate).trim().slice(0, 500) : null,
        rich.imageUrl || null, rich.iconUrl || null, rich.badgeUrl || null,
        rich.actions.length ? JSON.stringify(rich.actions) : null,
        rich.requireInteraction ? 1 : 0, rich.silent ? 1 : 0, rich.vibrate || null, rich.tag || null, rich.renotify ? 1 : 0,
        rich.urgency, rich.ttlSeconds,
        Math.max(0, Math.min(86400, Number(body.throttleSeconds) || 0)),
        triggerType,
        triggerType === 'schedule' ? String(body.scheduleEntity) : null,
        triggerType === 'schedule' ? String(body.scheduleDateField) : null,
        triggerType === 'schedule' ? Math.round(Number(body.scheduleOffsetMinutes)) : null,
        triggerType === 'schedule' && body.scheduleRecurrence === 'recurring' ? 'recurring' : 'once',
        body.conditionLogic === 'or' ? 'or' : 'and',
        JSON.stringify(sanitizeExtraActions(body.extraActions)),
        JSON.stringify(sanitizeEscalation(body.escalation)),
        DIGEST_MODES.includes(body.digestMode) ? body.digestMode : 'none',
        body.respectQuietHours ? 1 : 0,
        PRIORITIES.includes(body.priority) ? body.priority : 'normal',
        body.dryRun ? 1 : 0,
        existing.id, req.user.tenantId,
      ],
    );
    const { rows } = await query('SELECT * FROM notification_rules WHERE id = ?', [existing.id]);
    await logAuditFromReq(query, req, {
      action: 'update', entityType: 'notification_rule', entityId: existing.id,
      summary: `Ενημέρωση κανόνα ειδοποίησης "${body.name}"`,
    });
    res.json({ rule: publicRule(rows[0]) });
  } catch (e) { next(e); }
});

notificationRulesRouter.patch('/:id/toggle', manageGuard, async (req, res, next) => {
  try {
    const existing = await loadOwnedRule(req);
    if (!existing) return res.status(404).json({ error: 'Ο κανόνας δεν βρέθηκε' });
    const enabled = req.body?.enabled === false ? 0 : 1;
    await query('UPDATE notification_rules SET enabled = ? WHERE id = ? AND tenant_id = ?', [enabled, existing.id, req.user.tenantId]);
    res.json({ ok: true, enabled: !!enabled });
  } catch (e) { next(e); }
});

notificationRulesRouter.delete('/:id', manageGuard, async (req, res, next) => {
  try {
    const existing = await loadOwnedRule(req);
    if (!existing) return res.status(404).json({ error: 'Ο κανόνας δεν βρέθηκε' });
    await query('DELETE FROM notification_rules WHERE id = ? AND tenant_id = ?', [existing.id, req.user.tenantId]);
    await logAuditFromReq(query, req, {
      action: 'delete', entityType: 'notification_rule', entityId: existing.id,
      summary: `Διαγραφή κανόνα ειδοποίησης "${existing.name}"`,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---- Execution log ("Πρόσφατες εκτελέσεις") ---------------------------------
notificationRulesRouter.get('/:id/runs', manageGuard, async (req, res, next) => {
  try {
    const existing = await loadOwnedRule(req);
    if (!existing) return res.status(404).json({ error: 'Ο κανόνας δεν βρέθηκε' });
    const { rows } = await query(
      'SELECT id, entity_id, status, recipient_count, channels, dry_run, error_message, created_at FROM notification_rule_runs WHERE rule_id = ? ORDER BY created_at DESC LIMIT 50',
      [existing.id],
    );
    res.json({
      runs: rows.map((r) => ({
        id: r.id, entityId: r.entity_id, status: r.status, recipientCount: r.recipient_count,
        channels: parseJson(r.channels, []), dryRun: !!r.dry_run, errorMessage: r.error_message, createdAt: r.created_at,
      })),
    });
  } catch (e) { next(e); }
});

// ---- Manual test / dry-run trigger ------------------------------------------
// Fires the rule once as a dry run (never sends real notifications) against a
// real sample record, so the admin can verify templates/conditions before
// enabling it for real.
notificationRulesRouter.post('/:id/test', manageGuard, async (req, res, next) => {
  try {
    const existing = await loadOwnedRule(req);
    if (!existing) return res.status(404).json({ error: 'Ο κανόνας δεν βρέθηκε' });
    let context = {};
    if (existing.trigger_type === 'schedule' && existing.schedule_entity) {
      const entity = SCHEDULE_ENTITIES[existing.schedule_entity];
      if (!entity) return badRequest(res, 'Άγνωστη οντότητα προγραμματισμού');
      const { rows } = await query(
        `SELECT ${entity.select} FROM ${entity.table} ${entity.joins || ''} WHERE ${entity.activeFilter} AND ${entity.table.split(' ')[1] || entity.table}.tenant_id = ? ORDER BY 1 DESC LIMIT 1`,
        [req.user.tenantId],
      );
      if (!rows.length) return badRequest(res, 'Δεν βρέθηκε δείγμα εγγραφής για δοκιμή');
      context = entity.buildContext(rows[0]);
    }
    const testRule = { ...existing, dry_run: 1 };
    const result = await dispatchRule(testRule, context, query);
    res.json({ ok: true, result });
  } catch (e) { next(e); }
});

// Roles for the recipient-type=role picker (mirrors /api/push/roles).
notificationRulesRouter.get('/roles', manageGuard, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.id, r.name, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id AND u.is_active = 1) AS user_count
       FROM roles r WHERE r.tenant_id = ? ORDER BY r.name`,
      [req.user.tenantId],
    );
    res.json({ roles: rows.map((r) => ({ ...r, user_count: Number(r.user_count) })) });
  } catch (e) { next(e); }
});

notificationRulesRouter.get('/users', manageGuard, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, full_name, email FROM users WHERE tenant_id = ? AND is_active = 1 ORDER BY full_name',
      [req.user.tenantId],
    );
    res.json({ users: rows });
  } catch (e) { next(e); }
});

// ---- Personal preferences ("Οι ειδοποιήσεις μου") --------------------------
// Any authenticated user manages only their own row set — no settings.manage
// permission required, since these are opt-outs on the user's own inbox.
notificationRulesRouter.get('/my-preferences', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT event_key, channel, enabled FROM notification_preferences WHERE tenant_id = ? AND user_id = ?',
      [req.user.tenantId, req.user.id],
    );
    const { rows: userRows } = await query('SELECT quiet_hours_start, quiet_hours_end FROM users WHERE id = ? AND tenant_id = ?', [req.user.id, req.user.tenantId]);
    res.json({
      events: eventCatalogList().map(({ key, label, description }) => ({ key, label, description })),
      channels: ALL_CHANNELS,
      overrides: rows.map((r) => ({ eventKey: r.event_key, channel: r.channel, enabled: !!r.enabled })),
      quietHoursStart: userRows[0]?.quiet_hours_start || null,
      quietHoursEnd: userRows[0]?.quiet_hours_end || null,
    });
  } catch (e) { next(e); }
});

notificationRulesRouter.put('/my-preferences', async (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.overrides) ? req.body.overrides : [];
    for (const item of items) {
      const eventKey = String(item?.eventKey || '');
      const channel = String(item?.channel || '');
      if (!EVENT_CATALOG[eventKey] || !ALL_CHANNELS.includes(channel)) continue;
      const enabled = item.enabled === false ? 0 : 1;
      await query(
        `INSERT INTO notification_preferences (tenant_id, user_id, event_key, channel, enabled)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)`,
        [req.user.tenantId, req.user.id, eventKey, channel, enabled],
      );
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Lets the current user set their own contact channels (phone/telegram —
// email already exists on the account) used for SMS/Viber/Telegram rules.
notificationRulesRouter.put('/my-contact', async (req, res, next) => {
  try {
    const phone = req.body?.phone != null ? String(req.body.phone).trim().slice(0, 40) : null;
    const telegramChatId = req.body?.telegramChatId != null ? String(req.body.telegramChatId).trim().slice(0, 64) : null;
    const timePattern = /^\d{2}:\d{2}(:\d{2})?$/;
    const quietHoursStart = req.body?.quietHoursStart && timePattern.test(req.body.quietHoursStart) ? req.body.quietHoursStart : null;
    const quietHoursEnd = req.body?.quietHoursEnd && timePattern.test(req.body.quietHoursEnd) ? req.body.quietHoursEnd : null;
    await query(
      'UPDATE users SET phone = ?, telegram_chat_id = ?, quiet_hours_start = ?, quiet_hours_end = ? WHERE id = ? AND tenant_id = ?',
      [phone || null, telegramChatId || null, quietHoursStart, quietHoursEnd, req.user.id, req.user.tenantId],
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});
