import { useEffect, useState } from 'react';
import { api } from '../../api.js';

const emptyMappings = {
  sources: { customers: 'customers', branches: 'branches', spaces: 'spaces' },
  customers: { erp_id: 'id', code: 'code', first_name: 'first_name', last_name: 'last_name', name: 'name' },
  branches: { erp_id: 'id', customer_erp_id: 'customer_id', name: 'name' },
  spaces: { erp_id: 'id', branch_erp_id: 'branch_id', name: 'name' },
};

const newForm = () => ({
  name: '',
  base_url: '',
  method: 'GET',
  auth_type: 'bearer',
  token: '',
  username: '',
  password: '',
  api_key_name: '',
  api_key_value: '',
  body_template: '',
  headers: '{}',
  schedule_minutes: '',
  enabled: false,
  mappings: JSON.stringify(emptyMappings, null, 2),
});

export default function ConnectorsPanel() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(newForm);
  const [runs, setRuns] = useState([]);
  const [message, setMessage] = useState('');

  const load = () => api.connectors().then((response) => setItems(response.connectors || []));
  useEffect(() => { load(); }, []);

  const edit = async (connector) => {
    setSelected(connector);
    setForm({
      ...newForm(),
      ...connector,
      token: '',
      headers: JSON.stringify(connector.headers || {}, null, 2),
      mappings: JSON.stringify(connector.mappings || emptyMappings, null, 2),
      schedule_minutes: connector.schedule_minutes || '',
    });
    const response = await api.connectorRuns(connector.id);
    setRuns(response.runs || []);
  };

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        ...form,
        headers: JSON.parse(form.headers || '{}'),
        mappings: JSON.parse(form.mappings),
        schedule_minutes: form.schedule_minutes ? Number(form.schedule_minutes) : null,
        credentials: form.token ? { token: form.token } : undefined,
      };
      if (form.auth_type === 'basic' && form.username) {
        payload.credentials = { username: form.username, password: form.password };
      }
      if (form.auth_type === 'api-key' && form.api_key_name) {
        payload.credentials = { key: form.api_key_name, value: form.api_key_value };
      }
      delete payload.token;
      if (selected) await api.updateConnector(selected.id, payload);
      else await api.createConnector(payload);
      setMessage('Η σύνδεση αποθηκεύτηκε.');
      setSelected(null);
      await load();
    } catch (error) {
      setMessage(error.message || 'Δεν ήταν δυνατή η αποθήκευση.');
    }
  };

  const run = async () => {
    try {
      setMessage('Εκτελείται συγχρονισμός…');
      await api.runConnector(selected.id);
      setMessage('Ο συγχρονισμός ολοκληρώθηκε.');
      await edit(selected);
    } catch (error) {
      setMessage(error.message || 'Ο συγχρονισμός απέτυχε.');
    }
  };

  return (
    <div>
      <div className="panel-head">
        <h2>Συνδέσεις ERP</h2>
        <button className="btn primary" type="button" onClick={() => { setSelected(null); setForm(newForm()); setRuns([]); }}>
          Νέα σύνδεση
        </button>
      </div>
      {message && <div className="notice">{message}</div>}
      {items.map((connector) => (
        <div key={connector.id} className="list-row">
          <div>
            <b>{connector.name}</b>
            <div className="muted">
              {connector.method} {connector.base_url} · {connector.enabled ? `κάθε ${connector.schedule_minutes} λεπτά` : 'χειροκίνητη'}
            </div>
          </div>
          <button className="btn" type="button" onClick={() => edit(connector)}>Ρύθμιση</button>
        </div>
      ))}
      {(selected || !items.length) && (
        <form onSubmit={save} className="form-grid" style={{ marginTop: 20 }}>
          <label>Όνομα σύνδεσης<input value={form.name} onChange={(event) => update('name', event.target.value)} required /></label>
          <label>URL ERP<input value={form.base_url} onChange={(event) => update('base_url', event.target.value)} required /></label>
          <label>Μέθοδος
            <select value={form.method} onChange={(event) => update('method', event.target.value)}>
              <option>GET</option><option>POST</option><option>PUT</option>
            </select>
          </label>
          <label>Authentication
            <select value={form.auth_type} onChange={(event) => update('auth_type', event.target.value)}>
              <option value="bearer">Bearer token</option><option value="api-key">API key</option>
              <option value="basic">Basic Auth</option><option value="none">Χωρίς authentication</option>
            </select>
          </label>
          {form.auth_type === 'bearer' && <label>Token<input type="password" value={form.token} onChange={(event) => update('token', event.target.value)} /></label>}
          {form.auth_type === 'basic' && <><label>Username<input value={form.username} onChange={(event) => update('username', event.target.value)} /></label><label>Password<input type="password" value={form.password} onChange={(event) => update('password', event.target.value)} /></label></>}
          {form.auth_type === 'api-key' && <><label>Όνομα header<input value={form.api_key_name} onChange={(event) => update('api_key_name', event.target.value)} placeholder="X-API-Key" /></label><label>API key<input type="password" value={form.api_key_value} onChange={(event) => update('api_key_value', event.target.value)} /></label></>}
          <label>Interval (λεπτά)<input type="number" min="1" value={form.schedule_minutes} onChange={(event) => update('schedule_minutes', event.target.value)} /></label>
          <label><input type="checkbox" checked={!!form.enabled} onChange={(event) => update('enabled', event.target.checked)} /> Ενεργός scheduler</label>
          <label style={{ gridColumn: '1/-1' }}>Headers JSON<textarea rows="3" value={form.headers} onChange={(event) => update('headers', event.target.value)} /></label>
          <label style={{ gridColumn: '1/-1' }}>Body template<textarea rows="5" value={form.body_template || ''} onChange={(event) => update('body_template', event.target.value)} placeholder='{"limit": 100}' /></label>
          <label style={{ gridColumn: '1/-1' }}>Αντιστοίχιση JSON paths<textarea rows="12" value={form.mappings} onChange={(event) => update('mappings', event.target.value)} /></label>
          <div>
            <button className="btn primary" type="submit">Αποθήκευση</button>
            {selected && <button className="btn" type="button" onClick={run} style={{ marginLeft: 8 }}>Χειροκίνητη εκτέλεση</button>}
          </div>
          {selected && <div style={{ gridColumn: '1/-1' }}>
            <h3>Ιστορικό συγχρονισμών</h3>
            {runs.map((runItem) => <div className="muted" key={runItem.id}>{runItem.started_at} · {runItem.status} · {runItem.records_upserted} εγγραφές {runItem.error_message || ''}</div>)}
          </div>}
        </form>
      )}
    </div>
  );
}
