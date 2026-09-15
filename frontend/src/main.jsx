import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import { useAuth } from './store/auth.js';
import { installOfflineWatchers } from './store/offline.js';
import { captureInstallPrompt, installReloadGuard, registerServiceWorker } from './lib/pwa.js';
import './styles.css';

captureInstallPrompt();
registerServiceWorker();
installReloadGuard();
installOfflineWatchers();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      refetchOnWindowFocus: false,
      // Retrying an offline request only delays the cached fallback.
      retry: (count, err) => !err?.offline && count < 1,
    },
  },
});

// Queued writes that reached the server invalidate the lists they touched.
window.addEventListener('spacehub:synced', (e) => {
  queryClient.invalidateQueries({ queryKey: ['customers'] });
  queryClient.invalidateQueries({ queryKey: ['meta'] });
  for (const id of e.detail?.customerIds || []) {
    queryClient.invalidateQueries({ queryKey: ['customer', id] });
    queryClient.invalidateQueries({ queryKey: ['contacts', id] });
  }
});

function Splash() {
  return <div className="auth-wrap"><span className="spinner" style={{ width: 28, height: 28 }} /></div>;
}

// Loads the session once, then gates the app.
function RequireAuth({ children }) {
  const status = useAuth((s) => s.status);
  const bootstrap = useAuth((s) => s.bootstrap);
  const navigate = useNavigate();
  useEffect(() => { if (status === 'loading') bootstrap(); }, [status, bootstrap]);
  useEffect(() => {
    const onUnauth = () => navigate('/login');
    window.addEventListener('spacehub:unauthorized', onUnauth);
    return () => window.removeEventListener('spacehub:unauthorized', onUnauth);
  }, [navigate]);
  if (status === 'loading') return <Splash />;
  if (status === 'anon') return <Navigate to="/login" replace />;
  return children;
}

function Public({ children }) {
  const status = useAuth((s) => s.status);
  if (status === 'authed') return <Navigate to="/" replace />;
  return children;
}

const router = createBrowserRouter([
  { path: '/login', element: <Public><Login /></Public> },
  { path: '/register', element: <Public><Register /></Public> },
  { path: '*', element: <RequireAuth><App /></RequireAuth> },
], { future: { v7_startTransition: true, v7_relativeSplatPath: true } });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
