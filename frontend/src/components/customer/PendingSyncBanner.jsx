import { useEffect, useState } from 'react';
import Icon from '../Icon.jsx';
import { subscribe, retryMutation, discardMutation } from '../../lib/offlineQueue.js';

// Shows customer-creation submissions that are queued for background sync
// (offline, or the request just failed to reach the server) directly above
// the customer list, so the user can see their entry is safe and — if a
// retry ever comes back as a definitive validation error — fix or discard it.
export default function PendingSyncBanner() {
  const [items, setItems] = useState([]);
  useEffect(() => subscribe((snapshot) => {
    setItems(snapshot.items.filter((i) => i.type === 'create_customer'));
  }), []);
  if (!items.length) return null;
  return (
    <div className="dup-box" style={{ background: 'var(--amber-soft)' }}>
      <b>Εκκρεμεί συγχρονισμός ({items.length})</b>
      <div className="muted" style={{ margin: '4px 0 8px' }}>
        Αυτοί οι πελάτες αποθηκεύτηκαν τοπικά και θα σταλούν αυτόματα μόλις υπάρξει σύνδεση.
      </div>
      {items.map((item) => {
        const name = `${item.payload?.fields?.first_name || ''} ${item.payload?.fields?.last_name || ''}`.trim() || 'Νέος πελάτης';
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
