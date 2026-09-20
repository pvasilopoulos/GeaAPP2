import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../Icon.jsx';
import { Drawer } from '../ui.jsx';
import RichTextEditor from './RichTextEditor.jsx';
import { FALLBACK_CAPS, channelMeta, recipientSuggestions, smsSegments } from '../../lib/channels.js';

const ta = {
  width: '100%', minHeight: 200, padding: '12px 14px', border: '1px solid var(--border-strong)',
  borderRadius: 10, fontFamily: 'inherit', fontSize: 14.5, lineHeight: 1.55, resize: 'vertical',
};

/** Rough plain-text length of editor HTML, for the counter and limit checks. */
function plainLength(html, isHtml) {
  if (!isHtml) return String(html || '').length;
  const withBreaks = String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-3]|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  const txt = withBreaks
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  return txt.trim().length;
}

function plainText(html, isHtml) {
  if (!isHtml) return String(html || '');
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-3]|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '<br>');
}

export default function MessageComposer({ customer, contacts = [], channelId, channelStatus, onClose, onSent }) {
  const qc = useQueryClient();
  const meta = channelMeta(channelId);
  const caps = channelStatus?.caps || FALLBACK_CAPS;
  const suggestions = useMemo(
    () => recipientSuggestions(channelId, customer, contacts),
    [channelId, customer, contacts]);

  const [to, setTo] = useState(suggestions[0]?.value || '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isHtml, setIsHtml] = useState(!!caps.richText);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    setTo(suggestions[0]?.value || '');
    setErr('');
    setMsg('');
  }, [channelId, suggestions]);

  // Switching channel must not silently drop what the user typed: markup is
  // flattened to plain text when the newly-selected channel can't carry it.
  const state = useRef({ body, isHtml });
  state.current = { body, isHtml };
  useEffect(() => {
    const cur = state.current;
    setPreview(false);
    if (!caps.richText && cur.isHtml) {
      setBody(plainText(cur.body, true));
      setIsHtml(false);
    }
  }, [channelId, caps]);

  const setFormat = (next) => {
    setPreview(false);
    setBody((b) => (next ? toHtml(plainText(b, false)) : plainText(b, true)));
    setIsHtml(next);
  };

  const enabled = channelStatus?.enabled !== false;
  const configured = !!channelStatus?.configured;
  const length = plainLength(body, isHtml);
  const overLimit = !!caps.maxLength && length > caps.maxLength;
  const segments = caps.encoding === 'gsm' ? smsSegments(plainText(body, isHtml)) : null;

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
        channel: channelId,
        to,
        subject: caps.subject ? subject : undefined,
        body,
        bodyFormat: isHtml ? 'html' : 'text',
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
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{meta.label}</b>
            <small>{meta.hint}</small>
          </div>
          <div className="msg-caps">
            {caps.richText && <span className="cap-chip">Μορφοποίηση</span>}
            {caps.subject && <span className="cap-chip">Θέμα</span>}
            {!caps.richText && !caps.subject && <span className="cap-chip dim">Απλό κείμενο</span>}
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

        {caps.subject && (
          <div className="field-group">
            <label>Θέμα</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Θέμα email" />
          </div>
        )}

        <div className="field-group" style={{ flex: 1, minHeight: 0 }}>
          <div className="msg-body-head">
            <label style={{ margin: 0 }}>Μήνυμα</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {caps.richText && (
                <label className="tpl-fmt">
                  <input type="checkbox" checked={isHtml} onChange={(e) => setFormat(e.target.checked)} />
                  Μορφοποίηση
                </label>
              )}
              {isHtml && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPreview((p) => !p)}
                  title="Προεπισκόπηση ως απλό κείμενο">
                  <Icon name="eye" size={14} /> {preview ? 'Επεξεργασία' : 'Απλό κείμενο'}
                </button>
              )}
            </div>
          </div>

          {isHtml && preview ? (
            <pre className="msg-preview">{plainText(body, true) || '—'}</pre>
          ) : isHtml ? (
            <RichTextEditor value={body} onChange={setBody} />
          ) : (
            <textarea style={ta} value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="Γράψτε το μήνυμα…" required />
          )}

          <div className={`msg-count${overLimit ? ' over' : ''}`}>
            {segments
              ? `${segments.units} χαρακτήρες · ${segments.segments} SMS · ${segments.unicode ? 'ελληνικά' : 'λατινικά'} ${segments.perSegment}/μήνυμα`
              : caps.maxLength ? `${length} / ${caps.maxLength}` : `${length} χαρακτήρες`}
          </div>
        </div>

        <div className="msg-editor-foot">
          <button type="button" className="btn" onClick={onClose}>Άκυρο</button>
          <button className="btn btn-accent" disabled={saving || !enabled || overLimit || !to.trim() || !length}>
            {saving ? <span className="spinner" /> : <Icon name="send" size={16} />} Αποστολή
          </button>
        </div>
      </form>
    </Drawer>
  );
}
