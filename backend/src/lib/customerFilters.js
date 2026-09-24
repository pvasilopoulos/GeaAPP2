import { normalize } from './normalize.js';
import { searchClause } from './search.js';

// Keyset/order configurations shared by search and export.
export const SORTS = {
  last_visit: { expr: 'c.last_visit_sort', dir: 'DESC', cmp: '<' },
  value:      { expr: 'c.total_value',     dir: 'DESC', cmp: '<' },
  created:    { expr: 'c.created_at',       dir: 'DESC', cmp: '<' },
  name:       { expr: 'c.full_name',        dir: 'ASC',  cmp: '>' },
  code:       { expr: 'c.code',             dir: 'ASC',  cmp: '>' },
  city:       { expr: 'c.city',             dir: 'ASC',  cmp: '>' },
  status:     { expr: 'c.status',           dir: 'ASC',  cmp: '>' },
  branches:   { expr: 'c.branches_count',   dir: 'DESC', cmp: '<' },
  spaces:     { expr: 'c.spaces_count',     dir: 'DESC', cmp: '<' },
  bookings:   { expr: 'c.bookings_count',   dir: 'DESC', cmp: '<' },
};

// Returns customer ids matching the term in any searchable customer-related
// entity. Each source uses its own FULLTEXT index before results are joined
// back to the customer list.
export function customerSearchPredicate(qnorm, tenantId) {
  const customerSearch = searchClause(qnorm, 'c_match.search_norm');
  const branchSearch = searchClause(qnorm, 'b.search_norm');
  const spaceSearch = searchClause(qnorm, 's.search_norm');
  if (!customerSearch || !branchSearch || !spaceSearch) return null;

  return {
    clause: `c.id IN (
      SELECT customer_id FROM (
        SELECT c_match.id AS customer_id
        FROM customers c_match
        WHERE c_match.tenant_id = ? AND ${customerSearch.clause}
        UNION ALL
        SELECT b.customer_id
        FROM branches b
        WHERE b.tenant_id = ? AND ${branchSearch.clause}
        UNION ALL
        SELECT s.customer_id
        FROM spaces s
        WHERE s.tenant_id = ? AND ${spaceSearch.clause}
      ) AS search_hits
    )`,
    params: [
      tenantId, ...customerSearch.params,
      tenantId, ...branchSearch.params,
      tenantId, ...spaceSearch.params,
    ],
  };
}

// Builds shared WHERE predicates + params from request query filters.
export function buildFilters(req) {
  const params = [];
  const where = [];
  const push = (v) => { params.push(v); return '?'; };

  // Tenant scoping — every customer query is bound to the caller's tenant.
  where.push(`c.tenant_id = ${push(req.user.tenantId)}`);

  const q = req.query.q ? String(req.query.q).trim() : '';
  const qnorm = q ? normalize(q) : '';
  if (qnorm) {
    const search = customerSearchPredicate(qnorm, req.user.tenantId);
    if (search) {
      where.push(search.clause);
      params.push(...search.params);
    }
  }
  const columnFilters = {
    name: 'c.full_name', code: 'c.code', status: 'c.status', city: 'c.city',
    email: 'c.email', phone: 'c.phone', mobile: 'c.mobile', tax_id: 'c.tax_id',
    address_line: 'c.address_line', erp_id: 'c.erp_id',
  };
  Object.entries(columnFilters).forEach(([key, column]) => {
    const value = String(req.query[`column_${key}`] || '').trim();
    if (value) where.push(`LOWER(${column}) LIKE ${push(`%${value.toLowerCase()}%`)}`);
  });
  if (req.query.status) where.push(`c.status IN (${push(String(req.query.status).split(','))})`);
  if (req.query.customerType) where.push(`c.customer_type = ${push(req.query.customerType)}`);
  if (req.query.isVip === 'true') where.push('c.is_vip = 1');
  if (req.query.employeeId) where.push(`c.assigned_employee_id = ${push(Number(req.query.employeeId))}`);
  if (req.query.city) where.push(`c.city = ${push(req.query.city)}`);
  if (req.query.email) where.push(`LOWER(c.email) LIKE ${push(`%${String(req.query.email).toLowerCase()}%`)}`);
  if (req.query.phone) where.push(`(c.phone LIKE ${push(`%${req.query.phone}%`)} OR c.mobile LIKE ${push(`%${req.query.phone}%`)})`);
  if (req.query.erpId) where.push(`c.erp_id LIKE ${push(`%${req.query.erpId}%`)}`);
  if (req.query.createdFrom) where.push(`c.registered_at >= ${push(req.query.createdFrom)}`);
  if (req.query.createdTo) where.push(`c.registered_at <= ${push(`${req.query.createdTo} 23:59:59`)}`);
  if (req.query.lastVisitFrom) where.push(`c.last_visit_at >= ${push(req.query.lastVisitFrom)}`);
  if (req.query.lastVisitTo) where.push(`c.last_visit_at <= ${push(`${req.query.lastVisitTo} 23:59:59`)}`);
  if (req.query.noVisits === 'true') where.push('c.last_visit_at IS NULL');
  if (req.query.valueMin) where.push(`c.total_value >= ${push(Number(req.query.valueMin))}`);
  if (req.query.valueMax) where.push(`c.total_value <= ${push(Number(req.query.valueMax))}`);
  if (req.query.minBranches) where.push(`c.branches_count >= ${push(Number(req.query.minBranches))}`);
  if (req.query.minSpaces) where.push(`c.spaces_count >= ${push(Number(req.query.minSpaces))}`);
  if (req.query.tag) {
    where.push(`EXISTS (SELECT 1 FROM customer_tags ct JOIN tags t ON t.id = ct.tag_id
      WHERE ct.customer_id = c.id AND t.slug = ${push(req.query.tag)})`);
  }
  // Relationship filters over the customer's OWN branches/spaces.
  if (req.query.branchCity) {
    where.push(`EXISTS (SELECT 1 FROM branches b
      WHERE b.customer_id = c.id AND b.city = ${push(req.query.branchCity)})`);
  }
  if (req.query.spaceType) {
    where.push(`EXISTS (SELECT 1 FROM spaces s
      WHERE s.customer_id = c.id AND s.space_type = ${push(req.query.spaceType)})`);
  }
  return { params, where, qnorm };
}

export function resolveSort(req) {
  const key = req.query.sort && SORTS[req.query.sort] ? req.query.sort : 'last_visit';
  const cfg = SORTS[key];
  const direction = String(req.query.sortDir || '').toUpperCase();
  const dir = direction === 'ASC' || direction === 'DESC' ? direction : cfg.dir;
  return { key, cfg: { ...cfg, dir, cmp: dir === 'ASC' ? '>' : '<' }, idDir: dir };
}
