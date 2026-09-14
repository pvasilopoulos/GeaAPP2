// Thin fetch wrapper. Supports AbortSignal for request cancellation.
async function get(path, { signal } = {}) {
  const res = await fetch(`/api${path}`, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
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
  meta: (opts) => get('/meta', opts),
  statsOverview: (opts) => get('/stats/overview', opts),
  searchCustomers: (params, opts) => get(`/customers/search${qs(params)}`, opts),
  countCustomers: (params, opts) => get(`/customers/count${qs(params)}`, opts),
  globalSearch: (q, opts) => get(`/search/global${qs({ q })}`, opts),
  customer: (id, opts) => get(`/customers/${id}`, opts),
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
};
