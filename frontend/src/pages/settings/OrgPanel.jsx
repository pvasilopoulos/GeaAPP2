import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Skeleton } from '../../components/ui.jsx';

const inp = { width: '100%', height: 40, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 9 };

export default function OrgPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings-org'], queryFn: ({ signal }) => api.orgSettings({ signal }) });
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { if (data?.tenant) setF({ ...data.tenant }); }, [data]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setMsg(''); setSaving(true);
    try {
      await api.updateOrgSettings({
        name: f.name, locale: f.locale, timezone: f.timezone, currency: f.currency,
        contact_email: f.contact_email, contact_phone: f.contact_phone, notes: f.notes,
      });
      qc.invalidateQueries({ queryKey: ['settings-org'] });
      setMsg('Αποθηκεύτηκε.');
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };

  if (isLoading || !f) return <div className="card card-pad"><Skeleton h={160} /></div>;

  return (
    <form className="card card-pad" onSubmit={submit} style={{ maxWidth: 640 }}>
      {err && <div className="auth-error">{err}</div>}
      {msg && <div className="voice-msg ok" style={{ marginBottom: 10 }}>{msg}</div>}
      <div className="field-group"><label>Επωνυμία οργανισμού</label><input style={inp} value={f.name} onChange={set('name')} required /></div>
      <div className="field-group"><label>Slug</label><input style={inp} value={f.slug} disabled /></div>
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
          <option value="EUR">EUR (€)</option><option value="USD">USD ($)</option><option value="GBP">GBP (£)</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="field-group" style={{ flex: 1 }}><label>Email επικοινωνίας</label><input style={inp} type="email" value={f.contact_email || ''} onChange={set('contact_email')} /></div>
        <div className="field-group" style={{ flex: 1 }}><label>Τηλέφωνο</label><input style={inp} value={f.contact_phone || ''} onChange={set('contact_phone')} /></div>
      </div>
      <div className="field-group"><label>Εσωτερικές σημειώσεις</label>
        <textarea rows={3} style={{ ...inp, height: 'auto', padding: 10 }} value={f.notes || ''} onChange={set('notes')} />
      </div>
      <button className="btn btn-accent" disabled={saving}>{saving ? <span className="spinner" /> : <Icon name="check" size={16} />} Αποθήκευση</button>
    </form>
  );
}
