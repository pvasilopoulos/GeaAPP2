import Icon from '../../components/Icon.jsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import { useEffect, useState } from 'react';

const TAB_GROUPS = ['Πελάτης', 'Συναλλαγές', 'Επικοινωνία'];

export default function CustomersPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings-app'], queryFn: () => api.appSettings() });
  const [value, onChange] = useState(null);
  const [message, setMessage] = useState('');
  useEffect(() => { if (data?.settings) onChange(data.settings); }, [data]);
  if (isLoading || !value) return <div className="card card-pad">Φόρτωση…</div>;
  const profile = value?.view_preferences?.customer_profile || {};
  const tabs = Array.isArray(profile.tabs) ? profile.tabs : [];
  const setProfile = (patch) => onChange({
    ...value,
    view_preferences: { ...value.view_preferences, customer_profile: { ...profile, ...patch } },
  });
  const move = (index, delta) => {
    const next = [...tabs];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setProfile({ tabs: next.map((tab, order) => ({ ...tab, order })) });
  };
  const save = async () => {
    await api.updateAppSettings(value);
    qc.invalidateQueries({ queryKey: ['settings-app'] });
    qc.invalidateQueries({ queryKey: ['meta'] });
    setMessage('Οι ρυθμίσεις αποθηκεύτηκαν.');
  };
  return (
    <div className="settings-module-panel">
      {message && <div className="voice-msg ok">{message}</div>}
      <div className="section-title" style={{ marginTop: 0 }}>Προεπιλογές πελατών</div>
      <div className="field-group"><label>Προεπιλεγμένη χώρα</label><input className="settings-control" value={value.default_country || ''} onChange={(event) => onChange({ ...value, default_country: event.target.value })} /></div>
      <div className="field-group"><label>Προεπιλεγμένη κατάσταση νέου πελάτη</label>
        <select className="settings-control" value={value.default_customer_status || 'active'} onChange={(event) => onChange({ ...value, default_customer_status: event.target.value })}>
          <option value="active">Ενεργός</option><option value="prospect">Υποψήφιος</option><option value="inactive">Ανενεργός</option>
        </select>
      </div>
      <label className="settings-check"><input type="checkbox" checked={!!value.require_email} onChange={(event) => onChange({ ...value, require_email: event.target.checked })} /> Υποχρεωτικό email</label>
      <label className="settings-check"><input type="checkbox" checked={!!value.strict_duplicates} onChange={(event) => onChange({ ...value, strict_duplicates: event.target.checked })} /> Αυστηρός έλεγχος διπλοεγγραφών</label>
      <label className="settings-check"><input type="checkbox" checked={!!value.allow_vip} onChange={(event) => onChange({ ...value, allow_vip: event.target.checked })} /> Ενεργό VIP</label>
      <div className="section-title" style={{ marginTop: 0 }}>Καρτέλα πελάτη</div>
      <div className="muted settings-help">Ενεργοποιήστε τα tabs, αλλάξτε το όνομά τους και καθορίστε τη σειρά εμφάνισης.</div>
      <div className="field-group">
        <label>Αρχικό tab</label>
        <select className="settings-control" value={profile.default_tab || 'overview'} onChange={(event) => setProfile({ default_tab: event.target.value })}>
          {tabs.filter((tab) => tab.enabled !== false).map((tab) => <option key={tab.key} value={tab.key}>{tab.label}</option>)}
        </select>
      </div>
      <div className="customer-tab-settings-list">
        {TAB_GROUPS.map((group) => (
          <div key={group} className="customer-tab-settings-group">
            <small>{group}</small>
            {tabs.filter((tab) => tab.group === group).map((tab) => {
              const index = tabs.findIndex((item) => item.key === tab.key);
              return <div className="customer-tab-setting" key={tab.key}>
                <button type="button" className="btn btn-icon btn-sm" disabled={index === 0} onClick={() => move(index, -1)} title="Πάνω"><Icon name="chevronDown" size={14} style={{ transform: 'rotate(180deg)' }} /></button>
                <button type="button" className="btn btn-icon btn-sm" disabled={index === tabs.length - 1} onClick={() => move(index, 1)} title="Κάτω"><Icon name="chevronDown" size={14} /></button>
                <Icon name={tab.icon} size={16} />
                <input className="settings-control" value={tab.label} onChange={(event) => setProfile({ tabs: tabs.map((item) => item.key === tab.key ? { ...item, label: event.target.value } : item) })} />
                <label className="settings-toggle"><input type="checkbox" checked={tab.enabled !== false} onChange={(event) => setProfile({ tabs: tabs.map((item) => item.key === tab.key ? { ...item, enabled: event.target.checked } : item) })} /> Ενεργό</label>
              </div>;
            })}
          </div>
        ))}
      </div>
      <div className="section-title">Προβολή υποκαταστήματος</div>
      <div className="muted settings-help">Ορίστε ποια στοιχεία εμφανίζονται μέσα στα υποκαταστήματα.</div>
      {[
        ['show_hours', 'Εμφάνιση ωραρίου'], ['show_map', 'Εμφάνιση χάρτη'], ['show_kpis', 'Εμφάνιση KPIs'],
        ['show_spaces', 'Εμφάνιση χώρων'], ['branch_expanded', 'Το detail υποκαταστήματος να ανοίγει αρχικά'],
        ['show_visits', 'Εμφάνιση πρόσφατων επισκέψεων'], ['spaces_expanded', 'Οι χώροι να εμφανίζονται expanded'], ['visits_expanded', 'Οι επισκέψεις να εμφανίζονται expanded'],
      ].map(([key, label]) => <label className="settings-check" key={key}><input type="checkbox" checked={value?.view_preferences?.branch_detail?.[key] !== false} onChange={(event) => onChange({ ...value, view_preferences: { ...value.view_preferences, branch_detail: { ...value.view_preferences?.branch_detail, [key]: event.target.checked } } })} /> {label}</label>)}
      <button type="button" className="btn btn-accent" onClick={save}><Icon name="check" size={16} /> Αποθήκευση</button>
    </div>
  );
}
