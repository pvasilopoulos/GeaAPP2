import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FixedSizeList } from 'react-window';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import AsyncSelect from '../components/AsyncSelect.jsx';
import { Avatar, StatusBadge, VipBadge, EmptyState, Skeleton } from '../components/ui.jsx';
import { formatCurrency, formatNumber, formatDate, TYPE_LABELS } from '../lib/format.js';

const COLUMNS = [
  { key: 'name', label: 'Πελάτης', sort: 'name' },
  { key: 'code', label: 'Κωδικός' },
  { key: 'status', label: 'Κατάσταση' },
  { key: 'branches', label: 'Υποκ/τα · Χώροι' },
  { key: 'last_visit', label: 'Τελ. επίσκεψη', sort: 'last_visit' },
  { key: 'bookings', label: 'Κρατήσεις' },
  { key: 'value', label: 'Αξία', sort: 'value' },
  { key: 'actions', label: '' },
];

function useDebounced(value, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function Customers() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const q = useDebounced(input, 250);
  const [status, setStatus] = useState('');
  const [customerType, setCustomerType] = useState('');
  const [isVip, setIsVip] = useState(false);
  const [tag, setTag] = useState('');
  const [branch, setBranch] = useState(null);
  const [space, setSpace] = useState(null);
  const [sort, setSort] = useState('');

  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: ({ signal }) => api.meta({ signal }) });

  const filters = useMemo(() => ({
    q: q.trim() || undefined,
    status: status || undefined,
    customerType: customerType || undefined,
    isVip: isVip ? 'true' : undefined,
    tag: tag || undefined,
    branchId: branch?.value || undefined,
    spaceId: space?.value || undefined,
    sort: sort || undefined,
    limit: 40,
  }), [q, status, customerType, isVip, tag, branch, space, sort]);

  const {
    data, isLoading, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['customers', filters],
    queryFn: ({ pageParam, signal }) =>
      api.searchCustomers({ ...filters, cursor: pageParam }, { signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor || undefined,
  });

  const { data: countData } = useQuery({
    queryKey: ['customers-count', filters],
    queryFn: ({ signal }) => api.countCustomers(filters, { signal }),
  });

  const rows = useMemo(() => data?.pages.flatMap((p) => p.results) || [], [data]);
  const tookMs = data?.pages?.[data.pages.length - 1]?.tookMs;

  const activeSort = sort || (q.trim() ? 'relevance' : 'last_visit');
  const toggleSort = (key) => setSort((cur) => (cur === key ? '' : key));

  // Virtualized list sizing.
  const listRef = useRef(null);
  const [listHeight, setListHeight] = useState(560);
  useEffect(() => {
    const calc = () => setListHeight(Math.max(320, window.innerHeight - 300));
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  const Row = ({ index, style }) => {
    const c = rows[index];
    if (!c) return <div style={style} />;
    return (
      <div className="trow" style={style} onClick={() => navigate(`/customers/${c.id}`)}>
        <div className="cust-cell">
          <Avatar name={c.full_name} size={38} />
          <div style={{ minWidth: 0 }}>
            <div className="nm">{c.full_name} {c.is_vip && <span style={{ color: 'var(--gold)' }}>★</span>}</div>
            <div className="sub">{c.company || TYPE_LABELS[c.customer_type]} · {c.city}</div>
          </div>
        </div>
        <div className="mono muted">{c.code}</div>
        <div><StatusBadge status={c.status} /></div>
        <div className="mono">{formatNumber(c.branches_count)} · {formatNumber(c.spaces_count)}</div>
        <div className="muted">{formatDate(c.last_visit_at)}</div>
        <div className="mono">{formatNumber(c.bookings_count)}</div>
        <div className="num">{formatCurrency(c.total_value)}</div>
        <div style={{ textAlign: 'right', color: 'var(--text-3)' }}><Icon name="chevronRight" size={16} /></div>
      </div>
    );
  };

  const onItemsRendered = ({ visibleStopIndex }) => {
    if (visibleStopIndex >= rows.length - 8 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Πελάτες</h1>
          <div className="sub">
            {meta ? `${formatNumber(meta.estimatedCustomers)} πελάτες συνολικά` : '—'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 9 }}>
          <button className="btn"><Icon name="download" size={16} /> Εξαγωγή</button>
          <button className="btn btn-primary"><Icon name="plus" size={16} /> Νέος πελάτης</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-input">
          <Icon name="search" size={17} />
          <input
            value={input}
            placeholder="Αναζήτηση με όνομα, κωδικό, τηλέφωνο, email, εταιρεία, ΑΦΜ…"
            onChange={(e) => setInput(e.target.value)}
          />
          {isFetching && !isFetchingNextPage && <span className="spinner" />}
        </div>

        <div className="filter-chip">
          <Icon name="activity" size={15} />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Κατάσταση</option>
            {meta?.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div className="filter-chip">
          <Icon name="briefcase" size={15} />
          <select value={customerType} onChange={(e) => setCustomerType(e.target.value)}>
            <option value="">Τύπος</option>
            {meta?.customerTypes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div className="filter-chip">
          <Icon name="tag" size={15} />
          <select value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Ετικέτα</option>
            {meta?.tags.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
          </select>
        </div>

        <AsyncSelect
          icon="building" label="Υποκατάστημα" placeholder="Αναζήτηση υποκαταστήματος…"
          value={branch} onChange={setBranch}
          loader={(term, signal) => api.branches({ q: term, limit: 20 }, { signal })
            .then((r) => r.results.map((b) => ({ value: b.id, label: b.name, sub: b.city })))}
        />

        <AsyncSelect
          icon="grid" label="Χώρος" placeholder="Αναζήτηση χώρου…"
          value={space} onChange={setSpace}
          loader={(term, signal) => api.spaces({ q: term, branchId: branch?.value, limit: 20 }, { signal })
            .then((r) => r.results.map((s) => ({ value: s.id, label: s.name, sub: `${s.space_type} · ${s.branch_name}` })))}
        />

        <button className={`filter-chip${isVip ? ' active' : ''}`} onClick={() => setIsVip((v) => !v)}>
          <Icon name="star" size={15} /> VIP
        </button>
      </div>

      <div className="results-meta">
        {countData && <span><b style={{ color: 'var(--text)' }}>{formatNumber(countData.total)}</b> αποτελέσματα</span>}
        {tookMs != null && <span className="took">αναζήτηση σε {tookMs} ms</span>}
        <span style={{ marginLeft: 'auto' }}>Ταξινόμηση: {sortLabel(activeSort)}</span>
      </div>

      <div className="table-wrap">
        <div className="thead">
          {COLUMNS.map((c) => (
            <div key={c.key} className={c.sort ? 'sortable' : ''}
              style={c.key === 'actions' ? { textAlign: 'right' } : undefined}
              onClick={c.sort ? () => toggleSort(c.sort) : undefined}>
              {c.label}
              {c.sort && activeSort === c.sort && <Icon name="chevronDown" size={13} />}
            </div>
          ))}
        </div>

        {isLoading ? (
          <div style={{ padding: 8 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div className="trow" key={i} style={{ cursor: 'default' }}>
                <div className="cust-cell"><Skeleton w={38} h={38} style={{ borderRadius: '50%' }} /><Skeleton w={140} /></div>
                <Skeleton w={70} /><Skeleton w={80} /><Skeleton w={60} /><Skeleton w={70} /><Skeleton w={40} /><Skeleton w={60} /><span />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon="users" title="Δεν βρέθηκαν πελάτες" hint="Δοκιμάστε διαφορετικά κριτήρια αναζήτησης ή φίλτρα." />
        ) : (
          <FixedSizeList
            ref={listRef}
            height={listHeight}
            itemCount={rows.length}
            itemSize={60}
            width="100%"
            onItemsRendered={onItemsRendered}
          >
            {Row}
          </FixedSizeList>
        )}

        {isFetchingNextPage && (
          <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-3)' }}>
            <span className="spinner" /> Φόρτωση περισσότερων…
          </div>
        )}
      </div>
    </div>
  );
}

function sortLabel(key) {
  return { relevance: 'Συνάφεια', last_visit: 'Τελ. επίσκεψη', name: 'Όνομα', value: 'Αξία', created: 'Ημ. εγγραφής' }[key] || key;
}
