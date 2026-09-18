import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../Icon.jsx';
import { Drawer } from '../ui.jsx';
import { channelMeta, recipientSuggestions } from '../../lib/channels.js';

const ta = {
  width: '100%', minHeight: 220, padding: '12px 14px', border: '1px solid var(--border-strong)',
  borderRadius: 10, fontFamily: 'inherit', fontSize: 14.5, lineHeight: 1.55, resize: 'vertical',
};

export default function MessageComposer({ customer, contacts = [], channelId, channelStatus, onClose, onSent }) {
  const qc = useQueryClient();
  const meta = channelMeta(channelId);
  const suggestions = useMemo(
    () => recipientSuggestions(channelId, customer, contacts),
    [channelId, customer, contacts]);
  const [to, setTo] = useState(suggestions[0]?.value || '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setTo(suggestions[0]?.value || '');
    setSubject('');
    setBody('');
    setErr('');
    setMsg('');
  }, [channelId, suggestions]);

  const enabled = channelStatus?.enabled !== false;
  const configured = !!channelStatus?.configured;
  const count = body.length;
  const limit = channelId === 'sms' ? 160 : channelId === 'email' ? 0 : 4096;

  const send = async (e) => {
    e.preventDefault();
    setErr(''); setMsg('');
    if (!enabled) {
      setErr('Το κανάλι είναι απενεργοποιημένο. Ενεργοποιήστε το στις Ρυθμίσεις → Μηνύματα.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.sendCustomerMessage(customer.id, {
        channel: channelId, to, subject: channelId === 'email' ? subject : undefined, body,
      });
      qc.invalidateQueries({ queryKey: ['history', 'communications', customer.id] });
      qc.invalidateQueries({ queryKey: ['history', 'activity', customer.id] });
      const st = res.delivery?.status;
      const detail = res.delivery?.detail;
      if (st === 'failed') setErr(detail || 'Η αποστολή απέτυχε — καταχωρήθηκε στο ιστορικό.');
      else setMsg(st === 'sent' ? 'Το μήνυμα στάλθηκε.' : (detail || 'Καταχωρήθηκε στο ιστορικό επικοινωνιών.'));
      onSent?.(res);
      if (st !== 'failed') setTimeout(() => onClose(), 650);
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };

  return (
    <Drawer wide title="Επεξεργαστής μηνύματος" subtitle={`${meta.label} · ${customer.full_name}`} onClose={onClose}>
      <form className="msg-editor" onSubmit={send}>
        <div className="msg-editor-channel" style={{ '--ch': meta.color }}>
          <span className="msg-ch-ico"><Icon name={meta.icon} size={16} /></span>
          <div>
            <b>{meta.label}</b>
            <small>{meta.hint}</small>
          </div>
        </div>

        {!enabled && (
          <div className="auth-error">Το κανάλι είναι απενεργοποιημένο. Ενεργοποιήστε το στις Ρυθμίσεις → Μηνύματα.</div>
        )}
        {enabled && !configured && (
          <div className="msg-banner">Χωρίς διαπιστευτήρια — το μήνυμα θα καταχωρηθεί στο ιστορικό επικοινωνιών. Ρυθμίστε το κανάλι στις Ρυθμίσεις → Μηνύματα για ζωντανή αποστολή.</div>
        )}
        {err && <div className="auth-error">{err}</div>}
        {msg && <div className="voice-msg ok" style={{ marginBottom: 10 }}>{msg}</div>}

        <div className="field-group">
          <label>Προς</label>
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={meta.placeholder} required />
          {suggestions.length > 1 && (
            <div className="msg-chips">
              {suggestions.map((s) => (
                <button key={s.value} type="button" className={`msg-chip${s.value === to ? ' on' : ''}`}
                  onClick={() => setTo(s.value)}>
                  {s.label} · {s.value}
                </button>
              ))}
            </div>
          )}
        </div>

        {channelId === 'email' && (
          <div className="field-group">
            <label>Θέμα</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Θέμα email" />
          </div>
        )}

        <div className="field-group" style={{ flex: 1 }}>
          <label>Μήνυμα</label>
          <textarea style={ta} value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="Γράψτε το μήνυμα…" required />
          <div className="msg-count">
            {limit ? `${count} / ${limit}` : `${count} χαρακτήρες`}
          </div>
        </div>

        <div className="msg-editor-foot">
          <button type="button" className="btn" onClick={onClose}>Άκυρο</button>
          <button className="btn btn-accent" disabled={saving || !enabled || !to.trim() || !body.trim()}>
            {saving ? <span className="spinner" /> : <Icon name="send" size={16} />} Αποστολή
          </button>
        </div>
      </form>
    </Drawer>
  );
}
