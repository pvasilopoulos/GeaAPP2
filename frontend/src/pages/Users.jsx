import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { Avatar, Skeleton, Drawer } from '../components/ui.jsx';
import { formatDateTime } from '../lib/format.js';
import { useAuth } from '../store/auth.js';
import { PERMS } from '../lib/perms.js';

const sameSet = (set, arr) => set.size === arr.length && arr.every((x) => set.has(x));

export default function Users() {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const hasPerm = useAuth((s) => s.hasPerm);
  const canManageUsers = hasPerm(PERMS.USERS_MANAGE);
  const canManageRoles = hasPerm(PERMS.ROLES_MANAGE);
  const [drawer, setDrawer] = useState(false);

  const usersQ = useQuery({ queryKey: ['users'], queryFn: ({ signal }) => api.users({ signal }), enabled: canManageUsers });
  const rolesQ = useQuery({ queryKey: ['roles'], queryFn: ({ signal }) => api.roles({ signal }) });
  const roles = rolesQ.data?.roles || [];
  const refreshUsers = () => qc.invalidateQueries({ queryKey: ['users'] });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Χρήστες & Ρόλοι</h1>
          <div className="sub">Διαχείριση χρηστών, ρόλων και δικαιωμάτων για «{me?.tenantName}»</div>
        </div>
        {canManageUsers && <button className="btn btn-accent" onClick={() => setDrawer(true)}><Icon name="plus" size={16} /> Νέος χρήστης</button>}
      </div>

      {canManageUsers && (
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
                  onChange={async (e) => { await api.updateUser(u.id, { roleKey: e.target.value }); refreshUsers(); }}
                  disabled={u.id === me?.id}>
                  {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                </select>
              </div>
              <div className="muted" style={{ fontSize: 13 }}>{u.last_login_at ? formatDateTime(u.last_login_at) : '—'}</div>
              <div style={{ textAlign: 'right' }}>
                <button className={`badge badge-${u.is_active ? 'active' : 'inactive'}`} style={{ border: 'none', cursor: u.id === me?.id ? 'default' : 'pointer' }}
                  onClick={async () => { if (u.id !== me?.id) { await api.updateUser(u.id, { isActive: !u.is_active }); refreshUsers(); } }}>
                  <span className="dot" />{u.is_active ? 'Ενεργός' : 'Ανενεργός'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {canManageRoles && <RolesManager />}

      {drawer && <CreateUserDrawer roles={roles} onClose={() => setDrawer(false)} onCreated={() => { setDrawer(false); refreshUsers(); }} />}
    </div>
  );
}

// ---- Roles & permissions manager -----------------------------------------
function RolesManager() {
  const qc = useQueryClient();
  const rolesQ = useQuery({ queryKey: ['roles'], queryFn: ({ signal }) => api.roles({ signal }) });
  const permsQ = useQuery({ queryKey: ['permissions'], queryFn: ({ signal }) => api.permissions({ signal }) });
  const [creating, setCreating] = useState(false);

  const groups = useMemo(() => {
    const g = {};
    for (const p of permsQ.data?.permissions || []) (g[p.group] ||= []).push(p);
    return g;
  }, [permsQ.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['roles'] });

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="section-title" style={{ margin: 0 }}><Icon name="settings" /> Ρόλοι & δικαιώματα</div>
        <button className="btn btn-sm btn-accent" onClick={() => setCreating(true)}><Icon name="plus" size={15} /> Νέος ρόλος</button>
      </div>
      {(rolesQ.isLoading || permsQ.isLoading) ? <div className="card card-pad"><Skeleton h={60} /></div> : (
        <div style={{ display: 'grid', gap: 14 }}>
          {rolesQ.data.roles.map((r) => <RoleCard key={r.id} role={r} groups={groups} onChanged={refresh} />)}
        </div>
      )}
      {creating && <RoleDrawer groups={groups} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); refresh(); }} />}
    </div>
  );
}

function RoleCard({ role, groups, onChanged }) {
  const isOwner = role.key === 'owner';
  const [name, setName] = useState(role.name);
  const [perms, setPerms] = useState(() => new Set(role.permissions));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const dirty = !isOwner && (name !== role.name || !sameSet(perms, role.permissions));

  const toggle = (code) => {
    if (isOwner) return;
    setPerms((prev) => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });
  };
  const save = async () => {
    setSaving(true); setErr('');
    try { await api.updateRole(role.id, { name, permissions: [...perms] }); onChanged(); }
    catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!confirm(`Διαγραφή ρόλου «${role.name}»;`)) return;
    try { await api.deleteRole(role.id); onChanged(); } catch (e) { setErr(e.message); }
  };

  return (
    <div className="card card-pad">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {isOwner || role.is_system ? (
          <span className="role-pill" style={{ fontSize: 13 }}>{name}</span>
        ) : (
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ height: 32, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 8, fontWeight: 600 }} />
        )}
        <span className="pill">{role.key}</span>
        <span className="muted" style={{ fontSize: 12 }}>{role.user_count} χρήστες</span>
        {isOwner && <span className="pill" style={{ color: 'var(--gold)', background: 'var(--gold-soft)', border: 'none' }}>όλα τα δικαιώματα</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {!isOwner && role.user_count === 0 && <button className="btn btn-sm btn-ghost" onClick={remove}><Icon name="x" size={14} /> Διαγραφή</button>}
          <button className="btn btn-sm btn-accent" disabled={!dirty || saving} onClick={save}>{saving ? <span className="spinner" /> : <Icon name="check" size={14} />} Αποθήκευση</button>
        </div>
      </div>
      {err && <div className="auth-error">{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {Object.entries(groups).map(([group, list]) => (
          <div key={group}>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)', marginBottom: 6 }}>{group}</div>
            {list.map((p) => (
              <label key={p.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, opacity: isOwner ? 0.7 : 1 }}>
                <input type="checkbox" checked={isOwner || perms.has(p.code)} disabled={isOwner} onChange={() => toggle(p.code)} />
                {p.label}
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleDrawer({ groups, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [perms, setPerms] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const toggle = (code) => setPerms((prev) => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setErr('');
    try { await api.createRole({ name, permissions: [...perms] }); onSaved(); }
    catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  };
  return (
    <Drawer title="Νέος ρόλος" subtitle="Ορίστε όνομα και δικαιώματα" onClose={onClose}>
      {err && <div className="auth-error">{err}</div>}
      <form onSubmit={submit}>
        <div className="field-group"><label>Όνομα ρόλου</label><input value={name} onChange={(e) => setName(e.target.value)} required /></div>
        {Object.entries(groups).map(([group, list]) => (
          <div key={group} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)', marginBottom: 6 }}>{group}</div>
            {list.map((p) => (
              <label key={p.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                <input type="checkbox" checked={perms.has(p.code)} onChange={() => toggle(p.code)} /> {p.label}
              </label>
            ))}
          </div>
        ))}
        <button className="btn btn-accent btn-block" disabled={saving}>{saving ? <span className="spinner" /> : <Icon name="check" size={16} />} Δημιουργία ρόλου</button>
      </form>
    </Drawer>
  );
}

function CreateUserDrawer({ roles, onClose, onCreated }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', roleKey: roles[0]?.key || '' });
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
