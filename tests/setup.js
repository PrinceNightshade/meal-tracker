// tests/setup.js — Browser API mocks for Node test environment

const _storage = {};
global.localStorage = {
  getItem:    k     => Object.prototype.hasOwnProperty.call(_storage, k) ? _storage[k] : null,
  setItem:    (k,v) => { _storage[k] = String(v); },
  removeItem: k     => { delete _storage[k]; },
  clear:      ()    => { Object.keys(_storage).forEach(k => delete _storage[k]); },
};

global.crypto = {
  randomUUID: () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
};

// Minimal DOM stub so ui.js can be imported without crashing
global.document = {
  createElement: () => ({
    setAttribute: () => {}, addEventListener: () => {},
    appendChild: () => {}, classList: { toggle: () => false, add: () => {}, remove: () => {} },
    style: {}, dataset: {}, children: [],
  }),
};
global.window = { matchMedia: () => ({ matches: false }) };
global.navigator = { language: 'en-US', languages: ['en-US'] };

export function resetStorage() {
  Object.keys(_storage).forEach(k => delete _storage[k]);
}
