import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Skeleton } from '../../components/ui.jsx';
import { formatRelativeTime } from '../../lib/notifications.js';

const card = { border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: '#fff' };
const label = { display: 'grid', gap: 4 };
const labelText = { fontSize: 12.5 };
const row = { display: 'flex', gap: 10, flexWrap: 'wrap' };

const VIBRATE_PRESETS = [
  { id: 'none', label: 'Καμία', pattern: '' },
  { id: 'short', label: 'Σύντομη', pattern: '200' },
  { id: 'double', label: 'Διπλή', pattern: '150,100,150' },
  { id: 'long', label: 'Έντονη', pattern: '300,150,300,150,300' },
  { id: 'custom', label: 'Προσαρμοσμένη…', pattern: null },
];
const URGENCY_OPTIONS = [
  { id: 'very-low', label: 'Πολύ χαμηλή (δεν ξυπνά τη συσκευή)' },
  { id: 'low', label: 'Χαμηλή' },
  { id: 'normal', label: 'Κανονική' },
  { id: 'high', label: 'Υψηλή (ξυπνά τη συσκευή, χρήση για κρίσιμα)' },
];
const TTL_UNITS = [
  { id: 'minutes', label: 'λεπτά', secs: 60 },
  { id: 'hours', label: 'ώρες', secs: 3600 },
  { id: 'days', label: 'ημέρες', secs: 86400 },
];

const STATUS_LABEL = {
  sent: { text: 'Στάλθηκε', color: 'var(--success, #16a34a)' },
  pending: { text: 'Προγραμματισμένη', color: 'var(--warning, #d97706)' },
  cancelled: { text: 'Ακυρώθηκε', color: 'var(--text-3)' },
  failed: { text: 'Απέτυχε', color: 'var(--danger, #dc2626)' },
};

function emptyForm() {
  return {
    title: '',
    body: '',
    url: '',
    imageUrl: '',
    iconUrl: '',
    badgeUrl: '',
    actions: [{ title: '', url: '' }, { title: '', url: '' }],
    requireInteraction: false,
    silent: false,
    renotify: false,
    tag: '',
    vibratePreset: 'none',
    vibrateCustom: '',
    urgency: 'normal',
    ttlValue: 3,
    ttlUnit: 'days',
    scheduleMode: 'now',
    scheduleAt: '',
  };
}

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Renders a live approximation of the notification (icon/title/body/image/action buttons). */
function NotificationPreview({ form, defaultIcon }) {
  const vibratePattern = form.vibratePreset === 'custom' ? form.vibrateCustom : (VIBRATE_PRESETS.find((p) => p.id === form.vibratePreset)?.pattern || '');
  const actions = form.actions.filter((a) => a.title.trim());
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: '#f9fafb', maxWidth: 380 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#fff', border: '1px solid var(--border)', display: 'grid', placeItems: 'center' }}>
          <img src={form.iconUrl || defaultIcon} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { e.target.style.visibility = 'hidden'; }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{form.title || 'Τίτλος ειδοποίησης'}</div>
          <div className="muted" style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{form.body || 'Κείμενο ειδοποίησης…'}</div>
        </div>
      </div>
      {form.imageUrl && (
        <img src={form.imageUrl} alt="" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8, marginTop: 8 }} onError={(e) => { e.target.style.display = 'none'; }} />
      )}
      {actions.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          {actions.map((a, i) => (
            <span key={i} style={{ flex: 1, textAlign: 'center', padding: '5px 8px', border: '1px solid var(--border-strong)', borderRadius: 7, fontSize: 12, background: '#fff' }}>
              {a.title}
            </span>
          ))}
        </div>
      )}
      <div className="muted" style={{ fontSize: 11, marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {form.requireInteraction && <span>📌 Παραμένει έως αλληλεπίδραση</span>}
        {form.silent && <span>🔇 Σιωπηλή</span>}
        {vibratePattern && <span>📳 {vibratePattern}</span>}
        {form.tag && <span>🏷️ {form.tag}</span>}
      </div>
    </div>
  );
}

