import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { Avatar, StatusBadge, EmptyState, Skeleton } from '../components/ui.jsx';
import { formatCurrency, formatNumber, formatDate, TYPE_LABELS, STATUS_LABELS } from '../lib/format.js';
import { useAuth } from '../store/auth.js';
import { PERMS } from '../lib/perms.js';
import { CustomerFormDrawer } from '../components/forms.jsx';
import FilterDrawer from '../components/FilterDrawer.jsx';

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
const SORTS = [
  { value: 'last_visit', label: 'Τελ. επίσκεψη' },
  { value: 'name', label: 'Όνομα' },
  { value: 'value', label: 'Αξία' },
  { value: 'created', label: 'Ημ. εγγραφής' },
];
const DEFAULT_COLUMNS = COLUMNS.map((column) => column.key);

const EMPTY_FILTERS = {
  status: [], customerType: '', tag: '', isVip: false, employeeId: '', city: '',
  branchCity: '', spaceType: '', createdFrom: '', createdTo: '', lastVisitFrom: '',
  lastVisitTo: '', valueMin: '', valueMax: '', minBranches: '', minSpaces: '',
};

function useDebounced(value, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
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
    try { await api.exportCustomers(format, params); setOpen(false); } catch (e) { alert(e.message); } finally { setBusy(''); }
  };
  const items = [{ format: 'csv', label: 'CSV (.csv)', icon: 'file' }, { format: 'xlsx', label: 'Excel (.xlsx)', icon: 'grid' }, { format: 'pdf', label: 'PDF (.pdf)', icon: 'file' }];
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="btn" onClick={() => setOpen((o) => !o)}><Icon name="download" size={16} /> Εξαγωγή <Icon name="chevronDown" size={14} /></button>
      {open && (
        <div className="search-results" style={{ right: 0, left: 'auto', minWidth: 200, top: 42 }}>
          <div className="search-group-label">Μορφή εξαγωγής</div>
          {items.map((it) => (
            <div key={it.format} className="search-row" onClick={() => download(it.format)}>
              <div className="avatar sq" style={{ width: 30, height: 30, background: 'var(--accent-soft)', color: 'var(--accent)' }}>{busy === it.format ? <span className="spinner" /> : <Icon name={it.icon} size={15} />}</div>
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
      <button className="btn btn-sm" disabled={page <= 1} onClick={() => onGo(page - 1)}><Icon name="chevronRight" size={15} style={{ transform: 'rotate(180deg)' }} /> Προηγ.</button>
      {withGaps.map((n, i) => n === '…' ? <span key={`g${i}`} style={{ color: 'var(--text-3)', padding: '0 4px' }}>…</span>
        : <button key={n} className={`btn btn-sm${n === page ? ' btn-accent' : ''}`} style={{ minWidth: 34, justifyContent: 'center' }} onClick={() => onGo(n)}>{n}</button>)}
      <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => onGo(page + 1)}>Επόμ. <Icon name="chevronRight" size={15} /></button>
    </div>
  );
}

// Builds removable chips describing the active filters.
function activeChips(filters, meta) {
  const chips = [];
  (filters.status || []).forEach((s) => chips.push({ id: `status:${s}`, label: `Κατάσταση: ${STATUS_LABELS[s] || s}`, clear: (f) => ({ ...f, status: f.status.filter((x) => x !== s) }) }));
  if (filters.customerType) chips.push({ id: 'type', label: `Τύπος: ${TYPE_LABELS[filters.customerType]}`, clear: (f) => ({ ...f, customerType: '' }) });
  if (filters.tag) { const t = (meta?.tags || []).find((x) => x.slug === filters.tag); chips.push({ id: 'tag', label: `Ετικέτα: ${t?.name || filters.tag}`, clear: (f) => ({ ...f, tag: '' }) }); }
  if (filters.isVip) chips.push({ id: 'vip', label: 'VIP', clear: (f) => ({ ...f, isVip: false }) });
  if (filters.employeeId) { const e = (meta?.employees || []).find((x) => String(x.id) === String(filters.employeeId)); chips.push({ id: 'emp', label: `Υπεύθυνος: ${e?.full_name || filters.employeeId}`, clear: (f) => ({ ...f, employeeId: '' }) }); }
  if (filters.city) chips.push({ id: 'city', label: `Πόλη: ${filters.city}`, clear: (f) => ({ ...f, city: '' }) });
  if (filters.branchCity) chips.push({ id: 'bcity', label: `Υποκ. πόλη: ${filters.branchCity}`, clear: (f) => ({ ...f, branchCity: '' }) });
  if (filters.spaceType) chips.push({ id: 'stype', label: `Χώρος: ${filters.spaceType}`, clear: (f) => ({ ...f, spaceType: '' }) });
  if (filters.createdFrom || filters.createdTo) chips.push({ id: 'created', label: `Εγγραφή: ${filters.createdFrom || '…'} – ${filters.createdTo || '…'}`, clear: (f) => ({ ...f, createdFrom: '', createdTo: '' }) });
  if (filters.lastVisitFrom || filters.lastVisitTo) chips.push({ id: 'lv', label: `Επίσκεψη: ${filters.lastVisitFrom || '…'} – ${filters.lastVisitTo || '…'}`, clear: (f) => ({ ...f, lastVisitFrom: '', lastVisitTo: '' }) });
  if (filters.valueMin || filters.valueMax) chips.push({ id: 'val', label: `Αξία: ${filters.valueMin || '0'} – ${filters.valueMax || '∞'}€`, clear: (f) => ({ ...f, valueMin: '', valueMax: '' }) });
  if (filters.minBranches) chips.push({ id: 'mb', label: `≥ ${filters.minBranches} υποκ/τα`, clear: (f) => ({ ...f, minBranches: '' }) });
  if (filters.minSpaces) chips.push({ id: 'ms', label: `≥ ${filters.minSpaces} χώροι`, clear: (f) => ({ ...f, minSpaces: '' }) });
  return chips;
}

export default function Customers({ onOpenCustomer }) {
  const [input, setInput] = useState('');
  const q = useDebounced(input, 250);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState('last_visit');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [showFilters, setShowFilters] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [columnOrder, setColumnOrder] = useState(DEFAULT_COLUMNS);
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const [showColumns, setShowColumns] = useState(false);
  const [views, setViews] = useState([]);
  const [activeView, setActiveView] = useState(null);
  const [viewName, setViewName] = useState('');
  const [dragColumn, setDragColumn] = useState(null);

  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: ({ signal }) => api.meta({ signal }) });
  const canExport = useAuth((s) => s.hasPerm(PERMS.CUSTOMERS_EXPORT));
  const canWrite = useAuth((s) => s.hasPerm(PERMS.CUSTOMERS_WRITE));
  const qc = useQueryClient();
  useEffect(() => {
    api.customerViews().then((response) => {
      setViews(response.views || []);
      const preferred = (response.views || []).find((view) => view.is_default);
      if (preferred) {
        setActiveView(preferred);
        const config = preferred.config || {};
        if (config.filters) setFilters({ ...EMPTY_FILTERS, ...config.filters });
        if (config.columns) setColumnOrder(config.columns);
        if (config.hiddenColumns) setHiddenColumns(config.hiddenColumns);
        if (config.sort) setSort(config.sort);
        if (config.sortDir) setSortDir(config.sortDir);
        if (config.pageSize) setPageSize(config.pageSize);
      }
    }).catch(() => {});
  }, []);
  const [sortDir, setSortDir] = useState('DESC');

  const filterParams = useMemo(() => ({
    q: q.trim() || undefined,
    status: filters.status.length ? filters.status.join(',') : undefined,
    customerType: filters.customerType || undefined,
    tag: filters.tag || undefined,
    isVip: filters.isVip ? 'true' : undefined,
    employeeId: filters.employeeId || undefined,
    city: filters.city || undefined,
    branchCity: filters.branchCity || undefined,
    spaceType: filters.spaceType || undefined,
    createdFrom: filters.createdFrom || undefined,
    createdTo: filters.createdTo || undefined,
    lastVisitFrom: filters.lastVisitFrom || undefined,
    lastVisitTo: filters.lastVisitTo || undefined,
    valueMin: filters.valueMin || undefined,
    valueMax: filters.valueMax || undefined,
    minBranches: filters.minBranches || undefined,
    minSpaces: filters.minSpaces || undefined,
    sort: sort !== 'last_visit' ? sort : undefined,
    sortDir,
  }), [q, filters, sort, sortDir]);

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
  const chips = activeChips(filters, meta);
  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const toggleSort = (key) => {
    if (sort === key) setSortDir((direction) => direction === 'ASC' ? 'DESC' : 'ASC');
    else {
      setSort(key);
      setSortDir(SORTS.find((item) => item.value === key)?.value === 'name' ? 'ASC' : 'DESC');
    }
  };
  const visibleColumns = columnOrder
    .map((key) => COLUMNS.find((column) => column.key === key))
    .filter((column) => column && !hiddenColumns.includes(column.key));
  const viewConfig = () => ({ filters, columns: columnOrder, hiddenColumns, sort, sortDir, pageSize });
  const saveView = async () => {
    const name = viewName.trim() || window.prompt('Όνομα λίστας', activeView?.name || '');
    if (!name) return;
    const response = activeView
      ? await api.updateCustomerView(activeView.id, { name, config: viewConfig() })
      : await api.createCustomerView({ name, config: viewConfig() });
    const saved = response.view;
    setViews((current) => activeView ? current.map((view) => view.id === saved.id ? saved : view) : [...current, saved]);
    setActiveView(saved);
    setViewName('');
  };
  const deleteView = async () => {
    if (!activeView || !window.confirm(`Διαγραφή της προβολής «${activeView.name}»;`)) return;
    await api.deleteCustomerView(activeView.id);
    setViews((current) => current.filter((view) => view.id !== activeView.id));
    setActiveView(null);
  };
  const applyView = (view) => {
    if (!view) {
      setActiveView(null);
      return;
    }
    const config = view.config || {};
    setActiveView(view);
    setFilters({ ...EMPTY_FILTERS, ...(config.filters || {}) });
    setColumnOrder(config.columns || DEFAULT_COLUMNS);
    setHiddenColumns(config.hiddenColumns || []);
    setSort(config.sort || 'last_visit');
    setSortDir(config.sortDir || 'DESC');
    setPageSize(config.pageSize || 50);
  };
  const dragEnd = (target) => {
    if (!dragColumn || dragColumn === target) return;
    setColumnOrder((current) => {
      const next = [...current];
      const from = next.indexOf(dragColumn); const to = next.indexOf(target);
      next.splice(from, 1); next.splice(to, 0, dragColumn);
      return next;
    });
    setDragColumn(null);
  };
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
          {canWrite && <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Icon name="plus" size={16} /> Νέος πελάτης</button>}
        </div>
      </div>

      {showCreate && (
        <CustomerFormDrawer onClose={() => setShowCreate(false)}
          onOpenExisting={(c) => { setShowCreate(false); onOpenCustomer(c); }}
          onSaved={(c) => { setShowCreate(false); qc.invalidateQueries({ queryKey: ['customers'] }); qc.invalidateQueries({ queryKey: ['meta'] }); onOpenCustomer(c); }} />
      )}
      {showFilters && (
        <FilterDrawer filters={filters} meta={meta} onSet={set} onClear={() => setFilters(EMPTY_FILTERS)} onClose={() => setShowFilters(false)} />
      )}

      <div className="toolbar">
        <div className="search-input">
          <Icon name="search" size={17} />
          <input value={input} placeholder="Αναζήτηση με όνομα, κωδικό, τηλέφωνο, email, εταιρεία, ΑΦΜ…" onChange={(e) => setInput(e.target.value)} />
          {isFetching && <span className="spinner" />}
        </div>
        <button className={`filter-chip${chips.length ? ' active' : ''}`} onClick={() => setShowFilters(true)}>
          <Icon name="filter" size={15} /> Φίλτρα {chips.length > 0 && <span className="pill" style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>{chips.length}</span>}
        </button>
        <div className="filter-chip">
          <Icon name="chart" size={15} />
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>Ταξ.: {s.label}</option>)}
          </select>
        </div>
        <div className="filter-chip">
          <Icon name="layers" size={15} />
          <select value={activeView?.id || ''} onChange={(e) => applyView(views.find((view) => String(view.id) === e.target.value))}>
            <option value="">Προβολή: Προσωρινή</option>
            {views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
          </select>
        </div>
        <button className="btn" onClick={() => setShowColumns((open) => !open)}><Icon name="settings" size={15} /> Στήλες</button>
        {showColumns && (
          <div className="customer-columns-menu">
            <b>Στήλες</b>
            {columnOrder.map((key) => {
              const column = COLUMNS.find((item) => item.key === key);
              if (!column || key === 'actions') return null;
              return <label key={key}><input type="checkbox" checked={!hiddenColumns.includes(key)} onChange={() => setHiddenColumns((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])} /> {column.label}</label>;
            })}
            <button className="btn btn-sm btn-ghost" onClick={() => { setColumnOrder(DEFAULT_COLUMNS); setHiddenColumns([]); }}>Επαναφορά</button>
          </div>
        )}
        <button className="btn btn-accent" onClick={saveView}><Icon name="bookmark" size={15} /> {activeView ? 'Αποθήκευση' : 'Αποθήκευση λίστας'}</button>
        {activeView && <button className="btn btn-ghost danger-action" title="Διαγραφή προβολής" onClick={deleteView}><Icon name="x" size={15} /></button>}
      </div>

      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          {chips.map((c) => (
            <span key={c.id} className="tag" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', paddingRight: 6 }}>
              {c.label}
              <span style={{ cursor: 'pointer', display: 'inline-flex' }} onClick={() => setFilters(c.clear)}><Icon name="x" size={13} /></span>
            </span>
          ))}
          <button className="btn btn-sm btn-ghost" onClick={() => setFilters(EMPTY_FILTERS)}>Καθαρισμός όλων</button>
        </div>
      )}

      <div className="results-meta">
        <span><b style={{ color: 'var(--text)' }}>{formatNumber(total)}</b> αποτελέσματα</span>
        {tookMs != null && <span className="took">αναζήτηση σε {tookMs} ms</span>}
        <span style={{ marginLeft: 'auto' }}>Ταξινόμηση: {SORTS.find((s) => s.value === sort)?.label} ({sortDir === 'ASC' ? 'Α-Ω' : 'Ω-Α'})</span>
      </div>

      <div className="table-wrap">
        <div className="thead">
          {visibleColumns.map((c) => (
            <div key={c.key} draggable onDragStart={() => setDragColumn(c.key)} onDragOver={(event) => event.preventDefault()} onDrop={() => dragEnd(c.key)} className={c.sort ? 'sortable' : ''} style={c.key === 'actions' ? { textAlign: 'right' } : undefined}
              onClick={c.sort ? () => toggleSort(c.sort) : undefined}>
              {c.label}
              {c.sort && sort === c.sort && <Icon name="chevronDown" size={13} style={{ transform: sortDir === 'ASC' ? 'rotate(180deg)' : undefined }} />}
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
            {visibleColumns.map((column) => column.key === 'name' ? <div className="cust-cell" key={column.key}>
                <Avatar name={c.full_name} src={c.avatar_url} size={38} fallback={false} />
                <div style={{ minWidth: 0 }}>
                  <div className="nm">{c.full_name} {c.is_vip ? <span style={{ color: 'var(--gold)' }}>★</span> : null}</div>
                  <div className="sub">{c.company || TYPE_LABELS[c.customer_type]} · {c.city}</div>
                </div>
              </div>
              : column.key === 'code' ? <div className="mono muted" key={column.key}>{c.code}</div>
                : column.key === 'status' ? <div key={column.key}><StatusBadge status={c.status} /></div>
                  : column.key === 'branches' ? <div className="mono" key={column.key}>{formatNumber(c.branches_count)} · {formatNumber(c.spaces_count)}</div>
                    : column.key === 'last_visit' ? <div className="muted" key={column.key}>{formatDate(c.last_visit_at)}</div>
                      : column.key === 'bookings' ? <div className="mono" key={column.key}>{formatNumber(c.bookings_count)}</div>
                        : column.key === 'value' ? <div className="num" key={column.key}>{formatCurrency(c.total_value)}</div>
                          : <div key={column.key} style={{ textAlign: 'right', color: 'var(--text-3)' }}><Icon name="chevronRight" size={16} /></div>)}
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
