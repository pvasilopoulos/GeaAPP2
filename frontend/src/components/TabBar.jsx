import { useTabs } from '../store/tabs.js';
import Icon from './Icon.jsx';

export default function TabBar() {
  const { tabs, activeId, activateTab, closeTab } = useTabs();
  return (
    <div className="tabbar">
      {tabs.map((t) => (
        <div
          key={t.id}
          className={`tab-chip${t.id === activeId ? ' active' : ''}`}
          onClick={() => activateTab(t.id)}
          title={t.title}
        >
          <Icon name={t.icon || 'grid'} />
          <span className="ttl">{t.title}</span>
          <span className="x" onClick={(e) => { e.stopPropagation(); closeTab(t.id); }} aria-label="Κλείσιμο">
            <Icon name="x" size={13} />
          </span>
        </div>
      ))}
    </div>
  );
}
