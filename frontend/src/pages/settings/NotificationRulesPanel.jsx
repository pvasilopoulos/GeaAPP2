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

const RECURRENCE_LABELS = { once: 'Μία φορά (ανά εγγραφή)', recurring: 'Επανάληψη κάθε μέρα όσο ισχύει' };
const DIGEST_LABELS = { none: 'Άμεση αποστολή', hourly: 'Συγκεντρωτικά ανά ώρα', daily: 'Συγκεντρωτικά 1 φορά/ημέρα (08:00)' };
const EXTRA_ACTION_TYPES = { create_follow_up: 'Δημιουργία follow-up', add_tag: 'Προσθήκη ετικέτας πελάτη', webhook: 'Κλήση webhook (URL)' };
const UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440 };

function minutesToOffset(totalMinutes) {
  const n = Number(totalMinutes) || 0;
  const direction = n < 0 ? 'before' : 'after';
  const abs = Math.abs(n);
  let unit = 'minutes';
  if (abs > 0 && abs % 1440 === 0) unit = 'days';
  else if (abs > 0 && abs % 60 === 0) unit = 'hours';
  return { value: abs / UNIT_MINUTES[unit], unit, direction };
}
function offsetToMinutes({ value, unit, direction }) {
  const m = (Number(value) || 0) * (UNIT_MINUTES[unit] || 1);
  return direction === 'before' ? -m : m;
}

function emptyForm() {
  return {
    id: null,
    name: '',
    enabled: true,
    triggerType: 'event',
    eventKey: '',
    scheduleEntity: '',
    scheduleDateField: '',
    scheduleOffsetValue: 3, scheduleOffsetUnit: 'days', scheduleOffsetDirection: 'before',
    scheduleRecurrence: 'once',
    conditionLogic: 'and',
    conditionGroups: [[]],
    recipientType: 'all',
    recipientRoleId: '',
    recipientIds: [],
    recipientDynamic: '',
    channels: ['app'],
    titleTemplate: '',
    bodyTemplate: '',
    urlTemplate: '',
    throttleSeconds: 0,
    priority: 'normal',
    digestMode: 'none',
    respectQuietHours: false,
    dryRun: false,
    extraActions: [],
    escalation: null,
  };
}

// Flat `conditions` <-> grouped `conditionGroups` conversion. Storage stays
// backward compatible: a flat array of leaf conditions (v1 rules) is treated
// as a single AND-group.
function conditionsToGroups(conditions) {
  if (!Array.isArray(conditions) || !conditions.length) return [[]];
  if (conditions.every((c) => Array.isArray(c))) return conditions.length ? conditions : [[]];
  return [conditions];
}
function groupsToConditions(groups) {
  const cleaned = (groups || []).map((g) => g.filter((c) => c.field && c.operator)).filter((g) => g.length);
  if (cleaned.length <= 1) return cleaned[0] || [];
  return cleaned;
}

