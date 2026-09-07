// store.js — localStorage data layer
import { shiftDate, todayStr } from './ui.js';
import { getCommonFood } from './api.js';

// Wellness (movement + sleep) lives in its own module but is re-exported here
// so the whole data layer is reachable through one `store` facade.
export {
  getWellness, getAllWellness, saveWellness, mergeWellness, deleteWellness,
  replaceAllWellness, getWellnessForRange, getWellnessStats, importWellness,
} from './wellness.js';

const KEYS = {
  days: 'mt_days',
  goals: 'mt_goals',
  favorites: 'mt_favorites',
  myFoods: 'mt_myfoods',
  weight: 'mt_weight',
  profile: 'mt_profile',
  hiddenRecents: 'mt_hidden_recents',
};

export const DEFAULT_GOALS = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 65,
  addedSugars: 25,
  weightGoal: null,
};

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded — consider pruning old data');
    } else {
      console.warn('localStorage write failed:', e);
    }
  }
}

// ── Profile ──

export function getProfile() {
  return read(KEYS.profile) || { sex: null, birthYear: null, heightFt: null, heightIn: null, activityLevel: 'sedentary' };
}

export function getAge() {
  const profile = getProfile();
  if (!profile.birthYear) return null;
  return new Date().getFullYear() - profile.birthYear;
}

export function isUnderage() {
  const age = getAge();
  return age !== null && age < 20;
}

export function saveProfile(profile) {
  write(KEYS.profile, profile);
}

// Mifflin-St Jeor BMR + activity multiplier → TDEE
export function estimateTDEE() {
  const profile = getProfile();
  const history = getWeightHistory(0);
  const age = getAge();
  if (!profile.sex || !age || !profile.heightFt || history.length === 0) return null;
  if (isUnderage()) return null;

  const weightKg = history[history.length - 1].weight * 0.453592;
  const heightCm = (profile.heightFt * 12 + (profile.heightIn || 0)) * 2.54;

  let bmr;
  if (profile.sex === 'male') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }

  const multipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  };

  const tdee = Math.round(bmr * (multipliers[profile.activityLevel] || 1.2));
  return { bmr: Math.round(bmr), tdee, activityLevel: profile.activityLevel };
}

// Suggested macros based on TDEE, adjusted for weight goal
// Safe limits: max ~1 lb/week loss (500 cal deficit), max ~0.5 lb/week gain (250 cal surplus)
// Never goes below BMR
export function getSuggestedGoals() {
  const est = estimateTDEE();
  if (!est) return null;

  const { tdee, bmr } = est;
  const goals = getGoals();
  const history = getWeightHistory(0);

  let targetCals = tdee;
  let description = 'maintenance';

  if (goals.weightGoal && history.length > 0) {
    const currentWeight = history[history.length - 1].weight;
    const diff = goals.weightGoal - currentWeight;

    if (Math.abs(diff) > 1) { // more than 1 lb from goal
      if (diff < 0) {
        // Losing weight — target 1 lb/week (500 cal/day deficit), cap at 2 lb/week (1000)
        // Scale deficit by how much there is to lose: gentler when close
        const lbsToLose = Math.abs(diff);
        const weeklyRate = Math.min(lbsToLose > 20 ? 1.5 : 1, 2); // slightly more aggressive if far out
        const deficit = Math.round(weeklyRate * 500);
        targetCals = Math.max(tdee - deficit, bmr); // never below BMR
        const actualRate = +((tdee - targetCals) / 500).toFixed(1);
        description = `${deficit} cal deficit (~${actualRate} lb/wk loss)`;
      } else {
        // Gaining weight — target 0.5 lb/week (250 cal/day surplus)
        const surplus = 250;
        targetCals = tdee + surplus;
        description = `${surplus} cal surplus (~0.5 lb/wk gain)`;
      }
    }
  }

  return {
    calories: targetCals,
    // ~30% protein, ~40% carbs, ~30% fat
    protein: Math.round((targetCals * 0.3) / 4),
    carbs: Math.round((targetCals * 0.4) / 4),
    fat: Math.round((targetCals * 0.3) / 9),
    tdee,
    bmr,
    targetCals,
    description,
  };
}

