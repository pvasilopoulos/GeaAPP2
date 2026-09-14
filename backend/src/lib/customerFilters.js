import { normalize } from './normalize.js';
import { searchClause } from './search.js';

// Keyset/order configurations shared by search and export.
export const SORTS = {
  last_visit: { expr: 'c.last_visit_sort', dir: 'DESC', cmp: '<' },
  value:      { expr: 'c.total_value',     dir: 'DESC', cmp: '<' },
  created:    { expr: 'c.created_at',       dir: 'DESC', cmp: '<' },
  name:       { expr: 'c.full_name',        dir: 'ASC',  cmp: '>' },
};

// Builds shared WHERE predicates + params from request query filters.
export function buildFilters(req) {
  const params = [];
  const where = [];
  const push = (v) => { params.push(v); return '?'; };

  const q = req.query.q ? String(req.query.q).trim() : '';
  const qnorm = q ? normalize(q) : '';
  if (qnorm) {
    const sc = searchClause(qnorm, 'c.search_norm');
    if (sc) { where.push(sc.clause); sc.params.forEach((p) => params.push(p)); }
  }
  if (req.query.status) where.push(`c.status IN (${push(String(req.query.status).split(','))})`);
  if (req.query.customerType) where.push(`c.customer_type = ${push(req.query.customerType)}`);
  if (req.query.isVip === 'true') where.push('c.is_vip = 1');
  if (req.query.employeeId) where.push(`c.assigned_employee_id = ${push(Number(req.query.employeeId))}`);
  if (req.query.lastVisitFrom) where.push(`c.last_visit_at >= ${push(req.query.lastVisitFrom)}`);
  if (req.query.lastVisitTo) where.push(`c.last_visit_at <= ${push(req.query.lastVisitTo)}`);
  if (req.query.tag) {
    where.push(`EXISTS (SELECT 1 FROM customer_tags ct JOIN tags t ON t.id = ct.tag_id
      WHERE ct.customer_id = c.id AND t.slug = ${push(req.query.tag)})`);
  }
  if (req.query.branchId) {
    where.push(`EXISTS (SELECT 1 FROM customer_branches cb
      WHERE cb.customer_id = c.id AND cb.branch_id = ${push(Number(req.query.branchId))})`);
  }
  if (req.query.spaceId) {
    where.push(`EXISTS (SELECT 1 FROM customer_spaces cs
      WHERE cs.customer_id = c.id AND cs.space_id = ${push(Number(req.query.spaceId))})`);
  }
  return { params, where, qnorm };
}

export function resolveSort(req) {
  const key = req.query.sort && SORTS[req.query.sort] ? req.query.sort : 'last_visit';
  const cfg = SORTS[key];
  return { key, cfg, idDir: cfg.dir === 'ASC' ? 'ASC' : 'DESC' };
}
