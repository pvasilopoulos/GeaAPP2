import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { Drawer, EmptyState, Skeleton } from '../components/ui.jsx';
import { useAuth } from '../store/auth.js';
import { PERMS } from '../lib/perms.js';
import { BOOKING_STATUS } from '../lib/format.js';
import {
  rangeForView, monthMatrix, weekDays, eventsForDay, computeDragMove, computeResize,
  slotDateTime, HOUR_RANGE,
} from '../lib/calendarEvents.js';

const WEEKDAY_LABELS = ['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ'];
const HOUR_HEIGHT = 52; // px per hour in week/day grids
const SNOOZE_OPTIONS = [{ label: '1 ώρα', minutes: 60 }, { label: '4 ώρες', minutes: 240 }, { label: 'Αύριο', minutes: 1440 }];

function toLocalInput(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addHours(date, h) {
  return new Date(date.getTime() + h * 3600000);
}

// Invalidates every cache the rest of the app relies on for the same
// underlying data (dashboard KPIs/follow-ups, customer profile follow-ups
// and header, this calendar) so nothing goes stale after a calendar action.
function invalidateShared(qc, customerId) {
  qc.invalidateQueries({ queryKey: ['calendar'] });
  qc.invalidateQueries({ queryKey: ['stats'] });
  qc.invalidateQueries({ queryKey: ['c-follow-ups'] });
  if (customerId) qc.invalidateQueries({ queryKey: ['customer', customerId] });
}

function CustomerPicker({ value, onChange }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const results = useQuery({
    queryKey: ['calendar-customer-search', q],
    queryFn: ({ signal }) => api.searchCustomers({ q, limit: 8 }, { signal }),
    enabled: open && q.trim().length > 1,
  });
  return (
    <div className="field-group" style={{ position: 'relative' }}>
      <label>Πελάτης *</label>
      {value ? (
        <div className="search-row" style={{ padding: '6px 8px', border: '1px solid var(--border-strong)', borderRadius: 9 }}>
          <div style={{ flex: 1, fontWeight: 600 }}>{value.full_name || value.company || value.name}</div>
          <button type="button" className="btn btn-icon btn-ghost" onClick={() => onChange(null)}><Icon name="x" size={14} /></button>
        </div>
      ) : (
        <input
          className="input"
          placeholder="Αναζήτηση πελάτη…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      )}
      {open && !value && q.trim().length > 1 && (
        <div className="search-results" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5 }}>
          {results.isLoading && <div style={{ padding: 12 }}><Skeleton h={16} /></div>}
          {!results.isLoading && (results.data?.results || []).length === 0 && (
            <div className="empty" style={{ padding: 12 }}>Δεν βρέθηκαν πελάτες</div>
          )}
          {(results.data?.results || []).map((c) => (
            <div key={c.id} className="search-row" onClick={() => { onChange(c); setOpen(false); setQ(''); }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{c.full_name || c.company || c.name}</div>
                {c.code && <div className="meta">{c.code}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickCreateDrawer({ slot, canBookings, canFollowUps, employees, onClose, onCreated }) {
  const [type, setType] = useState(canFollowUps ? 'follow_up' : 'booking');
  const [customer, setCustomer] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState(toLocalInput(slot.date));
  const [startsAt, setStartsAt] = useState(toLocalInput(slot.date));
  const [endsAt, setEndsAt] = useState(toLocalInput(addHours(slot.date, 1)));
  const [branchId, setBranchId] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const branchesQ = useQuery({
    queryKey: ['calendar-branches', customer?.id],
    queryFn: ({ signal }) => api.branches({ customerId: customer.id, limit: 100 }, { signal }),
    enabled: type === 'booking' && !!customer,
  });
  const spacesQ = useQuery({
    queryKey: ['calendar-spaces', branchId],
    queryFn: ({ signal }) => api.spaces({ branchId, limit: 100 }, { signal }),
    enabled: type === 'booking' && !!branchId,
  });

  const submit = async (e) => {
    e.preventDefault();
    if (!customer) { setError('Επιλέξτε πελάτη'); return; }
    setBusy(true); setError('');
    try {
      if (type === 'follow_up') {
        if (!title.trim()) { setError('Απαιτείται τίτλος'); setBusy(false); return; }
        await api.createFollowUp({
          customerId: customer.id, title, description: description || undefined,
          dueAt: new Date(dueAt).toISOString(), assignedEmployeeId: employeeId || undefined,
        });
      } else {
        await api.createBooking({
          customerId: customer.id, branchId: branchId || undefined, spaceId: spaceId || undefined,
          employeeId: employeeId || undefined, startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(), amount: amount || undefined,
        });
      }
      onCreated();
    } catch (ex) { setError(ex.message); } finally { setBusy(false); }
  };

  return (
    <Drawer title="Νέα καταχώρηση" subtitle={slot.date.toLocaleDateString('el-GR')} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {canFollowUps && canBookings && (
          <div className="calendar-type-toggle">
            <button type="button" className={type === 'follow_up' ? 'active' : ''} onClick={() => setType('follow_up')}>
              <Icon name="bell" size={14} /> Follow-up
            </button>
            <button type="button" className={type === 'booking' ? 'active' : ''} onClick={() => setType('booking')}>
              <Icon name="calendar" size={14} /> Κράτηση
            </button>
          </div>
        )}
        <CustomerPicker value={customer} onChange={setCustomer} />
        {type === 'follow_up' ? (
          <>
            <div className="field-group">
              <label>Τίτλος *</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="π.χ. Τηλεφώνημα follow-up" />
            </div>
            <div className="field-group">
              <label>Περιγραφή</label>
              <textarea className="input" rows={2} style={{ height: 'auto', padding: '8px 10px' }} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="field-group">
              <label>Ημερομηνία/ώρα *</label>
              <input className="input" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
          </>
        ) : (
          <>
            <div className="field-group">
              <label>Υποκατάστημα</label>
              <select className="input" value={branchId} onChange={(e) => { setBranchId(e.target.value); setSpaceId(''); }} disabled={!customer}>
                <option value="">—</option>
                {(branchesQ.data?.results || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label>Χώρος</label>
              <select className="input" value={spaceId} onChange={(e) => setSpaceId(e.target.value)} disabled={!branchId}>
                <option value="">—</option>
                {(spacesQ.data?.results || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="field-group" style={{ flex: 1 }}>
                <label>Έναρξη *</label>
                <input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div className="field-group" style={{ flex: 1 }}>
                <label>Λήξη *</label>
                <input className="input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>
            <div className="field-group">
              <label>Ποσό (€)</label>
              <input className="input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </>
        )}
        <div className="field-group">
          <label>Υπεύθυνος</label>
          <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">—</option>
            {(employees || []).map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
          </select>
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : <Icon name="plus" size={15} />} Δημιουργία
        </button>
      </form>
    </Drawer>
  );
}

function FollowUpDetail({ event, onClose, onOpenCustomer, canWrite }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(event.title || '');
  const [description, setDescription] = useState(event.description || '');
  const [dueAt, setDueAt] = useState(toLocalInput(event.start));
  const [busy, setBusy] = useState('');

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); invalidateShared(qc, event.customer_id); onClose(); }
    finally { setBusy(''); }
  };

  return (
    <Drawer title={event.title} subtitle="Follow-up" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className={`badge ${event.computed_status === 'overdue' ? 'badge-inactive' : 'badge-prospect'}`} style={{ alignSelf: 'flex-start' }}>
          {event.computed_status === 'overdue' ? 'Εκπρόθεσμο' : event.computed_status || event.status}
        </div>
        <div className="field-group">
          <label>Πελάτης</label>
          <button type="button" className="btn btn-sm" onClick={() => onOpenCustomer({ id: event.customer_id, full_name: event.customer_name })}>
            <Icon name="users" size={14} /> {event.customer_name}
          </button>
        </div>
        <div className="field-group"><label>Τίτλος</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canWrite} /></div>
        <div className="field-group"><label>Περιγραφή</label><textarea className="input" rows={2} style={{ height: 'auto', padding: '8px 10px' }} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canWrite} /></div>
        <div className="field-group"><label>Ημερομηνία/ώρα</label><input className="input" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} disabled={!canWrite} /></div>
        {canWrite && (
          <>
            <button className="btn btn-primary" disabled={!!busy} onClick={() => run('save', () => api.updateFollowUp(event.raw_id, { title, description, dueAt: new Date(dueAt).toISOString() }))}>
              {busy === 'save' ? <span className="spinner" /> : <Icon name="check" size={15} />} Αποθήκευση
            </button>
            {event.status === 'open' && (
              <>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {SNOOZE_OPTIONS.map((s) => (
                    <button key={s.minutes} type="button" className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => run('snooze', () => api.snoozeFollowUp(event.raw_id, s.minutes))}>
                      <Icon name="clock" size={13} /> {s.label}
                    </button>
                  ))}
                </div>
                <button className="btn btn-sm" disabled={!!busy} onClick={() => run('complete', () => api.updateFollowUp(event.raw_id, { status: 'completed' }))}>
                  <Icon name="check" size={14} /> Ολοκλήρωση
                </button>
              </>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}

function BookingDetail({ event, onClose, onOpenCustomer, canWrite }) {
  const qc = useQueryClient();
  const [startsAt, setStartsAt] = useState(toLocalInput(event.start));
  const [endsAt, setEndsAt] = useState(toLocalInput(event.end));
  const [status, setStatus] = useState(event.status);
  const [amount, setAmount] = useState(event.amount ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true); setError('');
    try {
      await api.updateBooking(event.raw_id, {
        startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), status, amount,
      });
      invalidateShared(qc, event.customer_id);
      onClose();
    } catch (ex) { setError(ex.message); } finally { setBusy(false); }
  };

  return (
    <Drawer title={event.title} subtitle="Κράτηση" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="field-group">
          <label>Πελάτης</label>
          <button type="button" className="btn btn-sm" onClick={() => onOpenCustomer({ id: event.customer_id, full_name: event.customer_name })}>
            <Icon name="users" size={14} /> {event.customer_name}
          </button>
        </div>
        {(event.branch_name || event.space_name) && (
          <div className="meta">{event.branch_name}{event.branch_name && event.space_name ? ' · ' : ''}{event.space_name}</div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="field-group" style={{ flex: 1 }}><label>Έναρξη</label><input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} disabled={!canWrite} /></div>
          <div className="field-group" style={{ flex: 1 }}><label>Λήξη</label><input className="input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} disabled={!canWrite} /></div>
        </div>
        <div className="field-group">
          <label>Κατάσταση</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} disabled={!canWrite}>
            {Object.keys(BOOKING_STATUS).map((s) => <option key={s} value={s}>{BOOKING_STATUS[s]}</option>)}
          </select>
        </div>
        <div className="field-group"><label>Ποσό (€)</label><input className="input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!canWrite} /></div>
        {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        {canWrite && (
          <button className="btn btn-primary" disabled={busy} onClick={save}>
            {busy ? <span className="spinner" /> : <Icon name="check" size={15} />} Αποθήκευση
          </button>
        )}
      </div>
    </Drawer>
  );
}

function EventChip({ event, onClick, draggable, onDragStart }) {
  const cls = event.type === 'booking' ? 'type-booking' : (event.overdue ? 'type-follow_up overdue' : 'type-follow_up');
  return (
    <div
      className={`calendar-event-chip ${cls}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={(e) => { e.stopPropagation(); onClick(event); }}
      title={event.title}
    >
      <Icon name={event.type === 'booking' ? 'calendar' : 'bell'} size={11} />
      <span>{event.title}</span>
    </div>
  );
}

function TimeGrid({ days, events, onSlotClick, onEventClick, onMove, onResize, canEditBooking, canEditFollowUp }) {
  const hours = [];
  for (let h = HOUR_RANGE.start; h < HOUR_RANGE.end; h++) hours.push(h);
  const gridHeight = hours.length * HOUR_HEIGHT;
  const [resizing, setResizing] = useState(null);

  const yToDate = (day, y) => slotDateTime(day, HOUR_RANGE.start * 60 + (y / HOUR_HEIGHT) * 60, 15);

  const onDrop = (day, e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const dragged = events.find((ev) => ev.id === id);
    if (!dragged) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = Math.max(0, e.clientY - rect.top);
    const newStart = yToDate(day, y);
    const canEdit = dragged.type === 'booking' ? canEditBooking : canEditFollowUp;
    if (!canEdit) return;
    onMove(dragged, newStart);
  };

  return (
    <div className="calendar-week-grid">
      <div className="calendar-week-gutter">
        <div className="calendar-week-gutter-head" />
        {hours.map((h) => <div key={h} className="calendar-hour-label" style={{ height: HOUR_HEIGHT }}>{String(h).padStart(2, '0')}:00</div>)}
      </div>
      <div className="calendar-week-days">
        <div className="calendar-week-head">
          {days.map((day) => (
            <div key={day.toISOString()} className="calendar-weekday-head">
              <span>{WEEKDAY_LABELS[(day.getDay() + 6) % 7]}</span>
              <b>{day.getDate()}</b>
            </div>
          ))}
        </div>
        <div className="calendar-week-body" style={{ height: gridHeight }}>
          {days.map((day) => {
            const dayEvents = eventsForDay(events, day);
            return (
              <div
                key={day.toISOString()}
                className="calendar-day-col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(day, e)}
                onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); onSlotClick(yToDate(day, e.clientY - rect.top)); }}
              >
                {hours.map((h) => <div key={h} className="calendar-hour-row" style={{ height: HOUR_HEIGHT }} />)}
                {dayEvents.map((ev) => {
                  const start = new Date(ev.start);
                  const end = new Date(ev.end || ev.start);
                  const dayStart = new Date(day); dayStart.setHours(HOUR_RANGE.start, 0, 0, 0);
                  const topMin = Math.max(0, (start - dayStart) / 60000);
                  const durMin = Math.max((end - start) / 60000, 20);
                  const top = (topMin / 60) * HOUR_HEIGHT;
                  const height = Math.max((durMin / 60) * HOUR_HEIGHT, 20);
                  const canEdit = ev.type === 'booking' ? canEditBooking : canEditFollowUp;
                  return (
                    <div
                      key={ev.id}
                      className={`calendar-event-block ${ev.type === 'booking' ? 'type-booking' : (ev.overdue ? 'type-follow_up overdue' : 'type-follow_up')}`}
                      style={{ top, height }}
                      draggable={canEdit}
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', ev.id); }}
                      onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                      title={ev.title}
                    >
                      <span>{ev.title}</span>
                      {ev.type === 'booking' && canEditBooking && (
                        <div
                          className="calendar-resize-handle"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const startY = e.clientY;
                            const startHeight = height;
                            const onMouseMove = (moveEv) => {
                              const delta = moveEv.clientY - startY;
                              setResizing({ id: ev.id, height: Math.max(startHeight + delta, 20) });
                            };
                            const onMouseUp = (upEv) => {
                              document.removeEventListener('mousemove', onMouseMove);
                              document.removeEventListener('mouseup', onMouseUp);
                              const delta = upEv.clientY - startY;
                              const newHeight = Math.max(startHeight + delta, 20);
                              const newEnd = new Date(start.getTime() + (newHeight / HOUR_HEIGHT) * 3600000);
                              setResizing(null);
                              onResize(ev, newEnd);
                            };
                            document.addEventListener('mousemove', onMouseMove);
                            document.addEventListener('mouseup', onMouseUp);
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Calendar({ onOpenCustomer }) {
  const qc = useQueryClient();
  const hasPerm = useAuth((s) => s.hasPerm);
  const canBookings = hasPerm(PERMS.BOOKINGS_VIEW);
  const canBookingsCreate = hasPerm(PERMS.BOOKINGS_CREATE);
  const canBookingsEdit = hasPerm(PERMS.BOOKINGS_EDIT);
  const canFollowUps = hasPerm(PERMS.CUSTOMERS_READ);
  const canFollowUpsWrite = hasPerm(PERMS.CUSTOMERS_WRITE);

  const [view, setView] = useState('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [employeeId, setEmployeeId] = useState('');
  const [selected, setSelected] = useState(null);
  const [quickSlot, setQuickSlot] = useState(null);

  const metaQ = useQuery({ queryKey: ['meta'], queryFn: ({ signal }) => api.meta({ signal }) });
  const range = useMemo(() => rangeForView(view, anchor), [view, anchor]);
  const eventsQ = useQuery({
    queryKey: ['calendar', view, range.from.toISOString(), range.to.toISOString(), employeeId],
    queryFn: ({ signal }) => api.calendarEvents({ from: range.from.toISOString(), to: range.to.toISOString(), employeeId: employeeId || undefined }, { signal }),
  });
  const events = eventsQ.data?.results || [];

  const shift = (dir) => {
    const d = new Date(anchor);
    if (view === 'day') d.setDate(d.getDate() + dir);
    else if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setAnchor(d);
  };

  const title = view === 'day'
    ? anchor.toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' })
    : view === 'week'
      ? `${weekDays(anchor)[0].toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })} – ${weekDays(anchor)[6].toLocaleDateString('el-GR', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : anchor.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' });

  const handleMove = async (event, newStart) => {
    try {
      if (event.type === 'booking') {
        const { start, end } = computeDragMove(event, newStart);
        await api.updateBooking(event.raw_id, { startsAt: start, endsAt: end });
      } else {
        const { start } = computeDragMove(event, newStart);
        await api.updateFollowUp(event.raw_id, { dueAt: start });
      }
      invalidateShared(qc, event.customer_id);
    } catch { /* surfaced via failed refetch; drag UX stays best-effort */ }
  };

  const handleResize = async (event, newEnd) => {
    try {
      const { end } = computeResize(event, newEnd);
      await api.updateBooking(event.raw_id, { endsAt: end });
      invalidateShared(qc, event.customer_id);
    } catch { /* best-effort, calendar refetches regardless */ }
  };

  if (!canBookings && !canFollowUps) {
    return <EmptyState icon="calendar" title="Δεν έχετε πρόσβαση στο ημερολόγιο" />;
  }

  return (
    <div className="calendar-page">
      <div className="page-head">
        <div>
          <h1>Ημερολόγιο</h1>
          <div className="sub">Κρατήσεις &amp; follow-ups σε ενιαία προβολή</div>
        </div>
        {(canBookingsCreate || canFollowUpsWrite) && (
          <button className="btn btn-accent" onClick={() => setQuickSlot({ date: new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 9, 0) })}>
            <Icon name="plus" size={16} /> Νέα καταχώρηση
          </button>
        )}
      </div>

      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <button className="btn btn-icon btn-ghost" onClick={() => shift(-1)} aria-label="Προηγούμενο"><Icon name="chevronRight" size={16} style={{ transform: 'rotate(180deg)' }} /></button>
          <button className="btn btn-sm btn-ghost" onClick={() => setAnchor(new Date())}>Σήμερα</button>
          <button className="btn btn-icon btn-ghost" onClick={() => shift(1)} aria-label="Επόμενο"><Icon name="chevronRight" size={16} /></button>
          <b style={{ marginLeft: 6 }}>{title}</b>
        </div>
        <div className="calendar-toolbar-right">
          {canBookings && (
            <select className="input calendar-employee-select" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Όλοι οι υπεύθυνοι</option>
              {(metaQ.data?.employees || []).map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
            </select>
          )}
          <div className="calendar-view-switch">
            {[['month', 'Μήνας'], ['week', 'Εβδομάδα'], ['day', 'Ημέρα']].map(([v, label]) => (
              <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="calendar-legend">
        {canBookings && <span><i className="dot type-booking" /> Κρατήσεις</span>}
        {canFollowUps && <span><i className="dot type-follow_up" /> Follow-ups</span>}
        {canFollowUps && <span><i className="dot type-follow_up overdue" /> Εκπρόθεσμα</span>}
      </div>

      {eventsQ.isLoading ? (
        <div className="card card-pad"><Skeleton h={300} /></div>
      ) : view === 'month' ? (
        <div className="calendar-month">
          <div className="calendar-month-weekdays">
            {WEEKDAY_LABELS.map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="calendar-month-grid">
            {monthMatrix(anchor).flat().map((cell) => {
              const dayEvents = eventsForDay(events, cell.date);
              const isToday = new Date().toDateString() === cell.date.toDateString();
              return (
                <div
                  key={cell.date.toISOString()}
                  className={`calendar-month-cell${cell.inMonth ? '' : ' out'}${isToday ? ' today' : ''}`}
                  onClick={() => setQuickSlot({ date: new Date(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate(), 9, 0) })}
                >
                  <div className="calendar-month-daynum">{cell.date.getDate()}</div>
                  <div className="calendar-month-events">
                    {dayEvents.map((ev) => <EventChip key={ev.id} event={ev} onClick={setSelected} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <TimeGrid
          days={view === 'day' ? [anchor] : weekDays(anchor)}
          events={events}
          onSlotClick={(date) => setQuickSlot({ date })}
          onEventClick={setSelected}
          onMove={handleMove}
          onResize={handleResize}
          canEditBooking={canBookingsEdit}
          canEditFollowUp={canFollowUpsWrite}
        />
      )}

      {quickSlot && (
        <QuickCreateDrawer
          slot={quickSlot}
          canBookings={canBookingsCreate}
          canFollowUps={canFollowUpsWrite}
          employees={metaQ.data?.employees}
          onClose={() => setQuickSlot(null)}
          onCreated={() => { invalidateShared(qc); setQuickSlot(null); }}
        />
      )}

      {selected && selected.type === 'follow_up' && (
        <FollowUpDetail event={selected} onClose={() => setSelected(null)} onOpenCustomer={onOpenCustomer} canWrite={canFollowUpsWrite} />
      )}
      {selected && selected.type === 'booking' && (
        <BookingDetail event={selected} onClose={() => setSelected(null)} onOpenCustomer={onOpenCustomer} canWrite={canBookingsEdit} />
      )}
    </div>
  );
}
