import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Customers from './pages/Customers.jsx';
import CustomerProfile from './pages/CustomerProfile.jsx';
import Settings from './pages/Settings.jsx';
import Placeholder from './pages/Placeholder.jsx';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, refetchOnWindowFocus: false, retry: 1 },
  },
});

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'customers', element: <Customers /> },
      { path: 'customers/:id', element: <CustomerProfile /> },
      { path: 'settings', element: <Settings /> },
      { path: 'bookings', element: <Placeholder title="Κρατήσεις" icon="calendar" /> },
      { path: 'branches', element: <Placeholder title="Υποκαταστήματα" icon="building" /> },
      { path: 'spaces', element: <Placeholder title="Χώροι" icon="grid" /> },
      { path: 'calendar', element: <Placeholder title="Ημερολόγιο" icon="calendar" /> },
      { path: 'reports', element: <Placeholder title="Αναφορές" icon="chart" /> },
      { path: 'communications', element: <Placeholder title="Επικοινωνίες" icon="message" /> },
      { path: 'documents', element: <Placeholder title="Έγγραφα" icon="file" /> },
    ],
  },
], {
  future: { v7_startTransition: true, v7_relativeSplatPath: true },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
