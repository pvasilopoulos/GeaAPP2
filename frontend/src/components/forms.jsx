import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { Drawer } from './ui.jsx';
import { ImageUpload, HoursEditor, AmenitiesPicker } from './formBits.jsx';
import VoiceFill from './VoiceFill.jsx';
import { defaultOpeningHours, BRANCH_STATUS_LABELS, SPACE_STATUS_LABELS } from '../lib/format.js';

const SPACE_TYPES = ['Αίθουσα συνεδριάσεων', 'Ιδιωτικό γραφείο', 'Co-working', 'Lounge', 'Αίθουσα εκδηλώσεων', 'Studio', 'Αίθουσα εκπαίδευσης'];

// Derives a form value from a stored custom-field row (or a blank default).
function cfInitialValue(fld) {
  switch (fld.field_type) {
    case 'boolean': return fld.boolean_value == null ? false : !!fld.boolean_value;
    case 'number': case 'decimal': case 'currency': case 'percent': return fld.number_value ?? '';
    case 'date': case 'datetime': return fld.date_value ? String(fld.date_value).slice(0, 10) : '';
    case 'multiselect': case 'checkbox': return Array.isArray(fld.json_value) ? fld.json_value : [];
    default: return fld.text_value ?? '';
  }
}
// Conditional visibility against the customer base fields (e.g. customer_type).
function cfVisible(fld, base) {
  const cond = fld.settings?.showIf;
  if (!cond || !cond.field) return true;
  return String(base[cond.field] ?? '') === String(cond.equals);
}

function CustomFieldInput({ fld, value, onChange }) {
  const opts = fld.settings?.options || [];
  const label = <label>{fld.name}{fld.required ? ' *' : ''}</label>;
  if (fld.field_type === 'boolean') {
    return <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {fld.name}
    </label>;
  }
  if (fld.field_type === 'select') {
    return <div className="field-group">{label}
      <select style={cfInp} value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select></div>;
  }
  if (fld.field_type === 'multiselect') {
    const arr = Array.isArray(value) ? value : [];
    const toggle = (o) => onChange(arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o]);
    return <div className="field-group">{label}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {opts.map((o) => <label key={o} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={arr.includes(o)} onChange={() => toggle(o)} /> {o}</label>)}
      </div></div>;
  }
  if (fld.field_type === 'long_text') {
    return <div className="field-group">{label}<textarea rows={2} style={{ ...cfInp, height: 'auto', padding: '8px 10px', fontFamily: 'inherit' }} value={value || ''} onChange={(e) => onChange(e.target.value)} /></div>;
  }
  const type = (fld.field_type === 'number' || fld.field_type === 'decimal' || fld.field_type === 'currency' || fld.field_type === 'percent') ? 'number' : (fld.field_type === 'date' ? 'date' : 'text');
  return <div className="field-group">{label}<input type={type} style={cfInp} value={value ?? ''} onChange={(e) => onChange(e.target.value)} /></div>;
}
const cfInp = { width: '100%', height: 40, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 9 };

