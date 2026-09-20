import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Skeleton } from '../../components/ui.jsx';
import { pushSupported, pushPermission, currentPushSubscription, subscribePush, unsubscribePush } from '../../lib/push.js';
import { isIosDevice, isStandalone } from '../../lib/pwa.js';

const card = { border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: '#fff', maxWidth: 560 };

const CHANNEL_LABELS = { app: 'Εφαρμογή', email: 'Email', sms: 'SMS', viber: 'Viber', telegram: 'Telegram' };

/** Per-event × per-channel opt-out matrix on top of whatever an admin rule already allows, plus the user's own contact channels for SMS/Viber/Telegram. */
function MyNotificationPreferences() {
  const qc = useQueryClient();
  const prefsQ = useQuery({ queryKey: ['my-notification-preferences'], queryFn: () => api.myNotificationPreferences() });
  const [contact, setContact] = useState({ phone: '', telegramChatId: '' });
  const [savedMsg, setSavedMsg] = useState('');

  const overridesMap = new Map((prefsQ.data?.overrides || []).map((o) => [`${o.eventKey}:${o.channel}`, o.enabled]));

  const saveMut = useMutation({
    mutationFn: (overrides) => api.saveMyNotificationPreferences(overrides),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-notification-preferences'] }); setSavedMsg('Αποθηκεύτηκε'); setTimeout(() => setSavedMsg(''), 2000); },
  });
  const contactMut = useMutation({
    mutationFn: (payload) => api.saveMyNotificationContact(payload),
    onSuccess: () => { setSavedMsg('Αποθηκεύτηκε'); setTimeout(() => setSavedMsg(''), 2000); },
  });

  function toggle(eventKey, channel, current) {
    saveMut.mutate([{ eventKey, channel, enabled: !current }]);
  }

  if (prefsQ.isLoading) return <div style={card}><Skeleton h={140} /></div>;

  const events = prefsQ.data?.events || [];
  const channels = prefsQ.data?.channels || [];

  return (
    <div style={{ ...card, maxWidth: 720 }}>
      <b>Οι ειδοποιήσεις μου</b>
      <div className="muted" style={{ fontSize: 13, marginTop: 2, marginBottom: 12 }}>
        Απενεργοποίησε συγκεκριμένα κανάλια για κάθε τύπο ειδοποίησης — ισχύει πάνω σε ό,τι έχει ήδη ενεργοποιήσει ο διαχειριστής.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Γεγονός</th>
              {channels.map((ch) => <th key={ch} style={{ padding: '6px 8px' }}>{CHANNEL_LABELS[ch] || ch}</th>)}
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.key} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px' }} title={ev.description}>{ev.label}</td>
                {channels.map((ch) => {
                  const key = `${ev.key}:${ch}`;
                  const enabled = overridesMap.has(key) ? overridesMap.get(key) : true;
                  return (
                    <td key={ch} style={{ textAlign: 'center', padding: '6px 8px' }}>
                      <input type="checkbox" checked={enabled} onChange={() => toggle(ev.key, ch, enabled)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <b style={{ fontSize: 13.5 }}>Στοιχεία επικοινωνίας για SMS / Viber / Telegram</b>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
          <label style={{ display: 'grid', gap: 4, flex: '1 1 200px' }}>
            <span style={{ fontSize: 12.5 }}>Κινητό τηλέφωνο (SMS / Viber)</span>
            <input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="69XXXXXXXX" />
          </label>
          <label style={{ display: 'grid', gap: 4, flex: '1 1 200px' }}>
            <span style={{ fontSize: 12.5 }}>Telegram chat id</span>
            <input value={contact.telegramChatId} onChange={(e) => setContact({ ...contact, telegramChatId: e.target.value })} placeholder="π.χ. 123456789" />
          </label>
        </div>
        <button type="button" className="btn ghost" style={{ marginTop: 8 }} disabled={contactMut.isPending} onClick={() => contactMut.mutate(contact)}>
          Αποθήκευση στοιχείων επικοινωνίας
        </button>
      </div>
      {savedMsg && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--success, #16a34a)' }}>{savedMsg}</div>}
    </div>
  );
}

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

  const sendTest = async () => {
    setBusy(true); setMsg(''); setErr('');
    try {
      const result = await api.pushTest();
      if (result.sent > 0) setMsg(`Στάλθηκε δοκιμαστική ειδοποίηση (${result.sent} συσκευή/ές). Αν δεν εμφανιστεί, έλεγξε τις ειδοποιήσεις του browser/κινητού.`);
      else setErr('Ο server δεν κατάφερε να στείλει την ειδοποίηση σε καμία συσκευή — δες τα logs (αναζήτησε "[push]").');
    } catch (e) {
      setErr(e.message || 'Κάτι πήγε στραβά');
    } finally { setBusy(false); }
  };

  if (keyLoading || subscribed === null) return <div style={card}><Skeleton h={90} /></div>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
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
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn ${subscribed ? 'btn-secondary' : 'btn-primary'}`}
                disabled={busy || permission === 'denied'}
                onClick={subscribed ? disable : enable}
              >
                {busy ? 'Παρακαλώ περιμένετε…' : subscribed ? 'Απενεργοποίηση' : 'Ενεργοποίηση ειδοποιήσεων'}
              </button>
              {subscribed && (
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={sendTest}>
                  Αποστολή δοκιμαστικής ειδοποίησης
                </button>
              )}
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
    <MyNotificationPreferences />
    </div>
  );
}
