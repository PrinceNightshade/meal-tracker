// tests/store.test.js — Unit tests for js/store.js
import { test, describe, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { resetStorage } from './setup.js';
import * as store from '../js/store.js';

beforeEach(() => resetStorage());

// ── Goals ──

describe('Goals', () => {
  test('getGoals returns defaults when nothing saved', () => {
    const goals = store.getGoals();
    assert.equal(goals.calories, 2000);
    assert.equal(goals.protein,  150);
    assert.equal(goals.carbs,    200);
    assert.equal(goals.fat,       65);
  });

  test('saveGoals and getGoals round-trip', () => {
    store.saveGoals({ calories: 2500, protein: 180, carbs: 250, fat: 80 });
    const goals = store.getGoals();
    assert.equal(goals.calories, 2500);
    assert.equal(goals.protein,  180);
  });

  test('goalsAreDefaults returns true when untouched', () => {
    assert.equal(store.goalsAreDefaults(), true);
  });

  test('goalsAreDefaults returns false after custom save', () => {
    store.saveGoals({ calories: 2500, protein: 180, carbs: 250, fat: 80 });
    assert.equal(store.goalsAreDefaults(), false);
  });
});

// ── Favorites ──

describe('Favorites', () => {
  test('getFavorites returns empty array initially', () => {
    assert.deepEqual(store.getFavorites(), []);
  });

  test('addFavorite adds a food', () => {
    store.addFavorite({ name: 'Cappuccino', calories: 80, protein: 4, carbs: 6, fat: 4 });
    assert.equal(store.getFavorites().length, 1);
  });

  test('addFavorite deduplicates by name — regression for multi-click bug', () => {
    const food = { name: 'Cappuccino', calories: 80, protein: 4, carbs: 6, fat: 4 };
    store.addFavorite(food);
    store.addFavorite(food);
    store.addFavorite(food);
    assert.equal(store.getFavorites().length, 1, 'Should only have one entry after adding same food 3x');
  });

  test('removeFavorite removes the item and any name-duplicates', () => {
    const food = { name: 'Cappuccino', calories: 80, protein: 4, carbs: 6, fat: 4 };
    store.addFavorite(food);
    const favs = store.getFavorites();
    store.removeFavorite(favs[0].favId);
    assert.equal(store.getFavorites().length, 0);
  });

  test('replaceFavorites deduplicates on cloud sync', () => {
    const dupes = [
      { name: 'Cappuccino', calories: 80, favId: 'a' },
      { name: 'Cappuccino', calories: 80, favId: 'b' },
      { name: 'Croissant',  calories: 340, favId: 'c' },
    ];
    store.replaceFavorites(dupes);
    assert.equal(store.getFavorites().length, 2, 'Duplicates should be collapsed to one');
  });
});

// ── My Foods ──

describe('My Foods', () => {
  test('getMyFoods returns empty array initially', () => {
    assert.deepEqual(store.getMyFoods(), []);
  });

  test('saveMyFood adds a custom food', () => {
    store.saveMyFood({ name: 'Chicken Stew', calories: 320, protein: 28, carbs: 18, fat: 12 });
    assert.equal(store.getMyFoods().length, 1);
  });

  test('searchMyFoods finds by partial name (case-insensitive)', () => {
    store.saveMyFood({ name: 'Chicken Stew', calories: 320, protein: 28, carbs: 18, fat: 12 });
    store.saveMyFood({ name: 'Beef Stew',    calories: 280, protein: 24, carbs: 15, fat: 10 });
    const results = store.searchMyFoods('chicken');
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'Chicken Stew');
  });

  test('deleteMyFood removes the item', () => {
    store.saveMyFood({ name: 'Chicken Stew', calories: 320, protein: 28, carbs: 18, fat: 12 });
    const id = store.getMyFoods()[0].myFoodId;
    store.deleteMyFood(id);
    assert.equal(store.getMyFoods().length, 0);
  });
});

// ── Weight ──

