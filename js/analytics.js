// analytics.js — Food history pattern detection and insight generation
import * as store from './store.js';
import { todayStr } from './ui.js';

// ── Callout Library ──
// Map of patterns to personality-driven messages (cycle through on repeated views)
const CALLOUT_LIBRARY = {
  vegetable_intake: [
    'You afraid of veggies, bruh?',
    'Salad is your friend, you know',
    'Green things exist outside restaurants...',
    'Vegetables called, missing you',
  ],
  fish_intake: [
    'Ever heard of fish?',
    'Omega-3 called, wondering where you been',
    'The ocean called, wants its nutrients back',
  ],
  protein_sources: [
    'Beef, chicken, fish, beans? Anything?',
    'Variety in protein is the spice of life',
    'Your amino acids are getting lonely',
  ],
  food_variety: [
    'You and your foods need to meet new friends',
    'Ever heard of food diversity?',
    'Same old same old, hey?',
    'Mix it up a little!',
  ],
  sugar_trend: [
    'Sugar crash incoming?',
    'Your sweet tooth is showing',
    'Easy on the sugar, yeah?',
    'Sugar levels rising like Bitcoin',
  ],
  calorie_consistency: [
    'Your calories are all over the place',
    'Stable intake makes stable progress',
    'Some days you're a squirrel, some days a bird',
  ],
  whole_grains: [
    'Ever tried a whole grain?',
    'Refined carbs are waving hello',
    'White rice misses white bread, apparently',
  ],
};

// ── Pattern Detectors ──

