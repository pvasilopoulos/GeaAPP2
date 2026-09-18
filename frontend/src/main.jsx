import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import { useAuth } from './store/auth.js';
import { useTabs } from './store/tabs.js';
import { captureInstallPrompt, installReloadGuard, registerServiceWorker } from './lib/pwa.js';
import { initOfflineSync, QUEUE_EVENT, queryKeysForMutation } from './lib/offlineQueue.js';
import { notificationTarget, openNotificationTarget } from './lib/notifications.js';
import './styles.css';

captureInstallPrompt();
registerServiceWorker();
installReloadGuard();
initOfflineSync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, refetchOnWindowFocus: false, retry: 1 } },
});

// Clicking a system push notification posts a message here from the SW
// (see public/sw.js `notificationclick`); route it to the same tab the
// in-app notifications bell would open.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== 'spacehub:push-click') return;
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    const target = notificationTarget(event.data.target);
    openNotificationTarget(target, { openCustomer: useTabs.getState().openCustomer, openTab: useTabs.getState().openTab });
  });
}


if (typeof window !== 'undefined') {
  window.addEventListener(QUEUE_EVENT, (e) => {
    const type = e.detail?.synced?.item?.type;
    if (!type) return;
    for (const key of queryKeysForMutation(type)) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  });
}

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