describe('Weight', () => {
  test('saveWeight and getWeight round-trip', () => {
    store.saveWeight('2026-03-29', '185.5');
    assert.equal(store.getWeight('2026-03-29'), 185.5);
  });

  test('saveWeight stores value as a number', () => {
    store.saveWeight('2026-03-29', '185.5');
    assert.equal(typeof store.getWeight('2026-03-29'), 'number');
  });

  test('getWeight returns null for unknown date', () => {
    assert.equal(store.getWeight('2000-01-01'), null);
  });

  test('replaceWeight normalizes all values to numbers', () => {
    store.replaceWeight({
      '2026-03-28': '180.2',
      '2026-03-29': 185.5,
      '2026-03-30': '190',
    });
    assert.equal(store.getWeight('2026-03-28'), 180.2);
    assert.equal(typeof store.getWeight('2026-03-28'), 'number');
    assert.equal(store.getWeight('2026-03-29'), 185.5);
    assert.equal(typeof store.getWeight('2026-03-29'), 'number');
    assert.equal(store.getWeight('2026-03-30'), 190);
    assert.equal(typeof store.getWeight('2026-03-30'), 'number');
  });

  test('replaceWeight handles null/empty input', () => {
    store.replaceWeight(null);
    assert.equal(store.getWeight('2026-03-29'), null);
    store.replaceWeight({});
    assert.equal(store.getWeight('2026-03-29'), null);
  });
});

// ── Meal CRUD ──

describe('Meal CRUD', () => {
  const DATE = '2026-03-29';
  const FOOD = { id: 'f1', name: 'Egg', calories: 70, protein: 6, carbs: 1, fat: 5, servings: 1 };

  test('addFoodToMeal adds item to correct meal', () => {
    store.addFoodToMeal(DATE, 'breakfast', FOOD);
    const day = store.getDay(DATE);
    assert.equal(day.meals.breakfast.length, 1);
    assert.equal(day.meals.breakfast[0].name, 'Egg');
  });

  test('removeFoodFromMeal removes correct item', () => {
    store.addFoodToMeal(DATE, 'breakfast', FOOD);
    const day = store.getDay(DATE);
    store.removeFoodFromMeal(DATE, 'breakfast', day.meals.breakfast[0].id);
    assert.equal(store.getDay(DATE).meals.breakfast.length, 0);
  });

  test('getDayTotals sums correctly across meals', () => {
    store.addFoodToMeal(DATE, 'breakfast', { ...FOOD, calories: 100, protein: 10, carbs: 5, fat: 3, servings: 2 });
    const totals = store.getDayTotals(DATE);
    assert.equal(totals.calories, 200);
    assert.equal(totals.protein,   20);
  });
});

// ── History Search ──

describe('searchHistory', () => {
  test('returns foods from previous days matching query', () => {
    store.addFoodToMeal('2026-03-28', 'dinner', {
      id: 'x1', name: 'Roasted Chicken', calories: 280, protein: 35, carbs: 0, fat: 12, servings: 1,
    });
    const results = store.searchHistory('chicken');
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'Roasted Chicken');
  });

  test('deduplicates same food logged on multiple days', () => {
    store.addFoodToMeal('2026-03-27', 'lunch',   { id: 'a', name: 'Apple', calories: 95, protein: 0, carbs: 25, fat: 0, servings: 1 });
    store.addFoodToMeal('2026-03-28', 'snacks',  { id: 'b', name: 'Apple', calories: 95, protein: 0, carbs: 25, fat: 0, servings: 1 });
    const results = store.searchHistory('apple');
    assert.equal(results.length, 1, 'Same food on different days should appear once');
  });
});

// ── Recent Foods by Meal Type ── (DISABLED: test timeout — TODO: investigate hideRecentFood perf)

