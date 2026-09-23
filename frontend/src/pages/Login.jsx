import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../store/auth.js';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { DEFAULT_APP_NAME } from '../lib/branding.js';
import InstallAppBanner from '../components/InstallAppBanner.jsx';

export default function Login() {
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const pub = useQuery({ queryKey: ['public-settings'], queryFn: ({ signal }) => api.publicSettings({ signal }) });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try { await login(email, password); navigate('/'); }
    catch (ex) { setError(ex.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <InstallAppBanner compact />
        <div className="auth-brand"><span className="logo"><Icon name="layers" size={19} /></span> {DEFAULT_APP_NAME}</div>
        <div className="auth-sub">Σύνδεση στο λογαριασμό σας</div>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="field-group">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </div>
          <div className="field-group">
            <label>Κωδικός</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          <button className="btn btn-accent btn-block" disabled={loading}>
            {loading ? <span className="spinner" /> : <Icon name="check" size={16} />} Σύνδεση
          </button>
        </form>
        {pub.data?.allow_self_register !== false && (
          <div className="auth-hint">Δεν έχετε λογαριασμό; <Link to="/register" style={{ color: 'var(--accent)', fontWeight: 600 }}>Εγγραφή</Link></div>
        )}
      </div>
    </div>
  );
}
