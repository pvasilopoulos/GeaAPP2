// Central catalog of permissions and the default role templates. Permissions
// are enforced server-side (never rely on the client). Roles are cloned per
// tenant at signup so each tenant manages its own roles/permissions.

export const PERMISSIONS = {
  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_WRITE: 'customers.write',
  CUSTOMERS_DELETE: 'customers.delete',
  CUSTOMERS_EXPORT: 'customers.export',
  BRANCHES_READ: 'branches.read',
  SPACES_READ: 'spaces.read',
  REPORTS_READ: 'reports.read',
  SETTINGS_MANAGE: 'settings.manage',
  USERS_MANAGE: 'users.manage',
  ROLES_MANAGE: 'roles.manage',
  TENANT_MANAGE: 'tenant.manage',
  TENANTS_PLATFORM: 'tenants.platform',
  CUSTOMERS_MENU: 'customers.menu', CUSTOMERS_VIEW: 'customers.view', CUSTOMERS_CREATE: 'customers.create', CUSTOMERS_EDIT: 'customers.edit',
  BRANCHES_MENU: 'branches.menu', BRANCHES_VIEW: 'branches.view', BRANCHES_CREATE: 'branches.create', BRANCHES_EDIT: 'branches.edit', BRANCHES_DELETE: 'branches.delete',
  SPACES_MENU: 'spaces.menu', SPACES_VIEW: 'spaces.view', SPACES_CREATE: 'spaces.create', SPACES_EDIT: 'spaces.edit', SPACES_DELETE: 'spaces.delete',
  BOOKINGS_MENU: 'bookings.menu', BOOKINGS_VIEW: 'bookings.view', BOOKINGS_CREATE: 'bookings.create', BOOKINGS_EDIT: 'bookings.edit', BOOKINGS_DELETE: 'bookings.delete',
  PAYMENTS_MENU: 'payments.menu', PAYMENTS_VIEW: 'payments.view', PAYMENTS_CREATE: 'payments.create', PAYMENTS_EDIT: 'payments.edit', PAYMENTS_DELETE: 'payments.delete',
  COMMUNICATIONS_MENU: 'communications.menu', COMMUNICATIONS_VIEW: 'communications.view', COMMUNICATIONS_CREATE: 'communications.create',
  REPORTS_MENU: 'reports.menu', REPORTS_VIEW: 'reports.view', SETTINGS_MENU: 'settings.menu', USERS_MENU: 'users.menu', ROLES_MENU: 'roles.menu',
};

const P = PERMISSIONS;

