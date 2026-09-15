import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../Icon.jsx';
import { Skeleton, EmptyState } from '../ui.jsx';
import {
  formatCurrency, formatDate, formatDateTime, formatTime, BOOKING_STATUS,
} from '../../lib/format.js';

const CONFIG = {
  bookings: {
    title: 'Κρατήσεις', icon: 'calendar', empty: 'Χωρίς κρατήσεις',
    fetch: api.customerBookings,
  },
  payments: {
    title: 'Πληρωμές', icon: 'wallet', empty: 'Χωρίς πληρωμές',
    fetch: api.customerPayments,
  },
  communications: {
    title: 'Επικοινωνίες', icon: 'message', empty: 'Χωρίς επικοινωνίες',
    fetch: api.customerCommunications,
  },
  documents: {
    title: 'Έγγραφα', icon: 'file', empty: 'Χωρίς έγγραφα',
    fetch: api.customerDocuments,
  },
  notes: {
    title: 'Σημειώσεις', icon: 'note', empty: 'Χωρίς σημειώσεις',
    fetch: api.customerNotes,
  },
  activity: {
    title: 'Δραστηριότητα', icon: 'activity', empty: 'Χωρίς δραστηριότητα',
    fetch: api.customerActivities,
  },
};

const CHANNEL_LABELS = { email: 'Email', sms: 'SMS', call: 'Κλήση', viber: 'Viber', viber_routee: 'Viber Routee', telegram: 'Telegram' };
const DELIVERY_LABELS = { sent: 'Στάλθηκε', logged: 'Καταχωρήθηκε', failed: 'Αποτυχία' };
const ACT_LABELS = {
  booking_created: 'Νέα κράτηση', booking_completed: 'Ολοκληρωμένη κράτηση',
  payment_received: 'Πληρωμή', message_sent: 'Μήνυμα', note_added: 'Σημείωση',
  visit: 'Επίσκεψη', document_uploaded: 'Έγγραφο',
  customer_created: 'Δημιουργία πελάτη', customer_updated: 'Ενημέρωση πελάτη',
  contact_added: 'Νέα επαφή', contact_updated: 'Ενημέρωση επαφής', contact_removed: 'Διαγραφή επαφής',
  branch_created: 'Νέο υποκατάστημα', branch_updated: 'Ενημέρωση υποκαταστήματος', branch_deleted: 'Διαγραφή υποκαταστήματος',
  space_created: 'Νέος χώρος', space_updated: 'Ενημέρωση χώρου', space_deleted: 'Διαγραφή χώρου',
};

function deliveryClass(st) {
  if (st === 'sent') return 'badge-completed';
  if (st === 'failed') return 'badge-inactive';
  return 'badge-prospect';
}

export default function HistoryList({ kind, customerId }) {
  const cfg = CONFIG[kind];
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['history', kind, customerId],
    queryFn: ({ pageParam = 0, signal }) => cfg.fetch(customerId, { limit: 15, offset: pageParam }, { signal }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.nextOffset : undefined),
  });

  const rows = data?.pages.flatMap((p) => p.results) || [];

  return (
    <div className="card">
      <div className="card-head"><h3><Icon name={cfg.icon} /> {cfg.title}</h3></div>
      <div style={{ padding: rows.length ? '4px 8px 8px' : 0 }}>
        {isLoading ? (
          <div style={{ padding: 16 }}><Skeleton h={50} /><Skeleton h={50} style={{ marginTop: 10 }} /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={cfg.icon} title={cfg.empty} />
        ) : (
          <div>
            {rows.map((r) => <Item key={`${kind}-${r.id}`} kind={kind} r={r} />)}
          </div>
        )}
      </div>
      {hasNextPage && (
        <div style={{ padding: 12, textAlign: 'center', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? <span className="spinner" /> : <Icon name="chevronDown" size={15} />} Φόρτωση περισσότερων
          </button>
        </div>
      )}
    </div>
  );
}

