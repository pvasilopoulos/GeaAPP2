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
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function get(path, { signal } = {}) {
  return handle(await fetch(`/api${path}`, { signal, headers: authHeaders() }));
}
async function send(method, path, body) {
  return handle(await fetch(`/api${path}`, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: body ? JSON.stringify(body) : undefined,
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
  createRole: (payload) => send('POST', '/roles', payload),
  updateRole: (id, payload) => send('PATCH', `/roles/${id}`, payload),
  deleteRole: (id) => send('DELETE', `/roles/${id}`),
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
