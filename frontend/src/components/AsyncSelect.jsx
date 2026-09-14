import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

// Async searchable selector — never renders thousands of options (spec §6).
export default function AsyncSelect({ value, label, placeholder, loader, onChange, icon = 'building' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      loader(q, ctrl.signal)
        .then((r) => { setItems(r); setLoading(false); })
        .catch((e) => { if (e.name !== 'AbortError') setLoading(false); });
    }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, open]);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className={`filter-chip${value ? ' active' : ''}`} onClick={() => setOpen((o) => !o)}>
        <Icon name={icon} size={15} />
        {value ? value.label : label}
        {value
          ? <Icon name="x" size={14} onClick={(e) => { e.stopPropagation(); onChange(null); }} />
          : <Icon name="chevronDown" size={14} />}
      </button>
      {open && (
        <div className="search-results" style={{ minWidth: 260, top: 40 }}>
          <div className="search-input" style={{ minWidth: 0, marginBottom: 6 }}>
            <Icon name="search" size={15} />
            <input autoFocus value={q} placeholder={placeholder} onChange={(e) => setQ(e.target.value)} />
            {loading && <span className="spinner" />}
          </div>
          {items.length === 0 && !loading && <div className="empty" style={{ padding: 16 }}>Δεν βρέθηκαν</div>}
          {items.map((it) => (
            <div key={it.value} className="search-row" onClick={() => { onChange(it); setOpen(false); setQ(''); }}>
              <div className="avatar sq" style={{ width: 30, height: 30, background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name={icon} size={15} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{it.label}</div>
                {it.sub && <div className="meta">{it.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
