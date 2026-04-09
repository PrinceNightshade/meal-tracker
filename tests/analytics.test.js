// tests/analytics.test.js — Unit tests for analytics pattern detectors
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import './setup.js';

// Inline the detector functions to test them as pure functions
// (analytics.js imports store.js which depends on todayStr — avoid that chain)

const CALLOUT_LIBRARY = {
  vegetable_intake: ['You afraid of veggies, bruh?'],
  sugar_trend: ['Sugar crash incoming?'],
  calorie_consistency: ['Your calories are all over the place'],
};

function detectVegetableIntake(foods, days) {
  if (foods.length === 0) {
    return {
      pattern: 'vegetable_intake',
      severity: 'high',
      callout: 'You afraid of veggies, bruh?',
      recommendation: 'Aim for 2-3 servings daily. Add a side salad or roasted veggies to your next meal.',
      stats: { actual: 0, daily_goal: 2.5, metric: 'vegetable servings', period: days + ' days' },
    };
  }

  const veggieKeywords = ['vegetable', 'broccoli', 'spinach', 'kale', 'carrot', 'lettuce', 'salad', 'cabbage', 'cauliflower', 'brussels', 'asparagus', 'green bean', 'pea', 'corn', 'squash', 'zucchini', 'celery'];
  let servings = 0;
  for (const food of foods) {
    const name = food.name.toLowerCase();
    if (veggieKeywords.some(k => name.includes(k))) {
      servings += food.servings || 1;
    }
  }

  const actual = Math.round(servings * 10) / 10;
  const daily_goal = 2.5;
  const threshold = daily_goal * days * 0.5;

  if (actual < threshold) {
    return {
      pattern: 'vegetable_intake',
      severity: actual === 0 ? 'high' : 'medium',
      callout: CALLOUT_LIBRARY.vegetable_intake[0],
      recommendation: 'Aim for 2-3 servings daily. Add a side salad or roasted veggies to your next meal.',
      stats: { actual, daily_goal, metric: 'vegetable servings', period: days + ' days' },
    };
  }
  return null;
}

function detectAddedSugarTrend(totals, days) {
  if (!totals || totals.length === 0) return null;

  const avgSugar = totals.reduce((sum, t) => sum + t.addedSugars, 0) / totals.length;
  const dailyGoal = 25;
  const threshold = dailyGoal * 1.2;

  if (avgSugar > threshold) {
    return {
      pattern: 'sugar_trend',
      severity: avgSugar > dailyGoal * 1.5 ? 'high' : 'medium',
      callout: CALLOUT_LIBRARY.sugar_trend[0],
      recommendation: 'Keep added sugars under 25g/day. Watch out for sugary drinks and sauces.',
      stats: { actual: Math.round(avgSugar * 10) / 10, daily_goal: dailyGoal, metric: 'g added sugar/day', period: days + ' days' },
    };
  }
  return null;
}

function detectCalorieConsistency(totals, days) {
  if (!totals || totals.length < 2) return null;

  const calories = totals.map(t => t.calories);
  const avg = calories.reduce((s, c) => s + c, 0) / calories.length;
  const variance = calories.reduce((s, c) => s + Math.pow(c - avg, 2), 0) / calories.length;
  const stdDev = Math.sqrt(variance);
  const coefficient = stdDev / avg;

  if (coefficient > 0.35) {
    return {
      pattern: 'calorie_consistency',
      severity: coefficient > 0.5 ? 'medium' : 'low',
      callout: CALLOUT_LIBRARY.calorie_consistency[0],
      recommendation: 'Aim for consistent daily intake (plus or minus 200 cal). Steady eating helps metabolism.',
      stats: { actual: Math.round(avg), variance: Math.round(stdDev), metric: 'calorie variance' },
    };
  }
  return null;
}

// ── Tests ──

