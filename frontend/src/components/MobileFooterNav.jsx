import Icon from './Icon.jsx';

// New mobile bottom footer nav — only rendered/visible below the app's mobile
// breakpoint (see .mobile-footer-nav in styles.css). Holds a small curated,
// permission-filtered, configurable subset of the same NAV items as the
// desktop sidebar and reuses the same tab-open mechanism.
export default function MobileFooterNav({ items, activeId, onOpen }) {
  if (!items?.length) return null;
  return (
    <nav className="mobile-footer-nav" aria-label="Κύριο μενού (κινητό)">
      {items.map((n) => (
        <button
          key={n.id}
          type="button"
          className={`mobile-footer-item${activeId === n.id ? ' active' : ''}`}
          onClick={() => onOpen(n)}
          title={n.external ? n.url : undefined}
        >
          <Icon name={n.icon} size={20} />
          <span>{n.label}</span>
        </button>
      ))}
    </nav>
  );
}
