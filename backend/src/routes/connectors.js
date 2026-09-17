import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { encryptCredentials, redactConnector } from '../lib/connectorCrypto.js';
import { validateMappings } from '../lib/mapping.js';
import { runSync } from '../lib/sync.js';

export const connectorsRouter = Router();
const guard = authorize(PERMISSIONS.SETTINGS_MANAGE);
connectorsRouter.get('/', guard, async (req, res, next) => { try { const { rows } = await query('SELECT * FROM connectors WHERE tenant_id = ? ORDER BY name', [req.user.tenantId]); res.json({ connectors: rows.map(redactConnector) }); } catch (e) { next(e); } });
connectorsRouter.post('/', guard, async (req, res, next) => {
  try {
    const b = req.body || {}; const targetEntity = b.target_entity || 'customers'; const errors = validateMappings(b.mappings, targetEntity);
    if (!b.name || !b.base_url || errors.length) return res.status(400).json({ error: errors.join('; ') || 'Όνομα και URL απαιτούνται' });
    const result = await query(`INSERT INTO connectors (tenant_id,name,base_url,target_entity,method,auth_type,credentials_enc,body_template,headers,mappings,schedule_minutes,enabled,timeout_ms,retry_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.tenantId, b.name.trim(), b.base_url, b.target_entity || 'customers', b.method || 'GET', b.auth_type || 'bearer',
        encryptCredentials(b.credentials), b.body_template || null, JSON.stringify(b.headers || {}),
        JSON.stringify(b.mappings), b.schedule_minutes || null, !!b.enabled, b.timeout_ms || 30000, b.retry_count ?? 3]);
    const { rows } = await query('SELECT * FROM connectors WHERE id = ?', [result.rows.insertId]); res.status(201).json({ connector: redactConnector(rows[0]) });
  } catch (e) { next(e); }
});
connectorsRouter.patch('/:id', guard, async (req, res, next) => {
  try {
    const b = req.body || {}; const targetEntity = b.target_entity || 'customers'; if (b.mappings && validateMappings(b.mappings, targetEntity).length) return res.status(400).json({ error: validateMappings(b.mappings, targetEntity).join('; ') });
    const fields = ['name','base_url','target_entity','method','auth_type','body_template','headers','mappings','schedule_minutes','enabled','timeout_ms','retry_count']; const sets = [], params = [];
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
    res.json(await runSync(req.user.tenantId, req.params.id));
  } catch (e) {
    if (e.code === 'SYNC_IN_PROGRESS') return res.status(409).json({ error: e.message });
    return res.status(422).json({ error: e.message || 'Ο συγχρονισμός απέτυχε' });
  }
});
connectorsRouter.get('/:id/runs', guard, async (req, res, next) => { try { const { rows } = await query('SELECT * FROM sync_runs WHERE connector_id = ? AND tenant_id = ? ORDER BY started_at DESC LIMIT 50', [req.params.id, req.user.tenantId]); res.json({ runs: rows }); } catch (e) { next(e); } });
