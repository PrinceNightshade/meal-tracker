// Service Worker — Meal Tracker
const CACHE = 'meal-tracker-v62';
// Every file the app needs to boot. app.js statically imports most of js/, so a
// module missing here can leave the app blank offline right after an update
// (the old cache is deleted on activate). Keep this in sync with js/ — the
// "SW precache covers every module" test enforces it. A path that 404s makes
// cache.addAll() reject and the SW never installs, so list only real files.
const ASSETS = [
  '/meal-tracker/',
  '/meal-tracker/index.html',
  '/meal-tracker/css/style.css',
  '/meal-tracker/manifest.json',
  '/meal-tracker/icons/icon-192.png',
  '/meal-tracker/js/pulse-theme.js',
  '/meal-tracker/js/app.js',
  '/meal-tracker/js/store.js',
  '/meal-tracker/js/api.js',
  '/meal-tracker/js/common-foods.js',
  '/meal-tracker/js/ui.js',
  '/meal-tracker/js/analytics.js',
  '/meal-tracker/js/ui-analytics.js',
  '/meal-tracker/js/opportunity.js',
  '/meal-tracker/js/wellness.js',
  '/meal-tracker/js/firebase.js',
  '/meal-tracker/js/sw-manager.js',
  '/meal-tracker/js/usage.js',
  '/meal-tracker/js/gestures.js',
  '/meal-tracker/js/errorlog.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  // Don't skip waiting here - let the user explicitly update via the banner
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
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

  // Network-first for HTML (always get fresh index.html so SW updates propagate)
  const isHTML = e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html');

  if (isHTML) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for everything else (JS, CSS, images)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && e.request.url.startsWith(self.location.origin)) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
