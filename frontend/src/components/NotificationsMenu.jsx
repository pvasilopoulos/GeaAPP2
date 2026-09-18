import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from './Icon.jsx';
import { api } from '../api.js';
import { useAuth } from '../store/auth.js';
import { useTabs } from '../store/tabs.js';
import { formatRelativeTime, notificationIcon, notificationTarget } from '../lib/notifications.js';

function openNotificationTarget(target, { openCustomer, openTab }) {
  if (!target) return;
  if (target.kind === 'customer' && target.customerId) {
    openCustomer({ id: target.customerId, full_name: target.customerName });
    return;
  }
  if (target.kind === 'quote') {
    openTab({ id: 'quotes', type: 'quotes', title: 'Προσφορές', icon: 'file' });
    return;
  }
  if (target.kind === 'connector') {
    openTab({ id: 'settings', type: 'settings', title: 'Ρυθμίσεις', icon: 'settings', initialCat: 'connectors' });
  }
}

export default function NotificationsMenu() {
  const user = useAuth((s) => s.user);
  const openCustomer = useTabs((s) => s.openCustomer);
  const openTab = useTabs((s) => s.openTab);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const countQuery = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: ({ signal }) => api.notificationUnreadCount({ signal }),
    enabled: !!user,
    refetchInterval: 45000,
  });
  const listQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: ({ signal }) => api.notifications({ limit: 30 }, { signal }),
    enabled: !!user && open,
  });

  const count = Number(countQuery.data?.count || 0);
  const items = listQuery.data?.results || [];

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['notifications'] }),
      qc.invalidateQueries({ queryKey: ['notifications-unread'] }),
    ]);
  };

  const markRead = async (id) => {
    await api.markNotificationRead(id);
    await invalidate();
  };

  const markAll = async () => {
    await api.markAllNotificationsRead();
    await invalidate();
  };

  const dismiss = async (id, e) => {
    e.stopPropagation();
    await api.dismissNotification(id);
    await invalidate();
  };

  const onOpenItem = async (item) => {
    if (item.unread) await markRead(item.id).catch(() => {});
    openNotificationTarget(notificationTarget(item), { openCustomer, openTab });
    setOpen(false);
  };

  if (!user) return null;
  const badge = count > 99 ? '99+' : String(count);

  return (
    <div className="notif-menu" ref={ref}>
      <button
        className="btn btn-icon btn-ghost notif-btn"
        aria-label="Ειδοποιήσεις"
        aria-expanded={open}
        aria-haspopup="true"
        title="Ειδοποιήσεις"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="bell" />
        {count > 0 && <span className="notif-badge">{badge}</span>}
      </button>
      {open && (
        <div className="notif-pop" role="menu">
          <div className="hd">
            <div>
              <div className="notif-title">Ειδοποιήσεις</div>
              {count > 0 && <div className="notif-sub">{count} μη αναγνωσμένες</div>}
            </div>
            {items.some((n) => n.unread) && (
              <button type="button" className="notif-action" onClick={markAll}>
                Σήμανση όλων
              </button>
            )}
          </div>
          <div className="notif-list">
            {listQuery.isLoading && <div className="notif-empty">Φόρτωση…</div>}
            {!listQuery.isLoading && !items.length && (
              <div className="notif-empty">Δεν υπάρχουν ειδοποιήσεις</div>
            )}
            {items.map((item) => (
              <div
                key={item.id}
                className={`notif-item${item.unread ? ' unread' : ''}`}
                role="menuitem"
                tabIndex={0}
                onClick={() => onOpenItem(item)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenItem(item); } }}
              >
                <span className={`notif-icon ${item.type}`}>
                  <Icon name={notificationIcon(item.type)} size={15} />
                </span>
                <div className="notif-body">
                  <div className="ttl">{item.title}</div>
                  {item.body && <div className="msg">{item.body}</div>}
                  <div className="meta">{formatRelativeTime(item.created_at)}</div>
                </div>
                <div className="notif-item-actions">
                  {item.unread && (
                    <button
                      type="button"
                      className="notif-mini"
                      title="Σήμανση ως αναγνωσμένο"
                      aria-label="Σήμανση ως αναγνωσμένο"
                      onClick={(e) => { e.stopPropagation(); markRead(item.id); }}
                    >
                      <Icon name="check" size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="notif-mini"
                    title="Αρχειοθέτηση"
                    aria-label="Αρχειοθέτηση"
                    onClick={(e) => dismiss(item.id, e)}
                  >
                    <Icon name="archive" size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
