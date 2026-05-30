/**
 * Aentho Service Worker v2
 * Offline-first caching with stale-while-revalidate strategy.
 */

const STATIC  = 'aentho-static-v2';
const DYNAMIC = 'aentho-dynamic-v2';

const PRECACHE = [
  './', './index.html', './login.html', './signup.html', './dashboard.html',
  './manifest.json',
  './styles/main.css', './styles/auth.css', './styles/dashboard.css',
  './scripts/ui.js', './scripts/db.js', './scripts/auth.js', './scripts/sync.js',
  './scripts/app.js', './scripts/dashboard.js', './scripts/sales.js',
  './scripts/inventory.js', './scripts/expenses.js', './scripts/analytics.js',
  './scripts/reports.js', './scripts/notifications.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC).then(c => c.addAll(PRECACHE).catch(err => console.warn('[SW] precache partial fail', err)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== STATIC && k !== DYNAMIC).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  // Don't intercept Firebase API calls
  if (['firestore.googleapis.com','identitytoolkit.googleapis.com',
       'securetoken.googleapis.com','firebaseapp.com'].some(h => url.hostname.includes(h))) return;

  e.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request).then(res => {
        if (res?.status === 200) {
          caches.open(DYNAMIC).then(c => c.put(request, res.clone()));
        }
        return res;
      }).catch(() => null);
      return cached || networkFetch || (
        request.headers.get('accept')?.includes('text/html') ? caches.match('./dashboard.html') : null
      );
    })
  );
});

self.addEventListener('sync', e => {
  if (e.tag === 'aentho-sync') {
    e.waitUntil(self.clients.matchAll().then(cs => cs.forEach(c => c.postMessage({ type: 'SYNC_REQUESTED' }))));
  }
});

self.addEventListener('push', e => {
  if (!e.data) return;
  const d = e.data.json();
  e.waitUntil(self.registration.showNotification(d.title||'Aentho', {
    body: d.body, icon: './assets/icons/icon-192.png', badge: './assets/icons/icon-72.png',
    vibrate: [100,50,100], data: { url: d.url||'./' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url));
});
