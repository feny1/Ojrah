const CACHE_NAME = 'ojrah-win-v3';
const ASSETS = [
  './',
  './index.html',
  './summary.html',
  './purchases.html',
  './vouchers.html',
  './drivers.html',
  './driver-details.html',
  './cars.html',
  './car-details.html',
  './contracts.html',
  './violations.html',
  './maintenance.html',
  './settings.html',
  './driver-vouchers-print.html',
  './invoice-print.html',
  './voucher-print.html',
  './invoices.html',
  './debts.html',
  './update.html',
  './js/db.js',
  './js/tailwind.js',
  './css/style.css',
  './manifest.json',
  './tauri.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Only handle local/http requests
  const url = e.request.url;
  if (!url.startsWith('http') && !url.startsWith(self.location.origin)) {
    return;
  }

  // Do not intercept API mock endpoints
  if (url.includes('/api/')) {
    return;
  }

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((response) => {
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return response;
      }).catch(() => {
        // Offline fallback
      });
    })
  );
});
