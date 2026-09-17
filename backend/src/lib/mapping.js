export function getPath(value, path) {
  if (!path) return value;
  const parts = String(path).replace(/\[([^\]]+)\]/g, '.$1').split('.').filter(Boolean);
  return parts.reduce((v, p) => v == null ? undefined : v[p], value);
}
export function validateMappings(mappings = {}, targetEntity = null) {
  const errors = [];
  const entities = targetEntity && ['customers', 'branches', 'spaces'].includes(targetEntity)
    ? [targetEntity] : ['customers', 'branches', 'spaces'];
  for (const entity of entities) {
    const map = mappings[entity];
    if (!map || typeof map !== 'object') { errors.push(`${entity} mapping is required`); continue; }
    if (!map.erp_id) errors.push(`${entity}.erp_id mapping is required`);
    if (!map.name && entity !== 'customers') errors.push(`${entity}.name mapping is required`);
    if (entity === 'customers' && !map.code && !map.name) errors.push('customers.code or customers.name mapping is required');
  }
  return errors;
}
export function mapRecord(record, mapping) {
  return Object.fromEntries(Object.entries(mapping || {}).map(([field, path]) => [field, getPath(record, path)]));
}
