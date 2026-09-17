import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { formatCurrency, formatDate } from '../lib/format.js';

const today = new Date().toISOString().slice(0, 10);
const initial = { series: '7001', quoteNumber: '', quoteDate: today, customerId: '', branchId: '', emailTemplate: 'SALES - Προσφορά // EVENTS', paymentTerms: 'Επί Πίστωση', validUntil: '', sellerId: '', referenceStartYear: '', referenceEndYear: '', paymentDueDate: '', sendEmail: false };

function SearchSelect({ label, value, selectedLabel, disabled, onSelect, queryFn, placeholder }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const result = useQuery({ queryKey: ['quote-select', label, term, value], queryFn: ({ signal }) => queryFn(term, signal), enabled: open && !disabled });
  return <label className="search-select-label">{label}<div className="search-select"><button type="button" className="search-select-trigger" disabled={disabled} onClick={() => setOpen((current) => !current)}>{selectedLabel || placeholder}<Icon name="chevronDown" size={14} /></button>{open && !disabled && <div className="search-select-menu"><input autoFocus placeholder="Αναζήτηση…" value={term} onChange={(event) => setTerm(event.target.value)} />{(result.data?.results || []).map((item) => <button type="button" key={item.id} onClick={() => { onSelect(item); setOpen(false); setTerm(''); }}>{item.company || item.full_name || item.name}<small>{item.code || item.city || item.address_line || ''}</small></button>)}{!result.data?.results?.length && <span className="search-select-empty">Δεν βρέθηκαν αποτελέσματα</span>}</div>}</div></label>;
}

export default function Quotes() {
  const [editing, setEditing] = useState(false);
  const quotes = useQuery({ queryKey: ['quotes'], queryFn: ({ signal }) => api.quotes({ signal }) });
  if (editing) return <QuoteEditor onBack={() => setEditing(false)} onSaved={() => { setEditing(false); quotes.refetch(); }} />;
  return <div className="quotes-page">
    <div className="page-head"><div><h1>Προσφορές</h1><div className="sub">Δημιουργία, παρακολούθηση και αποστολή προσφορών</div></div><button className="btn btn-primary" onClick={() => setEditing(true)}><Icon name="plus" size={16} /> Νέα προσφορά</button></div>
    <div className="quotes-summary"><div><span>Σύνολο</span><b>{quotes.data?.results?.length || 0}</b></div><div><span>Πρόχειρες</span><b>{quotes.data?.results?.filter((q) => q.status === 'draft').length || 0}</b></div><div><span>Απεσταλμένες</span><b>{quotes.data?.results?.filter((q) => q.email_sent).length || 0}</b></div></div>
    <div className="quotes-table">{(quotes.data?.results || []).map((quote) => <div className="quote-row" key={quote.id}><div className="quote-number">{quote.series}-{quote.quote_number}</div><div><b>{quote.company || quote.customer_name}</b><span>{quote.branch_name || 'Όλα τα υποκαταστήματα'} · {formatDate(quote.quote_date)}</span></div><div><span className={`quote-status ${quote.status}`}>{quote.status === 'draft' ? 'Πρόχειρη' : 'Έτοιμη'}</span></div><strong>{formatCurrency(quote.total)}</strong><Icon name="chevronRight" size={16} /></div>)}</div>
  </div>;
}