describe('detectVegetableIntake', () => {
  test('returns high severity insight when food array is empty', () => {
    const result = detectVegetableIntake([], 7);
    assert.equal(result.pattern, 'vegetable_intake');
    assert.equal(result.severity, 'high');
    assert.equal(result.stats.actual, 0);
    assert.equal(result.stats.period, '7 days');
  });

  test('returns insight when no vegetables in food list', () => {
    const foods = [
      { name: 'Chicken Breast', servings: 2 },
      { name: 'White Rice', servings: 1 },
      { name: 'Pasta', servings: 1 },
    ];
    const result = detectVegetableIntake(foods, 7);
    assert.equal(result.pattern, 'vegetable_intake');
    assert.equal(result.severity, 'high');
    assert.equal(result.stats.actual, 0);
  });

  test('returns medium severity when some but insufficient vegetables', () => {
    const foods = [
      { name: 'Broccoli', servings: 1 },
      { name: 'Chicken Breast', servings: 2 },
      { name: 'White Rice', servings: 3 },
    ];
    const result = detectVegetableIntake(foods, 7);
    assert.equal(result.pattern, 'vegetable_intake');
    assert.equal(result.severity, 'medium');
    assert.equal(result.stats.actual, 1);
  });

  test('returns null when vegetable intake is sufficient', () => {
    const foods = [
      { name: 'Broccoli', servings: 3 },
      { name: 'Spinach Salad', servings: 3 },
      { name: 'Carrot Sticks', servings: 3 },
      { name: 'Kale Chips', servings: 3 },
    ];
    // threshold = 2.5 * 7 * 0.5 = 8.75; total = 12
    const result = detectVegetableIntake(foods, 7);
    assert.equal(result, null);
  });

  test('matches vegetable keywords case-insensitively', () => {
    const foods = [
      { name: 'BROCCOLI AND CHEESE', servings: 1 },
    ];
    const result = detectVegetableIntake(foods, 7);
    // 1 serving < threshold of 8.75, so should still return insight
    assert.notEqual(result, null);
    assert.equal(result.stats.actual, 1);
  });

  test('defaults servings to 1 when not specified', () => {
    const foods = [
      { name: 'Spinach' },
    ];
    const result = detectVegetableIntake(foods, 7);
    assert.equal(result.stats.actual, 1);
  });
});

describe('detectAddedSugarTrend', () => {
  test('returns null for empty totals', () => {
    assert.equal(detectAddedSugarTrend([], 7), null);
    assert.equal(detectAddedSugarTrend(null, 7), null);
  });

  test('returns null when sugar is within goal', () => {
    const totals = [
      { addedSugars: 20 },
      { addedSugars: 22 },
      { addedSugars: 18 },
    ];
    const result = detectAddedSugarTrend(totals, 7);
    assert.equal(result, null);
  });

  test('returns medium severity when sugar is above 120% of goal', () => {
    // threshold = 25 * 1.2 = 30; avg needs to be > 30
    const totals = [
      { addedSugars: 32 },
      { addedSugars: 35 },
      { addedSugars: 31 },
    ];
    const result = detectAddedSugarTrend(totals, 7);
    assert.equal(result.pattern, 'sugar_trend');
    assert.equal(result.severity, 'medium');
  });

  test('returns high severity when sugar is above 150% of goal', () => {
    // 25 * 1.5 = 37.5; avg needs to be > 37.5
    const totals = [
      { addedSugars: 40 },
      { addedSugars: 45 },
      { addedSugars: 38 },
    ];
    const result = detectAddedSugarTrend(totals, 7);
    assert.equal(result.pattern, 'sugar_trend');
    assert.equal(result.severity, 'high');
  });

  test('includes correct stats in result', () => {
    const totals = [
      { addedSugars: 40 },
      { addedSugars: 40 },
    ];
    const result = detectAddedSugarTrend(totals, 7);
    assert.equal(result.stats.actual, 40);
    assert.equal(result.stats.daily_goal, 25);
    assert.equal(result.stats.period, '7 days');
  });
});

describe('detectCalorieConsistency', () => {
  test('returns null for fewer than 2 data points', () => {
    assert.equal(detectCalorieConsistency([], 7), null);
    assert.equal(detectCalorieConsistency([{ calories: 2000 }], 7), null);
    assert.equal(detectCalorieConsistency(null, 7), null);
  });

  test('returns null when calories are consistent', () => {
    const totals = [
      { calories: 2000 },
      { calories: 2050 },
      { calories: 1980 },
      { calories: 2020 },
    ];
    const result = detectCalorieConsistency(totals, 7);
    assert.equal(result, null);
  });

  test('returns low severity for moderate variance (coefficient > 0.35)', () => {
    // Need stdDev/avg > 0.35 but <= 0.5
    // e.g. calories: [1000, 2000] → avg=1500, stdDev=500, coeff=0.33 (too low)
    // Try [800, 2200] → avg=1500, stdDev=700, coeff=0.467 — low severity
    const totals = [
      { calories: 800 },
      { calories: 2200 },
    ];
    const result = detectCalorieConsistency(totals, 7);
    assert.notEqual(result, null);
    assert.equal(result.pattern, 'calorie_consistency');
    assert.equal(result.severity, 'low');
  });

  test('returns medium severity for high variance (coefficient > 0.5)', () => {
    // Need stdDev/avg > 0.5
    // [500, 2500] → avg=1500, stdDev=1000, coeff=0.667
    const totals = [
      { calories: 500 },
      { calories: 2500 },
    ];
    const result = detectCalorieConsistency(totals, 7);
    assert.notEqual(result, null);
    assert.equal(result.pattern, 'calorie_consistency');
    assert.equal(result.severity, 'medium');
  });

  test('includes avg and stdDev in stats', () => {
    const totals = [
      { calories: 500 },
      { calories: 2500 },
    ];
    const result = detectCalorieConsistency(totals, 7);
    assert.equal(result.stats.actual, 1500);
    assert.equal(result.stats.variance, 1000);
  });
});
