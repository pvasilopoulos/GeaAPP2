import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Skeleton, Drawer, EmptyState } from '../../components/ui.jsx';
import { formatNumber } from '../../lib/format.js';

const STATUS_LABEL = { active: 'Ενεργός', trial: 'Δοκιμή', suspended: 'Αναστολή' };
const PLAN_LABEL = { trial: 'Trial', standard: 'Standard', business: 'Business', enterprise: 'Enterprise' };
const inp = { width: '100%', height: 40, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 9 };

export default function TenantsPanel() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const { data, isLoading } = useQuery({
    queryKey: ['tenants', q],
    queryFn: ({ signal }) => api.tenants({ q }, { signal }),
  });
  const tenants = data?.tenants || [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['tenants'] });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="search-input" style={{ minWidth: 220, height: 36, flex: 1, maxWidth: 360 }}>
          <Icon name="search" size={15} />
          <input placeholder="Αναζήτηση οργανισμού…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn btn-accent" onClick={() => setEditing({})}><Icon name="plus" size={16} /> Νέος tenant</button>
      </div>

      <div className="card">
        <div className="cf-row" style={{ gridTemplateColumns: '1.6fr 0.8fr 0.8fr 0.7fr 0.7fr 0.9fr', background: 'var(--surface-2)', fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)' }}>
          <div>Οργανισμός</div><div>Κατάσταση</div><div>Πλάνο</div><div>Χρήστες</div><div>Πελάτες</div><div style={{ textAlign: 'right' }}>Ενέργειες</div>
        </div>
        {isLoading ? (
          <div style={{ padding: 16 }}><Skeleton h={40} /><Skeleton h={40} style={{ marginTop: 10 }} /></div>
        ) : tenants.length === 0 ? (
          <EmptyState icon="building" title="Χωρίς tenants" hint="Δημιουργήστε τον πρώτο οργανισμό." />
        ) : tenants.map((t) => (
          <div className="cf-row" style={{ gridTemplateColumns: '1.6fr 0.8fr 0.8fr 0.7fr 0.7fr 0.9fr' }} key={t.id}>
            <div>
              <div style={{ fontWeight: 600 }}>{t.name}</div>
              <div className="meta" style={{ fontSize: 12 }}>{t.slug}{t.owner_email ? ` · ${t.owner_email}` : ''}</div>
            </div>
            <div><span className={`badge badge-${t.status === 'suspended' ? 'inactive' : t.status === 'trial' ? 'prospect' : 'active'}`}><span className="dot" />{STATUS_LABEL[t.status] || t.status}</span></div>
            <div><span className="pill">{PLAN_LABEL[t.plan] || t.plan}</span></div>
            <div className="mono">{formatNumber(t.users_count)}</div>
            <div className="mono">{formatNumber(t.customers_count)}</div>
            <div style={{ textAlign: 'right', display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              <button className="btn btn-sm btn-ghost btn-icon" title="Επεξεργασία" onClick={() => setEditing({ tenant: t })}><Icon name="edit" size={15} /></button>
              <button className="btn btn-sm btn-ghost btn-icon" title="Διαγραφή" onClick={() => setEditing({ tenant: t, removing: true })}><Icon name="x" size={15} /></button>
            </div>
          </div>
        ))}
      </div>

      {editing && !editing.removing && (
        <TenantFormDrawer initial={editing.tenant} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }} />
      )}
      {editing?.removing && (
        <DeleteTenantDrawer tenant={editing.tenant} onClose={() => setEditing(null)}
          onDeleted={() => { setEditing(null); refresh(); }} />
      )}
    </div>
  );
}

