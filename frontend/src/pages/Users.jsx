import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { Avatar, Skeleton, Drawer, EmptyState } from '../components/ui.jsx';
import { formatDateTime } from '../lib/format.js';
import { useAuth } from '../store/auth.js';
import { PERMS } from '../lib/perms.js';

const sameSet = (set, arr) => set.size === arr.length && arr.every((x) => set.has(x));
const inp = { width: '100%', height: 40, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 9 };

export default function Users({ embedded = false }) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const hasPerm = useAuth((s) => s.hasPerm);
  const canManageUsers = hasPerm(PERMS.USERS_MANAGE);
  const canManageRoles = hasPerm(PERMS.ROLES_MANAGE);
  const [tab, setTab] = useState(canManageUsers ? 'members' : 'roles');
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editing, setEditing] = useState(null); // {} new | {user} edit | {user, removing}

  const usersQ = useQuery({ queryKey: ['users'], queryFn: ({ signal }) => api.users({ signal }), enabled: canManageUsers });
  const rolesQ = useQuery({ queryKey: ['roles'], queryFn: ({ signal }) => api.roles({ signal }) });
  const roles = rolesQ.data?.roles || [];
  const refreshUsers = () => qc.invalidateQueries({ queryKey: ['users'] });

  const users = useMemo(() => {
    const list = usersQ.data?.users || [];
    const term = q.trim().toLowerCase();
    return list.filter((u) => {
      if (roleFilter && u.role_key !== roleFilter) return false;
      if (!term) return true;
      return `${u.full_name} ${u.email} ${u.role_name}`.toLowerCase().includes(term);
    });
  }, [usersQ.data, q, roleFilter]);

  return (
    <div>
      {!embedded && (
        <div className="page-head">
          <div>
            <h1>Χρήστες & Ρόλοι</h1>
            <div className="sub">Μέλη και δικαιώματα για «{me?.tenantName}»</div>
          </div>
        </div>
      )}

      <div className="people-tabs">
        {canManageUsers && (
          <button type="button" className={`people-tab${tab === 'members' ? ' active' : ''}`} onClick={() => setTab('members')}>
            <Icon name="users" size={15} /> Μέλη
            <span className="count">{(usersQ.data?.users || []).length}</span>
          </button>
        )}
        {canManageRoles && (
          <button type="button" className={`people-tab${tab === 'roles' ? ' active' : ''}`} onClick={() => setTab('roles')}>
            <Icon name="layers" size={15} /> Ρόλοι
            <span className="count">{roles.length}</span>
          </button>
        )}
      </div>

      {tab === 'members' && canManageUsers && (
        <>
          <div className="people-toolbar">
            <div className="search-input" style={{ minWidth: 0, flex: 1, height: 36 }}>
              <Icon name="search" size={15} />
              <input placeholder="Αναζήτηση ονόματος ή email…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="filter-chip" style={{ height: 36 }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">Όλοι οι ρόλοι</option>
              {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
            <button className="btn btn-accent" onClick={() => setEditing({})}><Icon name="plus" size={16} /> Νέος χρήστης</button>
          </div>

          <div className="card people-card">
            {usersQ.isLoading ? (
              <div style={{ padding: 16 }}><Skeleton h={52} /><Skeleton h={52} style={{ marginTop: 10 }} /></div>
            ) : users.length === 0 ? (
              <EmptyState icon="users" title="Κανένας χρήστης" hint={q || roleFilter ? 'Δοκιμάστε διαφορετικά κριτήρια.' : 'Προσθέστε το πρώτο μέλος.'} />
            ) : users.map((u) => {
              const isMe = u.id === me?.id;
              return (
                <div className={`people-row${!u.is_active ? ' dim' : ''}`} key={u.id}>
                  <Avatar name={u.full_name} size={40} />
                  <div className="people-id">
                    <div className="nm">
                      {u.full_name}
                      {isMe && <span className="pill">εσείς</span>}
                      {!u.is_active && <span className="pill" style={{ color: 'var(--text-3)' }}>ανενεργός</span>}
                    </div>
                    <div className="sub">{u.email} · {u.last_login_at ? `τελ. σύνδεση ${formatDateTime(u.last_login_at)}` : 'χωρίς σύνδεση'}</div>
                  </div>
                  <span className="role-pill">{u.role_name}</span>
                  <div className="people-actions">
                    <button className="btn btn-sm btn-ghost btn-icon" title="Επεξεργασία" onClick={() => setEditing({ user: u })}>
                      <Icon name="edit" size={15} />
                    </button>
                    <button className="btn btn-sm btn-ghost btn-icon" title="Διαγραφή" disabled={isMe}
                      onClick={() => !isMe && setEditing({ user: u, removing: true })}>
                      <Icon name="x" size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'roles' && canManageRoles && <RolesManager />}

      {editing && !editing.removing && (
        <UserDrawer roles={roles} me={me} initial={editing.user}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refreshUsers(); }} />
      )}
      {editing?.removing && (
        <DeleteUserDrawer user={editing.user} onClose={() => setEditing(null)}
          onDeleted={() => { setEditing(null); refreshUsers(); }} />
      )}
    </div>
  );
}

function UserDrawer({ roles, me, initial, onClose, onSaved }) {
  const [form, setForm] = useState({
    firstName: initial?.first_name || '',
    lastName: initial?.last_name || '',
    email: initial?.email || '',
    password: '',
    roleKey: initial?.role_key || roles.find((r) => r.key !== 'owner')?.key || roles[0]?.key || '',
    isActive: initial ? !!initial.is_active : true,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const isMe = initial && initial.id === me?.id;
  const isOwnerRole = form.roleKey === 'owner';

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSaving(true);
    try {
      if (initial) {
        const payload = {
          firstName: form.firstName, lastName: form.lastName, email: form.email,
          roleKey: form.roleKey, isActive: form.isActive,
        };
        if (form.password) payload.password = form.password;
        await api.updateUser(initial.id, payload);
      } else {
        await api.createUser(form);
      }
      onSaved();
    } catch (ex) { setError(ex.message); }
    finally { setSaving(false); }
  };

  return (
    <Drawer title={initial ? 'Επεξεργασία χρήστη' : 'Νέος χρήστης'}
      subtitle={initial ? initial.email : 'Πρόσκληση μέλους στον οργανισμό'} onClose={onClose}>
      {error && <div className="auth-error">{error}</div>}
      <form onSubmit={submit}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field-group" style={{ flex: 1 }}><label>Όνομα</label><input style={inp} value={form.firstName} onChange={set('firstName')} required /></div>
          <div className="field-group" style={{ flex: 1 }}><label>Επώνυμο</label><input style={inp} value={form.lastName} onChange={set('lastName')} /></div>
        </div>
        <div className="field-group"><label>Email</label><input style={inp} type="email" value={form.email} onChange={set('email')} required /></div>
        <div className="field-group">
          <label>{initial ? 'Νέος κωδικός (προαιρετικό)' : 'Κωδικός'}</label>
          <input style={inp} type="password" value={form.password} onChange={set('password')} required={!initial} minLength={initial ? undefined : 6} autoComplete="new-password" />
        </div>
        <div className="field-group">
          <label>Ρόλος</label>
          <select style={inp} value={form.roleKey} onChange={set('roleKey')} disabled={isMe && isOwnerRole}>
            {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
        </div>
        {initial && (
          <label className="people-check">
            <input type="checkbox" checked={form.isActive} onChange={set('isActive')} disabled={isMe} />
            Ενεργός λογαριασμός
          </label>
        )}
        <button className="btn btn-accent btn-block" disabled={saving}>
          {saving ? <span className="spinner" /> : <Icon name="check" size={16} />} {initial ? 'Αποθήκευση' : 'Δημιουργία'}
        </button>
      </form>
    </Drawer>
  );
}

function DeleteUserDrawer({ user, onClose, onDeleted }) {
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setSaving(true);
    try { await api.deleteUser(user.id); onDeleted(); }
    catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };
  return (
    <Drawer title="Διαγραφή χρήστη" subtitle={user.full_name} onClose={onClose}>
      {err && <div className="auth-error">{err}</div>}
      <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
        Ο λογαριασμός «{user.full_name}» ({user.email}) θα διαγραφεί οριστικά και δεν θα μπορεί να συνδεθεί.
      </p>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn" style={{ flex: 1 }} onClick={onClose}>Άκυρο</button>
        <button className="btn" disabled={saving} style={{ flex: 1, background: 'var(--red-soft)', color: 'var(--red)', border: 'none' }}>
          {saving ? <span className="spinner" /> : <Icon name="x" size={16} />} Διαγραφή
        </button>
      </form>
    </Drawer>
  );
}

function RolesManager() {
  const qc = useQueryClient();
  const rolesQ = useQuery({ queryKey: ['roles'], queryFn: ({ signal }) => api.roles({ signal }) });
  const permsQ = useQuery({ queryKey: ['permissions'], queryFn: ({ signal }) => api.permissions({ signal }) });
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);

  const groups = useMemo(() => {
    const g = {};
    for (const p of permsQ.data?.permissions || []) (g[p.group] ||= []).push(p);
    return g;
  }, [permsQ.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['roles'] });

  return (
    <div>
      <div className="people-toolbar">
        <div className="muted" style={{ fontSize: 13, flex: 1 }}>Ορίστε τι μπορεί να κάνει κάθε ρόλος στον οργανισμό.</div>
        <button className="btn btn-accent" onClick={() => setCreating(true)}><Icon name="plus" size={16} /> Νέος ρόλος</button>
      </div>
      {(rolesQ.isLoading || permsQ.isLoading) ? <div className="card card-pad"><Skeleton h={60} /></div> : (
        <div className="role-stack">
          {(rolesQ.data?.roles || []).map((r) => (
            <RoleCard key={r.id} role={r} groups={groups} open={openId === r.id}
              onToggle={() => setOpenId((id) => id === r.id ? null : r.id)} onChanged={refresh} />
          ))}
        </div>
      )}
      {creating && <RoleDrawer groups={groups} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); refresh(); }} />}
    </div>
  );
}

