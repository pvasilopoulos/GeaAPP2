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
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data?.settings) onChange(data.settings); }, [data]);
  if (isLoading || !value) return <div className="card card-pad">Φόρτωση…</div>;
  const profile = value?.view_preferences?.customer_profile || {};
  const tabs = Array.isArray(profile.tabs) ? profile.tabs : [];
  const setProfile = (patch) => onChange({
    ...value,
    view_preferences: { ...value.view_preferences, customer_profile: { ...profile, ...patch } },
  });
  const move = (key, delta) => {
    const current = tabs.findIndex((tab) => tab.key === key);
    if (current < 0) return;
    const group = tabs[current].group;
    const groupIndexes = tabs.reduce((result, tab, index) => {
      if (tab.group === group) result.push(index);
      return result;
    }, []);
    const position = groupIndexes.indexOf(current);
    const target = groupIndexes[position + delta];
    if (target === undefined) return;
    const next = [...tabs];
    [next[current], next[target]] = [next[target], next[current]];
    setProfile({ tabs: next.map((tab, order) => ({ ...tab, order })) });
  };
  const save = async () => {
    setSaving(true);
    try {
      await api.updateAppSettings(value);
      qc.invalidateQueries({ queryKey: ['settings-app'] });
      qc.invalidateQueries({ queryKey: ['meta'] });
      setMessage('Οι ρυθμίσεις αποθηκεύτηκαν.');
    } catch (error) {
      setMessage(error.message);
    } finally { setSaving(false); }
  };
  return (
    <div className="settings-module-panel">
      <div className="customers-settings-hero">
        <div className="customers-settings-icon"><Icon name="users" size={22} /></div>
        <div><div className="settings-eyebrow">CUSTOMERS MODULE</div><h2>Ρυθμίσεις πελατών</h2><p>Οργάνωσε την καρτέλα, τις προεπιλογές και την προβολή υποκαταστημάτων.</p></div>
      </div>
      {message && <div className="voice-msg ok">{message}</div>}
      <section className="customers-settings-card">
      <div className="customers-settings-card-head"><div><h3>Λίστα πελατών</h3><p>Ρύθμισε την πυκνότητα των γραμμών στη λίστα.</p></div><Icon name="layers" size={18} /></div>
      <div className="customers-settings-grid"><div className="field-group"><label>Προκαθορισμένο ύψος γραμμής</label>
        <select className="settings-control" value={profile.customer_list_row_height || 68} onChange={(event) => setProfile({ customer_list_row_height: Number(event.target.value) })}>
          <option value="56">Compact — 56px</option><option value="68">Κανονικό — 68px</option><option value="84">Άνετο — 84px</option><option value="104">Μεγάλο — 104px</option>
          {[56, 68, 84, 104].includes(Number(profile.customer_list_row_height)) ? null : <option value={profile.customer_list_row_height}>{profile.customer_list_row_height}px — Custom</option>}
        </select>
        <small className="muted">Ή όρισε ακριβώς το ύψος που θέλεις:</small>
        <div className="settings-inline-control"><input className="settings-control" type="number" min="44" max="180" step="1" value={profile.customer_list_row_height || 68} onChange={(event) => setProfile({ customer_list_row_height: Math.min(180, Math.max(44, Number(event.target.value) || 68)) })} /><span>px</span></div>
      </div></div>
      </section>
      <section className="customers-settings-card">
        <div className="customers-settings-card-head"><div><h3>Προεπιλογές νέου πελάτη</h3><p>Τιμές που χρησιμοποιούνται αυτόματα στις νέες εγγραφές.</p></div><Icon name="settings" size={18} /></div>
      <div className="customers-settings-grid"><div className="field-group"><label>Προεπιλεγμένη χώρα</label><input className="settings-control" value={value.default_country || ''} onChange={(event) => onChange({ ...value, default_country: event.target.value })} /></div>
      <div className="field-group"><label>Προεπιλεγμένη κατάσταση</label>
        <select className="settings-control" value={value.default_customer_status || 'active'} onChange={(event) => onChange({ ...value, default_customer_status: event.target.value })}>
          <option value="active">Ενεργός</option><option value="prospect">Υποψήφιος</option><option value="inactive">Ανενεργός</option>
        </select>
      </div>
      </div>
      <label className="settings-check"><input type="checkbox" checked={!!value.require_email} onChange={(event) => onChange({ ...value, require_email: event.target.checked })} /> Υποχρεωτικό email</label>
      <label className="settings-check"><input type="checkbox" checked={!!value.strict_duplicates} onChange={(event) => onChange({ ...value, strict_duplicates: event.target.checked })} /> Αυστηρός έλεγχος διπλοεγγραφών</label>
      <label className="settings-check"><input type="checkbox" checked={!!value.allow_vip} onChange={(event) => onChange({ ...value, allow_vip: event.target.checked })} /> Ενεργό VIP</label>
      </section>
      <section className="customers-settings-card">
      <div className="customers-settings-card-head"><div><h3>Tabs καρτέλας πελάτη</h3><p>Μετακίνησε tabs μέσα στην ομάδα τους, άλλαξε την ονομασία ή κρύψε όσα δεν χρειάζεσαι.</p></div><Icon name="layers" size={18} /></div>
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
              const groupTabs = tabs.filter((item) => item.group === group);
              const position = groupTabs.findIndex((item) => item.key === tab.key);
              return <div className="customer-tab-setting" key={tab.key}>
                <button type="button" className="tab-order-button" disabled={position === 0} onClick={() => move(tab.key, -1)} title="Μετακίνηση πάνω"><Icon name="chevronDown" size={14} style={{ transform: 'rotate(180deg)' }} /></button>
                <button type="button" className="tab-order-button" disabled={position === groupTabs.length - 1} onClick={() => move(tab.key, 1)} title="Μετακίνηση κάτω"><Icon name="chevronDown" size={14} /></button>
                <span className="customer-tab-icon"><Icon name={tab.icon} size={16} /></span>
                <input className="settings-control" value={tab.label} onChange={(event) => setProfile({ tabs: tabs.map((item) => item.key === tab.key ? { ...item, label: event.target.value } : item) })} />
                <label className="settings-toggle"><input type="checkbox" checked={tab.enabled !== false} onChange={(event) => setProfile({ tabs: tabs.map((item) => item.key === tab.key ? { ...item, enabled: event.target.checked } : item) })} /> Ενεργό</label>
              </div>;
            })}
          </div>
        ))}
      </div>
      </section>
      <section className="customers-settings-card">
      <div className="customers-settings-card-head"><div><h3>Προβολή υποκαταστήματος</h3><p>Έλεγξε ποια blocks και ποια αρχική κατάσταση θα βλέπουν οι πωλητές.</p></div><Icon name="building" size={18} /></div>
      <div className="customers-settings-options">
      {[
        ['show_hours', 'Εμφάνιση ωραρίου'], ['show_map', 'Εμφάνιση χάρτη'], ['show_kpis', 'Εμφάνιση KPIs'],
        ['show_spaces', 'Εμφάνιση χώρων'], ['branch_expanded', 'Το detail υποκαταστήματος να ανοίγει αρχικά'],
        ['show_visits', 'Εμφάνιση πρόσφατων επισκέψεων'], ['spaces_expanded', 'Οι χώροι να εμφανίζονται expanded'], ['visits_expanded', 'Οι επισκέψεις να εμφανίζονται expanded'],
      ].map(([key, label]) => <label className="settings-check" key={key}><input type="checkbox" checked={value?.view_preferences?.branch_detail?.[key] !== false} onChange={(event) => onChange({ ...value, view_preferences: { ...value.view_preferences, branch_detail: { ...value.view_preferences?.branch_detail, [key]: event.target.checked } } })} /> {label}</label>)}
      </div></section>
      <div className="customers-settings-actions"><span className="muted">Οι αλλαγές εφαρμόζονται μετά την αποθήκευση.</span><button type="button" className="btn btn-accent" disabled={saving} onClick={save}>{saving ? <span className="spinner" /> : <Icon name="check" size={16} />} Αποθήκευση αλλαγών</button></div>
    </div>
  );
}
