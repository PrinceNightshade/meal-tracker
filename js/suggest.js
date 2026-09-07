// suggest.js — smart logging suggestions
//
// Predictive quick-log from the user's OWN history. Two outputs per meal slot:
//   • usual  — the recurring combo for that slot ("your usual breakfast"),
//              surfaced only when it's genuinely consistent, for one-tap re-log
//   • items  — the most frequent single items for that slot, ranked
//
// This extends recents/favorites with frequency + recency scoring. It does NOT
// auto-log anything — the user still taps to confirm — so it removes redundant
// data entry without removing the awareness that logging provides (the app's
// core value prop: awareness, not math).

import * as store from './store.js';
import { normalizeFoodKey } from './api.js';

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snacks'];

// Which meal the user is most likely logging right now, by time of day.
export function currentMealSlot(d = new Date()) {
  const h = d.getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snacks';
}

function ymd(d) { return d.toISOString().split('T')[0]; }
function shiftStr(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return ymd(d);
}

// Strip the per-entry id so a suggested food can be re-added cleanly.
function stripId(food) {
  const { id, ...rest } = food;
  return rest;
}

// Consistency thresholds for surfacing the "usual" combo.
const USUAL_MIN_DAYS = 3;      // must have occurred at least this many times
const USUAL_MIN_RATIO = 0.4;   // and on at least this share of logged days

// Analyze the last `days` for a meal slot. `today` lets callers pin the window
// end (defaults to the real today). `excludeDate` skips a day (e.g. today, so a
// meal already logged today doesn't suggest itself back).
export function getSmartSuggestions(mealType, { days = 30, today = null, excludeDate = null } = {}) {
  const end = today || ymd(new Date());
  const itemMap = new Map();   // normalizedName -> { name, food, count, lastDate }
  const sigMap = new Map();    // combo signature -> { count, lastDate, foods }
  let loggedDays = 0;

  // Walk newest-first so the first food object seen for a key is the most recent.
  for (let i = 0; i < days; i++) {
    const date = shiftStr(end, -i);
    if (date === excludeDate) continue;
    const day = store.getDay(date);
    const entries = (day.meals && day.meals[mealType]) || [];
    const named = entries.filter(f => f.name);
    if (!named.length) continue;
    loggedDays++;

    const keys = [];
    for (const f of named) {
      const key = normalizeFoodKey(f.name);
      keys.push(key);
      const cur = itemMap.get(key);
      if (!cur) {
        itemMap.set(key, { name: f.name, food: stripId(f), count: 1, lastDate: date });
      } else {
        cur.count++;
      }
    }

    const sig = [...new Set(keys)].sort().join('|');
    if (sig) {
      const cur = sigMap.get(sig);
      if (!cur) {
        sigMap.set(sig, { count: 1, lastDate: date, foods: named.map(stripId) });
      } else {
        cur.count++;
      }
    }
  }

  // Frequent single items, ranked by count then recency.
  const items = [...itemMap.values()]
    .sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate))
    .slice(0, 6)
    .map(x => ({ ...x.food, name: x.name, count: x.count, lastDate: x.lastDate }));

  // The "usual" combo — only if it's the dominant pattern for this slot.
  let usual = null;
  if (loggedDays >= USUAL_MIN_DAYS) {
    const top = [...sigMap.values()]
      .sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate))[0];
    if (top && top.count >= USUAL_MIN_DAYS && top.count / loggedDays >= USUAL_MIN_RATIO && top.foods.length) {
      usual = {
        foods: top.foods,
        totalCalories: Math.round(top.foods.reduce((s, f) => s + (f.calories || 0) * (f.servings || 1), 0)),
        totalProtein: Math.round(top.foods.reduce((s, f) => s + (f.protein || 0) * (f.servings || 1), 0)),
        dayCount: top.count,
        sampleSize: loggedDays,
      };
    }
  }

  return { mealType, usual, items, loggedDays };
}
