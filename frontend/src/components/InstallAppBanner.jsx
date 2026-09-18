import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import {
  currentInstallMode,
  dismissInstallHint,
  prepareInstall,
  promptInstall,
  subscribeInstallPrompt,
} from '../lib/pwa.js';

const COPY = {
  prompt: {
    title: 'Εγκατάσταση ως εφαρμογή',
    body: 'Ανοίγει σε δικό της παράθυρο, με εικονίδιο στο μενού της συσκευής — όχι ως συντόμευση browser.',
    action: 'Εγκατάσταση',
  },
  'ios-safari': {
    title: 'Προσθήκη ως εφαρμογή',
    body: 'Πατήστε Κοινοποίηση → Προσθήκη στην οθόνη Αφετηρίας. Έτσι ανοίγει χωρίς τη γραμμή του Safari.',
  },
  'ios-other': {
    title: 'Ανοίξτε στο Safari',
    body: 'Το Chrome/Firefox στο iPhone δημιουργεί μόνο συντόμευση. Για πραγματική εφαρμογή ανοίξτε το SpaceHub στο Safari και προσθέστε το στην οθόνη Αφετηρίας.',
  },
  'chromium-menu': {
    title: 'Εγκατάσταση ως εφαρμογή',
    body: 'Πατήστε Εγκατάσταση. Αν δεν εμφανιστεί το παράθυρο του Chrome/Edge, ανανεώστε και ξαναδοκιμάστε — όχι «Δημιουργία συντόμευσης».',
    action: 'Εγκατάσταση',
  },
  insecure: {
    title: 'Απαιτείται HTTPS',
    body: 'Χωρίς ασφαλές HTTPS ο browser προσφέρει μόνο συντόμευση, όχι εγκατάσταση εφαρμογής.',
  },
  manual: {
    title: 'Εγκατάσταση ως εφαρμογή',
    body: 'Από το μενού του browser επιλέξτε εγκατάσταση εφαρμογής, όχι δημιουργία συντόμευσης.',
  },
};

export default function InstallAppBanner({ compact = false }) {
  const [mode, setMode] = useState(() => currentInstallMode());
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState('');
  useEffect(() => subscribeInstallPrompt(() => setMode(currentInstallMode())), []);
  if (!COPY[mode]) return null;
  const copy = COPY[mode];
  const canPrompt = mode === 'prompt' || mode === 'chromium-menu';
  const onInstall = async () => {
    if (mode === 'prompt') {
      await promptInstall();
      setMode(currentInstallMode());
      return;
    }
    setBusy(true); setExtra('');
    try {
      const r = await prepareInstall();
      setMode(currentInstallMode());
      if (r.status === 'waiting') setExtra('Ανανεώστε τη σελίδα. Στο Chrome/Edge επιλέξτε Εγκατάσταση εφαρμογής, όχι συντόμευση.');
      if (r.status === 'insecure') setExtra('Χρειάζεται HTTPS (ή localhost).');
      if (r.status === 'sw-failed') setExtra(r.error || 'Αποτυχία service worker.');
    } finally { setBusy(false); }
  };
  return (
    <div className={`pwa-install${compact ? ' compact' : ''}`} role="status">
      <Icon name="download" size={16} />
      <div className="pwa-install-copy">
        <b>{copy.title}</b>
        <span>{copy.body}</span>
        {extra && <span>{extra}</span>}
      </div>
      <div className="pwa-install-actions">
        {canPrompt && (
          <button type="button" className="btn btn-accent" disabled={busy} onClick={onInstall}>
            {busy ? <span className="spinner" /> : (copy.action || 'Εγκατάσταση')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="Απόκρυψη"
          onClick={() => { dismissInstallHint(); setMode(currentInstallMode()); }}
        >
          <Icon name="x" size={16} />
        </button>
      </div>
    </div>
  );
}
