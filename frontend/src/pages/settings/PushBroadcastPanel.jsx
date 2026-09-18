import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Skeleton } from '../../components/ui.jsx';
import { formatRelativeTime } from '../../lib/notifications.js';

const card = { border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: '#fff' };

export default function PushBroadcastPanel() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState('all'); // 'all' | 'users'
  const [selected, setSelected] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['push-recipients'],
    queryFn: ({ signal }) => api.pushRecipients({ signal }),
  });
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['push-broadcasts'],
    queryFn: ({ signal }) => api.pushBroadcasts({ signal }),
  });

  const users = usersData?.users || [];
  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => `${u.full_name} ${u.email}`.toLowerCase().includes(q));
  }, [users, query]);

  const toggleUser = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const sendMutation = useMutation({
    mutationFn: () => api.pushBroadcast({
      title: title.trim(),
      body: body.trim() || null,
      url: url.trim() || null,
      recipients: mode === 'all' ? 'all' : Array.from(selected),
    }),
    onSuccess: (r) => {
      setResult(r);
      setErr('');
      setTitle(''); setBody(''); setUrl(''); setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['push-broadcasts'] });
    },
    onError: (e) => { setErr(e.message || 'Κάτι πήγε στραβά'); setResult(null); },
  });

  const canSend = title.trim().length > 0 && (mode === 'all' || selected.size > 0) && !sendMutation.isPending;

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 720 }}>
      <div style={card}>
        <b>Σύνθεση ειδοποίησης</b>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          Στέλνεται άμεσα ως in-app ειδοποίηση (κουδουνάκι) και ως push σε κάθε συσκευή που έχει ενεργοποιήσει ειδοποιήσεις ο παραλήπτης.
        </div>

        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12.5 }} className="muted">Τίτλος *</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="π.χ. Προγραμματισμένη συντήρηση απόψε" />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12.5 }} className="muted">Κείμενο</span>
            <textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} rows={3} placeholder="Προαιρετικά, περισσότερες λεπτομέρειες…" />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12.5 }} className="muted">Σύνδεσμος (προαιρετικά)</span>
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} placeholder="https://…" />
          </label>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, cursor: 'pointer' }}>
              <input type="radio" checked={mode === 'all'} onChange={() => setMode('all')} />
              Όλοι οι χρήστες {usersLoading ? '' : `(${users.length})`}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, cursor: 'pointer' }}>
              <input type="radio" checked={mode === 'users'} onChange={() => setMode('users')} />
              Συγκεκριμένοι χρήστες {selected.size > 0 ? `(${selected.size} επιλεγμένοι)` : ''}
            </label>
          </div>

          {mode === 'users' && (
            <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                <input className="input" placeholder="Αναζήτηση ονόματος/email…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {usersLoading && <div style={{ padding: 10 }}><Skeleton h={16} /></div>}
                {!usersLoading && filteredUsers.length === 0 && (
                  <div className="muted" style={{ padding: 10, fontSize: 13 }}>Δεν βρέθηκαν χρήστες.</div>
                )}
                {filteredUsers.map((u) => (
                  <label
                    key={u.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                      borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13.5,
                    }}
                  >
                    <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleUser(u.id)} />
                    <span style={{ flex: 1 }}>
                      <b>{u.full_name}</b>
                      <span className="muted" style={{ marginLeft: 6 }}>{u.email}</span>
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {u.device_count > 0 ? `${u.device_count} συσκευή/ές` : 'χωρίς push'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" className="btn btn-primary" disabled={!canSend} onClick={() => sendMutation.mutate()}>
            {sendMutation.isPending ? 'Αποστολή…' : 'Αποστολή ειδοποίησης'}
          </button>
          {result && (
            <span style={{ fontSize: 13, color: 'var(--success, #16a34a)' }}>
              Στάλθηκε σε {result.recipients} χρήστες ({result.pushSent} push).
            </span>
          )}
          {err && <span style={{ fontSize: 13, color: 'var(--danger, #dc2626)' }}>{err}</span>}
        </div>
      </div>

      <div style={card}>
        <b>Ιστορικό αποστολών</b>
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {historyLoading && <Skeleton h={60} />}
          {!historyLoading && !(historyData?.broadcasts || []).length && (
            <div className="muted" style={{ fontSize: 13 }}>Δεν έχουν σταλεί ειδοποιήσεις ακόμα.</div>
          )}
          {(historyData?.broadcasts || []).map((b) => (
            <div key={b.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: '#f3f4f6', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon name="bell" size={15} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{b.title}</b>
                {b.body && <div className="muted" style={{ fontSize: 13 }}>{b.body}</div>}
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  {b.recipient_type === 'all' ? 'Όλοι' : `${b.recipient_count} επιλεγμένοι`}
                  {' · '}{b.push_sent_count} push{' · '}
                  {b.sender_name || 'Άγνωστος'}{' · '}{formatRelativeTime(b.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
