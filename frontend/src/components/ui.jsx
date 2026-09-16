import { useEffect, useRef } from 'react';
import { initials, avatarColor, STATUS_LABELS, BRANCH_STATUS_LABELS, SPACE_STATUS_LABELS } from '../lib/format.js';
import Icon from './Icon.jsx';

export function Avatar({ name, src, size = 40, square = false, fallback = true }) {
  if (!src && !fallback) return null;
  const style = { width: size, height: size, fontSize: size * 0.38, background: avatarColor(name) };
  return (
    <div className={`avatar${square ? ' sq' : ''}`} style={style}>
      {src ? <img src={src} alt={name} /> : initials(name)}
    </div>
  );
}

export function StatusBadge({ status }) {
  const label = STATUS_LABELS[status] || BRANCH_STATUS_LABELS[status] || SPACE_STATUS_LABELS[status] || status;
  return (
    <span className={`badge badge-${status}`}>
      <span className="dot" />
      {label}
    </span>
  );
}

export function VipBadge() {
  return (
    <span className="badge badge-vip">
      <Icon name="star" size={12} /> VIP
    </span>
  );
}

export function Tag({ name, color = 'blue', onRemove }) {
  return (
    <span className={`tag tag-${color}`}>
      {name}
      {onRemove && (
        <button type="button" className="tag-x" onClick={(e) => { e.stopPropagation(); onRemove(); }} aria-label="Αφαίρεση">
          <Icon name="x" size={11} />
        </button>
      )}
    </span>
  );
}

export function Skeleton({ w = '100%', h = 14, style }) {
  return <div className="skeleton" style={{ width: w, height: h, ...style }} />;
}

export function EmptyState({ icon = 'grid', title, hint }) {
  return (
    <div className="empty">
      <Icon name={icon} size={34} />
      <div style={{ fontWeight: 600, color: 'var(--text-2)' }}>{title}</div>
      {hint && <div style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

// Drawers can stack, so the background is only released once the last one
// closes. Without this the page behind keeps scrolling under the sheet.
let openDrawers = 0;

const DISMISS_AFTER_PX = 110;

export function Drawer({ title, subtitle, onClose, children, wide = false }) {
  const sheetRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    openDrawers += 1;
    document.body.classList.add('drawer-open');
    return () => {
      openDrawers = Math.max(0, openDrawers - 1);
      if (!openDrawers) document.body.classList.remove('drawer-open');
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Swipe down to dismiss. Bound to the grip alone, so it can never fight with
  // scrolling the form inside the sheet. The grip is hidden on desktop.
  const startDrag = (e) => {
    dragRef.current = { y: e.clientY };
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const moveDrag = (e) => {
    if (!dragRef.current || !sheetRef.current) return;
    const dy = Math.max(0, e.clientY - dragRef.current.y);
    sheetRef.current.style.transform = dy ? `translateY(${dy}px)` : '';
  };
  const endDrag = (e) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || !sheetRef.current) return;
    const dy = Math.max(0, e.clientY - drag.y);
    sheetRef.current.style.transition = '';
    sheetRef.current.style.transform = '';
    if (dy > DISMISS_AFTER_PX) onClose?.();
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside ref={sheetRef} className={`drawer${wide ? ' drawer-wide' : ''}`}
        role="dialog" aria-modal="true" aria-label={title}>
        <div
          className="drawer-grip"
          aria-hidden="true"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        <div className="drawer-head">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
            {subtitle && <div style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Κλείσιμο">
            <Icon name="x" />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}

export function BranchThumb({ src, name, size = 56, radius = 9 }) {
  const url = String(src || '').trim();
  if (!url) return null;
  return (
    <img className="branch-thumb" src={url} alt={name}
      style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flex: 'none', background: 'var(--surface-2)' }}
      onError={(e) => { e.currentTarget.remove(); }} />
  );
}
