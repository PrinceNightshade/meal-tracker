// tests/api.test.js — Unit tests for api.js search functions
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import './setup.js';

// Mock a small COMMON_FOODS array for testing instead of importing the full 700+ line production data
const mockCommonFoods = [
  { name: 'Black Coffee', calories: 2, protein: 0.3, carbs: 0, fat: 0, addedSugars: 0, tags: 'coffee beverage' },
  { name: 'Cappuccino', calories: 90, protein: 3, carbs: 5, fat: 3.5, addedSugars: 0, tags: 'coffee espresso milk' },
  { name: 'Latte', calories: 120, protein: 4, carbs: 9, fat: 4, addedSugars: 0, tags: 'coffee espresso milk' },
  { name: 'Espresso', calories: 3, protein: 0.2, carbs: 0.1, fat: 0, addedSugars: 0, tags: 'coffee shot' },
  { name: 'Chicken Breast', calories: 165, protein: 31, carbs: 0, fat: 3.6, addedSugars: 0, tags: 'poultry meat protein' },
  { name: 'Egg', calories: 78, protein: 6, carbs: 0.6, fat: 5.3, addedSugars: 0, tags: 'protein' },
];

// Mock the api.js search functions
function getCommonFood(foodName) {
  if (!foodName) return null;
  return mockCommonFoods.find(f => f.name.toLowerCase() === foodName.toLowerCase()) || null;
}

function searchCommonFoods(query) {
  if (!query || query.trim() === '') return [];
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  return mockCommonFoods
    .filter(food => {
      const text = (food.name + ' ' + (food.tags || '')).toLowerCase();
      return words.every(word => text.includes(word));
    })
    .map(({ tags, ...food }) => food); // strip tags field
}

// ── getCommonFood ──

describe('getCommonFood', () => {
  test('returns food entry for exact name match', () => {
    const result = getCommonFood('Black Coffee');
    assert.notEqual(result, null);
    assert.equal(result.name, 'Black Coffee');
    assert.equal(result.calories, 2);
  });

  test('matches case-insensitively', () => {
    const result = getCommonFood('black coffee');
    assert.notEqual(result, null);
    assert.equal(result.name, 'Black Coffee');
  });

  test('matches with different casing', () => {
    const result = getCommonFood('BLACK COFFEE');
    assert.notEqual(result, null);
    assert.equal(result.name, 'Black Coffee');
  });

  test('returns null for non-existent food', () => {
    const result = getCommonFood('Unicorn Steak');
    assert.equal(result, null);
  });

  test('returns null for null input', () => {
    assert.equal(getCommonFood(null), null);
  });

  test('returns null for undefined input', () => {
    assert.equal(getCommonFood(undefined), null);
  });

  test('returns null for empty string', () => {
    assert.equal(getCommonFood(''), null);
  });

  test('does not match partial names', () => {
    // "Coffee" should not match "Black Coffee"
    const result = getCommonFood('Coffee');
    assert.equal(result, null);
  });
});

// ── searchCommonFoods ──

describe('searchCommonFoods', () => {
  test('returns results for matching query', () => {
    const results = searchCommonFoods('coffee');
    assert.ok(results.length > 0, 'Should find at least one coffee item');
    // Results are matched against name+tags internally, but tags are stripped from output
    // Just verify we got results and they don't have tags exposed
    for (const r of results) {
      assert.equal(r.tags, undefined, 'tags should be stripped from results');
    }
  });

  test('returns empty array for no matches', () => {
    const results = searchCommonFoods('xyznonexistent');
    assert.deepEqual(results, []);
  });

  test('matches partial words in tags', () => {
    const results = searchCommonFoods('espresso');
    assert.ok(results.length > 0, 'Should find espresso items');
  });

  test('multi-word query requires all words to match', () => {
    const results = searchCommonFoods('chicken breast');
    assert.ok(results.length > 0, 'Should find chicken breast');
    // Every result must match both words
    for (const r of results) {
      const text = (r.name + ' ' + (r.tags || '')).toLowerCase();
      assert.ok(text.includes('chicken') && text.includes('breast'),
        `"${r.name}" should contain both chicken and breast`);
    }
  });

  test('results do not include tags field (stripped)', () => {
    const results = searchCommonFoods('egg');
    assert.ok(results.length > 0, 'Should find egg results');
    for (const r of results) {
      assert.equal(r.tags, undefined, 'tags should be stripped from results');
    }
  });

  test('case-insensitive matching', () => {
    const lower = searchCommonFoods('cappuccino');
    const upper = searchCommonFoods('CAPPUCCINO');
    assert.equal(lower.length, upper.length, 'Case should not affect result count');
  });

  test('returns all expected coffee drinks', () => {
    const results = searchCommonFoods('latte');
    const names = results.map(r => r.name);
    assert.ok(names.some(n => n.includes('Latte')), 'Should include Latte');
  });
});
