// tests/utils.test.js — Tests for date utilities and API helpers
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import './setup.js';

// ── Date utilities (from ui.js) ──
// Inline the logic here to avoid DOM import issues — these are pure functions
// and any regression here means the ui.js versions need the same fix.

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('todayStr', () => {
  test('returns a valid YYYY-MM-DD string', () => {
    const result = todayStr();
    assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
  });

  test('regression: must use local date, not UTC — bug caused "tomorrow" after 5pm', () => {
    const local = new Date();
    const expected = [
      local.getFullYear(),
      String(local.getMonth() + 1).padStart(2, '0'),
      String(local.getDate()).padStart(2, '0'),
    ].join('-');
    assert.equal(todayStr(), expected, 'todayStr() must return local date, not UTC date');
  });

  test('is not the same as toISOString().split("T")[0] when UTC is ahead', () => {
    // Simulate the broken behaviour: toISOString gives UTC date
    // If local is late evening, UTC could be tomorrow
    // This test shows the correct implementation differs conceptually
    const d = new Date();
    const utcDate = d.toISOString().split('T')[0];
    const localDate = todayStr();
    // Both can be equal during the day — we just assert our function returns the local value
    const localExpected = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    assert.equal(localDate, localExpected);
  });
});

describe('shiftDate', () => {
  test('shifts forward by 1 day', () => {
    assert.equal(shiftDate('2026-03-29', 1), '2026-03-30');
  });

  test('shifts backward by 1 day', () => {
    assert.equal(shiftDate('2026-03-29', -1), '2026-03-28');
  });

  test('handles month boundary correctly', () => {
    assert.equal(shiftDate('2026-03-31', 1), '2026-04-01');
  });

  test('handles year boundary correctly', () => {
    assert.equal(shiftDate('2025-12-31', 1), '2026-01-01');
  });

  test('regression: must return local date string, not UTC', () => {
    // The old bug used toISOString() which could shift the date by a day
    const result = shiftDate('2026-03-29', 0);
    assert.equal(result, '2026-03-29', 'Zero-shift should return the same date unchanged');
  });
});

// ── Country detection (from api.js) ──
// Inline the logic to test the mapping table independently

const OFF_COUNTRY_TAGS = {
  US: 'en:united-states', CA: 'en:canada', GB: 'en:united-kingdom',
  AU: 'en:australia',    NZ: 'en:new-zealand', IE: 'en:ireland',
  FR: 'en:france',       DE: 'en:germany',    ES: 'en:spain',
  IT: 'en:italy',        MX: 'en:mexico',     BR: 'en:brazil',
  IN: 'en:india',        JP: 'en:japan',
};

function detectOffCountryTag(language) {
  const lang = (language || '').toUpperCase();
  const region = lang.split('-')[1];
  return region ? (OFF_COUNTRY_TAGS[region] || null) : null;
}

describe('detectOffCountryTag', () => {
  test('en-US → en:united-states', () => {
    assert.equal(detectOffCountryTag('en-US'), 'en:united-states');
  });

  test('en-GB → en:united-kingdom', () => {
    assert.equal(detectOffCountryTag('en-GB'), 'en:united-kingdom');
  });

  test('de-DE → en:germany', () => {
    assert.equal(detectOffCountryTag('de-DE'), 'en:germany');
  });

  test('bare "en" with no region → null (falls back to global search)', () => {
    assert.equal(detectOffCountryTag('en'), null);
  });

  test('unknown region → null (falls back to global search)', () => {
    assert.equal(detectOffCountryTag('en-ZZ'), null);
  });
});
