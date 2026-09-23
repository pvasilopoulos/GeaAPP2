import { useState } from 'react';
import Icon from './Icon.jsx';
import { Drawer, EmptyState } from './ui.jsx';
import { useOffline, selectCounts } from '../store/offline.js';
import { CONFLICT, FAILED, describeItem, kindMeta } from '../lib/outbox.js';

function relativeTime(ts) {
  if (!ts) return '';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'μόλις τώρα';
  if (mins < 60) return `πριν ${mins} λεπτά`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `πριν ${hours} ώρες`;
  return `πριν ${Math.round(hours / 24)} μέρες`;
}

function StatusChip({ item }) {
  if (item.status === CONFLICT) return <span className="ob-chip warn">Χρειάζεται απόφαση</span>;
  if (item.status === FAILED) return <span className="ob-chip bad">Απέτυχε</span>;
  return <span className="ob-chip">Σε αναμονή</span>;
}

function ConflictBox({ item, onForce, onDiscard }) {
  const matches = item.conflict?.matches || [];
  return (
    <div className="ob-conflict">
      <div>Βρέθηκε πελάτης με ίδια στοιχεία:</div>
      <ul>
        {matches.slice(0, 3).map((m) => (
          <li key={m.id}>{m.full_name} · {m.code}{m.phone ? ` · ${m.phone}` : ''}</li>
        ))}
      </ul>
      <div className="ob-actions">
        <button type="button" className="btn btn-sm btn-accent" onClick={onForce}>Δημιουργία ούτως ή άλλως</button>
        <button type="button" className="btn btn-sm" onClick={onDiscard}>Διαγραφή από την ουρά</button>
      </div>
    </div>
  );
}

function OutboxRow({ item, onRetry, onForce, onDiscard }) {
  const meta = kindMeta(item.kind);
  return (
    <div className="ob-row">
      <span className="msg-ch-ico"><Icon name={meta.icon} size={15} /></span>
      <div className="ob-main">
        <b>{describeItem(item)}</b>
        <small>{meta.label} · {relativeTime(item.createdAt)}</small>
        {item.error && <small className="ob-err">{item.error}</small>}
      </div>
      <div className="ob-side">
        <StatusChip item={item} />
        {item.status === FAILED && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={onRetry} title="Νέα προσπάθεια">
            <Icon name="refresh" size={14} />
          </button>
        )}
        <button type="button" className="btn btn-sm btn-ghost" onClick={onDiscard} title="Διαγραφή από την ουρά">
          <Icon name="x" size={14} />
        </button>
      </div>
      {item.status === CONFLICT && <ConflictBox item={item} onForce={onForce} onDiscard={onDiscard} />}
    </div>
  );
}

export default function OfflineIndicator() {
  const online = useOffline((s) => s.online);
  const items = useOffline((s) => s.items);
  const flushing = useOffline((s) => s.flushing);
  const lastSyncAt = useOffline((s) => s.lastSyncAt);
  const flush = useOffline((s) => s.flush);
  const retry = useOffline((s) => s.retry);
  const discard = useOffline((s) => s.discard);
  const counts = selectCounts({ items });
  const [open, setOpen] = useState(false);

  // Nothing to say while online with an empty queue.
  if (online && counts.total === 0) return null;

  const needsAttention = counts.conflicts + counts.failed;
  const tone = !online ? 'off' : needsAttention ? 'warn' : 'sync';
  const label = !online
    ? (counts.total ? `Offline · ${counts.total}` : 'Offline')
    : needsAttention ? `${needsAttention} προς έλεγχο` : `${counts.total} σε αναμονή`;

  return (
    <>
      <button type="button" className={`net-pill ${tone}`} onClick={() => setOpen(true)}
        title="Ενέργειες σε αναμονή συγχρονισμού">
        <Icon name={online ? 'cloudUp' : 'wifiOff'} size={15} />
        <span className="net-pill-text">{label}</span>
      </button>

      {open && (
        <Drawer
          title="Συγχρονισμός"
          subtitle={online ? 'Συνδεδεμένο' : 'Χωρίς σύνδεση — οι ενέργειες αποθηκεύονται στη συσκευή'}
          onClose={() => setOpen(false)}
        >
          <div className="ob-head">
            <div className="muted" style={{ fontSize: 12.5 }}>
              {lastSyncAt ? `Τελευταίος συγχρονισμός ${relativeTime(lastSyncAt)}` : 'Δεν έχει γίνει συγχρονισμός ακόμα'}
            </div>
            <button type="button" className="btn btn-sm" disabled={!online || flushing || !counts.total} onClick={() => flush()}>
              {flushing ? <span className="spinner" /> : <Icon name="refresh" size={14} />} Συγχρονισμός τώρα
            </button>
          </div>

          {counts.total === 0 ? (
            <EmptyState icon="check" title="Όλα συγχρονισμένα" hint="Δεν υπάρχουν ενέργειες σε αναμονή." />
          ) : (
            <div className="ob-list">
              {items.map((it) => (
                <OutboxRow
                  key={it.id}
                  item={it}
                  onRetry={() => retry(it.id)}
                  onForce={() => retry(it.id, { force: true })}
                  onDiscard={() => discard(it.id)}
                />
              ))}
            </div>
          )}

          <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
            Offline μπορείτε να δημιουργήσετε πελάτη, να τον επεξεργαστείτε και να προσθέσετε επαφή.
            Αποστολή μηνυμάτων, αναζήτηση σε όλους τους πελάτες και εξαγωγές χρειάζονται σύνδεση.
          </p>
        </Drawer>
      )}
    </>
  );
}
