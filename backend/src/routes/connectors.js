import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { encryptCredentials, redactConnector } from '../lib/connectorCrypto.js';
import { validateMappings } from '../lib/mapping.js';
import { runSync } from '../lib/sync.js';
import { canRetrySyncRun } from '../lib/syncMonitoring.js';
import { logAuditFromReq } from '../lib/audit.js';
import { renderPushTemplate, processOutbox } from '../lib/pushSync.js';

export const connectorsRouter = Router();
const guard = authorize(PERMISSIONS.ERP_SYNC_MANAGE, PERMISSIONS.SETTINGS_MANAGE);
connectorsRouter.get('/', guard, async (req, res, next) => { try { const { rows } = await query('SELECT * FROM connectors WHERE tenant_id = ? ORDER BY name', [req.user.tenantId]); res.json({ connectors: rows.map(redactConnector) }); } catch (e) { next(e); } });
connectorsRouter.post('/', guard, async (req, res, next) => {
  try {
    const b = req.body || {}; const targetEntity = b.target_entity || 'customers'; const errors = validateMappings(b.mappings, targetEntity);
    if (!b.name || !b.base_url || errors.length) return res.status(400).json({ error: errors.join('; ') || 'Όνομα και URL απαιτούνται' });
    const result = await query(`INSERT INTO connectors (tenant_id,name,base_url,target_entity,response_encoding,method,auth_type,credentials_enc,body_template,headers,mappings,schedule_minutes,enabled,timeout_ms,retry_count,push_enabled,push_url,push_method,push_body_template,push_response_id_path) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.tenantId, b.name.trim(), b.base_url, b.target_entity || 'customers', b.response_encoding || 'auto', b.method || 'GET', b.auth_type || 'bearer',
        encryptCredentials(b.credentials), b.body_template || null, JSON.stringify(b.headers || {}),
        JSON.stringify(b.mappings), b.schedule_minutes || null, !!b.enabled, b.timeout_ms || 30000, b.retry_count ?? 3,
        !!b.push_enabled, b.push_url || null, b.push_method || 'POST', b.push_body_template || null, b.push_response_id_path || 'id']);
    const { rows } = await query('SELECT * FROM connectors WHERE id = ?', [result.rows.insertId]); res.status(201).json({ connector: redactConnector(rows[0]) });
  } catch (e) { next(e); }
});
connectorsRouter.patch('/:id', guard, async (req, res, next) => {
  try {
    const b = req.body || {}; const targetEntity = b.target_entity || 'customers'; if (b.mappings && validateMappings(b.mappings, targetEntity).length) return res.status(400).json({ error: validateMappings(b.mappings, targetEntity).join('; ') });
    const fields = ['name','base_url','target_entity','response_encoding','method','auth_type','body_template','headers','mappings','schedule_minutes','enabled','timeout_ms','retry_count','push_enabled','push_url','push_method','push_body_template','push_response_id_path']; const sets = [], params = [];
    for (const f of fields) if (b[f] !== undefined) { sets.push(`${f} = ?`); params.push(['headers','mappings'].includes(f) ? JSON.stringify(b[f]) : b[f]); }
    if (b.credentials !== undefined) { sets.push('credentials_enc = ?'); params.push(encryptCredentials(b.credentials)); }
    if (!sets.length) return res.status(400).json({ error: 'Καμία αλλαγή' }); params.push(req.params.id, req.user.tenantId);
    await query(`UPDATE connectors SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
    const { rows } = await query('SELECT * FROM connectors WHERE id = ? AND tenant_id = ?', [req.params.id, req.user.tenantId]); if (!rows.length) return res.status(404).json({ error: 'Δεν βρέθηκε' }); res.json({ connector: redactConnector(rows[0]) });
  } catch (e) { next(e); }
});
connectorsRouter.delete('/:id', guard, async (req, res, next) => { try { await query('DELETE FROM connectors WHERE id = ? AND tenant_id = ?', [req.params.id, req.user.tenantId]); res.status(204).end(); } catch (e) { next(e); } });
connectorsRouter.post('/:id/run', guard, async (req, res, next) => {
  try {
    const result = await runSync(req.user.tenantId, req.params.id);
    await logAuditFromReq(query, req, {
      action: 'sync', entityType: 'connector', entityId: Number(req.params.id),
      summary: `Εκτέλεση σύνδεσης ERP #${req.params.id}`,
      details: { status: result.status, recordsSeen: result.recordsSeen, recordsUpserted: result.recordsUpserted },
    });
    res.json(result);
  } catch (e) {
    if (e.code === 'SYNC_IN_PROGRESS') return res.status(409).json({ error: e.message });
    return res.status(422).json({ error: e.message || 'Ο συγχρονισμός απέτυχε' });
  }
});
connectorsRouter.post('/:id/runs/:runId/retry', guard, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, status FROM sync_runs WHERE id = ? AND connector_id = ? AND tenant_id = ?',
      [req.params.runId, req.params.id, req.user.tenantId],
    );
    if (!rows.length) return res.status(404).json({ error: 'Δεν βρέθηκε το run' });
    if (!canRetrySyncRun(rows[0].status)) return res.status(409).json({ error: 'Μπορούν να επαναληφθούν μόνο αποτυχημένα runs' });
    const result = await runSync(req.user.tenantId, req.params.id);
    await logAuditFromReq(query, req, {
      action: 'sync', entityType: 'connector', entityId: Number(req.params.id),
      summary: `Επανάληψη συγχρονισμού σύνδεσης #${req.params.id}`,
      details: { retryOf: Number(req.params.runId), status: result.status, recordsSeen: result.recordsSeen, recordsUpserted: result.recordsUpserted },
    });
    res.json(result);
  } catch (e) {
    if (e.code === 'SYNC_IN_PROGRESS') return res.status(409).json({ error: e.message });
    return res.status(422).json({ error: e.message || 'Η επανάληψη απέτυχε' });
  }
});
connectorsRouter.get('/:id/runs', guard, async (req, res, next) => { try { const { rows } = await query('SELECT * FROM sync_runs WHERE connector_id = ? AND tenant_id = ? ORDER BY started_at DESC LIMIT 50', [req.params.id, req.user.tenantId]); res.json({ runs: rows }); } catch (e) { next(e); } });