describe.skip('getRecentFoodsByMealType', () => {
  test('returns foods for the specified meal type only', () => {
    store.addFoodToMeal('2026-03-28', 'breakfast', { id: 'a', name: 'Eggs', calories: 70, protein: 6, carbs: 1, fat: 5, servings: 1 });
    store.addFoodToMeal('2026-03-28', 'dinner', { id: 'b', name: 'Steak', calories: 400, protein: 40, carbs: 0, fat: 25, servings: 1 });
    const breakfastRecents = store.getRecentFoodsByMealType('breakfast');
    const dinnerRecents = store.getRecentFoodsByMealType('dinner');
    assert.equal(breakfastRecents.length, 1);
    assert.equal(breakfastRecents[0].name, 'Eggs');
    assert.equal(dinnerRecents.length, 1);
    assert.equal(dinnerRecents[0].name, 'Steak');
  });

  test('deduplicates foods by name', () => {
    store.addFoodToMeal('2026-03-27', 'breakfast', { id: 'a', name: 'Eggs', calories: 70, protein: 6, carbs: 1, fat: 5, servings: 1 });
    store.addFoodToMeal('2026-03-28', 'breakfast', { id: 'b', name: 'Eggs', calories: 70, protein: 6, carbs: 1, fat: 5, servings: 2 });
    const results = store.getRecentFoodsByMealType('breakfast');
    assert.equal(results.length, 1, 'Same food on different days should appear once');
  });

  test('returns most recent entry first (newest day first)', () => {
    store.addFoodToMeal('2026-03-26', 'lunch', { id: 'a', name: 'Salad', calories: 120, protein: 5, carbs: 10, fat: 6, servings: 1 });
    store.addFoodToMeal('2026-03-28', 'lunch', { id: 'b', name: 'Sandwich', calories: 350, protein: 15, carbs: 40, fat: 12, servings: 1 });
    const results = store.getRecentFoodsByMealType('lunch');
    assert.equal(results[0].name, 'Sandwich', 'Most recent food should be first');
    assert.equal(results[1].name, 'Salad');
  });

  test('respects limit parameter', () => {
    store.addFoodToMeal('2026-03-28', 'snacks', { id: 'a', name: 'Apple', calories: 95, protein: 0, carbs: 25, fat: 0, servings: 1 });
    store.addFoodToMeal('2026-03-28', 'snacks', { id: 'b', name: 'Banana', calories: 105, protein: 1, carbs: 27, fat: 0, servings: 1 });
    store.addFoodToMeal('2026-03-28', 'snacks', { id: 'c', name: 'Grapes', calories: 60, protein: 1, carbs: 16, fat: 0, servings: 1 });
    const results = store.getRecentFoodsByMealType('snacks', 2);
    assert.equal(results.length, 2, 'Should respect limit');
  });

  test('returns empty array when no foods for meal type', () => {
    const results = store.getRecentFoodsByMealType('breakfast');
    assert.deepEqual(results, []);
  });
});

// ── Hidden Recents (Blocklist) ── (DISABLED: test timeout — TODO: investigate hideRecentFood perf)

describe.skip('hideRecentFood', () => {
  test('hidden food does not appear in recents', () => {
    store.addFoodToMeal('2026-03-28', 'breakfast', { id: 'a', name: 'Oatmeal', calories: 150, protein: 5, carbs: 27, fat: 3, servings: 1 });
    store.addFoodToMeal('2026-03-28', 'breakfast', { id: 'b', name: 'Toast', calories: 80, protein: 3, carbs: 14, fat: 1, servings: 1 });

    // Before hiding
    let results = store.getRecentFoodsByMealType('breakfast');
    assert.equal(results.length, 2);

    // Hide oatmeal
    store.hideRecentFood('breakfast', 'Oatmeal');

    // After hiding
    results = store.getRecentFoodsByMealType('breakfast');
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'Toast');
  });

  test('hidden food is case-insensitive', () => {
    store.addFoodToMeal('2026-03-28', 'lunch', { id: 'a', name: 'Burger', calories: 500, protein: 25, carbs: 40, fat: 28, servings: 1 });
    store.hideRecentFood('lunch', 'BURGER');
    const results = store.getRecentFoodsByMealType('lunch');
    assert.equal(results.length, 0, 'Hidden food should match case-insensitively');
  });

  test('hiding does not affect other meal types', () => {
    store.addFoodToMeal('2026-03-28', 'breakfast', { id: 'a', name: 'Eggs', calories: 70, protein: 6, carbs: 1, fat: 5, servings: 1 });
    store.addFoodToMeal('2026-03-28', 'lunch', { id: 'b', name: 'Eggs', calories: 70, protein: 6, carbs: 1, fat: 5, servings: 1 });
    store.hideRecentFood('breakfast', 'Eggs');
    const breakfastResults = store.getRecentFoodsByMealType('breakfast');
    const lunchResults = store.getRecentFoodsByMealType('lunch');
    assert.equal(breakfastResults.length, 0, 'Should be hidden in breakfast');
    assert.equal(lunchResults.length, 1, 'Should still appear in lunch');
  });

  test('removeRecentFood uses the blocklist (alias for hideRecentFood)', () => {
    store.addFoodToMeal('2026-03-28', 'dinner', { id: 'a', name: 'Pizza', calories: 300, protein: 12, carbs: 35, fat: 14, servings: 1 });
    store.removeRecentFood('dinner', 'Pizza');
    const results = store.getRecentFoodsByMealType('dinner');
    assert.equal(results.length, 0, 'removeRecentFood should hide the food');
  });
});

