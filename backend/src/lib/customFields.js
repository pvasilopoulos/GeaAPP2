// Custom field definitions: default templates + per-tenant cloning, plus a
// helper to map a typed value onto the correct value column.

export const CUSTOM_FIELD_TEMPLATES = [
  { entity_type: 'customer', name: 'Αριθμός μέλους', key: 'member_no', field_type: 'text', searchable: true, filterable: true, visible_in_list: true, section: 'Συνδρομή', sort_order: 1 },
  { entity_type: 'customer', name: 'Τύπος συνδρομής', key: 'membership_type', field_type: 'select', filterable: true, visible_in_list: true, section: 'Συνδρομή', sort_order: 2, settings: { options: ['Basic', 'Premium', 'Business', 'Enterprise'] } },
  { entity_type: 'customer', name: 'Ημερομηνία λήξης', key: 'expiry_date', field_type: 'date', filterable: true, section: 'Συνδρομή', sort_order: 3 },
  { entity_type: 'customer', name: 'Νόμιμος εκπρόσωπος', key: 'legal_rep', field_type: 'text', searchable: true, section: 'Εταιρικά στοιχεία', sort_order: 4, settings: { showIf: { field: 'customer_type', equals: 'company' } } },
  { entity_type: 'customer', name: 'ΓΕΜΗ', key: 'gemi', field_type: 'text', searchable: true, section: 'Εταιρικά στοιχεία', sort_order: 5, settings: { showIf: { field: 'customer_type', equals: 'company' } } },
  { entity_type: 'branch', name: 'Ώρες λειτουργίας', key: 'opening_hours', field_type: 'text', section: 'Γενικά', sort_order: 1 },
  { entity_type: 'branch', name: 'Θέσεις parking', key: 'parking', field_type: 'number', filterable: true, section: 'Γενικά', sort_order: 2 },
  { entity_type: 'space', name: 'Χωρητικότητα', key: 'capacity', field_type: 'number', filterable: true, visible_in_list: true, section: 'Χαρακτηριστικά', sort_order: 1 },
  { entity_type: 'space', name: 'Projector', key: 'projector', field_type: 'boolean', filterable: true, section: 'Χαρακτηριστικά', sort_order: 2 },
  { entity_type: 'space', name: 'Video conferencing', key: 'video_conf', field_type: 'boolean', filterable: true, section: 'Χαρακτηριστικά', sort_order: 3 },
];

// Inserts the default custom field definitions for a tenant; returns { "entity:key": id }.
export async function insertTenantCustomFields(query, tenantId) {
  const rows = CUSTOM_FIELD_TEMPLATES.map((d) => [
    tenantId, d.entity_type, d.name, d.key, d.field_type, !!d.required, !!d.searchable,
    !!d.filterable, !!d.visible_in_list, JSON.stringify(d.settings || {}), d.section, d.sort_order, 1,
  ]);
  await query(
    'INSERT INTO custom_field_definitions (tenant_id, entity_type, name, `key`, field_type, required, searchable, filterable, visible_in_list, settings, section, sort_order, active) VALUES ?',
    [rows]);
  const res = await query('SELECT id, entity_type, `key` FROM custom_field_definitions WHERE tenant_id = ?', [tenantId]);
  const map = {};
  for (const r of res.rows) map[`${r.entity_type}:${r.key}`] = r.id;
  return map;
}

// Maps a field type + raw value onto the five typed value columns.
export function valueColumns(fieldType, value) {
  const out = { text_value: null, number_value: null, date_value: null, boolean_value: null, json_value: null };
  if (value === null || value === undefined || value === '') return out;
  switch (fieldType) {
    case 'number': case 'decimal': case 'currency': case 'percent':
      out.number_value = Number(value); break;
    case 'date': case 'datetime':
      out.date_value = String(value).slice(0, 10); break;
    case 'boolean':
      out.boolean_value = value ? 1 : 0; break;
    case 'multiselect': case 'checkbox':
      out.json_value = JSON.stringify(Array.isArray(value) ? value : [value]); break;
    default:
      out.text_value = String(value);
  }
  return out;
}
