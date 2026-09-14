import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { Skeleton } from '../components/ui.jsx';

const ENTITY_TABS = [
  { key: 'customer', label: 'Πελάτες' },
  { key: 'branch', label: 'Υποκαταστήματα' },
  { key: 'space', label: 'Χώροι' },
];

const FIELD_TYPE_LABELS = {
  text: 'Κείμενο', number: 'Αριθμός', date: 'Ημερομηνία', boolean: 'Ναι/Όχι',
  select: 'Επιλογή', multiselect: 'Πολλαπλή επιλογή',
};

export default function Settings() {
  const [entity, setEntity] = useState('customer');
  const { data, isLoading } = useQuery({
    queryKey: ['custom-fields', entity],
    queryFn: ({ signal }) => api.customFields(entity, { signal }),
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Ρυθμίσεις · Custom Fields</h1>
          <div className="sub">Δυναμικά πεδία για Πελάτες, Υποκαταστήματα και Χώρους — χωρίς αλλαγές στη βάση.</div>
        </div>
        <button className="btn btn-accent"><Icon name="plus" size={16} /> Νέο πεδίο</button>
      </div>

      <div className="tabs" style={{ marginBottom: 18 }}>
        {ENTITY_TABS.map((t) => (
          <button key={t.key} className={`tab${entity === t.key ? ' active' : ''}`} onClick={() => setEntity(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="cf-row" style={{ background: 'var(--surface-2)', fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)' }}>
          <div>Όνομα πεδίου</div><div>Τύπος</div><div>Ιδιότητες</div><div style={{ textAlign: 'right' }}>Ενέργειες</div>
        </div>
        {isLoading ? (
          <div style={{ padding: 16 }}><Skeleton h={40} /><Skeleton h={40} style={{ marginTop: 10 }} /></div>
        ) : data.fields.map((f) => (
          <div className="cf-row" key={f.id}>
            <div>
              <div style={{ fontWeight: 600 }}>{f.name}</div>
              <div className="meta" style={{ fontSize: 12 }}>{f.key}{f.section ? ` · ${f.section}` : ''}</div>
            </div>
            <div><span className="pill">{FIELD_TYPE_LABELS[f.field_type] || f.field_type}</span></div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {f.searchable && <span className="pill" style={{ color: 'var(--accent)', borderColor: 'var(--accent-soft)', background: 'var(--accent-soft)' }}>Searchable</span>}
              {f.filterable && <span className="pill" style={{ color: 'var(--green)', borderColor: 'var(--green-soft)', background: 'var(--green-soft)' }}>Filterable</span>}
              {f.visible_in_list && <span className="pill">Λίστα</span>}
              {f.required && <span className="pill" style={{ color: 'var(--red)', borderColor: 'var(--red-soft)', background: 'var(--red-soft)' }}>Υποχρεωτικό</span>}
              <span className={`badge badge-${f.active ? 'active' : 'inactive'}`}><span className="dot" />{f.active ? 'Ενεργό' : 'Ανενεργό'}</span>
            </div>
            <div style={{ textAlign: 'right', display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              <button className="btn btn-sm btn-ghost btn-icon"><Icon name="edit" size={15} /></button>
              <button className="btn btn-sm btn-ghost btn-icon"><Icon name="more" size={15} /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="card card-pad" style={{ marginTop: 16, display: 'flex', gap: 11, alignItems: 'center', color: 'var(--text-2)' }}>
        <div className="avatar sq" style={{ width: 38, height: 38, background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="layers" size={18} /></div>
        <div style={{ fontSize: 13 }}>
          <b>Typed-value αρχιτεκτονική.</b> Τα πεδία με <span className="pill" style={{ color: 'var(--accent)', background: 'var(--accent-soft)', border: 'none' }}>Searchable</span> / <span className="pill" style={{ color: 'var(--green)', background: 'var(--green-soft)', border: 'none' }}>Filterable</span> ενσωματώνονται σε indexes (B-tree / trigram) για γρήγορη αναζήτηση σε 350.000+ εγγραφές — χωρίς full table scans.
        </div>
      </div>
    </div>
  );
}
