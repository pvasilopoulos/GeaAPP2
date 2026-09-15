import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../store/auth.js';
import { PERMS } from '../lib/perms.js';
import Users from './Users.jsx';
import CustomFieldsPanel from './settings/CustomFieldsPanel.jsx';
import TenantsPanel from './settings/TenantsPanel.jsx';
import OrgPanel from './settings/OrgPanel.jsx';
import AppPanel from './settings/AppPanel.jsx';
import SecurityPanel from './settings/SecurityPanel.jsx';

const CATS = [
  { id: 'org', label: 'Οργανισμός', hint: 'Επωνυμία, γλώσσα, νόμισμα', icon: 'building', perms: [PERMS.TENANT_MANAGE, PERMS.SETTINGS_MANAGE] },
  { id: 'app', label: 'Εφαρμογή', hint: 'Προεπιλογές πελατών και εμφάνισης', icon: 'layers', perms: [PERMS.SETTINGS_MANAGE] },
  { id: 'users', label: 'Χρήστες & Ρόλοι', hint: 'Μέλη οργανισμού και δικαιώματα', icon: 'users', perms: [PERMS.USERS_MANAGE, PERMS.ROLES_MANAGE] },
  { id: 'fields', label: 'Custom Fields', hint: 'Δυναμικά πεδία πελατών / χώρων', icon: 'tag', perms: [PERMS.SETTINGS_MANAGE] },
  { id: 'tenants', label: 'Tenants', hint: 'Δημιουργία, επεξεργασία, διαγραφή οργανισμών', icon: 'grid', perms: [PERMS.TENANTS_PLATFORM] },
  { id: 'security', label: 'Ασφάλεια', hint: 'Εγγραφή, πρόσβαση, πλατφόρμα', icon: 'settings', perms: [PERMS.SETTINGS_MANAGE, PERMS.TENANT_MANAGE, PERMS.TENANTS_PLATFORM] },
];

export default function Settings({ initialCat } = {}) {
  const hasPerm = useAuth((s) => s.hasPerm);
  const cats = useMemo(() => CATS.filter((c) => c.perms.some((p) => hasPerm(p))), [hasPerm]);
  const [cat, setCat] = useState(() => {
    if (initialCat && cats.some((c) => c.id === initialCat)) return initialCat;
    return cats[0]?.id || 'org';
  });
  const active = cats.find((c) => c.id === cat) || cats[0];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Ρυθμίσεις</h1>
          <div className="sub">Advanced module — κατηγοριοποιημένες ρυθμίσεις οργανισμού και πλατφόρμας.</div>
        </div>
      </div>

      <div className="settings-layout">
        <aside className="settings-nav">
          {cats.map((c) => (
            <button key={c.id} type="button"
              className={`settings-nav-item${active?.id === c.id ? ' active' : ''}`}
              onClick={() => setCat(c.id)}>
              <Icon name={c.icon} size={16} />
              <span>
                <b>{c.label}</b>
                <small>{c.hint}</small>
              </span>
            </button>
          ))}
        </aside>
        <div className="settings-body">
          {active && (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{active.label}</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{active.hint}</div>
              </div>
              {active.id === 'org' && <OrgPanel />}
              {active.id === 'app' && <AppPanel />}
              {active.id === 'users' && <Users embedded />}
              {active.id === 'fields' && <CustomFieldsPanel />}
              {active.id === 'tenants' && <TenantsPanel />}
              {active.id === 'security' && <SecurityPanel />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
