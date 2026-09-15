// Offline write queue. Actions taken without a connection are stored in
// IndexedDB and replayed, in order, once the API is reachable again.
import { api } from '../api.js';
import { idb, STORE_OUTBOX } from './idb.js';

export const PENDING = 'pending';
export const CONFLICT = 'conflict';
export const FAILED = 'failed';

export const MAX_RETRIES = 5;

function fullName(c = {}) {
  return [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
}

/**
 * Each kind knows how to replay itself and how to describe itself in the
 * pending list. `run` may return `{ conflict }` to ask the user for a decision
 * instead of writing.
 */
export const OUTBOX_KINDS = {
  'customer.create': {
    label: 'Νέος πελάτης',
    icon: 'users',
    describe: (item) => fullName(item.payload?.customer) || 'Πελάτης χωρίς όνομα',
    run: async (item) => {
      const { customer, customFields, force } = item.payload || {};
      if (!force) {
        const dup = await api.checkDuplicates({
          email: customer?.email, phone: customer?.phone,
          mobile: customer?.mobile, tax_id: customer?.tax_id,
        }).catch(() => null);
        if (dup?.matches?.length) return { conflict: { matches: dup.matches } };
      }
      const res = await api.createCustomer(customer);
      if (customFields && Object.keys(customFields).length) {
        await api.saveCustomerCustomFields(res.id, customFields);
      }
      return { result: { customerId: res.id } };
    },
  },
  'customer.update': {
    label: 'Ενημέρωση πελάτη',
    icon: 'edit',
    describe: (item) => item.payload?.name || fullName(item.payload?.customer) || `#${item.payload?.id}`,
    run: async (item) => {
      const { id, customer, customFields } = item.payload || {};
      await api.updateCustomer(id, customer);
      if (customFields && Object.keys(customFields).length) {
        await api.saveCustomerCustomFields(id, customFields);
      }
      return { result: { customerId: id } };
    },
  },
  'contact.create': {
    label: 'Νέα επαφή',
    icon: 'phone',
    describe: (item) => fullName(item.payload?.contact) || 'Επαφή',
    run: async (item) => {
      const { customerId, contact } = item.payload || {};
      await api.createContact(customerId, contact);
      return { result: { customerId } };
    },
  },
};

export function kindMeta(kind) {
  return OUTBOX_KINDS[kind] || { label: kind, icon: 'clock', describe: () => '—' };
}

export function describeItem(item) {
  return kindMeta(item?.kind).describe(item || {});
}

/** Only a dead network keeps an item queued; anything the server answered is a real failure. */
export function isOfflineError(err) {
  return !!err?.offline;
}

export function isRetryable(item) {
  return item?.status === PENDING || (item?.status === FAILED && (item?.retries || 0) < MAX_RETRIES);
}

function newId() {
  const rand = Math.random().toString(36).slice(2, 10);
  return `local-${Date.now().toString(36)}-${rand}`;
}

export async function listOutbox(scopeId) {
  const all = await idb.all(STORE_OUTBOX);
  const mine = scopeId == null ? all : all.filter((it) => String(it.scope) === String(scopeId));
  return mine.sort((a, b) => a.createdAt - b.createdAt);
}

export async function enqueue(kind, payload, { scope } = {}) {
  const item = {
    id: newId(),
    kind,
    payload,
    scope: scope == null ? 'anon' : String(scope),
    status: PENDING,
    retries: 0,
    error: null,
    conflict: null,
    createdAt: Date.now(),
  };
  await idb.put(STORE_OUTBOX, item);
  return item;
}

export async function updateItem(id, patch) {
  const cur = await idb.get(STORE_OUTBOX, id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  await idb.put(STORE_OUTBOX, next);
  return next;
}

export async function removeItem(id) {
  await idb.del(STORE_OUTBOX, id);
}

/** Queue a retry of a failed item, or force a conflicting create through. */
export async function retryItem(id, { force } = {}) {
  const cur = await idb.get(STORE_OUTBOX, id);
  if (!cur) return null;
  const payload = force ? { ...cur.payload, force: true } : cur.payload;
  return updateItem(id, { payload, status: PENDING, error: null, conflict: null, retries: 0 });
}

/**
 * Replay items oldest first. Stops early when the network is still down so the
 * queue order is preserved; per-item server errors are recorded and skipped so
 * one bad row cannot block the rest.
 */
export async function replayItems(items) {
  const summary = { sent: 0, conflicts: 0, failed: 0, stopped: false, customerIds: [] };

  for (const item of items) {
    const meta = OUTBOX_KINDS[item.kind];
    if (!meta) {
      await updateItem(item.id, { status: FAILED, error: 'Μη υποστηριζόμενη ενέργεια' });
      summary.failed += 1;
      continue;
    }
    try {
      const outcome = await meta.run(item);
      if (outcome?.conflict) {
        await updateItem(item.id, { status: CONFLICT, conflict: outcome.conflict, error: null });
        summary.conflicts += 1;
        continue;
      }
      await removeItem(item.id);
      summary.sent += 1;
      const cid = outcome?.result?.customerId;
      if (cid != null) summary.customerIds.push(cid);
    } catch (err) {
      if (isOfflineError(err)) {
        summary.stopped = true;
        break;
      }
      if (err?.status === 401) {
        summary.stopped = true;
        break;
      }
      await updateItem(item.id, {
        status: FAILED,
        retries: (item.retries || 0) + 1,
        error: err?.message || 'Η αποστολή απέτυχε',
      });
      summary.failed += 1;
    }
  }
  return summary;
}

export async function flushOutbox(scopeId) {
  const items = (await listOutbox(scopeId)).filter(isRetryable);
  return replayItems(items);
}

/** Pending customer creates rendered as list rows before they reach the server. */
export function pendingCustomerRows(items = []) {
  return items
    .filter((it) => it.kind === 'customer.create')
    .map((it) => {
      const c = it.payload?.customer || {};
      return {
        id: it.id,
        pending: true,
        pendingStatus: it.status,
        pendingError: it.error,
        full_name: fullName(c) || 'Νέος πελάτης',
        code: 'ΣΕ ΑΝΑΜΟΝΗ',
        status: c.status || 'prospect',
        customer_type: c.customer_type || 'individual',
        company: c.company || '',
        city: c.city || '',
        is_vip: !!c.is_vip,
        avatar_url: c.avatar_url || '',
        branches_count: 0,
        spaces_count: 0,
        bookings_count: 0,
        total_value: 0,
        last_visit_at: null,
      };
    });
}
