import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { Drawer } from './ui.jsx';

const SPACE_TYPES = ['Αίθουσα συνεδριάσεων', 'Ιδιωτικό γραφείο', 'Co-working', 'Lounge', 'Αίθουσα εκδηλώσεων', 'Studio', 'Αίθουσα εκπαίδευσης'];

function Field({ label, children }) {
  return <div className="field-group"><label>{label}</label>{children}</div>;
}
function Text(props) { return <input {...props} />; }
function Row({ children }) { return <div style={{ display: 'flex', gap: 10 }}>{children}</div>; }

// ---- Customer -------------------------------------------------------------
export function CustomerFormDrawer({ initial, onClose, onSaved }) {
  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: ({ signal }) => api.meta({ signal }) });
  const [f, setF] = useState(() => ({
    first_name: initial?.first_name || '', last_name: initial?.last_name || '',
    customer_type: initial?.customer_type || 'individual', company: initial?.company || '',
    tax_id: initial?.tax_id || '', email: initial?.email || '', phone: initial?.phone || '',
    mobile: initial?.mobile || '', status: initial?.status || 'active', is_vip: !!initial?.is_vip,
    date_of_birth: initial?.date_of_birth ? String(initial.date_of_birth).slice(0, 10) : '',
    address_line: initial?.address_line || '', city: initial?.city || '', postal_code: initial?.postal_code || '',
    assigned_employee_id: initial?.assigned_employee_id || '', profile_note: initial?.profile_note || '',
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setSaving(true);
    try {
      const res = initial ? (await api.updateCustomer(initial.id, f), { id: initial.id }) : await api.createCustomer(f);
      onSaved({ id: res.id, full_name: `${f.first_name} ${f.last_name}` });
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };
  return (
    <Drawer title={initial ? 'Επεξεργασία πελάτη' : 'Νέος πελάτης'} subtitle={initial ? `#${initial.code}` : 'Δημιουργία εγγραφής πελάτη'} onClose={onClose}>
      {err && <div className="auth-error">{err}</div>}
      <form onSubmit={submit}>
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
            <Field label="ΑΦΜ"><Text value={f.tax_id} onChange={set('tax_id')} /></Field>
          </Row>
        )}
        <Row>
          <Field label="Email"><Text type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Τηλέφωνο"><Text value={f.phone} onChange={set('phone')} /></Field>
        </Row>
        <Row>
          <Field label="Κινητό"><Text value={f.mobile} onChange={set('mobile')} /></Field>
          <Field label="Ημ. γέννησης"><Text type="date" value={f.date_of_birth} onChange={set('date_of_birth')} /></Field>
        </Row>
        <Field label="Διεύθυνση"><Text value={f.address_line} onChange={set('address_line')} /></Field>
        <Row>
          <Field label="Πόλη"><Text value={f.city} onChange={set('city')} /></Field>
          <Field label="Τ.Κ."><Text value={f.postal_code} onChange={set('postal_code')} /></Field>
        </Row>
        <Field label="Υπεύθυνος">
          <select value={f.assigned_employee_id} onChange={set('assigned_employee_id')} style={sel}>
            <option value="">—</option>
            {(meta?.employees || []).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </Field>
        <Field label="Σημείωση"><textarea value={f.profile_note} onChange={set('profile_note')} rows={2} style={ta} /></Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 14px' }}>
          <input type="checkbox" checked={f.is_vip} onChange={set('is_vip')} /> VIP πελάτης
        </label>
        <button className="btn btn-accent btn-block" disabled={saving}>{saving ? <span className="spinner" /> : <Icon name="check" size={16} />} {initial ? 'Αποθήκευση' : 'Δημιουργία'}</button>
      </form>
    </Drawer>
  );
}

// ---- Branch ---------------------------------------------------------------
export function BranchFormDrawer({ customerId, initial, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    name: initial?.name || '', city: initial?.city || '', area: initial?.area || '',
    address_line: initial?.address_line || '', postal_code: initial?.postal_code || '',
    phone: initial?.phone || '', email: initial?.email || '', is_primary: !!initial?.is_primary,
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setSaving(true);
    try {
      if (initial) await api.updateBranch(initial.id, f); else await api.createBranch({ ...f, customerId });
      onSaved();
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };
  return (
    <Drawer title={initial ? 'Επεξεργασία υποκαταστήματος' : 'Νέο υποκατάστημα'} onClose={onClose}>
      {err && <div className="auth-error">{err}</div>}
      <form onSubmit={submit}>
        <Field label="Όνομα"><Text value={f.name} onChange={set('name')} required /></Field>
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 14px' }}>
          <input type="checkbox" checked={f.is_primary} onChange={set('is_primary')} /> Κύριο υποκατάστημα
        </label>
        <button className="btn btn-accent btn-block" disabled={saving}>{saving ? <span className="spinner" /> : <Icon name="check" size={16} />} {initial ? 'Αποθήκευση' : 'Δημιουργία'}</button>
      </form>
    </Drawer>
  );
}

// ---- Space ----------------------------------------------------------------
export function SpaceFormDrawer({ branchId, initial, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    name: initial?.name || '', space_type: initial?.space_type || SPACE_TYPES[0],
    capacity: initial?.capacity || '', floor: initial?.floor || '',
    hourly_price: initial?.hourly_price || '', description: initial?.description || '',
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setSaving(true);
    try {
      if (initial) await api.updateSpace(initial.id, f); else await api.createSpace({ ...f, branchId });
      onSaved();
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };
  return (
    <Drawer title={initial ? 'Επεξεργασία χώρου' : 'Νέος χώρος'} onClose={onClose}>
      {err && <div className="auth-error">{err}</div>}
      <form onSubmit={submit}>
        <Field label="Όνομα"><Text value={f.name} onChange={set('name')} required /></Field>
        <Field label="Τύπος χώρου">
          <select value={f.space_type} onChange={set('space_type')} style={sel}>
            {SPACE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Row>
          <Field label="Χωρητικότητα"><Text type="number" value={f.capacity} onChange={set('capacity')} /></Field>
          <Field label="Όροφος"><Text value={f.floor} onChange={set('floor')} /></Field>
        </Row>
        <Field label="Τιμή/ώρα (€)"><Text type="number" value={f.hourly_price} onChange={set('hourly_price')} /></Field>
        <Field label="Περιγραφή"><textarea value={f.description} onChange={set('description')} rows={2} style={ta} /></Field>
        <button className="btn btn-accent btn-block" disabled={saving}>{saving ? <span className="spinner" /> : <Icon name="check" size={16} />} {initial ? 'Αποθήκευση' : 'Δημιουργία'}</button>
      </form>
    </Drawer>
  );
}

const sel = { width: '100%', height: 40, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 9, background: '#fff' };
const ta = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 9, fontFamily: 'inherit', resize: 'vertical' };
