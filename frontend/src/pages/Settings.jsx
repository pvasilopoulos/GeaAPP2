import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../store/auth.js';
import { PERMS } from '../lib/perms.js';
import Users from './Users.jsx';
import CustomFieldsPanel from './settings/CustomFieldsPanel.jsx';
import TenantsPanel from './settings/TenantsPanel.jsx';
import OrgPanel from './settings/OrgPanel.jsx';
import AppPanel from './settings/AppPanel.jsx';
import MessagingPanel from './settings/MessagingPanel.jsx';
import RemindersPanel from './settings/RemindersPanel.jsx';
import SecurityPanel from './settings/SecurityPanel.jsx';
import ConnectorsPanel from './settings/ConnectorsPanel.jsx';
import CustomersPanel from './settings/CustomersPanel.jsx';
import QuotesPanel from './settings/QuotesPanel.jsx';
import MenuPanel from './settings/MenuPanel.jsx';
import NotificationsPanel from './settings/NotificationsPanel.jsx';
import NotificationRulesPanel from './settings/NotificationRulesPanel.jsx';
import PushBroadcastPanel from './settings/PushBroadcastPanel.jsx';
import AuditLog from './AuditLog.jsx';

const CATS = [
  { id: 'org', label: 'Οργανισμός', hint: 'Επωνυμία, γλώσσα, νόμισμα', icon: 'building', perms: [PERMS.TENANT_MANAGE, PERMS.SETTINGS_MANAGE] },
  { id: 'app', label: 'Εφαρμογή', hint: 'Προεπιλογές πελατών και εμφάνισης', icon: 'layers', perms: [PERMS.SETTINGS_MANAGE] },
  { id: 'customers', label: 'Customers', hint: 'Tabs, εμφάνιση και προεπιλογές πελατών', icon: 'users', perms: [PERMS.SETTINGS_MANAGE] },
  { id: 'quotes', label: 'Προσφορές / ERP API', hint: 'Endpoint και JSON για τις γραμμές προσφορών', icon: 'file', perms: [PERMS.SETTINGS_MANAGE] },
  { id: 'messaging', label: 'Μηνύματα', hint: 'Email, Viber, SMS, Telegram', icon: 'message', perms: [PERMS.SETTINGS_MANAGE] },
  { id: 'reminders', label: 'Υπενθυμίσεις', hint: 'Προειδοποιήσεις, εργάσιμο ωράριο, snooze', icon: 'bell', perms: [PERMS.SETTINGS_MANAGE] },
  { id: 'users', label: 'Χρήστες & Ρόλοι', hint: 'Μέλη οργανισμού και δικαιώματα', icon: 'users', perms: [PERMS.USERS_MANAGE, PERMS.ROLES_MANAGE] },
  { id: 'fields', label: 'Custom Fields', hint: 'Δυναμικά πεδία πελατών / χώρων', icon: 'tag', perms: [PERMS.SETTINGS_MANAGE] },
  { id: 'tenants', label: 'Tenants', hint: 'Δημιουργία, επεξεργασία, διαγραφή οργανισμών', icon: 'grid', perms: [PERMS.TENANTS_PLATFORM] },
  { id: 'security', label: 'Ασφάλεια', hint: 'Εγγραφή, πρόσβαση, πλατφόρμα', icon: 'settings', perms: [PERMS.SETTINGS_MANAGE, PERMS.TENANT_MANAGE, PERMS.TENANTS_PLATFORM] },
  { id: 'audit', label: 'Ιστορικό αλλαγών', hint: 'Ποιος άλλαξε τι στον οργανισμό', icon: 'clock', perms: [PERMS.SETTINGS_MANAGE] },
  { id: 'connectors', label: 'ERP Sync', hint: 'Συνδέσεις, αντιστοιχίσεις και συγχρονισμοί', icon: 'refresh', perms: [PERMS.SETTINGS_MANAGE] },
  { id: 'push-broadcast', label: 'Αποστολή ειδοποιήσεων', hint: 'Στείλε ειδοποίηση (push + in-app) σε όλους ή σε επιλεγμένους χρήστες', icon: 'bell', perms: [PERMS.SETTINGS_MANAGE] },
  { id: 'notification-rules', label: 'Κανόνες ειδοποιήσεων', hint: 'Αυτόματοι κανόνες: γεγονός → συνθήκες → παραλήπτες → κανάλια', icon: 'bell', perms: [PERMS.SETTINGS_MANAGE] },
  // No perms gate: every authenticated user can personalize their own menu;
  // the panel itself gates the tenant-wide default section by SETTINGS_MANAGE.
  { id: 'menu', label: 'Μενού', hint: 'Πλαϊνό μενού & κάτω μπάρα (mobile) — γενικά και προσωπικά', icon: 'grid', perms: [] },
  { id: 'notifications', label: 'Ειδοποιήσεις', hint: 'Push ειδοποιήσεις σε αυτή τη συσκευή', icon: 'bell', perms: [] },
];

