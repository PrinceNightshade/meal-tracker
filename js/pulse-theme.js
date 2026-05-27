// ─────────────────────────────────────────────────────────────────────────
// Pulse accent + theme — drop-in script for the meal-tracker PWA.
//
// Add to <head> BEFORE css/style.css to avoid a flash. The early call to
// applyAccent() / applyTheme() reads from localStorage and sets the
// :root CSS variables before first paint.
//
// Also exports renderAccentPicker(container) — call this from the profile
// sheet renderer to mount the 6-swatch picker.
// ─────────────────────────────────────────────────────────────────────────

(function () {
  const ACCENTS = [
    { name: 'Lime',    hex: '#C8FF3D' },
    { name: 'Cyan',    hex: '#5BE9F0' },
    { name: 'Magenta', hex: '#FF6BE5' },
    { name: 'Amber',   hex: '#FFB547' },
    { name: 'Purple',  hex: '#A78BFA' },
    { name: 'Mint',    hex: '#7DE07A' },
  ];

  function applyAccent(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h, 16);
    const r = (n >> 16) & 255;
    const g = (n >>  8) & 255;
    const b =  n        & 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const root = document.documentElement;
    root.style.setProperty('--accent', hex);
    root.style.setProperty('--accent-rgb', r + ',' + g + ',' + b);
    root.style.setProperty('--accent-ink', lum > 160 ? '#0A0A0A' : '#FFFFFF');
  }

  function applyTheme(mode) {
    // mode: 'light' | 'dark' | 'auto' (= '' in storage)
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    if (mode === 'light' || mode === 'dark') root.classList.add(mode);
    localStorage.setItem('mt_theme', mode === 'auto' ? '' : mode);
  }

  function renderAccentPicker(container) {
    const current = (localStorage.getItem('mt_accent') || '#C8FF3D').toLowerCase();
    container.innerHTML = ACCENTS.map(function (a) {
      const on = a.hex.toLowerCase() === current;
      return (
        '<button class="accent-swatch" data-hex="' + a.hex + '" ' +
                'aria-pressed="' + on + '" type="button">' +
          '<span class="dot" style="background:' + a.hex + ';color:' + a.hex + '"></span>' +
          '<small>' + a.name.toUpperCase() + '</small>' +
        '</button>'
      );
    }).join('');

    container.addEventListener('click', function (e) {
      const btn = e.target.closest('.accent-swatch');
      if (!btn) return;
      const hex = btn.dataset.hex;
      applyAccent(hex);
      localStorage.setItem('mt_accent', hex);
      // Update the manifest theme color too so the iOS status bar
      // overlay (in standalone PWA mode) matches the new accent.
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', hex);
      // Toggle pressed state across swatches
      container.querySelectorAll('.accent-swatch').forEach(function (b) {
        b.setAttribute(
          'aria-pressed',
          b.dataset.hex.toLowerCase() === hex.toLowerCase()
        );
      });
    });
  }

  function renderThemeToggle(container) {
    const stored = localStorage.getItem('mt_theme') || 'auto';
    const modes = ['Light', 'Dark', 'Auto'];
    container.innerHTML = (
      '<div class="toggle-group" role="radiogroup" aria-label="Theme">' +
        modes.map(function (m) {
          const k = m.toLowerCase();
          const on = (k === stored) || (k === 'auto' && stored === '');
          return (
            '<button class="toggle-btn ' + (on ? 'active' : '') + '" ' +
                    'data-mode="' + k + '" type="button" ' +
                    'aria-pressed="' + on + '">' + m + '</button>'
          );
        }).join('') +
      '</div>'
    );
    container.addEventListener('click', function (e) {
      const btn = e.target.closest('.toggle-btn');
      if (!btn) return;
      applyTheme(btn.dataset.mode);
      container.querySelectorAll('.toggle-btn').forEach(function (b) {
        const on = b.dataset.mode === btn.dataset.mode;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on);
      });
    });
  }

  // Apply persisted choices on load (call before first paint).
  const storedTheme  = localStorage.getItem('mt_theme');
  const storedAccent = localStorage.getItem('mt_accent');
  if (storedTheme === 'light' || storedTheme === 'dark') {
    document.documentElement.classList.add(storedTheme);
  }
  if (storedAccent) applyAccent(storedAccent);

  // Public API
  window.Pulse = {
    applyAccent: applyAccent,
    applyTheme: applyTheme,
    renderAccentPicker: renderAccentPicker,
    renderThemeToggle: renderThemeToggle,
    ACCENTS: ACCENTS,
  };
})();
