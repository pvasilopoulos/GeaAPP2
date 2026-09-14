import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { Avatar, Skeleton } from '../components/ui.jsx';
import { formatCurrency, formatNumber, relativeDate } from '../lib/format.js';

const ACTIVITY_ICONS = {
  booking_created: { icon: 'calendar', bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  booking_completed: { icon: 'check', bg: 'var(--green-soft)', fg: 'var(--green)' },
  payment_received: { icon: 'wallet', bg: 'var(--green-soft)', fg: 'var(--green)' },
  message_sent: { icon: 'message', bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  note_added: { icon: 'note', bg: 'var(--amber-soft)', fg: 'var(--amber)' },
  visit: { icon: 'pin', bg: '#eaeafe', fg: '#6d28d9' },
  document_uploaded: { icon: 'file', bg: 'var(--surface-2)', fg: 'var(--text-2)' },
};

function Kpi({ label, value, icon }) {
  return (
    <div className="kpi">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="l">{label}</div>
        <div className="icn"><Icon name={icon} size={16} /></div>
      </div>
      <div className="v">{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: ({ signal }) => api.statsOverview({ signal }),
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Καλωσήρθες, Αναστασία</h1>
          <div className="sub">Επισκόπηση της δραστηριότητας των πελατών</div>
        </div>
        <Link to="/customers" className="btn btn-accent"><Icon name="users" size={16} /> Όλοι οι πελάτες</Link>
      </div>

      <div className="kpi-grid">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <div className="kpi" key={i}><Skeleton w="60%" /><Skeleton w="40%" h={24} style={{ marginTop: 12 }} /></div>)
        ) : (
          <>
            <Kpi label="Σύνολο πελατών" value={formatNumber(data.totalCustomers)} icon="users" />
            <Kpi label="Ενεργοί πελάτες" value={formatNumber(data.activeCustomers)} icon="activity" />
            <Kpi label="VIP πελάτες" value={formatNumber(data.vipCustomers)} icon="star" />
            <Kpi label="Συνολική αξία" value={formatCurrency(data.totalValue)} icon="wallet" />
          </>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3><Icon name="building" /> Κορυφαία υποκαταστήματα</h3></div>
          <div style={{ padding: '6px 8px' }}>
            {isLoading ? <div style={{ padding: 16 }}><Skeleton /></div> : data.topBranches.map((b) => (
              <div key={b.id} className="search-row">
                <div className="avatar sq" style={{ width: 34, height: 34, background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="building" size={16} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{b.name}</div>
                  <div className="meta">{b.city}</div>
                </div>
                <div className="num">{formatNumber(b.customers)} <span className="muted" style={{ fontWeight: 400 }}>πελάτες</span></div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Icon name="activity" /> Πρόσφατη δραστηριότητα</h3></div>
          <div style={{ padding: '4px 16px 12px' }}>
            {isLoading ? <div style={{ padding: 16 }}><Skeleton /></div> : (
              <div className="timeline">
                {data.recentActivity.map((a, i) => {
                  const cfg = ACTIVITY_ICONS[a.type] || ACTIVITY_ICONS.visit;
                  return (
                    <div className="tl-item" key={i}>
                      <div className="icn" style={{ background: cfg.bg, color: cfg.fg }}><Icon name={cfg.icon} size={15} /></div>
                      <div style={{ flex: 1 }}>
                        <div className="desc">{a.description}</div>
                        <div className="time">{a.full_name} · {relativeDate(a.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
