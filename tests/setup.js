// tests/setup.js — Browser API mocks for Node test environment
//
// Node.js v22 made several browser-like globals (crypto, navigator, window, etc.)
// read-only getters. Use Object.defineProperty for all of them to avoid
// "Cannot set property X of #<Object> which has only a getter" errors.

const _storage = {};

function defineGlobal(name, value) {
  Object.defineProperty(global, name, { value, writable: true, configurable: true });
}

defineGlobal('localStorage', {
  getItem:    k     => Object.prototype.hasOwnProperty.call(_storage, k) ? _storage[k] : null,
  setItem:    (k,v) => { _storage[k] = String(v); },
  removeItem: k     => { delete _storage[k]; },
  clear:      ()    => { Object.keys(_storage).forEach(k => delete _storage[k]); },
});

defineGlobal('crypto', {
  randomUUID: () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
});

// Minimal DOM stub so ui.js can be imported without crashing
defineGlobal('document', {
  createElement: () => ({
    setAttribute: () => {}, addEventListener: () => {},
    appendChild: () => {}, classList: { toggle: () => false, add: () => {}, remove: () => {} },
    style: {}, dataset: {}, children: [],
  }),
});

defineGlobal('window', { matchMedia: () => ({ matches: false }) });
defineGlobal('navigator', { language: 'en-US', languages: ['en-US'] });

export function resetStorage() {
  Object.keys(_storage).forEach(k => delete _storage[k]);
}
