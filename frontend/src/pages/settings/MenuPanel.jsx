import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon, { ICON_NAMES } from '../../components/Icon.jsx';
import { Skeleton } from '../../components/ui.jsx';
import { useAuth } from '../../store/auth.js';
import { PERMS } from '../../lib/perms.js';
import {
  NAV_GROUPS, NAV_ITEM_IDS, DEFAULT_SIDEBAR_ORDER, DEFAULT_MOBILE_FOOTER_ITEMS,
  MOBILE_FOOTER_MIN_MAX, MOBILE_FOOTER_MAX_MAX, MOBILE_FOOTER_DEFAULT_MAX,
} from '../../lib/navCatalog.js';
import {
  buildResolvedCatalog, resolveSidebarGroups, builtinGroupIdFor, FALLBACK_GROUP_ID, FALLBACK_GROUP_LABEL,
} from '../../lib/menu.js';

const rowStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 9, border: '1px solid var(--border)', marginBottom: 6, background: '#fff', flexWrap: 'wrap' };
const iconBtn = { width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid var(--border-strong)', background: '#fff' };
const BUILTIN_GROUP_IDS = NAV_GROUPS.map((g) => g.id);

function fullOrder(order, allIds) {
  const known = (order || []).filter((id) => allIds.includes(id));
  const missing = allIds.filter((id) => !known.includes(id));
  return [...known, ...missing];
}

function move(list, index, dir) {
  const next = [...list];
  const j = index + dir;
  if (j < 0 || j >= next.length) return list;
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

function slugify(label) {
  return String(label || '')
    .trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'item';
}

function isValidHttpUrl(value) {
  try {
    const u = new URL(String(value || '').trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

// ---- Small shared controls --------------------------------------------------

// Icon picker constrained to the app's supported icon set (Icon.jsx) — never
// allows an arbitrary icon string.
function IconPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" style={iconBtn} onClick={() => setOpen((o) => !o)} title="Αλλαγή εικονιδίου">
        <Icon name={value} size={16} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setOpen(false)} />
          <div className="icon-picker-pop">
            {ICON_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                className={`icon-picker-opt${name === value ? ' active' : ''}`}
                title={name}
                onClick={() => { onChange(name); setOpen(false); }}
              >
                <Icon name={name} size={15} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Role restriction checklist. `null`/empty selection means "visible to all
// roles" (still subject to permissions, enforced separately and always).
function RolesPicker({ roles, onChange, availableRoles }) {
  const selected = roles || [];
  if (!availableRoles?.length) return null;
  return (
    <div className="roles-picker">
      <label className="roles-picker-chip">
        <input type="checkbox" checked={selected.length === 0} onChange={() => onChange(null)} />
        Όλοι οι ρόλοι
      </label>
      {availableRoles.map((r) => (
        <label key={r.key} className="roles-picker-chip">
          <input
            type="checkbox"
            checked={selected.includes(r.key)}
            onChange={() => {
              const next = selected.includes(r.key) ? selected.filter((k) => k !== r.key) : [...selected, r.key];
              onChange(next.length ? next : null);
            }}
          />
          {r.name}
        </label>
      ))}
    </div>
  );
}

// Inline create form for a new external-link menu entry.
function LinkForm({ groupsOptions, onSave, onCancel }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState('globe');
  const [groupId, setGroupId] = useState('');
  const [err, setErr] = useState('');

  const submit = () => {
    if (!label.trim()) { setErr('Απαιτείται τίτλος.'); return; }
    if (!isValidHttpUrl(url)) { setErr('Μη έγκυρο URL — πρέπει να ξεκινά με http:// ή https://.'); return; }
    onSave({ label: label.trim().slice(0, 60), url: url.trim(), icon, group_id: groupId || null });
  };

  return (
    <div className="card card-pad" style={{ marginBottom: 12, maxWidth: 640 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field-group" style={{ marginBottom: 0, flex: '1 1 160px' }}>
          <label>Τίτλος</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="π.χ. Τεκμηρίωση" />
        </div>
        <div className="field-group" style={{ marginBottom: 0, flex: '2 1 220px' }}>
          <label>URL</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div className="field-group" style={{ marginBottom: 0, flex: '1 1 160px' }}>
          <label>Ομάδα</label>
          <select
            style={{ width: '100%', height: 40, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 9 }}
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">{FALLBACK_GROUP_LABEL}</option>
            {groupsOptions.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </div>
        <IconPicker value={icon} onChange={setIcon} />
      </div>
      {err && <div className="auth-error" style={{ marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" className="btn btn-accent" onClick={submit}><Icon name="check" size={15} /> Προσθήκη</button>
        <button type="button" className="btn" onClick={onCancel}>Άκυρο</button>
      </div>
    </div>
  );
}

// A single draggable row for a built-in nav item or a custom link, within a
// group. Supports inline label/icon override editing, role restriction, a
// select-based alternative to drag-and-drop for group reassignment, hide/show
// toggle, and — for links only — URL editing and delete.
function ItemRow({
  item, isHidden, availableRoles, groupOptions, currentGroupId,
  onDragStart, onDragOver, onDrop,
  onToggleHidden, onLabelChange, onIconChange, onRolesChange, onGroupChange, onEditUrl, onDelete,
}) {
  const [rolesOpen, setRolesOpen] = useState(false);
  return (
    <div draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} style={{ ...rowStyle, opacity: isHidden ? 0.55 : 1, cursor: 'grab' }}>
      <Icon name="more" size={14} style={{ opacity: 0.45 }} title="Σύρετε για αλλαγή σειράς/ομάδας" />
      <IconPicker value={item.icon} onChange={onIconChange} />
      <input
        value={item.label}
        onChange={(e) => onLabelChange(e.target.value)}
        maxLength={60}
        style={{ flex: '1 1 160px', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '6px 9px', fontSize: 13.5, minWidth: 120 }}
      />
      <select
        value={currentGroupId}
        onChange={(e) => onGroupChange(e.target.value)}
        style={{ height: 32, padding: '0 8px', border: '1px solid var(--border-strong)', borderRadius: 7, fontSize: 12.5 }}
        title="Ομάδα"
      >
        {groupOptions.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
      </select>
      {item.external && (
        <span className="muted" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }} title={item.url}>
          <Icon name="globe" size={12} /> εξωτερικός
        </span>
      )}
      <button type="button" className="btn btn-icon btn-ghost" style={iconBtn} onClick={() => setRolesOpen((o) => !o)} title="Ορατότητα ανά ρόλο">
        <Icon name="users" size={15} />
      </button>
      <button type="button" className="btn btn-icon btn-ghost" style={iconBtn} onClick={onToggleHidden} title={isHidden ? 'Εμφάνιση' : 'Απόκρυψη'}>
        <Icon name={isHidden ? 'eyeOff' : 'eye'} size={16} />
      </button>
      {item.external && (
        <>
          <button type="button" className="btn btn-icon btn-ghost" style={iconBtn} onClick={onEditUrl} title="Επεξεργασία URL">
            <Icon name="edit" size={15} />
          </button>
          <button type="button" className="btn btn-icon btn-ghost" style={iconBtn} onClick={onDelete} title="Διαγραφή συνδέσμου">
            <Icon name="x" size={15} />
          </button>
        </>
      )}
      {rolesOpen && (
        <div style={{ width: '100%', marginTop: 4 }}>
          <RolesPicker roles={item.roles} onChange={onRolesChange} availableRoles={availableRoles} />
        </div>
      )}
    </div>
  );
}

function SaveBar({ saving, msg, err, onSave, onExtra }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-accent" disabled={saving} onClick={onSave}>
        {saving ? <span className="spinner" /> : <Icon name="check" size={16} />} Αποθήκευση
      </button>
      {onExtra}
      {msg && <span className="voice-msg ok" style={{ padding: '4px 10px' }}>{msg}</span>}
      {err && <span className="auth-error" style={{ padding: '4px 10px', margin: 0 }}>{err}</span>}
    </div>
  );
}

// ---- Personal per-user override (order/visibility/reset only, unchanged UX) -

// Reorder (up/down) + show/hide editor, driven by a pre-resolved catalog
// (built-in items with any tenant label/icon overrides applied, plus custom
// links) so the personal section reflects the same entries every user sees.
function SidebarEditor({ catalog, order, hidden, onChange }) {
  const allIds = useMemo(() => catalog.map((c) => c.id), [catalog]);
  const byId = useMemo(() => Object.fromEntries(catalog.map((c) => [c.id, c])), [catalog]);
  const list = useMemo(() => fullOrder(order, allIds).map((id) => byId[id]).filter(Boolean), [order, allIds, byId]);
  const hiddenSet = new Set(hidden || []);
  return (
    <div>
      {list.map((item, i) => {
        const isHidden = hiddenSet.has(item.id);
        return (
          <div key={item.id} style={{ ...rowStyle, opacity: isHidden ? 0.55 : 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button type="button" style={iconBtn} disabled={i === 0} onClick={() => onChange(move(list, i, -1).map((n) => n.id), hidden)}>
                <Icon name="chevronUp" size={14} />
              </button>
              <button type="button" style={iconBtn} disabled={i === list.length - 1} onClick={() => onChange(move(list, i, 1).map((n) => n.id), hidden)}>
                <Icon name="chevronDown" size={14} />
              </button>
            </div>
            <Icon name={item.icon} size={17} />
            <div style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{item.label}</div>
            {item.external && <Icon name="globe" size={13} style={{ opacity: 0.5 }} title={item.url} />}
            <button
              type="button"
              className="btn btn-icon btn-ghost"
              title={isHidden ? 'Εμφάνιση' : 'Απόκρυψη'}
              onClick={() => onChange(list.map((n) => n.id), isHidden ? (hidden || []).filter((h) => h !== item.id) : [...(hidden || []), item.id])}
            >
              <Icon name={isHidden ? 'eyeOff' : 'eye'} size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// Ordered picker (capped to `max`) for the mobile bottom footer bar: selected
// items are shown as a drag-and-drop reorderable list (their array order IS
// the display order in the bottom bar), with the remaining catalog items
// available to add below.
function FooterEditor({ catalog, items, max, onItemsChange, onMaxChange }) {
  const selected = items || [];
  const [dragId, setDragId] = useState(null);
  const byId = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);
  const remaining = catalog.filter((item) => !selected.includes(item.id));

  const reorderTo = (fromId, toId) => {
    if (fromId === toId) return;
    const list = [...selected];
    const fromIndex = list.indexOf(fromId);
    if (fromIndex === -1) return;
    list.splice(fromIndex, 1);
    const toIndex = toId ? list.indexOf(toId) : list.length;
    list.splice(toIndex === -1 ? list.length : toIndex, 0, fromId);
    onItemsChange(list);
  };

  return (
    <div>
      <div className="field-group" style={{ maxWidth: 220 }}>
        <label>Μέγιστος αριθμός στοιχείων (bottom bar)</label>
        <select
          style={{ width: '100%', height: 38, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 9 }}
          value={max}
          onChange={(e) => onMaxChange(Number(e.target.value))}
        >
          {Array.from({ length: MOBILE_FOOTER_MAX_MAX - MOBILE_FOOTER_MIN_MAX + 1 }, (_, i) => MOBILE_FOOTER_MIN_MAX + i).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 8px' }}>
        Σύρετε για να ορίσετε τη σειρά εμφάνισης — {selected.length}/{max} επιλεγμένα.
      </p>
      {selected.length === 0 && <p className="muted" style={{ fontSize: 12.5 }}>Δεν έχουν επιλεγεί στοιχεία για το bottom bar.</p>}
      {selected.map((id) => {
        const item = byId.get(id);
        if (!item) return null;
        return (
          <div
            key={id}
            draggable
            onDragStart={() => setDragId(id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); reorderTo(dragId, id); setDragId(null); }}
            style={{ ...rowStyle, cursor: 'grab' }}
          >
            <Icon name="more" size={14} style={{ opacity: 0.45 }} title="Σύρετε για αλλαγή σειράς" />
            <Icon name={item.icon} size={17} />
            <div style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{item.label}</div>
            {item.external && <Icon name="globe" size={13} style={{ opacity: 0.5 }} title={item.url} />}
            <button type="button" style={iconBtn} title="Αφαίρεση" onClick={() => onItemsChange(selected.filter((x) => x !== id))}>
              <Icon name="x" size={14} />
            </button>
          </div>
        );
      })}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (dragId) reorderTo(dragId, null); setDragId(null); }}
        style={{ minHeight: 8 }}
      />
      {remaining.length > 0 && (
        <>
          <div className="section-title" style={{ fontSize: 12, marginTop: 10 }}>Διαθέσιμα στοιχεία</div>
          {remaining.map((item) => {
            const disableAdd = selected.length >= max;
            return (
              <div key={item.id} style={{ ...rowStyle, opacity: disableAdd ? 0.5 : 1 }}>
                <Icon name={item.icon} size={17} />
                <div style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{item.label}</div>
                {item.external && <Icon name="globe" size={13} style={{ opacity: 0.5 }} title={item.url} />}
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={disableAdd}
                  onClick={() => onItemsChange([...selected, item.id])}
                >
                  <Icon name="plus" size={13} /> Προσθήκη
                </button>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ---- Tenant-wide default menu (admin) --------------------------------------
// Design note: role restriction is implemented as an optional `roles` field
// on groups/items/links (null/empty = all roles) rather than fully duplicated
// per-role menu trees — simpler to maintain, and still delivers role-based
// menus since any group/item/link can be scoped to specific roles.
function TenantMenuSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings-menu'], queryFn: ({ signal }) => api.menuSettings({ signal }) });
  const { data: rolesData } = useQuery({ queryKey: ['settings-menu-roles'], queryFn: ({ signal }) => api.menuRoles({ signal }) });
  const availableRoles = rolesData?.roles || [];

  const [order, setOrder] = useState(null);
  const [hidden, setHidden] = useState(null);
  const [groups, setGroups] = useState(null);
  const [overrides, setOverrides] = useState(null);
  const [links, setLinks] = useState(null);
  const [footerItems, setFooterItems] = useState(null);
  const [footerMax, setFooterMax] = useState(MOBILE_FOOTER_DEFAULT_MAX);
  const [addingLink, setAddingLink] = useState(false);
  const [dragItemId, setDragItemId] = useState(null);
  const [dragGroupId, setDragGroupId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!data?.menu) return;
    const menu = data.menu;
    setOrder(menu.sidebar?.order || DEFAULT_SIDEBAR_ORDER);
    setHidden(menu.sidebar?.hidden || []);
    // Materialize the built-in groups so they're immediately draggable/renameable
    // even before an admin has touched anything (untouched tenants keep the
    // exact original 4 groups until this is saved with a change).
    setGroups(menu.groups?.length ? menu.groups : NAV_GROUPS.map((g) => ({ id: g.id, label: g.label, roles: null })));
    setOverrides(menu.overrides || {});
    setLinks(menu.links || []);
    setFooterItems(menu.mobile_footer?.items || DEFAULT_MOBILE_FOOTER_ITEMS);
    setFooterMax(menu.mobile_footer?.max || MOBILE_FOOTER_DEFAULT_MAX);
  }, [data]);

  const allIds = useMemo(() => [...NAV_ITEM_IDS, ...(links || []).map((l) => l.id)], [links]);
  const orderedIds = useMemo(() => fullOrder(order, allIds), [order, allIds]);
  const resolvedItems = useMemo(() => {
    if (!overrides || !links) return [];
    const byId = buildResolvedCatalog({ overrides, links });
    return orderedIds.map((id) => byId[id]).filter(Boolean);
  }, [orderedIds, overrides, links]);
  const groupOptions = useMemo(
    () => [...(groups || []), { id: FALLBACK_GROUP_ID, label: FALLBACK_GROUP_LABEL }],
    [groups],
  );
  const groupedView = useMemo(() => {
    if (!groups) return [];
    return resolveSidebarGroups({ tenantMenu: { groups, overrides, links }, items: resolvedItems, includeEmpty: true });
  }, [groups, overrides, links, resolvedItems]);

  if (isLoading || order === null || groups === null) return <Skeleton h={260} />;

  function setItemGroup(itemId, groupId) {
    const link = (links || []).find((l) => l.id === itemId);
    const builtin = builtinGroupIdFor(itemId);
    const explicit = groupId === builtin ? null : groupId;
    if (link) {
      setLinks((cur) => cur.map((l) => (l.id === itemId ? { ...l, group_id: explicit } : l)));
    } else {
      setOverrides((cur) => {
        const existing = cur[itemId] || {};
        if (explicit == null) { const { group_id, ...rest } = existing; return { ...cur, [itemId]: rest }; }
        return { ...cur, [itemId]: { ...existing, group_id: explicit } };
      });
    }
  }

  function reorderTo(dragId, targetId) {
    if (!dragId || dragId === targetId) return;
    setOrder((cur) => {
      const list = fullOrder(cur, allIds).filter((id) => id !== dragId);
      const idx = targetId ? list.indexOf(targetId) : -1;
      list.splice(idx < 0 ? list.length : idx, 0, dragId);
      return list;
    });
  }

  function handleItemDrop(targetItem, targetGroupId) {
    if (!dragItemId) return;
    reorderTo(dragItemId, targetItem?.id ?? null);
    setItemGroup(dragItemId, targetGroupId);
    setDragItemId(null);
  }

  function moveGroup(dragId, targetId) {
    if (!dragId || dragId === targetId) return;
    setGroups((cur) => {
      const list = [...cur];
      const from = list.findIndex((g) => g.id === dragId);
      const to = list.findIndex((g) => g.id === targetId);
      if (from < 0 || to < 0) return cur;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      return list;
    });
  }

  function addGroup() {
    const label = window.prompt('Τίτλος νέας ομάδας μενού');
    if (!label || !label.trim()) return;
    const base = slugify(label);
    const existingIds = new Set((groups || []).map((g) => g.id));
    let id = base; let n = 1;
    while (existingIds.has(id)) id = `${base}-${++n}`;
    setGroups((cur) => [...cur, { id, label: label.trim().slice(0, 60), roles: null }]);
  }

  function renameGroup(id, label) {
    setGroups((cur) => cur.map((g) => (g.id === id ? { ...g, label } : g)));
  }

  function groupRoles(id, roles) {
    setGroups((cur) => cur.map((g) => (g.id === id ? { ...g, roles } : g)));
  }

  function deleteGroup(id) {
    if (BUILTIN_GROUP_IDS.includes(id)) return;
    setGroups((cur) => cur.filter((g) => g.id !== id));
    setOverrides((cur) => {
      const next = { ...cur };
      for (const key of Object.keys(next)) {
        if (next[key].group_id === id) { const { group_id, ...rest } = next[key]; next[key] = rest; }
      }
      return next;
    });
    setLinks((cur) => cur.map((l) => (l.group_id === id ? { ...l, group_id: null } : l)));
  }

  function addLink(link) {
    const existing = new Set((links || []).map((l) => l.id));
    let id = slugify(link.label);
    let n = 1;
    while (existing.has(id)) id = `${slugify(link.label)}-${++n}`;
    setLinks((cur) => [...cur, { ...link, id, roles: null }]);
    setAddingLink(false);
  }

  function editLinkUrl(item) {
    const url = window.prompt('URL συνδέσμου (http:// ή https://)', item.url);
    if (url == null) return;
    if (!isValidHttpUrl(url)) { window.alert('Μη έγκυρο URL — πρέπει να ξεκινά με http:// ή https://.'); return; }
    setLinks((cur) => cur.map((l) => (l.id === item.id ? { ...l, url: url.trim() } : l)));
  }

  function deleteLink(item) {
    setLinks((cur) => cur.filter((l) => l.id !== item.id));
    setOrder((cur) => fullOrder(cur, allIds).filter((id) => id !== item.id));
    setHidden((cur) => (cur || []).filter((id) => id !== item.id));
    setFooterItems((cur) => (cur || []).filter((id) => id !== item.id));
  }

  const save = async () => {
    setSaving(true); setErr(''); setMsg('');
    try {
      await api.updateMenuSettings({
        sidebar: { order: orderedIds, hidden },
        mobile_footer: { items: (footerItems || []).filter((id) => allIds.includes(id)).slice(0, footerMax), max: footerMax },
        groups,
        overrides,
        links,
      });
      qc.invalidateQueries({ queryKey: ['settings-menu'] });
      qc.invalidateQueries({ queryKey: ['settings-menu-me'] });
      setMsg('Αποθηκεύτηκε το γενικό μενού.');
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };

  return (
    <div className="card card-pad" style={{ maxWidth: 760, marginBottom: 20 }}>
      <div className="section-title">Ομάδες &amp; στοιχεία πλαϊνού μενού (desktop)</div>
      <p className="muted" style={{ fontSize: 12.2, margin: '0 0 10px' }}>
        Σύρετε ομάδες ή στοιχεία για αλλαγή σειράς ή μετακίνηση σε άλλη ομάδα (ή χρησιμοποιήστε το αναπτυσσόμενο μενού
        ομάδας δίπλα σε κάθε στοιχείο). Μπορείτε να μετονομάσετε στοιχεία/ομάδες, να αλλάξετε εικονίδιο, να περιορίσετε
        την ορατότητα ανά ρόλο, και να προσθέσετε εξωτερικούς συνδέσμους. Τα δικαιώματα πρόσβασης παραμένουν πάντα σε ισχύ.
      </p>
      {groupedView.map((group) => (
        <div
          key={group.id}
          className="menu-group-card"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleItemDrop(null, group.id); }}
        >
          <div
            className="menu-group-header"
            draggable={group.id !== FALLBACK_GROUP_ID}
            onDragStart={() => setDragGroupId(group.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.stopPropagation(); moveGroup(dragGroupId, group.id); setDragGroupId(null); }}
          >
            <Icon name="more" size={14} style={{ opacity: group.id === FALLBACK_GROUP_ID ? 0 : 0.45 }} />
            {group.id === FALLBACK_GROUP_ID ? (
              <b style={{ flex: '1 1 160px' }}>{group.label}</b>
            ) : (
              <input
                value={group.label}
                onChange={(e) => renameGroup(group.id, e.target.value)}
                maxLength={60}
                style={{ flex: '1 1 160px', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '5px 9px', fontWeight: 700, fontSize: 13 }}
              />
            )}
            {group.id !== FALLBACK_GROUP_ID && (
              <RolesPicker
                roles={(groups.find((g) => g.id === group.id) || {}).roles || null}
                onChange={(r) => groupRoles(group.id, r)}
                availableRoles={availableRoles}
              />
            )}
            {group.id !== FALLBACK_GROUP_ID && !BUILTIN_GROUP_IDS.includes(group.id) && (
              <button type="button" className="btn btn-icon btn-ghost" style={iconBtn} onClick={() => deleteGroup(group.id)} title="Διαγραφή ομάδας">
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
          {group.items.length === 0 && (
            <div className="muted" style={{ fontSize: 12, padding: '4px 6px 8px' }}>Σύρετε στοιχεία εδώ.</div>
          )}
          {group.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              isHidden={(hidden || []).includes(item.id)}
              availableRoles={availableRoles}
              groupOptions={groupOptions}
              currentGroupId={item.group_id || builtinGroupIdFor(item.id) || FALLBACK_GROUP_ID}
              onDragStart={() => setDragItemId(item.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.stopPropagation(); handleItemDrop(item, group.id); }}
              onToggleHidden={() => setHidden((cur) => ((cur || []).includes(item.id) ? cur.filter((h) => h !== item.id) : [...(cur || []), item.id]))}
              onLabelChange={(label) => {
                if (item.external) setLinks((cur) => cur.map((l) => (l.id === item.id ? { ...l, label } : l)));
                else setOverrides((cur) => ({ ...cur, [item.id]: { ...(cur[item.id] || {}), label } }));
              }}
              onIconChange={(icon) => {
                if (item.external) setLinks((cur) => cur.map((l) => (l.id === item.id ? { ...l, icon } : l)));
                else setOverrides((cur) => ({ ...cur, [item.id]: { ...(cur[item.id] || {}), icon } }));
              }}
              onRolesChange={(roles) => {
                if (item.external) setLinks((cur) => cur.map((l) => (l.id === item.id ? { ...l, roles } : l)));
                else setOverrides((cur) => ({ ...cur, [item.id]: { ...(cur[item.id] || {}), roles } }));
              }}
              onGroupChange={(groupId) => setItemGroup(item.id, groupId)}
              onEditUrl={item.external ? () => editLinkUrl(item) : undefined}
              onDelete={item.external ? () => deleteLink(item) : undefined}
            />
          ))}
        </div>
      ))}
      <button type="button" className="btn" style={{ marginBottom: 18 }} onClick={addGroup}>
        <Icon name="plus" size={14} /> Νέα ομάδα
      </button>

      <div className="section-title">Εξωτερικοί σύνδεσμοι</div>
      <p className="muted" style={{ fontSize: 12.2, margin: '0 0 8px' }}>
        Ανοίγουν σε νέα καρτέλα και δεν απαιτούν δικαίωμα πρόσβασης — μπορούν να περιοριστούν ανά ρόλο όπως κάθε άλλο στοιχείο.
      </p>
      {addingLink ? (
        <LinkForm groupsOptions={groups} onCancel={() => setAddingLink(false)} onSave={addLink} />
      ) : (
        <button type="button" className="btn" style={{ marginBottom: 18 }} onClick={() => setAddingLink(true)}>
          <Icon name="plus" size={14} /> Νέος εξωτερικός σύνδεσμος
        </button>
      )}

      <div className="section-title">Κάτω μπάρα μενού (mobile)</div>
      <FooterEditor
        catalog={resolvedItems}
        items={footerItems}
        max={footerMax}
        onItemsChange={setFooterItems}
        onMaxChange={(m) => { setFooterMax(m); setFooterItems((cur) => (cur || []).slice(0, m)); }}
      />
      <SaveBar saving={saving} msg={msg} err={err} onSave={save} />
    </div>
  );
}

// ---- Personal per-user override ---------------------------------------------
function PersonalMenuSection() {
  const qc = useQueryClient();
  const hasPerm = useAuth((s) => s.hasPerm);
  const roleKey = useAuth((s) => s.user?.roleKey);
  const { data: tenantData } = useQuery({ queryKey: ['settings-menu'], queryFn: ({ signal }) => api.menuSettings({ signal }) });
  const tenantMenu = tenantData?.menu;
  const { data, isLoading } = useQuery({ queryKey: ['settings-menu-me'], queryFn: ({ signal }) => api.myMenuSettings({ signal }) });

  // The user's own reorderable/hideable catalog: built-in items with tenant
  // label/icon overrides applied, plus custom links — filtered by permission
  // (non-negotiable) and by role restriction, exactly like the resolver used
  // for actually rendering their sidebar/footer.
  const catalog = useMemo(() => {
    const byId = buildResolvedCatalog(tenantMenu);
    return Object.values(byId).filter((n) => {
      const permitted = n.external || !n.perms || n.perms.some((p) => hasPerm(p));
      const roleOk = !n.roles || !n.roles.length || (roleKey && n.roles.includes(roleKey));
      return permitted && roleOk;
    });
  }, [tenantMenu, hasPerm, roleKey]);

  const [order, setOrder] = useState(null);
  const [hidden, setHidden] = useState(null);
  const [footerItems, setFooterItems] = useState(null);
  const [footerMax, setFooterMax] = useState(MOBILE_FOOTER_DEFAULT_MAX);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (data === undefined) return;
    const menu = data?.menu;
    setOrder(menu?.sidebar?.order || DEFAULT_SIDEBAR_ORDER);
    setHidden(menu?.sidebar?.hidden || []);
    setFooterItems(menu?.mobile_footer?.items || DEFAULT_MOBILE_FOOTER_ITEMS);
    setFooterMax(menu?.mobile_footer?.max || MOBILE_FOOTER_DEFAULT_MAX);
  }, [data]);

  if (isLoading || order === null) return <Skeleton h={140} />;

  const save = async () => {
    setSaving(true); setErr(''); setMsg('');
    try {
      await api.updateMyMenuSettings({
        sidebar: { order, hidden },
        mobile_footer: { items: footerItems.slice(0, footerMax), max: footerMax },
      });
      qc.invalidateQueries({ queryKey: ['settings-menu-me'] });
      setMsg('Αποθηκεύτηκε το προσωπικό σας μενού.');
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };

  const reset = async () => {
    setSaving(true); setErr(''); setMsg('');
    try {
      await api.clearMyMenuSettings();
      qc.invalidateQueries({ queryKey: ['settings-menu-me'] });
      setMsg('Επαναφέρθηκε στην προεπιλογή.');
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };

  const catalogIds = new Set(catalog.map((c) => c.id));

  return (
    <div className="card card-pad" style={{ maxWidth: 640 }}>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 12px' }}>
        Προσαρμόστε τη σειρά και την ορατότητα του δικού σας μενού. Έχει προτεραιότητα έναντι της γενικής ρύθμισης του
        οργανισμού· εμφανίζονται μόνο στοιχεία στα οποία έχετε ήδη δικαίωμα πρόσβασης (και, αν ισχύει, τον ρόλο σας).
      </p>
      <div className="section-title">Πλαϊνό μενού (desktop)</div>
      <SidebarEditor
        catalog={catalog}
        order={(order || []).filter((id) => catalogIds.has(id))}
        hidden={hidden}
        onChange={(o, h) => { setOrder(o); setHidden(h); }}
      />
      <div className="section-title" style={{ marginTop: 16 }}>Κάτω μπάρα μενού (mobile)</div>
      <FooterEditor
        catalog={catalog}
        items={(footerItems || []).filter((id) => catalogIds.has(id))}
        max={footerMax}
        onItemsChange={setFooterItems}
        onMaxChange={(m) => { setFooterMax(m); setFooterItems((cur) => cur.slice(0, m)); }}
      />
      <SaveBar
        saving={saving}
        msg={msg}
        err={err}
        onSave={save}
        onExtra={<button type="button" className="btn" disabled={saving} onClick={reset}>Επαναφορά στην προεπιλογή</button>}
      />
    </div>
  );
}

export default function MenuPanel() {
  const hasPerm = useAuth((s) => s.hasPerm);
  const canManage = hasPerm(PERMS.SETTINGS_MANAGE);
  return (
    <div>
      {canManage && (
        <>
          <div className="settings-eyebrow" style={{ marginBottom: 6 }}>Γενικές ρυθμίσεις μενού</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 12px' }}>
            Προεπιλεγμένη σειρά/ομαδοποίηση/ορατότητα μενού για όλο τον οργανισμό. Κάθε χρήστης μπορεί να την παρακάμψει
            με το δικό του προσωπικό μενού παρακάτω. Δεν επηρεάζει τα δικαιώματα πρόσβασης — μόνο την οργάνωση του μενού.
          </p>
          <TenantMenuSection />
        </>
      )}
      <div className="settings-eyebrow" style={{ marginBottom: 6 }}>Το μενού μου</div>
      <PersonalMenuSection />
    </div>
  );
}

