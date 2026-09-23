import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '../../components/Icon.jsx';
import { api } from '../../api.js';

const DEFAULT_AUTH = { type: 'none', token: '', username: '', password: '', api_key_name: '', api_key_value: '', api_key_in: 'header' };

const DEFAULT = {
  enabled: true, url: '', method: 'POST',
  body_template: '{"customerId":"{{customerId}}","customerErpId":"{{customerErpId}}","customerCode":"{{customerCode}}","customerName":"{{customerName}}","customerCompany":"{{customerCompany}}","customerTaxId":"{{customerTaxId}}","customerEmail":"{{customerEmail}}","customerPhone":"{{customerPhone}}","branchId":"{{branchId}}","branchErpId":"{{branchErpId}}","branchCode":"{{branchCode}}","branchName":"{{branchName}}","branchCity":"{{branchCity}}","branchAddress":"{{branchAddress}}","series":"{{series}}","quoteNumber":"{{quoteNumber}}","quoteDate":"{{quoteDate}}","validUntil":"{{validUntil}}","paymentTerms":"{{paymentTerms}}","sellerId":"{{sellerId}}","referenceStartYear":"{{referenceStartYear}}","referenceEndYear":"{{referenceEndYear}}","paymentDueDate":"{{paymentDueDate}}"}',
  headers: '{}', response_path: 'data.lines', response_encoding: 'auto',
  line_field_mappings: { description: '', quantity: '', unit_price: '', discount_percent: '', tax_percent: '' },
  timeout_ms: 30000, auth: DEFAULT_AUTH, debug: false,
};

const RESOLVE_LINES_FIELDS = [
  'customerId', 'customerErpId', 'customerCode', 'customerName', 'customerCompany', 'customerTaxId', 'customerEmail', 'customerPhone',
  'branchId', 'branchErpId', 'branchCode', 'branchName', 'branchCity', 'branchAddress',
  'series', 'quoteNumber', 'quoteDate', 'validUntil', 'paymentTerms', 'sellerId',
  'referenceStartYear', 'referenceEndYear', 'paymentDueDate',
];

const PUSH_DEFAULT = {
  enabled: true, url: '', method: 'POST', headers: '{}', body_template: '{}', response_id_path: 'id',
  timeout_ms: 30000, auth: DEFAULT_AUTH, debug: false,
};

const PUSH_FIELDS = [
  'quoteId', 'series', 'quoteNumber', 'quoteDate', 'validUntil', 'status',
  'customerId', 'customerErpId', 'customerName', 'customerCompany',
  'branchId', 'branchErpId', 'branchName', 'sellerId',
  'paymentTerms', 'paymentDueDate', 'referenceStartYear', 'referenceEndYear',
  'subtotal', 'taxTotal', 'total', 'lines',
];

// Shared auth-strategy sub-form used by both the fetch and push cards, so
// credentials don't have to be hand-authored into the raw Headers JSON.
function AuthFields({ auth, onChange }) {
  const a = { ...DEFAULT_AUTH, ...auth };
  const set = (key) => (event) => onChange({ ...a, [key]: event.target.value });
  return <div className="field-group" style={{ gridColumn: '1 / -1' }}>
    <label>Αυθεντικοποίηση</label>
    <select className="settings-control" value={a.type} onChange={set('type')}>
      <option value="none">Καμία (μόνο headers)</option>
      <option value="bearer">Bearer token</option>
      <option value="basic">Basic auth (username/password)</option>
      <option value="apikey">API key (header ή query)</option>
    </select>
    {a.type === 'bearer' && <div className="customers-settings-grid" style={{ marginTop: 8 }}>
      <div className="field-group" style={{ gridColumn: '1 / -1' }}><label>Token</label><input className="settings-control" type="password" value={a.token} onChange={set('token')} placeholder="eyJhbGciOi..." /></div>
    </div>}
    {a.type === 'basic' && <div className="customers-settings-grid" style={{ marginTop: 8 }}>
      <div className="field-group"><label>Username</label><input className="settings-control" value={a.username} onChange={set('username')} /></div>
      <div className="field-group"><label>Password</label><input className="settings-control" type="password" value={a.password} onChange={set('password')} /></div>
    </div>}
    {a.type === 'apikey' && <div className="customers-settings-grid" style={{ marginTop: 8 }}>
      <div className="field-group"><label>Όνομα (header ή query param)</label><input className="settings-control" value={a.api_key_name} onChange={set('api_key_name')} placeholder="X-Api-Key" /></div>
      <div className="field-group"><label>Τιμή</label><input className="settings-control" type="password" value={a.api_key_value} onChange={set('api_key_value')} /></div>
      <div className="field-group"><label>Τοποθέτηση</label><select className="settings-control" value={a.api_key_in} onChange={set('api_key_in')}><option value="header">HTTP Header</option><option value="query">Query parameter (URL)</option></select></div>
    </div>}
  </div>;
}