// Catalog with Greek labels + grouping, used to render the permission editor.
export const PERMISSION_CATALOG = [
  ...[
    ['CUSTOMERS', 'Πελάτες', ['MENU', 'VIEW', 'CREATE', 'EDIT', 'DELETE']],
    ['BRANCHES', 'Υποκαταστήματα', ['MENU', 'VIEW', 'CREATE', 'EDIT', 'DELETE']],
    ['SPACES', 'Χώροι', ['MENU', 'VIEW', 'CREATE', 'EDIT', 'DELETE']],
    ['BOOKINGS', 'Κρατήσεις', ['MENU', 'VIEW', 'CREATE', 'EDIT', 'DELETE']],
    ['PAYMENTS', 'Πληρωμές', ['MENU', 'VIEW', 'CREATE', 'EDIT', 'DELETE']],
    ['COMMUNICATIONS', 'Επικοινωνίες', ['MENU', 'VIEW', 'CREATE']],
  ].flatMap(([prefix, label, actions]) => actions.map((action) => ({
    code: P[`${prefix}_${action}`], label: `${action === 'MENU' ? 'Menu' : action === 'VIEW' ? 'Προβολή' : action === 'CREATE' ? 'Δημιουργία' : action === 'EDIT' ? 'Επεξεργασία' : 'Διαγραφή'} ${label.toLowerCase()}`, group: label,
  }))),
  { code: P.CUSTOMERS_READ, label: 'Προβολή πελατών', group: 'Πελάτες' },
  { code: P.CUSTOMERS_WRITE, label: 'Επεξεργασία πελατών', group: 'Πελάτες' },
  { code: P.CUSTOMERS_DELETE, label: 'Διαγραφή πελατών', group: 'Πελάτες' },
  { code: P.CUSTOMERS_EXPORT, label: 'Εξαγωγή πελατών', group: 'Πελάτες' },
  { code: P.BRANCHES_READ, label: 'Προβολή υποκαταστημάτων', group: 'Υποκαταστήματα & Χώροι' },
  { code: P.SPACES_READ, label: 'Προβολή χώρων', group: 'Υποκαταστήματα & Χώροι' },
  { code: P.REPORTS_READ, label: 'Προβολή αναφορών', group: 'Αναφορές' },
  { code: P.SETTINGS_MANAGE, label: 'Διαχείριση ρυθμίσεων / custom fields', group: 'Διαχείριση' },
  { code: P.USERS_MANAGE, label: 'Διαχείριση χρηστών', group: 'Διαχείριση' },
  { code: P.ROLES_MANAGE, label: 'Διαχείριση ρόλων & δικαιωμάτων', group: 'Διαχείριση' },
  { code: P.TENANT_MANAGE, label: 'Διαχείριση οργανισμού', group: 'Διαχείριση' },
  { code: P.TENANTS_PLATFORM, label: 'Διαχείριση όλων των tenants (πλατφόρμα)', group: 'Πλατφόρμα' },
  { code: P.REPORTS_MENU, label: 'Menu αναφορών', group: 'Αναφορές' },
  { code: P.REPORTS_VIEW, label: 'Προβολή αναφορών', group: 'Αναφορές' },
  { code: P.SETTINGS_MENU, label: 'Menu ρυθμίσεων', group: 'Διαχείριση' },
  { code: P.USERS_MENU, label: 'Menu χρηστών', group: 'Διαχείριση' },
  { code: P.ROLES_MENU, label: 'Menu ρόλων', group: 'Διαχείριση' },
];

export const ALL_PERMISSIONS = PERMISSION_CATALOG.map((p) => p.code);
export const TENANT_PERMISSIONS = ALL_PERMISSIONS.filter((p) => p !== P.TENANTS_PLATFORM);

// Default role templates cloned into every new tenant.
export const ROLE_TEMPLATES = [
  { key: 'owner', name: 'Ιδιοκτήτης', permissions: TENANT_PERMISSIONS },
  { key: 'admin', name: 'Διαχειριστής', permissions: TENANT_PERMISSIONS.filter((p) => p !== P.TENANT_MANAGE) },
  {
    key: 'manager', name: 'Manager',
    permissions: [P.CUSTOMERS_READ, P.CUSTOMERS_WRITE, P.CUSTOMERS_EXPORT, P.BRANCHES_READ, P.SPACES_READ, P.REPORTS_READ],
  },
  {
    key: 'agent', name: 'Σύμβουλος',
    permissions: [P.CUSTOMERS_READ, P.CUSTOMERS_WRITE, P.BRANCHES_READ, P.SPACES_READ],
  },
  {
    key: 'viewer', name: 'Θεατής',
    permissions: [P.CUSTOMERS_READ, P.BRANCHES_READ, P.SPACES_READ, P.REPORTS_READ],
  },
];

export const isValidPermission = (code) => TENANT_PERMISSIONS.includes(code);

const IMPLICATIONS = {
  'customers.read': ['customers.menu', 'customers.view'],
  'customers.write': ['customers.create', 'customers.edit'],
  'customers.delete': ['customers.delete'],
  'branches.read': ['branches.menu', 'branches.view'],
  'spaces.read': ['spaces.menu', 'spaces.view'],
  'reports.read': ['reports.menu', 'reports.view'],
};
export function expandPermissions(perms = []) {
  const result = new Set(perms);
  for (const code of [...result]) (IMPLICATIONS[code] || []).forEach((item) => result.add(item));
  for (const code of [...result]) {
    if (code.endsWith('.view')) result.add(code.replace('.view', '.read'));
    if (code.endsWith('.edit') || code.endsWith('.create')) result.add(code.replace(/\.(edit|create)$/, '.write'));
  }
  return [...result];
}
