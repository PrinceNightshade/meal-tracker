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
    assert.equal(store.getWeight('2026-03-29'), '185.5');
  });

  test('getWeight returns null for unknown date', () => {
    assert.equal(store.getWeight('2000-01-01'), null);
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
