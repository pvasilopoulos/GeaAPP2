import { useState } from 'react';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { AMENITY_LABELS, WEEKDAYS, defaultOpeningHours } from '../lib/format.js';

export function ImageUpload({ value, onChange, label = 'Φωτογραφία' }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr(''); setBusy(true);
    try {
      const res = await api.uploadImage(file);
      onChange(res.url);
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };
  return (
    <div className="field-group">
      <label>{label}</label>
      <div className="img-upload">
        {value
          ? <img src={value} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          : <div className="img-ph"><Icon name="file" size={18} /></div>}
        <div>
          <label className="btn btn-sm">
            {busy ? <span className="spinner" /> : <Icon name="plus" size={14} />} {value ? 'Αλλαγή' : 'Ανέβασμα'}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={onFile} />
          </label>
          {value && <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange('')}>Αφαίρεση</button>}
        </div>
      </div>
      {err && <div className="auth-error" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  );
}

export function HoursEditor({ value, onChange }) {
  const hours = value && typeof value === 'object' ? value : defaultOpeningHours();
  const setDay = (key, patch) => onChange({ ...hours, [key]: { ...hours[key], ...patch } });
  return (
    <div className="field-group">
      <label>Ωράριο λειτουργίας</label>
      <div className="hours-grid">
        {WEEKDAYS.map((d) => {
          const row = hours[d.key] || { open: '09:00', close: '18:00', closed: false };
          return (
            <div className="hours-row" key={d.key}>
              <span className="hours-day">{d.short}</span>
              <label className="hours-closed">
                <input type="checkbox" checked={!row.closed} onChange={(e) => setDay(d.key, { closed: !e.target.checked })} />
                Ανοιχτό
              </label>
              <input type="time" disabled={row.closed} value={row.open || '09:00'} onChange={(e) => setDay(d.key, { open: e.target.value })} />
              <span className="muted">–</span>
              <input type="time" disabled={row.closed} value={row.close || '18:00'} onChange={(e) => setDay(d.key, { close: e.target.value })} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AmenitiesPicker({ value, onChange, catalog }) {
  const selected = Array.isArray(value) ? value : [];
  const items = catalog?.length
    ? catalog
    : Object.entries(AMENITY_LABELS).map(([key, label]) => ({ key, label }));
  const toggle = (key) => onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  return (
    <div className="field-group">
      <label>Παροχές</label>
      <div className="amenity-list">
        {items.map((a) => (
          <label key={a.key} className={`amenity-chip${selected.includes(a.key) ? ' on' : ''}`}>
            <input type="checkbox" checked={selected.includes(a.key)} onChange={() => toggle(a.key)} />
            {a.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function useCustomFieldState(list, initial) {
  // kept as a small util used by forms
  return { list, initial };
}
