import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Skeleton } from '../../components/ui.jsx';
import { useAuth } from '../../store/auth.js';
import { PERMS } from '../../lib/perms.js';

const inp = { width: '100%', height: 40, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 9 };
const chk = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, padding: '6px 0' };

export default function SecurityPanel() {
  const hasPerm = useAuth((s) => s.hasPerm);
  const isPlatform = hasPerm(PERMS.TENANTS_PLATFORM);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['settings-platform'],
    queryFn: ({ signal }) => api.platformSettings({ signal }),
    enabled: isPlatform,
  });
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { if (data?.settings) setF({ ...data.settings }); }, [data]);

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setMsg(''); setSaving(true);
    try {
      await api.updatePlatformSettings(f);
      qc.invalidateQueries({ queryKey: ['settings-platform'] });
      setMsg('Αποθηκεύτηκε.');
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <div className="card card-pad">
        <div className="section-title" style={{ marginTop: 0 }}>Πρόσβαση οργανισμού</div>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
          Οι χρήστες συνδέονται μόνο στον δικό τους tenant. Η αναστολή οργανισμού γίνεται από την ενότητα Tenants.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
          <li>Κάθε email είναι μοναδικό σε όλη την πλατφόρμα.</li>
          <li>Ο ρόλος Ιδιοκτήτη κρατά πάντα όλα τα δικαιώματα του οργανισμού.</li>
          <li>Διαγραφή tenant απαιτεί πληκτρολόγηση του slug.</li>
        </ul>
      </div>

      {isPlatform && (
        isLoading || !f ? <div className="card card-pad"><Skeleton h={80} /></div> : (
          <form className="card card-pad" onSubmit={submit}>
            {err && <div className="auth-error">{err}</div>}
            {msg && <div className="voice-msg ok" style={{ marginBottom: 10 }}>{msg}</div>}
            <div className="section-title" style={{ marginTop: 0 }}>Πλατφόρμα</div>
            <div className="field-group"><label>Όνομα εφαρμογής στη σελίδα σύνδεσης</label>
              <input style={inp} maxLength={60} value={f.app_name || ''} placeholder="SpaceHub"
                onChange={(e) => setF((s) => ({ ...s, app_name: e.target.value }))} />
            </div>
            <label style={chk}>
              <input type="checkbox" checked={!!f.allow_self_register} onChange={(e) => setF((s) => ({ ...s, allow_self_register: e.target.checked }))} />
              Επιτρέπεται δημόσια εγγραφή νέου οργανισμού
            </label>
            <div className="field-group"><label>Ελάχιστο μήκος κωδικού</label>
              <input style={inp} type="number" min={6} max={32} value={f.min_password_length || 6}
                onChange={(e) => setF((s) => ({ ...s, min_password_length: Number(e.target.value) }))} />
            </div>
            <button className="btn btn-accent" disabled={saving}>{saving ? <span className="spinner" /> : <Icon name="check" size={16} />} Αποθήκευση</button>
          </form>
        )
      )}
    </div>
  );
}