function QuoteEditor({ onBack, onSaved }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(initial);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [lines, setLines] = useState([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [saving, setSaving] = useState(false);
  const branches = useQuery({ queryKey: ['quote-branches', form.customerId], queryFn: ({ signal }) => api.branches({ customerId: form.customerId, limit: 100 }, { signal }), enabled: !!form.customerId });
  const meta = useQuery({ queryKey: ['meta'], queryFn: ({ signal }) => api.meta({ signal }) });
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const calculate = useMemo(() => lines.reduce((sum, line) => sum + Number(line.line_total || 0), 0), [lines]);
  const loadLines = async () => {
    setLoadingLines(true);
    try { const response = await api.resolveQuoteLines({ customerId: Number(form.customerId), branchId: form.branchId || null, referenceStartYear: Number(form.referenceStartYear) || null, referenceEndYear: Number(form.referenceEndYear) || null, paymentDueDate: form.paymentDueDate || null }); setLines(response.lines || []); } finally { setLoadingLines(false); }
  };
  const updateLine = (index, key, value) => setLines((current) => current.map((line, i) => {
    if (i !== index) return line;
    const next = { ...line, [key]: value };
    const quantity = Number(next.quantity || 0);
    const price = Number(next.unit_price || 0);
    const discount = Number(next.discount_percent || 0);
    const tax = Number(next.tax_percent || 0);
    next.line_total = Number((quantity * price * (1 - discount / 100) * (1 + tax / 100)).toFixed(2));
    return next;
  }));
  const save = async (event) => { event.preventDefault(); setSaving(true); try { await api.createQuote({ ...form, customerId: Number(form.customerId), branchId: form.branchId ? Number(form.branchId) : null, lines }); qc.invalidateQueries({ queryKey: ['quotes'] }); onSaved(); } finally { setSaving(false); } };
  return <div className="quotes-page quote-editor"><button className="btn btn-ghost btn-sm" onClick={onBack}><Icon name="arrowLeft" size={16} /> Προσφορές</button><div className="quote-editor-head"><div><div className="settings-eyebrow">NEW QUOTE</div><h1>Νέα προσφορά</h1><p>Συμπλήρωσε τα στοιχεία και φόρτωσε τις γραμμές από το API.</p></div><div className="quote-editor-actions"><button className="btn" onClick={onBack}>Ακύρωση</button><button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? <span className="spinner" /> : <Icon name="check" size={15} />} Αποθήκευση</button></div></div>
    <form onSubmit={save} className="quote-editor-grid"><div className="quote-main">
      <section className="quote-card"><div className="quote-card-head"><h3>Στοιχεία προσφοράς</h3><Icon name="file" size={18} /></div><div className="quote-form-grid">
        <label>Σειρά<select value={form.series} onChange={set('series')}><option>7001</option><option>7002</option></select></label><label>Αριθμός<input value={form.quoteNumber} onChange={set('quoteNumber')} placeholder="Αυτόματο" /></label><label>Ημερομηνία<input type="date" value={form.quoteDate} onChange={set('quoteDate')} /></label>
        <SearchSelect label="Πελάτης" value={form.customerId} selectedLabel={selectedCustomer ? `${selectedCustomer.company || selectedCustomer.full_name} · ${selectedCustomer.code}` : ''} placeholder="Επιλογή πελάτη" onSelect={(customer) => { setSelectedCustomer(customer); setForm((current) => ({ ...current, customerId: customer.id, branchId: '' })); }} queryFn={(term, signal) => api.searchCustomers({ page: 1, limit: 25, q: term, sort: 'name', sortDir: 'ASC' }, { signal })} />
        <SearchSelect label="Υποκατάστημα" value={form.branchId} selectedLabel={branches.data?.results?.find((branch) => String(branch.id) === String(form.branchId))?.name} placeholder="Όλα τα υποκαταστήματα" disabled={!form.customerId} onSelect={(branch) => setForm((current) => ({ ...current, branchId: branch.id }))} queryFn={(term, signal) => api.branches({ customerId: form.customerId, q: term, limit: 25 }, { signal })} />
        <label>Πωλητής<select value={form.sellerId} onChange={set('sellerId')}><option value="">Επιλογή πωλητή</option>{(meta.data?.employees || []).map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></label>
        <label>Email template<select value={form.emailTemplate} onChange={set('emailTemplate')}><option>SALES - Προσφορά // EVENTS</option></select></label>
      </div></section>
      <section className="quote-card"><div className="quote-card-head"><div><h3>Παράμετροι API</h3><p>Οι τιμές στέλνονται στο endpoint και επιστρέφουν γραμμές.</p></div><Icon name="refresh" size={18} /></div><div className="quote-form-grid"><label>Αρχικό έτος αναφοράς<input type="number" value={form.referenceStartYear} onChange={set('referenceStartYear')} /></label><label>Τελικό έτος αναφοράς<input type="number" value={form.referenceEndYear} onChange={set('referenceEndYear')} /></label><label>Ημερομηνία εξόφλησης<input type="date" value={form.paymentDueDate} onChange={set('paymentDueDate')} /></label><label>Ισχύει έως<input type="date" value={form.validUntil} onChange={set('validUntil')} /></label><label>Τρόπος πληρωμής<select value={form.paymentTerms} onChange={set('paymentTerms')}><option>Επί Πίστωση</option><option>Μετρητοίς</option></select></label></div><button type="button" className="btn btn-accent" disabled={!form.customerId || loadingLines} onClick={loadLines}>{loadingLines ? <span className="spinner" /> : <Icon name="refresh" size={15} />} Λήψη γραμμών από API</button></section>
      <section className="quote-card"><div className="quote-card-head"><h3>Γραμμές προσφοράς</h3><button type="button" className="btn btn-sm" onClick={() => setLines((current) => [...current, { description: '', quantity: 1, unit_price: 0, discount_percent: 0, tax_percent: 24 }])}><Icon name="plus" size={14} /> Προσθήκη</button></div><div className="quote-lines">{lines.length === 0 ? <div className="quote-empty">Δεν υπάρχουν γραμμές. Χρησιμοποίησε το API ή πρόσθεσε χειροκίνητα.</div> : lines.map((line, index) => <div className="quote-line" key={index}><input placeholder="Περιγραφή" value={line.description || ''} onChange={(event) => updateLine(index, 'description', event.target.value)} /><input type="number" placeholder="Ποσ." value={line.quantity} onChange={(event) => updateLine(index, 'quantity', event.target.value)} /><input type="number" placeholder="Τιμή" value={line.unit_price} onChange={(event) => updateLine(index, 'unit_price', event.target.value)} /><input type="number" placeholder="ΦΠΑ %" value={line.tax_percent} onChange={(event) => updateLine(index, 'tax_percent', event.target.value)} /><button type="button" className="btn btn-icon btn-sm" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}><Icon name="x" size={14} /></button></div>)}</div></section>
    </div><aside className="quote-side"><div className="quote-total-card"><span>Σύνολο προσφοράς</span><strong>{formatCurrency(calculate)}</strong><small>Οι τελικοί υπολογισμοί γίνονται κατά την αποθήκευση.</small></div><div className="quote-card"><label className="quote-email-toggle"><input type="checkbox" checked={form.sendEmail} onChange={set('sendEmail')} /><span><b>Αποστολή email</b><small>Αποστολή μετά την αποθήκευση</small></span></label><div className="quote-email-status"><span className="status-dot" /> Email δεν έχει σταλεί</div></div></aside></form>
  </div>;
}
