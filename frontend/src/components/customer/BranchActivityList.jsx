import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../Icon.jsx';
import { EmptyState, Skeleton } from '../ui.jsx';
import { formatDateTime } from '../../lib/format.js';

export default function BranchActivityList({ customerId, mode }) {
  const { data, isLoading } = useQuery({
    queryKey: ['history', 'branch-actions', customerId],
    queryFn: ({ signal }) => api.customerActivities(customerId, { limit: 100 }, { signal }),
    enabled: mode === 'actions',
  });
  const groups = useMemo(() => {
    const map = new Map();
    for (const item of data?.results || []) {
      const name = item.branch_name || 'Χωρίς υποκατάστημα';
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(item);
    }
    return [...map.entries()];
  }, [data]);

  if (mode === 'invoices') {
    return (
      <div className="card branch-module-empty">
        <EmptyState icon="file" title="Τα τιμολόγια θα εμφανιστούν εδώ"
          hint="Η ενότητα είναι έτοιμη για σύνδεση με το migration και το ERP/API τιμολογίων ανά υποκατάστημα." />
      </div>
    );
  }
  if (isLoading) return <div className="card card-pad"><Skeleton h={180} /></div>;
  if (!groups.length) return <div className="card"><EmptyState icon="activity" title="Χωρίς ενέργειες ανά υποκατάστημα" /></div>;

  return (
    <div className="branch-module-grid">
      {groups.map(([branch, items]) => (
        <section className="card branch-module-card" key={branch}>
          <div className="card-head">
            <h3><Icon name="building" /> {branch}</h3>
            <span className="pill">{items.length} ενέργειες</span>
          </div>
          <div className="branch-module-list">
            {items.slice(0, 12).map((item) => (
              <div className="branch-module-row" key={item.id}>
                <span className="branch-module-icon"><Icon name="activity" size={15} /></span>
                <div>
                  <b>{item.description || item.type}</b>
                  <small>{[item.space_name, formatDateTime(item.created_at)].filter(Boolean).join(' · ')}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