function Item({ kind, r }) {
  if (kind === 'bookings') {
    return (
      <Line icon="calendar" title={`${r.space_name || 'Χώρος'} · ${r.branch_name || ''}`}
        sub={`${formatDate(r.starts_at)} · ${formatTime(r.starts_at)} - ${formatTime(r.ends_at)}`}
        right={<><span className="num">{formatCurrency(r.amount)}</span> <span className={`badge badge-${r.status}`}>{BOOKING_STATUS[r.status]}</span></>} />
    );
  }
  if (kind === 'payments') {
    return (
      <Line icon="wallet" iconBg="var(--green-soft)" iconFg="var(--green)"
        title={formatCurrency(r.amount)} sub={`${r.method === 'card' ? 'Κάρτα' : r.method === 'cash' ? 'Μετρητά' : 'Έμβασμα'} · ${formatDate(r.paid_at)}`}
        right={<span className="badge badge-completed">Πληρώθηκε</span>} />
    );
  }
  if (kind === 'communications') {
    const delivery = DELIVERY_LABELS[r.delivery_status];
    return (
      <div className="hist-item">
        <Line icon="message" title={r.subject || CHANNEL_LABELS[r.channel] || r.channel}
          sub={[CHANNEL_LABELS[r.channel] || r.channel, r.recipient, r.direction === 'inbound' ? 'Εισερχόμενο' : 'Εξερχόμενο', delivery, formatDateTime(r.created_at)].filter(Boolean).join(' · ')}
          right={r.delivery_status ? <span className={`badge ${deliveryClass(r.delivery_status)}`}>{delivery}</span> : null} />
        {r.body && <div className="hist-msg">{r.body}</div>}
      </div>
    );
  }
  if (kind === 'documents') {
    return (
      <Line icon="file" iconBg="var(--red-soft)" iconFg="var(--red)" title={r.name}
        sub={`${Math.round((r.size_bytes || 0) / 1024)} KB · ${formatDate(r.created_at)}`}
        right={<button className="btn btn-sm btn-ghost btn-icon"><Icon name="download" size={15} /></button>} />
    );
  }
  if (kind === 'notes') {
    return <Line icon="note" iconBg="var(--amber-soft)" iconFg="var(--amber)" title={r.body} sub={formatDateTime(r.created_at)} />;
  }
  // activity
  const d = r.details || {};
  const actor = d.actor?.name;
  const msg = d.message;
  const delivery = msg?.delivery_status;
  return (
    <div className="hist-item">
      <Line icon="activity" title={r.description || ACT_LABELS[r.type]}
        sub={[ACT_LABELS[r.type], r.branch_name, r.space_name, actor, formatDateTime(r.created_at)].filter(Boolean).join(' · ')}
        right={delivery ? <span className={`badge ${deliveryClass(delivery)}`}>{DELIVERY_LABELS[delivery] || delivery}</span> : null} />
      <ActivityDetails details={d} />
    </div>
  );
}

function ActivityDetails({ details }) {
  if (!details) return null;
  const changes = details.changes || [];
  const fields = details.fields || [];
  const msg = details.message;
  return (
    <>
      {changes.length > 0 && (
        <ul className="hist-diffs">
          {changes.map((c) => (
            <li key={c.field}>
              <span className="k">{c.label}</span>
              <span className="from">{c.from}</span>
              <span className="arrow">→</span>
              <span className="to">{c.to}</span>
            </li>
          ))}
        </ul>
      )}
      {fields.length > 0 && (
        <ul className="hist-diffs snap">
          {fields.map((c) => (
            <li key={c.field}>
              <span className="k">{c.label}</span>
              <span className="to">{c.to}</span>
            </li>
          ))}
        </ul>
      )}
      {msg && (
        <div className="hist-msg">
          <div className="hist-msg-h">
            {[msg.channel_label || CHANNEL_LABELS[msg.channel], msg.to, msg.subject, msg.delivery_detail].filter(Boolean).join(' · ')}
          </div>
          {msg.body}
        </div>
      )}
    </>
  );
}

function Line({ icon, iconBg = 'var(--accent-soft)', iconFg = 'var(--accent)', title, sub, right }) {
  return (
    <div className="search-row" style={{ padding: '11px 10px' }}>
      <div className="avatar sq" style={{ width: 36, height: 36, background: iconBg, color: iconFg }}><Icon name={icon} size={16} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        {sub && <div className="meta">{sub}</div>}
      </div>
      {right && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{right}</div>}
    </div>
  );
}
