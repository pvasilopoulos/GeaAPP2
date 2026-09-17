import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { Avatar, Skeleton } from '../components/ui.jsx';
import { formatCurrency, formatNumber, relativeDate } from '../lib/format.js';
import { useTabs } from '../store/tabs.js';
import { useAuth } from '../store/auth.js';

const ACTIVITY_ICONS = {
  booking_created: { icon: 'calendar', bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  booking_completed: { icon: 'check', bg: 'var(--green-soft)', fg: 'var(--green)' },
  payment_received: { icon: 'wallet', bg: 'var(--green-soft)', fg: 'var(--green)' },
  message_sent: { icon: 'message', bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  note_added: { icon: 'note', bg: 'var(--amber-soft)', fg: 'var(--amber)' },
  visit: { icon: 'pin', bg: '#eaeafe', fg: '#6d28d9' },
  document_uploaded: { icon: 'file', bg: 'var(--surface-2)', fg: 'var(--text-2)' },
  follow_up_created: { icon: 'bell', bg: 'var(--amber-soft)', fg: 'var(--amber)' },
  follow_up_completed: { icon: 'check', bg: 'var(--green-soft)', fg: 'var(--green)' },
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
  const openTab = useTabs((s) => s.openTab);
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['stats'],
    queryFn: ({ signal }) => api.statsOverview({ signal }),
  });

  const loading = isLoading || (!data && !isError);
  const goCustomers = () => openTab({ id: 'customers', type: 'customers', title: 'Πελάτες', icon: 'users' });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Καλωσήρθες, {user?.fullName?.split(' ')[0] || ''}</h1>
          <div className="sub">Επισκόπηση της δραστηριότητας των πελατών</div>
        </div>
        <button className="btn btn-accent" onClick={goCustomers}><Icon name="users" size={16} /> Όλοι οι πελάτες</button>
      </div>

      {isError && (
        <div className="card card-pad" style={{ marginBottom: 18, border: '1px solid #f3c7c7', background: 'var(--red-soft)', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="activity" size={18} />
          <div><b>Αποτυχία φόρτωσης δεδομένων.</b> Ελέγξτε τη σύνδεση με τη βάση ή ότι έχει γίνει το seed. ({error?.message})</div>
        </div>
      )}

      <div className="kpi-grid">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <div className="kpi" key={i}><Skeleton w="60%" /><Skeleton w="40%" h={24} style={{ marginTop: 12 }} /></div>)
        ) : data ? (
          <>
            <Kpi label="Σύνολο πελατών" value={formatNumber(data.totalCustomers)} icon="users" />
            <Kpi label="Ενεργοί πελάτες" value={formatNumber(data.activeCustomers)} icon="activity" />
            <Kpi label="VIP πελάτες" value={formatNumber(data.vipCustomers)} icon="star" />
            <Kpi label="Συνολική αξία" value={formatCurrency(data.totalValue)} icon="wallet" />
          </>
        ) : null}
      </div>

      <div className="grid-2">
        <FollowUpsSection followUps={data?.followUps || []} loading={loading} onComplete={async (id) => {
          await api.updateFollowUp(id, { status: 'completed' });
          qc.invalidateQueries({ queryKey: ['stats'] });
        }} onSnooze={async (id) => {
          await api.snoozeFollowUp(id, 60);
          qc.invalidateQueries({ queryKey: ['stats'] });
        }} />
        <div className="card">
          <div className="card-head"><h3><Icon name="pin" /> Κορυφαίες πόλεις</h3></div>
          <div style={{ padding: '6px 8px' }}>
            {loading ? <div style={{ padding: 16 }}><Skeleton /></div> : (data?.topCities || []).map((c) => (
              <div key={c.city} className="search-row">
                <div className="avatar sq" style={{ width: 34, height: 34, background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="pin" size={16} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{c.city}</div>
                  <div className="meta">Υποκαταστήματα πελατών</div>
                </div>
                <div className="num">{formatNumber(c.customers)} <span className="muted" style={{ fontWeight: 400 }}>πελάτες</span></div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Icon name="activity" /> Πρόσφατη δραστηριότητα</h3></div>
          <div style={{ padding: '4px 16px 12px' }}>
            {loading ? <div style={{ padding: 16 }}><Skeleton /></div> : (
              <div className="timeline">
                {(data?.recentActivity || []).map((a, i) => {
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

function FollowUpsSection({ followUps, loading, onComplete, onSnooze }) {
  const overdue = followUps.filter((f) => f.computed_status === 'overdue');
  const dueSoon = followUps.filter((f) => f.computed_status === 'due_soon');
  const rows = [...overdue, ...dueSoon.filter((f) => !overdue.includes(f))].slice(0, 8);
  return (
    <div className="card">
      <div className="card-head">
        <h3><Icon name="bell" /> Follow-ups</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          {overdue.length > 0 && <span className="badge badge-inactive">{overdue.length} εκπρόθεσμα</span>}
          {dueSoon.length > 0 && <span className="badge badge-prospect">{dueSoon.length} επείγοντα</span>}
        </div>
      </div>
      <div style={{ padding: rows.length ? '4px 8px 8px' : 16 }}>
        {loading ? <Skeleton h={60} /> : rows.length === 0 ? <span className="muted">Δεν υπάρχουν επείγοντα follow-ups.</span> : rows.map((f) => (
          <div className="search-row" key={f.id} style={{ padding: '10px 8px' }}>
            <div className="avatar sq" style={{ width: 34, height: 34, background: f.computed_status === 'overdue' ? 'var(--red-soft)' : 'var(--amber-soft)', color: f.computed_status === 'overdue' ? 'var(--red)' : 'var(--amber)' }}><Icon name="bell" size={16} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{f.title}</div>
              <div className="meta">{f.customer_name} · {new Date(f.due_at).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' })}</div>
            </div>
            <button className="btn btn-sm btn-ghost" title="Αναβολή 1 ώρα" onClick={() => onSnooze(f.id)}><Icon name="clock" size={15} /></button>
            <button className="btn btn-sm btn-ghost" title="Ολοκλήρωση" onClick={() => onComplete(f.id)}><Icon name="check" size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
