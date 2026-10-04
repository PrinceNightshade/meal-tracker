// tests/api-satfat.test.js — saturated fat parsing from Open Food Facts (js/api.js lookupBarcode)
import { test, describe, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import './setup.js';
import { lookupBarcode } from '../js/api.js';

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

function mockOff(nutriments, extra = {}) {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ status: 1, product: { product_name: 'Test', brands: 'B', nutriments, ...extra } }),
  });
}

describe('lookupBarcode saturated fat', () => {
  test('reads hyphenated saturated-fat_serving (preferred)', async () => {
    mockOff({ 'energy-kcal_serving': 200, fat_serving: 12, 'saturated-fat_serving': 6.24, 'saturated-fat_100g': 9 }, { serving_size: '30 g', serving_quantity: 30 });
    const f = await lookupBarcode('123');
    assert.equal(f.saturatedFat, 6.2);
  });

  test('falls back to saturated-fat_100g when no per-serving data', async () => {
    mockOff({ 'energy-kcal_100g': 300, fat_100g: 20, 'saturated-fat_100g': 8.5 });
    const f = await lookupBarcode('123');
    assert.equal(f.saturatedFat, 8.5);
  });

  test('absent saturated fat stays unknown (no key), never 0', async () => {
    mockOff({ 'energy-kcal_100g': 300, fat_100g: 20 });
    const f = await lookupBarcode('123');
    assert.equal('saturatedFat' in f, false);
  });

  test('a reported 0 is kept as a known 0', async () => {
    mockOff({ 'energy-kcal_100g': 30, fat_100g: 0, 'saturated-fat_100g': 0 });
    const f = await lookupBarcode('123');
    assert.equal(f.saturatedFat, 0);
  });
});
