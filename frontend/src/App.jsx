import { useEffect, useRef, useState } from 'react';
import Icon from './components/Icon.jsx';
import GlobalSearch from './components/GlobalSearch.jsx';
import TabBar from './components/TabBar.jsx';
import { Avatar } from './components/ui.jsx';
import { useTabs } from './store/tabs.js';
import { useAuth } from './store/auth.js';
import { PERMS } from './lib/perms.js';
import Dashboard from './pages/Dashboard.jsx';
import Customers from './pages/Customers.jsx';
import CustomerProfile from './pages/CustomerProfile.jsx';
import Settings from './pages/Settings.jsx';
import Users from './pages/Users.jsx';
import Placeholder from './pages/Placeholder.jsx';

// Sidebar entries → open (or activate) a workspace tab. `perm` gates visibility.
const NAV = [
  { id: 'dashboard', type: 'dashboard', label: 'Αρχική', icon: 'home' },
  { id: 'customers', type: 'customers', label: 'Πελάτες', icon: 'users' },
  { id: 'bookings', type: 'bookings', label: 'Κρατήσεις', icon: 'calendar' },
  { id: 'branches', type: 'branches', label: 'Υποκαταστήματα', icon: 'building' },
  { id: 'spaces', type: 'spaces', label: 'Χώροι', icon: 'grid' },
  { id: 'calendar', type: 'calendar', label: 'Ημερολόγιο', icon: 'calendar' },
  { id: 'reports', type: 'reports', label: 'Αναφορές', icon: 'chart' },
  { id: 'communications', type: 'communications', label: 'Επικοινωνίες', icon: 'message' },
  { id: 'documents', type: 'documents', label: 'Έγγραφα', icon: 'file' },
  { id: 'users', type: 'users', label: 'Χρήστες & Ρόλοι', icon: 'users', perms: [PERMS.USERS_MANAGE, PERMS.ROLES_MANAGE] },
  { id: 'settings', type: 'settings', label: 'Ρυθμίσεις', icon: 'settings', perms: [PERMS.SETTINGS_MANAGE] },
];

function UserMenu() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  if (!user) return null;
  return (
    <div className="user-menu" ref={ref}>
      <button className="user-btn" onClick={() => setOpen((o) => !o)}>
        <Avatar name={user.fullName} size={30} />
        <div className="who"><b>{user.fullName}</b><br /><span>{user.roleName}</span></div>
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="user-pop">
          <div className="hd">
            <div style={{ fontWeight: 600 }}>{user.fullName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{user.email}</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className="role-pill">{user.roleName}</span>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>· {user.tenantName}</span>
            </div>
          </div>
          <div className="item" onClick={logout}><Icon name="arrowLeft" size={16} /> Αποσύνδεση</div>
        </div>
      )}
    </div>
  );
}

function TabContent({ tab }) {
  const activateTab = useTabs((s) => s.activateTab);
  const openCustomer = useTabs((s) => s.openCustomer);
  switch (tab.type) {
    case 'dashboard': return <Dashboard />;
    case 'customers': return <Customers onOpenCustomer={openCustomer} />;
    case 'customer': return <CustomerProfile customerId={tab.customerId} tabId={tab.id} onBack={() => activateTab('customers')} />;
    case 'settings': return <Settings />;
    case 'users': return <Users />;
    default: return <Placeholder title={tab.title} icon={tab.icon} />;
  }
}

export default function App() {
  const user = useAuth((s) => s.user);
  const hasPerm = useAuth((s) => s.hasPerm);
  const { tabs, activeId, openTab } = useTabs();
  const [navOpen, setNavOpen] = useState(false);

  const nav = NAV.filter((n) => !n.perms || n.perms.some((p) => hasPerm(p)));
  const openNavTab = (n) => { openTab({ id: n.id, type: n.type, title: n.label, icon: n.icon }); setNavOpen(false); };

  return (
    <div className={`app${navOpen ? ' nav-open' : ''}`}>
      <div className="nav-backdrop" onClick={() => setNavOpen(false)} />
      <nav className="sidebar">
        <div className="brand">
          <span className="logo"><Icon name="layers" size={17} /></span>
          SpaceHub
        </div>
        <div className="nav-group">
          {nav.map((n) => (
            <button key={n.id} className={`nav-item${activeId === n.id ? ' active' : ''}`}
              onClick={() => openNavTab(n)}>
              <Icon name={n.icon} />
              {n.label}
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <Avatar name={user?.fullName} size={34} />
          <div className="who">
            <b>{user?.fullName}</b><br />
            <span>{user?.tenantName}</span>
          </div>
        </div>
      </nav>

      <div className="main">
        <header className="topbar">
          <button className="btn btn-icon btn-ghost menu-btn" onClick={() => setNavOpen((o) => !o)} aria-label="Μενού">
            <Icon name="grid" />
          </button>
          <GlobalSearch />
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-icon btn-ghost" aria-label="Ειδοποιήσεις"><Icon name="bell" /></button>
            <UserMenu />
          </div>
        </header>
        <TabBar />
        <main className="content">
          <div className="content-narrow">
            {/* Keep every open tab mounted; show only the active one so state
                (filters, scroll, active section) is preserved on switch. */}
            {tabs.map((t) => (
              <div key={t.id} style={{ display: t.id === activeId ? 'block' : 'none' }}>
                <TabContent tab={t} />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
