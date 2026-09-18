let installEvent = null;
const listeners = new Set();
export const PWA_INSTALL_DISMISS_KEY = 'spacehub.pwa-install-dismissed';

function notify() {
  for (const fn of listeners) fn(installEvent);
}

export function subscribeInstallPrompt(fn) {
  listeners.add(fn);
  fn(installEvent);
  return () => listeners.delete(fn);
}

function adoptInstallEvent(e) {
  if (!e || typeof e.prompt !== 'function') return;
  installEvent = e;
  notify();
}

function getInstallEvent() {
  const evt = installEvent || (typeof window !== 'undefined' ? window.__spacehubInstall : null);
  return evt && typeof evt.prompt === 'function' ? evt : null;
}

function clearInstallEvent() {
  installEvent = null;
  if (typeof window !== 'undefined') window.__spacehubInstall = null;
  notify();
}

export function captureInstallPrompt() {
  adoptInstallEvent(window.__spacehubInstall);
  window.addEventListener('spacehub:beforeinstallprompt', () => {
    adoptInstallEvent(window.__spacehubInstall);
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    // Defer the native dialog so our button can call prompt() in the click.
    e.preventDefault();
    window.__spacehubInstall = e;
    adoptInstallEvent(e);
  });
  window.addEventListener('appinstalled', () => {
    try { localStorage.removeItem(PWA_INSTALL_DISMISS_KEY); } catch { /* ignore */ }
    clearInstallEvent();
  });
}

export async function promptInstall() {
  const evt = getInstallEvent();
  if (!evt) return { ok: false, reason: 'no-event' };
  try {
    // Must run in the same user-gesture turn as the click — do not await
    // anything before this call.
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    clearInstallEvent();
    return { ok: true, outcome };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
}

export function isStandalone(win = typeof window === 'undefined' ? undefined : window) {
  if (!win) return false;
  return win.matchMedia('(display-mode: standalone)').matches
    || win.matchMedia('(display-mode: window-controls-overlay)').matches
    || win.navigator.standalone === true;
}

export function isIosDevice(ua, nav) {
  const s = ua || nav?.userAgent || '';
  return /iphone|ipad|ipod/i.test(s)
    || (nav?.platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1);
}

export function isIosSafari(ua, nav) {
  const s = ua || nav?.userAgent || '';
  if (!isIosDevice(s, nav)) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(s)) return false;
  return /Safari/i.test(s);
}

export function isChromium(ua = '') {
  return /Chrome|Edg|OPR|Brave/i.test(ua) && !/CriOS/i.test(ua);
}

/** How the current browser can become a real installed app (not a bookmark shortcut). */
export function resolveInstallMode({ standalone, secure, hasPrompt, ua, nav, dismissed } = {}) {
  if (standalone) return 'installed';
  if (dismissed) return 'dismissed';
  if (hasPrompt) return 'prompt';
  if (secure === false) return 'insecure';
  if (isIosSafari(ua, nav)) return 'ios-safari';
  if (isIosDevice(ua, nav)) return 'ios-other';
  if (isChromium(ua)) return 'chromium-menu';
  return 'manual';
}

export function currentInstallMode() {
  let dismissed = false;
  try { dismissed = localStorage.getItem(PWA_INSTALL_DISMISS_KEY) === '1'; } catch { /* ignore */ }
  return resolveInstallMode({
    standalone: isStandalone(),
    secure: typeof window === 'undefined' ? true : window.isSecureContext,
    hasPrompt: !!installEvent,
    ua: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    nav: typeof navigator === 'undefined' ? undefined : navigator,
    dismissed,
  });
}

export function dismissInstallHint() {
  try { localStorage.setItem(PWA_INSTALL_DISMISS_KEY, '1'); } catch { /* ignore */ }
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => null);
}

/** Open Chrome's install dialog. Must be called directly from a click handler. */
export async function prepareInstall() {
  const evt = getInstallEvent();
  if (evt) {
    const result = await promptInstall();
    if (result.ok) return { status: result.outcome === 'accepted' ? 'accepted' : 'dismissed' };
    return { status: 'prompt-failed', error: result.reason };
  }
  if (typeof window !== 'undefined' && window.isSecureContext === false) return { status: 'insecure' };
  return { status: 'no-event' };
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
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.update()));
  window.location.reload();
  return { reloaded: true };
}