function detectVegetableIntake(foods, days) {
  if (foods.length === 0) {
    return {
      pattern: 'vegetable_intake',
      severity: 'high',
      callout: 'You afraid of veggies, bruh?',
      recommendation: 'Aim for 2-3 servings daily. Add a side salad or roasted veggies to your next meal.',
      stats: { actual: 0, daily_goal: 2.5, metric: 'vegetable servings', period: `${days} days` },
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
  const threshold = daily_goal * days * 0.5; // less than half goal over period

  if (actual < threshold) {
    return {
      pattern: 'vegetable_intake',
      severity: actual === 0 ? 'high' : 'medium',
      callout: CALLOUT_LIBRARY.vegetable_intake[Math.floor(Math.random() * CALLOUT_LIBRARY.vegetable_intake.length)],
      recommendation: 'Aim for 2-3 servings daily. Add a side salad or roasted veggies to your next meal.',
      stats: { actual, daily_goal, metric: 'vegetable servings', period: `${days} days` },
    };
  }
  return null;
}

function detectProteinSources(foods) {
  if (foods.length === 0) return null;

  const fishKeywords = ['salmon', 'tuna', 'fish', 'cod', 'shrimp', 'crab', 'lobster', 'halibut', 'bass', 'mahi'];
  const poultrKeywords = ['chicken', 'turkey', 'duck', 'poultry'];
  const legumeKeywords = ['bean', 'lentil', 'chickpea', 'tofu', 'tempeh', 'pea'];

  let hasFish = false, hasPoultry = false, hasLegume = false;

  for (const food of foods) {
    const name = food.name.toLowerCase();
    if (fishKeywords.some(k => name.includes(k))) hasFish = true;
    if (poultrKeywords.some(k => name.includes(k))) hasPoultry = true;
    if (legumeKeywords.some(k => name.includes(k))) hasLegume = true;
  }

  const sources = [hasFish, hasPoultry, hasLegume].filter(Boolean).length;
  if (sources < 2) {
    return {
      pattern: 'protein_sources',
      severity: sources === 0 ? 'high' : 'medium',
      callout: CALLOUT_LIBRARY.protein_sources[Math.floor(Math.random() * CALLOUT_LIBRARY.protein_sources.length)],
      recommendation: 'Rotate between fish (2-3x/week), poultry, and legumes. Each offers different nutrients.',
      stats: { actual: sources, goal: 3, metric: 'protein sources', note: 'fish, poultry, legumes' },
    };
  }
  return null;
}

function detectFoodVariety(foods) {
  if (foods.length === 0) return null;

  const uniqueFoods = new Set(foods.map(f => f.name.toLowerCase())).size;
  const avgPerDay = uniqueFoods / (foods.length > 0 ? Math.ceil(foods.length / 4) : 1); // rough estimate

  if (uniqueFoods < 10) {
    return {
      pattern: 'food_variety',
      severity: uniqueFoods < 5 ? 'high' : 'medium',
      callout: CALLOUT_LIBRARY.food_variety[Math.floor(Math.random() * CALLOUT_LIBRARY.food_variety.length)],
      recommendation: 'Try 3+ different foods per meal. Different foods = different nutrients.',
      stats: { actual: uniqueFoods, goal: 15, metric: 'unique foods logged' },
    };
  }
  return null;
}

function detectAddedSugarTrend(totals, days) {
  if (!totals || totals.length === 0) return null;

  const avgSugar = totals.reduce((sum, t) => sum + t.addedSugars, 0) / totals.length;
  const dailyGoal = 25; // WHO recommendation
  const threshold = dailyGoal * 1.2; // 20% over goal

  if (avgSugar > threshold) {
    return {
      pattern: 'sugar_trend',
      severity: avgSugar > dailyGoal * 1.5 ? 'high' : 'medium',
      callout: CALLOUT_LIBRARY.sugar_trend[Math.floor(Math.random() * CALLOUT_LIBRARY.sugar_trend.length)],
      recommendation: 'Keep added sugars under 25g/day. Watch out for sugary drinks and sauces.',
      stats: { actual: Math.round(avgSugar * 10) / 10, daily_goal: dailyGoal, metric: 'g added sugar/day', period: `${days} days` },
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
  const coefficient = stdDev / avg; // coefficient of variation

  if (coefficient > 0.35) { // >35% variation
    return {
      pattern: 'calorie_consistency',
      severity: coefficient > 0.5 ? 'medium' : 'low',
      callout: CALLOUT_LIBRARY.calorie_consistency[Math.floor(Math.random() * CALLOUT_LIBRARY.calorie_consistency.length)],
      recommendation: 'Aim for consistent daily intake (±200 cal). Steady eating helps metabolism.',
      stats: { actual: Math.round(avg), variance: Math.round(stdDev), metric: 'calorie variance' },
    };
  }
  return null;
}

function detectRefinedVsWhole(foods) {
  if (foods.length === 0) return null;

  const refinedKeywords = ['white rice', 'white bread', 'pasta', 'bagel', 'donut', 'cookie', 'chip', 'cracker', 'refined'];
  const wholeKeywords = ['whole wheat', 'whole grain', 'oat', 'quinoa', 'brown rice', 'whole'];

  let refined = 0, whole = 0;
  for (const food of foods) {
    const name = food.name.toLowerCase();
    if (refinedKeywords.some(k => name.includes(k))) refined += food.servings || 1;
    if (wholeKeywords.some(k => name.includes(k))) whole += food.servings || 1;
  }

  if (refined > whole * 2) {
    return {
      pattern: 'whole_grains',
      severity: 'low',
      callout: CALLOUT_LIBRARY.whole_grains[Math.floor(Math.random() * CALLOUT_LIBRARY.whole_grains.length)],
      recommendation: 'Switch to whole grains when possible. Brown rice, whole wheat bread, oats have more fiber.',
      stats: { refined: Math.round(refined * 10) / 10, whole: Math.round(whole * 10) / 10, metric: 'serving ratio' },
    };
  }
  return null;
}

// ── Main Analytics Function ──

export function analyzeFoodHistory(days = 7, fromDate = null) {
  if (fromDate === null || fromDate === undefined) {
    fromDate = todayStr();
  }

  // Get date range
  const dateRange = store.getLast7Days(fromDate).slice(0, days);
  const startDate = dateRange[0];
  const endDate = dateRange[dateRange.length - 1];

  // Get foods and totals for range
  const foods = store.getFoodsForRange(startDate, endDate);
  const totalsArray = dateRange.map(date => store.getDayTotals(date));

  // Run all detectors
  const insights = [];

  const vegInsight = detectVegetableIntake(foods, days);
  if (vegInsight) insights.push(vegInsight);

  const proteinInsight = detectProteinSources(foods);
  if (proteinInsight) insights.push(proteinInsight);

  const varietyInsight = detectFoodVariety(foods);
  if (varietyInsight) insights.push(varietyInsight);

  const sugarInsight = detectAddedSugarTrend(totalsArray, days);
  if (sugarInsight) insights.push(sugarInsight);

  const calorieInsight = detectCalorieConsistency(totalsArray, days);
  if (calorieInsight) insights.push(calorieInsight);

  const wholeGrainInsight = detectRefinedVsWhole(foods);
  if (wholeGrainInsight) insights.push(wholeGrainInsight);

  // Sort by severity (high > medium > low)
  const severityRank = { high: 3, medium: 2, low: 1 };
  insights.sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0));

  // If no insights, return a default encouraging message
  if (insights.length === 0) {
    return [{
      pattern: 'doing_great',
      severity: 'low',
      callout: 'Keep it up! You\'re nailing it.',
      stats: { message: 'No obvious areas to improve — great job!' },
    }];
  }

  return insights;
}
