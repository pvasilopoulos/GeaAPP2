import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { Avatar, VipBadge, Tag, Skeleton } from '../components/ui.jsx';
import { STATUS_LABELS, TYPE_LABELS, formatDate } from '../lib/format.js';
import Overview from '../components/customer/Overview.jsx';
import BranchesSpaces from '../components/customer/BranchesSpaces.jsx';
import HistoryList from '../components/customer/HistoryList.jsx';

const TABS = [
  { key: 'overview', label: 'Σύνοψη', icon: 'home' },
  { key: 'branches', label: 'Υποκαταστήματα & Χώροι', icon: 'building' },
  { key: 'bookings', label: 'Κρατήσεις', icon: 'calendar' },
  { key: 'payments', label: 'Πληρωμές', icon: 'wallet' },
  { key: 'communications', label: 'Επικοινωνίες', icon: 'message' },
  { key: 'documents', label: 'Έγγραφα', icon: 'file' },
  { key: 'notes', label: 'Σημειώσεις', icon: 'note' },
  { key: 'activity', label: 'Δραστηριότητα', icon: 'activity' },
];

export default function CustomerProfile() {
  const { id } = useParams();
  const [tab, setTab] = useState('overview');

  const { data, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: ({ signal }) => api.customer(id, { signal }),
  });

  if (isLoading) return <ProfileSkeleton />;
  if (!data) return null;
  const c = data.customer;
  const joined = new Date(c.registered_at);

  return (
    <div>
      <Link to="/customers" className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }}>
        <Icon name="arrowLeft" size={16} /> Πελάτες
      </Link>

      <div className="profile-header">
        <div className="ph-top">
          <div style={{ position: 'relative' }}>
            <Avatar name={c.full_name} src={c.avatar_url} size={72} />
            {c.status === 'active' && (
              <span style={{ position: 'absolute', right: 2, bottom: 2, width: 15, height: 15, borderRadius: '50%', background: 'var(--green)', border: '3px solid #fff' }} />
            )}
          </div>

          <div style={{ minWidth: 0 }}>
            <div className="ph-id">
              <h1>{c.full_name}</h1>
              {c.is_vip && <VipBadge />}
            </div>
            <div className="ph-meta">
              #{c.code} · {STATUS_LABELS[c.status]} πελάτης · {TYPE_LABELS[c.customer_type]} · Από {String(joined.getMonth() + 1).padStart(2, '0')}/{joined.getFullYear()}
            </div>
            <div className="ph-contact">
              {c.phone && <span className="item"><Icon name="phone" /> {c.phone}</span>}
              {c.email && <span className="item"><Icon name="mail" /> {c.email}</span>}
              {c.city && <span className="item"><Icon name="pin" /> {[c.city, c.country].filter(Boolean).join(', ')}</span>}
              {c.date_of_birth && <span className="item"><Icon name="cake" /> {formatDate(c.date_of_birth)}</span>}
            </div>
          </div>

          <div className="ph-actions">
            <button className="btn"><Icon name="message" size={16} /> Αποστολή μηνύματος</button>
            <button className="btn"><Icon name="calendar" size={16} /> Νέα κράτηση</button>
            <button className="btn btn-primary"><Icon name="edit" size={16} /> Επεξεργασία</button>
            <button className="btn btn-icon"><Icon name="more" /></button>
          </div>
        </div>

        {c.profile_note && (
          <div style={{ marginTop: 16, background: 'var(--green-soft)', border: '1px solid #cdeed7', borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 9, alignItems: 'center', fontSize: 13 }}>
            <Icon name="note" size={15} style={{ color: 'var(--green)' }} />
            <b style={{ color: 'var(--green)' }}>Σημείωση:</b> {c.profile_note}
          </div>
        )}
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            <Icon name={t.icon} /> {t.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        {tab === 'overview' && <Overview customerId={id} data={data} onOpenTab={setTab} />}
        {tab === 'branches' && <BranchesSpaces customerId={id} />}
        {tab === 'bookings' && <HistoryList kind="bookings" customerId={id} />}
        {tab === 'payments' && <HistoryList kind="payments" customerId={id} />}
        {tab === 'communications' && <HistoryList kind="communications" customerId={id} />}
        {tab === 'documents' && <HistoryList kind="documents" customerId={id} />}
        {tab === 'notes' && <HistoryList kind="notes" customerId={id} />}
        {tab === 'activity' && <HistoryList kind="activity" customerId={id} />}
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div>
      <Skeleton w={90} h={30} style={{ marginBottom: 14 }} />
      <div className="profile-header">
        <div className="ph-top">
          <Skeleton w={72} h={72} style={{ borderRadius: '50%' }} />
          <div style={{ flex: 1 }}>
            <Skeleton w={220} h={24} />
            <Skeleton w={320} h={14} style={{ marginTop: 10 }} />
            <Skeleton w={420} h={14} style={{ marginTop: 14 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
