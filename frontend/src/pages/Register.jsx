import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../store/auth.js';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { DEFAULT_APP_NAME } from '../lib/branding.js';

export default function Register() {
  const navigate = useNavigate();
  const register = useAuth((s) => s.register);
  const pub = useQuery({ queryKey: ['public-settings'], queryFn: ({ signal }) => api.publicSettings({ signal }) });
  const allow = pub.data?.allow_self_register !== false;
  const [form, setForm] = useState({ tenantName: '', firstName: '', lastName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try { await register(form); navigate('/'); }
    catch (ex) { setError(ex.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand"><span className="logo"><Icon name="layers" size={19} /></span> {DEFAULT_APP_NAME}</div>
        <div className="auth-sub">Δημιουργία νέου οργανισμού (tenant) — γίνεστε ο ιδιοκτήτης</div>
        {error && <div className="auth-error">{error}</div>}
        {pub.data && !allow ? (
          <div className="auth-error">Η αυτόματη εγγραφή οργανισμών είναι απενεργοποιημένη. Ζητήστε πρόσβαση από τον διαχειριστή.</div>
        ) : (
          <form onSubmit={submit}>
            <div className="field-group">
              <label>Επωνυμία οργανισμού</label>
              <input value={form.tenantName} onChange={set('tenantName')} required />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field-group" style={{ flex: 1 }}>
                <label>Όνομα</label>
                <input value={form.firstName} onChange={set('firstName')} required />
              </div>
              <div className="field-group" style={{ flex: 1 }}>
                <label>Επώνυμο</label>
                <input value={form.lastName} onChange={set('lastName')} />
              </div>
            </div>
            <div className="field-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={set('email')} autoComplete="username" required />
            </div>
            <div className="field-group">
              <label>Κωδικός (τουλάχιστον 6 χαρακτήρες)</label>
              <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required />
            </div>
            <button className="btn btn-accent btn-block" disabled={loading}>
              {loading ? <span className="spinner" /> : <Icon name="plus" size={16} />} Εγγραφή
            </button>
          </form>
        )}
        <div className="auth-hint">Έχετε ήδη λογαριασμό; <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>Σύνδεση</Link></div>
      </div>
    </div>
  );
}
