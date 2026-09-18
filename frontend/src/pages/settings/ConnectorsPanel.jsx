import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { api } from '../../api.js';

const entities = [
  { key: 'customers', label: 'Πελάτες', icon: 'users', tone: 'indigo', hint: 'Στοιχεία πελατών και ERP IDs' },
  { key: 'branches', label: 'Υποκαταστήματα', icon: 'building', tone: 'teal', hint: 'Σύνδεση με τον ERP πελάτη' },
  { key: 'spaces', label: 'Χώροι', icon: 'grid', tone: 'amber', hint: 'Σύνδεση με υποκατάστημα και πελάτη' },
];

const defaultMappings = {
  sources: { customers: '', branches: 'branches', spaces: 'spaces' },
  customers: { erp_id: 'customer_id', code: 'code', company: 'company_name', first_name: 'first_name', last_name: 'last_name', address_line: 'address_street', postal_code: 'address_postal', city: 'address_city', tax_id: 'vat_number', email: 'email', phone: 'phone', mobile: 'mobile', status: 'status' },
  branches: { erp_id: 'id', customer_erp_id: 'customer_id', name: 'name' },
  spaces: { erp_id: 'id', branch_erp_id: 'branch_id', name: 'name' },
};

const mappingFields = {
  customers: [
    ['erp_id', 'ERP ID', true], ['code', 'Κωδικός', false], ['first_name', 'Όνομα', false],
    ['last_name', 'Επώνυμο', false], ['company', 'Επωνυμία', false], ['email', 'Email', false],
    ['phone', 'Τηλέφωνο', false], ['mobile', 'Κινητό', false], ['tax_id', 'ΑΦΜ', false],
    ['address_line', 'Διεύθυνση', false], ['postal_code', 'ΤΚ', false], ['city', 'Πόλη', false],
  ],
  branches: [
    ['erp_id', 'ERP ID', true], ['customer_erp_id', 'ERP ID πελάτη', true],
    ['name', 'Όνομα', true], ['code', 'Κωδικός', false], ['city', 'Πόλη', false],
    ['address_line', 'Διεύθυνση', false], ['phone', 'Τηλέφωνο', false],
  ],
  spaces: [
    ['erp_id', 'ERP ID', true], ['branch_erp_id', 'ERP ID υποκαταστήματος', true],
    ['name', 'Όνομα', true], ['code', 'Κωδικός', false], ['space_type', 'Τύπος χώρου', false],
    ['status', 'Κατάσταση', false],
  ],
};

