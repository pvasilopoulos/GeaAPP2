import { useState } from 'react';
import { useAuth } from '../../store/auth.js';
import { PERMS } from '../../lib/perms.js';
import NotificationRulesPanel from './NotificationRulesPanel.jsx';
import PushBroadcastPanel from './PushBroadcastPanel.jsx';
import NotificationsPanel from './NotificationsPanel.jsx';

/**
 * Single unified "Ειδοποιήσεις" settings tab replacing the three previously
 * separate menu entries (Αποστολή ειδοποιήσεων / Κανόνες ειδοποιήσεων /
 * Ειδοποιήσεις). The admin-only sub-tabs (rules, broadcast) are gated
 * internally so every user — even without settings.manage — can still reach
 * "Οι ειδοποιήσεις μου".
 */
export default function NotificationsCenterPanel() {
  const hasPerm = useAuth((s) => s.hasPerm);
  const canManage = hasPerm(PERMS.NOTIFICATIONS_MANAGE) || hasPerm(PERMS.SETTINGS_MANAGE);

  const TABS = [
    canManage && { key: 'rules', label: 'Κανόνες ειδοποιήσεων' },
    canManage && { key: 'broadcast', label: 'Αποστολή ειδοποίησης' },
    { key: 'mine', label: 'Οι ειδοποιήσεις μου' },
  ].filter(Boolean);

  const [tab, setTab] = useState(TABS[0]?.key || 'mine');
  const active = TABS.some((t) => t.key === tab) ? tab : TABS[0]?.key;

  return (
    <div>
      {TABS.length > 1 && (
        <div className="tabs" style={{ marginBottom: 18 }}>
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`tab${active === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      {active === 'rules' && canManage && <NotificationRulesPanel />}
      {active === 'broadcast' && canManage && <PushBroadcastPanel />}
      {active === 'mine' && <NotificationsPanel />}
    </div>
  );
}
