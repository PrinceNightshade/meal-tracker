// Service Worker — Meal Tracker
const CACHE = 'meal-tracker-v7';
const ASSETS = [
  '/meal-tracker/',
  '/meal-tracker/index.html',
  '/meal-tracker/css/style.css',
  '/meal-tracker/js/app.js',
  '/meal-tracker/js/store.js',
  '/meal-tracker/js/api.js',
  '/meal-tracker/js/ui.js',
  '/meal-tracker/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network first for API calls, cache first for app shell
  const url = new URL(e.request.url);
  const isAPI = url.hostname.includes('usda') ||
                url.hostname.includes('openfoodfacts');

  if (isAPI) {
    // Network only for external APIs — don't cache food search results
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // Cache new app shell files on the fly
        if (res.ok && e.request.url.startsWith(self.location.origin)) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
