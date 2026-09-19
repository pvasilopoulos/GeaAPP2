import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Skeleton } from '../../components/ui.jsx';
import { MAP_PROVIDERS } from '../../lib/maps.js';
import { currentInstallMode, isStandalone, prepareInstall, refreshApp, subscribeInstallPrompt } from '../../lib/pwa.js';

const inp = { width: '100%', height: 40, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 9 };
const chk = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, padding: '6px 0' };

const BRANDING_IMAGE_MAX_BYTES = 260 * 1024; // keep the tenant settings JSON column small

const LOGO_FIELDS = [
  { key: 'logo_url', label: 'Λογότυπο εφαρμογής', hint: 'Εμφανίζεται στην πλαϊνή στήλη. Τετράγωνο ή διαφανές PNG/SVG συνιστάται.' },
  { key: 'favicon_url', label: 'Favicon', hint: 'Εικονίδιο καρτέλας browser. Τετράγωνο, τουλάχιστον 32×32px.' },
  { key: 'apple_touch_icon_url', label: 'Εικονίδιο iOS (Apple touch icon)', hint: 'Εμφανίζεται όταν προστίθεται στην αρχική οθόνη iPhone/iPad. 180×180px, χωρίς διαφάνεια.' },
  { key: 'pwa_icon_192', label: 'Εικονίδιο PWA 192×192', hint: 'Εικονίδιο εγκατεστημένης εφαρμογής (μικρό μέγεθος).' },
  { key: 'pwa_icon_512', label: 'Εικονίδιο PWA 512×512', hint: 'Εικονίδιο εγκατεστημένης εφαρμογής (μεγάλο μέγεθος, splash screen).' },
  { key: 'push_icon_url', label: 'Εικονίδιο ειδοποιήσεων (push)', hint: 'Έγχρωμο εικονίδιο μέσα στην ειδοποίηση. 192×192px.' },
  { key: 'push_badge_url', label: 'Badge ειδοποιήσεων (push)', hint: 'Μονόχρωμη σιλουέτα με διαφανές φόντο (μόνο λευκό + διαφάνεια) — το Android το δείχνει στη γραμμή κατάστασης. 96×96px.' },
];

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Αποτυχία ανάγνωσης αρχείου'));
    reader.readAsDataURL(file);
  });
}

function LogoField({ field, value, onChange, onError }) {
  const inputId = `branding-${field.key}`;
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    onError('');
    if (!/^image\//.test(file.type)) { onError(`${field.label}: επιτρέπονται μόνο εικόνες.`); return; }
    if (file.size > BRANDING_IMAGE_MAX_BYTES) { onError(`${field.label}: η εικόνα ξεπερνά τα ${Math.round(BRANDING_IMAGE_MAX_BYTES / 1024)}KB.`); return; }
    try { onChange(await fileToDataUrl(file)); } catch (ex) { onError(ex.message); }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{
        width: 46, height: 46, borderRadius: 9, border: '1px solid var(--border-strong)',
        display: 'grid', placeItems: 'center', overflow: 'hidden', flexShrink: 0, background: '#fff',
      }}>
        {value ? <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Icon name="file" size={18} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{field.label}</div>
        <div className="muted" style={{ fontSize: 12 }}>{field.hint}</div>
      </div>
      <label htmlFor={inputId} className="btn" style={{ cursor: 'pointer' }}>
        <Icon name="download" size={15} style={{ transform: 'rotate(180deg)' }} /> Επιλογή
      </label>
      <input id={inputId} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={handleFile} />
      {value && (
        <button type="button" className="btn btn-ghost" onClick={() => onChange('')} title="Επαναφορά προεπιλογής">
          <Icon name="x" size={15} />
        </button>
      )}
    </div>
  );
}

