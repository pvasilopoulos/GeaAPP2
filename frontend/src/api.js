// API client with JWT auth. Token is persisted in localStorage and attached
// as a Bearer header. A 401 on a protected call clears the session.
const TOKEN_KEY = 'spacehub_token';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }

function authHeaders(extra = {}) {
  const t = getToken();
  return t ? { ...extra, Authorization: `Bearer ${t}` } : extra;
}

async function handle(res) {
  if (res.status === 401 && !location.pathname.startsWith('/login')) {
    setToken(null);
    window.dispatchEvent(new Event('spacehub:unauthorized'));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.detail ? `${body.error || 'Request failed'}: ${body.detail}` : (body.error || `Request failed: ${res.status}`));
    if (body.debug) err.debug = body.debug;
    throw err;
  }
  return res.json();
}

async function get(path, { signal } = {}) {
  return handle(await fetch(`/api${path}`, { signal, headers: authHeaders() }));
}
async function send(method, path, body, { headers, signal } = {}) {
  return handle(await fetch(`/api${path}`, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json', ...headers }),
    body: body ? JSON.stringify(body) : undefined,
    signal,
  }));
}

function qs(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const api = {
  // auth
  login: (email, password) => send('POST', '/auth/login', { email, password }),
  register: (payload) => send('POST', '/auth/register', payload),
  me: (opts) => get('/auth/me', opts),
  // users / roles / permissions
  users: (opts) => get('/users', opts),
  roles: (opts) => get('/roles', opts),
  permissions: (opts) => get('/permissions', opts),
  createUser: (payload) => send('POST', '/users', payload),
  updateUser: (id, payload) => send('PATCH', `/users/${id}`, payload),
  deleteUser: (id) => send('DELETE', `/users/${id}`),
  createRole: (payload) => send('POST', '/roles', payload),
  updateRole: (id, payload) => send('PATCH', `/roles/${id}`, payload),
  deleteRole: (id) => send('DELETE', `/roles/${id}`),
  publicSettings: (opts) => get('/auth/public-settings', opts),
  tenants: (params, opts) => get(`/tenants${qs(params)}`, opts),
  tenant: (id, opts) => get(`/tenants/${id}`, opts),
  createTenant: (payload) => send('POST', '/tenants', payload),
  updateTenant: (id, payload) => send('PATCH', `/tenants/${id}`, payload),
  deleteTenant: (id, confirmSlug) => send('DELETE', `/tenants/${id}`, { confirmSlug }),
  orgSettings: (opts) => get('/settings/organization', opts),
  updateOrgSettings: (payload) => send('PATCH', '/settings/organization', payload),
  appSettings: (opts) => get('/settings/app', opts),
  updateAppSettings: (payload) => send('PATCH', '/settings/app', payload),
  platformSettings: (opts) => get('/settings/platform', opts),
  updatePlatformSettings: (payload) => send('PATCH', '/settings/platform', payload),
  messagingSettings: (opts) => get('/settings/messaging', opts),
  updateMessagingSettings: (payload) => send('PATCH', '/settings/messaging', payload),
  reminderSettings: (opts) => get('/settings/reminders', opts),
  updateReminderSettings: (payload) => send('PATCH', '/settings/reminders', payload),
  audit: (params, opts) => get(`/audit${qs(params)}`, opts),
  menuSettings: (opts) => get('/settings/menu', opts),
  updateMenuSettings: (payload) => send('PATCH', '/settings/menu', payload),
  menuRoles: (opts) => get('/settings/menu/roles', opts),
  myMenuSettings: (opts) => get('/settings/menu/me', opts),
  updateMyMenuSettings: (payload) => send('PATCH', '/settings/menu/me', payload),
  clearMyMenuSettings: () => send('PATCH', '/settings/menu/me', { clear: true }),
  connectors: (opts) => get('/connectors', opts),
  createConnector: (payload) => send('POST', '/connectors', payload),
  updateConnector: (id, payload) => send('PATCH', `/connectors/${id}`, payload),
  deleteConnector: (id) => send('DELETE', `/connectors/${id}`),
  runConnector: (id) => send('POST', `/connectors/${id}/run`),
  retryConnectorRun: (connectorId, runId) => send('POST', `/connectors/${connectorId}/runs/${runId}/retry`),
  connectorOutbox: (id, opts) => get(`/connectors/${id}/outbox`, opts),
  retryConnectorOutbox: (connectorId, jobId) => send('POST', `/connectors/${connectorId}/outbox/${jobId}/retry`),
  previewConnectorPush: (id, payload) => send('POST', `/connectors/${id}/push-preview`, payload),
  quotes: (opts) => get('/quotes', opts),
  quote: (id, opts) => get(`/quotes/${id}`, opts),
  resolveQuoteLines: (payload) => send('POST', '/quotes/resolve-lines', payload),
  previewQuoteFetch: (template) => send('POST', '/quotes/fetch-preview', { template }),
  createQuote: (payload) => send('POST', '/quotes', payload),
  updateQuote: (id, payload) => send('PATCH', `/quotes/${id}`, payload),
  updateQuoteStatus: (id, status) => send('POST', `/quotes/${id}/status`, { status }),
  sendQuoteEmail: (id, payload = {}) => send('POST', `/quotes/${id}/send`, payload),
  pushQuoteToErp: (id) => send('POST', `/quotes/${id}/push-erp`),
  previewQuotePush: (template) => send('POST', '/quotes/push-preview', { template }),
  async downloadQuotePdf(id) {
    const res = await fetch(`/api/quotes/${id}/pdf`, { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Η λήψη PDF απέτυχε');
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="?([^"]+)"?/);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = m ? m[1] : `quote-${id}.pdf`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  },
  connectorRuns: (id, opts) => get(`/connectors/${id}/runs`, opts),
  messagingChannels: (opts) => get('/settings/messaging/channels', opts),
  sendCustomerMessage: (id, payload) => send('POST', `/customers/${id}/messages`, payload),
  // app
  meta: (opts) => get('/meta', opts),
  statsOverview: (opts) => get('/stats/overview', opts),
  followUps: (params, opts) => get(`/follow-ups${qs(params)}`, opts),
  createFollowUp: (payload, opts) => send('POST', '/follow-ups', payload, opts),
  updateFollowUp: (id, payload, opts) => send('PATCH', `/follow-ups/${id}`, payload, opts),
  snoozeFollowUp: (id, minutes, opts) => send('PATCH', `/follow-ups/${id}/snooze`, { minutes }, opts),
  deleteFollowUp: (id) => send('DELETE', `/follow-ups/${id}`),
  notifications: (params, opts) => get(`/notifications${qs(params)}`, opts),
  notificationUnreadCount: (opts) => get('/notifications/unread-count', opts),
  markNotificationRead: (id) => send('PATCH', `/notifications/${id}/read`),
  dismissNotification: (id) => send('PATCH', `/notifications/${id}/dismiss`),
  markAllNotificationsRead: () => send('POST', '/notifications/mark-all-read'),
  pushPublicKey: (opts) => get('/push/public-key', opts),
  pushStatus: (opts) => get('/push/status', opts),
  pushSubscribe: (subscription) => send('POST', '/push/subscribe', { subscription }),
  pushUnsubscribe: (endpoint) => send('POST', '/push/unsubscribe', { endpoint }),
  pushTest: () => send('POST', '/push/test'),
  pushRecipients: (opts) => get('/push/recipients', opts),
  pushRoles: (opts) => get('/push/roles', opts),
  pushBroadcast: (payload) => send('POST', '/push/broadcast', payload),
  pushBroadcasts: (opts) => get('/push/broadcasts', opts),
  cancelPushBroadcast: (id) => send('POST', `/push/broadcasts/${id}/cancel`),
  pushTemplates: (opts) => get('/push/templates', opts),
  savePushTemplate: (payload) => send('POST', '/push/templates', payload),
  deletePushTemplate: (id) => send('DELETE', `/push/templates/${id}`),
  notificationRuleEvents: (opts) => get('/notification-rules/events', opts),
  notificationRules: (opts) => get('/notification-rules', opts),
  createNotificationRule: (payload) => send('POST', '/notification-rules', payload),
  updateNotificationRule: (id, payload) => send('PATCH', `/notification-rules/${id}`, payload),
  toggleNotificationRule: (id, enabled) => send('PATCH', `/notification-rules/${id}/toggle`, { enabled }),
  deleteNotificationRule: (id) => send('DELETE', `/notification-rules/${id}`),
  notificationRuleRoles: (opts) => get('/notification-rules/roles', opts),
  notificationRuleUsers: (opts) => get('/notification-rules/users', opts),
  myNotificationPreferences: (opts) => get('/notification-rules/my-preferences', opts),
  saveMyNotificationPreferences: (overrides) => send('PUT', '/notification-rules/my-preferences', { overrides }),
  saveMyNotificationContact: (payload) => send('PUT', '/notification-rules/my-contact', payload),
  calendarEvents: (params, opts) => get(`/calendar${qs(params)}`, opts),
  bookings: (params, opts) => get(`/bookings${qs(params)}`, opts),
  booking: (id, opts) => get(`/bookings/${id}`, opts),
  createBooking: (payload) => send('POST', '/bookings', payload),
  updateBooking: (id, payload) => send('PATCH', `/bookings/${id}`, payload),
  deleteBooking: (id) => send('DELETE', `/bookings/${id}`),
  customerFollowUps: (id, opts) => get(`/customers/${id}/follow-ups`, opts),
  searchCustomers: (params, opts) => get(`/customers/search${qs(params)}`, opts),
  customerViews: (opts) => get('/customer-views', opts),
  createCustomerView: (payload) => send('POST', '/customer-views', payload),
  updateCustomerView: (id, payload) => send('PATCH', `/customer-views/${id}`, payload),
  duplicateCustomerView: (id, payload) => send('POST', `/customer-views/${id}/duplicate`, payload),
  deleteCustomerView: (id) => send('DELETE', `/customer-views/${id}`),
  countCustomers: (params, opts) => get(`/customers/count${qs(params)}`, opts),
  globalSearch: (q, opts) => get(`/search/global${qs({ q })}`, opts),
  customer: (id, opts) => get(`/customers/${id}`, opts),
  createCustomer: (payload, opts) => send('POST', '/customers', payload, opts),
  updateCustomer: (id, payload, opts) => send('PATCH', `/customers/${id}`, payload, opts),
  deleteCustomer: (id) => send('DELETE', `/customers/${id}`),
  createBranch: (payload) => send('POST', '/branches', payload),
  updateBranch: (id, payload) => send('PATCH', `/branches/${id}`, payload),
  deleteBranch: (id) => send('DELETE', `/branches/${id}`),
  createSpace: (payload) => send('POST', '/spaces', payload),
  updateSpace: (id, payload) => send('PATCH', `/spaces/${id}`, payload),
  deleteSpace: (id) => send('DELETE', `/spaces/${id}`),
  customerBranches: (id, opts) => get(`/customers/${id}/branches`, opts),
  customerActivities: (id, params, opts) => get(`/customers/${id}/activities${qs(params)}`, opts),
  customerBookings: (id, params, opts) => get(`/customers/${id}/bookings${qs(params)}`, opts),
  customerVisits: (id, params, opts) => get(`/customers/${id}/visits${qs(params)}`, opts),
  customerPayments: (id, params, opts) => get(`/customers/${id}/payments${qs(params)}`, opts),
  customerCommunications: (id, params, opts) => get(`/customers/${id}/communications${qs(params)}`, opts),
  customerDocuments: (id, params, opts) => get(`/customers/${id}/documents${qs(params)}`, opts),
  createCustomerDocument: (id, payload) => send('POST', `/customers/${id}/documents`, payload),
  customerNotes: (id, params, opts) => get(`/customers/${id}/notes${qs(params)}`, opts),
  createCustomerNote: (id, payload, opts) => send('POST', `/customers/${id}/notes`, payload, opts),
  updateCustomerNote: (id, noteId, payload, opts) => send('PATCH', `/customers/${id}/notes/${noteId}`, payload, opts),
  deleteCustomerNote: (id, noteId) => send('DELETE', `/customers/${id}/notes/${noteId}`),
  customerCustomFields: (id, opts) => get(`/customers/${id}/custom-fields`, opts),
  spaceUsage: (customerId, spaceId, opts) => get(`/customers/${customerId}/spaces/${spaceId}/usage`, opts),
  branches: (params, opts) => get(`/branches${qs(params)}`, opts),
  spaces: (params, opts) => get(`/spaces${qs(params)}`, opts),
  customFields: (entity, opts) => get(`/custom-fields${qs({ entity })}`, opts),
  createCustomField: (payload) => send('POST', '/custom-fields', payload),
  updateCustomField: (id, payload) => send('PATCH', `/custom-fields/${id}`, payload),
  deleteCustomField: (id) => send('DELETE', `/custom-fields/${id}`),
  duplicateCustomField: (id) => send('POST', `/custom-fields/${id}/duplicate`),
  reorderCustomFields: (ids) => send('PATCH', '/custom-fields/reorder', { ids }),
  saveCustomerCustomFields: (id, values) => send('PUT', `/customers/${id}/custom-fields`, { values }),
  checkDuplicates: (payload) => send('POST', '/customers/check-duplicates', payload),
  addCustomerTag: (id, payload) => send('POST', `/customers/${id}/tags`, payload),
  removeCustomerTag: (id, tagId) => send('DELETE', `/customers/${id}/tags/${tagId}`),
  customerContacts: (id, opts) => get(`/customers/${id}/contacts`, opts),
  createContact: (id, payload) => send('POST', `/customers/${id}/contacts`, payload),
  updateContact: (id, contactId, payload) => send('PATCH', `/customers/${id}/contacts/${contactId}`, payload),
  deleteContact: (id, contactId) => send('DELETE', `/customers/${id}/contacts/${contactId}`),
  branchCustomFields: (id, opts) => get(`/branches/${id}/custom-fields`, opts),
  saveBranchCustomFields: (id, values) => send('PUT', `/branches/${id}/custom-fields`, { values }),
  spaceCustomFields: (id, opts) => get(`/spaces/${id}/custom-fields`, opts),
  saveSpaceCustomFields: (id, values) => send('PUT', `/spaces/${id}/custom-fields`, { values }),
  metaCustomFields: (entity, opts) => get(`/meta/custom-fields${qs({ entity })}`, opts),
  geoLookup: (q, opts) => get(`/geo/lookup${qs({ q })}`, opts),
  async uploadImage(file) {
    const data = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    return send('POST', '/uploads', { mime: file.type, data });
  },
  async uploadFile(file, customerId) {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return send('POST', '/uploads', { mime: file.type, data, customerId, fileName: file.name });
  },
  // export (fetch as blob so the Authorization header is sent, then download)
  async exportCustomers(format, params) {
    const res = await fetch(`/api/customers/export${qs({ ...params, format })}`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="?([^"]+)"?/);
    const filename = m ? m[1] : `customers.${format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
  },
};
