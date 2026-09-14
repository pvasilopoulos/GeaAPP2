import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { Avatar, StatusBadge } from './ui.jsx';

export default function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Debounced, cancellable global search.
  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      api.globalSearch(q.trim(), { signal: ctrl.signal })
        .then((r) => { setResults(r); setLoading(false); })
        .catch((e) => { if (e.name !== 'AbortError') setLoading(false); });
    }, 220);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); inputRef.current?.focus(); setOpen(true); }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, []);

  const go = (path) => { setOpen(false); setQ(''); navigate(path); };
  const has = results && (results.customers.length || results.branches.length || results.spaces.length);

  return (
    <div className="global-search" ref={boxRef}>
      <div className="field">
        <Icon name="search" size={17} />
        <input
          ref={inputRef}
          value={q}
          placeholder="Αναζήτηση πελατών, κρατήσεων, χώρων…"
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {loading ? <span className="spinner" /> : <span className="kbd">⌘K</span>}
      </div>

      {open && q.trim().length >= 2 && (
        <div className="search-results">
          {!has && !loading && <div className="empty" style={{ padding: 24 }}>Δεν βρέθηκαν αποτελέσματα</div>}

          {results?.customers?.length > 0 && (
            <>
              <div className="search-group-label">Πελάτες</div>
              {results.customers.map((c) => (
                <div className="search-row" key={`c${c.id}`} onClick={() => go(`/customers/${c.id}`)}>
                  <Avatar name={c.full_name} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{c.full_name}</div>
                    <div className="meta">#{c.code}{c.primary_branch ? ` · ${c.primary_branch}` : ''}</div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              ))}
            </>
          )}

          {results?.branches?.length > 0 && (
            <>
              <div className="search-group-label">Υποκαταστήματα</div>
              {results.branches.map((b) => (
                <div className="search-row" key={`b${b.id}`} onClick={() => go('/branches')}>
                  <div className="avatar sq" style={{ width: 32, height: 32, fontSize: 13 }}><Icon name="building" size={16} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{b.name}</div>
                    <div className="meta">#{b.code} · {b.city}</div>
                  </div>
                </div>
              ))}
            </>
          )}

          {results?.spaces?.length > 0 && (
            <>
              <div className="search-group-label">Χώροι</div>
              {results.spaces.map((s) => (
                <div className="search-row" key={`s${s.id}`} onClick={() => go('/spaces')}>
                  <div className="avatar sq" style={{ width: 32, height: 32, background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="grid" size={15} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div className="meta">{s.space_type} · {s.branch_name}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
