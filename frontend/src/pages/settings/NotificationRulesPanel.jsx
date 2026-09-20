import { useEffect, useMemo, useRef, useState } from 'react';
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
  viber_routee: { label: 'Viber Routee', icon: 'message' },
  telegram: { label: 'Telegram', icon: 'message' },
};

const OPERATOR_LABELS = {
  eq: 'ίσο με', neq: 'διαφορετικό από', gt: 'μεγαλύτερο από', gte: 'μεγαλύτερο ή ίσο με',
  lt: 'μικρότερο από', lte: 'μικρότερο ή ίσο με', contains: 'περιέχει',
};

const RECIPIENT_LABELS = { all: 'Όλοι οι χρήστες', role: 'Συγκεκριμένος ρόλος', users: 'Συγκεκριμένοι χρήστες', dynamic: 'Δυναμικός παραλήπτης (από το ίδιο το γεγονός)' };

const CHANNEL_RECIPIENT_LABELS = { inherit: 'Ίδιος με τους παραπάνω παραλήπτες', customer: 'Ο πελάτης της εγγραφής', custom: 'Προσαρμοσμένο (τηλέφωνο/email/μεταβλητή)' };

const STATUS_LABELS = {
  sent: 'Στάλθηκε', failed: 'Απέτυχε', throttled: 'Ανεστάλη (throttle)', opted_out: 'Εξαίρεση χρήστη',
  quiet_hours: 'Ώρες ησυχίας', queued_digest: 'Σε αναμονή (συγκεντρωτικό)', dry_run: 'Δοκιμή (dry-run)',
  not_applicable: 'Μη εφαρμόσιμο', no_contact: 'Χωρίς στοιχεία επικοινωνίας',
};
const STATUS_COLORS = {
  sent: { bg: '#dcfce7', fg: '#166534' }, failed: { bg: '#fee2e2', fg: '#991b1b' },
  throttled: { bg: '#f1f5f9', fg: '#475569' }, opted_out: { bg: '#f1f5f9', fg: '#475569' },
  quiet_hours: { bg: '#f1f5f9', fg: '#475569' }, queued_digest: { bg: '#dbeafe', fg: '#1e40af' },
  dry_run: { bg: '#ede9fe', fg: '#5b21b6' }, not_applicable: { bg: '#f1f5f9', fg: '#475569' },
  no_contact: { bg: '#ffedd5', fg: '#9a3412' },
};

const TABS = [
  { key: 'trigger', label: 'Ενεργοποίηση' },
  { key: 'conditions', label: 'Συνθήκες' },
  { key: 'recipients', label: 'Παραλήπτες & Κανάλια' },
  { key: 'content', label: 'Περιεχόμενο' },
  { key: 'timing', label: 'Χρονισμός & Escalation' },
  { key: 'runs', label: 'Εκτελέσεις' },
];

