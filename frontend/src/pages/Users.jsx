import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { Avatar, Skeleton, Drawer, EmptyState } from '../components/ui.jsx';
import { formatDateTime } from '../lib/format.js';
import { useAuth } from '../store/auth.js';

export default function Users() {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const [drawer, setDrawer] = useState(false);

  const usersQ = useQuery({ queryKey: ['users'], queryFn: ({ signal }) => api.users({ signal }) });
  const rolesQ = useQuery({ queryKey: ['roles'], queryFn: ({ signal }) => api.roles({ signal }) });
  const roles = rolesQ.data?.roles || [];

  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });

  const changeRole = async (id, roleKey) => { await api.updateUser(id, { roleKey }); refresh(); };
  const toggleActive = async (u) => { await api.updateUser(u.id, { isActive: !u.is_active }); refresh(); };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Χρήστες & Δικαιώματα</h1>
          <div className="sub">Διαχείριση χρηστών του οργανισμού «{me?.tenantName}» και των ρόλων τους</div>
        </div>
        <button className="btn btn-accent" onClick={() => setDrawer(true)}><Icon name="plus" size={16} /> Νέος χρήστης</button>
      </div>

      <div className="card">
        <div className="cf-row" style={{ gridTemplateColumns: '2fr 1.2fr 1fr 1fr', background: 'var(--surface-2)', fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)' }}>
          <div>Χρήστης</div><div>Ρόλος</div><div>Τελ. σύνδεση</div><div style={{ textAlign: 'right' }}>Κατάσταση</div>
        </div>
        {usersQ.isLoading ? (
          <div style={{ padding: 16 }}><Skeleton h={40} /><Skeleton h={40} style={{ marginTop: 10 }} /></div>
        ) : (usersQ.data?.users || []).map((u) => (
          <div className="cf-row" style={{ gridTemplateColumns: '2fr 1.2fr 1fr 1fr' }} key={u.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <Avatar name={u.full_name} size={36} />
              <div>
                <div style={{ fontWeight: 600 }}>{u.full_name} {u.id === me?.id && <span className="pill">εσείς</span>}</div>
                <div className="meta" style={{ fontSize: 12 }}>{u.email}</div>
              </div>
            </div>
            <div>
              <select className="filter-chip" style={{ height: 32 }} value={u.role_key}
                onChange={(e) => changeRole(u.id, e.target.value)} disabled={u.id === me?.id}>
                {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
              </select>
            </div>
            <div className="muted" style={{ fontSize: 13 }}>{u.last_login_at ? formatDateTime(u.last_login_at) : '—'}</div>
            <div style={{ textAlign: 'right' }}>
              <button className={`badge badge-${u.is_active ? 'active' : 'inactive'}`} style={{ border: 'none', cursor: u.id === me?.id ? 'default' : 'pointer' }}
                onClick={() => u.id !== me?.id && toggleActive(u)}>
                <span className="dot" />{u.is_active ? 'Ενεργός' : 'Ανενεργός'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="section-title"><Icon name="settings" /> Ρόλοι & δικαιώματα</div>
        {rolesQ.isLoading ? <Skeleton h={40} /> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {roles.map((r) => (
              <div key={r.key} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span className="role-pill" style={{ minWidth: 110, justifyContent: 'center' }}>{r.name}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {r.permissions.map((p) => <span className="pill" key={p}>{p}</span>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {drawer && <CreateUserDrawer roles={roles} onClose={() => setDrawer(false)} onCreated={() => { setDrawer(false); refresh(); }} />}
    </div>
  );
}

function CreateUserDrawer({ roles, onClose, onCreated }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', roleKey: 'agent' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSaving(true);
    try { await api.createUser(form); onCreated(); }
    catch (ex) { setError(ex.message); }
    finally { setSaving(false); }
  };

  return (
    <Drawer title="Νέος χρήστης" subtitle="Πρόσκληση μέλους στον οργανισμό" onClose={onClose}>
      {error && <div className="auth-error">{error}</div>}
      <form onSubmit={submit}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field-group" style={{ flex: 1 }}><label>Όνομα</label><input value={form.firstName} onChange={set('firstName')} required /></div>
          <div className="field-group" style={{ flex: 1 }}><label>Επώνυμο</label><input value={form.lastName} onChange={set('lastName')} /></div>
        </div>
        <div className="field-group"><label>Email</label><input type="email" value={form.email} onChange={set('email')} required /></div>
        <div className="field-group"><label>Κωδικός</label><input type="password" value={form.password} onChange={set('password')} required /></div>
        <div className="field-group">
          <label>Ρόλος</label>
          <select className="filter-chip" style={{ width: '100%', height: 40 }} value={form.roleKey} onChange={set('roleKey')}>
            {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
        </div>
        <button className="btn btn-accent btn-block" disabled={saving}>{saving ? <span className="spinner" /> : <Icon name="check" size={16} />} Δημιουργία</button>
      </form>
    </Drawer>
  );
}
