// store.js — localStorage data layer
const KEYS = {
  days: 'mt_days',
  goals: 'mt_goals',
  favorites: 'mt_favorites',
  weight: 'mt_weight',
  profile: 'mt_profile',
};

const DEFAULT_GOALS = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 65,
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
  localStorage.setItem(key, JSON.stringify(data));
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
    && g.carbs === DEFAULT_GOALS.carbs && g.fat === DEFAULT_GOALS.fat;
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

// ── Favorites ──

export function getFavorites() {
  return read(KEYS.favorites) || [];
}

export function addFavorite(food) {
  const favs = getFavorites();
  const fav = { ...food };
  delete fav.id;
  fav.favId = crypto.randomUUID();
  favs.push(fav);
  write(KEYS.favorites, favs);
}

export function removeFavorite(favId) {
  const favs = getFavorites().filter(f => f.favId !== favId);
  write(KEYS.favorites, favs);
}

export function replaceFavorites(items) {
  write(KEYS.favorites, items);
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

export function getWeightHistory(days = 30) {
  const all = getAllWeight();
  const entries = Object.entries(all)
    .map(([date, weight]) => ({ date, weight }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return days ? entries.slice(-days) : entries;
}

export function getWeightStats() {
  const history = getWeightHistory(0); // all
  if (history.length === 0) return null;
  const current = history[history.length - 1].weight;
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().split('T')[0];
  const weekEntry = history.find(e => e.date >= weekAgoStr);
  const first = history[0];
  return {
    current,
    weekChange: weekEntry ? +(current - weekEntry.weight).toFixed(1) : null,
    totalChange: +(current - first.weight).toFixed(1),
    entries: history.length,
    startDate: first.date,
  };
}

export function getWeightProjection() {
  const history = getWeightHistory(0);
  const goals = getGoals();
  if (!goals.weightGoal || history.length < 2) return null;

  const target = goals.weightGoal;
  const current = history[history.length - 1].weight;

  // Already at or past goal
  const losing = target < current;
  if ((losing && current <= target) || (!losing && current >= target)) {
    return { reached: true, current, target };
  }

  // Calculate average daily weight change using linear regression over all data
  const first = history[0];
  const last = history[history.length - 1];
  const daysBetween = (new Date(last.date) - new Date(first.date)) / (1000 * 60 * 60 * 24);
  if (daysBetween < 1) return null;

  const dailyChange = (last.weight - first.weight) / daysBetween;

  // If trend is going the wrong direction, can't project
  if (losing && dailyChange >= 0) return { noProgress: true, current, target, dailyChange };
  if (!losing && dailyChange <= 0) return { noProgress: true, current, target, dailyChange };

  const remaining = target - current;
  const daysToGoal = Math.ceil(Math.abs(remaining / dailyChange));

  const estDate = new Date();
  estDate.setDate(estDate.getDate() + daysToGoal);
  const estDateStr = estDate.toISOString().split('T')[0];

  return {
    current,
    target,
    dailyChange: +dailyChange.toFixed(2),
    daysToGoal,
    estDate: estDateStr,
    lbsPerWeek: +(dailyChange * 7).toFixed(1),
  };
}

// ── Daily Totals ──

export function getDayTotals(dateStr) {
  const day = getDay(dateStr);
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const mealType of Object.keys(day.meals)) {
    for (const food of day.meals[mealType]) {
      const mult = food.servings || 1;
      totals.calories += (food.calories || 0) * mult;
      totals.protein += (food.protein || 0) * mult;
      totals.carbs += (food.carbs || 0) * mult;
      totals.fat += (food.fat || 0) * mult;
    }
  }
  totals.calories = Math.round(totals.calories);
  totals.protein = Math.round(totals.protein);
  totals.carbs = Math.round(totals.carbs);
  totals.fat = Math.round(totals.fat);
  return totals;
}
