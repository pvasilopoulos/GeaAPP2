import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Skeleton } from '../../components/ui.jsx';

const inp = { width: '100%', height: 40, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 9 };
const chk = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, padding: '4px 0' };

const WEEKDAYS = [
  { v: 1, l: 'Δευ' }, { v: 2, l: 'Τρι' }, { v: 3, l: 'Τετ' }, { v: 4, l: 'Πεμ' },
  { v: 5, l: 'Παρ' }, { v: 6, l: 'Σαβ' }, { v: 0, l: 'Κυρ' },
];

const CHANNEL_LABELS = { in_app: 'Εντός εφαρμογής', email: 'Email', sms: 'SMS', viber: 'Viber', telegram: 'Telegram' };
const OVERDUE_LABELS = {
  always: 'Άμεσα εκπρόθεσμο μόλις περάσει η ώρα',
  respect_working_hours: 'Μόνο εντός εργάσιμου ωραρίου',
};

function minutesLabel(m) {
  if (m % 1440 === 0) return `${m / 1440} ημ.`;
  if (m % 60 === 0) return `${m / 60} ώρες`;
  return `${m} λεπτά`;
}

function toggleInList(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function RemindersPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['settings-reminders'],
    queryFn: ({ signal }) => api.reminderSettings({ signal }),
  });
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { if (data?.reminders) setF(data.reminders); }, [data]);

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setMsg(''); setSaving(true);
    try {
      const res = await api.updateReminderSettings(f);
      setF(res.reminders);
      qc.invalidateQueries({ queryKey: ['settings-reminders'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      setMsg('Αποθηκεύτηκε.');
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };

  if (isLoading || !f) return <div className="card card-pad"><Skeleton h={220} /></div>;

  return (
    <form onSubmit={submit} className="stack" style={{ maxWidth: 680 }}>
      {err && <div className="auth-error">{err}</div>}
      {msg && <div className="voice-msg ok">{msg}</div>}
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        Ελέγξτε πώς εμφανίζονται και ειδοποιούν οι υπενθυμίσεις/follow-ups πελατών στο dashboard και στην κάρτα πελάτη.
      </p>

      <div className="card card-pad">
        <label style={chk}>
          <input type="checkbox" checked={!!f.enabled} onChange={(e) => setF((s) => ({ ...s, enabled: e.target.checked }))} />
          Ενεργοποίηση προηγμένων υπενθυμίσεων
        </label>

        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <div className="field-group" style={{ flex: 1 }}>
            <label>Προεπιλεγμένη ώρα υπενθύμισης</label>
            <input style={inp} type="time" value={f.defaultTime} onChange={(e) => setF((s) => ({ ...s, defaultTime: e.target.value }))} />
          </div>
          <div className="field-group" style={{ flex: 1 }}>
            <label>Προειδοποίηση πριν τη λήξη ("επείγον" σε)</label>
            <select style={inp} value={f.defaultLeadMinutes} onChange={(e) => setF((s) => ({ ...s, defaultLeadMinutes: Number(e.target.value) }))}>
              {f.leadMinutesOptions.map((m) => <option key={m} value={m}>{minutesLabel(m)}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Εργάσιμο ωράριο</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {WEEKDAYS.map((d) => (
            <button type="button" key={d.v}
              className={`btn btn-sm${f.workingDays.includes(d.v) ? ' btn-accent' : ''}`}
              onClick={() => setF((s) => ({ ...s, workingDays: toggleInList(s.workingDays, d.v) }))}>
              {d.l}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field-group" style={{ flex: 1 }}><label>Από</label>
            <input style={inp} type="time" value={f.workingHoursStart} onChange={(e) => setF((s) => ({ ...s, workingHoursStart: e.target.value }))} /></div>
          <div className="field-group" style={{ flex: 1 }}><label>Έως</label>
            <input style={inp} type="time" value={f.workingHoursEnd} onChange={(e) => setF((s) => ({ ...s, workingHoursEnd: e.target.value }))} /></div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="field-group">
          <label>Συμπεριφορά εκπρόθεσμων υπενθυμίσεων</label>
          <select style={inp} value={f.overdueBehavior} onChange={(e) => setF((s) => ({ ...s, overdueBehavior: e.target.value }))}>
            {Object.entries(OVERDUE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <small className="muted">Με «Μόνο εντός εργάσιμου ωραρίου» μια υπενθύμιση δεν σημαίνεται ως εκπρόθεσμη εκτός του παραπάνω ωραρίου.</small>
        </div>
      </div>

      <div className="card card-pad">
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Κανάλια ειδοποίησης</div>
        {Object.entries(CHANNEL_LABELS).map(([id, label]) => (
          <label key={id} style={chk}>
            <input type="checkbox" checked={f.channels.includes(id)}
              onChange={() => setF((s) => ({ ...s, channels: toggleInList(s.channels, id) }))} />
            {label}
          </label>
        ))}
        <label style={chk}>
          <input type="checkbox" checked={!!f.notifyAssigneeOnly}
            onChange={(e) => setF((s) => ({ ...s, notifyAssigneeOnly: e.target.checked }))} />
          Ειδοποίηση μόνο στον υπεύθυνο εργαζόμενο
        </label>
      </div>

      <div className="card card-pad">
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Επιλογές αναβολής (snooze)</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {f.snoozeMinutesOptions.map((m) => (
            <span key={m} className="pill">{minutesLabel(m)}</span>
          ))}
        </div>
      </div>

      <button className="btn btn-accent" disabled={saving} style={{ alignSelf: 'flex-start' }}>
        {saving ? <span className="spinner" /> : <Icon name="check" size={16} />} Αποθήκευση
      </button>
    </form>
  );
}
