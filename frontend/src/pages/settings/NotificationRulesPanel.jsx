import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Skeleton } from '../../components/ui.jsx';

const card = { border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: '#fff' };
const label = { display: 'grid', gap: 4 };
const labelText = { fontSize: 12.5 };
const row = { display: 'flex', gap: 10, flexWrap: 'wrap' };

const CHANNEL_LABELS = {
  app: { label: 'Εφαρμογή (inbox + push)', icon: 'bell' },
  email: { label: 'Email', icon: 'mail' },
  sms: { label: 'SMS', icon: 'message' },
  viber: { label: 'Viber', icon: 'message' },
  telegram: { label: 'Telegram', icon: 'message' },
};

const OPERATOR_LABELS = {
  eq: 'ίσο με', neq: 'διαφορετικό από', gt: 'μεγαλύτερο από', gte: 'μεγαλύτερο ή ίσο με',
  lt: 'μικρότερο από', lte: 'μικρότερο ή ίσο με', contains: 'περιέχει',
};

const RECIPIENT_LABELS = { all: 'Όλοι οι χρήστες', role: 'Συγκεκριμένος ρόλος', users: 'Συγκεκριμένοι χρήστες', dynamic: 'Δυναμικός παραλήπτης (από το ίδιο το γεγονός)' };

function emptyForm() {
  return {
    id: null,
    name: '',
    eventKey: '',
    enabled: true,
    conditions: [],
    recipientType: 'all',
    recipientRoleId: '',
    recipientIds: [],
    recipientDynamic: '',
    channels: ['app'],
    titleTemplate: '',
    bodyTemplate: '',
    urlTemplate: '',
    throttleSeconds: 0,
  };
}

