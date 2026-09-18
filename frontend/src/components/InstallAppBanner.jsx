import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import {
  currentInstallMode,
  dismissInstallHint,
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
    body: 'Στο Chrome/Edge πατήστε το εικονίδιο εγκατάστασης στη γραμμή διευθύνσεων, ή μενού ⋮ → Εγκατάσταση εφαρμογής. Όχι «Δημιουργία συντόμευσης».',
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
  const [extra, setExtra] = useState('');
  useEffect(() => subscribeInstallPrompt(() => setMode(currentInstallMode())), []);
  if (!COPY[mode]) return null;
  const copy = COPY[mode];
  const onInstall = () => {
    // prompt() must run in this click turn — no setState/await beforehand.
    void promptInstall().then((result) => {
      setMode(currentInstallMode());
      if (!result.ok) {
        setExtra(result.reason === 'no-event'
          ? 'Ο browser δεν άνοιξε διάλογο. Χρησιμοποιήστε ⋮ → Εγκατάσταση εφαρμογής.'
          : result.reason);
      }
    });
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
        {mode === 'prompt' && (
          <button type="button" className="btn btn-accent" onClick={onInstall}>
            {copy.action}
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