export default function NotificationRulesPanel() {
  const qc = useQueryClient();
  const rulesQ = useQuery({ queryKey: ['notification-rules'], queryFn: () => api.notificationRules() });
  const eventsQ = useQuery({ queryKey: ['notification-rule-events'], queryFn: () => api.notificationRuleEvents() });
  const rolesQ = useQuery({ queryKey: ['notification-rule-roles'], queryFn: () => api.notificationRuleRoles() });
  const usersQ = useQuery({ queryKey: ['notification-rule-users'], queryFn: () => api.notificationRuleUsers() });
  const scheduleQ = useQuery({ queryKey: ['notification-rule-schedule-entities'], queryFn: () => api.notificationRuleScheduleEntities() });
  const tagsQ = useQuery({ queryKey: ['notification-rule-tags'], queryFn: () => api.notificationRuleTags() });

  const [form, setForm] = useState(null); // null = list view, object = editor
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState(null);

  const events = eventsQ.data?.events || [];
  const channels = eventsQ.data?.channels || [];
  const scheduleEntities = scheduleQ.data?.entities || [];
  const tags = tagsQ.data?.tags || [];
  const eventMeta = useMemo(() => events.find((e) => e.key === form?.eventKey), [events, form?.eventKey]);
  const entityMeta = useMemo(() => scheduleEntities.find((e) => e.key === form?.scheduleEntity), [scheduleEntities, form?.scheduleEntity]);
  const activeMeta = form?.triggerType === 'schedule' ? entityMeta : eventMeta;
  const fieldOptions = activeMeta?.fields || [];
  const dynamicRecipientOptions = form?.triggerType === 'schedule'
    ? (entityMeta?.dynamicRecipients || []).map((key) => ({ id: key, label: key }))
    : (eventMeta?.dynamicRecipients || []);

  const runsQ = useQuery({
    queryKey: ['notification-rule-runs', form?.id],
    queryFn: () => api.notificationRuleRuns(form.id),
    enabled: !!form?.id,
  });

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
  const testMut = useMutation({
    mutationFn: (id) => api.testNotificationRule(id),
    onSuccess: (data) => setTestResult(data.result),
    onError: (e) => setError(e.message),
  });

  function openEdit(rule) {
    setError(''); setTestResult(null);
    if (!rule) { setForm(emptyForm()); return; }
    const offset = minutesToOffset(rule.scheduleOffsetMinutes);
    setForm({
      id: rule.id, name: rule.name, enabled: rule.enabled,
      triggerType: rule.triggerType || 'event',
      eventKey: rule.eventKey || '',
      scheduleEntity: rule.scheduleEntity || '', scheduleDateField: rule.scheduleDateField || '',
      scheduleOffsetValue: offset.value, scheduleOffsetUnit: offset.unit, scheduleOffsetDirection: offset.direction,
      scheduleRecurrence: rule.scheduleRecurrence || 'once',
      conditionLogic: rule.conditionLogic || 'and',
      conditionGroups: conditionsToGroups(rule.conditions),
      recipientType: rule.recipientType,
      recipientRoleId: rule.recipientRoleId || '', recipientIds: rule.recipientIds || [],
      recipientDynamic: rule.recipientDynamic || '', channels: rule.channels || [],
      titleTemplate: rule.titleTemplate || '', bodyTemplate: rule.bodyTemplate || '', urlTemplate: rule.urlTemplate || '',
      throttleSeconds: rule.throttleSeconds || 0,
      priority: rule.priority || 'normal', digestMode: rule.digestMode || 'none',
      respectQuietHours: !!rule.respectQuietHours, dryRun: !!rule.dryRun,
      extraActions: rule.extraActions || [], escalation: rule.escalation || null,
    });
  }

  function updateCondition(gi, ci, patch) {
    setForm((f) => ({
      ...f,
      conditionGroups: f.conditionGroups.map((g, gidx) => (gidx !== gi ? g : g.map((c, cidx) => (cidx === ci ? { ...c, ...patch } : c)))),
    }));
  }
  function addCondition(gi) {
    setForm((f) => ({
      ...f,
      conditionGroups: f.conditionGroups.map((g, gidx) => (gidx !== gi ? g : [...g, { field: fieldOptions[0]?.key || '', operator: 'eq', value: '' }])),
    }));
  }
  function removeCondition(gi, ci) {
    setForm((f) => ({ ...f, conditionGroups: f.conditionGroups.map((g, gidx) => (gidx !== gi ? g : g.filter((_, cidx) => cidx !== ci))) }));
  }
  function addGroup() {
    setForm((f) => ({ ...f, conditionGroups: [...f.conditionGroups, []] }));
  }
  function removeGroup(gi) {
    setForm((f) => ({ ...f, conditionGroups: f.conditionGroups.length > 1 ? f.conditionGroups.filter((_, idx) => idx !== gi) : f.conditionGroups }));
  }
  function toggleChannel(ch) {
    setForm((f) => ({ ...f, channels: f.channels.includes(ch) ? f.channels.filter((c) => c !== ch) : [...f.channels, ch] }));
  }
  function addExtraAction(type) {
    setForm((f) => ({
      ...f,
      extraActions: [...f.extraActions, type === 'create_follow_up' ? { type, title: '', dueInDays: 1 }
        : type === 'add_tag' ? { type, tagId: tags[0]?.id || '' } : { type, url: '' }],
    }));
  }
  function updateExtraAction(i, patch) {
    setForm((f) => ({ ...f, extraActions: f.extraActions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) }));
  }
  function removeExtraAction(i) {
    setForm((f) => ({ ...f, extraActions: f.extraActions.filter((_, idx) => idx !== i) }));
  }
  function toggleEscalation(on) {
    setForm((f) => ({ ...f, escalation: on ? { afterMinutes: 60, recipientType: 'role', recipientRoleId: '', recipientIds: [], channels: ['app'] } : null }));
  }

  function submit() {
    if (!form.channels.length) { setError('Επίλεξε τουλάχιστον ένα κανάλι'); return; }
    if (!form.titleTemplate.trim()) { setError('Ο τίτλος είναι υποχρεωτικός'); return; }
    if (form.triggerType === 'event' && !form.eventKey) { setError('Επίλεξε γεγονός'); return; }
    if (form.triggerType === 'schedule' && (!form.scheduleEntity || !form.scheduleDateField)) { setError('Επίλεξε οντότητα και πεδίο ημερομηνίας'); return; }
    saveMut.mutate({
      ...form,
      conditions: groupsToConditions(form.conditionGroups),
      recipientRoleId: form.recipientType === 'role' ? Number(form.recipientRoleId) || null : null,
      recipientIds: form.recipientType === 'users' ? form.recipientIds.map(Number) : [],
      scheduleOffsetMinutes: offsetToMinutes({ value: form.scheduleOffsetValue, unit: form.scheduleOffsetUnit, direction: form.scheduleOffsetDirection }),
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20 }}>
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              <span style={labelText}>Ενεργός</span>
            </label>
          </div>
          <div style={{ ...row, marginTop: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="radio" checked={form.triggerType === 'event'} onChange={() => setForm({ ...form, triggerType: 'event' })} />
              <span style={labelText}>Όταν συμβεί κάτι (event)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="radio" checked={form.triggerType === 'schedule'} onChange={() => setForm({ ...form, triggerType: 'schedule' })} />
              <span style={labelText}>Σε προγραμματισμένη στιγμή (πριν/μετά από ημερομηνία)</span>
            </label>
          </div>

          {form.triggerType === 'event' ? (
            <div style={{ marginTop: 10 }}>
              <label style={label}>
                <span style={labelText}>Γεγονός (event)</span>
                <select value={form.eventKey} onChange={(e) => setForm({ ...form, eventKey: e.target.value, conditionGroups: [[]] })}>
                  <option value="">— επίλεξε —</option>
                  {events.map((ev) => <option key={ev.key} value={ev.key}>{ev.label}</option>)}
                </select>
              </label>
              {eventMeta?.description && <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{eventMeta.description}</div>}
            </div>
          ) : (
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              <div style={row}>
                <label style={{ ...label, flex: '1 1 220px' }}>
                  <span style={labelText}>Οντότητα</span>
                  <select value={form.scheduleEntity} onChange={(e) => setForm({ ...form, scheduleEntity: e.target.value, scheduleDateField: '', conditionGroups: [[]] })}>
                    <option value="">— επίλεξε —</option>
                    {scheduleEntities.map((en) => <option key={en.key} value={en.key}>{en.label}</option>)}
                  </select>
                </label>
                <label style={{ ...label, flex: '1 1 220px' }}>
                  <span style={labelText}>Πεδίο ημερομηνίας</span>
                  <select value={form.scheduleDateField} onChange={(e) => setForm({ ...form, scheduleDateField: e.target.value })} disabled={!entityMeta}>
                    <option value="">— επίλεξε —</option>
                    {(entityMeta?.dateFields || []).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                  </select>
                </label>
              </div>
              <div style={{ ...row, alignItems: 'center' }}>
                <span style={labelText}>Ειδοποίηση</span>
                <input type="number" min={0} style={{ width: 80 }} value={form.scheduleOffsetValue}
                  onChange={(e) => setForm({ ...form, scheduleOffsetValue: Math.max(0, Number(e.target.value) || 0) })} />
                <select value={form.scheduleOffsetUnit} onChange={(e) => setForm({ ...form, scheduleOffsetUnit: e.target.value })}>
                  <option value="minutes">λεπτά</option>
                  <option value="hours">ώρες</option>
                  <option value="days">ημέρες</option>
                </select>
                <select value={form.scheduleOffsetDirection} onChange={(e) => setForm({ ...form, scheduleOffsetDirection: e.target.value })}>
                  <option value="before">πριν από</option>
                  <option value="after">μετά από</option>
                </select>
                <span style={labelText}>το πεδίο ημερομηνίας</span>
              </div>
              <label style={{ ...label, maxWidth: 320 }}>
                <span style={labelText}>Επανάληψη</span>
                <select value={form.scheduleRecurrence} onChange={(e) => setForm({ ...form, scheduleRecurrence: e.target.value })}>
                  {Object.entries(RECURRENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </div>
          )}
        </div>

        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>Συνθήκες (προαιρετικό — αν αφεθούν κενές, ισχύει πάντα)</div>
            {form.conditionGroups.length > 1 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                Συνδυασμός ομάδων:
                <select value={form.conditionLogic} onChange={(e) => setForm({ ...form, conditionLogic: e.target.value })}>
                  <option value="and">ΚΑΙ (όλες οι ομάδες)</option>
                  <option value="or">Ή (τουλάχιστον μία ομάδα)</option>
                </select>
              </label>
            )}
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {form.conditionGroups.map((group, gi) => (
              <div key={gi} style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 10 }}>
                {form.conditionGroups.length > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span className="muted">Ομάδα {gi + 1} (συνθήκες μέσα στην ομάδα συνδυάζονται με ΚΑΙ)</span>
                    <button type="button" className="btn ghost icon" onClick={() => removeGroup(gi)}><Icon name="x" size={12} /></button>
                  </div>
                )}
                <div style={{ display: 'grid', gap: 8 }}>
                  {group.map((c, ci) => (
                    <div key={ci} style={{ ...row, alignItems: 'center' }}>
                      <select value={c.field} onChange={(e) => updateCondition(gi, ci, { field: e.target.value })}>
                        {fieldOptions.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </select>
                      <select value={c.operator} onChange={(e) => updateCondition(gi, ci, { operator: e.target.value })}>
                        {Object.entries(OPERATOR_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <input style={{ flex: '1 1 160px' }} value={c.value} onChange={(e) => updateCondition(gi, ci, { value: e.target.value })} placeholder="τιμή" />
                      <button type="button" className="btn ghost icon" onClick={() => removeCondition(gi, ci)}><Icon name="x" size={14} /></button>
                    </div>
                  ))}
                  <button type="button" className="btn ghost" disabled={!activeMeta} onClick={() => addCondition(gi)}><Icon name="plus" size={14} /> Προσθήκη συνθήκης</button>
                </div>
              </div>
            ))}
            <button type="button" className="btn ghost" disabled={!activeMeta} onClick={addGroup}><Icon name="plus" size={14} /> Προσθήκη ομάδας συνθηκών (Ή)</button>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Παραλήπτες</div>
          <div style={row}>
            <label style={{ ...label, flex: '1 1 260px' }}>
              <span style={labelText}>Τύπος παραλήπτη</span>
              <select value={form.recipientType} onChange={(e) => setForm({ ...form, recipientType: e.target.value })}>
                {Object.entries(RECIPIENT_LABELS).map(([k, v]) => {
                  if (k === 'dynamic' && !dynamicRecipientOptions.length) return null;
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
                  {dynamicRecipientOptions.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
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
            Διαθέσιμες μεταβλητές: {fieldOptions.map((f) => `{{${f.key}}}`).join(', ') || '—'}
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
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Χρονισμός &amp; προτεραιότητα</div>
          <div style={row}>
            <label style={{ ...label, maxWidth: 220 }}>
              <span style={labelText}>Throttle (δευτ. — 0 = χωρίς όριο)</span>
              <input type="number" min={0} value={form.throttleSeconds} onChange={(e) => setForm({ ...form, throttleSeconds: Number(e.target.value) || 0 })} />
            </label>
            <label style={{ ...label, maxWidth: 260 }}>
              <span style={labelText}>Ομαδοποίηση (digest)</span>
              <select value={form.digestMode} onChange={(e) => setForm({ ...form, digestMode: e.target.value })}>
                {Object.entries(DIGEST_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label style={{ ...label, maxWidth: 220 }}>
              <span style={labelText}>Προτεραιότητα</span>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="normal">Κανονική</option>
                <option value="urgent">Επείγουσα (αγνοεί ώρες ησυχίας)</option>
              </select>
            </label>
          </div>
          <div style={{ ...row, marginTop: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.respectQuietHours} onChange={(e) => setForm({ ...form, respectQuietHours: e.target.checked })} />
              <span style={labelText}>Σεβασμός ωρών ησυχίας παραλήπτη</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.dryRun} onChange={(e) => setForm({ ...form, dryRun: e.target.checked })} />
              <span style={labelText}>Δοκιμαστική λειτουργία (καταγράφει αλλά δεν στέλνει)</span>
            </label>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Επιπλέον ενέργειες κατά την ενεργοποίηση</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {form.extraActions.map((a, i) => (
              <div key={i} style={{ ...row, alignItems: 'center', border: '1px dashed var(--border)', borderRadius: 8, padding: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{EXTRA_ACTION_TYPES[a.type]}</span>
                {a.type === 'create_follow_up' && (<>
                  <input style={{ flex: '1 1 200px' }} placeholder="Τίτλος follow-up" value={a.title} onChange={(e) => updateExtraAction(i, { title: e.target.value })} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5 }}>σε
                    <input type="number" min={0} style={{ width: 60 }} value={a.dueInDays} onChange={(e) => updateExtraAction(i, { dueInDays: Number(e.target.value) || 0 })} /> ημέρες
                  </label>
                </>)}
                {a.type === 'add_tag' && (
                  <select value={a.tagId} onChange={(e) => updateExtraAction(i, { tagId: Number(e.target.value) })}>
                    {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
                {a.type === 'webhook' && (
                  <input style={{ flex: '1 1 260px' }} placeholder="https://..." value={a.url} onChange={(e) => updateExtraAction(i, { url: e.target.value })} />
                )}
                <button type="button" className="btn ghost icon" onClick={() => removeExtraAction(i)}><Icon name="x" size={14} /></button>
              </div>
            ))}
            <div style={row}>
              {Object.entries(EXTRA_ACTION_TYPES).map(([k, v]) => (
                <button key={k} type="button" className="btn ghost" onClick={() => addExtraAction(k)}><Icon name="plus" size={14} /> {v}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>Κλιμάκωση (escalation)</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
              <input type="checkbox" checked={!!form.escalation} onChange={(e) => toggleEscalation(e.target.checked)} /> Ενεργή
            </label>
          </div>
          {form.escalation && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="muted" style={{ fontSize: 12.5 }}>Αν κανείς δεν διαβάσει την ειδοποίηση εντός του χρόνου, στέλνεται και σε επιπλέον παραλήπτες.</div>
              <div style={row}>
                <label style={{ ...label, maxWidth: 200 }}>
                  <span style={labelText}>Μετά από (λεπτά)</span>
                  <input type="number" min={1} value={form.escalation.afterMinutes} onChange={(e) => setForm({ ...form, escalation: { ...form.escalation, afterMinutes: Number(e.target.value) || 1 } })} />
                </label>
                <label style={{ ...label, flex: '1 1 220px' }}>
                  <span style={labelText}>Παραλήπτες κλιμάκωσης</span>
                  <select value={form.escalation.recipientType} onChange={(e) => setForm({ ...form, escalation: { ...form.escalation, recipientType: e.target.value } })}>
                    <option value="role">Ρόλος</option>
                    <option value="users">Συγκεκριμένοι χρήστες</option>
                  </select>
                </label>
              </div>
              {form.escalation.recipientType === 'role' ? (
                <label style={{ ...label, maxWidth: 260 }}>
                  <span style={labelText}>Ρόλος</span>
                  <select value={form.escalation.recipientRoleId || ''} onChange={(e) => setForm({ ...form, escalation: { ...form.escalation, recipientRoleId: e.target.value } })}>
                    <option value="">— επίλεξε —</option>
                    {(rolesQ.data?.roles || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </label>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6, maxHeight: 150, overflow: 'auto' }}>
                  {(usersQ.data?.users || []).map((u) => (
                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <input type="checkbox" checked={(form.escalation.recipientIds || []).includes(u.id)}
                        onChange={() => setForm((f) => { const ids = f.escalation.recipientIds || []; return { ...f, escalation: { ...f.escalation, recipientIds: ids.includes(u.id) ? ids.filter((x) => x !== u.id) : [...ids, u.id] } }; })} />
                      {u.full_name}
                    </label>
                  ))}
                </div>
              )}
              <div style={row}>
                {channels.map((ch) => (
                  <label key={ch} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
                    <input type="checkbox" checked={(form.escalation.channels || []).includes(ch)}
                      onChange={() => setForm((f) => { const cs = f.escalation.channels || []; return { ...f, escalation: { ...f.escalation, channels: cs.includes(ch) ? cs.filter((c) => c !== ch) : [...cs, ch] } }; })} />
                    {CHANNEL_LABELS[ch]?.label || ch}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {form.id && (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>Πρόσφατες εκτελέσεις</div>
              <button type="button" className="btn ghost" disabled={testMut.isPending} onClick={() => testMut.mutate(form.id)}>
                {testMut.isPending ? 'Δοκιμή…' : 'Δοκιμή τώρα (dry-run)'}
              </button>
            </div>
            {testResult && (
              <div className="alert" style={{ marginBottom: 10, fontSize: 12.5 }}>
                Αποτέλεσμα δοκιμής: {testResult.fired ? `Θα ενεργοποιούνταν, ${testResult.recipientCount ?? ''} παραλήπτες.` : (testResult.reason || 'Δεν πληρούνται οι συνθήκες.')}
              </div>
            )}
            {!runsQ.data?.runs?.length && <div className="muted" style={{ fontSize: 12.5 }}>Δεν υπάρχουν εκτελέσεις ακόμα.</div>}
            <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflow: 'auto' }}>
              {(runsQ.data?.runs || []).map((r) => (
                <div key={r.id} style={{ fontSize: 12.5, display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                  <span>{new Date(r.createdAt).toLocaleString('el-GR')}</span>
                  <span>{r.status}{r.dryRun ? ' (dry-run)' : ''} · {r.recipientCount ?? 0} παραλήπτες</span>
                </div>
              ))}
            </div>
          </div>
        )}

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
          const en = scheduleEntities.find((e) => e.key === rule.scheduleEntity);
          const triggerLabel = rule.triggerType === 'schedule'
            ? `⏱ ${en?.label || rule.scheduleEntity || ''}`
            : (ev?.label || rule.eventKey);
          return (
            <div key={rule.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>
                  {rule.name}
                  {rule.priority === 'urgent' && <span style={{ marginLeft: 6, fontSize: 11, color: '#b91c1c' }}>ΕΠΕΙΓΟΝ</span>}
                  {rule.dryRun && <span style={{ marginLeft: 6, fontSize: 11 }}>(dry-run)</span>}
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {triggerLabel} · {(rule.channels || []).map((c) => CHANNEL_LABELS[c]?.label || c).join(', ')}
                  {rule.digestMode && rule.digestMode !== 'none' ? ` · ${DIGEST_LABELS[rule.digestMode]}` : ''}
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