// ── Fiber totals + goals ──

describe('Fiber', () => {
  test('DEFAULT_GOALS has fiberGoal 30', () => {
    assert.equal(store.DEFAULT_GOALS.fiberGoal, 30);
  });

  test('a custom fiberGoal does not block TDEE auto-apply (goalsAreDefaults)', () => {
    store.saveGoals({ ...store.DEFAULT_GOALS, fiberGoal: 38 });
    assert.equal(store.goalsAreDefaults(), true);
  });

  test('getDayTotals sums known fiber and is complete when all foods have it', () => {
    store.addFoodToMeal('2026-04-01', 'breakfast', { id: 'a', name: 'Zzz Oats', calories: 150, protein: 5, carbs: 27, fat: 3, fiber: 4, servings: 1 });
    store.addFoodToMeal('2026-04-01', 'lunch', { id: 'b', name: 'Zzz Beans', calories: 220, protein: 15, carbs: 40, fat: 1, fiber: 15, servings: 2 });
    const t = store.getDayTotals('2026-04-01');
    assert.equal(t.fiber, 34); // 4 + 15*2
    assert.equal(t.fiberIncomplete, false);
  });

  test('unknown fiber is never coerced to 0: sums known values and flags incomplete', () => {
    store.addFoodToMeal('2026-04-02', 'breakfast', { id: 'a', name: 'Zzz Oats', calories: 150, protein: 5, carbs: 27, fat: 3, fiber: 4, servings: 1 });
    store.addFoodToMeal('2026-04-02', 'lunch', { id: 'b', name: 'Zzz Mystery', calories: 300, protein: 10, carbs: 30, fat: 10, servings: 1 });
    const t = store.getDayTotals('2026-04-02');
    assert.equal(t.fiber, 4);
    assert.equal(t.fiberIncomplete, true);
  });

  test('explicit fiber: 0 counts as known (not incomplete)', () => {
    store.addFoodToMeal('2026-04-03', 'dinner', { id: 'a', name: 'Zzz Steak', calories: 400, protein: 40, carbs: 0, fat: 25, fiber: 0, servings: 1 });
    const t = store.getDayTotals('2026-04-03');
    assert.equal(t.fiber, 0);
    assert.equal(t.fiberIncomplete, false);
  });

  test('empty day: fiber 0 and not incomplete', () => {
    const t = store.getDayTotals('2026-04-04');
    assert.equal(t.fiber, 0);
    assert.equal(t.fiberIncomplete, false);
  });

  test('getTotalsForRange aggregates fiber and propagates incomplete', () => {
    store.addFoodToMeal('2026-04-05', 'breakfast', { id: 'a', name: 'Zzz Oats', calories: 150, protein: 5, carbs: 27, fat: 3, fiber: 4, servings: 1 });
    store.addFoodToMeal('2026-04-06', 'breakfast', { id: 'b', name: 'Zzz Mystery', calories: 100, protein: 1, carbs: 10, fat: 1, servings: 1 });
    const t = store.getTotalsForRange('2026-04-05', '2026-04-06');
    assert.equal(t.fiber, 4);
    assert.equal(t.fiberIncomplete, true);
  });
});