const newForm = () => ({
  name: '', base_url: '', method: 'GET', auth_type: 'bearer', token: '',
  target_entity: 'customers',
  response_encoding: 'auto',
  username: '', password: '', api_key_name: '', api_key_value: '',
  body_template: '', headers: '{}', schedule_minutes: '', enabled: false,
  mappings: JSON.stringify(defaultMappings, null, 2),
});

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function formatDate(value) {
  if (!value) return 'Δεν έχει εκτελεστεί ακόμη';
  return new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function StatusPill({ enabled }) {
  return <span className={`erp-status ${enabled ? 'is-on' : 'is-off'} `}><span />{enabled ? 'Ενεργό' : 'Χειροκίνητο'}</span>;
}

export default function ConnectorsPanel() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(newForm);
  const [runs, setRuns] = useState([]);
  const [monitoringRuns, setMonitoringRuns] = useState([]);
  const [activeEntity, setActiveEntity] = useState('customers');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [customFields, setCustomFields] = useState({ customers: [], branches: [], spaces: [] });

  const load = async () => {
    const response = await api.connectors();
    const connectors = response.connectors || [];
    setItems(connectors);
    const histories = await Promise.all(connectors.map(async (connector) => {
      try {
        const result = await api.connectorRuns(connector.id);
        return (result.runs || []).map((run) => ({ ...run, connectorName: connector.name, connectorId: connector.id }));
      } catch {
        return [];
      }
    }));
    setMonitoringRuns(histories.flat().sort((a, b) => new Date(b.started_at) - new Date(a.started_at)));
  };
  useEffect(() => {
    load();
    Promise.all([
      api.customFields('customer'),
      api.customFields('branch'),
      api.customFields('space'),
    ]).then(([customers, branches, spaces]) => {
      setCustomFields({
        customers: customers.fields || [],
        branches: branches.fields || [],
        spaces: spaces.fields || [],
      });
    }).catch(() => setCustomFields({ customers: [], branches: [], spaces: [] }));
  }, []);

  const selectedMappings = useMemo(() => parseJson(form.mappings, defaultMappings), [form.mappings]);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const updateMapping = (entity, field, path) => {
    const next = { ...selectedMappings, [entity]: { ...(selectedMappings[entity] || {}), [field]: path } };
    update('mappings', JSON.stringify(next, null, 2));
  };
  const updateCustomMapping = (entity, key, path) => {
    const next = {
      ...selectedMappings,
      [entity]: {
        ...(selectedMappings[entity] || {}),
        custom_fields: {
          ...(selectedMappings[entity]?.custom_fields || {}),
          [key]: path,
        },
      },
    };
    update('mappings', JSON.stringify(next, null, 2));
  };

  const openEditor = async (connector = null) => {
    setSelected(connector);
    setIsCreating(!connector);
    setMessage(null);
    setShowAdvanced(false);
    setActiveEntity(connector?.target_entity || 'customers');
    if (!connector) {
      setForm(newForm());
      setRuns([]);
      return;
    }
    setForm({
      ...newForm(), ...connector, token: '',
      headers: JSON.stringify(connector.headers || {}, null, 2),
      mappings: JSON.stringify(connector.mappings || defaultMappings, null, 2),
      schedule_minutes: connector.schedule_minutes || '',
    });
    const response = await api.connectorRuns(connector.id);
    setRuns(response.runs || []);
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        ...form,
        headers: JSON.parse(form.headers || '{}'),
        mappings: JSON.parse(form.mappings),
        schedule_minutes: form.schedule_minutes ? Number(form.schedule_minutes) : null,
        credentials: form.auth_type === 'basic' && form.username
          ? { username: form.username, password: form.password }
          : form.auth_type === 'api-key' && form.api_key_name
            ? { key: form.api_key_name, value: form.api_key_value }
            : form.token ? { token: form.token } : undefined,
      };
      delete payload.token;
      if (selected) await api.updateConnector(selected.id, payload);
      else await api.createConnector(payload);
      setMessage({ type: 'success', text: 'Η σύνδεση αποθηκεύτηκε επιτυχώς.' });
      setSelected(null);
      setIsCreating(false);
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Δεν ήταν δυνατή η αποθήκευση.' });
    } finally { setBusy(false); }
  };

  const run = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.runConnector(selected.id);
      setMessage({ type: 'success', text: 'Ο συγχρονισμός ολοκληρώθηκε.' });
      await openEditor(selected);
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Ο συγχρονισμός απέτυχε.' });
    } finally { setBusy(false); }
  };

  const deleteConnector = async () => {
    if (!selected || !window.confirm('Να διαγραφεί αυτή η σύνδεση και το ιστορικό της;')) return;
    await api.deleteConnector(selected.id);
    setMessage({ type: 'success', text: 'Η σύνδεση διαγράφηκε.' });
    setSelected(null);
    setIsCreating(false);
    await load();
  };

  const retryRun = async (run) => {
    setBusy(true);
    try {
      await api.retryConnectorRun(run.connectorId, run.id);
      setMessage({ type: 'success', text: 'Η επανάληψη ξεκίνησε.' });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Δεν ήταν δυνατή η επανάληψη.' });
    } finally { setBusy(false); }
  };

  const failedRuns = monitoringRuns.filter((run) => run.status === 'failed');
  const runningRuns = monitoringRuns.filter((run) => run.status === 'running');
  const connectorHealth = (connector) => {
    const latest = monitoringRuns.find((run) => run.connectorId === connector.id);
    if (!latest) return { label: 'Χωρίς ιστορικό', tone: 'unknown' };
    if (latest.status === 'running') return { label: 'Σε εξέλιξη', tone: 'running' };
    if (latest.status === 'failed') return { label: 'Απαιτεί προσοχή', tone: 'failed' };
    return { label: 'Υγιές', tone: 'success' };
  };

  if (selected || isCreating || !items.length) {
    return (
      <div className="erp-shell">
        <div className="erp-editor-head">
          <button className="btn btn-ghost" type="button" onClick={() => { setSelected(null); setIsCreating(false); }}><Icon name="arrowLeft" size={16} /> Πίσω στις συνδέσεις</button>
          <div className="erp-editor-actions">
            {selected && <button className="btn btn-ghost danger-action" type="button" onClick={deleteConnector}>Διαγραφή</button>}
            {selected && <button className="btn btn-accent" type="button" onClick={run} disabled={busy}><Icon name="refresh" size={16} /> {busy ? 'Εκτέλεση…' : 'Συγχρονισμός τώρα'}</button>}
          </div>
        </div>
        <div className="erp-editor-title">
          <div className="erp-icon erp-icon-indigo"><Icon name="refresh" size={22} /></div>
          <div><h2>{selected ? 'Επεξεργασία σύνδεσης' : 'Νέα σύνδεση ERP'}</h2><p>Ρύθμισε μία φορά τη σύνδεση και άφησε το σύστημα να συγχρονίζει αυτόματα.</p></div>
        </div>
        {message && <div className={`erp-alert ${message.type}`}><Icon name={message.type === 'success' ? 'check' : 'x'} size={16} />{message.text}</div>}
        <form onSubmit={save} className="erp-editor-grid">
          <div className="erp-editor-main">
            <section className="erp-card">
              <div className="erp-card-title"><span className="erp-step">1</span><div><h3>Βασικές πληροφορίες</h3><p>Πώς θα εμφανίζεται αυτή η σύνδεση στην ομάδα σου.</p></div></div>
              <div className="erp-form-grid">
                <label className="erp-field wide"><span>Όνομα σύνδεσης</span><input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="π.χ. Entersoft παραγωγής" required /></label>
                <label className="erp-field wide"><span>Endpoint URL</span><div className="erp-input-prefix"><Icon name="globe" size={15} /><input type="url" value={form.base_url} onChange={(e) => update('base_url', e.target.value)} placeholder="https://erp.example.com/api/customers" required /></div></label>
                <label className="erp-field wide"><span>Οντότητα συγχρονισμού</span><select value={form.target_entity} onChange={(e) => { update('target_entity', e.target.value); setActiveEntity(e.target.value); }}><option value="customers">Πελάτες</option><option value="branches">Υποκαταστήματα</option><option value="spaces">Χώροι</option></select></label>
                <label className="erp-field wide"><span>Encoding response <em>Για ελληνικά ERP APIs συνήθως Windows-1253</em></span><select value={form.response_encoding} onChange={(e) => update('response_encoding', e.target.value)}><option value="auto">Αυτόματο (header → UTF-8 → Windows-1253)</option><option value="utf-8">UTF-8</option><option value="windows-1253">Windows-1253 (Ελληνικά)</option><option value="windows-1258">Windows-1258</option></select></label>
                <label className="erp-field"><span>Μέθοδος</span><select value={form.method} onChange={(e) => update('method', e.target.value)}><option>GET</option><option>POST</option><option>PUT</option></select></label>
                <label className="erp-field"><span>Authentication</span><select value={form.auth_type} onChange={(e) => update('auth_type', e.target.value)}><option value="bearer">Bearer token</option><option value="api-key">API key</option><option value="basic">Basic Auth</option><option value="none">Χωρίς authentication</option></select></label>
                {form.auth_type === 'bearer' && <label className="erp-field wide"><span>Bearer token <em>Αποθηκεύεται κρυπτογραφημένο</em></span><input type="password" value={form.token} onChange={(e) => update('token', e.target.value)} placeholder={selected?.hasCredentials ? 'Υπάρχει αποθηκευμένο token — άφησέ το κενό' : 'Επικόλλησε το token'} /></label>}
                {form.auth_type === 'basic' && <><label className="erp-field"><span>Username</span><input value={form.username} onChange={(e) => update('username', e.target.value)} /></label><label className="erp-field"><span>Password</span><input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} /></label></>}
                {form.auth_type === 'api-key' && <><label className="erp-field"><span>Header name</span><input value={form.api_key_name} onChange={(e) => update('api_key_name', e.target.value)} placeholder="X-API-Key" /></label><label className="erp-field"><span>API key</span><input type="password" value={form.api_key_value} onChange={(e) => update('api_key_value', e.target.value)} /></label></>}
              </div>
            </section>
            <section className="erp-card">
              <div className="erp-card-title"><span className="erp-step">2</span><div><h3>Τι θα συγχρονίσουμε;</h3><p>Όρισε τα πεδία που θα διαβάζει το ERP response. Για λίστα χρησιμοποίησε π.χ. <code>data.items</code> ή <code>customers</code>.</p></div></div>
              <div className="erp-entity-tabs">{entities.map((entity) => <button type="button" key={entity.key} className={`erp-entity-tab ${activeEntity === entity.key ? 'active' : ''} ${form.target_entity !== entity.key ? 'is-disabled' : ''}`} onClick={() => form.target_entity === entity.key && setActiveEntity(entity.key)}><span className={`erp-icon erp-icon-${entity.tone}`}><Icon name={entity.icon} size={16} /></span><span><b>{entity.label}</b><small>{form.target_entity === entity.key ? entity.hint : 'Άλλαξε την οντότητα παραπάνω'}</small></span><Icon name="chevronRight" size={15} /></button>)}</div>
              <div className="erp-mapping-head"><div><b>{entities.find((item) => item.key === activeEntity)?.label}</b><span>Αντιστοίχισε κάθε πεδίο σε JSON path</span></div><div className="erp-mapping-head-actions"><button className="erp-link-button" type="button" onClick={() => updateMapping(activeEntity, 'erp_id', activeEntity === 'customers' ? 'customer_id' : activeEntity === 'branches' ? 'branch_id' : 'space_id')}>Χρήση ERP ID</button><span className="erp-mapping-count">{Object.keys(selectedMappings[activeEntity] || {}).length} πεδία</span></div></div>
              <div className="erp-mapping-list">{mappingFields[activeEntity].map(([field, label, required]) => <div className="erp-mapping-row" key={field}><div><b>{label}</b><code>{field}</code></div><span className="erp-arrow">→</span><input value={selectedMappings[activeEntity]?.[field] || ''} onChange={(e) => updateMapping(activeEntity, field, e.target.value)} placeholder={required ? 'required JSON path' : 'προαιρετικό'} /><span className={selectedMappings[activeEntity]?.[field] ? 'erp-map-ok' : required ? 'erp-map-missing' : 'erp-map-optional'}>{selectedMappings[activeEntity]?.[field] ? 'Mapped' : required ? 'Required' : 'Optional'}</span></div>)}</div>
              <div className="erp-custom-mapping">
                <div className="erp-mapping-head">
                  <div><b>Custom πεδία βάσης</b><span>Τα ενεργά custom fields της οντότητας εμφανίζονται αυτόματα.</span></div>
                  <span className="erp-mapping-count">{customFields[activeEntity].length} πεδία</span>
                </div>
                {customFields[activeEntity].length === 0
                  ? <p className="erp-mapping-empty">Δεν υπάρχουν custom fields για αυτή την οντότητα. Δημιούργησέ τα από τις Ρυθμίσεις → Custom Fields.</p>
                  : <div className="erp-mapping-list">{customFields[activeEntity].map((field) => {
                    const path = selectedMappings[activeEntity]?.custom_fields?.[field.key] || '';
                    return <div className="erp-mapping-row" key={field.id}>
                      <div><b>{field.name}</b><code>custom_fields.{field.key}</code></div>
                      <span className="erp-arrow">→</span>
                      <input value={path} onChange={(e) => updateCustomMapping(activeEntity, field.key, e.target.value)} placeholder="JSON path, π.χ. customer_code" />
                      <span className={path ? 'erp-map-ok' : 'erp-map-optional'}>{path ? 'Mapped' : 'Optional'}</span>
                    </div>;
                  })}</div>}
              </div>
              <button className="erp-advanced-toggle" type="button" onClick={() => setShowAdvanced(!showAdvanced)}><Icon name={showAdvanced ? 'chevronUp' : 'chevronDown'} size={15} /> {showAdvanced ? 'Απόκρυψη advanced mapping' : 'Άνοιγμα advanced mapping JSON'}</button>
              {showAdvanced && <textarea className="erp-codearea" rows="10" value={form.mappings} onChange={(e) => update('mappings', e.target.value)} />}
            </section>
            <section className="erp-card">
              <div className="erp-card-title"><span className="erp-step">3</span><div><h3>Request details</h3><p>Προαιρετικές παράμετροι για POST/PUT requests.</p></div></div>
              <label className="erp-field wide"><span>Headers JSON</span><textarea rows="3" value={form.headers} onChange={(e) => update('headers', e.target.value)} placeholder='{"Accept":"application/json"}' /></label>
              <label className="erp-field wide"><span>Body template</span><textarea rows="4" value={form.body_template || ''} onChange={(e) => update('body_template', e.target.value)} placeholder='{"page": 1, "limit": 100}' /></label>
            </section>
          </div>
          <aside className="erp-editor-side">
            <section className="erp-card erp-side-card"><div className="erp-side-label">Πρόγραμμα συγχρονισμού</div><div className="erp-schedule-preview"><Icon name="clock" size={20} /><div><strong>{form.schedule_minutes ? `Κάθε ${form.schedule_minutes} λεπτά` : 'Χειροκίνητη εκτέλεση'}</strong><small>Ο worker εκτελείται στο παρασκήνιο</small></div></div><label className="erp-field"><span>Interval σε λεπτά</span><input type="number" min="1" value={form.schedule_minutes} onChange={(e) => update('schedule_minutes', e.target.value)} placeholder="π.χ. 15" /></label><label className="erp-toggle"><input type="checkbox" checked={!!form.enabled} onChange={(e) => update('enabled', e.target.checked)} /><span className="erp-switch" /><span>Ενεργοποίηση scheduler</span></label></section>
            <section className="erp-card erp-side-card"><div className="erp-side-label">Πρόσφατη δραστηριότητα</div>{runs.length ? runs.slice(0, 5).map((item) => <div className="erp-mini-run" key={item.id}><span className={`erp-run-dot ${item.status}`} /><div><b>{item.status === 'success' ? 'Επιτυχής συγχρονισμός' : item.status === 'running' ? 'Σε εξέλιξη' : 'Αποτυχημένος συγχρονισμός'}</b><small>{formatDate(item.started_at)} · {item.records_upserted || 0} records</small></div></div>) : <div className="erp-empty-mini"><Icon name="activity" size={20} /><span>Δεν υπάρχει ιστορικό ακόμη</span></div>}</section>
            <button className="btn btn-accent erp-save-btn" type="submit" disabled={busy}>{busy ? 'Αποθήκευση…' : selected ? 'Αποθήκευση αλλαγών' : 'Δημιουργία σύνδεσης'}</button>
          </aside>
        </form>
      </div>
    );
  }

  return (
    <div className="erp-shell">
      <div className="erp-hero"><div><div className="erp-eyebrow"><span className="erp-live-dot" /> INTEGRATIONS</div><h2>ERP Sync</h2><p>Σύνδεσε το ERP σου και κράτησε πελάτες, υποκαταστήματα και χώρους πάντα ενημερωμένους.</p></div><button className="btn btn-accent" type="button" onClick={() => openEditor()}><Icon name="plus" size={16} /> Νέα σύνδεση</button></div>
      {message && <div className={`erp-alert ${message.type}`}><Icon name={message.type === 'success' ? 'check' : 'x'} size={16} />{message.text}</div>}
      <div className="erp-stats"><div><span className="erp-stat-icon indigo"><Icon name="layers" size={18} /></span><div><small>Συνδέσεις</small><strong>{items.length}</strong></div></div><div><span className="erp-stat-icon green"><Icon name="activity" size={18} /></span><div><small>Υγιείς συνδέσεις</small><strong>{items.filter((item) => connectorHealth(item).tone === 'success').length}</strong></div></div><div><span className="erp-stat-icon amber"><Icon name="clock" size={18} /></span><div><small>Αποτυχημένα runs</small><strong>{failedRuns.length}</strong></div></div></div>
      <div className="erp-monitor-grid">
        <section className="erp-card erp-monitor-card">
          <div className="erp-section-heading"><div><h3>Υγεία συνδέσεων</h3><span>Τελευταίο γνωστό αποτέλεσμα ανά connector</span></div><span className="erp-list-count">{runningRuns.length} σε εξέλιξη</span></div>
          <div className="erp-health-list">{items.map((connector) => {
            const health = connectorHealth(connector);
            return <div className="erp-health-row" key={connector.id}>
              <span className={`erp-health-dot ${health.tone}`} />
              <div><b>{connector.name}</b><small>{connector.enabled ? `Scheduler κάθε ${connector.schedule_minutes || '—'} λεπτά` : 'Χειροκίνητη εκτέλεση'}</small></div>
              <strong className={`erp-health-label ${health.tone}`}>{health.label}</strong>
            </div>;
          })}</div>
        </section>
        <section className="erp-card erp-monitor-card">
          <div className="erp-section-heading"><div><h3>Τελευταίες μετρήσεις</h3><span>Στοιχεία από τα καταγεγραμμένα sync runs</span></div></div>
          <div className="erp-monitor-metrics"><div><b>{monitoringRuns.reduce((sum, run) => sum + Number(run.records_seen || 0), 0)}</b><small>records seen</small></div><div><b>{monitoringRuns.reduce((sum, run) => sum + Number(run.records_upserted || 0), 0)}</b><small>upserted</small></div><div><b>{monitoringRuns.reduce((sum, run) => sum + Number(run.error_count || 0), 0)}</b><small>errors</small></div></div>
        </section>
      </div>
      <section className="erp-card erp-failed-runs">
        <div className="erp-section-heading"><div><h3>Αποτυχημένα runs</h3><span>Εμφανίζονται μόνο runs του τρέχοντος tenant</span></div><span className="erp-list-count">{failedRuns.length}</span></div>
        {failedRuns.length ? <div className="erp-run-table">{failedRuns.slice(0, 8).map((run) => <div className="erp-run-row" key={run.id}><span className="erp-run-dot failed" /><div><b>{run.connectorName}</b><small>{formatDate(run.started_at)} · {run.records_seen || 0} records · {run.error_count || 0} errors</small><span className="erp-run-error">{run.error_message || 'Άγνωστο σφάλμα'}</span></div><button className="btn btn-ghost" type="button" onClick={() => retryRun(run)} disabled={busy}>Επανάληψη</button></div>)}</div> : <div className="erp-empty-mini"><Icon name="check" size={20} /> <span>Δεν υπάρχουν αποτυχημένα runs.</span></div>}
      </section>
      <div className="erp-section-heading"><div><h3>Οι συνδέσεις σου</h3><span>Διαχείριση endpoints και προγραμματισμών</span></div><span className="erp-list-count">{items.length} {items.length === 1 ? 'σύνδεση' : 'συνδέσεις'}</span></div>
      <div className="erp-connector-list">{items.map((connector) => <button className="erp-connector-card" type="button" key={connector.id} onClick={() => openEditor(connector)}><span className="erp-connector-logo"><Icon name="refresh" size={21} /></span><span className="erp-connector-info"><strong>{connector.name}</strong><small>{connector.base_url}</small><span><StatusPill enabled={connector.enabled} />{connector.enabled && <em>Κάθε {connector.schedule_minutes} λεπτά</em>}</span></span><span className="erp-connector-last"><small>Τελευταίο run</small><b>{formatDate(connector.last_run_at)}</b></span><Icon name="chevronRight" size={18} /></button>)}</div>
      <div className="erp-empty-tip"><span className="erp-tip-icon"><Icon name="activity" size={19} /></span><div><b>Πώς λειτουργεί το ERP Sync;</b><span>Ρύθμισε το endpoint, αντιστοίχισε τα JSON fields και ενεργοποίησε τον scheduler. Το σύστημα κάνει ασφαλές matching με ERP IDs.</span></div></div>
    </div>
  );
}