export default function QuotesPanel() {
  const { data, isLoading } = useQuery({ queryKey: ['settings-app'], queryFn: () => api.appSettings() });
  const [value, setValue] = useState(DEFAULT);
  const [pushValue, setPushValue] = useState(PUSH_DEFAULT);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [pushPreview, setPushPreview] = useState(null);
  const [pushPreviewing, setPushPreviewing] = useState(false);
  useEffect(() => { if (data?.settings?.quote_api) setValue({ ...DEFAULT, ...data.settings.quote_api, auth: { ...DEFAULT_AUTH, ...data.settings.quote_api.auth } }); }, [data]);
  useEffect(() => { if (data?.settings?.quote_push_api) setPushValue({ ...PUSH_DEFAULT, ...data.settings.quote_push_api, auth: { ...DEFAULT_AUTH, ...data.settings.quote_push_api.auth } }); }, [data]);
  if (isLoading) return <div className="card card-pad">Φόρτωση…</div>;
  const update = (key) => (event) => setValue((current) => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const updateLineMapping = (key) => (event) => setValue((current) => ({
    ...current,
    line_field_mappings: { ...DEFAULT.line_field_mappings, ...current.line_field_mappings, [key]: event.target.value },
  }));
  const updatePush = (key) => (event) => setPushValue((current) => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const save = async (event) => {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      JSON.parse(value.headers || '{}'); JSON.parse(value.body_template || '{}');
      JSON.parse(pushValue.headers || '{}');
      await api.updateAppSettings({ quote_api: value, quote_push_api: pushValue });
      setMessage('Οι ρυθμίσεις προσφορών αποθηκεύτηκαν.');
    }
    catch (error) { setMessage(error.message || 'Ελέγξτε ότι τα Headers και το Body είναι έγκυρα JSON.'); }
    finally { setSaving(false); }
  };
  const previewFetch = async () => {
    setPreviewing(true); setPreview(null);
    try { const result = await api.previewQuoteFetch(value.body_template); setPreview({ ok: true, text: JSON.stringify(result.rendered, null, 2) }); }
    catch (error) { setPreview({ ok: false, text: error.message || 'Μη έγκυρο template' }); }
    finally { setPreviewing(false); }
  };
  const previewPush = async () => {
    setPushPreviewing(true); setPushPreview(null);
    try { const result = await api.previewQuotePush(pushValue.body_template); setPushPreview({ ok: true, text: JSON.stringify(result.rendered, null, 2) }); }
    catch (error) { setPushPreview({ ok: false, text: error.message || 'Μη έγκυρο template' }); }
    finally { setPushPreviewing(false); }
  };
  return <form className="settings-module-panel" onSubmit={save}>
    <div className="customers-settings-hero"><div className="customers-settings-icon"><Icon name="file" size={22} /></div><div><div className="settings-eyebrow">QUOTES MODULE</div><h2>Προσφορές / ERP API</h2><p>Ρύθμισε τα endpoints λήψης γραμμών και αποστολής προσφοράς προς το ERP: URL, μέθοδος, αυθεντικοποίηση, timeout και debug logging.</p></div></div>
    {message && <div className="voice-msg ok">{message}</div>}

    <section className="customers-settings-card"><div className="customers-settings-card-head"><div><h3>Endpoint γραμμών προσφοράς</h3><p>Οι μεταβλητές στο body αντικαθίστανται με τα στοιχεία της προσφοράς. Καλείται όταν πατάς «Λήψη γραμμών από API» σε μια προσφορά.</p></div><Icon name="refresh" size={18} /></div>
      <label className="quote-email-toggle" style={{ marginBottom: 12 }}><input type="checkbox" checked={value.enabled !== false} onChange={(event) => setValue((current) => ({ ...current, enabled: event.target.checked }))} /><span><b>Ενεργό</b><small>Απενεργοποίησέ το προσωρινά χωρίς να χάσεις τις ρυθμίσεις</small></span></label>
      <div className="customers-settings-grid">
        <div className="field-group" style={{ gridColumn: '1 / -1' }}><label>URL endpoint</label><input className="settings-control" value={value.url} onChange={update('url')} placeholder="https://erp.example.gr/api/quotes/lines" /></div>
        <div className="field-group"><label>HTTP method</label><select className="settings-control" value={value.method} onChange={update('method')}><option>POST</option><option>GET</option></select></div>
        <div className="field-group"><label>JSON path γραμμών</label><input className="settings-control" value={value.response_path} onChange={update('response_path')} placeholder="data.lines" /></div>
        <div className="field-group"><label>Encoding response</label><select className="settings-control" value={value.response_encoding} onChange={update('response_encoding')}><option value="auto">Αυτόματο</option><option value="utf8">UTF-8</option><option value="windows-1253">Windows-1253 / Ελληνικά ERP</option></select></div>
        <div className="field-group"><label>Timeout (ms)</label><input className="settings-control" type="number" min="2000" max="120000" step="1000" value={value.timeout_ms} onChange={update('timeout_ms')} /></div>
      </div>
      <div className="customers-settings-grid"><AuthFields auth={value.auth} onChange={(auth) => setValue((current) => ({ ...current, auth }))} /></div>
      <div className="customers-settings-grid">
        <div className="field-group" style={{ gridColumn: '1 / -1' }}><label>Αντιστοίχιση πεδίων γραμμής ERP <em>Προαιρετικά: γράψε το ακριβές κλειδί από κάθε γραμμή του response</em></label></div>
        <div className="field-group"><label>Περιγραφή</label><input className="settings-control" value={value.line_field_mappings?.description || ''} onChange={updateLineMapping('description')} placeholder="π.χ. Περιγραφή" /></div>
        <div className="field-group"><label>Ποσότητα</label><input className="settings-control" value={value.line_field_mappings?.quantity || ''} onChange={updateLineMapping('quantity')} placeholder="π.χ. Ποσότητα" /></div>
        <div className="field-group"><label>Τιμή μονάδας</label><input className="settings-control" value={value.line_field_mappings?.unit_price || ''} onChange={updateLineMapping('unit_price')} placeholder="π.χ. Αξία" /></div>
        <div className="field-group"><label>Έκπτωση %</label><input className="settings-control" value={value.line_field_mappings?.discount_percent || ''} onChange={updateLineMapping('discount_percent')} placeholder="π.χ. Έκπτωση" /></div>
        <div className="field-group"><label>ΦΠΑ %</label><input className="settings-control" value={value.line_field_mappings?.tax_percent || ''} onChange={updateLineMapping('tax_percent')} placeholder="π.χ. ΦΠΑ" /></div>
      </div>
      <div className="customers-settings-grid"><div className="field-group"><label>Headers JSON <em>Επιπλέον headers (πέραν της αυθεντικοποίησης)</em></label><textarea className="settings-control settings-code" rows="6" value={value.headers} onChange={update('headers')} /></div><div className="field-group"><label>Body template JSON</label><textarea className="settings-control settings-code" rows="6" value={value.body_template} onChange={update('body_template')} /></div></div>
      <div className="muted" style={{ marginTop: 12 }}>Διαθέσιμες μεταβλητές: {RESOLVE_LINES_FIELDS.map((field) => <code key={field} style={{ marginRight: 6 }}>{`{{${field}}}`}</code>)}</div>
      {value.method === 'GET' && <div className="muted" style={{ marginTop: 6 }}>Σε GET requests το body στέλνεται ως query parameters στο URL (π.χ. <code>?customerId=15&amp;...</code>).</div>}
      <label className="quote-email-toggle" style={{ marginTop: 12 }}><input type="checkbox" checked={!!value.debug} onChange={(event) => setValue((current) => ({ ...current, debug: event.target.checked }))} /><span><b>Debug: εμφάνιση request/response</b><small>Κάθε φορά που καλείται το endpoint από τη σελίδα προσφοράς, εμφανίζεται αναδυόμενο panel με το ακριβές αίτημα και την απάντηση του ERP</small></span></label>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" className="btn" disabled={previewing} onClick={previewFetch}>{previewing ? 'Έλεγχος…' : 'Δοκιμή template με δείγμα'}</button>
      </div>
      {preview && <pre className="settings-control settings-code" style={{ marginTop: 10, color: preview.ok ? 'inherit' : '#b42318' }}>{preview.text}</pre>}
    </section>

    <section className="customers-settings-card"><div className="customers-settings-card-head"><div><h3>Αποστολή προσφοράς στο ERP</h3><p>Όταν πατάς «Αποστολή στο ERP» σε μια προσφορά, στέλνεται το πλήρες header + όλες οι γραμμές με βάση αυτό το template.</p></div><Icon name="send" size={18} /></div>
      <label className="quote-email-toggle" style={{ marginBottom: 12 }}><input type="checkbox" checked={pushValue.enabled !== false} onChange={(event) => setPushValue((current) => ({ ...current, enabled: event.target.checked }))} /><span><b>Ενεργό</b><small>Απενεργοποίησέ το προσωρινά χωρίς να χάσεις τις ρυθμίσεις</small></span></label>
      <div className="customers-settings-grid">
        <div className="field-group" style={{ gridColumn: '1 / -1' }}><label>URL endpoint <em>Κενό = δεν επιτρέπεται αποστολή</em></label><input className="settings-control" value={pushValue.url} onChange={updatePush('url')} placeholder="https://erp.example.gr/api/quotes" /></div>
        <div className="field-group"><label>HTTP method</label><select className="settings-control" value={pushValue.method} onChange={updatePush('method')}><option>POST</option><option>PUT</option><option>PATCH</option></select></div>
        <div className="field-group"><label>JSON path για το ERP ID απάντησης</label><input className="settings-control" value={pushValue.response_id_path} onChange={updatePush('response_id_path')} placeholder="id" /></div>
        <div className="field-group"><label>Timeout (ms)</label><input className="settings-control" type="number" min="2000" max="120000" step="1000" value={pushValue.timeout_ms} onChange={updatePush('timeout_ms')} /></div>
      </div>
      <div className="customers-settings-grid"><AuthFields auth={pushValue.auth} onChange={(auth) => setPushValue((current) => ({ ...current, auth }))} /></div>
      <div className="customers-settings-grid"><div className="field-group"><label>Headers JSON <em>Επιπλέον headers (πέραν της αυθεντικοποίησης)</em></label><textarea className="settings-control settings-code" rows="10" value={pushValue.headers} onChange={updatePush('headers')} /></div><div className="field-group"><label>Body template JSON <em>Αναλυτικό: header + array γραμμών</em></label><textarea className="settings-control settings-code" rows="20" value={pushValue.body_template} onChange={updatePush('body_template')} /></div></div>
      <div className="muted" style={{ marginTop: 12 }}>Διαθέσιμες μεταβλητές: {PUSH_FIELDS.map((field) => <code key={field} style={{ marginRight: 6 }}>{`{{${field}}}`}</code>)}<br />Το <code>{'{{lines}}'}</code> επεκτείνεται σε ολόκληρο πίνακα JSON με τα πεδία <code>description, quantity, unitPrice, discountPercent, taxPercent, lineTotal</code> ανά γραμμή — γράψε το χωρίς εισαγωγικά, π.χ. <code>"lines": {'{{lines}}'}</code>.</div>
      <label className="quote-email-toggle" style={{ marginTop: 12 }}><input type="checkbox" checked={!!pushValue.debug} onChange={(event) => setPushValue((current) => ({ ...current, debug: event.target.checked }))} /><span><b>Debug: εμφάνιση request/response</b><small>Κάθε φορά που στέλνεται προσφορά στο ERP, εμφανίζεται αναδυόμενο panel με το ακριβές αίτημα και την απάντηση</small></span></label>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" className="btn" disabled={pushPreviewing} onClick={previewPush}>{pushPreviewing ? 'Έλεγχος…' : 'Δοκιμή template με δείγμα'}</button>
      </div>
      {pushPreview && <pre className="settings-control settings-code" style={{ marginTop: 10, color: pushPreview.ok ? 'inherit' : '#b42318' }}>{pushPreview.text}</pre>}
    </section>
    <div className="settings-savebar"><button className="btn btn-primary" disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση ρυθμίσεων'}</button></div>
  </form>;
}
