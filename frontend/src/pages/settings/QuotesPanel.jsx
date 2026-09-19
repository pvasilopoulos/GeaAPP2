import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '../../components/Icon.jsx';
import { api } from '../../api.js';

const DEFAULT = {
  url: '', method: 'POST',
  body_template: '{"customerId":"{{customerId}}","branchId":"{{branchId}}","referenceStartYear":"{{referenceStartYear}}","referenceEndYear":"{{referenceEndYear}}","paymentDueDate":"{{paymentDueDate}}"}',
  headers: '{}', response_path: 'data.lines', response_encoding: 'auto',
};

const PUSH_DEFAULT = { url: '', method: 'POST', headers: '{}', body_template: '{}', response_id_path: 'id' };

const PUSH_FIELDS = [
  'quoteId', 'series', 'quoteNumber', 'quoteDate', 'validUntil', 'status',
  'customerId', 'customerErpId', 'customerName', 'customerCompany',
  'branchId', 'branchErpId', 'branchName', 'sellerId',
  'paymentTerms', 'paymentDueDate', 'referenceStartYear', 'referenceEndYear',
  'subtotal', 'taxTotal', 'total', 'lines',
];

export default function QuotesPanel() {
  const { data, isLoading } = useQuery({ queryKey: ['settings-app'], queryFn: () => api.appSettings() });
  const [value, setValue] = useState(DEFAULT);
  const [pushValue, setPushValue] = useState(PUSH_DEFAULT);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => { if (data?.settings?.quote_api) setValue({ ...DEFAULT, ...data.settings.quote_api }); }, [data]);
  useEffect(() => { if (data?.settings?.quote_push_api) setPushValue({ ...PUSH_DEFAULT, ...data.settings.quote_push_api }); }, [data]);
  if (isLoading) return <div className="card card-pad">Φόρτωση…</div>;
  const update = (key) => (event) => setValue((current) => ({ ...current, [key]: event.target.value }));
  const updatePush = (key) => (event) => setPushValue((current) => ({ ...current, [key]: event.target.value }));
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
  const previewPush = async () => {
    setPreviewing(true); setPreview(null);
    try { const result = await api.previewQuotePush(pushValue.body_template); setPreview({ ok: true, text: JSON.stringify(result.rendered, null, 2) }); }
    catch (error) { setPreview({ ok: false, text: error.message || 'Μη έγκυρο template' }); }
    finally { setPreviewing(false); }
  };
  return <form className="settings-module-panel" onSubmit={save}>
    <div className="customers-settings-hero"><div className="customers-settings-icon"><Icon name="file" size={22} /></div><div><div className="settings-eyebrow">QUOTES MODULE</div><h2>Προσφορές / ERP API</h2><p>Ρύθμισε το endpoint που δημιουργεί τις γραμμές της προσφοράς.</p></div></div>
    {message && <div className="voice-msg ok">{message}</div>}
    <section className="customers-settings-card"><div className="customers-settings-card-head"><div><h3>Endpoint γραμμών προσφοράς</h3><p>Οι μεταβλητές στο body αντικαθίστανται με τα στοιχεία της προσφοράς.</p></div><Icon name="refresh" size={18} /></div>
      <div className="customers-settings-grid"><div className="field-group" style={{ gridColumn: '1 / -1' }}><label>URL endpoint</label><input className="settings-control" value={value.url} onChange={update('url')} placeholder="https://erp.example.gr/api/quotes/lines" /></div><div className="field-group"><label>HTTP method</label><select className="settings-control" value={value.method} onChange={update('method')}><option>POST</option><option>GET</option></select></div><div className="field-group"><label>JSON path γραμμών</label><input className="settings-control" value={value.response_path} onChange={update('response_path')} placeholder="data.lines" /></div><div className="field-group"><label>Encoding response</label><select className="settings-control" value={value.response_encoding} onChange={update('response_encoding')}><option value="auto">Αυτόματο</option><option value="utf8">UTF-8</option><option value="windows-1253">Windows-1253 / Ελληνικά ERP</option></select></div></div>
      <div className="customers-settings-grid"><div className="field-group"><label>Headers JSON</label><textarea className="settings-control settings-code" rows="6" value={value.headers} onChange={update('headers')} /></div><div className="field-group"><label>Body template JSON</label><textarea className="settings-control settings-code" rows="6" value={value.body_template} onChange={update('body_template')} /></div></div>
      <div className="muted" style={{ marginTop: 12 }}>Διαθέσιμες μεταβλητές: <code>{'{{customerId}}'}</code>, <code>{'{{branchId}}'}</code>, <code>{'{{referenceStartYear}}'}</code>, <code>{'{{referenceEndYear}}'}</code>, <code>{'{{paymentDueDate}}'}</code>.</div>
    </section>
    <section className="customers-settings-card"><div className="customers-settings-card-head"><div><h3>Αποστολή προσφοράς στο ERP</h3><p>Όταν πατάς «Αποστολή στο ERP» σε μια προσφορά, στέλνεται το πλήρες header + όλες οι γραμμές με βάση αυτό το template.</p></div><Icon name="send" size={18} /></div>
      <div className="customers-settings-grid"><div className="field-group" style={{ gridColumn: '1 / -1' }}><label>URL endpoint <em>Κενό = δεν επιτρέπεται αποστολή</em></label><input className="settings-control" value={pushValue.url} onChange={updatePush('url')} placeholder="https://erp.example.gr/api/quotes" /></div><div className="field-group"><label>HTTP method</label><select className="settings-control" value={pushValue.method} onChange={updatePush('method')}><option>POST</option><option>PUT</option><option>PATCH</option></select></div><div className="field-group"><label>JSON path για το ERP ID απάντησης</label><input className="settings-control" value={pushValue.response_id_path} onChange={updatePush('response_id_path')} placeholder="id" /></div></div>
      <div className="customers-settings-grid"><div className="field-group"><label>Headers JSON</label><textarea className="settings-control settings-code" rows="10" value={pushValue.headers} onChange={updatePush('headers')} /></div><div className="field-group"><label>Body template JSON <em>Αναλυτικό: header + array γραμμών</em></label><textarea className="settings-control settings-code" rows="20" value={pushValue.body_template} onChange={updatePush('body_template')} /></div></div>
      <div className="muted" style={{ marginTop: 12 }}>Διαθέσιμες μεταβλητές: {PUSH_FIELDS.map((field) => <code key={field} style={{ marginRight: 6 }}>{`{{${field}}}`}</code>)}<br />Το <code>{'{{lines}}'}</code> επεκτείνεται σε ολόκληρο πίνακα JSON με τα πεδία <code>description, quantity, unitPrice, discountPercent, taxPercent, lineTotal</code> ανά γραμμή — γράψε το χωρίς εισαγωγικά, π.χ. <code>"lines": {'{{lines}}'}</code>.</div>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" className="btn" disabled={previewing} onClick={previewPush}>{previewing ? 'Έλεγχος…' : 'Δοκιμή template με δείγμα'}</button>
      </div>
      {preview && <pre className="settings-control settings-code" style={{ marginTop: 10, color: preview.ok ? 'inherit' : '#b42318' }}>{preview.text}</pre>}
    </section>
    <div className="settings-savebar"><button className="btn btn-primary" disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση ρυθμίσεων'}</button></div>
  </form>;
}