// ── Goals ──

export function getGoals() {
  return read(KEYS.goals) || { ...DEFAULT_GOALS };
}

export function goalsAreDefaults() {
  const g = read(KEYS.goals);
  if (!g) return true;
  return g.calories === DEFAULT_GOALS.calories && g.protein === DEFAULT_GOALS.protein
    && g.carbs === DEFAULT_GOALS.carbs && g.fat === DEFAULT_GOALS.fat && g.addedSugars === DEFAULT_GOALS.addedSugars;
}

export function saveGoals(goals) {
  write(KEYS.goals, goals);
}

// ── Days / Meals ──

function getAllDays() {
  return read(KEYS.days) || {};
}

function saveAllDays(days) {
  write(KEYS.days, days);
}

export function getDay(dateStr) {
  const days = getAllDays();
  return days[dateStr] || {
    meals: { breakfast: [], lunch: [], dinner: [], snacks: [] },
  };
}

export function saveDay(dateStr, dayData) {
  const days = getAllDays();
  days[dateStr] = dayData;
  saveAllDays(days);
}

export function getWater(dateStr) {
  return getDay(dateStr).water || 0;
}

export function addGlass(dateStr) {
  const day = getDay(dateStr);
  day.water = (day.water || 0) + 1;
  saveDay(dateStr, day);
}

export function setWater(dateStr, count) {
  const day = getDay(dateStr);
  day.water = Math.max(0, count | 0);
  saveDay(dateStr, day);
}

export function addFoodToMeal(dateStr, mealType, food) {
  const day = getDay(dateStr);
  day.meals[mealType].push({
    ...food,
    id: food.id || crypto.randomUUID(),
  });
  saveDay(dateStr, day);
}

export function removeFoodFromMeal(dateStr, mealType, foodId) {
  const day = getDay(dateStr);
  day.meals[mealType] = day.meals[mealType].filter(f => f.id !== foodId);
  saveDay(dateStr, day);
}

export function updateFoodInMeal(dateStr, mealType, foodId, updates) {
  const day = getDay(dateStr);
  const idx = day.meals[mealType].findIndex(f => f.id === foodId);
  if (idx !== -1) {
    day.meals[mealType][idx] = { ...day.meals[mealType][idx], ...updates };
  }
  saveDay(dateStr, day);
}

export function updateFoodQuantity(dateStr, mealType, foodId, newServings) {
  updateFoodInMeal(dateStr, mealType, foodId, { servings: newServings });
}

// ── Favorites ──

export function getFavorites() {
  return read(KEYS.favorites) || [];
}

export function addFavorite(food) {
  const favs = getFavorites();
  // Don't add if already in favorites by name
  if (favs.some(f => f.name === food.name)) return;
  const fav = { ...food };
  delete fav.id;
  fav.favId = crypto.randomUUID();
  favs.push(fav);
  write(KEYS.favorites, favs);
}

export function removeFavorite(favId) {
  // Remove by favId, but also clean up any name-duplicates that crept in
  const name = getFavorites().find(f => f.favId === favId)?.name;
  const favs = getFavorites().filter(f => f.favId !== favId && f.name !== name);
  write(KEYS.favorites, favs);
}

export function replaceFavorites(items) {
  // Deduplicate by name when loading from cloud
  const seen = new Set();
  const deduped = (items || []).filter(f => {
    if (seen.has(f.name)) return false;
    seen.add(f.name);
    return true;
  });
  write(KEYS.favorites, deduped);
}

// ── My Foods (custom food library) ──

export function getMyFoods() {
  return read(KEYS.myFoods) || [];
}

export function saveMyFood(food) {
  const foods = getMyFoods();
  const entry = { ...food, myFoodId: crypto.randomUUID(), source: 'myfoods' };
  delete entry.id;
  foods.push(entry);
  write(KEYS.myFoods, foods);
  return entry;
}

