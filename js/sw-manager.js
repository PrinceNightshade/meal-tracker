// sw-manager.js — Service Worker registration, update detection, and banner logic
//
// Extracted from app.js to make the logic testable.

export function showUpdateBanner(worker, querySelector) {
  const $ = querySelector || (sel => document.querySelector(sel));
  const banner = $('#update-banner');
  const btn = $('#update-banner-btn');

  if (!banner || !btn) return;

  // Only add listener once - check if already added
  if (!banner.dataset.listenerAdded) {
    banner.dataset.listenerAdded = 'true';
    btn.addEventListener('click', () => {
      // Tell the waiting SW to take over, then reload to pick up new assets
      worker.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(() => location.reload(), 250);
    });
  }

  banner.classList.add('show');
}

export function initSW(querySelector) {
  if (!('serviceWorker' in navigator)) return;

  const $ = querySelector || (sel => document.querySelector(sel));

  // Register the service worker
  navigator.serviceWorker.register('/meal-tracker/sw.js', { updateViaCache: 'none' })
    .then(reg => {
      // Check if there's already a waiting SW
      if (reg.waiting) {
        showUpdateBanner(reg.waiting, $);
      }

      // Listen for updates
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          // Show banner when new SW is installed and ready
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(newWorker, $);
          }
        });
      });

      // Periodically check for updates
      setInterval(() => {
        reg.update();
      }, 60000); // Check every minute
    })
    .catch(err => console.error('Service Worker registration failed:', err));
}
