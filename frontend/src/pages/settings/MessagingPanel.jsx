import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Skeleton } from '../../components/ui.jsx';
import { MESSAGE_CHANNELS } from '../../lib/channels.js';

const inp = { width: '100%', height: 40, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 9 };
const chk = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, padding: '4px 0' };

function blankFrom(data) {
  const out = {};
  for (const ch of MESSAGE_CHANNELS) {
    out[ch.id] = { ...(data?.[ch.id] || { enabled: true }) };
  }
  return out;
}

export default function MessagingPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['settings-messaging'],
    queryFn: ({ signal }) => api.messagingSettings({ signal }),
  });
  const [f, setF] = useState(null);
  const [open, setOpen] = useState('email');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { if (data?.messaging) setF(blankFrom(data.messaging)); }, [data]);

  const setCh = (ch, k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((s) => ({ ...s, [ch]: { ...s[ch], [k]: v } }));
  };

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setMsg(''); setSaving(true);
    try {
      const payload = {};
      for (const ch of MESSAGE_CHANNELS) {
        const row = { ...f[ch] };
        delete row.configured;
        delete row.has_smtp_pass;
        delete row.has_api_key;
        delete row.has_auth_token;
        delete row.has_bot_token;
        payload[ch.id] = row;
      }
      await api.updateMessagingSettings(payload);
      qc.invalidateQueries({ queryKey: ['settings-messaging'] });
      qc.invalidateQueries({ queryKey: ['messaging-channels'] });
      setMsg('Αποθηκεύτηκε.');
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };

  if (isLoading || !f) return <div className="card card-pad"><Skeleton h={180} /></div>;

  return (
    <form onSubmit={submit} className="stack" style={{ maxWidth: 680 }}>
      {err && <div className="auth-error">{err}</div>}
      {msg && <div className="voice-msg ok">{msg}</div>}
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        Ενεργοποιήστε κανάλια και συμπληρώστε διαπιστευτήρια. Χωρίς κλειδιά API τα μηνύματα καταχωρούνται στο ιστορικό του πελάτη.
      </p>
      {MESSAGE_CHANNELS.map((ch) => {
        const row = f[ch.id] || {};
        const stored = data?.messaging?.[ch.id] || {};
        return (
          <div key={ch.id} className={`card channel-card${open === ch.id ? ' open' : ''}`}>
            <button type="button" className="channel-card-h" onClick={() => setOpen((o) => o === ch.id ? '' : ch.id)}>
              <span className="msg-ch-ico" style={{ background: `${ch.color}18`, color: ch.color }}>
                <Icon name={ch.icon} size={16} />
              </span>
              <span style={{ flex: 1, textAlign: 'left' }}>
                <b>{ch.label}</b>
                <small className="muted" style={{ display: 'block', fontSize: 12 }}>{ch.hint}</small>
              </span>
              <span className={`badge ${row.enabled ? 'badge-active' : 'badge-inactive'}`}>
                {row.enabled ? 'Ενεργό' : 'Ανενεργό'}
              </span>
              <Icon name={open === ch.id ? 'chevronUp' : 'chevronDown'} size={16} />
            </button>
            {open === ch.id && (
              <div className="channel-card-b">
                <label style={chk}>
                  <input type="checkbox" checked={!!row.enabled} onChange={setCh(ch.id, 'enabled')} />
                  Ενεργό κανάλι στην «Αποστολή μηνύματος»
                </label>
                {ch.id === 'email' && (
                  <>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div className="field-group" style={{ flex: 1 }}><label>Όνομα αποστολέα</label>
                        <input style={inp} value={row.from_name || ''} onChange={setCh('email', 'from_name')} /></div>
                      <div className="field-group" style={{ flex: 1 }}><label>From email</label>
                        <input style={inp} type="email" value={row.from_email || ''} onChange={setCh('email', 'from_email')} placeholder="noreply@example.gr" /></div>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div className="field-group" style={{ flex: 2 }}><label>SMTP host</label>
                        <input style={inp} value={row.smtp_host || ''} onChange={setCh('email', 'smtp_host')} placeholder="smtp.example.com" /></div>
                      <div className="field-group" style={{ width: 110 }}><label>Πόρτα</label>
                        <input style={inp} type="number" value={row.smtp_port || 587} onChange={setCh('email', 'smtp_port')} /></div>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div className="field-group" style={{ flex: 1 }}><label>SMTP χρήστης</label>
                        <input style={inp} value={row.smtp_user || ''} onChange={setCh('email', 'smtp_user')} autoComplete="off" /></div>
                      <div className="field-group" style={{ flex: 1 }}><label>SMTP κωδικός</label>
                        <input style={inp} type="password" value={row.smtp_pass || ''} onChange={setCh('email', 'smtp_pass')}
                          placeholder={stored.has_smtp_pass ? '••••••••' : ''} autoComplete="new-password" /></div>
                    </div>
                    <label style={chk}>
                      <input type="checkbox" checked={!!row.smtp_secure} onChange={setCh('email', 'smtp_secure')} />
                      SSL/TLS (συνήθως πόρτα 465)
                    </label>
                  </>
                )}
                {ch.id === 'viber' && (
                  <>
                    <div className="field-group"><label>Όνομα αποστολέα</label>
                      <input style={inp} value={row.sender_name || ''} onChange={setCh('viber', 'sender_name')} /></div>
                    <div className="field-group"><label>Auth token</label>
                      <input style={inp} type="password" value={row.auth_token || ''} onChange={setCh('viber', 'auth_token')}
                        placeholder={stored.has_auth_token ? '••••••••' : ''} autoComplete="new-password" /></div>
                  </>
                )}
                {ch.id === 'sms' && (
                  <>
                    <div className="field-group"><label>Sender ID</label>
                      <input style={inp} value={row.sender_id || ''} onChange={setCh('sms', 'sender_id')} placeholder="SpaceHub" /></div>
                    <div className="field-group"><label>API URL</label>
                      <input style={inp} value={row.api_url || ''} onChange={setCh('sms', 'api_url')} placeholder="https://sms.provider/send" /></div>
                    <div className="field-group"><label>API key</label>
                      <input style={inp} type="password" value={row.api_key || ''} onChange={setCh('sms', 'api_key')}
                        placeholder={stored.has_api_key ? '••••••••' : ''} autoComplete="new-password" /></div>
                  </>
                )}
                {ch.id === 'telegram' && (
                  <>
                    <div className="field-group"><label>Bot username</label>
                      <input style={inp} value={row.bot_username || ''} onChange={setCh('telegram', 'bot_username')} placeholder="@my_bot" /></div>
                    <div className="field-group"><label>Bot token</label>
                      <input style={inp} type="password" value={row.bot_token || ''} onChange={setCh('telegram', 'bot_token')}
                        placeholder={stored.has_bot_token ? '••••••••' : ''} autoComplete="new-password" /></div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
      <button className="btn btn-accent" disabled={saving} style={{ alignSelf: 'flex-start' }}>
        {saving ? <span className="spinner" /> : <Icon name="check" size={16} />} Αποθήκευση
      </button>
    </form>
  );
}
