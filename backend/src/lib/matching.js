export function normalizeErpId(value) { return value == null ? null : String(value).trim() || null; }
export function buildEntityKey(tenantId, entity, erpId) { return `${tenantId}:${entity}:${normalizeErpId(erpId) || ''}`; }
export function ensureParent(record, parentField, parentId) {
  if (!parentId) throw new Error(`Missing ${parentField} parent`);
  return { ...record, [parentField]: parentId };
}
