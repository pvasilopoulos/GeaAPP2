import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Skeleton } from '../../components/ui.jsx';
import { MAP_PROVIDERS } from '../../lib/maps.js';

const inp = { width: '100%', height: 40, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 9 };
const chk = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, padding: '6px 0' };

export default function AppPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings-app'], queryFn: ({ signal }) => api.appSettings({ signal }) });
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { if (data?.settings) setF({ ...data.settings }); }, [data]);
  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((s) => ({ ...s, [k]: v }));
  };

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setMsg(''); setSaving(true);
    try {
      await api.updateAppSettings(f);
      qc.invalidateQueries({ queryKey: ['settings-app'] });
      qc.invalidateQueries({ queryKey: ['meta'] });
      setMsg('Αποθηκεύτηκε.');
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };

  if (isLoading || !f) return <div className="card card-pad"><Skeleton h={160} /></div>;

  return (
    <form className="card card-pad" onSubmit={submit} style={{ maxWidth: 640 }}>
      {err && <div className="auth-error">{err}</div>}
      {msg && <div className="voice-msg ok" style={{ marginBottom: 10 }}>{msg}</div>}
      <div className="section-title" style={{ marginTop: 0 }}>Προεπιλογές πελατών</div>
      <div className="field-group"><label>Προεπιλεγμένη χώρα</label><input style={inp} value={f.default_country} onChange={set('default_country')} /></div>
      <div className="field-group"><label>Προεπιλεγμένη κατάσταση νέου πελάτη</label>
        <select style={inp} value={f.default_customer_status} onChange={set('default_customer_status')}>
          <option value="active">Ενεργός</option>
          <option value="prospect">Υποψήφιος</option>
          <option value="inactive">Ανενεργός</option>
        </select>
      </div>
      <label style={chk}><input type="checkbox" checked={!!f.require_email} onChange={set('require_email')} /> Υποχρεωτικό email στον πελάτη</label>
      <label style={chk}><input type="checkbox" checked={!!f.strict_duplicates} onChange={set('strict_duplicates')} /> Αυστηρός έλεγχος διπλοεγγραφών (χωρίς «δημιουργία ούτως ή άλλως»)</label>
      <label style={chk}><input type="checkbox" checked={!!f.allow_vip} onChange={set('allow_vip')} /> Ενεργό VIP</label>

      <div className="section-title">Εμφάνιση</div>
      <div className="field-group"><label>Μορφή ημερομηνίας</label>
        <select style={inp} value={f.date_format} onChange={set('date_format')}>
          <option value="DD/MM/YYYY">ΗΗ/ΜΜ/ΕΕΕΕ</option>
          <option value="MM/DD/YYYY">MM/DD/YYYY</option>
          <option value="YYYY-MM-DD">YYYY-MM-DD</option>
        </select>
      </div>
      <div className="field-group"><label>Αρχή εβδομάδας</label>
        <select style={inp} value={String(f.week_starts_on)} onChange={(e) => setF((s) => ({ ...s, week_starts_on: Number(e.target.value) }))}>
          <option value="1">Δευτέρα</option>
          <option value="0">Κυριακή</option>
        </select>
      </div>
      <div className="field-group"><label>Προεπιλογή υπαγόρευσης</label>
        <select style={inp} value={f.voice_lang} onChange={set('voice_lang')}>
          <option value="el-GR">Ελληνικά</option>
          <option value="en-US">English</option>
        </select>
      </div>
      <div className="section-title">Χάρτες</div>
      <div className="field-group"><label>Άνοιγμα τοποθεσίας με</label>
        <select style={inp} value={f.map_provider || 'google'} onChange={set('map_provider')}>
          {MAP_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      <div className="field-group"><label>Google Maps API key</label>
        <input
          style={inp}
          type="password"
          value={f.google_maps_api_key || ''}
          onChange={set('google_maps_api_key')}
          placeholder={data?.settings?.has_google_maps_api_key ? '••••••••' : 'AIza…'}
          autoComplete="new-password"
        />
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: '-6px 0 12px' }}>
        Το κουμπί χάρτη στα υποκαταστήματα ανοίγει τον πάροχο που επιλέγετε. Το API key χρειάζεται μόνο για την ενσωματωμένη προεπισκόπηση Google Maps
        (Maps Embed API στο Google Cloud, περιορισμός HTTP referrer). Κενό πεδίο κρατά το αποθηκευμένο κλειδί.
      </p>
      <button className="btn btn-accent" disabled={saving} style={{ marginTop: 12 }}>{saving ? <span className="spinner" /> : <Icon name="check" size={16} />} Αποθήκευση</button>
    </form>
  );
}
