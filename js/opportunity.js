// opportunity.js — the "opportunity statement" engine
//
// Surfaces ONE ranked, actionable insight across food + movement + sleep over a
// rolling window (default trailing 7 days — deliberately wider than a single
// day). Reads from the `store` facade but the ranking logic is pure
// (`rankOpportunities(context)`) so it can be tested in isolation.
//
// GUARDRAIL (see wellness.js / CLAUDE.md): movement and sleep are behavioral
// CONTEXT, never a spendable budget. No detector here converts steps or
// workouts into "calories earned." Cross-signal insights describe a
// relationship ("you eat more after short sleep"); they never tell the user
// they've banked calories to spend.

import * as store from './store.js';

const SHORT_SLEEP_MIN = 360;   // < 6h counts as a short night
const LOW_STEP_DAY = 5000;     // a "low movement" day
const MIN_CROSS_PAIRS = 6;     // paired days needed before a correlation is shown

// ── Context assembly ──

function ymd(dateObj) {
  return dateObj.toISOString().split('T')[0];
}

function shift(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return ymd(d);
}

// Build the analysis context for a window ending on `today`.
export function buildContext(today = store.todayStr ? store.todayStr() : ymd(new Date()), windowDays = 7) {
  const goals = store.getGoals();

  const dayAt = (dateStr) => {
    const totals = store.getDayTotals(dateStr);
    const wellness = store.getWellness(dateStr);
    return { date: dateStr, totals, hasFood: (totals.calories || 0) > 0, wellness };
  };

  const days = [];
  for (let i = windowDays - 1; i >= 0; i--) days.push(dayAt(shift(today, -i)));
  const prior = [];
  for (let i = windowDays * 2 - 1; i >= windowDays; i--) prior.push(dayAt(shift(today, -i)));

  // Personal baselines from ALL wellness history (not just the window).
  const allWellness = Object.values(store.getAllWellness());
  const baseline = {
    steps: avg(allWellness.map(w => w.steps)),
    sleepMinutes: avg(allWellness.map(w => w.sleepMinutes)),
  };

  return { today, windowDays, goals, days, prior, baseline, allWellness };
}

// ── Helpers ──

