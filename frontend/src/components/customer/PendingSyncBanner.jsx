import { useEffect, useState } from 'react';
import Icon from '../Icon.jsx';
import { subscribe, retryMutation, discardMutation } from '../../lib/offlineQueue.js';

function itemLabel(item) {
  if (item.type === 'create_customer' || item.type === 'update_customer') {
    const name = `${item.payload?.fields?.first_name || ''} ${item.payload?.fields?.last_name || ''}`.trim();
    if (name) return name;
    return item.type === 'update_customer' ? 'Ενημέρωση πελάτη' : 'Νέος πελάτης';
  }
  if (item.type === 'create_follow_up') return item.payload?.title || 'Νέα υπενθύμιση';
  if (item.type === 'update_follow_up') return item.payload?.patch?.title || (item.payload?.snoozeMinutes != null ? 'Αναβολή υπενθύμισης' : 'Ενημέρωση υπενθύμισης');
  if (item.type === 'create_note') return item.payload?.note?.title || 'Νέα σημείωση';
  if (item.type === 'update_note') return item.payload?.note?.title || 'Ενημέρωση σημείωσης';
  return 'Εκκρεμής ενέργεια';
}

// Shows queued writes (offline, or the request just failed to reach the
// server) so the user can see they are safe and — if a retry ever comes
// back as a definitive validation error — fix or discard them.
export default function PendingSyncBanner() {
  const [items, setItems] = useState([]);
  useEffect(() => subscribe((snapshot) => {
    setItems(snapshot.items);
  }), []);
  if (!items.length) return null;
  return (
    <div className="dup-box" style={{ background: 'var(--amber-soft)' }}>
      <b>Εκκρεμείς συγχρονισμού ({items.length})</b>
      <div className="muted" style={{ margin: '4px 0 8px' }}>
        Οι αλλαγές αποθηκεύτηκαν τοπικά και θα σταλούν αυτόματα μόλις υπάρξει σύνδεση.
      </div>
      {items.map((item) => {
        const name = itemLabel(item);
        return (
          <div key={item.id} className="dup-row">
            <div>
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                {name}
                <span className="badge badge-pending"><span className="dot" /> Εκκρεμεί συγχρονισμός</span>
              </div>
              {item.status === 'error' && (
                <div className="muted" style={{ fontSize: 12, color: 'var(--red)' }}>{item.error || 'Ο συγχρονισμός απέτυχε'}</div>
              )}
            </div>
            {item.status === 'error' && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-sm" onClick={() => retryMutation(item.id)}><Icon name="refresh" size={14} /> Επανάληψη</button>
                <button type="button" className="btn btn-sm" onClick={() => discardMutation(item.id)}>Απόρριψη</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
