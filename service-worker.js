const CACHE_NAME = 'expense-app-cache-v2';
const urlsToCache = [
  './',
  './index.html',
  './assets/css/style.css',
  './assets/js/app.js',
  './assets/js/router.js',
  './assets/js/security.js',
  './favicon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Force the new service worker to take over immediately
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName); // Delete v1 cache
          }
        })
      );
    }).then(() => self.clients.claim()) // Force all open tabs to use the new version
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return; // Ignore chrome-extension:// and other non-http requests
  if (event.request.url.includes('api.github.com')) return;
  
  // Stale-While-Revalidate Strategy (Great for high-frequency updates)
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(response => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        }).catch(() => {});
        return response || fetchPromise;
      });
    })
  );
});