export default function NotificationRulesPanel() {
  const qc = useQueryClient();
  const rulesQ = useQuery({ queryKey: ['notification-rules'], queryFn: () => api.notificationRules() });
  const eventsQ = useQuery({ queryKey: ['notification-rule-events'], queryFn: () => api.notificationRuleEvents() });
  const rolesQ = useQuery({ queryKey: ['notification-rule-roles'], queryFn: () => api.notificationRuleRoles() });
  const usersQ = useQuery({ queryKey: ['notification-rule-users'], queryFn: () => api.notificationRuleUsers() });

  const [form, setForm] = useState(null); // null = list view, object = editor
  const [error, setError] = useState('');

  const events = eventsQ.data?.events || [];
  const channels = eventsQ.data?.channels || [];
  const eventMeta = useMemo(() => events.find((e) => e.key === form?.eventKey), [events, form?.eventKey]);

  const saveMut = useMutation({
    mutationFn: (payload) => (payload.id ? api.updateNotificationRule(payload.id, payload) : api.createNotificationRule(payload)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notification-rules'] }); setForm(null); setError(''); },
    onError: (e) => setError(e.message),
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }) => api.toggleNotificationRule(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-rules'] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => api.deleteNotificationRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-rules'] }),
  });

  function openEdit(rule) {
    setError('');
    if (!rule) { setForm(emptyForm()); return; }
    setForm({
      id: rule.id, name: rule.name, eventKey: rule.eventKey, enabled: rule.enabled,
      conditions: rule.conditions || [], recipientType: rule.recipientType,
      recipientRoleId: rule.recipientRoleId || '', recipientIds: rule.recipientIds || [],
      recipientDynamic: rule.recipientDynamic || '', channels: rule.channels || [],
      titleTemplate: rule.titleTemplate || '', bodyTemplate: rule.bodyTemplate || '', urlTemplate: rule.urlTemplate || '',
      throttleSeconds: rule.throttleSeconds || 0,
    });
  }

  function updateCondition(i, patch) {
    setForm((f) => ({ ...f, conditions: f.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }));
  }
  function addCondition() {
    setForm((f) => ({ ...f, conditions: [...f.conditions, { field: eventMeta?.fields?.[0]?.key || '', operator: 'eq', value: '' }] }));
  }
  function removeCondition(i) {
    setForm((f) => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }));
  }
  function toggleChannel(ch) {
    setForm((f) => ({ ...f, channels: f.channels.includes(ch) ? f.channels.filter((c) => c !== ch) : [...f.channels, ch] }));
  }

  function submit() {
    if (!form.channels.length) { setError('Επίλεξε τουλάχιστον ένα κανάλι'); return; }
    if (!form.titleTemplate.trim()) { setError('Ο τίτλος είναι υποχρεωτικός'); return; }
    saveMut.mutate({
      ...form,
      recipientRoleId: form.recipientType === 'role' ? Number(form.recipientRoleId) || null : null,
      recipientIds: form.recipientType === 'users' ? form.recipientIds.map(Number) : [],
    });
  }

  if (form) {
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={row}>
          <button type="button" className="btn ghost" onClick={() => setForm(null)}><Icon name="arrowLeft" size={14} /> Πίσω στη λίστα</button>
        </div>
        {error && <div className="alert error">{error}</div>}

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Βασικά</div>
          <div style={row}>
            <label style={{ ...label, flex: '1 1 260px' }}>
              <span style={labelText}>Όνομα κανόνα</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="π.χ. Ειδοποίηση για μεγάλες προσφορές" />
            </label>
            <label style={{ ...label, flex: '1 1 260px' }}>
              <span style={labelText}>Γεγονός (event)</span>
              <select value={form.eventKey} onChange={(e) => setForm({ ...form, eventKey: e.target.value, conditions: [] })}>
                <option value="">— επίλεξε —</option>
                {events.map((ev) => <option key={ev.key} value={ev.key}>{ev.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20 }}>
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              <span style={labelText}>Ενεργός</span>
            </label>
          </div>
          {eventMeta?.description && <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{eventMeta.description}</div>}
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Συνθήκες (προαιρετικό — αν αφεθεί κενό, ισχύει πάντα)</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {form.conditions.map((c, i) => (
              <div key={i} style={{ ...row, alignItems: 'center' }}>
                <select value={c.field} onChange={(e) => updateCondition(i, { field: e.target.value })}>
                  {(eventMeta?.fields || []).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <select value={c.operator} onChange={(e) => updateCondition(i, { operator: e.target.value })}>
                  {Object.entries(OPERATOR_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input style={{ flex: '1 1 160px' }} value={c.value} onChange={(e) => updateCondition(i, { value: e.target.value })} placeholder="τιμή" />
                <button type="button" className="btn ghost icon" onClick={() => removeCondition(i)}><Icon name="x" size={14} /></button>
              </div>
            ))}
            <button type="button" className="btn ghost" disabled={!eventMeta} onClick={addCondition}><Icon name="plus" size={14} /> Προσθήκη συνθήκης</button>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Παραλήπτες</div>
          <div style={row}>
            <label style={{ ...label, flex: '1 1 260px' }}>
              <span style={labelText}>Τύπος παραλήπτη</span>
              <select value={form.recipientType} onChange={(e) => setForm({ ...form, recipientType: e.target.value })}>
                {Object.entries(RECIPIENT_LABELS).map(([k, v]) => {
                  if (k === 'dynamic' && !eventMeta?.dynamicRecipients?.length) return null;
                  return <option key={k} value={k}>{v}</option>;
                })}
              </select>
            </label>
            {form.recipientType === 'role' && (
              <label style={{ ...label, flex: '1 1 260px' }}>
                <span style={labelText}>Ρόλος</span>
                <select value={form.recipientRoleId} onChange={(e) => setForm({ ...form, recipientRoleId: e.target.value })}>
                  <option value="">— επίλεξε —</option>
                  {(rolesQ.data?.roles || []).map((r) => <option key={r.id} value={r.id}>{r.name} ({r.user_count})</option>)}
                </select>
              </label>
            )}
            {form.recipientType === 'dynamic' && (
              <label style={{ ...label, flex: '1 1 260px' }}>
                <span style={labelText}>Δυναμικός παραλήπτης</span>
                <select value={form.recipientDynamic} onChange={(e) => setForm({ ...form, recipientDynamic: e.target.value })}>
                  <option value="">— επίλεξε —</option>
                  {(eventMeta?.dynamicRecipients || []).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </label>
            )}
          </div>
          {form.recipientType === 'users' && (
            <div style={{ marginTop: 10 }}>
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>Επίλεξε χρήστες:</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6, maxHeight: 180, overflow: 'auto' }}>
                {(usersQ.data?.users || []).map((u) => (
                  <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input type="checkbox" checked={form.recipientIds.includes(u.id)}
                      onChange={() => setForm((f) => ({ ...f, recipientIds: f.recipientIds.includes(u.id) ? f.recipientIds.filter((x) => x !== u.id) : [...f.recipientIds, u.id] }))} />
                    {u.full_name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Κανάλια αποστολής</div>
          <div style={row}>
            {channels.map((ch) => (
              <label key={ch} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
                <input type="checkbox" checked={form.channels.includes(ch)} onChange={() => toggleChannel(ch)} />
                {CHANNEL_LABELS[ch]?.label || ch}
              </label>
            ))}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Περιεχόμενο</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
            Διαθέσιμες μεταβλητές: {(eventMeta?.fields || []).map((f) => `{{${f.key}}}`).join(', ') || '—'}
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={label}>
              <span style={labelText}>Τίτλος</span>
              <input value={form.titleTemplate} onChange={(e) => setForm({ ...form, titleTemplate: e.target.value })} placeholder="π.χ. Νέα προσφορά {{total}}€" />
            </label>
            <label style={label}>
              <span style={labelText}>Κείμενο</span>
              <textarea rows={3} value={form.bodyTemplate} onChange={(e) => setForm({ ...form, bodyTemplate: e.target.value })} placeholder="π.χ. Πελάτης: {{customerName}}" />
            </label>
            <label style={label}>
              <span style={labelText}>URL (προαιρετικό — άνοιγμα κατά το κλικ)</span>
              <input value={form.urlTemplate} onChange={(e) => setForm({ ...form, urlTemplate: e.target.value })} placeholder="/quotes/{{entityId}}" />
            </label>
            <label style={{ ...label, maxWidth: 220 }}>
              <span style={labelText}>Throttle (δευτ. — 0 = χωρίς όριο)</span>
              <input type="number" min={0} value={form.throttleSeconds} onChange={(e) => setForm({ ...form, throttleSeconds: Number(e.target.value) || 0 })} />
            </label>
          </div>
        </div>

        <div style={row}>
          <button type="button" className="btn primary" disabled={saveMut.isPending} onClick={submit}>
            {saveMut.isPending ? 'Αποθήκευση…' : 'Αποθήκευση κανόνα'}
          </button>
          <button type="button" className="btn ghost" onClick={() => setForm(null)}>Άκυρο</button>
        </div>
      </div>
    );
  }

  if (rulesQ.isLoading || eventsQ.isLoading) return <Skeleton rows={4} />;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={row}>
        <button type="button" className="btn primary" onClick={() => openEdit(null)}><Icon name="plus" size={14} /> Νέος κανόνας</button>
      </div>
      {!rulesQ.data?.rules?.length && <div className="muted">Δεν υπάρχουν κανόνες ειδοποιήσεων ακόμα.</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        {(rulesQ.data?.rules || []).map((rule) => {
          const ev = events.find((e) => e.key === rule.eventKey);
          return (
            <div key={rule.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{rule.name}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {ev?.label || rule.eventKey} · {(rule.channels || []).map((c) => CHANNEL_LABELS[c]?.label || c).join(', ')}
                  {rule.firedCount ? ` · Ενεργοποιήθηκε ${rule.firedCount} φορές` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                  <input type="checkbox" checked={rule.enabled} onChange={(e) => toggleMut.mutate({ id: rule.id, enabled: e.target.checked })} />
                  Ενεργός
                </label>
                <button type="button" className="btn ghost icon" onClick={() => openEdit(rule)}><Icon name="edit" size={14} /></button>
                <button type="button" className="btn ghost icon" onClick={() => { if (confirm(`Διαγραφή του κανόνα "${rule.name}";`)) deleteMut.mutate(rule.id); }}><Icon name="x" size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
