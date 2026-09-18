import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Skeleton, Drawer, EmptyState } from '../../components/ui.jsx';

const ENTITY_TABS = [
  { key: 'customer', label: 'Πελάτες' },
  { key: 'branch', label: 'Υποκαταστήματα' },
  { key: 'space', label: 'Χώροι' },
];

const FIELD_TYPES = [
  { value: 'text', label: 'Κείμενο' },
  { value: 'long_text', label: 'Μεγάλο κείμενο' },
  { value: 'number', label: 'Αριθμός' },
  { value: 'date', label: 'Ημερομηνία' },
  { value: 'boolean', label: 'Ναι/Όχι' },
  { value: 'select', label: 'Επιλογή' },
  { value: 'multiselect', label: 'Πολλαπλή επιλογή' },
];
const TYPE_LABEL = Object.fromEntries(FIELD_TYPES.map((t) => [t.value, t.label]));
const HAS_OPTIONS = (t) => t === 'select' || t === 'multiselect';

export default function CustomFieldsPanel() {
  const qc = useQueryClient();
  const [entity, setEntity] = useState('customer');
  const [editing, setEditing] = useState(null); // {field} | {} (new) | null
  const { data, isLoading } = useQuery({
    queryKey: ['custom-fields', entity],
    queryFn: ({ signal }) => api.customFields(entity, { signal }),
  });
  const fields = data?.fields || [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['custom-fields', entity] });

  const move = async (idx, dir) => {
    const arr = [...fields];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    await api.reorderCustomFields(arr.map((f) => f.id));
    refresh();
  };
  const toggleActive = async (f) => { await api.updateCustomField(f.id, { active: !f.active }); refresh(); };
  const duplicate = async (f) => { await api.duplicateCustomField(f.id); refresh(); };
  const remove = async (f) => { if (confirm(`Διαγραφή πεδίου «${f.name}»;`)) { await api.deleteCustomField(f.id); refresh(); } };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className="btn btn-accent" onClick={() => setEditing({})}><Icon name="plus" size={16} /> Νέο πεδίο</button>
      </div>

      <div className="tabs" style={{ marginBottom: 18 }}>
        {ENTITY_TABS.map((t) => (
          <button key={t.key} className={`tab${entity === t.key ? ' active' : ''}`} onClick={() => setEntity(t.key)}>{t.label}</button>
        ))}
      </div>

      <div className="card">
        <div className="cf-row" style={{ gridTemplateColumns: '2fr 1fr 1.7fr 0.9fr', background: 'var(--surface-2)', fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)' }}>
          <div>Όνομα πεδίου</div><div>Τύπος</div><div>Ιδιότητες</div><div style={{ textAlign: 'right' }}>Ενέργειες</div>
        </div>
        {isLoading ? (
          <div style={{ padding: 16 }}><Skeleton h={40} /><Skeleton h={40} style={{ marginTop: 10 }} /></div>
        ) : fields.length === 0 ? (
          <EmptyState icon="settings" title="Χωρίς πεδία" hint="Προσθέστε το πρώτο δυναμικό πεδίο." />
        ) : fields.map((f, idx) => (
          <div className="cf-row" style={{ gridTemplateColumns: '2fr 1fr 1.7fr 0.9fr' }} key={f.id}>
            <div>
              <div style={{ fontWeight: 600, opacity: f.active ? 1 : 0.5 }}>{f.name}</div>
              <div className="meta" style={{ fontSize: 12 }}>{f.key}{f.section ? ` · ${f.section}` : ''}</div>
            </div>
            <div><span className="pill">{TYPE_LABEL[f.field_type] || f.field_type}</span></div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {f.searchable ? <span className="pill" style={{ color: 'var(--accent)', background: 'var(--accent-soft)', border: 'none' }}>Searchable</span> : null}
              {f.filterable ? <span className="pill" style={{ color: 'var(--green)', background: 'var(--green-soft)', border: 'none' }}>Filterable</span> : null}
              {f.visible_in_list ? <span className="pill">Λίστα</span> : null}
              {f.required ? <span className="pill" style={{ color: 'var(--red)', background: 'var(--red-soft)', border: 'none' }}>Υποχρεωτικό</span> : null}
              <button className={`badge badge-${f.active ? 'active' : 'inactive'}`} style={{ border: 'none', cursor: 'pointer' }} onClick={() => toggleActive(f)}>
                <span className="dot" />{f.active ? 'Ενεργό' : 'Ανενεργό'}
              </button>
            </div>
            <div style={{ textAlign: 'right', display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <button className="btn btn-sm btn-ghost btn-icon" title="Πάνω" disabled={idx === 0} onClick={() => move(idx, -1)}><Icon name="chevronUp" size={15} /></button>
              <button className="btn btn-sm btn-ghost btn-icon" title="Κάτω" disabled={idx === fields.length - 1} onClick={() => move(idx, 1)}><Icon name="chevronDown" size={15} /></button>
              <button className="btn btn-sm btn-ghost btn-icon" title="Επεξεργασία" onClick={() => setEditing({ field: f })}><Icon name="edit" size={15} /></button>
              <button className="btn btn-sm btn-ghost btn-icon" title="Διπλασιασμός" onClick={() => duplicate(f)}><Icon name="layers" size={15} /></button>
              <button className="btn btn-sm btn-ghost btn-icon" title="Διαγραφή" onClick={() => remove(f)}><Icon name="x" size={15} /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="card card-pad" style={{ marginTop: 16, display: 'flex', gap: 11, alignItems: 'center', color: 'var(--text-2)' }}>
        <div className="avatar sq" style={{ width: 38, height: 38, background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="layers" size={18} /></div>
        <div style={{ fontSize: 13 }}>
          <b>Typed-value αρχιτεκτονική.</b> Τα πεδία με <span className="pill" style={{ color: 'var(--accent)', background: 'var(--accent-soft)', border: 'none' }}>Searchable</span> / <span className="pill" style={{ color: 'var(--green)', background: 'var(--green-soft)', border: 'none' }}>Filterable</span> ενσωματώνονται σε indexes για γρήγορη αναζήτηση — χωρίς full table scans.
        </div>
      </div>

      {editing && (
        <FieldFormDrawer entity={entity} initial={editing.field}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />
      )}
    </div>
  );
}

function FieldFormDrawer({ entity, initial, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    name: initial?.name || '', field_type: initial?.field_type || 'text', section: initial?.section || '',
    required: !!initial?.required, searchable: !!initial?.searchable, filterable: !!initial?.filterable,
    visible_in_list: !!initial?.visible_in_list,
    options: (initial?.settings?.options || []).join('\n'),
    showIfField: initial?.settings?.showIf?.field || '',
    showIfEquals: initial?.settings?.showIf?.equals || '',
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setSaving(true);
    const settings = {};
    if (HAS_OPTIONS(f.field_type)) settings.options = f.options.split('\n').map((x) => x.trim()).filter(Boolean);
    if (f.showIfField && f.showIfEquals) settings.showIf = { field: f.showIfField, equals: f.showIfEquals };
    const payload = {
      entity_type: entity, name: f.name, field_type: f.field_type, section: f.section || null,
      required: f.required, searchable: f.searchable, filterable: f.filterable, visible_in_list: f.visible_in_list,
      settings,
    };
    try {
      if (initial) await api.updateCustomField(initial.id, payload); else await api.createCustomField(payload);
      onSaved();
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };

  const inp = { width: '100%', height: 40, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 9 };
  return (
    <Drawer title={initial ? 'Επεξεργασία πεδίου' : 'Νέο πεδίο'} subtitle={initial ? initial.key : `Οντότητα: ${entity}`} onClose={onClose}>
      {err && <div className="auth-error">{err}</div>}
      <form onSubmit={submit}>
        <div className="field-group"><label>Όνομα</label><input style={inp} value={f.name} onChange={set('name')} required /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field-group" style={{ flex: 1 }}><label>Τύπος</label>
            <select style={inp} value={f.field_type} onChange={set('field_type')}>
              {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="field-group" style={{ flex: 1 }}><label>Ενότητα</label><input style={inp} value={f.section} onChange={set('section')} placeholder="π.χ. Συνδρομή" /></div>
        </div>
        {HAS_OPTIONS(f.field_type) && (
          <div className="field-group"><label>Επιλογές (μία ανά γραμμή)</label>
            <textarea rows={4} style={{ ...inp, height: 'auto', padding: '8px 10px', fontFamily: 'inherit' }} value={f.options} onChange={set('options')} />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, margin: '4px 0 12px' }}>
          <label style={chk}><input type="checkbox" checked={f.required} onChange={set('required')} /> Υποχρεωτικό</label>
          <label style={chk}><input type="checkbox" checked={f.visible_in_list} onChange={set('visible_in_list')} /> Ορατό στη λίστα</label>
          <label style={chk}><input type="checkbox" checked={f.searchable} onChange={set('searchable')} /> Searchable</label>
          <label style={chk}><input type="checkbox" checked={f.filterable} onChange={set('filterable')} /> Filterable</label>
        </div>
        <div className="field-group">
          <label>Συνθήκη εμφάνισης (προαιρετικό)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12 }}>Εμφάνιση αν</span>
            <input style={{ ...inp, flex: 1 }} placeholder="πεδίο (π.χ. customer_type)" value={f.showIfField} onChange={set('showIfField')} />
            <span className="muted" style={{ fontSize: 12 }}>=</span>
            <input style={{ ...inp, flex: 1 }} placeholder="τιμή (π.χ. company)" value={f.showIfEquals} onChange={set('showIfEquals')} />
          </div>
        </div>
        <button className="btn btn-accent btn-block" disabled={saving}>{saving ? <span className="spinner" /> : <Icon name="check" size={16} />} {initial ? 'Αποθήκευση' : 'Δημιουργία'}</button>
      </form>
    </Drawer>
  );
}

const chk = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 };
