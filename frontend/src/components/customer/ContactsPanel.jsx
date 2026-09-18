import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../Icon.jsx';
import { Avatar, EmptyState, Drawer, Skeleton } from '../ui.jsx';
import { CONTACT_ROLES } from '../../lib/format.js';
import { useAuth } from '../../store/auth.js';
import { PERMS } from '../../lib/perms.js';

function blank() {
  return { first_name: '', last_name: '', role: 'Κύρια επαφή', email: '', phone: '', mobile: '', is_primary: false, notes: '' };
}

export default function ContactsPanel({ customerId, customerType }) {
  const qc = useQueryClient();
  const canWrite = useAuth((s) => s.hasPerm(PERMS.CUSTOMERS_WRITE));
  const [form, setForm] = useState(null);
  const { data, isLoading } = useQuery({
    queryKey: ['contacts', customerId],
    queryFn: ({ signal }) => api.customerContacts(customerId, { signal }),
  });
  const contacts = data?.contacts || [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['contacts', customerId] });
    qc.invalidateQueries({ queryKey: ['customer', customerId] });
    qc.invalidateQueries({ queryKey: ['history', 'activity', customerId] });
  };

  if (isLoading) return <div className="card card-pad"><Skeleton h={120} /></div>;

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 18 }}>Επαφές</h1>
          <div className="sub">{customerType === 'company' ? 'Άτομα επικοινωνίας της εταιρείας' : 'Επιπλέον άτομα επικοινωνίας'}</div>
        </div>
        {canWrite && <button className="btn btn-accent" onClick={() => setForm(blank())}><Icon name="plus" size={16} /> Νέα επαφή</button>}
      </div>
      {contacts.length === 0 ? (
        <div className="card card-pad">
          <EmptyState icon="users" title="Χωρίς επαφές"
            hint={canWrite ? 'Προσθέστε την κύρια επαφή του πελάτη.' : undefined} />
        </div>
      ) : (
        <div className="card">
          {contacts.map((c) => (
            <div key={c.id} className="contact-row">
              <Avatar name={`${c.first_name} ${c.last_name}`} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {c.first_name} {c.last_name}
                  {c.is_primary ? <span className="pill" style={{ color: 'var(--accent)', background: 'var(--accent-soft)', border: 'none' }}>Κύρια</span> : null}
                  {c.role && <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>{c.role}</span>}
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                  {[c.email, c.phone || c.mobile].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              {canWrite && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => setForm(c)}><Icon name="edit" size={14} /></button>
                  <button className="btn btn-sm" onClick={async () => {
                    if (!confirm('Διαγραφή επαφής;')) return;
                    await api.deleteContact(customerId, c.id); refresh();
                  }}><Icon name="x" size={14} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {form && (
        <ContactDrawer customerId={customerId} initial={form.id ? form : null} seed={form}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />
      )}
    </div>
  );
}

function ContactDrawer({ customerId, initial, seed, onClose, onSaved }) {
  const [f, setF] = useState(() => ({ ...blank(), ...(initial || seed || {}) }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setSaving(true);
    try {
      if (initial) await api.updateContact(customerId, initial.id, f);
      else await api.createContact(customerId, f);
      onSaved();
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };
  return (
    <Drawer title={initial ? 'Επεξεργασία επαφής' : 'Νέα επαφή'} onClose={onClose}>
      {err && <div className="auth-error">{err}</div>}
      <form onSubmit={submit}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field-group" style={{ flex: 1 }}><label>Όνομα</label><input value={f.first_name} onChange={set('first_name')} required /></div>
          <div className="field-group" style={{ flex: 1 }}><label>Επώνυμο</label><input value={f.last_name} onChange={set('last_name')} required /></div>
        </div>
        <div className="field-group">
          <label>Ρόλος</label>
          <select value={f.role || ''} onChange={set('role')} style={{ width: '100%', height: 40, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 9 }}>
            {CONTACT_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="field-group"><label>Email</label><input type="email" value={f.email || ''} onChange={set('email')} /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field-group" style={{ flex: 1 }}><label>Τηλέφωνο</label><input value={f.phone || ''} onChange={set('phone')} /></div>
          <div className="field-group" style={{ flex: 1 }}><label>Κινητό</label><input value={f.mobile || ''} onChange={set('mobile')} /></div>
        </div>
        <div className="field-group"><label>Σημείωση</label><textarea rows={2} value={f.notes || ''} onChange={set('notes')} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 9, fontFamily: 'inherit' }} /></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 14px' }}>
          <input type="checkbox" checked={!!f.is_primary} onChange={set('is_primary')} /> Κύρια επαφή
        </label>
        <button className="btn btn-accent btn-block" disabled={saving}>{saving ? <span className="spinner" /> : <Icon name="check" size={16} />} {initial ? 'Αποθήκευση' : 'Προσθήκη'}</button>
      </form>
    </Drawer>
  );
}
