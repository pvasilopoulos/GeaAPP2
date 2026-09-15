import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { BRANCH_STATUSES, SPACE_STATUSES, AMENITIES, WEEKDAYS, CONTACT_ROLES } from '../lib/masterData.js';
import { loadActiveDefinitions } from '../lib/customFields.js';
import { clientTenantSettings } from '../lib/tenantSettings.js';

export const metaRouter = Router();
metaRouter.use(authorize(PERMISSIONS.CUSTOMERS_READ));

// GET /api/meta — data needed to render filters and selectors (tenant-scoped).
metaRouter.get('/', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const [tags, employees, cities, custCities, spaceTypes, total, tenantRow] = await Promise.all([
      query('SELECT id, name, slug, color FROM tags ORDER BY name'),
      query('SELECT id, full_name FROM employees WHERE tenant_id = ? ORDER BY full_name', [tenantId]),
      query(`SELECT DISTINCT city FROM branches WHERE tenant_id = ? AND city IS NOT NULL ORDER BY city`, [tenantId]),
      query(`SELECT DISTINCT city FROM customers WHERE tenant_id = ? AND city IS NOT NULL ORDER BY city`, [tenantId]),
      query(`SELECT DISTINCT space_type FROM spaces WHERE tenant_id = ? AND space_type IS NOT NULL ORDER BY space_type`, [tenantId]),
      query('SELECT COUNT(*) AS total FROM customers WHERE tenant_id = ?', [tenantId]),
      query('SELECT locale, timezone, currency, settings FROM tenants WHERE id = ?', [tenantId]),
    ]);
    res.json({
      tags: tags.rows,
      employees: employees.rows,
      branchCities: cities.rows.map((r) => r.city),
      customerCities: custCities.rows.map((r) => r.city),
      spaceTypes: spaceTypes.rows.map((r) => r.space_type),
      statuses: [
        { value: 'active', label: 'Ενεργός' },
        { value: 'inactive', label: 'Ανενεργός' },
        { value: 'prospect', label: 'Υποψήφιος' },
      ],
      customerTypes: [
        { value: 'individual', label: 'Ιδιώτης' },
        { value: 'company', label: 'Εταιρεία' },
      ],
      estimatedCustomers: Number(total.rows[0].total),
      branchStatuses: BRANCH_STATUSES,
      spaceStatuses: SPACE_STATUSES,
      amenities: AMENITIES,
      weekdays: WEEKDAYS,
      contactRoles: CONTACT_ROLES,
      tenant: {
        locale: tenantRow.rows[0]?.locale || 'el',
        timezone: tenantRow.rows[0]?.timezone || 'Europe/Athens',
        currency: tenantRow.rows[0]?.currency || 'EUR',
        settings: clientTenantSettings(tenantRow.rows[0]?.settings),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/meta/custom-fields?entity= — active definitions (no settings.manage required).
metaRouter.get('/custom-fields', async (req, res, next) => {
  try {
    const entity = ['customer', 'branch', 'space'].includes(req.query.entity) ? req.query.entity : 'customer';
    const fields = await loadActiveDefinitions(query, { tenantId: req.user.tenantId, entityType: entity });
    res.json({ fields });
  } catch (err) { next(err); }
});
