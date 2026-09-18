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
import PendingSyncBanner from '../components/customer/PendingSyncBanner.jsx';
import { QUEUE_EVENT } from '../lib/offlineQueue.js';

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
const DATABASE_COLUMNS = [
  ['id', 'ID'], ['erp_id', 'ERP ID'], ['first_name', 'Όνομα'], ['last_name', 'Επώνυμο'],
  ['email', 'Email'], ['phone', 'Τηλέφωνο'], ['mobile', 'Κινητό'], ['company', 'Επωνυμία'],
  ['tax_id', 'ΑΦΜ'], ['customer_type', 'Τύπος πελάτη'], ['is_vip', 'VIP'], ['date_of_birth', 'Ημ. γέννησης'],
  ['address_line', 'Διεύθυνση'], ['city', 'Πόλη'], ['postal_code', 'ΤΚ'], ['country', 'Χώρα'],
  ['profile_note', 'Σημειώσεις'], ['assigned_employee_id', 'ID υπευθύνου'], ['registered_at', 'Ημ. εγγραφής'],
  ['created_at', 'Δημιουργήθηκε'], ['updated_at', 'Τελευταία ενημέρωση'], ['branches_count', 'Υποκαταστήματα'],
  ['spaces_count', 'Χώροι'], ['bookings_count', 'Κρατήσεις'], ['visits_count', 'Επισκέψεις'],
  ['total_value', 'Συνολική αξία'], ['last_visit_at', 'Τελ. επίσκεψη'], ['next_booking_at', 'Επόμενη κράτηση'],
];
const PAGE_SIZES = [25, 50, 100];
const SORTS = [
  { value: 'last_visit', label: 'Τελ. επίσκεψη' },
  { value: 'name', label: 'Όνομα' },
  { value: 'value', label: 'Αξία' },
  { value: 'created', label: 'Ημ. εγγραφής' },
  { value: 'code', label: 'Κωδικός' },
  { value: 'city', label: 'Πόλη' },
  { value: 'status', label: 'Κατάσταση' },
  { value: 'branches', label: 'Υποκαταστήματα' },
  { value: 'spaces', label: 'Χώροι' },
  { value: 'bookings', label: 'Κρατήσεις' },
];
const DEFAULT_COLUMNS = COLUMNS.map((column) => column.key);
const IDENTITY_FIELDS = [
  ['customer_type', 'Τύπος πελάτη'],
  ['city', 'Πόλη'],
  ['email', 'Email'],
  ['phone', 'Τηλέφωνο'],
  ['mobile', 'Κινητό'],
  ['code', 'Κωδικός'],
  ['erp_id', 'ERP ID'],
  ['tax_id', 'ΑΦΜ'],
  ['status', 'Κατάσταση'],
  ['branches_count', 'Υποκαταστήματα'],
  ['spaces_count', 'Χώροι'],
  ['last_visit_at', 'Τελ. επίσκεψη'],
];
const DEFAULT_IDENTITY_FIELDS = ['customer_type', 'city'];
const COLUMN_FILTER_KEYS = new Set(['name', 'code', 'status', 'city', 'email', 'phone', 'mobile', 'tax_id', 'address_line', 'erp_id']);

const EMPTY_FILTERS = {
  status: [], customerType: '', tag: '', isVip: false, employeeId: '', city: '',
  email: '', phone: '', erpId: '',
  branchCity: '', spaceType: '', createdFrom: '', createdTo: '', lastVisitFrom: '',
  lastVisitTo: '', valueMin: '', valueMax: '', minBranches: '', minSpaces: '',
  noVisits: false,
};

function useDebounced(value, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}

