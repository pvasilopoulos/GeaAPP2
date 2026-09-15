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
    const err = new Error(body.error || `Request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// A failed fetch (no response at all) means the device is offline or the API is
// unreachable. The flag lets the outbox keep the request queued instead of
// treating it as a rejected write.
function offlineError(cause) {
  const err = new Error('Χωρίς σύνδεση — η ενέργεια δεν στάλθηκε');
  err.offline = true;
  err.cause = cause;
  return err;
}

async function request(path, init) {
  let res;
  try {
    res = await fetch(`/api${path}`, init);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw offlineError(err);
  }
  return handle(res);
}

async function get(path, { signal } = {}) {
  return request(path, { signal, headers: authHeaders() });
}
async function send(method, path, body) {
  return request(path, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: body ? JSON.stringify(body) : undefined,
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
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
  messagingChannels: (opts) => get('/settings/messaging/channels', opts),
  sendCustomerMessage: (id, payload) => send('POST', `/customers/${id}/messages`, payload),
  previewCustomerMessage: (id, payload) => send('POST', `/customers/${id}/messages/preview`, payload),
  messageTemplates: (opts) => get('/message-templates', opts),
  createMessageTemplate: (payload) => send('POST', '/message-templates', payload),
  updateMessageTemplate: (id, payload) => send('PATCH', `/message-templates/${id}`, payload),
  deleteMessageTemplate: (id) => send('DELETE', `/message-templates/${id}`),
  // app
  meta: (opts) => get('/meta', opts),
  statsOverview: (opts) => get('/stats/overview', opts),
  searchCustomers: (params, opts) => get(`/customers/search${qs(params)}`, opts),
  countCustomers: (params, opts) => get(`/customers/count${qs(params)}`, opts),
  globalSearch: (q, opts) => get(`/search/global${qs({ q })}`, opts),
  customer: (id, opts) => get(`/customers/${id}`, opts),
  createCustomer: (payload) => send('POST', '/customers', payload),
  updateCustomer: (id, payload) => send('PATCH', `/customers/${id}`, payload),
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
  customerNotes: (id, params, opts) => get(`/customers/${id}/notes${qs(params)}`, opts),
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
    const data = await readAsDataUrl(file);
    return send('POST', '/uploads', { mime: file.type, data });
  },
  async uploadAttachment(file) {
    const data = await readAsDataUrl(file);
    return send('POST', '/uploads/attachment', { mime: file.type, data, name: file.name });
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
