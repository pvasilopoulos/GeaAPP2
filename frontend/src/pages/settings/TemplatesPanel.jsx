import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Drawer, EmptyState, Skeleton } from '../../components/ui.jsx';
import RichTextEditor from '../../components/message/RichTextEditor.jsx';
import { MESSAGE_CHANNELS, channelMeta } from '../../lib/channels.js';

const inp = { width: '100%', height: 40, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 9 };
const ta = {
  width: '100%', minHeight: 160, padding: '10px 12px', border: '1px solid var(--border-strong)',
  borderRadius: 10, fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5, resize: 'vertical',
};

function blank() {
  return { name: '', channel: '', subject: '', body: '', body_format: 'text', active: true };
}

// Only channels that accept markup may hold an HTML template.
function richTextAllowed(channel, channels) {
  if (!channel) return true;
  return !!channels.find((c) => c.id === channel)?.caps?.richText;
}

function VariableHelp({ variables, onInsert }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tpl-vars">
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen((o) => !o)}>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} /> Διαθέσιμες μεταβλητές
      </button>
      {open && (
        <>
          <p className="muted" style={{ fontSize: 12, margin: '8px 0' }}>
            Πατήστε μια μεταβλητή για να μπει στο κείμενο. Με <code>{'{{key|—}}'}</code> ορίζετε τι
            θα εμφανιστεί όταν ο πελάτης δεν έχει τιμή.
          </p>
          <div className="msg-chips">
            {variables.map((v) => (
              <button key={v.key} type="button" className="msg-chip" title={v.key}
                onClick={() => onInsert(`{{${v.key}}}`)}>
                {v.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TemplateDrawer({ initial, variables, channels, onClose, onSaved }) {
  const [f, setF] = useState(() => ({ ...blank(), ...(initial || {}) }));
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const allowsRich = richTextAllowed(f.channel, channels);
  const isHtml = f.body_format === 'html' && allowsRich;
  const subjectChannel = !f.channel || channels.find((c) => c.id === f.channel)?.caps?.subject;

  const save = useMutation({
    mutationFn: (payload) => (initial?.id
      ? api.updateMessageTemplate(initial.id, payload)
      : api.createMessageTemplate(payload)),
    onSuccess: onSaved,
    onError: (ex) => setErr(ex.message),
  });

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    save.mutate({
      name: f.name,
      channel: f.channel || null,
      subject: subjectChannel ? f.subject : '',
      body: f.body,
      body_format: isHtml ? 'html' : 'text',
      active: f.active,
    });
  };

  const insert = (token) => setF((s) => ({
    ...s,
    body: isHtml ? `${s.body}${token}` : `${s.body}${s.body && !s.body.endsWith(' ') ? ' ' : ''}${token}`,
  }));

  return (
    <Drawer wide title={initial?.id ? 'Επεξεργασία προτύπου' : 'Νέο πρότυπο'} onClose={onClose}>
      {err && <div className="auth-error">{err}</div>}
      <form onSubmit={submit}>
        <div className="field-group"><label>Όνομα</label>
          <input style={inp} value={f.name} onChange={set('name')} placeholder="π.χ. Υπενθύμιση κράτησης" required /></div>

        <div className="field-group"><label>Κανάλι</label>
          <select style={inp} value={f.channel} onChange={set('channel')}>
            <option value="">Όλα τα κανάλια</option>
            {MESSAGE_CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <p className="muted" style={{ fontSize: 12.5, margin: '-6px 0 12px' }}>
          Ένα πρότυπο «για όλα τα κανάλια» εμφανίζεται πάντα και προσαρμόζεται στις δυνατότητες
          του καναλιού που επιλέγεται στην αποστολή.
        </p>

        {subjectChannel && (
          <div className="field-group"><label>Θέμα (email)</label>
            <input style={inp} value={f.subject || ''} onChange={set('subject')} /></div>
        )}

        <div className="field-group">
          <div className="msg-body-head">
            <label style={{ margin: 0 }}>Κείμενο</label>
            {allowsRich && (
              <label className="tpl-fmt">
                <input type="checkbox" checked={isHtml}
                  onChange={(e) => setF((s) => ({ ...s, body_format: e.target.checked ? 'html' : 'text' }))} />
                Μορφοποιημένο κείμενο
              </label>
            )}
          </div>
          {isHtml
            ? <RichTextEditor value={f.body} onChange={(body) => setF((s) => ({ ...s, body }))} />
            : <textarea style={ta} value={f.body} onChange={set('body')} placeholder="Γεια σας {{customer.first_name}}…" required />}
        </div>

        <VariableHelp variables={variables} onInsert={insert} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 14px' }}>
          <input type="checkbox" checked={!!f.active} onChange={set('active')} /> Ενεργό
        </label>

        <button className="btn btn-accent btn-block" disabled={save.isPending}>
          {save.isPending ? <span className="spinner" /> : <Icon name="check" size={16} />}
          {initial?.id ? 'Αποθήκευση' : 'Δημιουργία'}
        </button>
      </form>
    </Drawer>
  );
}

export default function TemplatesPanel() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const { data, isLoading } = useQuery({
    queryKey: ['message-templates'],
    queryFn: ({ signal }) => api.messageTemplates({ signal }),
  });
  const { data: chData } = useQuery({
    queryKey: ['messaging-channels'],
    queryFn: ({ signal }) => api.messagingChannels({ signal }),
  });

  const templates = data?.templates || [];
  const variables = data?.variables || [];
  const channels = chData?.channels || [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['message-templates'] });

  const remove = async (t) => {
    if (!confirm(`Διαγραφή προτύπου «${t.name}»;`)) return;
    await api.deleteMessageTemplate(t.id);
    refresh();
  };

  if (isLoading) return <div className="card card-pad"><Skeleton h={160} /></div>;

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 18 }}>Πρότυπα μηνυμάτων</h1>
          <div className="sub">Έτοιμα κείμενα με μεταβλητές, διαθέσιμα στην αποστολή μηνύματος</div>
        </div>
        <button className="btn btn-accent" onClick={() => setEditing(blank())}>
          <Icon name="plus" size={16} /> Νέο πρότυπο
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="card card-pad">
          <EmptyState icon="copy" title="Χωρίς πρότυπα"
            hint="Φτιάξτε ένα πρότυπο με μεταβλητές, π.χ. «Γεια σας {{customer.first_name}}»." />
        </div>
      ) : (
        <div className="card">
          {templates.map((t) => (
            <div key={t.id} className={`people-row${t.active ? '' : ' dim'}`}>
              <span className="msg-ch-ico">
                <Icon name={t.channel ? channelMeta(t.channel).icon : 'copy'} size={15} />
              </span>
              <div className="people-id">
                <div className="nm">
                  {t.name}
                  {!t.active && <span className="ob-chip">Ανενεργό</span>}
                  {t.body_format === 'html' && <span className="cap-chip">Μορφοποιημένο</span>}
                </div>
                <div className="sub">
                  {(t.channel ? channelMeta(t.channel).label : 'Όλα τα κανάλια')}
                  {t.subject ? ` · ${t.subject}` : ''}
                </div>
              </div>
              <div className="people-actions">
                <button className="btn btn-sm" onClick={() => setEditing(t)} title="Επεξεργασία">
                  <Icon name="edit" size={14} />
                </button>
                <button className="btn btn-sm" onClick={() => remove(t)} title="Διαγραφή">
                  <Icon name="x" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TemplateDrawer
          initial={editing.id ? editing : null}
          variables={variables}
          channels={channels}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}
