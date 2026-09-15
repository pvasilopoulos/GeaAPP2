import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../Icon.jsx';
import { Tag } from '../ui.jsx';

export default function TagsEditor({ customerId, tags, canWrite }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const ref = useRef(null);
  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: ({ signal }) => api.meta({ signal }) });
  const current = new Set((tags || []).map((t) => t.id));
  const refresh = () => qc.invalidateQueries({ queryKey: ['customer', customerId] });

  const add = async (payload) => {
    await api.addCustomerTag(customerId, payload);
    setName(''); setOpen(false); refresh();
    qc.invalidateQueries({ queryKey: ['meta'] });
  };
  const remove = async (tagId) => { await api.removeCustomerTag(customerId, tagId); refresh(); };

  return (
    <div className="card-pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, position: 'relative' }} ref={ref}>
      {(tags || []).length === 0 && <span className="muted">Χωρίς ετικέτες</span>}
      {(tags || []).map((t) => (
        <Tag key={t.id} name={t.name} color={t.color} onRemove={canWrite ? () => remove(t.id) : undefined} />
      ))}
      {canWrite && (
        <button type="button" className="tag tag-add" onClick={() => setOpen((o) => !o)}>
          <Icon name="plus" size={12} /> Προσθήκη
        </button>
      )}
      {open && (
        <div className="tag-pop">
          <div className="search-group-label">Υπάρχουσες</div>
          {(meta?.tags || []).filter((t) => !current.has(t.id)).map((t) => (
            <div key={t.id} className="search-row" onClick={() => add({ tagId: t.id })}>
              <Tag name={t.name} color={t.color} />
            </div>
          ))}
          {(meta?.tags || []).every((t) => current.has(t.id)) && <div className="muted" style={{ padding: '6px 10px' }}>Όλες οι ετικέτες έχουν προστεθεί</div>}
          <div style={{ display: 'flex', gap: 6, padding: 8, borderTop: '1px solid var(--border)' }}>
            <input value={name} placeholder="Νέα ετικέτα…" onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { e.preventDefault(); add({ name: name.trim() }); } }}
              style={{ flex: 1, height: 32, padding: '0 8px', border: '1px solid var(--border-strong)', borderRadius: 8 }} />
            <button className="btn btn-sm btn-accent" disabled={!name.trim()} onClick={() => add({ name: name.trim() })}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}
