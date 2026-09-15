import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../Icon.jsx';
import { Skeleton, EmptyState, Drawer, BranchThumb, StatusBadge } from '../ui.jsx';
import { formatCurrency, formatNumber, formatDate, BOOKING_STATUS, AMENITY_LABELS, mapUrl, hoursSummary } from '../../lib/format.js';
import { useAuth } from '../../store/auth.js';
import { PERMS } from '../../lib/perms.js';
import { BranchFormDrawer, SpaceFormDrawer } from '../forms.jsx';

export default function BranchesSpaces({ customerId }) {
  const qc = useQueryClient();
  const canWrite = useAuth((s) => s.hasPerm(PERMS.CUSTOMERS_WRITE));
  const [selectedId, setSelectedId] = useState(null);
  const [term, setTerm] = useState('');
  const [drawerSpace, setDrawerSpace] = useState(null);
  const [branchForm, setBranchForm] = useState(null); // {branch?}
  const [spaceForm, setSpaceForm] = useState(null);    // {branchId, space?}

  const { data, isLoading } = useQuery({
    queryKey: ['c-branches', customerId],
    queryFn: ({ signal }) => api.customerBranches(customerId, { signal }),
  });
  const visitsQ = useQuery({
    queryKey: ['c-visits', customerId, 'bs'],
    queryFn: ({ signal }) => api.customerVisits(customerId, { limit: 50 }, { signal }),
  });

  const branches = data?.branches || [];
  const selected = branches.find((b) => b.id === selectedId) || branches[0] || null;
  const filtered = useMemo(
    () => branches.filter((b) => b.name.toLowerCase().includes(term.toLowerCase())),
    [branches, term],
  );
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['c-branches', customerId] });
    qc.invalidateQueries({ queryKey: ['customer', customerId] });
  };

  if (isLoading) return <div className="card card-pad"><Skeleton h={200} /></div>;

  if (!branches.length) {
    return (
      <div className="card card-pad">
        <EmptyState icon="building" title="Χωρίς υποκαταστήματα"
          hint={canWrite ? 'Προσθέστε το πρώτο υποκατάστημα του πελάτη.' : undefined} />
        {canWrite && (
          <div style={{ textAlign: 'center' }}>
            <button className="btn btn-accent" onClick={() => setBranchForm({})}><Icon name="plus" size={16} /> Προσθήκη υποκαταστήματος</button>
          </div>
        )}
        {branchForm && <BranchFormDrawer customerId={customerId} initial={branchForm.branch}
          onClose={() => setBranchForm(null)} onSaved={() => { setBranchForm(null); refresh(); }} />}
      </div>
    );
  }

  const totals = branches.reduce((acc, b) => ({
    branches: acc.branches + 1, spaces: acc.spaces + b.spaces.length,
    visits: acc.visits + (b.visits_count || 0), value: acc.value + Number(b.total_value || 0),
  }), { branches: 0, spaces: 0, visits: 0, value: 0 });

  const branchVisits = (visitsQ.data?.results || []).filter((v) => !selected || v.branch_name === selected.name);

  const deleteBranch = async () => {
    if (!confirm(`Διαγραφή υποκαταστήματος «${selected.name}» και των χώρων του;`)) return;
    await api.deleteBranch(selected.id); setSelectedId(null); refresh();
  };

  return (
    <div className="bs-layout">
      {/* LEFT PANEL */}
      <div className="stack">
        <div className="card">
          <div className="card-head">
            <h3><Icon name="building" /> Υποκαταστήματα πελάτη</h3>
            {canWrite && <a className="link" onClick={() => setBranchForm({})}><Icon name="plus" size={13} /> Προσθήκη</a>}
          </div>
          <div className="card-pad" style={{ paddingBottom: 10 }}>
            <div className="search-input" style={{ minWidth: 0, height: 34, marginBottom: 10 }}>
              <Icon name="search" size={15} />
              <input value={term} placeholder="Αναζήτηση υποκαταστήματος…" onChange={(e) => setTerm(e.target.value)} />
            </div>
            <div className="branch-list">
              {filtered.map((b) => (
                <div key={b.id} className={`branch-item${selected?.id === b.id ? ' active' : ''}`} onClick={() => setSelectedId(b.id)}>
                  {b.image_url ? <BranchThumb src={b.image_url} name={b.name} size={56} /> : null}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="nm">{b.name} {b.is_primary && <span className="pill" style={{ color: 'var(--accent)', background: 'var(--accent-soft)', border: 'none' }}>Κύριο</span>}</div>
                    <div className="ad">{b.address_line}, {b.city}</div>
                    <div className="st"><StatusBadge status={b.status || 'active'} /> · {formatNumber(b.spaces.length)} χώροι · {formatNumber(b.visits_count)} επισκέψεις</div>
                  </div>
                  <Icon name="chevronRight" size={16} style={{ color: 'var(--text-3)' }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Icon name="layers" /> Συνολική εικόνα</h3></div>
          <div className="card-pad">
            <div className="stat-grid">
              <MiniOverview icon="building" v={formatNumber(totals.branches)} l="Υποκαταστήματα" />
              <MiniOverview icon="grid" v={formatNumber(totals.spaces)} l="Σύνολο χώρων" />
              <MiniOverview icon="pin" v={formatNumber(totals.visits)} l="Επισκέψεις" />
              <MiniOverview icon="wallet" v={formatCurrency(totals.value)} l="Συνολική αξία" />
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      {selected && (
        <div className="card card-pad branch-detail">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div className="hero">
              {selected.image_url ? <BranchThumb src={selected.image_url} name={selected.name} size={92} radius={11} /> : null}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: 20 }}>{selected.name}</h2>
                  {selected.is_primary && <span className="pill" style={{ color: 'var(--accent)', background: 'var(--accent-soft)', border: 'none' }}>Κύριο υποκατάστημα</span>}
                  <StatusBadge status={selected.status || 'active'} />
                </div>
                <div className="ph-contact" style={{ marginTop: 8 }}>
                  <span className="item"><Icon name="pin" /> {selected.address_line}, {selected.city}</span>
                </div>
                <div className="ph-contact" style={{ marginTop: 4 }}>
                  {selected.phone && <span className="item"><Icon name="phone" /> {selected.phone}</span>}
                  {selected.email && <span className="item"><Icon name="mail" /> {selected.email}</span>}
                  {selected.manager_name && <span className="item"><Icon name="users" /> {selected.manager_name}</span>}
                  <span className="item"><Icon name="clock" /> {hoursSummary(selected.opening_hours)}</span>
                </div>
              </div>
            </div>
            <div className="mini-stats">
              <div className="mini-stat"><div className="v">{formatNumber(selected.spaces.length)}</div><div className="l">Χώροι</div></div>
              <div className="mini-stat"><div className="v">{formatNumber(selected.visits_count)}</div><div className="l">Επισκέψεις</div></div>
              <div className="mini-stat"><div className="v">{formatCurrency(selected.total_value)}</div><div className="l">Συνολική αξία</div></div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
            {mapUrl(selected) && (
              <a className="btn btn-sm" href={mapUrl(selected)} target="_blank" rel="noreferrer">
                <Icon name="map" size={15} /> Προβολή στον χάρτη
              </a>
            )}
            {canWrite && <button className="btn btn-sm" onClick={() => setBranchForm({ branch: selected })}><Icon name="edit" size={15} /> Επεξεργασία</button>}
            {canWrite && <button className="btn btn-sm" onClick={deleteBranch}><Icon name="x" size={15} /> Διαγραφή</button>}
          </div>

          <div className="divider" />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="section-title" style={{ margin: 0 }}>Χώροι που χρησιμοποιεί ο πελάτης ({selected.spaces.length})</div>
            {canWrite && <button className="btn btn-sm btn-accent" onClick={() => setSpaceForm({ branchId: selected.id })}><Icon name="plus" size={14} /> Προσθήκη χώρου</button>}
          </div>
          {selected.spaces.length === 0 ? (
            <div className="muted" style={{ padding: '8px 0' }}>Χωρίς χώρους σε αυτό το υποκατάστημα.</div>
          ) : (
            <div className="space-cards">
              {selected.spaces.map((s) => (
                <div key={s.id} className="space-card" onClick={() => setDrawerSpace(s)}>
                  {s.image_url
                    ? <img className="img" src={s.image_url} alt={s.name} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    : null}
                  <div className="body">
                    <div className="nm">{s.name}</div>
                    <div className="st">{formatNumber(s.visits_count)} επισκέψεις · {formatNumber(s.bookings_count)} κρατήσεις</div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span className="pill">{s.space_type}</span>
                      <StatusBadge status={s.status || 'available'} />
                    </div>
                    {!!(s.amenities || []).length && (
                      <div className="amenity-mini">
                        {(s.amenities || []).slice(0, 4).map((k) => <span key={k} className="amenity-chip on tiny">{AMENITY_LABELS[k] || k}</span>)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="divider" />

          <div className="section-title">Ιστορικό επισκέψεων ανά χώρο</div>
          <table className="data-table">
            <thead><tr><th>Ημερομηνία</th><th>Χώρος</th><th>Τύπος</th><th>Διάρκεια</th><th>Κατάσταση</th></tr></thead>
            <tbody>
              {branchVisits.slice(0, 6).map((v) => (
                <tr key={v.id}>
                  <td className="mono">{formatDate(v.visited_at)}</td>
                  <td>{v.space_name}</td>
                  <td>{v.visit_type === 'booking' ? 'Κράτηση' : 'Επίσκεψη'}</td>
                  <td>{v.duration_minutes ? `${Math.round(v.duration_minutes / 60)} ώρες` : '—'}</td>
                  <td><span className={`badge badge-${v.status}`}>{BOOKING_STATUS[v.status] || v.status}</span></td>
                </tr>
              ))}
              {branchVisits.length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 20 }}>Χωρίς επισκέψεις</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {drawerSpace && (
        <SpaceDrawer customerId={customerId} space={drawerSpace} canWrite={canWrite}
          onClose={() => setDrawerSpace(null)}
          onEdit={(full) => { setDrawerSpace(null); setSpaceForm({ branchId: full.branch_id, space: full }); }}
          onDeleted={() => { setDrawerSpace(null); refresh(); }} />
      )}
      {branchForm && <BranchFormDrawer customerId={customerId} initial={branchForm.branch}
        onClose={() => setBranchForm(null)} onSaved={() => { setBranchForm(null); refresh(); }} />}
      {spaceForm && <SpaceFormDrawer branchId={spaceForm.branchId} initial={spaceForm.space}
        onClose={() => setSpaceForm(null)} onSaved={() => { setSpaceForm(null); refresh(); }} />}
    </div>
  );
}

function MiniOverview({ icon, v, l }) {
  return (
    <div className="stat">
      <div className="icn"><Icon name={icon} /></div>
      <div><div className="v" style={{ fontSize: 16 }}>{v}</div><div className="l">{l}</div></div>
    </div>
  );
}

function SpaceDrawer({ customerId, space, canWrite, onClose, onEdit, onDeleted }) {
  const { data, isLoading } = useQuery({
    queryKey: ['space-usage', customerId, space.id],
    queryFn: ({ signal }) => api.spaceUsage(customerId, space.id, { signal }),
  });
  const remove = async () => {
    if (!confirm(`Διαγραφή χώρου «${space.name}»;`)) return;
    await api.deleteSpace(space.id); onDeleted();
  };
  return (
    <Drawer title={space.name} subtitle={space.space_type} onClose={onClose}>
      {isLoading ? <Skeleton h={200} /> : (
        <>
          {canWrite && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button className="btn btn-sm" onClick={() => onEdit(data.space)}><Icon name="edit" size={14} /> Επεξεργασία</button>
              <button className="btn btn-sm" onClick={remove}><Icon name="x" size={14} /> Διαγραφή</button>
            </div>
          )}
          {data.space.image_url && (
            <img src={data.space.image_url} alt={space.name}
              style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 11, marginBottom: 16 }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          )}
          <div className="section-title">Πληροφορίες χώρου</div>
          <InfoRow k="Υποκατάστημα" v={`${data.space.branch_name}, ${data.space.city}`} />
          <InfoRow k="Τύπος" v={data.space.space_type} />
          <InfoRow k="Κατάσταση" v={<StatusBadge status={data.space.status || 'available'} />} />
          <InfoRow k="Χωρητικότητα" v={data.space.capacity ? `${data.space.capacity} άτομα` : '—'} />
          <InfoRow k="Όροφος" v={data.space.floor} />
          <InfoRow k="Τιμή/ώρα" v={data.space.hourly_price ? formatCurrency(data.space.hourly_price) : '—'} />
          <InfoRow k="Τιμή/ημέρα" v={data.space.daily_price ? formatCurrency(data.space.daily_price) : '—'} />
          <InfoRow k="Σαββατοκύριακο/ώρα" v={data.space.weekend_hourly_price ? formatCurrency(data.space.weekend_hourly_price) : '—'} />
          <InfoRow k="Ελάχ. διάρκεια" v={data.space.min_duration_minutes ? `${data.space.min_duration_minutes} λεπτά` : '—'} />
          <InfoRow k="Βήμα / buffer" v={`${data.space.slot_step_minutes || 0}′ / ${data.space.buffer_minutes || 0}′`} />
          {(data.space.amenities || []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0 4px' }}>
              {data.space.amenities.map((k) => <span key={k} className="amenity-chip on">{AMENITY_LABELS[k] || k}</span>)}
            </div>
          )}

          <div className="section-title" style={{ marginTop: 18 }}>Χρήση από τον πελάτη</div>
          <div className="stat-grid">
            <MiniOverview icon="pin" v={formatNumber(data.usage.visits_count)} l="Επισκέψεις" />
            <MiniOverview icon="calendar" v={formatNumber(data.usage.bookings_count)} l="Κρατήσεις" />
          </div>

          <div className="section-title" style={{ marginTop: 18 }}>Ιστορικό κρατήσεων</div>
          {data.bookings.length === 0 ? <span className="muted">Χωρίς κρατήσεις</span> : data.bookings.map((b) => (
            <div key={b.id} className="search-row" style={{ padding: '8px 0' }}>
              <div className="avatar sq" style={{ width: 32, height: 32, background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="calendar" size={15} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{formatDate(b.starts_at)}</div>
                <div className="meta" style={{ fontSize: 12 }}>{formatCurrency(b.amount)}</div>
              </div>
              <span className={`badge badge-${b.status}`}>{BOOKING_STATUS[b.status] || b.status}</span>
            </div>
          ))}
        </>
      )}
    </Drawer>
  );
}

function InfoRow({ k, v }) {
  return <div className="info-row"><div className="k">{k}</div><div className="v">{v || '—'}</div></div>;
}