export default function PushBroadcastPanel() {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [mode, setMode] = useState('all'); // 'all' | 'role' | 'users'
  const [roleId, setRoleId] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['push-recipients'],
    queryFn: ({ signal }) => api.pushRecipients({ signal }),
  });
  const { data: rolesData } = useQuery({
    queryKey: ['push-roles'],
    queryFn: ({ signal }) => api.pushRoles({ signal }),
  });
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['push-broadcasts'],
    queryFn: ({ signal }) => api.pushBroadcasts({ signal }),
  });
  const { data: templatesData } = useQuery({
    queryKey: ['push-templates'],
    queryFn: ({ signal }) => api.pushTemplates({ signal }),
  });

  const users = usersData?.users || [];
  const roles = rolesData?.roles || [];
  const templates = templatesData?.templates || [];
  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => `${u.full_name} ${u.email}`.toLowerCase().includes(q));
  }, [users, query]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const setAction = (idx, key) => (value) => setForm((f) => ({
    ...f, actions: f.actions.map((a, i) => (i === idx ? { ...a, [key]: value } : a)),
  }));

  const toggleUser = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const applyTemplate = (t) => {
    if (!t) return;
    setForm((f) => ({
      ...f,
      title: t.title || '',
      body: t.body || '',
      url: t.url || '',
      imageUrl: t.image_url || '',
      iconUrl: t.icon_url || '',
      badgeUrl: t.badge_url || '',
      actions: [0, 1].map((i) => ({ title: t.actions?.[i]?.title || '', url: t.actions?.[i]?.url || '' })),
      requireInteraction: !!t.require_interaction,
      silent: !!t.silent,
      renotify: !!t.renotify,
      tag: t.tag || '',
      vibratePreset: t.vibrate ? 'custom' : 'none',
      vibrateCustom: t.vibrate || '',
      urgency: t.urgency || 'normal',
      ttlValue: t.ttl_seconds ? Math.max(1, Math.round(t.ttl_seconds / 86400)) : 3,
      ttlUnit: 'days',
    }));
  };

  const saveTemplateMutation = useMutation({
    mutationFn: () => api.savePushTemplate({
      name: templateName.trim(),
      ...buildRichPayload(form),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['push-templates'] });
      setTemplateName('');
    },
    onError: (e) => setErr(e.message || 'Αποτυχία αποθήκευσης προτύπου'),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id) => api.deletePushTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['push-templates'] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => api.cancelPushBroadcast(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['push-broadcasts'] }),
  });

  function buildRichPayload(f) {
    const vibrate = f.vibratePreset === 'custom' ? f.vibrateCustom : (VIBRATE_PRESETS.find((p) => p.id === f.vibratePreset)?.pattern || '');
    const ttlUnitSecs = TTL_UNITS.find((u) => u.id === f.ttlUnit)?.secs || 86400;
    return {
      title: f.title.trim(),
      body: f.body.trim() || null,
      url: f.url.trim() || null,
      imageUrl: f.imageUrl.trim() || null,
      iconUrl: f.iconUrl.trim() || null,
      badgeUrl: f.badgeUrl.trim() || null,
      actions: f.actions.filter((a) => a.title.trim()).map((a) => ({ title: a.title.trim(), url: a.url.trim() })),
      requireInteraction: f.requireInteraction,
      silent: f.silent,
      renotify: f.renotify,
      tag: f.tag.trim() || null,
      vibrate: vibrate || null,
      urgency: f.urgency,
      ttlSeconds: Math.round((Number(f.ttlValue) || 1) * ttlUnitSecs),
    };
  }

  const sendMutation = useMutation({
    mutationFn: () => api.pushBroadcast({
      ...buildRichPayload(form),
      recipients: mode === 'all' ? 'all' : mode === 'role' ? 'role' : Array.from(selected),
      roleId: mode === 'role' ? Number(roleId) : undefined,
      sendAt: form.scheduleMode === 'later' && form.scheduleAt ? new Date(form.scheduleAt).toISOString() : undefined,
    }),
    onSuccess: (r) => {
      setResult(r);
      setErr('');
      setForm(emptyForm());
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['push-broadcasts'] });
    },
    onError: (e) => { setErr(e.message || 'Κάτι πήγε στραβά'); setResult(null); },
  });

  const canSend = form.title.trim().length > 0
    && (mode === 'all' || (mode === 'role' && roleId) || (mode === 'users' && selected.size > 0))
    && (form.scheduleMode === 'now' || !!form.scheduleAt)
    && !sendMutation.isPending;

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 820 }}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <b>Σύνθεση ειδοποίησης</b>
          {templates.length > 0 && (
            <select
              className="input"
              style={{ width: 220, height: 32 }}
              value={selectedTemplate}
              onChange={(e) => {
                setSelectedTemplate(e.target.value);
                applyTemplate(templates.find((t) => String(t.id) === e.target.value));
              }}
            >
              <option value="">Φόρτωση από πρότυπο…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          Στέλνεται άμεσα (ή στην προγραμματισμένη ώρα) ως in-app ειδοποίηση και ως πλήρες Web Push σε κάθε συσκευή του παραλήπτη —
          με εικόνα, εικονίδια, κουμπιά ενεργειών, δόνηση, προτεραιότητα και προγραμματισμό.
        </div>

        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          <label style={label}><span className="muted" style={labelText}>Τίτλος *</span>
            <input className="input" value={form.title} onChange={(e) => set('title')(e.target.value)} maxLength={200} placeholder="π.χ. Προγραμματισμένη συντήρηση απόψε" />
          </label>
          <label style={label}><span className="muted" style={labelText}>Κείμενο</span>
            <textarea className="input" value={form.body} onChange={(e) => set('body')(e.target.value)} maxLength={1000} rows={3} placeholder="Προαιρετικά, περισσότερες λεπτομέρειες…" />
          </label>
          <label style={label}><span className="muted" style={labelText}>Σύνδεσμος κλικ (προεπιλογή)</span>
            <input className="input" value={form.url} onChange={(e) => set('url')(e.target.value)} maxLength={500} placeholder="https://… (άνοιγμα όταν πατηθεί η ειδοποίηση)" />
          </label>
        </div>

        <div className="section-title" style={{ marginTop: 16 }}>Πολυμέσα</div>
        <div style={row}>
          <label style={{ ...label, flex: '1 1 220px' }}><span className="muted" style={labelText}>Εικόνα (μεγάλη, μέσα στην ειδοποίηση)</span>
            <input className="input" value={form.imageUrl} onChange={(e) => set('imageUrl')(e.target.value)} maxLength={500} placeholder="https://…" />
          </label>
          <label style={{ ...label, flex: '1 1 220px' }}><span className="muted" style={labelText}>Εικονίδιο (αντικαθιστά το προεπιλεγμένο)</span>
            <input className="input" value={form.iconUrl} onChange={(e) => set('iconUrl')(e.target.value)} maxLength={500} placeholder="https://… (κενό = προεπιλογή branding)" />
          </label>
          <label style={{ ...label, flex: '1 1 220px' }}><span className="muted" style={labelText}>Badge (αντικαθιστά το προεπιλεγμένο)</span>
            <input className="input" value={form.badgeUrl} onChange={(e) => set('badgeUrl')(e.target.value)} maxLength={500} placeholder="https://… (κενό = προεπιλογή branding)" />
          </label>
        </div>

        <div className="section-title" style={{ marginTop: 16 }}>Κουμπιά ενεργειών (έως 2)</div>
        {form.actions.map((a, i) => (
          <div key={i} style={{ ...row, marginBottom: 6 }}>
            <input className="input" style={{ flex: '1 1 160px' }} value={a.title} onChange={(e) => setAction(i, 'title')(e.target.value)} maxLength={40} placeholder={`Ετικέτα κουμπιού ${i + 1}`} />
            <input className="input" style={{ flex: '2 1 240px' }} value={a.url} onChange={(e) => setAction(i, 'url')(e.target.value)} maxLength={500} placeholder="https://… (άνοιγμα όταν πατηθεί το κουμπί)" />
          </div>
        ))}

        <div className="section-title" style={{ marginTop: 16 }}>Συμπεριφορά</div>
        <div style={row}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.requireInteraction} onChange={(e) => set('requireInteraction')(e.target.checked)} /> Παραμονή έως αλληλεπίδραση
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.silent} onChange={(e) => set('silent')(e.target.checked)} /> Σιωπηλή (χωρίς ήχο/δόνηση)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.renotify} onChange={(e) => set('renotify')(e.target.checked)} /> Επανειδοποίηση σε ίδιο tag
          </label>
        </div>
        <div style={{ ...row, marginTop: 10 }}>
          <label style={{ ...label, flex: '1 1 200px' }}><span className="muted" style={labelText}>Ετικέτα ομαδοποίησης (tag)</span>
            <input className="input" value={form.tag} onChange={(e) => set('tag')(e.target.value)} maxLength={100} placeholder="π.χ. maintenance (αντικαθιστά προηγούμενη με ίδιο tag)" />
          </label>
          <label style={{ ...label, flex: '1 1 200px' }}><span className="muted" style={labelText}>Δόνηση</span>
            <select className="input" value={form.vibratePreset} onChange={(e) => set('vibratePreset')(e.target.value)}>
              {VIBRATE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          {form.vibratePreset === 'custom' && (
            <label style={{ ...label, flex: '1 1 200px' }}><span className="muted" style={labelText}>Μοτίβο (ms, χωρισμένα με κόμμα)</span>
              <input className="input" value={form.vibrateCustom} onChange={(e) => set('vibrateCustom')(e.target.value)} placeholder="200,100,200" />
            </label>
          )}
        </div>

        <div className="section-title" style={{ marginTop: 16 }}>Προτεραιότητα &amp; διάρκεια ζωής</div>
        <div style={row}>
          <label style={{ ...label, flex: '1 1 260px' }}><span className="muted" style={labelText}>Προτεραιότητα παράδοσης (urgency)</span>
            <select className="input" value={form.urgency} onChange={(e) => set('urgency')(e.target.value)}>
              {URGENCY_OPTIONS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </label>
          <label style={{ ...label, flex: '1 1 100px' }}><span className="muted" style={labelText}>TTL</span>
            <input type="number" min={1} className="input" value={form.ttlValue} onChange={(e) => set('ttlValue')(e.target.value)} />
          </label>
          <label style={{ ...label, flex: '1 1 140px' }}><span className="muted" style={labelText}>&nbsp;</span>
            <select className="input" value={form.ttlUnit} onChange={(e) => set('ttlUnit')(e.target.value)}>
              {TTL_UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </label>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
          Το TTL καθορίζει πόσο θα προσπαθήσει ο πάροχος push να παραδώσει το μήνυμα σε συσκευή που είναι offline, πριν το πετάξει.
        </p>

        <div className="section-title" style={{ marginTop: 16 }}>Προγραμματισμός</div>
        <div style={{ display: 'flex', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, cursor: 'pointer' }}>
            <input type="radio" checked={form.scheduleMode === 'now'} onChange={() => set('scheduleMode')('now')} /> Αποστολή τώρα
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, cursor: 'pointer' }}>
            <input
              type="radio"
              checked={form.scheduleMode === 'later'}
              onChange={() => setForm((f) => ({ ...f, scheduleMode: 'later', scheduleAt: f.scheduleAt || toLocalInputValue(new Date(Date.now() + 15 * 60000)) }))}
            /> Προγραμματισμός για αργότερα
          </label>
        </div>
        {form.scheduleMode === 'later' && (
          <input
            type="datetime-local"
            className="input"
            style={{ marginTop: 8, maxWidth: 260 }}
            value={form.scheduleAt}
            onChange={(e) => set('scheduleAt')(e.target.value)}
          />
        )}

        <div className="section-title" style={{ marginTop: 16 }}>Παραλήπτες</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, cursor: 'pointer' }}>
            <input type="radio" checked={mode === 'all'} onChange={() => setMode('all')} />
            Όλοι οι χρήστες {usersLoading ? '' : `(${users.length})`}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, cursor: 'pointer' }}>
            <input type="radio" checked={mode === 'role'} onChange={() => setMode('role')} />
            Συγκεκριμένος ρόλος
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, cursor: 'pointer' }}>
            <input type="radio" checked={mode === 'users'} onChange={() => setMode('users')} />
            Συγκεκριμένοι χρήστες {selected.size > 0 ? `(${selected.size} επιλεγμένοι)` : ''}
          </label>
        </div>

        {mode === 'role' && (
          <select className="input" style={{ marginTop: 10, maxWidth: 320 }} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">Επιλέξτε ρόλο…</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.user_count})</option>)}
          </select>
        )}

        {mode === 'users' && (
          <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
              <input className="input" placeholder="Αναζήτηση ονόματος/email…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {usersLoading && <div style={{ padding: 10 }}><Skeleton h={16} /></div>}
              {!usersLoading && filteredUsers.length === 0 && (
                <div className="muted" style={{ padding: 10, fontSize: 13 }}>Δεν βρέθηκαν χρήστες.</div>
              )}
              {filteredUsers.map((u) => (
                <label
                  key={u.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13.5,
                  }}
                >
                  <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleUser(u.id)} />
                  <span style={{ flex: 1 }}>
                    <b>{u.full_name}</b>
                    <span className="muted" style={{ marginLeft: 6 }}>{u.email}</span>
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {u.device_count > 0 ? `${u.device_count} συσκευή/ές` : 'χωρίς push'}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="section-title" style={{ marginTop: 16 }}>Προεπισκόπηση</div>
        <NotificationPreview form={form} defaultIcon="/app-icons/icon-192.png" />

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" disabled={!canSend} onClick={() => sendMutation.mutate()}>
            {sendMutation.isPending ? 'Αποστολή…' : form.scheduleMode === 'later' ? 'Προγραμματισμός' : 'Αποστολή ειδοποίησης'}
          </button>
          <input
            className="input"
            style={{ width: 200, height: 34 }}
            placeholder="Όνομα προτύπου…"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
          />
          <button
            type="button"
            className="btn"
            disabled={!templateName.trim() || !form.title.trim() || saveTemplateMutation.isPending}
            onClick={() => saveTemplateMutation.mutate()}
          >
            <Icon name="check" size={14} /> Αποθήκευση ως πρότυπο
          </button>
          {result && (
            <span style={{ fontSize: 13, color: 'var(--success, #16a34a)' }}>
              {result.scheduled
                ? `Προγραμματίστηκε για ${result.recipients} χρήστες.`
                : `Στάλθηκε σε ${result.recipients} χρήστες (${result.pushSent} push).`}
            </span>
          )}
          {err && <span style={{ fontSize: 13, color: 'var(--danger, #dc2626)' }}>{err}</span>}
        </div>
      </div>

      {templates.length > 0 && (
        <div style={card}>
          <b>Πρότυπα</b>
          <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
            {templates.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ flex: 1 }}>{t.name}</span>
                <button type="button" className="btn btn-ghost" onClick={() => applyTemplate(t)}>Φόρτωση</button>
                <button type="button" className="btn btn-ghost" onClick={() => deleteTemplateMutation.mutate(t.id)}><Icon name="x" size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={card}>
        <b>Ιστορικό αποστολών</b>
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {historyLoading && <Skeleton h={60} />}
          {!historyLoading && !(historyData?.broadcasts || []).length && (
            <div className="muted" style={{ fontSize: 13 }}>Δεν έχουν σταλεί ειδοποιήσεις ακόμα.</div>
          )}
          {(historyData?.broadcasts || []).map((b) => {
            const st = STATUS_LABEL[b.status] || STATUS_LABEL.sent;
            return (
              <div key={b.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: '#f3f4f6', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon name="bell" size={15} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <b>{b.title}</b>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: st.color }}>{st.text}</span>
                  </div>
                  {b.body && <div className="muted" style={{ fontSize: 13 }}>{b.body}</div>}
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {b.recipient_type === 'all' ? 'Όλοι' : b.recipient_type === 'role' ? 'Ρόλος' : `${b.recipient_count} επιλεγμένοι`}
                    {' · '}{b.push_sent_count} push{b.clicked_count > 0 ? ` · ${b.clicked_count} κλικ` : ''}{' · '}
                    {b.sender_name || 'Άγνωστος'}{' · '}
                    {b.status === 'pending' ? `προγραμματισμένη για ${new Date(b.send_at).toLocaleString('el-GR')}` : formatRelativeTime(b.created_at)}
                  </div>
                </div>
                {b.status === 'pending' && (
                  <button type="button" className="btn btn-ghost" onClick={() => cancelMutation.mutate(b.id)}>Ακύρωση</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
