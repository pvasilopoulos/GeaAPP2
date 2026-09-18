import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Skeleton } from '../../components/ui.jsx';
import { pushSupported, pushPermission, currentPushSubscription, subscribePush, unsubscribePush } from '../../lib/push.js';
import { isIosDevice, isStandalone } from '../../lib/pwa.js';

const card = { border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: '#fff', maxWidth: 560 };

export default function NotificationsPanel() {
  const qc = useQueryClient();
  const { data: keyData, isLoading: keyLoading } = useQuery({
    queryKey: ['push-public-key'],
    queryFn: ({ signal }) => api.pushPublicKey({ signal }),
  });
  const [subscribed, setSubscribed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    currentPushSubscription().then((sub) => { if (alive) setSubscribed(!!sub); }).catch(() => { if (alive) setSubscribed(false); });
    return () => { alive = false; };
  }, []);

  const supported = pushSupported();
  const permission = pushPermission();
  const serverConfigured = !!keyData?.publicKey;
  const iosNotInstalled = isIosDevice() && !isStandalone();

  const enable = async () => {
    setBusy(true); setMsg(''); setErr('');
    try {
      const result = await subscribePush(keyData?.publicKey);
      if (!result.ok) {
        setErr(result.reason === 'denied'
          ? 'Το πρόγραμμα περιήγησης μπλόκαρε τις ειδοποιήσεις για αυτή τη σελίδα. Επίτρεψέ τις από τις ρυθμίσεις του browser.'
          : 'Δεν ήταν δυνατή η ενεργοποίηση σε αυτή τη συσκευή.');
        return;
      }
      await api.pushSubscribe(result.subscription);
      setSubscribed(true);
      setMsg('Οι ειδοποιήσεις ενεργοποιήθηκαν για αυτή τη συσκευή.');
      qc.invalidateQueries({ queryKey: ['push-status'] });
    } catch (e) {
      setErr(e.message || 'Κάτι πήγε στραβά');
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true); setMsg(''); setErr('');
    try {
      const result = await unsubscribePush();
      if (result.endpoint) await api.pushUnsubscribe(result.endpoint).catch(() => {});
      setSubscribed(false);
      setMsg('Οι ειδοποιήσεις απενεργοποιήθηκαν για αυτή τη συσκευή.');
    } catch (e) {
      setErr(e.message || 'Κάτι πήγε στραβά');
    } finally { setBusy(false); }
  };

  if (keyLoading || subscribed === null) return <div style={card}><Skeleton h={90} /></div>;

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center',
          background: subscribed ? 'var(--accent-soft, #eef2ff)' : '#f3f4f6', color: subscribed ? 'var(--accent, #4f46e5)' : '#6b7280',
        }}
        >
          <Icon name="bell" size={19} />
        </div>
        <div style={{ flex: 1 }}>
          <b>Ειδοποιήσεις σε αυτή τη συσκευή</b>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            Λαμβάνεις push ειδοποίηση (εκτός εφαρμογής, όπως SMS) για ό,τι θα έβλεπες στο κουδουνάκι — εκπρόθεσμες υπενθυμίσεις, λήξεις προσφορών και αποτυχίες ERP sync.
          </div>

          {!supported && (
            <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
              Αυτό το πρόγραμμα περιήγησης δεν υποστηρίζει push ειδοποιήσεις.
            </div>
          )}
          {supported && !serverConfigured && (
            <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
              Οι push ειδοποιήσεις δεν έχουν ρυθμιστεί ακόμα στον server (λείπουν τα VAPID κλειδιά).
            </div>
          )}
          {supported && serverConfigured && iosNotInstalled && (
            <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
              Σε iPhone/iPad, πρόσθεσε πρώτα την εφαρμογή στην Αρχική Οθόνη (Κοινοποίηση → «Προσθήκη στην Αρχική οθόνη») και άνοιξέ την από εκεί.
            </div>
          )}

          {supported && serverConfigured && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                className={`btn ${subscribed ? 'btn-secondary' : 'btn-primary'}`}
                disabled={busy || permission === 'denied'}
                onClick={subscribed ? disable : enable}
              >
                {busy ? 'Παρακαλώ περιμένετε…' : subscribed ? 'Απενεργοποίηση' : 'Ενεργοποίηση ειδοποιήσεων'}
              </button>
              {permission === 'denied' && (
                <span className="muted" style={{ fontSize: 12.5 }}>
                  Έχεις μπλοκάρει τις ειδοποιήσεις για αυτή τη σελίδα από τον browser.
                </span>
              )}
            </div>
          )}

          {msg && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--success, #16a34a)' }}>{msg}</div>}
          {err && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--danger, #dc2626)' }}>{err}</div>}
        </div>
      </div>
    </div>
  );
}
