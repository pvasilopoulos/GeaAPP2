import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Drawer, EmptyState, Skeleton } from '../../components/ui.jsx';

const inp = { width: '100%', height: 40, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 9 };

export default function SellersPanel() {
  const queryClient = useQueryClient();
  const sellersQuery = useQuery({ queryKey: ['sellers'], queryFn: ({ signal }) => api.sellers({ signal }) });
  const [editing, setEditing] = useState(null);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['sellers'] });
    queryClient.invalidateQueries({ queryKey: ['meta'] });
  };

  return (
    <div>
      <div className="people-toolbar">
        <div className="muted" style={{ fontSize: 13, flex: 1 }}>Οι πωλητές εμφανίζονται στις προσφορές και στις αναθέσεις πελατών.</div>
        <button className="btn btn-accent" onClick={() => setEditing({})}><Icon name="plus" size={16} /> Νέος πωλητής</button>
      </div>
      <div className="card people-card">
        {sellersQuery.isLoading ? <div style={{ padding: 16 }}><Skeleton h={52} /><Skeleton h={52} style={{ marginTop: 10 }} /></div>
          : !(sellersQuery.data?.sellers || []).length ? <EmptyState icon="users" title="Κανένας πωλητής" hint="Προσθέστε τον πρώτο πωλητή." />
            : sellersQuery.data.sellers.map((seller) => (
              <div className="people-row" key={seller.id}>
                <div className="avatar" style={{ width: 40, height: 40 }}>{seller.full_name.slice(0, 1)}</div>
                <div className="people-id">
                  <div className="nm">{seller.full_name}</div>
                  <div className="sub">{[seller.role, seller.email].filter(Boolean).join(' · ') || 'Πωλητής'}</div>
                </div>
                <div className="people-actions">
                  <button className="btn btn-sm btn-ghost btn-icon" title="Επεξεργασία" onClick={() => setEditing({ seller })}><Icon name="edit" size={15} /></button>
                  <button className="btn btn-sm btn-ghost btn-icon" title="Διαγραφή" onClick={() => setEditing({ seller, removing: true })}><Icon name="x" size={15} /></button>
                </div>
              </div>
            ))}
      </div>
      {editing && !editing.removing && <SellerDrawer seller={editing.seller} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      {editing?.removing && <DeleteSellerDrawer seller={editing.seller} onClose={() => setEditing(null)} onDeleted={() => { setEditing(null); refresh(); }} />}
    </div>
  );
}

function SellerDrawer({ seller, onClose, onSaved }) {
  const [form, setForm] = useState({
    firstName: seller?.first_name || '', lastName: seller?.last_name || '',
    email: seller?.email || '', role: seller?.role || 'Πωλητής', avatarUrl: seller?.avatar_url || '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setError(''); setSaving(true);
    try {
      if (seller) await api.updateSeller(seller.id, form);
      else await api.createSeller(form);
      onSaved();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return (
    <Drawer title={seller ? 'Επεξεργασία πωλητή' : 'Νέος πωλητής'} subtitle="Στοιχεία που χρησιμοποιούνται στις προσφορές και στις αναθέσεις" onClose={onClose}>
      {error && <div className="auth-error">{error}</div>}
      <form onSubmit={submit}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field-group" style={{ flex: 1 }}><label>Όνομα</label><input style={inp} value={form.firstName} onChange={set('firstName')} required /></div>
          <div className="field-group" style={{ flex: 1 }}><label>Επώνυμο</label><input style={inp} value={form.lastName} onChange={set('lastName')} required /></div>
        </div>
        <div className="field-group"><label>Email</label><input style={inp} type="email" value={form.email} onChange={set('email')} /></div>
        <div className="field-group"><label>Ρόλος / τίτλος</label><input style={inp} value={form.role} onChange={set('role')} placeholder="π.χ. Πωλητής" /></div>
        <div className="field-group"><label>URL φωτογραφίας (προαιρετικό)</label><input style={inp} value={form.avatarUrl} onChange={set('avatarUrl')} /></div>
        <button className="btn btn-accent btn-block" disabled={saving}>{saving ? <span className="spinner" /> : <Icon name="check" size={16} />} Αποθήκευση</button>
      </form>
    </Drawer>
  );
}

function DeleteSellerDrawer({ seller, onClose, onDeleted }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const remove = async () => {
    setError(''); setSaving(true);
    try { await api.deleteSeller(seller.id); onDeleted(); } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return (
    <Drawer title="Διαγραφή πωλητή" subtitle={seller.full_name} onClose={onClose}>
      {error && <div className="auth-error">{error}</div>}
      <p className="muted">Οι προσφορές και οι αναθέσεις που τον χρησιμοποιούν θα παραμείνουν, χωρίς ορισμένο πωλητή.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" style={{ flex: 1 }} onClick={onClose}>Άκυρο</button>
        <button className="btn" style={{ flex: 1, background: 'var(--red-soft)', color: 'var(--red)', border: 'none' }} onClick={remove} disabled={saving}>
          {saving ? <span className="spinner" /> : <Icon name="x" size={16} />} Διαγραφή
        </button>
      </div>
    </Drawer>
  );
}
