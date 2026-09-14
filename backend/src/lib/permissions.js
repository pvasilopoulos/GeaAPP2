// Central catalog of permissions and the built-in role → permission mapping.
// Permissions are enforced server-side (never rely on the client).

export const PERMISSIONS = {
  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_WRITE: 'customers.write',
  CUSTOMERS_DELETE: 'customers.delete',
  CUSTOMERS_EXPORT: 'customers.export',
  BRANCHES_READ: 'branches.read',
  SPACES_READ: 'spaces.read',
  REPORTS_READ: 'reports.read',
  SETTINGS_MANAGE: 'settings.manage', // custom fields, etc.
  USERS_MANAGE: 'users.manage',       // invite/edit users within tenant
  TENANT_MANAGE: 'tenant.manage',     // tenant-level settings (owner)
};

const ALL = Object.values(PERMISSIONS);

// Built-in roles. `owner` gets everything; the rest are progressively narrower.
export const ROLES = [
  { key: 'owner', name: 'Ιδιοκτήτης', permissions: ALL },
  {
    key: 'admin', name: 'Διαχειριστής',
    permissions: ALL.filter((p) => p !== PERMISSIONS.TENANT_MANAGE),
  },
  {
    key: 'manager', name: 'Manager',
    permissions: [
      PERMISSIONS.CUSTOMERS_READ, PERMISSIONS.CUSTOMERS_WRITE, PERMISSIONS.CUSTOMERS_EXPORT,
      PERMISSIONS.BRANCHES_READ, PERMISSIONS.SPACES_READ, PERMISSIONS.REPORTS_READ,
    ],
  },
  {
    key: 'agent', name: 'Σύμβουλος',
    permissions: [
      PERMISSIONS.CUSTOMERS_READ, PERMISSIONS.CUSTOMERS_WRITE,
      PERMISSIONS.BRANCHES_READ, PERMISSIONS.SPACES_READ,
    ],
  },
  {
    key: 'viewer', name: 'Θεατής',
    permissions: [
      PERMISSIONS.CUSTOMERS_READ, PERMISSIONS.BRANCHES_READ,
      PERMISSIONS.SPACES_READ, PERMISSIONS.REPORTS_READ,
    ],
  },
];

export const ROLE_KEYS = ROLES.map((r) => r.key);
