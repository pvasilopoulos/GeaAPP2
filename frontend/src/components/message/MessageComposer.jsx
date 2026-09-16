import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../Icon.jsx';
import { Drawer } from '../ui.jsx';
import RichTextEditor from './RichTextEditor.jsx';
import { FALLBACK_CAPS, channelMeta, recipientSuggestions, smsSegments } from '../../lib/channels.js';

const ta = {
  width: '100%', minHeight: 200, padding: '12px 14px', border: '1px solid var(--border-strong)',
  borderRadius: 10, fontFamily: 'inherit', fontSize: 14.5, lineHeight: 1.55, resize: 'vertical',
};

function formatBytes(n) {
  const kb = Number(n || 0) / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

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

function TemplatePicker({ channelId, templates, onPick, busy }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  // A template with no channel fits everywhere; otherwise it must match.
  const usable = templates.filter((t) => t.active && (!t.channel || t.channel === channelId));
  if (!usable.length) return null;
  return (
    <div className="msg-menu-wrap" ref={ref}>
      <button type="button" className="btn btn-sm" onClick={() => setOpen((o) => !o)} disabled={busy}>
        {busy ? <span className="spinner" /> : <Icon name="copy" size={14} />} Πρότυπα <Icon name="chevronDown" size={13} />
      </button>
      {open && (
        <div className="msg-menu" role="menu" style={{ width: 280 }}>
          {usable.map((t) => (
            <button key={t.id} type="button" role="menuitem" className="msg-menu-item"
              onClick={() => { setOpen(false); onPick(t); }}>
              <span className="msg-ch-ico"><Icon name="copy" size={14} /></span>
              <span>
                <b>{t.name}</b>
                <small>{t.channel ? channelMeta(t.channel).label : 'Όλα τα κανάλια'}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Attachments({ caps, files, onAdd, onRemove, uploading, error }) {
  const inputRef = useRef(null);
  if (!caps.attachments) return null;
  const full = files.length >= caps.attachments.max;
  return (
    <div className="att-box">
      <div className="att-head">
        <button type="button" className="btn btn-sm" disabled={full || uploading}
          onClick={() => inputRef.current?.click()}>
          {uploading ? <span className="spinner" /> : <Icon name="paperclip" size={14} />} Επισύναψη
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          {caps.attachments.max === 1 ? 'Ένα αρχείο' : `Έως ${caps.attachments.max} αρχεία`} · έως 5 MB
          {caps.attachments.transport === 'url' && ' · απαιτείται δημόσιο URL'}
        </span>
        <input ref={inputRef} type="file" hidden accept={caps.attachments.accept.join(',')}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onAdd(f); }} />
      </div>
      {error && <div className="auth-error" style={{ marginTop: 8 }}>{error}</div>}
      {files.length > 0 && (
        <div className="att-list">
          {files.map((f) => (
            <div key={f.url} className="att-item">
              <Icon name={f.mime?.startsWith('image/') ? 'image' : 'file'} size={15} />
              <span className="att-name">{f.name}</span>
              <span className="muted" style={{ fontSize: 11.5 }}>{formatBytes(f.size)}</span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => onRemove(f.url)}
                title="Αφαίρεση"><Icon name="x" size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
  const [files, setFiles] = useState([]);
  const [button, setButton] = useState({ caption: '', url: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attError, setAttError] = useState('');
  const [tplBusy, setTplBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [preview, setPreview] = useState(false);

  const { data: tplData } = useQuery({
    queryKey: ['message-templates'],
    queryFn: ({ signal }) => api.messageTemplates({ signal }),
  });
  const templates = tplData?.templates || [];

  useEffect(() => {
    setTo(suggestions[0]?.value || '');
    setErr('');
    setMsg('');
  }, [channelId, suggestions]);

  // Switching channel must not silently drop what the user typed: markup is
  // flattened to text, and files the new channel cannot carry are removed with
  // a notice rather than failing later at the provider.
  const state = useRef({ body, isHtml, files });
  state.current = { body, isHtml, files };
  useEffect(() => {
    const cur = state.current;
    setPreview(false);
    if (!caps.richText && cur.isHtml) {
      setBody(plainText(cur.body, true));
      setIsHtml(false);
    }
    if (cur.files.length) {
      const allowed = caps.attachments
        ? cur.files.filter((f) => caps.attachments.accept.includes(f.mime)).slice(0, caps.attachments.max)
        : [];
      if (allowed.length !== cur.files.length) {
        setFiles(allowed);
        setAttError(`Αφαιρέθηκαν συνημμένα που δεν υποστηρίζει το ${meta.label}.`);
      }
    }
  }, [channelId, caps, meta.label]);

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

  const applyTemplate = async (t) => {
    setTplBusy(true); setErr('');
    try {
      // The server owns placeholder resolution, so the composer shows exactly
      // the wording that will be delivered — and it stays editable.
      const res = await api.previewCustomerMessage(customer.id, { subject: t.subject || '', body: t.body });
      const templateIsHtml = t.body_format === 'html' && caps.richText;
      setIsHtml(templateIsHtml);
      setPreview(false);
      setBody(templateIsHtml ? res.body : plainText(res.body, t.body_format === 'html'));
      if (caps.subject && res.subject) setSubject(res.subject);
      const usable = caps.attachments
        ? (t.attachments || []).filter((f) => caps.attachments.accept.includes(f.mime)).slice(0, caps.attachments.max)
        : [];
      setFiles(usable);
    } catch (ex) { setErr(ex.message); } finally { setTplBusy(false); }
  };

  const addFile = async (file) => {
    setAttError(''); setUploading(true);
    try {
      const up = await api.uploadAttachment(file);
      setFiles((cur) => [...cur, up].slice(0, caps.attachments.max));
    } catch (ex) { setAttError(ex.message); } finally { setUploading(false); }
  };

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
        attachments: files.map((f) => ({ url: f.url, name: f.name, mime: f.mime, size: f.size })),
        button: caps.button && button.url ? button : undefined,
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
            {caps.attachments && <span className="cap-chip">Συνημμένα</span>}
            {caps.button && <span className="cap-chip">Κουμπί</span>}
            {!caps.richText && !caps.attachments && <span className="cap-chip dim">Απλό κείμενο</span>}
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
              <TemplatePicker channelId={channelId} templates={templates} onPick={applyTemplate} busy={tplBusy} />
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

        <Attachments caps={caps} files={files} uploading={uploading} error={attError}
          onAdd={addFile} onRemove={(url) => setFiles((cur) => cur.filter((f) => f.url !== url))} />

        {caps.button && (
          <div className="field-group">
            <label>Κουμπί (προαιρετικό)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ flex: 1 }} value={button.caption} placeholder="Κείμενο κουμπιού"
                onChange={(e) => setButton((b) => ({ ...b, caption: e.target.value }))} />
              <input style={{ flex: 2 }} value={button.url} placeholder="https://…"
                onChange={(e) => setButton((b) => ({ ...b, url: e.target.value }))} />
            </div>
          </div>
        )}

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