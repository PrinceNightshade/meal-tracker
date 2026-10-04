// tests/macro-footer.test.js — carbs / saturated-fat footer logic + bloom class (js/ui.js)
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import './setup.js';
import { getMacroFooterStatus, getMacroFooterText, getMacroCardClass, MACRO_FOOTER_THRESHOLD } from '../js/ui.js';

const goals = { carbs: 200, fat: 65, satFatGoal: 20 };

describe('getMacroFooterStatus', () => {
  test('threshold is 110%', () => {
    assert.equal(MACRO_FOOTER_THRESHOLD, 1.1);
  });

  test('in range: nothing flagged', () => {
    const s = getMacroFooterStatus({ carbs: 142, fat: 48, saturatedFat: 12 }, goals);
    assert.equal(s.carbsHigh, false);
    assert.equal(s.satFatHigh, false);
  });

  test('exactly at goal * 1.1 is not flagged (strictly greater)', () => {
    const s = getMacroFooterStatus({ carbs: 220, fat: 40, saturatedFat: 22 }, goals);
    assert.equal(s.carbsHigh, false);
    assert.equal(s.satFatHigh, false);
  });

  test('just over 110% of the sat-fat limit flags saturated fat', () => {
    const s = getMacroFooterStatus({ carbs: 150, fat: 40, saturatedFat: 22.5 }, goals);
    assert.equal(s.carbsHigh, false);
    assert.equal(s.satFatHigh, true);
  });

  test('TOTAL fat no longer drives the alert (only saturated fat does)', () => {
    const s = getMacroFooterStatus({ carbs: 150, fat: 120, saturatedFat: 8 }, goals);
    assert.equal(s.satFatHigh, false);
    assert.equal('fatHigh' in s, false);
  });

  test('both can be high', () => {
    const s = getMacroFooterStatus({ carbs: 260, fat: 90, saturatedFat: 30 }, goals);
    assert.equal(s.carbsHigh, true);
    assert.equal(s.satFatHigh, true);
  });

  test('low carbs/sat fat is never flagged', () => {
    const s = getMacroFooterStatus({ carbs: 10, fat: 2, saturatedFat: 0.5 }, goals);
    assert.equal(s.carbsHigh, false);
    assert.equal(s.satFatHigh, false);
  });

  test('unknown sat fat (no saturatedFat on totals) never alarms', () => {
    const s = getMacroFooterStatus({ carbs: 100, fat: 90, satFatIncomplete: true }, goals);
    assert.equal(s.satFatHigh, false);
  });

  test('empty totals / missing goals fall back to defaults without throwing', () => {
    const s = getMacroFooterStatus({}, {});
    assert.equal(s.carbsGoal, 200);
    assert.equal(s.fatGoal, 65);
    assert.equal(s.satFatGoal, 20);
    assert.equal(s.carbsHigh, false);
    assert.equal(s.satFatHigh, false);
  });
});

describe('getMacroFooterText', () => {
  test('calm in-range line shows total carbs and total fat', () => {
    const t = getMacroFooterText({ carbs: 142, fat: 48, saturatedFat: 12 }, goals);
    assert.match(t, /Carbs 142g/);
    assert.match(t, /Fat 48g/);
    assert.match(t, /in range/);
  });

  test('sat-fat-only alert copy', () => {
    const t = getMacroFooterText({ carbs: 150, fat: 60, saturatedFat: 24 }, goals);
    assert.equal(t, 'Saturated fat running high — 24g vs 20g limit. Carbs are fine.');
  });

  test('carbs-only alert copy', () => {
    const t = getMacroFooterText({ carbs: 260, fat: 40, saturatedFat: 10 }, goals);
    assert.equal(t, 'Carbs running high — 260g vs 200g target. Saturated fat is fine.');
  });

  test('combined alert copy', () => {
    const t = getMacroFooterText({ carbs: 260, fat: 90, saturatedFat: 30 }, goals);
    assert.equal(t, 'Carbs and saturated fat running high — 260g vs 200g carbs, 30g vs 20g saturated fat limit.');
  });

  test('incomplete sat fat that is already over says "at least"', () => {
    const t = getMacroFooterText({ carbs: 150, fat: 60, saturatedFat: 24, satFatIncomplete: true }, goals);
    assert.match(t, /at least 24g vs 20g limit/);
  });

  test('incomplete sat fat under the limit does not claim "in range" or "fine"', () => {
    const calm = getMacroFooterText({ carbs: 150, fat: 60, saturatedFat: 5, satFatIncomplete: true }, goals);
    assert.equal(calm, 'Carbs 150g · Fat 60g');
    const carbsHigh = getMacroFooterText({ carbs: 260, fat: 60, saturatedFat: 5, satFatIncomplete: true }, goals);
    assert.doesNotMatch(carbsHigh, /Saturated fat is fine/);
  });

  test('empty day', () => {
    assert.equal(getMacroFooterText({}, {}), 'Carbs 0g · Fat 0g');
  });
});

describe('getMacroCardClass (bloom-at-goal)', () => {
  test('build-toward card blooms at exactly goal and above', () => {
    assert.match(getMacroCardClass(150, 150, false, { overIsFine: true }), /macro-card--bloom/);
    assert.match(getMacroCardClass(190, 150, false, { overIsFine: true }), /macro-card--bloom/);
  });

  test('build-toward card does not bloom below goal or with no goal', () => {
    assert.doesNotMatch(getMacroCardClass(149, 150, false, { overIsFine: true }), /bloom/);
    assert.doesNotMatch(getMacroCardClass(0, 0, false, { overIsFine: true }), /bloom/);
  });

  test('overIsFine cards never turn red when exceeding goal', () => {
    assert.doesNotMatch(getMacroCardClass(190, 150, false, { overIsFine: true }), /\bover\b/);
  });

  test('keep-under (inverse) cards never bloom, even at/over goal', () => {
    for (const cur of [0, 10, 20, 25, 99]) {
      assert.doesNotMatch(getMacroCardClass(cur, 20, true), /bloom/);
    }
  });

  test('footer cards opt out of bloom', () => {
    assert.doesNotMatch(getMacroCardClass(250, 200, false, { bloom: false }), /bloom/);
  });

  test('inverse coloring unchanged', () => {
    assert.match(getMacroCardClass(21, 20, true), /inverse-purple/);
    assert.match(getMacroCardClass(18, 20, true), /inverse-over/);
    assert.match(getMacroCardClass(10, 20, true), /inverse-warn/);
  });
});
