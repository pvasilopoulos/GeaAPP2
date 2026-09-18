import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { subscribe, flushQueue } from '../lib/offlineQueue.js';

// Topbar indicator: online/offline state plus a count of queued mutations
// (currently only offline-created customers) with a manual "sync now" action.
export default function OfflineSyncStatus() {
  const [snapshot, setSnapshot] = useState(null);
  useEffect(() => subscribe(setSnapshot), []);
  if (!snapshot) return null;
  const { online, count, syncing } = snapshot;
  if (online && count === 0 && !syncing) return null;
  return (
    <button
      type="button"
      className="btn btn-icon btn-ghost"
      style={{ width: 'auto', padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6 }}
      onClick={() => flushQueue()}
      disabled={syncing || !online}
      title={online ? 'Συγχρονισμός τώρα' : 'Χωρίς σύνδεση — θα συγχρονιστεί αυτόματα όταν επανέλθει'}
    >
      {syncing ? <span className="spinner" /> : <Icon name={online ? 'refresh' : 'wifiOff'} size={16} />}
      <span style={{ fontSize: 12.5, fontWeight: 600 }}>
        {online ? (count > 0 ? `${count} εκκρεμούν` : 'Συγχρονισμός') : 'Εκτός σύνδεσης'}
      </span>
    </button>
  );
}
