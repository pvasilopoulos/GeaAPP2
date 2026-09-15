import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { CHANNELS, channelCaps } from '../lib/messaging.js';
import { sanitizeHtml } from '../lib/richText.js';
import { TEMPLATE_VARIABLES } from '../lib/messageTemplates.js';

export const messageTemplatesRouter = Router();

function parseJson(v, fallback) {
  if (v && typeof v === 'object') return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fallback; } }
  return fallback;
}

function serialize(row) {
  return {
    ...row,
    active: !!row.active,
    attachments: parseJson(row.attachments, []) || [],
  };
}

function readBody(b) {
  const channel = CHANNELS.includes(b.channel) ? b.channel : null;
  const format = b.body_format === 'html' ? 'html' : 'text';
  // A template pinned to a text-only channel cannot keep HTML around.
  const keepHtml = format === 'html' && (!channel || channelCaps(channel).richText);
  return {
    name: String(b.name || '').trim().slice(0, 160),
    channel,
    subject: b.subject ? String(b.subject).slice(0, 255) : null,
    body: keepHtml ? sanitizeHtml(b.body) : String(b.body || ''),
    body_format: keepHtml ? 'html' : 'text',
    attachments: Array.isArray(b.attachments) ? b.attachments.slice(0, 5) : [],
    active: b.active === undefined ? 1 : (b.active ? 1 : 0),
  };
}

// Anyone who may message a customer needs to read the templates; only settings
// managers may change them.
messageTemplatesRouter.get('/', authorize(PERMISSIONS.CUSTOMERS_READ, PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, channel, subject, body, body_format, attachments, active, sort_order, updated_at
       FROM message_templates WHERE tenant_id = ? ORDER BY sort_order, id`,
      [req.user.tenantId]);
    res.json({ templates: rows.map(serialize), variables: TEMPLATE_VARIABLES });
  } catch (err) { next(err); }
});

messageTemplatesRouter.post('/', authorize(PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    const t = readBody(req.body || {});
    if (!t.name) return res.status(400).json({ error: 'Απαιτείται όνομα προτύπου' });
    if (!t.body.trim()) return res.status(400).json({ error: 'Απαιτείται κείμενο προτύπου' });
    const order = (await query(
      'SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM message_templates WHERE tenant_id = ?',
      [req.user.tenantId])).rows[0].n;
    const r = await query(
      `INSERT INTO message_templates (tenant_id, name, channel, subject, body, body_format, attachments, active, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.user.tenantId, t.name, t.channel, t.subject, t.body, t.body_format,
        JSON.stringify(t.attachments), t.active, order]);
    res.status(201).json({ id: r.rows.insertId });
  } catch (err) { next(err); }
});

messageTemplatesRouter.patch('/:id', authorize(PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const own = await query('SELECT id FROM message_templates WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId]);
    if (!own.rows.length) return res.status(404).json({ error: 'Το πρότυπο δεν βρέθηκε' });
    const t = readBody(req.body || {});
    if (!t.name) return res.status(400).json({ error: 'Απαιτείται όνομα προτύπου' });
    await query(
      `UPDATE message_templates
       SET name = ?, channel = ?, subject = ?, body = ?, body_format = ?, attachments = ?, active = ?
       WHERE id = ? AND tenant_id = ?`,
      [t.name, t.channel, t.subject, t.body, t.body_format, JSON.stringify(t.attachments), t.active,
        id, req.user.tenantId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

messageTemplatesRouter.delete('/:id', authorize(PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
  try {
    await query('DELETE FROM message_templates WHERE id = ? AND tenant_id = ?',
      [Number(req.params.id), req.user.tenantId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