const GROUPS = [
  { id: 'workspace', label: 'Χώρος εργασίας', items: ['org', 'app', 'customers', 'fields'] },
  { id: 'operations', label: 'Λειτουργίες', items: ['messaging', 'reminders', 'connectors', 'push-broadcast', 'notification-rules', 'quotes'] },
  { id: 'access', label: 'Πρόσβαση & ασφάλεια', items: ['users', 'security', 'audit'] },
  { id: 'platform', label: 'Πλατφόρμα', items: ['tenants'] },
  { id: 'personal', label: 'Προσωπικά', items: ['menu', 'notifications'] },
];

export default function Settings({ initialCat } = {}) {
  const hasPerm = useAuth((s) => s.hasPerm);
  const cats = useMemo(() => CATS.filter((c) => c.perms.length === 0 || c.perms.some((p) => hasPerm(p))), [hasPerm]);
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
          {GROUPS.map((group) => {
            const groupCats = group.items.map((id) => cats.find((c) => c.id === id)).filter(Boolean);
            if (!groupCats.length) return null;
            return (
              <div className="settings-nav-group" key={group.id}>
                <div className="settings-nav-group-title">{group.label}</div>
                {groupCats.map((c) => (
                  <button key={c.id} type="button"
                    className={`settings-nav-item${active?.id === c.id ? ' active' : ''}`}
                    onClick={() => setCat(c.id)}>
                    <span className="settings-nav-icon"><Icon name={c.icon} size={16} /></span>
                    <span>
                      <b>{c.label}</b>
                      <small>{c.hint}</small>
                    </span>
                    {active?.id === c.id && <Icon name="chevronRight" size={14} />}
                  </button>
                ))}
              </div>
            );
          })}
        </aside>
        <div className="settings-body">
          {active && (
            <>
              <div className="settings-section-head">
                <div>
                  <div className="settings-eyebrow">ΡΥΘΜΙΣΕΙΣ</div>
                  <h2>{active.label}</h2>
                  <div className="muted">{active.hint}</div>
                </div>
                <div className="settings-section-icon"><Icon name={active.icon} size={21} /></div>
              </div>
              {active.id === 'org' && <OrgPanel />}
              {active.id === 'app' && <AppPanel />}
              {active.id === 'customers' && <CustomersPanel />}
              {active.id === 'quotes' && <QuotesPanel />}
              {active.id === 'messaging' && <MessagingPanel />}
              {active.id === 'reminders' && <RemindersPanel />}
              {active.id === 'users' && <Users embedded />}
              {active.id === 'fields' && <CustomFieldsPanel />}
              {active.id === 'tenants' && <TenantsPanel />}
              {active.id === 'security' && <SecurityPanel />}
              {active.id === 'connectors' && <ConnectorsPanel />}
              {active.id === 'push-broadcast' && <PushBroadcastPanel />}
              {active.id === 'notification-rules' && <NotificationRulesPanel />}
              {active.id === 'menu' && <MenuPanel />}
              {active.id === 'notifications' && <NotificationsPanel />}
              {active.id === 'audit' && <AuditLog embedded />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
