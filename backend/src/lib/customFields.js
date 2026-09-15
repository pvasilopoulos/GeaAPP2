// Custom field definitions: default templates + per-tenant cloning, plus a
// helper to map a typed value onto the correct value column.

export const CUSTOM_FIELD_TEMPLATES = [
  { entity_type: 'customer', name: 'Αριθμός μέλους', key: 'member_no', field_type: 'text', searchable: true, filterable: true, visible_in_list: true, section: 'Συνδρομή', sort_order: 1 },
  { entity_type: 'customer', name: 'Τύπος συνδρομής', key: 'membership_type', field_type: 'select', filterable: true, visible_in_list: true, section: 'Συνδρομή', sort_order: 2, settings: { options: ['Basic', 'Premium', 'Business', 'Enterprise'] } },
  { entity_type: 'customer', name: 'Ημερομηνία λήξης', key: 'expiry_date', field_type: 'date', filterable: true, section: 'Συνδρομή', sort_order: 3 },
  { entity_type: 'customer', name: 'Νόμιμος εκπρόσωπος', key: 'legal_rep', field_type: 'text', searchable: true, section: 'Εταιρικά στοιχεία', sort_order: 4, settings: { showIf: { field: 'customer_type', equals: 'company' } } },
  { entity_type: 'customer', name: 'ΓΕΜΗ', key: 'gemi', field_type: 'text', searchable: true, section: 'Εταιρικά στοιχεία', sort_order: 5, settings: { showIf: { field: 'customer_type', equals: 'company' } } },
  { entity_type: 'branch', name: 'Κωδικός εισόδου', key: 'access_code', field_type: 'text', section: 'Πρόσβαση', sort_order: 1 },
  { entity_type: 'branch', name: 'Θέσεις parking', key: 'parking', field_type: 'number', filterable: true, section: 'Γενικά', sort_order: 2 },
  { entity_type: 'space', name: 'Ηχοσύστημα', key: 'sound_system', field_type: 'boolean', filterable: true, section: 'Χαρακτηριστικά', sort_order: 1 },
  { entity_type: 'space', name: 'Catering επιτρέπεται', key: 'catering', field_type: 'boolean', filterable: true, section: 'Χαρακτηριστικά', sort_order: 2 },
  { entity_type: 'space', name: 'Σημειώσεις εξοπλισμού', key: 'equipment_notes', field_type: 'long_text', section: 'Χαρακτηριστικά', sort_order: 3 },
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

const VALUE_TABLE = {
  customer: { table: 'customer_custom_field_values', idCol: 'customer_id' },
  branch: { table: 'branch_custom_field_values', idCol: 'branch_id' },
  space: { table: 'space_custom_field_values', idCol: 'space_id' },
};

function parseSettings(r) {
  if (typeof r.settings === 'string') { try { r.settings = JSON.parse(r.settings); } catch { r.settings = {}; } }
  if (typeof r.json_value === 'string') { try { r.json_value = JSON.parse(r.json_value); } catch { /* keep */ } }
  return r;
}

// Definitions + stored values for one entity instance (read path for forms).
export async function loadEntityCustomFields(query, { tenantId, entityType, entityId }) {
  const meta = VALUE_TABLE[entityType];
  if (!meta) return [];
  const { rows } = await query(
    `SELECT d.id, d.name, d.\`key\`, d.field_type, d.section, d.sort_order, d.settings, d.required,
            d.searchable, d.filterable, d.active,
            v.text_value, v.number_value, v.date_value, v.boolean_value, v.json_value
     FROM custom_field_definitions d
     LEFT JOIN ${meta.table} v ON v.field_definition_id = d.id AND v.${meta.idCol} = ?
     WHERE d.entity_type = ? AND d.tenant_id = ? AND d.active = 1
     ORDER BY d.sort_order, d.id`, [entityId, entityType, tenantId]);
  return rows.map(parseSettings);
}

export async function loadActiveDefinitions(query, { tenantId, entityType }) {
  const { rows } = await query(
    `SELECT id, name, \`key\`, field_type, section, sort_order, settings, required,
            searchable, filterable, active
     FROM custom_field_definitions
     WHERE entity_type = ? AND tenant_id = ? AND active = 1
     ORDER BY sort_order, id`, [entityType, tenantId]);
  return rows.map(parseSettings);
}

export async function saveEntityCustomFields(query, { tenantId, entityType, entityId, values }) {
  const meta = VALUE_TABLE[entityType];
  if (!meta) return;
  const defs = (await query(
    'SELECT id, field_type FROM custom_field_definitions WHERE tenant_id = ? AND entity_type = ?',
    [tenantId, entityType])).rows;
  const byId = new Map(defs.map((d) => [String(d.id), d]));
  for (const [defId, val] of Object.entries(values || {})) {
    const def = byId.get(String(defId));
    if (!def) continue;
    const c = valueColumns(def.field_type, val);
    const empty = c.text_value == null && c.number_value == null && c.date_value == null
      && c.boolean_value == null && c.json_value == null;
    if (empty) {
      await query(`DELETE FROM ${meta.table} WHERE ${meta.idCol}=? AND field_definition_id=?`, [entityId, defId]);
    } else {
      await query(
        `INSERT INTO ${meta.table}
          (${meta.idCol}, field_definition_id, text_value, number_value, date_value, boolean_value, json_value)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE text_value=VALUES(text_value), number_value=VALUES(number_value),
           date_value=VALUES(date_value), boolean_value=VALUES(boolean_value), json_value=VALUES(json_value)`,
        [entityId, defId, c.text_value, c.number_value, c.date_value, c.boolean_value, c.json_value]);
    }
  }
}