export function deleteMyFood(myFoodId) {
  write(KEYS.myFoods, getMyFoods().filter(f => f.myFoodId !== myFoodId));
}

export function replaceMyFoods(items) {
  write(KEYS.myFoods, items);
}

export function searchMyFoods(query) {
  const q = query.toLowerCase();
  return getMyFoods().filter(f => f.name && f.name.toLowerCase().includes(q));
}

export function getAllWeightEntries() {
  return read(KEYS.weight) || {};
}

// ── Weight ──

function getAllWeight() {
  return read(KEYS.weight) || {};
}

export function getWeight(dateStr) {
  return getAllWeight()[dateStr] || null;
}

export function saveWeight(dateStr, weight) {
  const all = getAllWeight();
  if (weight === null || weight === undefined || weight === '') {
    delete all[dateStr];
  } else {
    all[dateStr] = parseFloat(weight);
  }
  write(KEYS.weight, all);
}

// Replace all weight entries with cloud data (handles deletions from cloud properly)
export function replaceWeight(entries) {
  const normalized = {};
  for (const [date, weight] of Object.entries(entries || {})) {
    normalized[date] = parseFloat(weight);
  }
  write(KEYS.weight, normalized);
}

export function getWeightHistory(days = 30) {
  const all = getAllWeight();
  const entries = Object.entries(all)
    .map(([date, weight]) => ({ date, weight }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return days ? entries.slice(-days) : entries;
}

// ── Weight trend (EMA) ──
// Daily weight bounces ±1–3 lb on water/food/glycogen. The trend line — an
// exponential moving average — is the real signal; raw dailies are noise around
// it. alpha 0.25 is responsive enough for sparse (non-daily) logging while
// still smoothing the day-to-day swing. This is the primary number the UI shows.
const WEIGHT_TREND_ALPHA = 0.25;

function emaTrend(entries, alpha = WEIGHT_TREND_ALPHA) {
  let prev = null;
  return entries.map(e => {
    const trend = prev === null ? e.weight : prev + alpha * (e.weight - prev);
    prev = trend;
    return { ...e, trend };
  });
}

// Sorted entries with a `.trend` (EMA) alongside the raw `.weight`.
export function getWeightSeries(days = 0) {
  const series = emaTrend(getWeightHistory(0));
  return days ? series.slice(-days) : series;
}

export function getWeightStats() {
  const series = getWeightSeries(0); // all, with trend
  if (series.length === 0) return null;
  const last = series[series.length - 1];
  const first = series[0];
  const currentTrend = +last.trend.toFixed(1);

  // 7-day change: compare the current trend to the trend at the entry NEAREST
  // to 7 days ago (not merely the first entry inside the window, which was the
  // old bug — with a recent cluster of weigh-ins it compared today to ~today).
  // Suppress it unless that nearest entry is genuinely old enough to mean a week.
  const weekAgoTime = Date.now() - 7 * 86400000;
  let nearest = null, nearestDiff = Infinity;
  for (const e of series) {
    const diff = Math.abs(new Date(e.date + 'T12:00:00').getTime() - weekAgoTime);
    if (diff < nearestDiff) { nearestDiff = diff; nearest = e; }
  }
  const nearestDaysOld = (Date.now() - new Date(nearest.date + 'T12:00:00').getTime()) / 86400000;
  const weekChange = nearest && nearestDaysOld >= 4 ? +(currentTrend - nearest.trend).toFixed(1) : null;

  return {
    current: currentTrend,        // trend, not the noisy latest reading
    currentRaw: last.weight,      // today's actual scale number
    weekChange,
    totalChange: +(currentTrend - first.trend).toFixed(1),
    entries: series.length,
    startDate: first.date,
  };
}

export function getWeightProjection() {
  const goals = getGoals();
  const series = getWeightSeries(0);
  if (!goals.weightGoal || series.length < 2) return null;

  const target = goals.weightGoal;
  const current = +series[series.length - 1].trend.toFixed(1);

  // Already at or past goal
  const losing = target < current;
  if ((losing && current <= target) || (!losing && current >= target)) {
    return { reached: true, current, target };
  }

  // Rate = least-squares slope of the TREND over a RECENT window (not the old
  // 2-point first-vs-last-of-all-history slope, which ignored recent plateaus
  // and swung on a single noisy endpoint). Falls back to the last few points
  // when the window is sparse.
  const WINDOW_DAYS = 21;
  const lastTime = new Date(series[series.length - 1].date + 'T12:00:00').getTime();
  const cutoff = lastTime - WINDOW_DAYS * 86400000;
  let win = series.filter(e => new Date(e.date + 'T12:00:00').getTime() >= cutoff);
  if (win.length < 3) win = series.slice(-Math.min(series.length, 5));
  if (win.length < 2) return null;

  const x0 = new Date(win[0].date + 'T12:00:00').getTime();
  const xs = win.map(e => (new Date(e.date + 'T12:00:00').getTime() - x0) / 86400000);
  const ys = win.map(e => e.trend);
  const n = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0);
  const sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const dailyChange = (n * sxy - sx * sy) / denom; // lb/day
  const windowDays = Math.max(1, Math.round(xs[xs.length - 1]));

  // Trend headed the wrong way (or flat) — can't project toward the goal.
  if (losing && dailyChange >= 0) return { noProgress: true, current, target, dailyChange: +dailyChange.toFixed(3), windowDays };
  if (!losing && dailyChange <= 0) return { noProgress: true, current, target, dailyChange: +dailyChange.toFixed(3), windowDays };

  const remaining = target - current;
  const daysToGoal = Math.ceil(Math.abs(remaining / dailyChange));

  const estDate = new Date();
  estDate.setDate(estDate.getDate() + daysToGoal);
  const estDateStr = estDate.toISOString().split('T')[0];

  return {
    current,
    target,
    dailyChange: +dailyChange.toFixed(3),
    daysToGoal,
    estDate: estDateStr,
    lbsPerWeek: +(dailyChange * 7).toFixed(1),
    windowDays,
  };
}

// ── History Search ──

export function searchHistory(query) {
  const q = query.toLowerCase();
  const days = getAllDays();
  const seen = new Set();
  const results = [];

  // Walk days newest-first
  const sortedDates = Object.keys(days).sort().reverse();
  for (const date of sortedDates) {
    const day = days[date];
    for (const mealType of Object.keys(day.meals || {})) {
      for (const food of day.meals[mealType]) {
        if (!food.name) continue;
        const key = food.name.toLowerCase();
        if (!key.includes(q)) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ ...food, source: food.source || 'history' });
      }
    }
  }
  return results;
}

