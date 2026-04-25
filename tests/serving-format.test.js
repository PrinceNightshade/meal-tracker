// tests/serving-format.test.js — Portion-label rendering and OFF parsing.
//
// Regression coverage for the "170burrito" / "1serving" bugs:
//   * parseServingLabel must use the human-readable `serving_size` string
//     (e.g. "1 burrito (170g)"), not graft `serving_quantity` (170g) onto
//     just the first matched word ("burrito") of the label.
//   * formatServing must always insert a space between size and unit, and
//     drop the leading "1" when the unit is self-describing (e.g.
//     "16 fl oz bottle") so we never display "1 16 fl oz".

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import './setup.js';

import { parseServingLabel } from '../js/api.js';
import { formatServing } from '../js/ui.js';

describe('parseServingLabel (Open Food Facts label parser)', () => {
  test('parses "1 burrito (170g)" → size 1, unit keeps full descriptor', () => {
    assert.deepEqual(parseServingLabel('1 burrito (170g)', 170), {
      size: 1,
      unit: 'burrito (170g)',
    });
  });

  test('parses "1 pouch (90g)" — the bug from the user screenshot', () => {
    assert.deepEqual(parseServingLabel('1 pouch (90g)', 90), {
      size: 1,
      unit: 'pouch (90g)',
    });
  });

  test('parses "28 g" → size 28, unit "g"', () => {
    assert.deepEqual(parseServingLabel('28 g', 28), { size: 28, unit: 'g' });
  });

  test('parses decimal sizes ("5.5 oz")', () => {
    assert.deepEqual(parseServingLabel('5.5 oz', 156), { size: 5.5, unit: 'oz' });
  });

  test('handles comma decimals (European OFF data)', () => {
    assert.deepEqual(parseServingLabel('1,5 cup', null), { size: 1.5, unit: 'cup' });
  });

  test('label without a leading number → size 1, unit = full label', () => {
    assert.deepEqual(parseServingLabel('serving', null), { size: 1, unit: 'serving' });
  });

  test('empty label falls back to serving_quantity in grams', () => {
    assert.deepEqual(parseServingLabel('', 50), { size: 50, unit: 'g' });
    assert.deepEqual(parseServingLabel(null, 100), { size: 100, unit: 'g' });
  });

  test('empty label and no fallback qty → empty values', () => {
    assert.deepEqual(parseServingLabel('', null), { size: '', unit: '' });
  });
});

describe('formatServing (display label)', () => {
  test('inserts a space between size and unit (regression: "170burrito")', () => {
    assert.equal(formatServing({ servingSize: 170, servingUnit: 'burrito' }), '170 burrito');
    assert.equal(formatServing({ servingSize: 1, servingUnit: 'serving' }), '1 serving');
    assert.equal(formatServing({ servingSize: 90, servingUnit: 'pouch' }), '90 pouch');
  });

  test('preserves natural readings for measurement units', () => {
    assert.equal(formatServing({ servingSize: 8, servingUnit: 'fl oz' }), '8 fl oz');
    assert.equal(formatServing({ servingSize: 0.5, servingUnit: 'cup (58g)' }), '0.5 cup (58g)');
    assert.equal(formatServing({ servingSize: 100, servingUnit: 'g' }), '100 g');
  });

  test('drops leading "1" when unit already starts with a number', () => {
    // "Starbucks Latte (grande)" stored as size:1, unit:"16 fl oz" — display "16 fl oz", not "1 16 fl oz"
    assert.equal(formatServing({ servingSize: 1, servingUnit: '16 fl oz' }), '16 fl oz');
    assert.equal(formatServing({ servingSize: 1, servingUnit: '8.4 fl oz can' }), '8.4 fl oz can');
    assert.equal(formatServing({ servingSize: 1, servingUnit: '20 fl oz bottle' }), '20 fl oz bottle');
  });

  test('keeps the size when it isn\'t exactly 1', () => {
    // Don't drop the count for "2 16 fl oz bottles" or similar — only the implicit-1 case.
    assert.equal(formatServing({ servingSize: 2, servingUnit: '16 fl oz' }), '2 16 fl oz');
  });

  test('returns empty string for manual entries (no portion data)', () => {
    assert.equal(formatServing({ servingSize: '', servingUnit: '' }), '');
    assert.equal(formatServing({}), '');
  });

  test('handles size-only or unit-only gracefully', () => {
    assert.equal(formatServing({ servingSize: 100 }), '100');
    assert.equal(formatServing({ servingUnit: 'pinch' }), 'pinch');
  });
});