// ---- Two-way sync (outbound push to ERP) -----------------------------------
connectorsRouter.get('/:id/outbox', guard, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM sync_outbox WHERE connector_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.params.id, req.user.tenantId],
    );
    res.json({ outbox: rows });
  } catch (e) { next(e); }
});
connectorsRouter.post('/:id/outbox/:jobId/retry', guard, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id FROM sync_outbox WHERE id = ? AND connector_id = ? AND tenant_id = ?',
      [req.params.jobId, req.params.id, req.user.tenantId],
    );
    if (!rows.length) return res.status(404).json({ error: 'Δεν βρέθηκε' });
    await query(
      "UPDATE sync_outbox SET status = 'pending', next_attempt_at = NOW() WHERE id = ?",
      [req.params.jobId],
    );
    await processOutbox();
    const { rows: after } = await query('SELECT * FROM sync_outbox WHERE id = ?', [req.params.jobId]);
    res.json({ job: after[0] });
  } catch (e) { next(e); }
});
// Dry-run: renders the push body template against a sample record so the
// user can validate the JSON before enabling two-way sync for real.
connectorsRouter.post('/:id/push-preview', guard, async (req, res, next) => {
  try {
    const sample = req.body?.sample || {};
    const template = req.body?.template ?? '';
    const rendered = renderPushTemplate(template, sample);
    res.json({ ok: true, rendered });
  } catch (e) {
    res.status(400).json({ error: `Μη έγκυρο template: ${e.message}` });
  }
});
