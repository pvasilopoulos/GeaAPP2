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

const CHANNEL_LABELS = { email: 'Email', sms: 'SMS', call: 'Κλήση' };
const ACT_LABELS = {
  booking_created: 'Νέα κράτηση', booking_completed: 'Ολοκληρωμένη κράτηση',
  payment_received: 'Πληρωμή', message_sent: 'Μήνυμα', note_added: 'Σημείωση',
  visit: 'Επίσκεψη', document_uploaded: 'Έγγραφο',
};

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
    return (
      <Line icon="message" title={r.subject || CHANNEL_LABELS[r.channel]}
        sub={`${CHANNEL_LABELS[r.channel]} · ${r.direction === 'inbound' ? 'Εισερχόμενο' : 'Εξερχόμενο'} · ${formatDateTime(r.created_at)}`} />
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
  return (
    <Line icon="activity" title={r.description || ACT_LABELS[r.type]}
      sub={[ACT_LABELS[r.type], r.branch_name, formatDateTime(r.created_at)].filter(Boolean).join(' · ')} />
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
