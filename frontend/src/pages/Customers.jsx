import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { Avatar, StatusBadge, EmptyState, Skeleton } from '../components/ui.jsx';
import { formatCurrency, formatNumber, formatDate, TYPE_LABELS } from '../lib/format.js';
import { useAuth } from '../store/auth.js';
import { PERMS } from '../lib/perms.js';

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

const PAGE_SIZES = [25, 50, 100];

function useDebounced(value, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function ExportMenu({ params, canExport }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  if (!canExport) return null;
  const download = async (format) => {
    setBusy(format);
    try { await api.exportCustomers(format, params); setOpen(false); }
    catch (e) { alert(e.message); }
    finally { setBusy(''); }
  };
  const items = [
    { format: 'csv', label: 'CSV (.csv)', icon: 'file' },
    { format: 'xlsx', label: 'Excel (.xlsx)', icon: 'grid' },
    { format: 'pdf', label: 'PDF (.pdf)', icon: 'file' },
  ];
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="btn" onClick={() => setOpen((o) => !o)}>
        <Icon name="download" size={16} /> Εξαγωγή <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="search-results" style={{ right: 0, left: 'auto', minWidth: 200, top: 42 }}>
          <div className="search-group-label">Μορφή εξαγωγής</div>
          {items.map((it) => (
            <div key={it.format} className="search-row" onClick={() => download(it.format)}>
              <div className="avatar sq" style={{ width: 30, height: 30, background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                {busy === it.format ? <span className="spinner" /> : <Icon name={it.icon} size={15} />}
              </div>
              <div style={{ fontWeight: 600 }}>{it.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Pager({ page, totalPages, onGo }) {
  if (totalPages <= 1) return null;
  const nums = [1];
  for (let n = page - 1; n <= page + 1; n++) if (n > 1 && n < totalPages) nums.push(n);
  if (totalPages > 1) nums.push(totalPages);
  const uniq = [...new Set(nums)].sort((a, b) => a - b);
  const withGaps = [];
  uniq.forEach((n, i) => { if (i > 0 && n - uniq[i - 1] > 1) withGaps.push('…'); withGaps.push(n); });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button className="btn btn-sm" disabled={page <= 1} onClick={() => onGo(page - 1)}>
        <Icon name="chevronRight" size={15} style={{ transform: 'rotate(180deg)' }} /> Προηγ.
      </button>
      {withGaps.map((n, i) => n === '…'
        ? <span key={`g${i}`} style={{ color: 'var(--text-3)', padding: '0 4px' }}>…</span>
        : <button key={n} className={`btn btn-sm${n === page ? ' btn-accent' : ''}`} style={{ minWidth: 34, justifyContent: 'center' }} onClick={() => onGo(n)}>{n}</button>)}
      <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => onGo(page + 1)}>
        Επόμ. <Icon name="chevronRight" size={15} />
      </button>
    </div>
  );
}

export default function Customers({ onOpenCustomer }) {
  const [input, setInput] = useState('');
  const q = useDebounced(input, 250);
  const [status, setStatus] = useState('');
  const [customerType, setCustomerType] = useState('');
  const [isVip, setIsVip] = useState(false);
  const [tag, setTag] = useState('');
  const [branchCity, setBranchCity] = useState('');
  const [spaceType, setSpaceType] = useState('');
  const [sort, setSort] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: ({ signal }) => api.meta({ signal }) });
  const canExport = useAuthCanExport();

  const filterParams = useMemo(() => ({
    q: q.trim() || undefined,
    status: status || undefined,
    customerType: customerType || undefined,
    isVip: isVip ? 'true' : undefined,
    tag: tag || undefined,
    branchCity: branchCity || undefined,
    spaceType: spaceType || undefined,
    sort: sort || undefined,
  }), [q, status, customerType, isVip, tag, branchCity, spaceType, sort]);

  useEffect(() => { setPage(1); }, [filterParams, pageSize]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['customers', filterParams, page, pageSize],
    queryFn: ({ signal }) => api.searchCustomers({ ...filterParams, page, limit: pageSize }, { signal }),
    placeholderData: keepPreviousData,
  });

  const rows = data?.results || [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const tookMs = data?.tookMs;
  const activeSort = sort || 'last_visit';
  const toggleSort = (key) => setSort((cur) => (cur === key ? '' : key));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Πελάτες</h1>
          <div className="sub">{meta ? `${formatNumber(meta.estimatedCustomers)} πελάτες συνολικά` : '—'}</div>
        </div>
        <div style={{ display: 'flex', gap: 9 }}>
          <ExportMenu params={filterParams} canExport={canExport} />
          <button className="btn btn-primary"><Icon name="plus" size={16} /> Νέος πελάτης</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-input">
          <Icon name="search" size={17} />
          <input value={input} placeholder="Αναζήτηση με όνομα, κωδικό, τηλέφωνο, email, εταιρεία, ΑΦΜ…" onChange={(e) => setInput(e.target.value)} />
          {isFetching && <span className="spinner" />}
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
        <div className="filter-chip">
          <Icon name="building" size={15} />
          <select value={branchCity} onChange={(e) => setBranchCity(e.target.value)}>
            <option value="">Πόλη υποκαταστήματος</option>
            {(meta?.branchCities || []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="filter-chip">
          <Icon name="grid" size={15} />
          <select value={spaceType} onChange={(e) => setSpaceType(e.target.value)}>
            <option value="">Τύπος χώρου</option>
            {(meta?.spaceTypes || []).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <button className={`filter-chip${isVip ? ' active' : ''}`} onClick={() => setIsVip((v) => !v)}>
          <Icon name="star" size={15} /> VIP
        </button>
      </div>

      <div className="results-meta">
        <span><b style={{ color: 'var(--text)' }}>{formatNumber(total)}</b> αποτελέσματα</span>
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
            {Array.from({ length: 10 }).map((_, i) => (
              <div className="trow" key={i} style={{ cursor: 'default' }}>
                <div className="cust-cell"><Skeleton w={38} h={38} style={{ borderRadius: '50%' }} /><Skeleton w={140} /></div>
                <Skeleton w={70} /><Skeleton w={80} /><Skeleton w={60} /><Skeleton w={70} /><Skeleton w={40} /><Skeleton w={60} /><span />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon="users" title="Δεν βρέθηκαν πελάτες" hint="Δοκιμάστε διαφορετικά κριτήρια αναζήτησης ή φίλτρα." />
        ) : (
          rows.map((c) => (
            <div className="trow" key={c.id} onClick={() => onOpenCustomer(c)}>
              <div className="cust-cell">
                <Avatar name={c.full_name} size={38} />
                <div style={{ minWidth: 0 }}>
                  <div className="nm">{c.full_name} {c.is_vip ? <span style={{ color: 'var(--gold)' }}>★</span> : null}</div>
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
          ))
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-3)', fontSize: 13 }}>
          <span>{formatNumber(from)}–{formatNumber(to)} από {formatNumber(total)}</span>
          <span className="filter-chip" style={{ height: 30 }}>
            Ανά σελίδα
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </span>
        </div>
        <Pager page={page} totalPages={totalPages} onGo={(n) => setPage(Math.min(Math.max(1, n), totalPages))} />
      </div>
    </div>
  );
}

function sortLabel(key) {
  return { last_visit: 'Τελ. επίσκεψη', name: 'Όνομα', value: 'Αξία', created: 'Ημ. εγγραφής' }[key] || key;
}

// Gate the export button by permission.
function useAuthCanExport() {
  return useAuth((s) => s.hasPerm(PERMS.CUSTOMERS_EXPORT));
}
