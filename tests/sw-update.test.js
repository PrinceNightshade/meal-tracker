// tests/sw-update.test.js — Tests for Service Worker update detection and banner
// Tests import from sw-manager.js so they test the real code, not re-implementations.
import { test, describe, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import './setup.js';
import { showUpdateBanner, initSW } from '../js/sw-manager.js';

// ── Helpers ──

function createMockBanner() {
  const showCalls = [];
  const removeCalls = [];
  return {
    classList: {
      add: (cls) => showCalls.push(cls),
      remove: (cls) => removeCalls.push(cls),
    },
    dataset: {},
    _showCalls: showCalls,
    _removeCalls: removeCalls,
  };
}

function createMockBtn() {
  const listeners = {};
  return {
    addEventListener: (event, handler) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    _listeners: listeners,
  };
}

function createMockWorker() {
  const messages = [];
  return {
    postMessage: (msg) => messages.push(msg),
    state: 'installed',
    addEventListener: () => {},
    _messages: messages,
  };
}

function createMockRegistration(options = {}) {
  const listeners = {};
  return {
    waiting: options.waiting || null,
    installing: options.installing || null,
    active: options.active || createMockWorker(),
    addEventListener: (event, handler) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    update: () => {},
    _listeners: listeners,
  };
}

function mockQuerySelector(banner, btn) {
  return (sel) => {
    if (sel === '#update-banner') return banner;
    if (sel === '#update-banner-btn') return btn;
    return null;
  };
}

// ── Tests ──

describe('showUpdateBanner', () => {
  test('adds "show" class to banner element', () => {
    const banner = createMockBanner();
    const btn = createMockBtn();
    const worker = createMockWorker();
    const $ = mockQuerySelector(banner, btn);

    showUpdateBanner(worker, $);

    assert.deepEqual(banner._showCalls, ['show'], 'Banner should have "show" class added');
  });

  test('only adds click listener once across multiple calls', () => {
    const banner = createMockBanner();
    const btn = createMockBtn();
    const worker = createMockWorker();
    const $ = mockQuerySelector(banner, btn);

    showUpdateBanner(worker, $);
    showUpdateBanner(worker, $);
    showUpdateBanner(worker, $);

    assert.equal(
      (btn._listeners.click || []).length,
      1,
      'Click listener should only be added once'
    );
  });

  test('click handler sends SKIP_WAITING message to worker', () => {
    const banner = createMockBanner();
    const btn = createMockBtn();
    const worker = createMockWorker();
    const $ = mockQuerySelector(banner, btn);

    // Mock location.reload to prevent errors
    const origLocation = global.location;
    global.location = { reload: () => {} };

    showUpdateBanner(worker, $);
    // Trigger the click handler
    btn._listeners.click[0]();

    assert.deepEqual(worker._messages, [{ type: 'SKIP_WAITING' }]);

    global.location = origLocation;
  });

  test('does nothing if banner element is null', () => {
    const worker = createMockWorker();
    const $ = () => null;
    // Should not throw
    showUpdateBanner(worker, $);
  });
});

describe('initSW', () => {
  // Prevent real setInterval from keeping Node.js alive across all initSW tests
  const origSetInterval = global.setInterval;
  global.setInterval = (fn, duration) => 0;

  test('detects already-waiting Service Worker and shows banner', async () => {
    const banner = createMockBanner();
    const btn = createMockBtn();
    const $ = mockQuerySelector(banner, btn);
    const waitingWorker = createMockWorker();
    const registration = createMockRegistration({ waiting: waitingWorker });

    global.navigator = {
      serviceWorker: {
        register: () => Promise.resolve(registration),
        ready: Promise.resolve(registration),
        controller: true,
      },
    };

    initSW($);

    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(banner._showCalls, ['show'], 'Should show banner when waiting SW exists');
  });

  test('registers Service Worker at correct path', async () => {
    let registeredPath = null;
    const registration = createMockRegistration();

    global.navigator = {
      serviceWorker: {
        register: (path, opts) => {
          registeredPath = path;
          return Promise.resolve(registration);
        },
        ready: Promise.resolve(registration),
      },
    };

    const $ = mockQuerySelector(createMockBanner(), createMockBtn());
    initSW($);

    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(registeredPath, '/meal-tracker/sw.js');
  });

  test('handles registration errors gracefully', async () => {
    let errorLogged = false;
    const origError = console.error;
    console.error = (...args) => {
      if (String(args[0]).includes('Service Worker registration failed')) {
        errorLogged = true;
      }
    };

    global.navigator = {
      serviceWorker: {
        register: () => Promise.reject(new Error('Registration failed')),
      },
    };

    const $ = mockQuerySelector(createMockBanner(), createMockBtn());
    initSW($);

    await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(errorLogged, 'Should log error on registration failure');

    console.error = origError;
  });

  test('sets up periodic update check', async () => {
    let intervalDuration = 0;
    const origSetInterval = global.setInterval;
    // Mock setInterval BEFORE calling initSW so the real interval is never created
    global.setInterval = (fn, duration) => {
      intervalDuration = duration;
      return 0; // return a numeric ID so clearInterval doesn't error
    };

    const registration = createMockRegistration();
    global.navigator = {
      serviceWorker: {
        register: () => Promise.resolve(registration),
        ready: Promise.resolve(registration),
      },
    };

    const $ = mockQuerySelector(createMockBanner(), createMockBtn());
    initSW($);

    await new Promise(resolve => setTimeout(resolve, 20));
    global.setInterval = origSetInterval; // restore before asserting
    assert.equal(intervalDuration, 60000, 'Should check for updates every 60 seconds');
  });

  test('does nothing when serviceWorker not in navigator', () => {
    global.navigator = {};
    const $ = mockQuerySelector(createMockBanner(), createMockBtn());
    // Should not throw
    initSW($);
  });

  // Restore after all initSW tests
  global.setInterval = origSetInterval;
});
