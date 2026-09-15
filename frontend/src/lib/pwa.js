let installEvent = null;
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(installEvent);
}

export function subscribeInstallPrompt(fn) {
  listeners.add(fn);
  fn(installEvent);
  return () => listeners.delete(fn);
}

export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    notify();
  });
}

export async function promptInstall() {
  if (!installEvent) return false;
  installEvent.prompt();
  const { outcome } = await installEvent.userChoice;
  installEvent = null;
  notify();
  return outcome === 'accepted';
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}

/** Block browser reload (F5 / Ctrl+R / Cmd+R). Dev keeps native refresh. */
export function installReloadGuard() {
  if (import.meta.env.DEV) return;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'))) {
      e.preventDefault();
    }
  }, { capture: true });
}

/** Refresh React Query. In production also drop the PWA cache and reload. Dev keeps the Vite session. */
export async function refreshApp(queryClient) {
  await queryClient.invalidateQueries();
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return { reloaded: false };
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
  const reg = await navigator.serviceWorker.getRegistration();
  await reg?.update();
  navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_CACHE' });
  window.location.reload();
  return { reloaded: true };
}
