/* SpaceHub PWA — keep a fetch handler so Chromium treats this as installable. */
const CACHE = 'spacehub-pwa-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('/'))),
  );
});

// Web Push — the backend mirrors every in-app notification here as a real
// system push (see backend/src/lib/push.js). `data.target` carries the same
// shape as the in-app notification row so the client can deep-link on click.
// Admin-composed broadcasts (lib/notifications.js sendBroadcast) can also
// set image/actions/requireInteraction/silent/vibrate/tag/renotify — every
// field below is optional and simply omitted from `options` when absent.
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try { data = event.data.json(); } catch { data = { body: event.data.text() }; }
  }
  const title = data.title || 'SoftifyOS';
  const options = {
    body: data.body || '',
    // `icon` is the full-color logo shown in the notification body; `badge`
    // must be a transparent, monochrome (white-on-transparent) silhouette —
    // Android renders it from the alpha channel only, so reusing the opaque
    // colored icon here made the status-bar/collapsed icon show up blank.
    // The backend sends tenant-branded URLs (/api/branding/:tenantId/push-icon
    // and .../push-badge); these static paths are only a fallback for older
    // cached payloads that predate that change.
    icon: data.icon || '/app-icons/icon-192.png',
    badge: data.badge || '/app-icons/icon-badge.png',
    data: {
      target: data.target || null,
      notificationId: data.notificationId || null,
      actions: Array.isArray(data.actions) ? data.actions : [],
    },
  };
  // Large image shown inside the notification body (Chrome desktop/Android).
  if (data.image) options.image = data.image;
  // Up to 2 action buttons; each `action` id is matched back in
  // notificationclick below to find its own target URL.
  if (Array.isArray(data.actions) && data.actions.length) {
    options.actions = data.actions.slice(0, 2).map((a) => ({ action: a.action, title: a.title }));
  }
  // Keeps the notification on screen until the user dismisses/clicks it,
  // instead of auto-hiding after a few seconds.
  if (data.requireInteraction) options.requireInteraction = true;
  // No sound/vibration/visual alert — just appears in the notification tray.
  if (data.silent) options.silent = true;
  // Custom vibration pattern (ms on/off/on/…), ignored on platforms without
  // a vibration motor (e.g. desktop).
  if (Array.isArray(data.vibrate) && data.vibrate.length) options.vibrate = data.vibrate;
  // `tag` groups/replaces notifications sharing the same tag instead of
  // stacking a new one; `renotify` re-alerts (sound/vibrate) even when
  // replacing an existing notification with the same tag.
  if (data.tag) options.tag = data.tag;
  if (data.renotify) options.renotify = true;
  event.waitUntil(self.registration.showNotification(title, options));
});

// Fire-and-forget click analytics beacon — best-effort, never blocks
// focusing/opening the target window.
function reportClick(notificationId, action) {
  if (!notificationId) return;
  fetch('/api/push/click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notificationId, action: action || null }),
  }).catch(() => {});
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { target, notificationId, actions } = event.notification.data || {};
  reportClick(notificationId, event.action);
  // A click on one of the up-to-2 custom action buttons opens that
  // button's own URL instead of the notification's default target/deep-link.
  const clickedAction = event.action && Array.isArray(actions)
    ? actions.find((a) => a.action === event.action)
    : null;
  const actionUrl = clickedAction?.url || null;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      if (actionUrl) return self.clients.openWindow(actionUrl);
      for (const client of list) {
        if ('focus' in client) {
          client.postMessage({ type: 'spacehub:push-click', target: target || null });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
      return undefined;
    }),
  );
});