// Get the blocklist of foods hidden from recents
function getHiddenRecents() {
  return read(KEYS.hiddenRecents) || {};
}

// Add a food to the hidden recents blocklist (prevents it from appearing in recents)
export function hideRecentFood(mealType, foodName) {
  const hidden = getHiddenRecents();
  if (!hidden[mealType]) hidden[mealType] = new Set();
  if (typeof hidden[mealType] === 'object' && !Array.isArray(hidden[mealType]) && !(hidden[mealType] instanceof Set)) {
    // Convert from serialized array back to Set
    hidden[mealType] = new Set(hidden[mealType]);
  } else if (Array.isArray(hidden[mealType])) {
    hidden[mealType] = new Set(hidden[mealType]);
  } else if (!(hidden[mealType] instanceof Set)) {
    hidden[mealType] = new Set();
  }
  hidden[mealType].add(foodName.toLowerCase());
  // Convert Sets to arrays for JSON serialization
  const serialized = {};
  for (const [type, names] of Object.entries(hidden)) {
    serialized[type] = Array.from(names);
  }
  write(KEYS.hiddenRecents, serialized);
}

export function getRecentFoodsByMealType(mealType, limit = 20) {
  const days = getAllDays();
  const seen = new Set();
  const hidden = getHiddenRecents();
  const hiddenNames = new Set((hidden[mealType] || []).map(n => n.toLowerCase()));
  const results = [];

  // Walk days newest-first
  const sortedDates = Object.keys(days).sort().reverse();
  for (const date of sortedDates) {
    if (results.length >= limit) break;
    const day = days[date];
    const meals = day.meals || {};
    const mealsInType = meals[mealType] || [];

    for (const food of mealsInType) {
      if (!food.name) continue;
      const key = food.name.toLowerCase();
      if (seen.has(key)) continue;
      if (hiddenNames.has(key)) continue;  // Skip blocklisted foods
      seen.add(key);
      results.push({ ...food, source: food.source || 'history' });
      if (results.length >= limit) break;
    }
  }
  return results;
}

