// tests/opportunity.test.js — fiber opportunity detector (js/opportunity.js)
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import './setup.js';
import { rankOpportunities } from '../js/opportunity.js';

// Build a synthetic 7-day context. `fibers` = per-day fiber (null = no food logged);
// `incomplete` = per-day boolean for fiberIncomplete.
function ctxWith(fibers, { incomplete = [], fiberGoal = 30 } = {}) {
  const days = fibers.map((f, i) => ({
    date: `2026-06-${String(i + 1).padStart(2, '0')}`,
    hasFood: f !== null,
    wellness: null,
    totals: {
      calories: f === null ? 0 : 1800, protein: 160, carbs: 150, fat: 60, addedSugars: 10,
      sodium: 1500, fiber: f ?? 0, fiberIncomplete: !!incomplete[i],
    },
  }));
  return {
    today: '2026-06-07', windowDays: 7, goals: { calories: 2000, protein: 150, sodiumGoal: 2300, fiberGoal },
    days, prior: [], baseline: { steps: null, sleepMinutes: null }, allWellness: [],
  };
}

const fiberHit = (ctx) => rankOpportunities(ctx).find(o => o.id === 'fiber-low-week');

describe('detectLowFiberWeek', () => {
  test('fires when fiber is under goal on >=4 known days', () => {
    const o = fiberHit(ctxWith([12, 18, 25, 20, 35, 31, 10]));
    assert.ok(o);
    assert.equal(o.domain, 'food');
    assert.equal(o.tone, 'warn');
    assert.match(o.headline, /Fiber came in under target 5 of the last 7 days/);
    assert.match(o.sub, /Beans, lentils, oats, and berries/);
  });

  test('exactly 4 under fires; 3 under does not', () => {
    assert.ok(fiberHit(ctxWith([10, 10, 10, 10, 40, 40, 40])));
    assert.equal(fiberHit(ctxWith([10, 10, 10, 40, 40, 40, 40])), undefined);
  });

  test('fiber exactly at goal is not "under"', () => {
    assert.equal(fiberHit(ctxWith([30, 30, 30, 30, 10, 10, 10])), undefined);
  });

  test('days with unknown (incomplete) fiber are skipped, not counted as zero', () => {
    // 4 days under but all incomplete -> too few known days -> no insight
    const ctx = ctxWith([5, 5, 5, 5, 40, 40, 40], { incomplete: [true, true, true, true, false, false, false] });
    assert.equal(fiberHit(ctx), undefined);
  });

  test('skips when fewer than 4 days have known fiber', () => {
    assert.equal(fiberHit(ctxWith([5, 5, 5, null, null, null, null])), undefined);
  });

  test('unlogged days are ignored', () => {
    const o = fiberHit(ctxWith([5, 5, null, 5, null, 5, 40]));
    assert.ok(o);
    assert.match(o.headline, /under target 4 of the last 7 days/);
  });

  test('respects a custom fiberGoal', () => {
    assert.equal(fiberHit(ctxWith([25, 25, 25, 25, 25, 25, 25], { fiberGoal: 20 })), undefined);
    assert.ok(fiberHit(ctxWith([25, 25, 25, 25, 25, 25, 25], { fiberGoal: 38 })));
  });
});