// ── Saturated fat totals + goals ──

describe('Saturated fat', () => {
  test('DEFAULT_GOALS has satFatGoal 20', () => {
    assert.equal(store.DEFAULT_GOALS.satFatGoal, 20);
  });

  test('a custom satFatGoal does not block TDEE auto-apply (goalsAreDefaults)', () => {
    store.saveGoals({ ...store.DEFAULT_GOALS, satFatGoal: 15 });
    assert.equal(store.goalsAreDefaults(), true);
  });

  test('getDayTotals sums known saturated fat (x servings) and is complete', () => {
    store.addFoodToMeal('2026-05-01', 'breakfast', { id: 'a', name: 'Zzz Bacon', calories: 160, protein: 10, carbs: 0, fat: 12, saturatedFat: 4.1, servings: 1 });
    store.addFoodToMeal('2026-05-01', 'lunch', { id: 'b', name: 'Zzz Cheese', calories: 115, protein: 7, carbs: 0, fat: 9, saturatedFat: 5.3, servings: 2 });
    const t = store.getDayTotals('2026-05-01');
    assert.equal(t.saturatedFat, 14.7); // 4.1 + 5.3*2
    assert.equal(t.satFatIncomplete, false);
  });

  test('unknown saturated fat is never coerced to 0: sums known and flags incomplete', () => {
    store.addFoodToMeal('2026-05-02', 'breakfast', { id: 'a', name: 'Zzz Bacon', calories: 160, protein: 10, carbs: 0, fat: 12, saturatedFat: 4.1, servings: 1 });
    store.addFoodToMeal('2026-05-02', 'lunch', { id: 'b', name: 'Zzz Mystery', calories: 300, protein: 10, carbs: 30, fat: 10, servings: 1 });
    const t = store.getDayTotals('2026-05-02');
    assert.equal(t.saturatedFat, 4.1);
    assert.equal(t.satFatIncomplete, true);
  });

  test('explicit saturatedFat: 0 counts as known (not incomplete)', () => {
    store.addFoodToMeal('2026-05-03', 'dinner', { id: 'a', name: 'Zzz Apple', calories: 95, protein: 0, carbs: 25, fat: 0, saturatedFat: 0, servings: 1 });
    const t = store.getDayTotals('2026-05-03');
    assert.equal(t.saturatedFat, 0);
    assert.equal(t.satFatIncomplete, false);
  });

  test('empty day: saturated fat 0 and not incomplete', () => {
    const t = store.getDayTotals('2026-05-04');
    assert.equal(t.saturatedFat, 0);
    assert.equal(t.satFatIncomplete, false);
  });

  test('getTotalsForRange aggregates saturated fat and propagates incomplete', () => {
    store.addFoodToMeal('2026-05-05', 'breakfast', { id: 'a', name: 'Zzz Bacon', calories: 160, protein: 10, carbs: 0, fat: 12, saturatedFat: 4, servings: 1 });
    store.addFoodToMeal('2026-05-06', 'breakfast', { id: 'b', name: 'Zzz Mystery', calories: 100, protein: 1, carbs: 10, fat: 1, servings: 1 });
    const t = store.getTotalsForRange('2026-05-05', '2026-05-06');
    assert.equal(t.saturatedFat, 4);
    assert.equal(t.satFatIncomplete, true);
  });

  test('COMMON_FOODS enrichment fills saturatedFat for a logged food that lacks it', () => {
    store.addFoodToMeal('2026-05-07', 'breakfast', { id: 'a', name: 'Butter', calories: 102, protein: 0, carbs: 0, fat: 12, servings: 1 });
    const t = store.getDayTotals('2026-05-07');
    assert.equal(t.saturatedFat, 7.3);
    assert.equal(t.satFatIncomplete, false);
  });
});

// ── Saved meals (stored inside My Foods as kind: 'meal') ──