function RoleCard({ role, groups, open, onToggle, onChanged }) {
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
  const toggleGroup = (list) => {
    if (isOwner) return;
    const codes = list.map((p) => p.code);
    const allOn = codes.every((c) => perms.has(c));
    setPerms((prev) => {
      const n = new Set(prev);
      for (const c of codes) { if (allOn) n.delete(c); else n.add(c); }
      return n;
    });
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
  const nPerms = isOwner ? 'Όλα' : `${perms.size}`;

  return (
    <div className={`card role-card${open ? ' open' : ''}`}>
      <button type="button" className="role-head" onClick={onToggle}>
        <div>
          <div className="nm">
            {role.name}
            {isOwner && <span className="pill" style={{ color: 'var(--gold)', background: 'var(--gold-soft)', border: 'none' }}>πλήρης πρόσβαση</span>}
          </div>
          <div className="sub">{role.user_count} χρήστες · {nPerms} δικαιώματα · {role.key}</div>
        </div>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} />
      </button>
      {open && (
        <div className="role-body">
          {err && <div className="auth-error">{err}</div>}
          {!isOwner && (
            <div className="field-group"><label>Όνομα ρόλου</label>
              <input style={{ ...inp, maxWidth: 320 }} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="perm-grid">
            {Object.entries(groups).map(([group, list]) => {
              const allOn = isOwner || list.every((p) => perms.has(p.code));
              return (
                <div className="perm-group" key={group}>
                  <button type="button" className="perm-group-h" onClick={() => toggleGroup(list)} disabled={isOwner}>
                    {group} {allOn ? '· όλα' : ''}
                  </button>
                  {list.map((p) => (
                    <label key={p.code} className="people-check">
                      <input type="checkbox" checked={isOwner || perms.has(p.code)} disabled={isOwner} onChange={() => toggle(p.code)} />
                      {p.label}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="role-foot">
            {!isOwner && role.user_count === 0 && <button className="btn btn-sm btn-ghost" onClick={remove}><Icon name="x" size={14} /> Διαγραφή ρόλου</button>}
            <button className="btn btn-sm btn-accent" disabled={!dirty || saving} onClick={save} style={{ marginLeft: 'auto' }}>
              {saving ? <span className="spinner" /> : <Icon name="check" size={14} />} Αποθήκευση
            </button>
          </div>
        </div>
      )}
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
        <div className="field-group"><label>Όνομα ρόλου</label><input style={inp} value={name} onChange={(e) => setName(e.target.value)} required /></div>
        {Object.entries(groups).map(([group, list]) => (
          <div key={group} style={{ marginBottom: 12 }}>
            <div className="perm-group-h">{group}</div>
            {list.map((p) => (
              <label key={p.code} className="people-check">
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
