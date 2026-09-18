import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Skeleton } from '../../components/ui.jsx';
import { useAuth } from '../../store/auth.js';
import { PERMS } from '../../lib/perms.js';
import {
  NAV, NAV_BY_ID, DEFAULT_SIDEBAR_ORDER, DEFAULT_MOBILE_FOOTER_ITEMS,
  MOBILE_FOOTER_MIN_MAX, MOBILE_FOOTER_MAX_MAX, MOBILE_FOOTER_DEFAULT_MAX,
} from '../../lib/navCatalog.js';

const rowStyle = { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 9, border: '1px solid var(--border)', marginBottom: 6, background: '#fff' };
const iconBtn = { width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid var(--border-strong)', background: '#fff' };

function fullOrder(order) {
  const known = (order || []).filter((id) => NAV_BY_ID[id]);
  const missing = NAV.map((n) => n.id).filter((id) => !known.includes(id));
  return [...known, ...missing];
}

function move(list, index, dir) {
  const next = [...list];
  const j = index + dir;
  if (j < 0 || j >= next.length) return list;
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

// Reorder (up/down) + show/hide editor for the sidebar section. Presents the
// full nav catalog — visibility for other users still depends on their own
// permissions, so an admin editing the tenant default should see every item.
function SidebarEditor({ order, hidden, onChange }) {
  const list = useMemo(() => fullOrder(order), [order]);
  const hiddenSet = new Set(hidden || []);
  return (
    <div>
      {list.map((id, i) => {
        const item = NAV_BY_ID[id];
        const isHidden = hiddenSet.has(id);
        return (
          <div key={id} style={{ ...rowStyle, opacity: isHidden ? 0.55 : 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button type="button" style={iconBtn} disabled={i === 0} onClick={() => onChange(move(list, i, -1), hidden)}>
                <Icon name="chevronUp" size={14} />
              </button>
              <button type="button" style={iconBtn} disabled={i === list.length - 1} onClick={() => onChange(move(list, i, 1), hidden)}>
                <Icon name="chevronDown" size={14} />
              </button>
            </div>
            <Icon name={item.icon} size={17} />
            <div style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{item.label}</div>
            <button
              type="button"
              className="btn btn-icon btn-ghost"
              title={isHidden ? 'Εμφάνιση' : 'Απόκρυψη'}
              onClick={() => onChange(list, isHidden ? (hidden || []).filter((h) => h !== id) : [...(hidden || []), id])}
            >
              <Icon name={isHidden ? 'eyeOff' : 'eye'} size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// Checkbox picker (capped to `max`) for the mobile bottom footer bar.
function FooterEditor({ items, max, onItemsChange, onMaxChange }) {
  const selected = items || [];
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
        Επιλέξτε έως {max} στοιχεία — {selected.length}/{max} επιλεγμένα.
      </p>
      {NAV.map((item) => {
        const checked = selected.includes(item.id);
        const disableAdd = !checked && selected.length >= max;
        return (
          <label key={item.id} style={{ ...rowStyle, opacity: disableAdd ? 0.5 : 1, cursor: disableAdd ? 'not-allowed' : 'pointer' }}>
            <input
              type="checkbox"
              checked={checked}
              disabled={disableAdd}
              onChange={() => onItemsChange(checked ? selected.filter((id) => id !== item.id) : [...selected, item.id])}
            />
            <Icon name={item.icon} size={17} />
            <div style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{item.label}</div>
          </label>
        );
      })}
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

// ---- Tenant-wide default menu (admin) --------------------------------------
function TenantMenuSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings-menu'], queryFn: ({ signal }) => api.menuSettings({ signal }) });
  const [order, setOrder] = useState(null);
  const [hidden, setHidden] = useState(null);
  const [footerItems, setFooterItems] = useState(null);
  const [footerMax, setFooterMax] = useState(MOBILE_FOOTER_DEFAULT_MAX);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!data?.menu) return;
    setOrder(data.menu.sidebar?.order || DEFAULT_SIDEBAR_ORDER);
    setHidden(data.menu.sidebar?.hidden || []);
    setFooterItems(data.menu.mobile_footer?.items || DEFAULT_MOBILE_FOOTER_ITEMS);
    setFooterMax(data.menu.mobile_footer?.max || MOBILE_FOOTER_DEFAULT_MAX);
  }, [data]);

  if (isLoading || order === null) return <Skeleton h={140} />;

  const save = async () => {
    setSaving(true); setErr(''); setMsg('');
    try {
      await api.updateMenuSettings({
        sidebar: { order, hidden },
        mobile_footer: { items: footerItems.slice(0, footerMax), max: footerMax },
      });
      qc.invalidateQueries({ queryKey: ['settings-menu'] });
      setMsg('Αποθηκεύτηκε το γενικό μενού.');
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  };

  return (
    <div className="card card-pad" style={{ maxWidth: 640, marginBottom: 20 }}>
      <div className="section-title">Πλαϊνό μενού (desktop)</div>
      <SidebarEditor order={order} hidden={hidden} onChange={(o, h) => { setOrder(o); setHidden(h); }} />
      <div className="section-title" style={{ marginTop: 16 }}>Κάτω μπάρα μενού (mobile)</div>
      <FooterEditor
        items={footerItems}
        max={footerMax}
        onItemsChange={setFooterItems}
        onMaxChange={(m) => { setFooterMax(m); setFooterItems((cur) => cur.slice(0, m)); }}
      />
      <SaveBar saving={saving} msg={msg} err={err} onSave={save} />
    </div>
  );
}

// ---- Personal per-user override ---------------------------------------------
function PersonalMenuSection() {
  const qc = useQueryClient();
  const hasPerm = useAuth((s) => s.hasPerm);
  const { data, isLoading } = useQuery({ queryKey: ['settings-menu-me'], queryFn: ({ signal }) => api.myMenuSettings({ signal }) });
  const catalog = useMemo(() => NAV.filter((n) => !n.perms || n.perms.some((p) => hasPerm(p))), [hasPerm]);
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

  return (
    <div className="card card-pad" style={{ maxWidth: 640 }}>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 12px' }}>
        Προσαρμόστε τη σειρά και την ορατότητα του δικού σας μενού. Έχει προτεραιότητα έναντι της γενικής ρύθμισης του
        οργανισμού· εμφανίζονται μόνο στοιχεία στα οποία έχετε ήδη δικαίωμα πρόσβασης.
      </p>
      <div className="section-title">Πλαϊνό μενού (desktop)</div>
      <SidebarEditor
        order={(order || []).filter((id) => catalog.some((c) => c.id === id))}
        hidden={hidden}
        onChange={(o, h) => { setOrder(o); setHidden(h); }}
      />
      <div className="section-title" style={{ marginTop: 16 }}>Κάτω μπάρα μενού (mobile)</div>
      <FooterEditor
        items={(footerItems || []).filter((id) => catalog.some((c) => c.id === id))}
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
            Προεπιλεγμένη σειρά/ορατότητα μενού για όλο τον οργανισμό. Κάθε χρήστης μπορεί να την παρακάμψει με το δικό
            του προσωπικό μενού παρακάτω. Δεν επηρεάζει τα δικαιώματα πρόσβασης — απλώς την οργάνωση του μενού.
          </p>
          <TenantMenuSection />
        </>
      )}
      <div className="settings-eyebrow" style={{ marginBottom: 6 }}>Το μενού μου</div>
      <PersonalMenuSection />
    </div>
  );
}
