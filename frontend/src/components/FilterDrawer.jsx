import Icon from './Icon.jsx';
import { Drawer } from './ui.jsx';

const inp = { width: '100%', height: 38, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 9, background: '#fff' };
const Row = ({ children }) => <div style={{ display: 'flex', gap: 10 }}>{children}</div>;

function Group({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-3)', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}
function Field({ label, children }) {
  return <div className="field-group" style={{ marginBottom: 12 }}><label>{label}</label>{children}</div>;
}

// Grouped filter panel. Applies changes live via onSet(key, value).
export default function FilterDrawer({ filters, meta, onSet, onClear, onClose }) {
  const m = meta || {};
  const toggleStatus = (v) => {
    const cur = filters.status || [];
    onSet('status', cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  };
  return (
    <Drawer title="Φίλτρα" subtitle="Περιορίστε τα αποτελέσματα" onClose={onClose}>
      <Group title="Πελάτης">
        <Field label="Κατάσταση">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(m.statuses || []).map((s) => (
              <label key={s.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={(filters.status || []).includes(s.value)} onChange={() => toggleStatus(s.value)} /> {s.label}
              </label>
            ))}
          </div>
        </Field>
        <Row>
          <Field label="Τύπος">
            <select style={inp} value={filters.customerType} onChange={(e) => onSet('customerType', e.target.value)}>
              <option value="">Όλοι</option>
              {(m.customerTypes || []).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Ετικέτα">
            <select style={inp} value={filters.tag} onChange={(e) => onSet('tag', e.target.value)}>
              <option value="">Όλες</option>
              {(m.tags || []).map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Υπεύθυνος">
            <select style={inp} value={filters.employeeId} onChange={(e) => onSet('employeeId', e.target.value)}>
              <option value="">Όλοι</option>
              {(m.employees || []).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </Field>
          <Field label="Πόλη πελάτη">
            <select style={inp} value={filters.city} onChange={(e) => onSet('city', e.target.value)}>
              <option value="">Όλες</option>
              {(m.customerCities || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </Row>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, margin: '2px 0 14px' }}>
          <input type="checkbox" checked={!!filters.isVip} onChange={(e) => onSet('isVip', e.target.checked)} /> Μόνο VIP
        </label>
        <Field label="Ημ. εγγραφής">
          <Row>
            <input type="date" style={inp} value={filters.createdFrom} onChange={(e) => onSet('createdFrom', e.target.value)} />
            <input type="date" style={inp} value={filters.createdTo} onChange={(e) => onSet('createdTo', e.target.value)} />
          </Row>
        </Field>
        <Field label="Τελευταία επίσκεψη">
          <Row>
            <input type="date" style={inp} value={filters.lastVisitFrom} onChange={(e) => onSet('lastVisitFrom', e.target.value)} />
            <input type="date" style={inp} value={filters.lastVisitTo} onChange={(e) => onSet('lastVisitTo', e.target.value)} />
          </Row>
        </Field>
        <Field label="Συνολική αξία (€)">
          <Row>
            <input type="number" placeholder="από" style={inp} value={filters.valueMin} onChange={(e) => onSet('valueMin', e.target.value)} />
            <input type="number" placeholder="έως" style={inp} value={filters.valueMax} onChange={(e) => onSet('valueMax', e.target.value)} />
          </Row>
        </Field>
      </Group>

      <Group title="Υποκαταστήματα & Χώροι">
        <Row>
          <Field label="Πόλη υποκαταστήματος">
            <select style={inp} value={filters.branchCity} onChange={(e) => onSet('branchCity', e.target.value)}>
              <option value="">Όλες</option>
              {(m.branchCities || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Τύπος χώρου">
            <select style={inp} value={filters.spaceType} onChange={(e) => onSet('spaceType', e.target.value)}>
              <option value="">Όλοι</option>
              {(m.spaceTypes || []).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Ελάχ. υποκαταστήματα"><input type="number" style={inp} value={filters.minBranches} onChange={(e) => onSet('minBranches', e.target.value)} /></Field>
          <Field label="Ελάχ. χώροι"><input type="number" style={inp} value={filters.minSpaces} onChange={(e) => onSet('minSpaces', e.target.value)} /></Field>
        </Row>
      </Group>

      <div style={{ display: 'flex', gap: 10, position: 'sticky', bottom: 0, background: '#fff', paddingTop: 10 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClear}><Icon name="x" size={15} /> Καθαρισμός</button>
        <button className="btn btn-accent" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}><Icon name="check" size={15} /> Εφαρμογή</button>
      </div>
    </Drawer>
  );
}
