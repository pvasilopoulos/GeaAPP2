import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import {
  AUDIT_ENTITY_TYPES, buildAuditFilters, nextAuditCursor, clampLimit,
} from '../lib/audit.js';
import { parseDetails } from '../lib/activityDiff.js';

export const auditRouter = Router();
auditRouter.use(authorize(PERMISSIONS.SETTINGS_MANAGE));

auditRouter.get('/', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const limit = clampLimit(req.query.limit, 40, 100);
    const { whereSql, params } = buildAuditFilters(tenantId, {
      from: req.query.from,
      to: req.query.to,
      actorId: req.query.actorId,
      entityType: req.query.entityType,
      q: req.query.q,
      cursor: req.query.cursor,
    });

    const { rows } = await query(
      `SELECT ae.id, ae.actor_user_id, ae.actor_name, ae.action, ae.entity_type,
              ae.entity_id, ae.customer_id, ae.summary, ae.details, ae.ip, ae.created_at,
              c.full_name AS customer_name, c.company AS customer_company
       FROM audit_events ae
       LEFT JOIN customers c ON c.id = ae.customer_id AND c.tenant_id = ae.tenant_id
       WHERE ${whereSql}
       ORDER BY ae.created_at DESC, ae.id DESC
       LIMIT ${limit}`,
      params,
    );

    const actorsRes = await query(
      `SELECT DISTINCT actor_user_id AS id, actor_name AS name
       FROM audit_events
       WHERE tenant_id = ? AND actor_name IS NOT NULL
       ORDER BY actor_name
       LIMIT 200`,
      [tenantId],
    );

    res.json({
      results: rows.map((r) => ({ ...r, details: parseDetails(r.details) })),
      nextCursor: nextAuditCursor(rows, limit),
      actors: actorsRes.rows.filter((a) => a.id != null),
      entityTypes: AUDIT_ENTITY_TYPES,
    });
  } catch (err) { next(err); }
});
