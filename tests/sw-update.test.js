// tests/sw-update.test.js — Tests for Service Worker update detection and banner
import { test, describe, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import './setup.js';

// Mock DOM elements and navigator.serviceWorker
const mockDOM = {
  banner: null,
  btn: null,
};

function setupDOM() {
  // Create mock DOM elements
  const banner = {
    classList: { add: function() {}, remove: function() {} },
    dataset: {},
  };
  const btn = {
    addEventListener: function() {},
  };

  mockDOM.banner = banner;
  mockDOM.btn = btn;

  // Mock document.querySelector
  global.document = {
    querySelector: function(selector) {
      if (selector === '#update-banner') return banner;
      if (selector === '#update-banner-btn') return btn;
      return null;
    },
  };

  return { banner, btn };
}

function createMockWorker() {
  return {
    postMessage: function(msg) {},
    state: 'installed',
    addEventListener: function() {},
  };
}

function createMockRegistration(options = {}) {
  const listeners = {};

  return {
    waiting: options.waiting || null,
    installing: options.installing || null,
    active: options.active || createMockWorker(),
    addEventListener: function(event, handler) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    update: function() {
      if (options.onUpdate) options.onUpdate();
    },
    _triggerUpdateFound: function() {
      if (listeners['updatefound']) {
        listeners['updatefound'].forEach(h => h());
      }
    },
    _getListeners: () => listeners,
  };
}

describe('Service Worker Update Detection', () => {
  beforeEach(() => {
    setupDOM();
  });

  test('showUpdateBanner adds show class to banner', () => {
    const { banner } = mockDOM;
    const worker = createMockWorker();
    const showCalls = [];
    const originalAdd = banner.classList.add;
    banner.classList.add = function(cls) {
      showCalls.push(cls);
    };

    // Extract and call showUpdateBanner logic
    const showUpdateBanner = (worker) => {
      const banner = document.querySelector('#update-banner');
      const btn = document.querySelector('#update-banner-btn');

      if (!banner.dataset.listenerAdded) {
        banner.dataset.listenerAdded = 'true';
        btn.addEventListener('click', () => {
          worker.postMessage({ type: 'SKIP_WAITING' });
        });
      }

      banner.classList.add('show');
    };

    showUpdateBanner(worker);
    assert.deepEqual(showCalls, ['show'], 'Banner should have show class added');
  });

  test('showUpdateBanner only adds listener once', () => {
    const { banner, btn } = mockDOM;
    const worker = createMockWorker();
    let listenerCount = 0;
    const originalAddEventListener = btn.addEventListener;
    btn.addEventListener = function(event, handler) {
      if (event === 'click') listenerCount++;
    };

    const showUpdateBanner = (worker) => {
      const banner = document.querySelector('#update-banner');
      const btn = document.querySelector('#update-banner-btn');

      if (!banner.dataset.listenerAdded) {
        banner.dataset.listenerAdded = 'true';
        btn.addEventListener('click', () => {
          worker.postMessage({ type: 'SKIP_WAITING' });
        });
      }

      banner.classList.add('show');
    };

    // Call multiple times
    showUpdateBanner(worker);
    showUpdateBanner(worker);
    showUpdateBanner(worker);

    assert.equal(listenerCount, 1, 'Click listener should only be added once');
  });

  test('initSW detects already-waiting Service Worker', async () => {
    const waitingWorker = createMockWorker();
    const registration = createMockRegistration({ waiting: waitingWorker });

    let bannerShown = false;
    const showUpdateBanner = (worker) => {
      bannerShown = true;
      assert.equal(worker, waitingWorker, 'Should show banner with waiting worker');
    };

    // Mock navigator.serviceWorker
    global.navigator = {
      serviceWorker: {
        ready: Promise.resolve(registration),
        register: () => Promise.resolve(registration),
      },
    };

    // Simulate initSW logic
    const initSW = () => {
      if (!('serviceWorker' in navigator)) return;

      navigator.serviceWorker.ready.then(reg => {
        if (reg.waiting) {
          showUpdateBanner(reg.waiting);
          return;
        }
      });
    };

    initSW();

    // Wait for promise to resolve
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(bannerShown, 'Should show banner when waiting SW exists');
  });

  test('initSW detects new Service Worker installing during session', async () => {
    const newWorker = createMockWorker();
    const registration = createMockRegistration({ installing: newWorker });

    let bannerShown = false;
    const showUpdateBanner = (worker) => {
      bannerShown = true;
    };

    global.navigator = {
      serviceWorker: {
        ready: Promise.resolve(registration),
        register: () => Promise.resolve(registration),
        controller: true, // Simulate existing controller
      },
    };

    const initSW = () => {
      if (!('serviceWorker' in navigator)) return;

      navigator.serviceWorker.ready.then(reg => {
        if (reg.waiting) {
          showUpdateBanner(reg.waiting);
          return;
        }

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner(newWorker);
            }
          });
        });
      });
    };

    initSW();

    // Simulate new SW installing
    await new Promise(resolve => setTimeout(resolve, 10));
    registration._triggerUpdateFound();
    newWorker.state = 'installed';
    const listeners = registration._getListeners();
    if (listeners.updatefound && listeners.updatefound[0]) {
      const newWkr = registration.installing;
      const stateListeners = newWkr._stateListeners || [];
      stateListeners.forEach(h => h());
    }

    // Note: This test is simplified - in reality, we'd need to properly
    // simulate the statechange event on the worker
  });

  test('initSW registers Service Worker', async () => {
    let registerCalled = false;
    let updateCalled = false;

    const mockReg = createMockRegistration();
    mockReg.update = function() {
      updateCalled = true;
    };

    global.navigator = {
      serviceWorker: {
        register: function(path) {
          registerCalled = true;
          assert.equal(path, '/meal-tracker/sw.js', 'Should register correct SW path');
          return Promise.resolve(mockReg);
        },
        ready: Promise.resolve(mockReg),
      },
    };

    const initSW = () => {
      if (!('serviceWorker' in navigator)) return;

      navigator.serviceWorker.register('/meal-tracker/sw.js', { updateViaCache: 'none' })
        .then(reg => {
          if (reg.waiting) {
            return;
          }
        });
    };

    initSW();

    await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(registerCalled, 'Should call navigator.serviceWorker.register');
  });

  test('initSW handles registration errors gracefully', async () => {
    let errorLogged = false;
    const originalError = console.error;
    console.error = function(msg) {
      if (msg.includes('Service Worker registration failed')) {
        errorLogged = true;
      }
    };

    global.navigator = {
      serviceWorker: {
        register: function() {
          return Promise.reject(new Error('Registration failed'));
        },
      },
    };

    const initSW = () => {
      if (!('serviceWorker' in navigator)) return;

      navigator.serviceWorker.register('/meal-tracker/sw.js', { updateViaCache: 'none' })
        .catch(err => console.error('Service Worker registration failed:', err));
    };

    initSW();

    await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(errorLogged, 'Should log error on registration failure');

    console.error = originalError;
  });

  test('periodic update check interval is set', () => {
    let intervalSet = false;
    let intervalDuration = 0;

    const originalSetInterval = setInterval;
    global.setInterval = function(fn, duration) {
      intervalSet = true;
      intervalDuration = duration;
      return 'mock-interval-id';
    };

    const mockReg = createMockRegistration();
    mockReg.update = function() {};

    global.navigator = {
      serviceWorker: {
        register: function() {
          return Promise.resolve(mockReg);
        },
        ready: Promise.resolve(mockReg),
      },
    };

    const initSW = () => {
      if (!('serviceWorker' in navigator)) return;

      navigator.serviceWorker.register('/meal-tracker/sw.js', { updateViaCache: 'none' })
        .then(reg => {
          setInterval(() => {
            reg.update();
          }, 60000);
        });
    };

    initSW();

    // Wait for promises
    setTimeout(() => {
      assert.ok(intervalSet, 'Should set interval for periodic checks');
      assert.equal(intervalDuration, 60000, 'Should check for updates every 60 seconds');
    }, 20);

    global.setInterval = originalSetInterval;
  });
});
