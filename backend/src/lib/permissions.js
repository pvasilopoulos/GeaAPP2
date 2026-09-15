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
};

const P = PERMISSIONS;

// Catalog with Greek labels + grouping, used to render the permission editor.
export const PERMISSION_CATALOG = [
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