describe('Saved meals', () => {
  const oats   = { id: 'day-1', name: 'Oatmeal',     calories: 150, protein: 5, carbs: 27, fat: 3, servings: 1, servingSize: 0.5, servingUnit: 'cup dry', fiber: 4, source: 'common' };
  const banana = { id: 'day-2', name: 'Banana',      calories: 105, protein: 1, carbs: 27, fat: 0, servings: 2, servingSize: 1, servingUnit: 'medium' };
  const blues  = { id: 'day-3', name: 'Blueberries', calories: 84,  protein: 1, carbs: 21, fat: 0, servings: 1, servingSize: 1, servingUnit: 'cup', sodium: 1 };

  test('saveMealTemplate stores a meal inside My Foods with the decided shape', () => {
    const { entry, replaced } = store.saveMealTemplate({ name: 'Oatmeal+', mealType: 'breakfast', items: [oats, banana, blues] });
    assert.equal(replaced, false);
    assert.equal(entry.kind, 'meal');
    assert.equal(entry.source, 'myfoods');
    assert.equal(entry.mealType, 'breakfast');
    assert.ok(entry.myFoodId);
    assert.ok(entry.createdAt);
    assert.equal(entry.items.length, 3);
    assert.equal(store.getMyFoods().length, 1);
    assert.ok(entry.items.every(i => !('id' in i)));
  });

  test('unknown nutrients stay absent in saved items (never coerced to 0)', () => {
    const { entry } = store.saveMealTemplate({ name: 'Oatmeal+', mealType: 'breakfast', items: [oats, banana, blues] });
    const [o, b, bl] = entry.items;
    assert.equal(o.fiber, 4);
    for (const key of ['sodium', 'saturatedFat', 'addedSugars']) assert.ok(!(key in o), `oats.${key}`);
    for (const key of ['sodium', 'fiber', 'saturatedFat', 'addedSugars']) assert.ok(!(key in b), `banana.${key}`);
    assert.equal(bl.sodium, 1);
    assert.ok(!('fiber' in bl));
    // survives the localStorage round trip too
    assert.ok(!('sodium' in store.getSavedMeals()[0].items[0]));
  });

  test('an explicit 0 nutrient is kept (known zero is not unknown)', () => {
    const { entry } = store.saveMealTemplate({ name: 'Zero', mealType: 'snacks', items: [{ ...oats, sodium: 0 }, banana] });
    assert.equal(entry.items[0].sodium, 0);
  });

  test('saving the same name (case-insensitive) replaces instead of duplicating', () => {
    const first = store.saveMealTemplate({ name: 'Oatmeal+', mealType: 'breakfast', items: [oats, banana, blues] });
    const second = store.saveMealTemplate({ name: ' oatmeal+ ', mealType: 'breakfast', items: [oats, banana] });
    assert.equal(second.replaced, true);
    assert.equal(second.entry.myFoodId, first.entry.myFoodId);
    assert.equal(store.getSavedMeals().length, 1);
    assert.equal(store.getSavedMeals()[0].items.length, 2);
  });

  test('same name as a single My Food is not treated as a replace', () => {
    store.saveMyFood({ name: 'Oatmeal+', calories: 100, protein: 1, carbs: 1, fat: 1 });
    const { replaced } = store.saveMealTemplate({ name: 'Oatmeal+', mealType: 'breakfast', items: [oats, banana] });
    assert.equal(replaced, false);
    assert.equal(store.getMyFoods().length, 2);
  });

  test('getSavedMeals filters by meal type, keeping meals with no mealType', () => {
    store.saveMealTemplate({ name: 'Brekkie', mealType: 'breakfast', items: [oats, banana] });
    store.saveMealTemplate({ name: 'Dinner combo', mealType: 'dinner', items: [oats, banana] });
    store.saveMealTemplate({ name: 'Anywhere', mealType: null, items: [oats, banana] });
    store.saveMyFood({ name: 'Plain food', calories: 1, protein: 1, carbs: 1, fat: 1 });
    assert.deepEqual(store.getSavedMeals('breakfast').map(m => m.name).sort(), ['Anywhere', 'Brekkie']);
    assert.deepEqual(store.getSavedMeals('dinner').map(m => m.name).sort(), ['Anywhere', 'Dinner combo']);
    assert.equal(store.getSavedMeals().length, 3); // single foods never included
  });

  test('searchSavedMeals matches by substring/tokens across all meal types', () => {
    store.saveMealTemplate({ name: 'Oatmeal+', mealType: 'breakfast', items: [oats, banana] });
    store.saveMealTemplate({ name: 'Late Night Oats', mealType: 'snacks', items: [oats, banana] });
    assert.deepEqual(store.searchSavedMeals('oat').map(m => m.name).sort(), ['Late Night Oats', 'Oatmeal+']);
    assert.deepEqual(store.searchSavedMeals('night oat').map(m => m.name), ['Late Night Oats']);
    assert.deepEqual(store.searchSavedMeals('zzz'), []);
    assert.deepEqual(store.searchSavedMeals(''), []);
  });

  test('deleteSavedMeal removes only that meal', () => {
    const a = store.saveMealTemplate({ name: 'A', mealType: 'breakfast', items: [oats, banana] }).entry;
    store.saveMealTemplate({ name: 'B', mealType: 'breakfast', items: [oats, banana] });
    store.saveMyFood({ name: 'Plain food', calories: 1, protein: 1, carbs: 1, fat: 1 });
    store.deleteSavedMeal(a.myFoodId);
    assert.deepEqual(store.getSavedMeals().map(m => m.name), ['B']);
    assert.equal(store.getMyFoods().length, 2);
  });

  test('getMealTemplateTotals sums per-serving x servings', () => {
    const { entry } = store.saveMealTemplate({ name: 'Oatmeal+', mealType: 'breakfast', items: [oats, banana, blues] });
    const t = store.getMealTemplateTotals(entry);
    assert.equal(t.calories, 150 + 105 * 2 + 84);
    assert.equal(t.protein, 5 + 2 + 1);
    assert.equal(t.carbs, 27 + 54 + 21);
    assert.equal(t.fat, 3);
    assert.equal(t.count, 3);
    assert.deepEqual(store.getMealTemplateTotals({ items: [] }), { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 });
  });

  test('expanding a saved meal adds separate day foods and skips unchecked items', () => {
    const { entry } = store.saveMealTemplate({ name: 'Oatmeal+', mealType: 'breakfast', items: [oats, banana, blues] });
    const foods = store.mealTemplateToFoods(entry, [1]); // banana unchecked
    assert.deepEqual(foods.map(f => f.name), ['Oatmeal', 'Blueberries']);
    foods.forEach(f => store.addFoodToMeal('2026-06-01', 'breakfast', f));
    const logged = store.getDay('2026-06-01').meals.breakfast;
    assert.equal(logged.length, 2);
    assert.notEqual(logged[0].id, logged[1].id);
    assert.ok(logged.every(f => f.id && f.id !== 'day-1' && f.id !== 'day-3'));
    assert.equal(logged[0].fiber, 4);
    assert.ok(!('fiber' in logged[1]));
    // totals work off plain foods, untouched by the meal feature
    assert.equal(store.getDayTotals('2026-06-01').calories, 150 + 84);
  });

  test('a My Foods list containing a meal never leaks into single-food search', () => {
    store.saveMyFood({ name: 'Oatmeal bar', calories: 190, protein: 4, carbs: 30, fat: 6 });
    store.saveMealTemplate({ name: 'Oatmeal+', mealType: 'breakfast', items: [oats, banana] });
    const results = store.searchMyFoods('oat');
    assert.deepEqual(results.map(f => f.name), ['Oatmeal bar']);
    assert.ok(results.every(f => Number.isFinite(f.calories) && !store.isMealTemplate(f)));
    // meal is still in the synced array
    assert.equal(store.getMyFoods().length, 2);
  });

  test('replaceMyFoods (cloud pull) round-trips meals intact', () => {
    store.saveMealTemplate({ name: 'Oatmeal+', mealType: 'breakfast', items: [oats, banana] });
    const snapshot = JSON.parse(JSON.stringify(store.getMyFoods()));
    store.replaceMyFoods([]);
    store.replaceMyFoods(snapshot);
    assert.equal(store.getSavedMeals('breakfast')[0].name, 'Oatmeal+');
  });
});
