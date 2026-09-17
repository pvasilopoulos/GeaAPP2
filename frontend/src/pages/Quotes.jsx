import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { formatCurrency, formatDate } from '../lib/format.js';

const today = new Date().toISOString().slice(0, 10);
const initial = { series: 'ΠΡΟΣ', quoteNumber: '', quoteDate: today, customerId: '', branchId: '', emailTemplate: '', paymentTerms: '', validUntil: '', sellerId: '', referenceStartYear: '', referenceEndYear: '', paymentDueDate: '', sendEmail: false };

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
  const [lines, setLines] = useState([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [saving, setSaving] = useState(false);
  const customers = useQuery({ queryKey: ['quote-customers'], queryFn: ({ signal }) => api.searchCustomers({ page: 1, limit: 100, sort: 'name', sortDir: 'ASC' }, { signal }) });
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
        <label>Σειρά<input value={form.series} onChange={set('series')} /></label><label>Αριθμός<input value={form.quoteNumber} onChange={set('quoteNumber')} placeholder="Αυτόματο" /></label><label>Ημερομηνία<input type="date" value={form.quoteDate} onChange={set('quoteDate')} /></label>
        <label className="wide">Πελάτης<select required value={form.customerId} onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value, branchId: '' }))}><option value="">Επιλογή πελάτη</option>{(customers.data?.results || []).map((customer) => <option key={customer.id} value={customer.id}>{customer.company || customer.full_name} · {customer.code}</option>)}</select></label>
        <label className="wide">Υποκατάστημα<select value={form.branchId} onChange={set('branchId')} disabled={!form.customerId}><option value="">Όλα τα υποκαταστήματα</option>{(branches.data?.results || []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name} · {branch.city || ''}</option>)}</select></label>
        <label>Πωλητής<select value={form.sellerId} onChange={set('sellerId')}><option value="">Επιλογή πωλητή</option>{(meta.data?.employees || []).map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></label>
        <label>Email template<select value={form.emailTemplate} onChange={set('emailTemplate')}><option value="">Χωρίς template</option><option value="quote_default">Προσφορά — προεπιλεγμένο</option><option value="quote_followup">Προσφορά — follow-up</option></select></label>
      </div></section>
      <section className="quote-card"><div className="quote-card-head"><div><h3>Παράμετροι API</h3><p>Οι τιμές στέλνονται στο endpoint και επιστρέφουν γραμμές.</p></div><Icon name="refresh" size={18} /></div><div className="quote-form-grid"><label>Αρχικό έτος αναφοράς<input type="number" value={form.referenceStartYear} onChange={set('referenceStartYear')} /></label><label>Τελικό έτος αναφοράς<input type="number" value={form.referenceEndYear} onChange={set('referenceEndYear')} /></label><label>Ημερομηνία εξόφλησης<input type="date" value={form.paymentDueDate} onChange={set('paymentDueDate')} /></label><label>Ισχύει έως<input type="date" value={form.validUntil} onChange={set('validUntil')} /></label><label className="wide">Πληρωμή<input value={form.paymentTerms} onChange={set('paymentTerms')} placeholder="π.χ. 50% προκαταβολή, εξόφληση σε 30 ημέρες" /></label></div><button type="button" className="btn btn-accent" disabled={!form.customerId || loadingLines} onClick={loadLines}>{loadingLines ? <span className="spinner" /> : <Icon name="refresh" size={15} />} Λήψη γραμμών από API</button></section>
      <section className="quote-card"><div className="quote-card-head"><h3>Γραμμές προσφοράς</h3><button type="button" className="btn btn-sm" onClick={() => setLines((current) => [...current, { description: '', quantity: 1, unit_price: 0, discount_percent: 0, tax_percent: 24 }])}><Icon name="plus" size={14} /> Προσθήκη</button></div><div className="quote-lines">{lines.length === 0 ? <div className="quote-empty">Δεν υπάρχουν γραμμές. Χρησιμοποίησε το API ή πρόσθεσε χειροκίνητα.</div> : lines.map((line, index) => <div className="quote-line" key={index}><input placeholder="Περιγραφή" value={line.description || ''} onChange={(event) => updateLine(index, 'description', event.target.value)} /><input type="number" placeholder="Ποσ." value={line.quantity} onChange={(event) => updateLine(index, 'quantity', event.target.value)} /><input type="number" placeholder="Τιμή" value={line.unit_price} onChange={(event) => updateLine(index, 'unit_price', event.target.value)} /><input type="number" placeholder="ΦΠΑ %" value={line.tax_percent} onChange={(event) => updateLine(index, 'tax_percent', event.target.value)} /><button type="button" className="btn btn-icon btn-sm" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}><Icon name="x" size={14} /></button></div>)}</div></section>
    </div><aside className="quote-side"><div className="quote-total-card"><span>Σύνολο προσφοράς</span><strong>{formatCurrency(calculate)}</strong><small>Οι τελικοί υπολογισμοί γίνονται κατά την αποθήκευση.</small></div><div className="quote-card"><label className="quote-email-toggle"><input type="checkbox" checked={form.sendEmail} onChange={set('sendEmail')} /><span><b>Αποστολή email</b><small>Αποστολή μετά την αποθήκευση</small></span></label><div className="quote-email-status"><span className="status-dot" /> Email δεν έχει σταλεί</div></div></aside></form>
  </div>;
}
