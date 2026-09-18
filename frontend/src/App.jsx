import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from './components/Icon.jsx';
import GlobalSearch from './components/GlobalSearch.jsx';
import TabBar from './components/TabBar.jsx';
import MobileFooterNav from './components/MobileFooterNav.jsx';
import { Avatar } from './components/ui.jsx';
import OfflineSyncStatus from './components/OfflineSyncStatus.jsx';
import NotificationsMenu from './components/NotificationsMenu.jsx';
import { useTabs } from './store/tabs.js';
import { useAuth } from './store/auth.js';
import { resolveSidebarMenu, resolveSidebarGroups, resolveMobileFooterMenu } from './lib/menu.js';
import { DEFAULT_APP_NAME, DEFAULT_BROWSER_TAB_TITLE } from './lib/branding.js';
import { isStandalone, promptInstall, refreshApp, subscribeInstallPrompt } from './lib/pwa.js';
import Dashboard from './pages/Dashboard.jsx';
import Customers from './pages/Customers.jsx';
import CustomerProfile from './pages/CustomerProfile.jsx';
import Settings from './pages/Settings.jsx';
import Placeholder from './pages/Placeholder.jsx';
import Quotes from './pages/Quotes.jsx';
import Calendar from './pages/Calendar.jsx';
import AuditLog from './pages/AuditLog.jsx';
import { api } from './api.js';


function isIosDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function AppRefresh() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try { await refreshApp(qc); }
    finally { setBusy(false); }
  };
  return (
    <button
      className="btn btn-icon btn-ghost"
      onClick={onClick}
      disabled={busy}
      aria-label="Ανανέωση"
      title="Ανανέωση δεδομένων και cache"
    >
      {busy ? <span className="spinner" /> : <Icon name="refresh" />}
    </button>
  );
}

function UserMenu() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const [open, setOpen] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  useEffect(() => subscribeInstallPrompt((ev) => setCanInstall(!!ev)), []);
  if (!user) return null;
  const showIosHint = !canInstall && !isStandalone() && isIosDevice();
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
          {canInstall && (
            <div className="item" onClick={async () => { await promptInstall(); setOpen(false); }}>
              <Icon name="download" size={16} /> Εγκατάσταση εφαρμογής
            </div>
          )}
          {showIosHint && (
            <div
              className="item"
              onClick={() => {
                window.alert('Στο Safari πατήστε Κοινή χρήση → Προσθήκη στην οθόνη Αφετηρίας.');
                setOpen(false);
              }}
            >
              <Icon name="download" size={16} /> Προσθήκη στην αρχική οθόνη
            </div>
          )}
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
    case 'settings': return <Settings initialCat={tab.initialCat} />;
    case 'quotes': return <Quotes />;
    case 'users': return <Settings initialCat="users" />;
    case 'calendar': return <Calendar onOpenCustomer={openCustomer} />;
    case 'audit': return <AuditLog />;
    default: return <Placeholder title={tab.title} icon={tab.icon} />;
  }
}

export default function App() {
  const user = useAuth((s) => s.user);
  const hasPerm = useAuth((s) => s.hasPerm);
  const { tabs, activeId, openTab } = useTabs();
  const [navOpen, setNavOpen] = useState(false);
  const { data: appSettings } = useQuery({
    queryKey: ['settings-app'],
    queryFn: ({ signal }) => api.appSettings({ signal }),
    enabled: !!user,
    select: (d) => d?.settings,
  });
  const appName = appSettings?.app_name || DEFAULT_APP_NAME;

  // Tenant-wide default menu + the current user's personal override. Both are
  // optional (untouched tenants/users get `undefined`, which resolves to the
  // original hardcoded nav via lib/menu.js).
  const { data: tenantMenu } = useQuery({
    queryKey: ['settings-menu'],
    queryFn: ({ signal }) => api.menuSettings({ signal }),
    enabled: !!user,
    select: (d) => d?.menu,
  });
  const { data: userMenu } = useQuery({
    queryKey: ['settings-menu-me'],
    queryFn: ({ signal }) => api.myMenuSettings({ signal }),
    enabled: !!user,
    select: (d) => d?.menu,
  });

  useEffect(() => {
    document.title = appSettings?.browser_tab_title || DEFAULT_BROWSER_TAB_TITLE;
  }, [appSettings?.browser_tab_title]);

  const { items: sidebarItems } = resolveSidebarMenu({ tenantMenu, userMenu, hasPerm, roleKey: user?.roleKey });
  const sidebarGroups = resolveSidebarGroups({ tenantMenu, items: sidebarItems });
  const mobileFooterItems = resolveMobileFooterMenu({ tenantMenu, userMenu, hasPerm, roleKey: user?.roleKey });
  // External links (custom URL entries) open in a new tab and never go
  // through the internal tab/routing system — they carry no route/type.
  const openNavTab = (n) => {
    if (n.external) { window.open(n.url, '_blank', 'noopener,noreferrer'); setNavOpen(false); return; }
    openTab({ id: n.id, type: n.type, title: n.label, icon: n.icon });
    setNavOpen(false);
  };

  return (
    <div className={`app${navOpen ? ' nav-open' : ''}`}>
      <div className="nav-backdrop" onClick={() => setNavOpen(false)} />
      <nav className="sidebar">
        <div className="brand">
          <span className="logo"><Icon name="layers" size={17} /></span>
          {appName}
        </div>
        <div className="nav-group">
          {sidebarGroups.map((group) => (
            <div className="nav-section" key={group.id}>
              <div className="nav-section-label">{group.label}</div>
              {group.items.map((n) => (
                <button key={n.id} className={`nav-item${activeId === n.id ? ' active' : ''}`}
                  onClick={() => openNavTab(n)} title={n.external ? n.url : undefined}>
                  <Icon name={n.icon} />
                  {n.label}
                  {n.external && <Icon name="chevronRight" size={12} className="nav-item-external" />}
                </button>
              ))}
            </div>
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
            <OfflineSyncStatus />
            <AppRefresh />
            <NotificationsMenu />
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
        <MobileFooterNav items={mobileFooterItems} activeId={activeId} onOpen={openNavTab} />
      </div>
    </div>
  );
}

