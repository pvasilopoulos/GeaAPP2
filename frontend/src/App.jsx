import { NavLink, Outlet } from 'react-router-dom';
import Icon from './components/Icon.jsx';
import GlobalSearch from './components/GlobalSearch.jsx';
import { Avatar } from './components/ui.jsx';

const NAV = [
  { to: '/', label: 'Αρχική', icon: 'home', end: true },
  { to: '/customers', label: 'Πελάτες', icon: 'users' },
  { to: '/bookings', label: 'Κρατήσεις', icon: 'calendar' },
  { to: '/branches', label: 'Υποκαταστήματα', icon: 'building' },
  { to: '/spaces', label: 'Χώροι', icon: 'grid' },
  { to: '/calendar', label: 'Ημερολόγιο', icon: 'calendar' },
  { to: '/reports', label: 'Αναφορές', icon: 'chart' },
  { to: '/communications', label: 'Επικοινωνίες', icon: 'message' },
  { to: '/documents', label: 'Έγγραφα', icon: 'file' },
  { to: '/settings', label: 'Ρυθμίσεις', icon: 'settings' },
];

export default function App() {
  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <span className="logo"><Icon name="layers" size={17} /></span>
          SpaceHub
        </div>
        <div className="nav-group">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </div>
        <div className="sidebar-footer">
          <Avatar name="Αναστασία Κ." size={34} />
          <div className="who">
            <b>Αναστασία Κ.</b><br />
            <span>Διαχειριστής</span>
          </div>
        </div>
      </nav>

      <div className="main">
        <header className="topbar">
          <GlobalSearch />
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-icon btn-ghost" aria-label="Ειδοποιήσεις"><Icon name="bell" /></button>
            <Avatar name="Αναστασία Κ." size={34} />
          </div>
        </header>
        <main className="content">
          <div className="content-narrow">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