function TenantFormDrawer({ initial, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    name: initial?.name || '', slug: initial?.slug || '',
    status: initial?.status || 'trial', plan: initial?.plan || 'standard',
    locale: initial?.locale || 'el', timezone: initial?.timezone || 'Europe/Athens',
    currency: initial?.currency || 'EUR',
    contact_email: initial?.contact_email || '', contact_phone: initial?.contact_phone || '',
    notes: initial?.notes || '',
    ownerFirst: '', ownerLast: '', ownerEmail: '', ownerPassword: '',
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setSaving(true);
    try {
      if (initial) {
        await api.updateTenant(initial.id, {
          name: f.name, slug: f.slug, status: f.status, plan: f.plan,
          locale: f.locale, timezone: f.timezone, currency: f.currency,
          contact_email: f.contact_email, contact_phone: f.contact_phone, notes: f.notes,
        });
      } else {
        await api.createTenant({
          name: f.name, slug: f.slug, status: f.status, plan: f.plan,
          locale: f.locale, timezone: f.timezone, currency: f.currency,
          contact_email: f.contact_email, contact_phone: f.contact_phone, notes: f.notes,
          owner: { firstName: f.ownerFirst, lastName: f.ownerLast, email: f.ownerEmail, password: f.ownerPassword },
        });
      }
      onSaved();
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };

  return (
    <Drawer title={initial ? 'Επεξεργασία tenant' : 'Νέος tenant'} subtitle={initial ? `#${initial.id} · ${initial.slug}` : 'Δημιουργία οργανισμού + ιδιοκτήτη'} onClose={onClose}>
      {err && <div className="auth-error">{err}</div>}
      <form onSubmit={submit}>
        <div className="field-group"><label>Επωνυμία</label><input style={inp} value={f.name} onChange={set('name')} required /></div>
        <div className="field-group"><label>Slug</label><input style={inp} value={f.slug} onChange={set('slug')} placeholder="αυτόματα από την επωνυμία" /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field-group" style={{ flex: 1 }}><label>Κατάσταση</label>
            <select style={inp} value={f.status} onChange={set('status')}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="field-group" style={{ flex: 1 }}><label>Πλάνο</label>
            <select style={inp} value={f.plan} onChange={set('plan')}>
              {Object.entries(PLAN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field-group" style={{ flex: 1 }}><label>Γλώσσα</label>
            <select style={inp} value={f.locale} onChange={set('locale')}>
              <option value="el">Ελληνικά</option><option value="en">English</option>
            </select>
          </div>
          <div className="field-group" style={{ flex: 1 }}><label>Ζώνη ώρας</label>
            <select style={inp} value={f.timezone} onChange={set('timezone')}>
              <option value="Europe/Athens">Europe/Athens</option>
              <option value="UTC">UTC</option>
              <option value="Europe/London">Europe/London</option>
            </select>
          </div>
        </div>
        <div className="field-group"><label>Νόμισμα</label>
          <select style={inp} value={f.currency} onChange={set('currency')}>
            <option value="EUR">EUR</option><option value="USD">USD</option><option value="GBP">GBP</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field-group" style={{ flex: 1 }}><label>Email επικοινωνίας</label><input style={inp} type="email" value={f.contact_email} onChange={set('contact_email')} /></div>
          <div className="field-group" style={{ flex: 1 }}><label>Τηλέφωνο</label><input style={inp} value={f.contact_phone} onChange={set('contact_phone')} /></div>
        </div>
        <div className="field-group"><label>Σημειώσεις</label>
          <textarea rows={3} style={{ ...inp, height: 'auto', padding: 10 }} value={f.notes} onChange={set('notes')} />
        </div>
        {!initial && (
          <>
            <div className="section-title">Ιδιοκτήτης</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field-group" style={{ flex: 1 }}><label>Όνομα</label><input style={inp} value={f.ownerFirst} onChange={set('ownerFirst')} required /></div>
              <div className="field-group" style={{ flex: 1 }}><label>Επώνυμο</label><input style={inp} value={f.ownerLast} onChange={set('ownerLast')} /></div>
            </div>
            <div className="field-group"><label>Email</label><input style={inp} type="email" value={f.ownerEmail} onChange={set('ownerEmail')} required /></div>
            <div className="field-group"><label>Κωδικός</label><input style={inp} type="password" value={f.ownerPassword} onChange={set('ownerPassword')} required minLength={6} /></div>
          </>
        )}
        <button className="btn btn-accent btn-block" disabled={saving}>{saving ? <span className="spinner" /> : <Icon name="check" size={16} />} {initial ? 'Αποθήκευση' : 'Δημιουργία'}</button>
      </form>
    </Drawer>
  );
}

function DeleteTenantDrawer({ tenant, onClose, onDeleted }) {
  const [slug, setSlug] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setSaving(true);
    try { await api.deleteTenant(tenant.id, slug); onDeleted(); }
    catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };
  return (
    <Drawer title="Διαγραφή tenant" subtitle={tenant.name} onClose={onClose}>
      {err && <div className="auth-error">{err}</div>}
      <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
        Θα διαγραφούν οριστικά χρήστες, πελάτες, υποκαταστήματα και χώροι του «{tenant.name}».
        Πληκτρολογήστε το slug <b>{tenant.slug}</b> για επιβεβαίωση.
      </p>
      <form onSubmit={submit}>
        <div className="field-group"><label>Slug επιβεβαίωσης</label>
          <input style={inp} value={slug} onChange={(e) => setSlug(e.target.value)} required />
        </div>
        <button className="btn btn-block" disabled={saving || slug !== tenant.slug} style={{ background: 'var(--red-soft)', color: 'var(--red)', border: 'none' }}>
          {saving ? <span className="spinner" /> : <Icon name="x" size={16} />} Οριστική διαγραφή
        </button>
      </form>
    </Drawer>
  );
}
