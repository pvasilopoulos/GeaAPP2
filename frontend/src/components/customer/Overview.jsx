import { useQuery } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../Icon.jsx';
import { Avatar, StatusBadge, Skeleton, EmptyState } from '../ui.jsx';
import TagsEditor from './TagsEditor.jsx';
import { useAuth } from '../../store/auth.js';
import { PERMS } from '../../lib/perms.js';
import { BranchThumb } from '../ui.jsx';
import {
  formatCurrency, formatNumber, formatDate, formatDateTime, formatTime,
  relativeDate, STATUS_LABELS, TYPE_LABELS,
} from '../../lib/format.js';

const ACTIVITY_ICONS = {
  booking_created: { icon: 'calendar', bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  booking_completed: { icon: 'check', bg: 'var(--green-soft)', fg: 'var(--green)' },
  payment_received: { icon: 'wallet', bg: 'var(--green-soft)', fg: 'var(--green)' },
  message_sent: { icon: 'message', bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  note_added: { icon: 'note', bg: 'var(--amber-soft)', fg: 'var(--amber)' },
  visit: { icon: 'pin', bg: '#eaeafe', fg: '#6d28d9' },
  document_uploaded: { icon: 'file', bg: 'var(--surface-2)', fg: 'var(--text-2)' },
  customer_created: { icon: 'users', bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  customer_updated: { icon: 'edit', bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  contact_added: { icon: 'users', bg: 'var(--green-soft)', fg: 'var(--green)' },
  contact_removed: { icon: 'x', bg: 'var(--red-soft)', fg: 'var(--red)' },
  branch_created: { icon: 'building', bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  branch_updated: { icon: 'building', bg: 'var(--amber-soft)', fg: 'var(--amber)' },
  branch_deleted: { icon: 'building', bg: 'var(--red-soft)', fg: 'var(--red)' },
  space_created: { icon: 'grid', bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  space_updated: { icon: 'grid', bg: 'var(--amber-soft)', fg: 'var(--amber)' },
  space_deleted: { icon: 'grid', bg: 'var(--red-soft)', fg: 'var(--red)' },
};

function fieldValue(f) {
  if (f.field_type === 'boolean') return f.boolean_value == null ? null : (f.boolean_value ? 'Ναι' : 'Όχι');
  if (f.field_type === 'date') return f.date_value ? formatDate(f.date_value) : null;
  if (f.field_type === 'number') return f.number_value != null ? formatNumber(f.number_value) : null;
  return f.text_value || null;
}

function visible(f, customer) {
  const cond = f.settings?.showIf;
  if (!cond) return true;
  if (cond.field === 'customer_type') return customer.customer_type === cond.equals;
  return true;
}

export default function Overview({ customerId, data, onOpenTab, onEditCustomer }) {
  const c = data.customer;
  const canWrite = useAuth((s) => s.hasPerm(PERMS.CUSTOMERS_WRITE));

  const branchesQ = useQuery({ queryKey: ['c-branches', customerId], queryFn: ({ signal }) => api.customerBranches(customerId, { signal }) });
  const actsQ = useQuery({ queryKey: ['c-acts', customerId, 'ov'], queryFn: ({ signal }) => api.customerActivities(customerId, { limit: 6 }, { signal }) });
  const fieldsQ = useQuery({ queryKey: ['c-fields', customerId], queryFn: ({ signal }) => api.customerCustomFields(customerId, { signal }) });
  const docsQ = useQuery({ queryKey: ['c-docs', customerId, 'ov'], queryFn: ({ signal }) => api.customerDocuments(customerId, { limit: 3 }, { signal }) });

  const customFields = (fieldsQ.data?.fields || [])
    .filter((f) => visible(f, c) && fieldValue(f) != null);

  const stats = [
    { icon: 'calendar', v: formatNumber(c.bookings_count), l: 'Συνολικές κρατήσεις' },
    { icon: 'pin', v: formatNumber(c.visits_count), l: 'Επισκέψεις' },
    { icon: 'building', v: formatNumber(c.branches_count), l: 'Υποκαταστήματα' },
    { icon: 'wallet', v: formatCurrency(c.total_value), l: 'Συνολική αξία' },
  ];

  return (
    <div className="grid-3">
      {/* LEFT */}
      <div className="stack">
        <div className="card">
          <div className="card-head"><h3><Icon name="users" /> Βασικά στοιχεία</h3>
            {canWrite && <a className="link" onClick={onEditCustomer}>Επεξεργασία</a>}
          </div>
          <div className="card-pad" style={{ paddingTop: 4 }}>
            <InfoRow k="Ονοματεπώνυμο" v={c.full_name} />
            <InfoRow k="Τύπος πελάτη" v={TYPE_LABELS[c.customer_type]} />
            {c.company && <InfoRow k="Επωνυμία" v={c.company} />}
            {c.tax_id && <InfoRow k="ΑΦΜ" v={c.tax_id} />}
            <InfoRow k="Τηλέφωνο" v={c.phone} />
            <InfoRow k="Email" v={c.email} />
            <InfoRow k="Διεύθυνση" v={[c.address_line, c.city, c.postal_code, c.country].filter(Boolean).join(', ')} />
            <InfoRow k="Ημ. γέννησης" v={formatDate(c.date_of_birth)} />
            <InfoRow k="Υπεύθυνος" v={c.assigned_employee} />
            {data.primaryContact && (
              <InfoRow k="Κύρια επαφή" v={`${data.primaryContact.first_name} ${data.primaryContact.last_name}${data.primaryContact.role ? ` · ${data.primaryContact.role}` : ''}`} />
            )}
            {customFields.length > 0 && (
              <>
                <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-3)', margin: '14px 0 6px' }}>Πρόσθετα πεδία</div>
                {customFields.map((f) => <InfoRow key={f.id} k={f.name} v={fieldValue(f)} />)}
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Icon name="tag" /> Tags</h3></div>
          <TagsEditor customerId={customerId} tags={data.tags} canWrite={canWrite} />
        </div>

        <div className="card">
          <div className="card-head"><h3><Icon name="chart" /> Στατιστικά πελάτη</h3></div>
          <div className="card-pad">
            <div className="stat-grid">
              {stats.map((s) => (
                <div className="stat" key={s.l}>
                  <div className="icn"><Icon name={s.icon} /></div>
                  <div><div className="v">{s.v}</div><div className="l">{s.l}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* MIDDLE — Branches & Spaces summary */}
      <div className="card">
        <div className="card-head"><h3><Icon name="pin" /> Υποκαταστήματα & Χώροι</h3><a className="link" onClick={() => onOpenTab('branches')}>Προβολή όλων</a></div>
        <div className="card-pad" style={{ paddingTop: 8 }}>
          {branchesQ.isLoading ? <Skeleton h={80} /> : branchesQ.data.branches.length === 0 ? (
            <EmptyState icon="building" title="Χωρίς υποκαταστήματα" />
          ) : branchesQ.data.branches.slice(0, 2).map((b) => (
            <div key={b.id} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 11, alignItems: 'center', marginBottom: 8 }}>
                <BranchThumb src={b.image_url} name={b.name} size={44} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                    {b.name} {b.is_primary && <span className="pill" style={{ color: 'var(--accent)', background: 'var(--accent-soft)', border: 'none' }}>Κύριο</span>}
                  </div>
                  <div className="meta" style={{ fontSize: 12, color: 'var(--text-3)' }}>{b.address_line}, {b.city}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>Χώροι που χρησιμοποιεί ({b.spaces.length})</div>
              {b.spaces.slice(0, 3).map((s) => (
                <div key={s.id} className="search-row" style={{ padding: '7px 8px' }}>
                  <BranchThumb src={s.image_url} name={s.name} size={34} radius={7} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                    <div className="meta" style={{ fontSize: 11.5 }}>{formatNumber(s.bookings_count)} κρατήσεις</div>
                  </div>
                  <Icon name="chevronRight" size={15} style={{ color: 'var(--text-3)' }} />
                </div>
              ))}
            </div>
          ))}
          <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={() => onOpenTab('branches')}>
            <Icon name="plus" size={15} /> Διαχείριση υποκαταστημάτων & χώρων
          </button>
        </div>
      </div>

      {/* RIGHT */}
      <div className="stack">
        <div className="card">
          <div className="card-head"><h3><Icon name="activity" /> Κατάσταση</h3><Icon name="more" /></div>
          <div className="card-pad">
            <StatusBadge status={c.status} />
            <div className="meta" style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
              Τελευταία δραστηριότητα<br />
              <b style={{ color: 'var(--text-2)' }}>{c.last_visit_at ? formatDateTime(c.last_visit_at) : '—'}</b>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Icon name="calendar" /> Επόμενη κράτηση</h3></div>
          <div className="card-pad">
            {data.nextBooking ? (
              <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
                <div className="avatar sq" style={{ width: 42, height: 42, background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="calendar" size={18} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{data.nextBooking.space_name}</div>
                  <div className="meta" style={{ fontSize: 12, color: 'var(--text-3)' }}>{data.nextBooking.branch_name}</div>
                  <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-2)' }}>
                    <Icon name="clock" size={12} /> {formatDate(data.nextBooking.starts_at)} · {formatTime(data.nextBooking.starts_at)} - {formatTime(data.nextBooking.ends_at)}
                  </div>
                </div>
              </div>
            ) : <span className="muted">Καμία προγραμματισμένη κράτηση</span>}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Icon name="activity" /> Πρόσφατη δραστηριότητα</h3><a className="link" onClick={() => onOpenTab('activity')}>Προβολή όλων</a></div>
          <div className="card-pad" style={{ paddingTop: 6 }}>
            {actsQ.isLoading ? <Skeleton h={60} /> : (
              <div className="timeline">
                {actsQ.data.results.map((a, i) => {
                  const cfg = ACTIVITY_ICONS[a.type] || ACTIVITY_ICONS.visit;
                  return (
                    <div className="tl-item" key={i}>
                      <div className="icn" style={{ background: cfg.bg, color: cfg.fg }}><Icon name={cfg.icon} size={14} /></div>
                      <div style={{ flex: 1 }}>
                        <div className="desc" style={{ fontSize: 13 }}>{a.description}</div>
                        <div className="time">{formatDateTime(a.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Icon name="file" /> Σχετικά αρχεία</h3><a className="link" onClick={() => onOpenTab('documents')}>Προβολή όλων</a></div>
          <div className="card-pad" style={{ paddingTop: 6 }}>
            {docsQ.isLoading ? <Skeleton h={40} /> : docsQ.data.results.length === 0 ? (
              <span className="muted">Χωρίς έγγραφα</span>
            ) : docsQ.data.results.map((d) => (
              <div key={d.id} className="search-row" style={{ padding: '7px 8px' }}>
                <div className="avatar sq" style={{ width: 32, height: 32, background: 'var(--red-soft)', color: 'var(--red)' }}><Icon name="file" size={15} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
                  <div className="meta" style={{ fontSize: 11.5 }}>{Math.round((d.size_bytes || 0) / 1024)} KB · {formatDate(d.created_at)}</div>
                </div>
                <Icon name="download" size={15} style={{ color: 'var(--text-3)' }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ k, v }) {
  return (
    <div className="info-row">
      <div className="k">{k}</div>
      <div className="v">{v || '—'}</div>
    </div>
  );
}
