import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { Avatar, VipBadge, Skeleton } from '../components/ui.jsx';
import { STATUS_LABELS, TYPE_LABELS, formatDate } from '../lib/format.js';
import Overview from '../components/customer/Overview.jsx';
import BranchesSpaces from '../components/customer/BranchesSpaces.jsx';
import HistoryList from '../components/customer/HistoryList.jsx';
import ContactsPanel from '../components/customer/ContactsPanel.jsx';
import { useTabs } from '../store/tabs.js';
import { useAuth } from '../store/auth.js';
import { PERMS } from '../lib/perms.js';
import { CustomerFormDrawer } from '../components/forms.jsx';
import SendMessageMenu from '../components/message/SendMessageMenu.jsx';

const TABS = [
  { key: 'overview', label: 'Σύνοψη', icon: 'home' },
  { key: 'contacts', label: 'Επαφές', icon: 'users' },
  { key: 'branches', label: 'Υποκαταστήματα & Χώροι', icon: 'building' },
  { key: 'bookings', label: 'Κρατήσεις', icon: 'calendar' },
  { key: 'payments', label: 'Πληρωμές', icon: 'wallet' },
  { key: 'communications', label: 'Επικοινωνίες', icon: 'message' },
  { key: 'documents', label: 'Έγγραφα', icon: 'file' },
  { key: 'notes', label: 'Σημειώσεις', icon: 'note' },
  { key: 'activity', label: 'Δραστηριότητα', icon: 'activity' },
];

export default function CustomerProfile({ customerId, tabId, onBack }) {
  const id = customerId;
  const [tab, setTab] = useState('overview');
  const [showEdit, setShowEdit] = useState(false);
  const renameTab = useTabs((s) => s.renameTab);
  const closeTab = useTabs((s) => s.closeTab);
  const qc = useQueryClient();
  const canWrite = useAuth((s) => s.hasPerm(PERMS.CUSTOMERS_WRITE));
  const canDelete = useAuth((s) => s.hasPerm(PERMS.CUSTOMERS_DELETE));

  const onDelete = async () => {
    if (!confirm('Διαγραφή πελάτη και όλων των δεδομένων του;')) return;
    await api.deleteCustomer(id);
    qc.invalidateQueries({ queryKey: ['customers'] });
    if (tabId) closeTab(tabId); else if (onBack) onBack();
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['customer', id],
    queryFn: ({ signal }) => api.customer(id, { signal }),
    retry: false,
  });

  // Keep the tab title in sync with the loaded customer name.
  useEffect(() => {
    if (data?.customer && tabId) renameTab(tabId, data.customer.full_name);
  }, [data, tabId, renameTab]);

  if (isLoading) return <ProfileSkeleton />;
  if (isError || !data) {
    return (
      <div className="card card-pad" style={{ textAlign: 'center', padding: 48 }}>
        <Icon name="users" size={34} style={{ color: 'var(--text-3)' }} />
        <div style={{ fontWeight: 600, marginTop: 10 }}>Ο πελάτης δεν βρέθηκε</div>
        <div className="muted" style={{ marginBottom: 16 }}>Ενδέχεται να έχει διαγραφεί.</div>
        <button className="btn" onClick={() => (tabId ? closeTab(tabId) : onBack?.())}>Κλείσιμο καρτέλας</button>
      </div>
    );
  }
  const c = data.customer;
  const joined = new Date(c.registered_at);

  return (
    <div>
      <button onClick={onBack} className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }}>
        <Icon name="arrowLeft" size={16} /> Πελάτες
      </button>

      <div className="profile-header">
        <div className="ph-top">
          {c.avatar_url ? (
            <div style={{ position: 'relative' }}>
              <Avatar name={c.full_name} src={c.avatar_url} size={72} />
              {c.status === 'active' && (
                <span style={{ position: 'absolute', right: 2, bottom: 2, width: 15, height: 15, borderRadius: '50%', background: 'var(--green)', border: '3px solid #fff' }} />
              )}
            </div>
          ) : null}

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
            <SendMessageMenu
              customer={c}
              contacts={data.contacts || []}
              onSent={() => {
                qc.invalidateQueries({ queryKey: ['history', 'communications', id] });
                qc.invalidateQueries({ queryKey: ['history', 'activity', id] });
              }}
            />
            {canWrite && <button className="btn btn-primary" onClick={() => setShowEdit(true)}><Icon name="edit" size={16} /> Επεξεργασία</button>}
            {canDelete && <button className="btn btn-icon" title="Διαγραφή" onClick={onDelete}><Icon name="x" /></button>}
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
        {tab === 'overview' && <Overview customerId={id} data={data} onOpenTab={setTab} onEditCustomer={() => setShowEdit(true)} />}
        {tab === 'contacts' && <ContactsPanel customerId={id} customerType={c.customer_type} />}
        {tab === 'branches' && <BranchesSpaces customerId={id} />}
        {tab === 'bookings' && <HistoryList kind="bookings" customerId={id} />}
        {tab === 'payments' && <HistoryList kind="payments" customerId={id} />}
        {tab === 'communications' && <HistoryList kind="communications" customerId={id} />}
        {tab === 'documents' && <HistoryList kind="documents" customerId={id} />}
        {tab === 'notes' && <HistoryList kind="notes" customerId={id} />}
        {tab === 'activity' && <HistoryList kind="activity" customerId={id} />}
      </div>

      {showEdit && (
        <CustomerFormDrawer
          initial={c}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); qc.invalidateQueries({ queryKey: ['customer', id] }); qc.invalidateQueries({ queryKey: ['customers'] }); qc.invalidateQueries({ queryKey: ['history', 'activity', id] }); }}
        />
      )}
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