function CustomFieldsSection({ fields, values, onChange, base }) {
  const visible = (fields || []).filter((fld) => cfVisible(fld, base || {}));
  if (!visible.length) return null;
  return (
    <div style={{ borderTop: '1px solid var(--border)', margin: '2px 0 12px', paddingTop: 10 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-3)', marginBottom: 8 }}>Πρόσθετα πεδία</div>
      {visible.map((fld) => (
        <CustomFieldInput key={fld.id} fld={fld} value={values[fld.id]}
          onChange={(v) => onChange((s) => ({ ...s, [fld.id]: v }))} />
      ))}
    </div>
  );
}

function DuplicateBox({ matches, onOpen }) {
  if (!matches?.length) return null;
  return (
    <div className="dup-box">
      <b>Πιθανή διπλοεγγραφή</b>
      <div className="muted" style={{ margin: '4px 0 8px' }}>Βρέθηκαν πελάτες με ίδια στοιχεία. Ανοίξτε την υπάρχουσα καρτέλα ή συνεχίστε.</div>
      {matches.map((m) => (
        <div key={m.id} className="dup-row">
          <div>
            <div style={{ fontWeight: 600 }}>{m.full_name}</div>
            <div className="muted" style={{ fontSize: 12 }}>{m.code} · {(m.reasons || []).join(', ')} · {m.email || m.phone || m.tax_id}</div>
          </div>
          {onOpen && <button type="button" className="btn btn-sm" onClick={() => onOpen(m)}>Άνοιγμα</button>}
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }) {
  return <div className="field-group"><label>{label}</label>{children}</div>;
}
function Text(props) { return <input {...props} />; }
function Row({ children }) { return <div style={{ display: 'flex', gap: 10 }}>{children}</div>; }

// ---- Customer -------------------------------------------------------------
export function CustomerFormDrawer({ initial, onClose, onSaved, onOpenExisting }) {
  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: ({ signal }) => api.meta({ signal }) });
  const [f, setF] = useState(() => ({
    first_name: initial?.first_name || '', last_name: initial?.last_name || '',
    customer_type: initial?.customer_type || 'individual', company: initial?.company || '',
    tax_id: initial?.tax_id || '', email: initial?.email || '', phone: initial?.phone || '',
    mobile: initial?.mobile || '', status: initial?.status || 'active', is_vip: !!initial?.is_vip,
    date_of_birth: initial?.date_of_birth ? String(initial.date_of_birth).slice(0, 10) : '',
    address_line: initial?.address_line || '', city: initial?.city || '', postal_code: initial?.postal_code || '',
    country: initial?.country || 'Ελλάδα', avatar_url: initial?.avatar_url || '',
    assigned_employee_id: initial?.assigned_employee_id || '', profile_note: initial?.profile_note || '',
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [dups, setDups] = useState([]);
  const [force, setForce] = useState(false);
  const tset = meta?.tenant?.settings || {};
  const appliedDefaults = useRef(false);
  useEffect(() => {
    if (initial || appliedDefaults.current || !meta?.tenant?.settings) return;
    appliedDefaults.current = true;
    const s = meta.tenant.settings;
    setF((prev) => ({
      ...prev,
      country: s.default_country || prev.country,
      status: s.default_customer_status || prev.status,
    }));
  }, [meta, initial]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const cfQ = useQuery({
    queryKey: initial ? ['cf-form', initial.id] : ['cf-defs', 'customer'],
    queryFn: ({ signal }) => (initial ? api.customerCustomFields(initial.id, { signal }) : api.metaCustomFields('customer', { signal })),
  });
  const [cfFields, setCfFields] = useState([]);
  const [cfValues, setCfValues] = useState({});
  useEffect(() => {
    if (!cfQ.data) return;
    const list = (cfQ.data.fields || []).filter((x) => (initial ? true : x.active));
    setCfFields(list);
    const init = {};
    for (const fld of list) init[fld.id] = cfInitialValue(fld);
    setCfValues(init);
  }, [cfQ.data, initial]);
  const visibleCf = cfFields.filter((fld) => cfVisible(fld, f));

  const applyVoice = (patches) => {
    setF((s) => ({ ...s, ...patches }));
    if (patches.email != null || patches.phone != null || patches.mobile != null || patches.tax_id != null) {
      setForce(false);
    }
  };

  const checkDups = async () => {
    try {
      const res = await api.checkDuplicates({
        email: f.email, phone: f.phone, mobile: f.mobile, tax_id: f.tax_id, excludeId: initial?.id,
      });
      setDups(res.matches || []);
      return res.matches || [];
    } catch { return []; }
  };

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setSaving(true);
    try {
      if (!force) {
        const matches = await checkDups();
        if (matches.length) {
          if (tset.strict_duplicates) { setErr('Υπάρχει ήδη πελάτης με ίδια στοιχεία.'); setSaving(false); return; }
          setForce(true); setSaving(false); return;
        }
      }
      const res = initial ? (await api.updateCustomer(initial.id, f), { id: initial.id }) : await api.createCustomer(f);
      if (visibleCf.length) {
        const values = {};
        for (const fld of visibleCf) values[fld.id] = cfValues[fld.id];
        await api.saveCustomerCustomFields(res.id, values);
      }
      onSaved({ id: res.id, full_name: `${f.first_name} ${f.last_name}` });
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };
  return (
    <Drawer title={initial ? 'Επεξεργασία πελάτη' : 'Νέος πελάτης'} subtitle={initial ? `#${initial.code}` : 'Δημιουργία εγγραφής πελάτη'} onClose={onClose}>
      {err && <div className="auth-error">{err}</div>}
      <form onSubmit={submit}>
        <VoiceFill onApply={applyVoice} defaultLang={tset.voice_lang} />
        <ImageUpload value={f.avatar_url} onChange={(url) => setF((s) => ({ ...s, avatar_url: url }))} label="Φωτογραφία" />
        <Row>
          <Field label="Όνομα"><Text value={f.first_name} onChange={set('first_name')} required /></Field>
          <Field label="Επώνυμο"><Text value={f.last_name} onChange={set('last_name')} required /></Field>
        </Row>
        <Row>
          <Field label="Τύπος"><select value={f.customer_type} onChange={set('customer_type')} style={sel}><option value="individual">Ιδιώτης</option><option value="company">Εταιρεία</option></select></Field>
          <Field label="Κατάσταση"><select value={f.status} onChange={set('status')} style={sel}><option value="active">Ενεργός</option><option value="inactive">Ανενεργός</option><option value="prospect">Υποψήφιος</option></select></Field>
        </Row>
        {f.customer_type === 'company' && (
          <Row>
            <Field label="Επωνυμία"><Text value={f.company} onChange={set('company')} /></Field>
            <Field label="ΑΦΜ"><Text value={f.tax_id} onChange={(e) => { set('tax_id')(e); setForce(false); }} /></Field>
          </Row>
        )}
        <Row>
          <Field label="Email"><Text type="email" value={f.email} onChange={(e) => { set('email')(e); setForce(false); }} onBlur={checkDups} required={!!tset.require_email} /></Field>
          <Field label="Τηλέφωνο"><Text value={f.phone} onChange={(e) => { set('phone')(e); setForce(false); }} onBlur={checkDups} /></Field>
        </Row>
        <Row>
          <Field label="Κινητό"><Text value={f.mobile} onChange={(e) => { set('mobile')(e); setForce(false); }} /></Field>
          <Field label="Ημ. γέννησης"><Text type="date" value={f.date_of_birth} onChange={set('date_of_birth')} /></Field>
        </Row>
        <Field label="Διεύθυνση"><Text value={f.address_line} onChange={set('address_line')} /></Field>
        <Row>
          <Field label="Πόλη"><Text value={f.city} onChange={set('city')} /></Field>
          <Field label="Τ.Κ."><Text value={f.postal_code} onChange={set('postal_code')} /></Field>
        </Row>
        <Field label="Χώρα"><Text value={f.country} onChange={set('country')} /></Field>
        <Field label="Υπεύθυνος">
          <select value={f.assigned_employee_id} onChange={set('assigned_employee_id')} style={sel}>
            <option value="">—</option>
            {(meta?.employees || []).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </Field>
        <Field label="Σημείωση"><textarea value={f.profile_note} onChange={set('profile_note')} rows={2} style={ta} /></Field>
        {tset.allow_vip !== false && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 14px' }}>
          <input type="checkbox" checked={f.is_vip} onChange={set('is_vip')} /> VIP πελάτης
        </label>
        )}
        <DuplicateBox matches={dups} onOpen={onOpenExisting ? (m) => { onClose(); onOpenExisting(m); } : undefined} />
        <CustomFieldsSection fields={visibleCf} values={cfValues} onChange={setCfValues} base={f} />
        <button className="btn btn-accent btn-block" disabled={saving}>
          {saving ? <span className="spinner" /> : <Icon name="check" size={16} />}
          {initial ? 'Αποθήκευση' : (force && dups.length ? 'Δημιουργία ούτως ή άλλως' : 'Δημιουργία')}
        </button>
      </form>
    </Drawer>
  );
}

// ---- Branch ---------------------------------------------------------------
export function BranchFormDrawer({ customerId, initial, onClose, onSaved }) {
  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: ({ signal }) => api.meta({ signal }) });
  const [f, setF] = useState(() => ({
    name: initial?.name || '', city: initial?.city || '', area: initial?.area || '',
    address_line: initial?.address_line || '', postal_code: initial?.postal_code || '',
    phone: initial?.phone || '', email: initial?.email || '', is_primary: !!initial?.is_primary,
    status: initial?.status || 'active', manager_employee_id: initial?.manager_employee_id || '',
    opening_hours: initial?.opening_hours || defaultOpeningHours(),
    image_url: initial?.image_url || '', lat: initial?.lat ?? '', lng: initial?.lng ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const cfQ = useQuery({
    queryKey: initial ? ['cf-branch', initial.id] : ['cf-defs', 'branch'],
    queryFn: ({ signal }) => (initial ? api.branchCustomFields(initial.id, { signal }) : api.metaCustomFields('branch', { signal })),
  });
  const [cfFields, setCfFields] = useState([]);
  const [cfValues, setCfValues] = useState({});
  useEffect(() => {
    if (!cfQ.data) return;
    const list = cfQ.data.fields || [];
    setCfFields(list);
    const init = {};
    for (const fld of list) init[fld.id] = cfInitialValue(fld);
    setCfValues(init);
  }, [cfQ.data]);

  const geocode = async () => {
    const q = [f.address_line, f.city, f.postal_code, 'Ελλάδα'].filter(Boolean).join(', ');
    setGeoBusy(true); setErr('');
    try {
      const r = await api.geoLookup(q);
      if (r.lat == null) setErr('Δεν βρέθηκαν συντεταγμένες για αυτή τη διεύθυνση');
      else setF((s) => ({ ...s, lat: r.lat, lng: r.lng }));
    } catch (ex) { setErr(ex.message); } finally { setGeoBusy(false); }
  };

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setSaving(true);
    try {
      const payload = { ...f, manager_employee_id: f.manager_employee_id || null };
      const res = initial ? (await api.updateBranch(initial.id, payload), { id: initial.id })
        : await api.createBranch({ ...payload, customerId });
      if (cfFields.length) {
        const values = {};
        for (const fld of cfFields) values[fld.id] = cfValues[fld.id];
        await api.saveBranchCustomFields(res.id, values);
      }
      onSaved();
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };
  return (
    <Drawer title={initial ? 'Επεξεργασία υποκαταστήματος' : 'Νέο υποκατάστημα'} onClose={onClose}>
      {err && <div className="auth-error">{err}</div>}
      <form onSubmit={submit}>
        <ImageUpload value={f.image_url} onChange={(url) => setF((s) => ({ ...s, image_url: url }))} label="Φωτογραφία" />
        <Field label="Όνομα"><Text value={f.name} onChange={set('name')} required /></Field>
        <Row>
          <Field label="Κατάσταση">
            <select value={f.status} onChange={set('status')} style={sel}>
              {Object.entries(BRANCH_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Υπεύθυνος">
            <select value={f.manager_employee_id} onChange={set('manager_employee_id')} style={sel}>
              <option value="">—</option>
              {(meta?.employees || []).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Πόλη"><Text value={f.city} onChange={set('city')} /></Field>
          <Field label="Περιοχή"><Text value={f.area} onChange={set('area')} /></Field>
        </Row>
        <Field label="Διεύθυνση"><Text value={f.address_line} onChange={set('address_line')} /></Field>
        <Row>
          <Field label="Τ.Κ."><Text value={f.postal_code} onChange={set('postal_code')} /></Field>
          <Field label="Τηλέφωνο"><Text value={f.phone} onChange={set('phone')} /></Field>
        </Row>
        <Field label="Email"><Text type="email" value={f.email} onChange={set('email')} /></Field>
        <Row>
          <Field label="Γεωγρ. πλάτος"><Text type="number" step="any" value={f.lat} onChange={set('lat')} /></Field>
          <Field label="Γεωγρ. μήκος"><Text type="number" step="any" value={f.lng} onChange={set('lng')} /></Field>
        </Row>
        <button type="button" className="btn btn-sm" style={{ marginBottom: 12 }} onClick={geocode} disabled={geoBusy}>
          {geoBusy ? <span className="spinner" /> : <Icon name="pin" size={14} />} Γεωκωδικοποίηση από διεύθυνση
        </button>
        <HoursEditor value={f.opening_hours} onChange={(opening_hours) => setF((s) => ({ ...s, opening_hours }))} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 14px' }}>
          <input type="checkbox" checked={f.is_primary} onChange={set('is_primary')} /> Κύριο υποκατάστημα
        </label>
        <CustomFieldsSection fields={cfFields} values={cfValues} onChange={setCfValues} />
        <button className="btn btn-accent btn-block" disabled={saving}>{saving ? <span className="spinner" /> : <Icon name="check" size={16} />} {initial ? 'Αποθήκευση' : 'Δημιουργία'}</button>
      </form>
    </Drawer>
  );
}

// ---- Space ----------------------------------------------------------------
export function SpaceFormDrawer({ branchId, initial, onClose, onSaved }) {
  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: ({ signal }) => api.meta({ signal }) });
  const [f, setF] = useState(() => ({
    name: initial?.name || '', space_type: initial?.space_type || SPACE_TYPES[0],
    capacity: initial?.capacity || '', floor: initial?.floor || '',
    hourly_price: initial?.hourly_price || '', daily_price: initial?.daily_price || '',
    weekend_hourly_price: initial?.weekend_hourly_price || '',
    description: initial?.description || '', image_url: initial?.image_url || '',
    status: initial?.status || 'available',
    amenities: Array.isArray(initial?.amenities) ? initial.amenities : [],
    min_duration_minutes: initial?.min_duration_minutes ?? 60,
    slot_step_minutes: initial?.slot_step_minutes ?? 30,
    buffer_minutes: initial?.buffer_minutes ?? 0,
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const cfQ = useQuery({
    queryKey: initial ? ['cf-space', initial.id] : ['cf-defs', 'space'],
    queryFn: ({ signal }) => (initial ? api.spaceCustomFields(initial.id, { signal }) : api.metaCustomFields('space', { signal })),
  });
  const [cfFields, setCfFields] = useState([]);
  const [cfValues, setCfValues] = useState({});
  useEffect(() => {
    if (!cfQ.data) return;
    const list = cfQ.data.fields || [];
    setCfFields(list);
    const init = {};
    for (const fld of list) init[fld.id] = cfInitialValue(fld);
    setCfValues(init);
  }, [cfQ.data]);

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setSaving(true);
    try {
      const res = initial ? (await api.updateSpace(initial.id, f), { id: initial.id })
        : await api.createSpace({ ...f, branchId });
      if (cfFields.length) {
        const values = {};
        for (const fld of cfFields) values[fld.id] = cfValues[fld.id];
        await api.saveSpaceCustomFields(res.id, values);
      }
      onSaved();
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };
  return (
    <Drawer title={initial ? 'Επεξεργασία χώρου' : 'Νέος χώρος'} onClose={onClose}>
      {err && <div className="auth-error">{err}</div>}
      <form onSubmit={submit}>
        <ImageUpload value={f.image_url} onChange={(url) => setF((s) => ({ ...s, image_url: url }))} label="Φωτογραφία" />
        <Field label="Όνομα"><Text value={f.name} onChange={set('name')} required /></Field>
        <Row>
          <Field label="Τύπος χώρου">
            <select value={f.space_type} onChange={set('space_type')} style={sel}>
              {SPACE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Κατάσταση">
            <select value={f.status} onChange={set('status')} style={sel}>
              {Object.entries(SPACE_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Χωρητικότητα"><Text type="number" value={f.capacity} onChange={set('capacity')} /></Field>
          <Field label="Όροφος"><Text value={f.floor} onChange={set('floor')} /></Field>
        </Row>
        <Row>
          <Field label="Τιμή/ώρα (€)"><Text type="number" value={f.hourly_price} onChange={set('hourly_price')} /></Field>
          <Field label="Τιμή/ημέρα (€)"><Text type="number" value={f.daily_price} onChange={set('daily_price')} /></Field>
        </Row>
        <Field label="Τιμή Σαββατοκύριακου /ώρα (€)"><Text type="number" value={f.weekend_hourly_price} onChange={set('weekend_hourly_price')} /></Field>
        <div className="section-title" style={{ marginTop: 8 }}>Κανόνες κράτησης</div>
        <Row>
          <Field label="Ελάχ. διάρκεια (λεπτά)"><Text type="number" value={f.min_duration_minutes} onChange={set('min_duration_minutes')} /></Field>
          <Field label="Βήμα (λεπτά)"><Text type="number" value={f.slot_step_minutes} onChange={set('slot_step_minutes')} /></Field>
        </Row>
        <Field label="Buffer πριν/μετά (λεπτά)"><Text type="number" value={f.buffer_minutes} onChange={set('buffer_minutes')} /></Field>
        <AmenitiesPicker value={f.amenities} catalog={meta?.amenities} onChange={(amenities) => setF((s) => ({ ...s, amenities }))} />
        <Field label="Περιγραφή"><textarea value={f.description} onChange={set('description')} rows={2} style={ta} /></Field>
        <CustomFieldsSection fields={cfFields} values={cfValues} onChange={setCfValues} />
        <button className="btn btn-accent btn-block" disabled={saving}>{saving ? <span className="spinner" /> : <Icon name="check" size={16} />} {initial ? 'Αποθήκευση' : 'Δημιουργία'}</button>
      </form>
    </Drawer>
  );
}

const sel = { width: '100%', height: 40, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 9, background: '#fff' };
const ta = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 9, fontFamily: 'inherit', resize: 'vertical' };
