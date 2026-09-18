import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { EmptyState, Skeleton } from '../components/ui.jsx';
import { formatDateTime } from '../lib/format.js';
import { useTabs } from '../store/tabs.js';
import { useAuth } from '../store/auth.js';
import { PERMS } from '../lib/perms.js';

const ENTITY_LABELS = {
  customer: 'Πελάτης',
  follow_up: 'Υπενθύμιση',
  quote: 'Προσφορά',
  settings: 'Ρυθμίσεις',
  user: 'Χρήστης',
  role: 'Ρόλος',
  connector: 'Σύνδεση ERP',
  note: 'Σημείωση',
};

const ACTION_LABELS = {
  create: 'Δημιουργία',
  update: 'Ενημέρωση',
  delete: 'Διαγραφή',
  login: 'Σύνδεση',
  status: 'Κατάσταση',
  sync: 'Συγχρονισμός',
  export: 'Εξαγωγή',
};

function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function AuditLog({ embedded = false } = {}) {
  const hasPerm = useAuth((s) => s.hasPerm);
  const openCustomer = useTabs((s) => s.openCustomer);
  const openTab = useTabs((s) => s.openTab);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actorId, setActorId] = useState('');
  const [entityType, setEntityType] = useState('');
  const [q, setQ] = useState('');
  const qDebounced = useDebounced(q);

  const enabled = hasPerm(PERMS.SETTINGS_MANAGE);
  const filters = useMemo(
    () => ({ from, to, actorId, entityType, q: qDebounced }),
    [from, to, actorId, entityType, qDebounced],
  );

  const query = useInfiniteQuery({
    queryKey: ['audit', filters],
    enabled,
    queryFn: ({ pageParam, signal }) => api.audit({ ...filters, cursor: pageParam, limit: 40 }, { signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor || undefined,
  });

  const rows = query.data?.pages.flatMap((p) => p.results) || [];
  const actors = query.data?.pages[0]?.actors || [];
  const entityTypes = query.data?.pages[0]?.entityTypes || Object.keys(ENTITY_LABELS);

  const openEntity = (row) => {
    if (row.entity_type === 'customer' && (row.customer_id || row.entity_id)) {
      openCustomer({
        id: row.customer_id || row.entity_id,
        full_name: row.customer_name,
        company: row.customer_company,
      });
      return;
    }
    if (row.entity_type === 'quote') openTab({ id: 'quotes', type: 'quotes', title: 'Προσφορές', icon: 'file' });
    if (row.entity_type === 'settings' || row.entity_type === 'connector') {
      openTab({ id: 'settings', type: 'settings', title: 'Ρυθμίσεις', icon: 'settings' });
    }
    if (row.entity_type === 'user' || row.entity_type === 'role') {
      openTab({ id: 'users', type: 'users', title: 'Χρήστες & Ρόλοι', icon: 'users' });
    }
  };

  if (!enabled) {
    return <EmptyState icon="clock" title="Δεν έχετε δικαίωμα προβολής του ιστορικού" />;
  }

  return (
    <div className={embedded ? 'audit-embedded' : 'audit-page'}>
      {!embedded && (
        <div className="page-head">
          <div>
            <h1>Ιστορικό αλλαγών</h1>
            <div className="sub">Ποιος έκανε τι, πότε και σε ποια οντότητα — σε επίπεδο οργανισμού.</div>
          </div>
        </div>
      )}

      <div className="audit-filters">
        <label>Από<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Έως<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label>Χρήστης
          <select value={actorId} onChange={(e) => setActorId(e.target.value)}>
            <option value="">Όλοι</option>
            {actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label>Οντότητα
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            <option value="">Όλες</option>
            {entityTypes.map((t) => <option key={t} value={t}>{ENTITY_LABELS[t] || t}</option>)}
          </select>
        </label>
        <label className="audit-search">Αναζήτηση
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Περιγραφή, χρήστης…" />
        </label>
      </div>

      <div className="card audit-list">
        {query.isLoading ? (
          <div style={{ padding: 16 }}><Skeleton h={52} /><Skeleton h={52} style={{ marginTop: 10 }} /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon="clock" title="Δεν υπάρχουν καταγραφές" hint="Δοκιμάστε διαφορετικά φίλτρα ή ημερομηνίες." />
        ) : (
          <div>
            {rows.map((row) => {
              const linkable = row.entity_type === 'customer' || row.entity_type === 'quote'
                || row.entity_type === 'settings' || row.entity_type === 'connector'
                || row.entity_type === 'user' || row.entity_type === 'role';
              return (
                <button
                  type="button"
                  key={row.id}
                  className={`audit-row${linkable ? ' is-link' : ''}`}
                  onClick={() => linkable && openEntity(row)}
                  disabled={!linkable}
                >
                  <div className="audit-when">{formatDateTime(row.created_at)}</div>
                  <div className="audit-main">
                    <b>{row.summary || `${ACTION_LABELS[row.action] || row.action}`}</b>
                    <span>
                      {row.actor_name || 'Σύστημα'}
                      {' · '}
                      {ENTITY_LABELS[row.entity_type] || row.entity_type}
                      {row.customer_name || row.customer_company
                        ? ` · ${row.customer_company || row.customer_name}`
                        : ''}
                    </span>
                  </div>
                  <span className={`audit-action action-${row.action}`}>{ACTION_LABELS[row.action] || row.action}</span>
                  {linkable && <Icon name="chevronRight" size={16} />}
                </button>
              );
            })}
          </div>
        )}
        {query.hasNextPage && (
          <div className="audit-more">
            <button className="btn" type="button" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
              {query.isFetchingNextPage ? <span className="spinner" /> : <Icon name="chevronDown" size={14} />}
              Φόρτωση περισσότερων
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
