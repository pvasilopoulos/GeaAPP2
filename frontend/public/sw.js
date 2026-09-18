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
    icon: '/app-icons/icon-192.png',
    badge: '/app-icons/icon-badge.png',
    data: { target: data.target || null, notificationId: data.notificationId || null },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.target || null;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.postMessage({ type: 'spacehub:push-click', target });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
      return undefined;
    }),
  );
});