// Simple client-side mirror of the backend's {{a.b}} template renderer, used
// for the live preview and to pre-render the exact text a "test send" posts.
function renderPreviewTemplate(tpl, ctx) {
  if (!tpl) return '';
  return String(tpl).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const val = path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), ctx);
    return val == null ? '' : String(val);
  });
}
function sampleValueFor(field) {
  if (field.type === 'number') return 100;
  return `Παράδειγμα ${field.label}`;
}
function buildSample(fieldOptions) {
  const out = {};
  for (const f of fieldOptions) out[f.key] = sampleValueFor(f);
  return out;
}
function smsSegmentInfo(text) {
  const len = (text || '').length;
  const gsm = /^[\x00-\x7F\u0391-\u03A9\u03B1-\u03C9€]*$/.test(text || '');
  const perSegment = gsm ? 160 : 70;
  const segments = len === 0 ? 0 : Math.ceil(len / (len > perSegment ? perSegment - 7 : perSegment));
  return { len, segments, unicode: !gsm };
}

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
    channelOverrides: {},
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
  const [activeTab, setActiveTab] = useState('trigger');
  const [sample, setSample] = useState({});
  const [lastFocused, setLastFocused] = useState('body');
  const [testSendTo, setTestSendTo] = useState({}); // { [channel]: address }
  const [testSendResult, setTestSendResult] = useState({}); // { [channel]: { ok, status } }
  const [search, setSearch] = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const [filterEnabled, setFilterEnabled] = useState('');
  const [runStatusFilter, setRunStatusFilter] = useState('');
  const titleRef = useRef(null);
  const bodyRef = useRef(null);

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

  useEffect(() => {
    setSample(buildSample(fieldOptions));
  }, [fieldOptions]);

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
  const testSendMut = useMutation({
    mutationFn: ({ id, channel, to, title, body }) => api.testSendNotificationChannel(id, { channel, to, title, body }),
    onSuccess: (data, vars) => setTestSendResult((r) => ({ ...r, [vars.channel]: data })),
    onError: (e, vars) => setTestSendResult((r) => ({ ...r, [vars.channel]: { ok: false, status: 'error', detail: e.message } })),
  });

  function openEdit(rule) {
    setError(''); setTestResult(null); setActiveTab('trigger'); setTestSendTo({}); setTestSendResult({});
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
      channelOverrides: rule.channelOverrides || {},
      titleTemplate: rule.titleTemplate || '', bodyTemplate: rule.bodyTemplate || '', urlTemplate: rule.urlTemplate || '',
      throttleSeconds: rule.throttleSeconds || 0,
      priority: rule.priority || 'normal', digestMode: rule.digestMode || 'none',
      respectQuietHours: !!rule.respectQuietHours, dryRun: !!rule.dryRun,
      extraActions: rule.extraActions || [], escalation: rule.escalation || null,
    });
  }

  function duplicateRule(rule) {
    openEdit(rule);
    setForm((f) => ({ ...f, id: null, name: `${rule.name} (αντίγραφο)`, enabled: false }));
  }

  // Inserts {{key}} at the cursor of whichever of title/body was last
  // focused (falls back to appending at the end when nothing is focused).
  function insertVariable(key) {
    const token = `{{${key}}}`;
    const targetKey = lastFocused === 'title' ? 'titleTemplate' : 'bodyTemplate';
    const el = lastFocused === 'title' ? titleRef.current : bodyRef.current;
    setForm((f) => {
      const cur = f[targetKey] || '';
      if (el && document.activeElement === el && typeof el.selectionStart === 'number') {
        const start = el.selectionStart, end = el.selectionEnd;
        const next = cur.slice(0, start) + token + cur.slice(end);
        requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = start + token.length; });
        return { ...f, [targetKey]: next };
      }
      return { ...f, [targetKey]: cur ? `${cur} ${token}` : token };
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
  function updateChannelOverride(ch, patch) {
    setForm((f) => ({
      ...f,
      channelOverrides: {
        ...f.channelOverrides,
        [ch]: { recipientType: 'inherit', customValue: '', titleTemplate: '', bodyTemplate: '', ...(f.channelOverrides[ch] || {}), ...patch },
      },
    }));
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
        <div style={{ ...row, justifyContent: 'space-between', alignItems: 'center' }}>
          <button type="button" className="btn ghost" onClick={() => setForm(null)}><Icon name="arrowLeft" size={14} /> Πίσω στη λίστα</button>
          <span style={{ fontWeight: 700 }}>{form.id ? 'Επεξεργασία κανόνα' : 'Νέος κανόνας'}{form.name ? `: ${form.name}` : ''}</span>
        </div>
        <div style={{
          ...row, position: 'sticky', top: 0, zIndex: 5, background: '#fff', padding: '8px 0',
          borderBottom: '1px solid var(--border)',
        }}>
          {TABS.filter((t) => t.key !== 'runs' || form.id).map((t) => (
            <button
              key={t.key} type="button"
              className={activeTab === t.key ? 'btn primary' : 'btn ghost'}
              style={{ fontSize: 12.5, padding: '6px 12px' }}
              onClick={() => { setActiveTab(t.key); document.getElementById(`nrp-${t.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {error && <div className="alert error">{error}</div>}

        <div id="nrp-trigger" style={card}>
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

        <div id="nrp-conditions" style={card}>
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

        <div id="nrp-recipients" style={card}>
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

        {!!form.channels.length && (
          <div style={card}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Εξατομίκευση ανά κανάλι (προαιρετικό)</div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
              Στείλε ένα κανάλι σε διαφορετικό παραλήπτη (π.χ. SMS/Viber απευθείας στο τηλέφωνο του πελάτη της εγγραφής) ή/και με δικό του κείμενο, ενώ τα υπόλοιπα κανάλια ακολουθούν τους παραπάνω παραλήπτες και το βασικό περιεχόμενο.
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {form.channels.map((ch) => {
                const ov = form.channelOverrides[ch] || {};
                const recipientType = ov.recipientType || 'inherit';
                return (
                  <div key={ch} style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{CHANNEL_LABELS[ch]?.label || ch}</div>
                    {ch !== 'app' && (
                      <div style={{ ...row, alignItems: 'center' }}>
                        <label style={{ ...label, flex: '1 1 220px' }}>
                          <span style={labelText}>Παραλήπτης</span>
                          <select value={recipientType} onChange={(e) => updateChannelOverride(ch, { recipientType: e.target.value })}>
                            {Object.entries(CHANNEL_RECIPIENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </label>
                        {recipientType === 'custom' && (
                          <label style={{ ...label, flex: '1 1 220px' }}>
                            <span style={labelText}>Τιμή (μπορεί να έχει {'{{'}μεταβλητές{'}}'})</span>
                            <input value={ov.customValue || ''} onChange={(e) => updateChannelOverride(ch, { customValue: e.target.value })} placeholder="π.χ. {{customerPhone}} ή +306912345678" />
                          </label>
                        )}
                      </div>
                    )}
                    <div style={{ display: 'grid', gap: 8, marginTop: ch !== 'app' ? 8 : 0 }}>
                      <label style={label}>
                        <span style={labelText}>Τίτλος (προαιρετικό — αλλιώς το βασικό)</span>
                        <input value={ov.titleTemplate || ''} onChange={(e) => updateChannelOverride(ch, { titleTemplate: e.target.value })} placeholder={form.titleTemplate || '—'} />
                      </label>
                      <label style={label}>
                        <span style={labelText}>Κείμενο (προαιρετικό — αλλιώς το βασικό)</span>
                        <textarea rows={2} value={ov.bodyTemplate || ''} onChange={(e) => updateChannelOverride(ch, { bodyTemplate: e.target.value })} placeholder={form.bodyTemplate || '—'} />
                      </label>
                    </div>
                    {(() => {
                      const effTitle = ov.titleTemplate || form.titleTemplate || '';
                      const effBody = ov.bodyTemplate || form.bodyTemplate || '';
                      const rendered = { title: renderPreviewTemplate(effTitle, sample), body: renderPreviewTemplate(effBody, sample) };
                      const isSmsLike = ['sms', 'viber', 'viber_routee', 'telegram'].includes(ch);
                      const seg = isSmsLike ? smsSegmentInfo(rendered.body) : null;
                      const res = testSendResult[ch];
                      return (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                          <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>
                            Προεπισκόπηση: {rendered.body || '—'}
                            {seg && ` · ${seg.len} χαρακτήρες, ${seg.segments || 0} SMS τμήμα(τα) (${seg.unicode ? 'Unicode' : 'GSM'})`}
                          </div>
                          {ch !== 'app' && (
                            <div style={{ ...row, alignItems: 'center' }}>
                              <input style={{ flex: '1 1 200px' }} placeholder={ch === 'email' ? 'test@example.com' : '+306912345678'}
                                value={testSendTo[ch] || ''} onChange={(e) => setTestSendTo((t) => ({ ...t, [ch]: e.target.value }))} />
                              <button type="button" className="btn ghost" disabled={!form.id || !testSendTo[ch] || testSendMut.isPending}
                                title={!form.id ? 'Αποθήκευσε πρώτα τον κανόνα για να κάνεις δοκιμαστική αποστολή' : ''}
                                onClick={() => testSendMut.mutate({ id: form.id, channel: ch, to: testSendTo[ch], title: rendered.title, body: rendered.body })}>
                                {testSendMut.isPending ? 'Αποστολή…' : 'Δοκιμαστική αποστολή'}
                              </button>
                              {res && (
                                <span style={{ fontSize: 12, color: res.ok ? '#166534' : '#991b1b' }}>
                                  {res.ok ? 'Στάλθηκε ✓' : `Απέτυχε: ${res.detail || res.status || ''}`}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div id="nrp-content" style={card}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Περιεχόμενο</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>
            Κάνε κλικ σε μια μεταβλητή για να την εισάγεις στο πεδίο που επεξεργάζεσαι (τίτλος ή κείμενο):
          </div>
          <div style={{ ...row, marginBottom: 10 }}>
            {fieldOptions.length ? fieldOptions.map((f) => (
              <button key={f.key} type="button" className="btn ghost" style={{ fontSize: 12, padding: '3px 8px' }} onClick={() => insertVariable(f.key)}>
                {`{{${f.key}}}`}
              </button>
            )) : <span className="muted" style={{ fontSize: 12.5 }}>Επίλεξε πρώτα γεγονός/οντότητα στο βήμα "Ενεργοποίηση".</span>}
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={label}>
              <span style={labelText}>Τίτλος</span>
              <input ref={titleRef} value={form.titleTemplate} onFocus={() => setLastFocused('title')}
                onChange={(e) => setForm({ ...form, titleTemplate: e.target.value })} placeholder="π.χ. Νέα προσφορά {{total}}€" />
              <span className="muted" style={{ fontSize: 11.5 }}>Προεπισκόπηση: {renderPreviewTemplate(form.titleTemplate, sample) || '—'}</span>
            </label>
            <label style={label}>
              <span style={labelText}>Κείμενο</span>
              <textarea ref={bodyRef} rows={3} value={form.bodyTemplate} onFocus={() => setLastFocused('body')}
                onChange={(e) => setForm({ ...form, bodyTemplate: e.target.value })} placeholder="π.χ. Πελάτης: {{customerName}}" />
              <span className="muted" style={{ fontSize: 11.5 }}>Προεπισκόπηση: {renderPreviewTemplate(form.bodyTemplate, sample) || '—'}</span>
            </label>
            <label style={label}>
              <span style={labelText}>URL (προαιρετικό — άνοιγμα κατά το κλικ)</span>
              <input value={form.urlTemplate} onChange={(e) => setForm({ ...form, urlTemplate: e.target.value })} placeholder="/quotes/{{entityId}}" />
            </label>
          </div>
          {!!fieldOptions.length && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 12.5, cursor: 'pointer' }}>Δοκιμαστικές τιμές (για την προεπισκόπηση παραπάνω)</summary>
              <div style={{ ...row, marginTop: 8 }}>
                {fieldOptions.map((f) => (
                  <label key={f.key} style={{ ...label, flex: '1 1 180px' }}>
                    <span style={labelText}>{f.label}</span>
                    <input value={sample[f.key] ?? ''} onChange={(e) => setSample((s) => ({ ...s, [f.key]: e.target.value }))} />
                  </label>
                ))}
              </div>
            </details>
          )}
        </div>

        <div id="nrp-timing" style={card}>
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
          <div id="nrp-runs" style={card}>
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
            {!!runsQ.data?.runs?.length && (
              <div style={{ ...row, marginBottom: 8, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                  <span className="muted">Κατάσταση:</span>
                  <select value={runStatusFilter} onChange={(e) => setRunStatusFilter(e.target.value)}>
                    <option value="">Όλες</option>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
              </div>
            )}
            {!runsQ.data?.runs?.length && <div className="muted" style={{ fontSize: 12.5 }}>Δεν υπάρχουν εκτελέσεις ακόμα.</div>}
            <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflow: 'auto' }}>
              {(runsQ.data?.runs || []).filter((r) => !runStatusFilter || r.status === runStatusFilter).map((r) => {
                const sc = STATUS_COLORS[r.status] || { bg: '#f1f5f9', fg: '#475569' };
                return (
                  <div key={r.id} style={{ fontSize: 12.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                    <span>{new Date(r.createdAt).toLocaleString('el-GR')}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ background: sc.bg, color: sc.fg, borderRadius: 999, padding: '2px 8px', fontWeight: 600, fontSize: 11.5 }}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                      {r.channel && <Icon name={CHANNEL_LABELS[r.channel]?.icon || 'message'} size={13} />}
                      {r.channel ? (CHANNEL_LABELS[r.channel]?.label || r.channel) : ''}
                      {r.recipientLabel ? ` · ${r.recipientLabel}` : ''}
                      {r.reason ? ` (${r.reason})` : ''}
                    </span>
                  </div>
                );
              })}
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

  const allRules = rulesQ.data?.rules || [];
  const filteredRules = allRules.filter((rule) => {
    if (search && !rule.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterChannel && !(rule.channels || []).includes(filterChannel)) return false;
    if (filterEnabled === 'on' && !rule.enabled) return false;
    if (filterEnabled === 'off' && rule.enabled) return false;
    return true;
  });

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ ...row, justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" className="btn primary" onClick={() => openEdit(null)}><Icon name="plus" size={14} /> Νέος κανόνας</button>
        <div style={{ ...row, alignItems: 'center' }}>
          <input placeholder="Αναζήτηση με όνομα…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 200 }} />
          <select value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)}>
            <option value="">Όλα τα κανάλια</option>
            {Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterEnabled} onChange={(e) => setFilterEnabled(e.target.value)}>
            <option value="">Όλες οι καταστάσεις</option>
            <option value="on">Μόνο ενεργοί</option>
            <option value="off">Μόνο ανενεργοί</option>
          </select>
        </div>
      </div>
      {!allRules.length && <div className="muted">Δεν υπάρχουν κανόνες ειδοποιήσεων ακόμα.</div>}
      {!!allRules.length && !filteredRules.length && <div className="muted">Κανένας κανόνας δεν ταιριάζει με τα φίλτρα.</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        {filteredRules.map((rule) => {
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
                <button type="button" className="btn ghost icon" title="Αντιγραφή" onClick={() => duplicateRule(rule)}><Icon name="copy" size={14} /></button>
                <button type="button" className="btn ghost icon" onClick={() => { if (confirm(`Διαγραφή του κανόνα "${rule.name}";`)) deleteMut.mutate(rule.id); }}><Icon name="x" size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