// Hide a food from recents without deleting historical data
// NOTE: This uses a blocklist, so historical meal data is preserved
export function removeRecentFood(mealType, foodName) {
  hideRecentFood(mealType, foodName);
}

// Hide a food across ALL meal types (used when dismissing a favorite — the user
// doesn't want to see this food re-appear as a recent in the same meal type either).
export function hideFromAllRecents(foodName) {
  for (const mealType of ['breakfast', 'lunch', 'dinner', 'snacks']) {
    hideRecentFood(mealType, foodName);
  }
}

// ── Daily Totals ──

export function getDayTotals(dateStr) {
  const day = getDay(dateStr);
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, addedSugars: 0 };
  for (const mealType of Object.keys(day.meals)) {
    for (const food of day.meals[mealType]) {
      // Enrich food with latest COMMON_FOODS data (fills in missing fields like addedSugars)
      const commonFood = getCommonFood(food.name);
      const enriched = commonFood ? { ...commonFood, ...food } : food;

      const mult = enriched.servings || 1;
      totals.calories += (enriched.calories || 0) * mult;
      totals.protein += (enriched.protein || 0) * mult;
      totals.carbs += (enriched.carbs || 0) * mult;
      totals.fat += (enriched.fat || 0) * mult;
      totals.addedSugars += (enriched.addedSugars || 0) * mult;
    }
  }
  totals.calories = Math.round(totals.calories);
  totals.protein = Math.round(totals.protein);
  totals.carbs = Math.round(totals.carbs);
  totals.fat = Math.round(totals.fat);
  totals.addedSugars = Math.round(totals.addedSugars);
  return totals;
}

// ── Multi-day Analytics ──

export function getLast7Days(fromDate = null) {
  if (fromDate === null || fromDate === undefined) {
    fromDate = todayStr();
  }
  const days = [];
  for (let i = 0; i < 7; i++) {
    days.unshift(shiftDate(fromDate, -i));
  }
  return days;
}

export function getTotalsForRange(startDate, endDate) {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, addedSugars: 0 };

  // Iterate through all dates between startDate and endDate
  const current = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');

  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;

    const dayTotals = getDayTotals(dateStr);
    totals.calories += dayTotals.calories;
    totals.protein += dayTotals.protein;
    totals.carbs += dayTotals.carbs;
    totals.fat += dayTotals.fat;
    totals.addedSugars += dayTotals.addedSugars;

    current.setDate(current.getDate() + 1);
  }

  return totals;
}

export function getFoodsForRange(startDate, endDate) {
  const foods = [];

  // Iterate through all dates between startDate and endDate
  const current = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');

  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;

    const dayData = getDay(dateStr);
    for (const mealType of Object.keys(dayData.meals || {})) {
      for (const food of dayData.meals[mealType]) {
        foods.push({
          ...food,
          date: dateStr,
          mealType: mealType,
        });
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return foods;
}

export function getStreak() {
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const day = getDay(dateStr);
    const total = Object.values(day.meals || {}).reduce((sum, arr) => sum + (arr?.length || 0), 0);
    if (total === 0) {
      // Allow today to be empty without breaking streak
      if (i === 0) continue;
      break;
    }
    streak++;
  }
  return streak;
}
