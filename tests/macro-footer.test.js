// tests/macro-footer.test.js — carbs/fat footer out-of-range logic (js/ui.js)
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import './setup.js';
import { getMacroFooterStatus, MACRO_FOOTER_THRESHOLD } from '../js/ui.js';

const goals = { carbs: 200, fat: 65 };

describe('getMacroFooterStatus', () => {
  test('threshold is 110%', () => {
    assert.equal(MACRO_FOOTER_THRESHOLD, 1.1);
  });

  test('in range: nothing flagged', () => {
    const s = getMacroFooterStatus({ carbs: 142, fat: 48 }, goals);
    assert.equal(s.carbsHigh, false);
    assert.equal(s.fatHigh, false);
  });

  test('exactly at goal * 1.1 is not flagged (strictly greater)', () => {
    const s = getMacroFooterStatus({ carbs: 220, fat: 71.5 }, goals);
    assert.equal(s.carbsHigh, false);
    assert.equal(s.fatHigh, false);
  });

  test('just over 110% flags the one that is high', () => {
    const s = getMacroFooterStatus({ carbs: 150, fat: 82 }, goals);
    assert.equal(s.carbsHigh, false);
    assert.equal(s.fatHigh, true);
  });

  test('both can be high', () => {
    const s = getMacroFooterStatus({ carbs: 260, fat: 90 }, goals);
    assert.equal(s.carbsHigh, true);
    assert.equal(s.fatHigh, true);
  });

  test('low carbs/fat is never flagged', () => {
    const s = getMacroFooterStatus({ carbs: 10, fat: 2 }, goals);
    assert.equal(s.carbsHigh, false);
    assert.equal(s.fatHigh, false);
  });

  test('empty totals / missing goals fall back to defaults without throwing', () => {
    const s = getMacroFooterStatus({}, {});
    assert.equal(s.carbsGoal, 200);
    assert.equal(s.fatGoal, 65);
    assert.equal(s.carbsHigh, false);
    assert.equal(s.fatHigh, false);
  });
});