// Icon-only trigger that opens a small options menu — used where a control's
// current value shouldn't take up toolbar space as visible text (e.g. the
// saved-view and visibility-scope pickers), while staying keyboard/click
// accessible like the native <select> it replaces.
function IconDropdown({ icon, title, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  const current = options.find((o) => String(o.value) === String(value));
  return (
    <div className="filter-chip icon-dropdown" style={{ position: 'relative' }} ref={ref}>
      <button type="button" className="icon-dropdown-trigger" title={current ? `${title}: ${current.label}` : title} onClick={() => setOpen((o) => !o)}>
        <Icon name={icon} size={15} />
      </button>
      {open && (
        <div className="search-results" style={{ left: 0, right: 'auto', minWidth: 200, top: 36 }}>
          {options.map((o) => (
            <div key={o.value} className={`search-row${String(o.value) === String(value) ? ' active' : ''}`} style={{ justifyContent: 'space-between' }} onClick={() => { onChange(o.value); setOpen(false); }}>
              <div style={{ fontWeight: 600 }}>{o.label}</div>
              {String(o.value) === String(value) && <Icon name="check" size={14} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
  if (filters.email) chips.push({ id: 'email', label: `Email: ${filters.email}`, clear: (f) => ({ ...f, email: '' }) });
  if (filters.phone) chips.push({ id: 'phone', label: `Τηλέφωνο: ${filters.phone}`, clear: (f) => ({ ...f, phone: '' }) });
  if (filters.erpId) chips.push({ id: 'erp', label: `ERP ID: ${filters.erpId}`, clear: (f) => ({ ...f, erpId: '' }) });
  if (filters.noVisits) chips.push({ id: 'no-visits', label: 'Χωρίς επίσκεψη', clear: (f) => ({ ...f, noVisits: false }) });
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
  const [rowHeight, setRowHeight] = useState(68);
  const [showFilters, setShowFilters] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [columnOrder, setColumnOrder] = useState(DEFAULT_COLUMNS);
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const [showColumns, setShowColumns] = useState(false);
  const [views, setViews] = useState([]);
  const [activeView, setActiveView] = useState(null);
  const [viewName, setViewName] = useState('');
  const [viewVisibility, setViewVisibility] = useState('personal');
  const [dragColumn, setDragColumn] = useState(null);
  const [customFieldColumns, setCustomFieldColumns] = useState([]);
  const [columnSearch, setColumnSearch] = useState('');
  const [identityFields, setIdentityFields] = useState(DEFAULT_IDENTITY_FIELDS);
  const [columnFilters, setColumnFilters] = useState({});
  const columnsMenuRef = useRef(null);

  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: ({ signal }) => api.meta({ signal }) });
  const { data: appSettings } = useQuery({ queryKey: ['settings-app'], queryFn: ({ signal }) => api.appSettings({ signal }) });
  useEffect(() => {
    const configured = appSettings?.settings?.view_preferences?.customer_profile?.customer_list_row_height;
    if (configured) setRowHeight(Number(configured));
  }, [appSettings]);
  useEffect(() => {
    api.metaCustomFields('customer').then((response) => setCustomFieldColumns(
      (response.fields || []).map((field) => ({ key: `custom:${field.key}`, label: field.name, customKey: field.key })),
    )).catch(() => {});
  }, []);
  const canExport = useAuth((s) => s.hasPerm(PERMS.CUSTOMERS_EXPORT));
  const canWrite = useAuth((s) => s.hasPerm(PERMS.CUSTOMERS_WRITE));
  const qc = useQueryClient();
  // Once a queued offline customer creation syncs, refresh the list/meta so
  // the real record (with its server id) replaces the pending-sync banner entry.
  useEffect(() => {
    const onQueueEvent = (e) => {
      if (e.detail?.synced?.item?.type === 'create_customer') {
        qc.invalidateQueries({ queryKey: ['customers'] });
        qc.invalidateQueries({ queryKey: ['meta'] });
      }
    };
    window.addEventListener(QUEUE_EVENT, onQueueEvent);
    return () => window.removeEventListener(QUEUE_EVENT, onQueueEvent);
  }, [qc]);
  useEffect(() => {
    api.customerViews().then((response) => {
      setViews(response.views || []);
      const preferred = (response.views || []).find((view) => view.is_default);
      if (preferred) {
        setActiveView(preferred);
        setViewVisibility(preferred.visibility || 'personal');
        const config = preferred.config || {};
        if (config.filters) setFilters({ ...EMPTY_FILTERS, ...config.filters });
        if (config.columns) setColumnOrder(config.columns);
        if (config.hiddenColumns) setHiddenColumns(config.hiddenColumns);
        if (config.sort) setSort(config.sort);
        if (config.sortDir) setSortDir(config.sortDir);
        if (config.pageSize) setPageSize(config.pageSize);
        if (config.rowHeight) setRowHeight(Number(config.rowHeight));
        if (config.identityFields) setIdentityFields(config.identityFields);
        if (config.columnFilters) setColumnFilters(config.columnFilters);
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
    email: filters.email || undefined,
    phone: filters.phone || undefined,
    erpId: filters.erpId || undefined,
    branchCity: filters.branchCity || undefined,
    spaceType: filters.spaceType || undefined,
    createdFrom: filters.createdFrom || undefined,
    createdTo: filters.createdTo || undefined,
    lastVisitFrom: filters.lastVisitFrom || undefined,
    lastVisitTo: filters.lastVisitTo || undefined,
    noVisits: filters.noVisits ? 'true' : undefined,
    valueMin: filters.valueMin || undefined,
    valueMax: filters.valueMax || undefined,
    minBranches: filters.minBranches || undefined,
    minSpaces: filters.minSpaces || undefined,
    sort: sort !== 'last_visit' ? sort : undefined,
    sortDir,
    ...Object.fromEntries(Object.entries(columnFilters).filter(([, value]) => String(value || '').trim()).map(([key, value]) => [`column_${key}`, value])),
  }), [q, filters, sort, sortDir, columnFilters]);

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
  const availableColumns = [...new Map([...COLUMNS, ...DATABASE_COLUMNS.map(([key, label]) => ({ key, label })), ...customFieldColumns].map((column) => [column.key, column])).values()];
  const columnGroups = [
    { key: 'main', label: 'Βασικά στοιχεία', columns: availableColumns.filter((column) => COLUMNS.some((base) => base.key === column.key)) },
    { key: 'database', label: 'Πεδία βάσης', columns: availableColumns.filter((column) => DATABASE_COLUMNS.some(([key]) => key === column.key)) },
    { key: 'custom', label: 'Custom πεδία', columns: availableColumns.filter((column) => column.customKey) },
  ];
  const normalizedColumnSearch = columnSearch.trim().toLocaleLowerCase('el-GR');
  useEffect(() => {
    if (!showColumns) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setShowColumns(false);
    };
    const closeOnOutsideClick = (event) => {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(event.target)) setShowColumns(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('touchstart', closeOnOutsideClick);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('touchstart', closeOnOutsideClick);
    };
  }, [showColumns]);
  const customValue = (customer, key) => {
    const values = typeof customer.custom_fields === 'string' ? (() => { try { return JSON.parse(customer.custom_fields); } catch { return {}; } })() : (customer.custom_fields || {});
    return values[key];
  };
  const visibleColumns = columnOrder
    .map((key) => availableColumns.find((column) => column.key === key))
    .filter((column) => column && !hiddenColumns.includes(column.key));
  const tableGrid = visibleColumns.map((column) => {
    if (column.key === 'name') return 'minmax(250px, 2.4fr)';
    if (column.key === 'actions') return '42px';
    if (column.key === 'branches') return 'minmax(120px, 1.35fr)';
    if (column.key === 'last_visit') return 'minmax(130px, 1.1fr)';
    return 'minmax(110px, 1fr)';
  }).join(' ');
  const viewConfig = () => ({ filters, columns: columnOrder, hiddenColumns, sort, sortDir, pageSize, rowHeight, identityFields, columnFilters });
  const saveView = async () => {
    const name = viewName.trim() || window.prompt('Όνομα λίστας', activeView?.name || '');
    if (!name) return;
    const response = activeView?.is_owner
      ? await api.updateCustomerView(activeView.id, { name, config: viewConfig(), visibility: viewVisibility })
      : await api.createCustomerView({ name, config: viewConfig(), visibility: viewVisibility });
    const saved = response.view;
    setViews((current) => activeView?.is_owner ? current.map((view) => view.id === saved.id ? saved : view) : [...current, saved]);
    setActiveView(saved);
    setViewName('');
  };
  const renameView = async () => {
    if (!activeView?.is_owner) return;
    const name = window.prompt('Νέο όνομα προβολής', activeView.name);
    if (!name || name.trim() === activeView.name) return;
    const response = await api.updateCustomerView(activeView.id, { name: name.trim() });
    setViews((current) => current.map((view) => view.id === response.view.id ? response.view : view));
    setActiveView(response.view);
  };
  const duplicateView = async () => {
    if (!activeView) return;
    const response = await api.duplicateCustomerView(activeView.id, { visibility: 'personal' });
    setViews((current) => [...current, response.view]);
    applyView(response.view);
  };
  const setDefaultView = async () => {
    if (!activeView?.is_owner) return;
    const response = await api.updateCustomerView(activeView.id, { is_default: !activeView.is_default });
    setViews((current) => current.map((view) => view.id === response.view.id ? response.view : (response.view.is_default && view.visibility === response.view.visibility && (view.visibility === 'shared' || view.user_id === response.view.user_id) ? { ...view, is_default: 0 } : view)));
    setActiveView(response.view);
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
      setViewVisibility('personal');
      return;
    }
    const config = view.config || {};
    setActiveView(view);
    setViewVisibility(view.visibility || 'personal');
    setFilters({ ...EMPTY_FILTERS, ...(config.filters || {}) });
    setColumnOrder(config.columns || DEFAULT_COLUMNS);
    setHiddenColumns(config.hiddenColumns || []);
    setSort(config.sort || 'last_visit');
    setSortDir(config.sortDir || 'DESC');
    setPageSize(config.pageSize || 50);
    if (config.rowHeight) setRowHeight(Number(config.rowHeight));
    setIdentityFields(config.identityFields || DEFAULT_IDENTITY_FIELDS);
    setColumnFilters(config.columnFilters || {});
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
          onSaved={(c) => {
            setShowCreate(false);
            // A customer that couldn't reach the server yet has no real id:
            // it stays visible via PendingSyncBanner and the profile opens
            // automatically once the queued sync completes (see the
            // queue-change effect above), instead of failing to load now.
            if (c.pendingSync) return;
            qc.invalidateQueries({ queryKey: ['customers'] });
            qc.invalidateQueries({ queryKey: ['meta'] });
            onOpenCustomer(c);
          }} />
      )}
      {showFilters && (
        <FilterDrawer filters={filters} meta={meta} onSet={set} onClear={() => setFilters(EMPTY_FILTERS)} onClose={() => setShowFilters(false)} />
      )}

      <PendingSyncBanner />

      <div className="toolbar">
        <div className="search-input">
          <Icon name="search" size={17} />
          <input value={input} placeholder="Όνομα, ΑΦΜ, email, διεύθυνση ή τηλέφωνο…" onChange={(e) => setInput(e.target.value)} />
          {isFetching && <span className="spinner" />}
        </div>
        <button className={`filter-chip${chips.length ? ' active' : ''}`} title="Φίλτρα" onClick={() => setShowFilters(true)}>
          <Icon name="filter" size={15} /> {chips.length > 0 && <span className="pill" style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>{chips.length}</span>}
        </button>
        <div className="sort-control-group" style={{ display: 'flex', gap: 4 }}>
          <IconDropdown
            icon="sort"
            title="Ταξινόμηση"
            value={sort}
            options={SORTS}
            onChange={setSort}
          />
          <button type="button" className="filter-chip icon-dropdown sort-direction-btn" title={sortDir === 'ASC' ? 'Αύξουσα σειρά' : 'Φθίνουσα σειρά'} onClick={() => setSortDir((direction) => direction === 'ASC' ? 'DESC' : 'ASC')}>
            <Icon name="chevronDown" size={15} style={{ transform: sortDir === 'ASC' ? 'rotate(180deg)' : undefined }} />
          </button>
        </div>
        <IconDropdown
          icon="eye"
          title="Αποθηκευμένη προβολή"
          value={activeView?.id || ''}
          options={[{ value: '', label: 'Προσωρινή' }, ...views.map((view) => ({ value: view.id, label: `${view.visibility === 'shared' ? 'Κοινή · ' : ''}${view.name}` }))]}
          onChange={(id) => applyView(views.find((view) => String(view.id) === String(id)))}
        />
        <IconDropdown
          icon="users"
          title="Εμβέλεια αποθήκευσης"
          value={viewVisibility}
          options={[{ value: 'personal', label: 'Προσωπική' }, { value: 'shared', label: 'Κοινή ομάδα' }]}
          onChange={setViewVisibility}
        />
        <div className="customer-columns-anchor" ref={columnsMenuRef}>
          <button className={`btn${showColumns ? ' is-active' : ''}`} title="Στήλες" onClick={() => setShowColumns((open) => !open)}><Icon name="grid" size={15} /> <span className="customer-columns-count">{visibleColumns.length}</span></button>
          {showColumns && (
          <div className="customer-columns-menu" role="dialog" aria-label="Επιλογή στηλών">
            <div className="customer-columns-menu-head">
              <b>Στήλες</b>
              <span>{visibleColumns.length}/{availableColumns.length}</span>
              <button type="button" className="customer-columns-close" aria-label="Κλείσιμο στηλών" onClick={() => setShowColumns(false)}><Icon name="x" size={16} /></button>
            </div>
            <input className="customer-columns-search" value={columnSearch} onChange={(event) => setColumnSearch(event.target.value)} placeholder="Αναζήτηση πεδίου…" />
            <div className="customer-columns-actions">
              <button type="button" onClick={() => { setColumnOrder(availableColumns.map((column) => column.key)); setHiddenColumns([]); }}>Όλες</button>
              <button type="button" onClick={() => setHiddenColumns(availableColumns.filter((column) => column.key !== 'name' && column.key !== 'actions').map((column) => column.key))}>Καμία</button>
            </div>
            <div className="customer-columns-list">
              <div className="customer-columns-group identity-fields-group">
                <small>Κάτω από το όνομα · σύρετε για σειρά</small>
                {IDENTITY_FIELDS.map(([key, label]) => {
                  const selected = identityFields.includes(key);
                  return <label key={key} draggable={selected} className={selected ? 'identity-field-option' : ''} onDragStart={() => selected && setDragColumn(`identity:${key}`)} onDragOver={(event) => event.preventDefault()} onDrop={() => {
                    if (!dragColumn?.startsWith('identity:') || dragColumn === `identity:${key}`) return;
                    setIdentityFields((current) => {
                      const next = [...current]; const from = next.indexOf(dragColumn.slice(9)); const to = next.indexOf(key);
                      if (from < 0 || to < 0) return current;
                      next.splice(from, 1); next.splice(to, 0, dragColumn.slice(9)); return next;
                    });
                    setDragColumn(null);
                  }}>
                    <input type="checkbox" checked={selected} onChange={() => setIdentityFields((current) => selected ? current.filter((item) => item !== key) : [...current, key])} />
                    <span>{label}</span>
                    {selected && <Icon name="menu" size={13} />}
                  </label>;
                })}
              </div>
              {columnGroups.map((group) => {
                const columns = group.columns.filter((column) => column.key !== 'actions' && (!normalizedColumnSearch || column.label.toLocaleLowerCase('el-GR').includes(normalizedColumnSearch) || column.key.toLocaleLowerCase().includes(normalizedColumnSearch)));
                if (!columns.length) return null;
                return <div key={group.key} className="customer-columns-group">
                  <small>{group.label}</small>
                  {columns.map((column) => {
                    const key = column.key;
                    return <label key={key}><input type="checkbox" checked={!hiddenColumns.includes(key) && columnOrder.includes(key)} onChange={() => {
                      setHiddenColumns((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
                      if (!columnOrder.includes(key)) setColumnOrder((current) => [...current, key]);
                    }} /> <span>{column.label}</span></label>;
                  })}
                </div>;
              })}
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => { setColumnOrder(DEFAULT_COLUMNS); setHiddenColumns([]); setIdentityFields(DEFAULT_IDENTITY_FIELDS); setColumnFilters({}); setColumnSearch(''); }}>Επαναφορά</button>
          </div>
          )}
        </div>
        <button className="btn btn-accent" title={activeView?.is_owner ? 'Αποθήκευση' : 'Αποθήκευση ως νέα'} onClick={saveView}><Icon name="save" size={15} /></button>
        {activeView?.is_owner && <button className="btn btn-sm" title="Μετονομασία προβολής" onClick={renameView}><Icon name="edit" size={14} /></button>}
        {activeView && <button className="btn btn-sm" title="Διπλότυπο" onClick={duplicateView}><Icon name="copy" size={14} /></button>}
        {activeView?.is_owner && <button className={`btn btn-sm${activeView.is_default ? ' btn-accent' : ''}`} title={activeView.is_default ? 'Κατάργηση προεπιλογής' : 'Ορισμός ως προεπιλογή'} onClick={setDefaultView}><Icon name="star" size={14} /></button>}
        {activeView?.is_owner && <button className="btn btn-ghost danger-action" title="Διαγραφή προβολής" onClick={deleteView}><Icon name="x" size={15} /></button>}
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
        <div className="thead" style={{ gridTemplateColumns: tableGrid }}>
          {visibleColumns.map((c) => (
            <div key={c.key} draggable onDragStart={() => setDragColumn(c.key)} onDragOver={(event) => event.preventDefault()} onDrop={() => dragEnd(c.key)} className={`${c.sort ? 'sortable' : ''} table-head-cell`} style={c.key === 'actions' ? { textAlign: 'right' } : undefined}>
              <button type="button" className="table-head-sort" onClick={c.sort ? () => toggleSort(c.sort) : undefined}>
                {c.label}
                {c.sort && sort === c.sort && <Icon name="chevronDown" size={13} style={{ transform: sortDir === 'ASC' ? 'rotate(180deg)' : undefined }} />}
              </button>
              {COLUMN_FILTER_KEYS.has(c.key) && <input className="column-filter-input" value={columnFilters[c.key] || ''} placeholder="Φίλτρο…" onClick={(event) => event.stopPropagation()} onChange={(event) => { setColumnFilters((current) => ({ ...current, [c.key]: event.target.value })); setPage(1); }} />}
            </div>
          ))}
        </div>

        {isLoading ? (
          <div style={{ padding: 8 }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div className="trow" key={i} style={{ cursor: 'default', gridTemplateColumns: tableGrid }}>
                <div className="cust-cell"><Skeleton w={38} h={38} style={{ borderRadius: '50%' }} /><Skeleton w={140} /></div>
                <Skeleton w={70} /><Skeleton w={80} /><Skeleton w={60} /><Skeleton w={70} /><Skeleton w={40} /><Skeleton w={60} /><span />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon="users" title="Δεν βρέθηκαν πελάτες" hint="Δοκιμάστε διαφορετικά κριτήρια αναζήτησης ή φίλτρα." />
        ) : (
          rows.map((c) => {
            const displayName = c.company || c.full_name || 'Χωρίς όνομα';
            const identityValues = {
              customer_type: TYPE_LABELS[c.customer_type],
              status: STATUS_LABELS[c.status],
              branches_count: c.branches_count != null ? `${formatNumber(c.branches_count)} υποκ.` : '',
              spaces_count: c.spaces_count != null ? `${formatNumber(c.spaces_count)} χώροι` : '',
              last_visit_at: c.last_visit_at ? formatDate(c.last_visit_at) : '',
            };
            const identityMeta = identityFields.map((field) => identityValues[field] ?? c[field]).filter((value) => value !== undefined && value !== null && value !== '').join(' · ');
            return <div className="trow" key={c.id} style={{ gridTemplateColumns: tableGrid, minHeight: `${rowHeight}px` }} onClick={() => onOpenCustomer(c)}>
            {visibleColumns.map((column) => column.key === 'name' ? <div className="cust-cell" key={column.key}>
                <Avatar name={displayName} src={c.avatar_url} size={38} fallback={false} />
                <div style={{ minWidth: 0 }}>
                  <div className="nm" title={displayName}>{displayName} {c.is_vip ? <span className="customer-vip" title="VIP">★</span> : null}</div>
                  {identityMeta && <div className="sub">{identityMeta}</div>}
                </div>
              </div>
              : column.key === 'code' ? <div className="mono muted" key={column.key}>{c.code}</div>
                : column.key === 'status' ? <div key={column.key}><StatusBadge status={c.status} /></div>
                  : column.key === 'branches' ? <div className="mono" key={column.key}>{formatNumber(c.branches_count)} · {formatNumber(c.spaces_count)}</div>
                    : column.key === 'last_visit' ? <div className="muted" key={column.key}>{formatDate(c.last_visit_at)}</div>
                      : column.key === 'bookings' ? <div className="mono" key={column.key}>{formatNumber(c.bookings_count)}</div>
                        : column.key === 'value' ? <div className="num" key={column.key}>{formatCurrency(c.total_value)}</div>
                          : column.key === 'actions' ? <div key={column.key} style={{ textAlign: 'right', color: 'var(--text-3)' }}><Icon name="chevronRight" size={16} /></div>
                            : <div key={column.key} className={typeof (column.customKey ? customValue(c, column.customKey) : c[column.key]) === 'number' ? 'num' : 'muted'}>{String(column.customKey ? customValue(c, column.customKey) ?? '' : c[column.key] ?? '')}</div>)}
            </div>
          })
        )}
      </div>

      <div className="customer-card-list">
        {rows.map((c) => {
          const displayName = c.company || c.full_name || 'Χωρίς όνομα';
          return <button className="customer-card" key={c.id} type="button" onClick={() => onOpenCustomer(c)}>
            <div className="customer-card-top">
              <Avatar name={displayName} src={c.avatar_url} size={42} fallback={false} />
              <div className="customer-card-title"><strong>{displayName}</strong><span>{c.code || 'Χωρίς κωδικό'}</span></div>
              <Icon name="chevronRight" size={17} />
            </div>
            <div className="customer-card-meta">
              <StatusBadge status={c.status} />
              <span>{formatNumber(c.branches_count)} υποκ. · {formatNumber(c.spaces_count)} χώροι</span>
              <span>{formatNumber(c.bookings_count)} κρατήσεις</span>
              <strong>{formatCurrency(c.total_value)}</strong>
            </div>
          </button>;
        })}
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
