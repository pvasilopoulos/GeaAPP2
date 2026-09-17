import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Skeleton } from '../../components/ui.jsx';
import { MAP_PROVIDERS } from '../../lib/maps.js';
import { isStandalone, promptInstall, refreshApp, subscribeInstallPrompt } from '../../lib/pwa.js';

const inp = { width: '100%', height: 40, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 9 };
const chk = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, padding: '6px 0' };

export default function AppPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings-app'], queryFn: ({ signal }) => api.appSettings({ signal }) });
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [canInstall, setCanInstall] = useState(false);
  const [pwaBusy, setPwaBusy] = useState(false);
  const [pwaMsg, setPwaMsg] = useState('');
  useEffect(() => { if (data?.settings) setF({ ...data.settings }); }, [data]);
  useEffect(() => subscribeInstallPrompt((ev) => setCanInstall(!!ev)), []);
  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((s) => ({ ...s, [k]: v }));
  };
  const setView = (group, key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((s) => ({ ...s, view_preferences: { ...s.view_preferences, [group]: { ...s.view_preferences?.[group], [key]: value } } }));
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
      <div className="settings-subsection">
        <div className="section-title">Προβολή καρτέλας πελάτη</div>
        <div className="muted settings-help">Ορίστε ποιες ενότητες εμφανίζονται και ποια ανοίγει πρώτη.</div>
        <div className="field-group"><label>Αρχικό tab</label>
          <select style={inp} value={f.view_preferences?.customer_profile?.default_tab || 'overview'} onChange={setView('customer_profile', 'default_tab')}>
            <option value="overview">Σύνοψη</option><option value="contacts">Επαφές</option><option value="branches">Υποκαταστήματα &amp; Χώροι</option><option value="bookings">Κρατήσεις</option><option value="activity">Δραστηριότητα</option>
          </select>
        </div>
        {[
          ['show_contacts', 'Εμφάνιση Επαφών'], ['show_branches', 'Εμφάνιση Υποκαταστημάτων & Χώρων'],
          ['show_bookings', 'Εμφάνιση Κρατήσεων'], ['show_payments', 'Εμφάνιση Πληρωμών'],
          ['show_communications', 'Εμφάνιση Επικοινωνιών'], ['show_documents', 'Εμφάνιση Εγγράφων'],
          ['show_notes', 'Εμφάνιση Σημειώσεων'], ['show_activity', 'Εμφάνιση Δραστηριότητας'],
          ['show_branch_actions', 'Εμφάνιση Ενεργειών ανά υποκατάστημα'], ['show_branch_invoices', 'Εμφάνιση Τιμολογίων ανά υποκατάστημα'],
        ].map(([key, label]) => <label style={chk} key={key}><input type="checkbox" checked={f.view_preferences?.customer_profile?.[key] !== false} onChange={setView('customer_profile', key)} /> {label}</label>)}
      </div>
      <div className="settings-subsection">
        <div className="section-title">Προβολή υποκαταστήματος</div>
        <div className="muted settings-help">Ελέγξτε τα blocks που εμφανίζονται μετά την επιλογή tile.</div>
        {[
          ['show_hours', 'Εμφάνιση ωραρίου'], ['show_map', 'Εμφάνιση χάρτη'],
          ['show_kpis', 'Εμφάνιση KPIs'], ['show_spaces', 'Εμφάνιση χώρων'],
          ['branch_expanded', 'Το detail υποκαταστήματος να ανοίγει αρχικά'], ['show_visits', 'Εμφάνιση πρόσφατων επισκέψεων'], ['spaces_expanded', 'Οι χώροι να εμφανίζονται expanded'],
          ['visits_expanded', 'Οι επισκέψεις να εμφανίζονται expanded'],
        ].map(([key, label]) => <label style={chk} key={key}><input type="checkbox" checked={f.view_preferences?.branch_detail?.[key] !== false} onChange={setView('branch_detail', key)} /> {label}</label>)}
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
          placeholder={data?.settings?.has_google_maps_api_key ? '••••••••' : 'AIzaSy...'}
          autoComplete="new-password"
        />
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: '-6px 0 12px' }}>
        Το κουμπί χάρτη στα υποκαταστήματα ανοίγει τον πάροχο που επιλέγετε. Το API key χρειάζεται μόνο για την ενσωματωμένη προεπισκόπηση Google Maps
        (Maps Embed API στο Google Cloud, περιορισμός HTTP referrer). Κενό πεδίο κρατά το αποθηκευμένο κλειδί.
      </p>

      <div className="section-title">Εφαρμογή συσκευής</div>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 12px' }}>
        {isStandalone()
          ? 'Η εφαρμογή τρέχει σε λειτουργία οθόνης (PWA). Το κουμπί ανανέωσης στην κορυφή ενημερώνει δεδομένα και cache.'
          : 'Για εμπειρία σαν native app, εγκαταστήστε το SpaceHub στην αρχική οθόνη. Στο κινητό κλειδώνει το rubber-band του browser· η ανανέωση γίνεται μόνο από το κουμπί στην κορυφή (ή εδώ).'}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {canInstall && (
          <button type="button" className="btn" onClick={() => promptInstall()}>
            <Icon name="download" size={16} /> Εγκατάσταση
          </button>
        )}
        <button
          type="button"
          className="btn"
          disabled={pwaBusy}
          onClick={async () => {
            setPwaBusy(true); setPwaMsg('');
            try {
              const r = await refreshApp(qc);
              if (!r.reloaded) setPwaMsg('Τα δεδομένα ανανεώθηκαν.');
            } catch (ex) { setPwaMsg(ex.message); }
            finally { setPwaBusy(false); }
          }}
        >
          {pwaBusy ? <span className="spinner" /> : <Icon name="refresh" size={16} />} Ανανέωση &amp; cache
        </button>
      </div>
      {pwaMsg && <div className="voice-msg ok" style={{ marginBottom: 10 }}>{pwaMsg}</div>}

      <button className="btn btn-accent" disabled={saving} style={{ marginTop: 12 }}>{saving ? <span className="spinner" /> : <Icon name="check" size={16} />} Αποθήκευση</button>
    </form>
  );
}
