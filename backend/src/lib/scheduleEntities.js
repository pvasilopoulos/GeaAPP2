// Registry of entities usable by SCHEDULE-based notification rule triggers
// ("N minutes/hours/days before or after <date field> on <entity>") — the
// counterpart to notificationEvents.js's EVENT_CATALOG (which covers
// discrete "something just happened" triggers). Together the two catalogs
// let the rule builder express both "quote just got created" (event) and
// "quote expires in 3 days" (schedule) with the same conditions/recipients/
// channels/template machinery.
//
// `dateFields` values are raw SQL expressions (not just column names) so a
// computed field like "last customer activity" works exactly like a real
// column. `buildContext(row)` reshapes the SELECTed row into the same
// context shape used by the matching event-based flow, so `{{variables}}`
// and rule conditions behave identically regardless of trigger type.
export const SCHEDULE_ENTITIES = {
  quote: {
    label: 'Προσφορά',
    table: 'quotes q',
    joins: 'LEFT JOIN customers c ON c.id = q.customer_id',
    // Only rows still "live" are worth evaluating on a schedule — a
    // cancelled/accepted/rejected/already-expired quote won't fire again.
    activeFilter: "q.status NOT IN ('cancelled', 'accepted', 'rejected', 'expired')",
    select: 'q.id, q.tenant_id, q.customer_id, q.created_by, q.seller_id, q.total, q.status, q.valid_until, q.created_at, c.full_name AS customer_name',
    dateFields: {
      valid_until: { label: 'Ημερομηνία λήξης ισχύος', expr: 'q.valid_until' },
      created_at: { label: 'Ημερομηνία δημιουργίας', expr: 'q.created_at' },
    },
    fields: [
      { key: 'customerName', label: 'Όνομα πελάτη', type: 'text' },
      { key: 'total', label: 'Συνολική αξία', type: 'number' },
      { key: 'status', label: 'Κατάσταση', type: 'text' },
      { key: 'customerPhone', label: 'Τηλέφωνο πελάτη', type: 'text' },
      { key: 'customerMobile', label: 'Κινητό πελάτη', type: 'text' },
      { key: 'customerEmail', label: 'Email πελάτη', type: 'text' },
    ],
    dynamicRecipients: ['created_by', 'seller'],
    buildContext(row) {
      return {
        entityId: row.id, customerId: row.customer_id, customerName: row.customer_name,
        total: row.total, status: row.status,
        createdByUserId: row.created_by, sellerEmployeeId: row.seller_id,
      };
    },
  },
  booking: {
    label: 'Ραντεβού / Κράτηση',
    table: 'bookings b',
    joins: 'LEFT JOIN customers c ON c.id = b.customer_id LEFT JOIN branches br ON br.id = b.branch_id LEFT JOIN spaces s ON s.id = b.space_id',
    activeFilter: "b.status <> 'cancelled'",
    select: 'b.id, b.tenant_id, b.customer_id, b.employee_id, b.starts_at, br.name AS branch_name, s.name AS space_name, c.full_name AS customer_name',
    dateFields: {
      starts_at: { label: 'Ώρα έναρξης', expr: 'b.starts_at' },
    },
    fields: [
      { key: 'customerName', label: 'Όνομα πελάτη', type: 'text' },
      { key: 'branchName', label: 'Υποκατάστημα', type: 'text' },
      { key: 'spaceName', label: 'Χώρος', type: 'text' },
      { key: 'customerPhone', label: 'Τηλέφωνο πελάτη', type: 'text' },
      { key: 'customerMobile', label: 'Κινητό πελάτη', type: 'text' },
      { key: 'customerEmail', label: 'Email πελάτη', type: 'text' },
    ],
    dynamicRecipients: ['assigned_user'],
    buildContext(row) {
      return {
        entityId: row.id, customerId: row.customer_id, customerName: row.customer_name,
        branchName: row.branch_name, spaceName: row.space_name, assignedEmployeeId: row.employee_id,
      };
    },
  },
  follow_up: {
    label: 'Follow-up / Υπενθύμιση',
    table: 'follow_ups f',
    joins: 'LEFT JOIN customers c ON c.id = f.customer_id',
    activeFilter: "f.status = 'open'",
    select: 'f.id, f.tenant_id, f.customer_id, f.title, f.due_at, f.assigned_employee_id, c.full_name AS customer_name',
    dateFields: {
      due_at: { label: 'Προθεσμία', expr: 'f.due_at' },
    },
    fields: [
      { key: 'title', label: 'Τίτλος υπενθύμισης', type: 'text' },
      { key: 'customerName', label: 'Όνομα πελάτη', type: 'text' },
      { key: 'customerPhone', label: 'Τηλέφωνο πελάτη', type: 'text' },
      { key: 'customerMobile', label: 'Κινητό πελάτη', type: 'text' },
      { key: 'customerEmail', label: 'Email πελάτη', type: 'text' },
    ],
    dynamicRecipients: ['assigned_user'],
    buildContext(row) {
      return {
        entityId: row.id, customerId: row.customer_id, customerName: row.customer_name,
        title: row.title, assignedEmployeeId: row.assigned_employee_id,
      };
    },
  },
  customer: {
    label: 'Πελάτης',
    table: 'customers c',
    joins: '',
    activeFilter: "c.status <> 'inactive'",
    select: 'c.id, c.tenant_id, c.full_name AS customer_name, c.assigned_employee_id, c.created_at, c.last_visit_at',
    dateFields: {
      created_at: { label: 'Ημερομηνία δημιουργίας', expr: 'c.created_at' },
      last_activity_at: {
        label: 'Τελευταία δραστηριότητα (ή δημιουργία, αν καμία)',
        expr: 'COALESCE((SELECT MAX(a.created_at) FROM activities a WHERE a.customer_id = c.id), c.created_at)',
      },
    },
    fields: [
      { key: 'customerName', label: 'Όνομα πελάτη', type: 'text' },
      { key: 'customerPhone', label: 'Τηλέφωνο πελάτη', type: 'text' },
      { key: 'customerMobile', label: 'Κινητό πελάτη', type: 'text' },
      { key: 'customerEmail', label: 'Email πελάτη', type: 'text' },
    ],
    dynamicRecipients: ['assigned_user'],
    buildContext(row) {
      return { entityId: row.id, customerId: row.id, customerName: row.customer_name, assignedEmployeeId: row.assigned_employee_id };
    },
  },
};

export function scheduleEntityCatalogList() {
  return Object.entries(SCHEDULE_ENTITIES).map(([key, meta]) => ({
    key,
    label: meta.label,
    fields: meta.fields,
    dateFields: Object.entries(meta.dateFields).map(([fieldKey, f]) => ({ key: fieldKey, label: f.label })),
    dynamicRecipients: meta.dynamicRecipients,
  }));
}