function avg(arr) {
  const v = arr.filter(x => typeof x === 'number' && isFinite(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

function pct(from, to) {
  if (!from) return null;
  return Math.round(((to - from) / from) * 100);
}

// ── Detectors ── each returns an insight object or null.
// Insight: { id, domain, severity(0-1), tone, eyebrow, headline, sub,
//            series?: { values:[], labels:[], highlight:[bool], unit } }

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function seriesFrom(days, pick, highlightFn, unit) {
  return {
    values: days.map(d => pick(d) ?? 0),
    labels: days.map(d => DAY_LABELS[new Date(d.date + 'T12:00:00').getDay()]),
    highlight: days.map(d => !!highlightFn(d)),
    unit,
  };
}

// Cross-signal: intake the day AFTER a short night vs after an adequate night.
// Uses all history for sample size; framed as a relationship, never a budget.
function detectSleepCalories(ctx) {
  const byDate = {};
  for (const w of ctx.allWellness) byDate[w.date] = w;

  const shortNext = [];
  const okNext = [];
  for (const w of ctx.allWellness) {
    if (typeof w.sleepMinutes !== 'number') continue;
    const next = store.getDayTotals(shift(w.date, 1));
    if (!next || !(next.calories > 0)) continue;
    (w.sleepMinutes < SHORT_SLEEP_MIN ? shortNext : okNext).push(next.calories);
  }
  if (shortNext.length < 2 || okNext.length < 2) return null;
  if (shortNext.length + okNext.length < MIN_CROSS_PAIRS) return null;

  const delta = Math.round(avg(shortNext) - avg(okNext));
  if (delta < 150) return null; // not a meaningful or actionable gap

  const shortThisWeek = ctx.days.filter(d => d.wellness && d.wellness.sleepMinutes < SHORT_SLEEP_MIN).length;
  return {
    id: 'sleep-calories',
    domain: 'cross',
    severity: Math.min(0.95, 0.6 + delta / 1500 + shortThisWeek * 0.04),
    tone: 'warn',
    eyebrow: 'OPPORTUNITY · YOUR PATTERN',
    headline: `You eat about ${delta} more calories after a short night`,
    sub: `On days after under-6h sleep you average +${delta} cal. Protecting sleep may be your easiest lever right now.`,
    series: seriesFrom(ctx.days, d => d.wellness?.sleepMinutes, d => d.wellness && d.wellness.sleepMinutes < SHORT_SLEEP_MIN, 'min'),
  };
}

function detectShortSleepWeek(ctx) {
  const nights = ctx.days.filter(d => d.wellness && typeof d.wellness.sleepMinutes === 'number');
  if (nights.length < 3) return null;
  const short = nights.filter(d => d.wellness.sleepMinutes < SHORT_SLEEP_MIN).length;
  if (short < 3) return null;
  return {
    id: 'short-sleep-week',
    domain: 'sleep',
    severity: Math.min(0.9, 0.4 + (short / ctx.windowDays) * 0.6),
    tone: 'warn',
    eyebrow: `OPPORTUNITY · LAST ${ctx.windowDays} DAYS`,
    headline: `${short} short nights this week`,
    sub: `Under 6 hours ${short} of ${nights.length} nights. Short sleep is when cravings and calories tend to climb.`,
    series: seriesFrom(ctx.days, d => d.wellness?.sleepMinutes, d => d.wellness && d.wellness.sleepMinutes < SHORT_SLEEP_MIN, 'min'),
  };
}

function detectStepsDown(ctx) {
  const cur = avg(ctx.days.map(d => d.wellness?.steps));
  if (cur === null) return null;
  const ref = avg(ctx.prior.map(d => d.wellness?.steps)) ?? ctx.baseline.steps;
  if (!ref) return null;
  const change = pct(ref, cur);
  if (change === null || change > -15) return null; // only fire on a real dip
  return {
    id: 'steps-down',
    domain: 'movement',
    severity: Math.min(0.85, 0.3 + Math.abs(change) / 100 + 0.2),
    tone: 'warn',
    eyebrow: `OPPORTUNITY · LAST ${ctx.windowDays} DAYS`,
    headline: `Steps are down ${Math.abs(change)}% from your usual`,
    sub: `Averaging ${Math.round(cur).toLocaleString()} a day vs your usual ${Math.round(ref).toLocaleString()}. A short daily walk adds up fast.`,
    series: seriesFrom(ctx.days, d => d.wellness?.steps, d => (d.wellness?.steps ?? 0) < LOW_STEP_DAY, 'steps'),
  };
}

function detectLowMovementWeek(ctx) {
  const withSteps = ctx.days.filter(d => typeof d.wellness?.steps === 'number');
  if (withSteps.length < 3) return null;
  const low = withSteps.filter(d => d.wellness.steps < LOW_STEP_DAY).length;
  if (low < 3) return null;
  return {
    id: 'low-movement-week',
    domain: 'movement',
    severity: Math.min(0.8, 0.35 + (low / ctx.windowDays) * 0.45),
    tone: 'warn',
    eyebrow: `OPPORTUNITY · LAST ${ctx.windowDays} DAYS`,
    headline: `Movement's been light lately`,
    sub: `${low} of the last ${withSteps.length} days under 5,000 steps. Even a 10-minute walk breaks the pattern.`,
    series: seriesFrom(ctx.days, d => d.wellness?.steps, d => (d.wellness?.steps ?? 0) < LOW_STEP_DAY, 'steps'),
  };
}

function detectCaloriesOver(ctx) {
  const logged = ctx.days.filter(d => d.hasFood);
  if (logged.length < 3) return null;
  const goal = ctx.goals.calories || 2000;
  const over = logged.filter(d => d.totals.calories > goal).length;
  if (over < 4) return null;
  return {
    id: 'calories-over',
    domain: 'food',
    severity: Math.min(0.85, 0.3 + (over / logged.length) * 0.5),
    tone: 'warn',
    eyebrow: `OPPORTUNITY · LAST ${ctx.windowDays} DAYS`,
    headline: `Over your target ${over} of ${logged.length} days`,
    sub: `Small consistent overages add up. Trimming the largest meal a little goes further than skipping one.`,
    series: seriesFrom(ctx.days, d => d.totals.calories, d => d.hasFood && d.totals.calories > goal, 'cal'),
  };
}

function detectProteinShort(ctx) {
  const logged = ctx.days.filter(d => d.hasFood);
  if (logged.length < 3) return null;
  const goal = ctx.goals.protein || 150;
  const under = logged.filter(d => (d.totals.protein || 0) < goal).length;
  if (under < 4) return null;
  return {
    id: 'protein-short',
    domain: 'food',
    severity: Math.min(0.75, 0.2 + (under / logged.length) * 0.45),
    tone: 'warn',
    eyebrow: `OPPORTUNITY · LAST ${ctx.windowDays} DAYS`,
    headline: `Protein fell short ${under} of ${logged.length} days`,
    sub: `Adding a protein source to each meal keeps you fuller and protects muscle while losing.`,
    series: seriesFrom(ctx.days, d => d.totals.protein, d => d.hasFood && (d.totals.protein || 0) >= goal, 'g'),
  };
}

// Sodium is tracked as behavioral context for a DASH-adjacent eating pattern —
// plain, non-clinical framing, never a medical claim (no "this will lower
// your blood pressure"). A day only counts toward "over" using KNOWN sodium
// (totals.sodium sums only logged items with a value); a day with no sodium
// data at all just won't fire here rather than being guessed at.
function detectHighSodiumWeek(ctx) {
  const logged = ctx.days.filter(d => d.hasFood);
  if (logged.length < 3) return null;
  const goal = ctx.goals.sodiumGoal || 2300;
  const over = logged.filter(d => (d.totals.sodium || 0) > goal).length;
  if (over < 4) return null;
  return {
    id: 'sodium-high-week',
    domain: 'food',
    severity: Math.min(0.85, 0.3 + (over / logged.length) * 0.5),
    tone: 'warn',
    eyebrow: `OPPORTUNITY · LAST ${ctx.windowDays} DAYS`,
    headline: `Sodium ran over target ${over} of ${logged.length} days`,
    sub: `Sauces, cured meats, and packaged snacks are usually the biggest levers. Trimming those is the DASH-pattern approach, and it's general wellness — not a medical claim.`,
    series: seriesFrom(ctx.days, d => d.totals.sodium, d => d.hasFood && (d.totals.sodium || 0) > goal, 'mg'),
  };
}

// Cross-signal: protein-short AND sodium-high on the same days. The pattern
// worth naming is that salty convenience foods often crowd out protein
// instead of adding it — so the fix (a plain protein source) addresses both
// at once. Ranks as a top cross-signal insight, same tier as sleep-calories.
function detectSodiumProteinCross(ctx) {
  const logged = ctx.days.filter(d => d.hasFood);
  if (logged.length < 4) return null;
  const proteinGoal = ctx.goals.protein || 150;
  const sodiumGoal = ctx.goals.sodiumGoal || 2300;
  const proteinShort = logged.filter(d => (d.totals.protein || 0) < proteinGoal).length;
  const sodiumHigh = logged.filter(d => (d.totals.sodium || 0) > sodiumGoal).length;
  const both = logged.filter(d => (d.totals.protein || 0) < proteinGoal && (d.totals.sodium || 0) > sodiumGoal).length;
  // Require the underlying trend on both sides, not just incidental overlap.
  if (proteinShort < 4 || sodiumHigh < 3 || both < 3) return null;

  return {
    id: 'sodium-protein-cross',
    domain: 'cross',
    severity: Math.min(0.95, 0.55 + (both / logged.length) * 0.4),
    tone: 'warn',
    eyebrow: 'OPPORTUNITY · YOUR PATTERN',
    headline: `Protein-short and sodium-high together on ${both} of the last ${logged.length} days`,
    sub: `Plain protein sources — Greek yogurt, cottage cheese, edamame, lentils, chicken breast — tend to fix both at once, instead of a salty convenience food that crowds protein out.`,
    series: seriesFrom(ctx.days, d => d.totals.sodium, d => (d.totals.protein || 0) < proteinGoal && (d.totals.sodium || 0) > sodiumGoal, 'mg'),
  };
}

// Positive fallback — nothing pressing. Celebrate the strongest streak so the
// card is never empty and never nags without cause.
function detectPositive(ctx) {
  const logged = ctx.days.filter(d => d.hasFood);
  const goal = ctx.goals.protein || 150;
  const proteinHits = logged.filter(d => (d.totals.protein || 0) >= goal).length;
  const sleepNights = ctx.days.filter(d => d.wellness && d.wellness.sleepMinutes >= SHORT_SLEEP_MIN).length;

  if (proteinHits >= 5) {
    return {
      id: 'good-protein', domain: 'food', severity: 0.1, tone: 'good',
      eyebrow: `NICE WORK · LAST ${ctx.windowDays} DAYS`,
      headline: `Protein on point ${proteinHits} of ${logged.length} days`,
      sub: 'Strong, consistent week. Keep it rolling.',
      series: seriesFrom(ctx.days, d => d.totals.protein, d => d.hasFood && (d.totals.protein || 0) >= goal, 'g'),
    };
  }
  return {
    id: 'keep-going', domain: 'food', severity: 0.05, tone: 'neutral',
    eyebrow: `THIS WEEK · LAST ${ctx.windowDays} DAYS`,
    headline: sleepNights >= 5 ? 'Sleep is holding steady' : 'Keep logging to unlock insights',
    sub: sleepNights >= 5
      ? 'Consistent sleep is a quiet superpower for appetite control.'
      : 'A few more days of food, movement, and sleep data sharpens your weekly opportunity.',
    series: null,
  };
}

const DETECTORS = [
  detectSleepCalories,
  detectSodiumProteinCross,
  detectShortSleepWeek,
  detectStepsDown,
  detectLowMovementWeek,
  detectCaloriesOver,
  detectProteinShort,
  detectHighSodiumWeek,
];

// Domain preference for tie-breaking (cross-signal is the most compelling).
const DOMAIN_RANK = { cross: 4, sleep: 3, movement: 2, food: 1 };

// Pure ranking: returns all firing insights (highest severity first) plus a
// guaranteed positive fallback at the tail.
export function rankOpportunities(ctx) {
  const fired = DETECTORS.map(fn => {
    try { return fn(ctx); } catch { return null; }
  }).filter(Boolean);

  fired.sort((a, b) => {
    if (Math.abs(b.severity - a.severity) > 0.08) return b.severity - a.severity;
    return (DOMAIN_RANK[b.domain] || 0) - (DOMAIN_RANK[a.domain] || 0);
  });

  return [...fired, detectPositive(ctx)];
}

// Convenience: the single top opportunity for a window ending today.
export function getOpportunity(today, windowDays = 7) {
  const ctx = buildContext(today, windowDays);
  return rankOpportunities(ctx)[0];
}