export default function AppPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings-app'], queryFn: ({ signal }) => api.appSettings({ signal }) });
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [installMode, setInstallMode] = useState(() => currentInstallMode());
  const [pwaBusy, setPwaBusy] = useState(false);
  const [pwaMsg, setPwaMsg] = useState('');
  useEffect(() => { if (data?.settings) setF({ ...data.settings }); }, [data]);
  useEffect(() => subscribeInstallPrompt(() => setInstallMode(currentInstallMode())), []);
  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((s) => ({ ...s, [k]: v }));
  };
  const setView = (group, key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((s) => ({ ...s, view_preferences: { ...s.view_preferences, [group]: { ...s.view_preferences?.[group], [key]: value } } }));
  };
  const [brandingErr, setBrandingErr] = useState('');
  const setBranding = (key) => (value) => setF((s) => ({ ...s, branding: { ...s.branding, [key]: value } }));

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
      <div className="section-title">Branding εφαρμογής</div>
      <div className="field-group"><label>Όνομα εφαρμογής</label>
        <input style={inp} value={f.app_name || ''} onChange={set('app_name')} placeholder="SpaceHub" />
      </div>
      <div className="field-group"><label>Τίτλος καρτέλας browser</label>
        <input style={inp} value={f.browser_tab_title || ''} onChange={set('browser_tab_title')} placeholder="SpaceHub — Διαχείριση Πελατών" />
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: '-6px 0 12px' }}>
        Αυτά τα πεδία αλλάζουν τον τίτλο της καρτέλας του browser, το κείμενο branding μέσα στην εφαρμογή (π.χ. πλαϊνή στήλη) και το όνομα
        που εμφανίζεται στην εγκατεστημένη εφαρμογή (PWA — αρχική οθόνη/app switcher, αφού αντικαταστήσεις μια ήδη εγκατεστημένη έκδοση). Είναι
        ξεχωριστά από την «Επωνυμία οργανισμού» (Ρυθμίσεις → Οργανισμός), η οποία αφορά τον ίδιο τον οργανισμό/tenant. Κενό πεδίο επαναφέρει την προεπιλογή «SpaceHub».
      </p>

      <div className="section-title">Λογότυπα &amp; εικονίδια</div>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 8px' }}>
        Ανεβάστε τα δικά σας εικονίδια για να αντικαταστήσετε τα προεπιλεγμένα σε κάθε σημείο της εφαρμογής: πλαϊνή στήλη, καρτέλα browser
        (favicon), οθόνη iOS, εγκατεστημένη εφαρμογή (PWA) και ειδοποιήσεις push. Το λογότυπο εφαρμόζεται αμέσως· τα υπόλοιπα (favicon, PWA,
        push) ενημερώνονται με την επόμενη σύνδεση/επανεκκίνηση της εφαρμογής στη συσκευή. Κενό πεδίο επαναφέρει την προεπιλογή.
      </p>
      {brandingErr && <div className="auth-error" style={{ marginBottom: 8 }}>{brandingErr}</div>}
      <div style={{ marginBottom: 12 }}>
        {LOGO_FIELDS.map((field) => (
          <LogoField
            key={field.key}
            field={field}
            value={f.branding?.[field.key] || ''}
            onChange={setBranding(field.key)}
            onError={setBrandingErr}
          />
        ))}
      </div>
      <div className="field-group"><label>Χρώμα θέματος (theme color)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="color" value={f.branding?.theme_color || '#4f46e5'} onChange={(e) => setBranding('theme_color')(e.target.value)} style={{ width: 44, height: 36, padding: 2, border: '1px solid var(--border-strong)', borderRadius: 8 }} />
          <input style={inp} value={f.branding?.theme_color || ''} onChange={(e) => setBranding('theme_color')(e.target.value)} placeholder="#4f46e5" />
        </div>
      </div>
      <div className="field-group"><label>Χρώμα φόντου (PWA splash)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="color" value={f.branding?.background_color || '#f6f7f9'} onChange={(e) => setBranding('background_color')(e.target.value)} style={{ width: 44, height: 36, padding: 2, border: '1px solid var(--border-strong)', borderRadius: 8 }} />
          <input style={inp} value={f.branding?.background_color || ''} onChange={(e) => setBranding('background_color')(e.target.value)} placeholder="#f6f7f9" />
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: '-6px 0 12px' }}>
        Το χρώμα θέματος χρησιμοποιείται από τον browser (γραμμή διευθύνσεων σε κινητά) και ως χρώμα φόντου του εικονιδίου PWA. Το χρώμα
        φόντου εμφανίζεται στην οθόνη εκκίνησης (splash screen) της εγκατεστημένης εφαρμογής.
      </p>

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
          ? 'Τρέχει ως εγκατεστημένη εφαρμογή (δικό της παράθυρο, χωρίς τη γραμμή του browser). Το κουμπί ανανέωσης ενημερώνει δεδομένα και cache.'
          : installMode === 'insecure'
            ? 'Η εγκατάσταση ως εφαρμογή απαιτεί HTTPS. Σε HTTP ο browser δίνει μόνο συντόμευση που ανοίγει καρτέλα.'
            : installMode === 'ios-other'
              ? 'Στο iPhone/iPad ανοίξτε το SpaceHub στο Safari και επιλέξτε Κοινοποίηση → Προσθήκη στην οθόνη Αφετηρίας. Το Chrome εκεί δημιουργεί μόνο συντόμευση.'
              : installMode === 'ios-safari'
                ? 'Safari: Κοινοποίηση → Προσθήκη στην οθόνη Αφετηρίας. Έτσι ανοίγει ως εφαρμογή, όχι ως σελιδοδείκτης.'
                : 'Εγκαταστήστε το ως εφαρμογή (Install app / Εγκατάσταση), όχι ως «Δημιουργία συντόμευσης». Η εφαρμογή ανοίγει σε δικό της παράθυρο με εικονίδιο στο μενού της συσκευής.'}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {!isStandalone() && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              void prepareInstall().then((r) => {
                setInstallMode(currentInstallMode());
                if (r.status === 'accepted') setPwaMsg('Η εφαρμογή εγκαταστάθηκε.');
                else if (r.status === 'dismissed') setPwaMsg('Η εγκατάσταση ακυρώθηκε.');
                else if (r.status === 'insecure') setPwaMsg('Χρειάζεται HTTPS ή localhost.');
                else setPwaMsg(r.error || 'Χρησιμοποιήστε το εικονίδιο εγκατάστασης στη γραμμή διευθύνσεων, ή ⋮ → Εγκατάσταση εφαρμογής.');
              });
            }}
          >
            <Icon name="download" size={16} /> Εγκατάσταση εφαρμογής
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
