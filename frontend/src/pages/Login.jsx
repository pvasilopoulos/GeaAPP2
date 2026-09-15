import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../store/auth.js';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';

const DEMO = [
  ['Ιδιοκτήτης', 'owner@demo.gr'],
  ['Manager', 'manager@demo.gr'],
  ['Θεατής', 'viewer@demo.gr'],
];

export default function Login() {
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const pub = useQuery({ queryKey: ['public-settings'], queryFn: ({ signal }) => api.publicSettings({ signal }) });
  const [email, setEmail] = useState('owner@demo.gr');
  const [password, setPassword] = useState('password123');
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
        <div className="auth-brand"><span className="logo"><Icon name="layers" size={19} /></span> SpaceHub</div>
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
        <div className="demo-box">
          <b>Demo λογαριασμοί</b> (κωδικός: <code>password123</code>)
          {DEMO.map(([role, mail]) => (
            <div className="demo-row" key={mail}>
              <span>{role}</span>
              <code style={{ cursor: 'pointer' }} onClick={() => setEmail(mail)}>{mail}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
