// api.js — Nutrition API integration (USDA FoodData Central + Open Food Facts)

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';
const OFF_BASE = 'https://world.openfoodfacts.net';

// Free USDA API key — public data, no billing
const USDA_API_KEY = 'HGLL5EFe4RWMraaWCSRDqtZdl131ajiERSfuQPcu';

// Nutrient IDs in USDA data
const NUTRIENT_MAP = {
  1008: 'calories',  // Energy (kcal)
  1003: 'protein',   // Protein
  1005: 'carbs',     // Carbohydrate
  1004: 'fat',       // Total fat
};

function extractNutrients(foodNutrients) {
  const result = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const n of foodNutrients) {
    const id = n.nutrientId || n.nutrient?.id;
    const key = NUTRIENT_MAP[id];
    if (key) {
      result[key] = Math.round((n.value || 0) * 10) / 10;
    }
  }
  return result;
}

// ── Common foods that databases handle poorly ──
// These are standard preparations not well-represented in USDA/OFF
const COMMON_FOODS = [
  { name: 'Cappuccino', servingSize: 8, servingUnit: 'fl oz', calories: 80, protein: 4, carbs: 6, fat: 4, source: 'common', tags: 'cappuccino coffee espresso latte milk' },
  { name: 'Cappuccino (large, 16oz)', servingSize: 16, servingUnit: 'fl oz', calories: 160, protein: 8, carbs: 12, fat: 8, source: 'common', tags: 'cappuccino coffee espresso latte milk large' },
  { name: 'Latte', servingSize: 12, servingUnit: 'fl oz', calories: 150, protein: 8, carbs: 12, fat: 6, source: 'common', tags: 'latte coffee espresso milk' },
  { name: 'Latte (large, 16oz)', servingSize: 16, servingUnit: 'fl oz', calories: 200, protein: 10, carbs: 16, fat: 8, source: 'common', tags: 'latte coffee espresso milk large' },
  { name: 'Espresso (single shot)', servingSize: 1, servingUnit: 'fl oz', calories: 3, protein: 0, carbs: 0.5, fat: 0, source: 'common', tags: 'espresso coffee shot' },
  { name: 'Espresso (double shot)', servingSize: 2, servingUnit: 'fl oz', calories: 6, protein: 0, carbs: 1, fat: 0, source: 'common', tags: 'espresso coffee shot double' },
  { name: 'Black Coffee (brewed)', servingSize: 8, servingUnit: 'fl oz', calories: 2, protein: 0, carbs: 0, fat: 0, source: 'common', tags: 'coffee black brewed drip' },
  { name: 'Flat White', servingSize: 8, servingUnit: 'fl oz', calories: 120, protein: 6, carbs: 9, fat: 6, source: 'common', tags: 'flat white coffee espresso milk' },
  { name: 'Mocha', servingSize: 12, servingUnit: 'fl oz', calories: 290, protein: 8, carbs: 35, fat: 12, source: 'common', tags: 'mocha coffee espresso chocolate milk' },
  { name: 'Americano', servingSize: 12, servingUnit: 'fl oz', calories: 10, protein: 0, carbs: 1, fat: 0, source: 'common', tags: 'americano coffee espresso water' },
  { name: 'Croissant', servingSize: 1, servingUnit: 'medium (57g)', calories: 231, protein: 5, carbs: 26, fat: 12, source: 'common', tags: 'croissant pastry bread butter' },
  { name: 'Croissant (large/Costco)', servingSize: 1, servingUnit: 'large (85g)', calories: 340, protein: 7, carbs: 38, fat: 17, source: 'common', tags: 'croissant pastry bread butter large costco kirkland' },
  { name: 'Bagel (plain)', servingSize: 1, servingUnit: 'medium (105g)', calories: 270, protein: 10, carbs: 53, fat: 2, source: 'common', tags: 'bagel bread plain' },
  { name: 'Banana', servingSize: 1, servingUnit: 'medium (118g)', calories: 105, protein: 1, carbs: 27, fat: 0, source: 'common', tags: 'banana fruit' },
  { name: 'Apple', servingSize: 1, servingUnit: 'medium (182g)', calories: 95, protein: 0, carbs: 25, fat: 0, source: 'common', tags: 'apple fruit' },
  { name: 'Scrambled Eggs (2 large)', servingSize: 2, servingUnit: 'eggs', calories: 182, protein: 12, carbs: 2, fat: 14, source: 'common', tags: 'eggs scrambled breakfast' },
  { name: 'Fried Egg', servingSize: 1, servingUnit: 'large egg', calories: 90, protein: 6, carbs: 0, fat: 7, source: 'common', tags: 'egg fried breakfast' },
  { name: 'Toast (white, 1 slice)', servingSize: 1, servingUnit: 'slice', calories: 75, protein: 2, carbs: 14, fat: 1, source: 'common', tags: 'toast bread white slice breakfast' },
  { name: 'Toast (whole wheat, 1 slice)', servingSize: 1, servingUnit: 'slice', calories: 70, protein: 4, carbs: 12, fat: 1, source: 'common', tags: 'toast bread whole wheat slice breakfast' },
  { name: 'Avocado Toast', servingSize: 1, servingUnit: 'slice', calories: 190, protein: 5, carbs: 18, fat: 12, source: 'common', tags: 'avocado toast bread breakfast' },
  { name: 'Greek Yogurt (plain, nonfat)', servingSize: 1, servingUnit: 'cup (227g)', calories: 130, protein: 22, carbs: 9, fat: 0, source: 'common', tags: 'greek yogurt plain nonfat' },
  { name: 'Oatmeal (cooked)', servingSize: 1, servingUnit: 'cup', calories: 154, protein: 5, carbs: 27, fat: 3, source: 'common', tags: 'oatmeal oats porridge breakfast' },
  { name: 'Chicken Breast (grilled)', servingSize: 6, servingUnit: 'oz', calories: 280, protein: 52, carbs: 0, fat: 6, source: 'common', tags: 'chicken breast grilled' },
  { name: 'White Rice (cooked)', servingSize: 1, servingUnit: 'cup', calories: 205, protein: 4, carbs: 45, fat: 0, source: 'common', tags: 'rice white cooked' },
  { name: 'Brown Rice (cooked)', servingSize: 1, servingUnit: 'cup', calories: 215, protein: 5, carbs: 45, fat: 2, source: 'common', tags: 'rice brown cooked' },
];

function searchCommonFoods(query) {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/);
  return COMMON_FOODS
    .filter(f => queryWords.every(w => f.tags.includes(w) || f.name.toLowerCase().includes(w)))
    .map(({ tags, ...food }) => food);
}

// ── USDA FoodData Central ──

export async function searchFoods(query, pageSize = 15) {
  if (!query || query.trim().length < 2) return [];

  // Check built-in common foods first
  const commonResults = searchCommonFoods(query);

  // Query USDA and Open Food Facts in parallel
  const [usdaResults, offResults] = await Promise.all([
    searchUSDA(query, pageSize),
    searchOpenFoodFacts(query, pageSize),
  ]);

  // Merge: common first, then OFF branded results (better for packaged foods),
  // then USDA results, deduped by name
  const seen = new Set(commonResults.map(f => f.name.toLowerCase()));
  const merged = [...commonResults];

  // OFF results first — they tend to be branded/packaged products
  for (const food of offResults) {
    const key = food.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(food);
    }
  }

  // Then USDA results (whole foods, generics)
  for (const food of usdaResults) {
    const key = food.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(food);
    }
  }

  return merged.slice(0, pageSize);
}

async function searchUSDA(query, pageSize = 15) {
  try {
    const res = await fetch(`${USDA_BASE}/foods/search?api_key=${USDA_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        pageSize: 50,
        dataType: ['Foundation', 'SR Legacy', 'Branded'],
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (body?.error?.code === 'OVER_RATE_LIMIT') {
        console.warn('USDA rate limited');
      }
      return [];
    }

    const data = await res.json();
    if (!data.foods) return [];

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);
    const seen = new Set();

    return data.foods
      .filter(food => {
        if (seen.has(food.fdcId)) return false;
        seen.add(food.fdcId);
        return true;
      })
      .map(food => {
        const nutrients = extractNutrients(food.foodNutrients);
        const descLower = (food.description || '').toLowerCase();

        let score = 0;
        if (food.dataType === 'Foundation') score -= 20;
        else if (food.dataType === 'SR Legacy') score -= 15;

        if (descLower === queryLower) score -= 40;
        else if (descLower.startsWith(queryLower + ',') || descLower.startsWith(queryLower + ' ')) score -= 30;
        else if (descLower.startsWith(queryLower)) score -= 25;

        const allWordsMatch = queryWords.every(w => descLower.includes(w));
        if (allWordsMatch) score -= 10;

        if (descLower.length <= queryLower.length + 5) score -= 15;
        else if (descLower.length > 80) score += 10;

        const descWords = descLower.split(/[\s,]+/).filter(Boolean);
        const foodCategories = ['cookie', 'cookies', 'gelato', 'almonds', 'cake', 'cupcake',
          'cupcakes', 'meringue', 'meringues', 'candy', 'chocolate', 'bar', 'crisp',
          'wafer', 'ice cream', 'yogurt', 'cereal', 'mix'];
        if (foodCategories.some(cat => descWords.includes(cat))) score += 15;

        return {
          name: formatFoodName(food.description),
          brand: food.brandName || food.brandOwner || null,
          servingSize: food.servingSize || 100,
          servingUnit: food.servingSizeUnit || 'g',
          ...nutrients,
          source: 'usda',
          fdcId: food.fdcId,
          _score: score,
        };
      })
      .sort((a, b) => a._score - b._score)
      .slice(0, pageSize)
      .map(({ _score, ...food }) => food);
  } catch {
    return [];
  }
}

function formatFoodName(name) {
  if (!name) return 'Unknown';
  // USDA names are often ALL CAPS — title-case them
  if (name === name.toUpperCase() && name.length > 3) {
    return name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  return name;
}

// ── Open Food Facts (text search) ──

async function searchOpenFoodFacts(query, pageSize = 15) {
  try {
    const params = new URLSearchParams({
      search_terms: query,
      search_simple: '1',
      action: 'process',
      json: '1',
      page_size: String(pageSize),
      fields: 'product_name,brands,serving_quantity,serving_size,nutriments',
    });
    const res = await fetch(`${OFF_BASE}/cgi/search.pl?${params}`);
    if (!res.ok) return [];

    const data = await res.json();
    if (!data.products) return [];

    return data.products
      .filter(p => p.product_name && p.nutriments)
      .map(p => {
        const nm = p.nutriments || {};
        // OFF stores per-serving values with _serving suffix, fall back to per-100g
        const hasPer100g = nm['energy-kcal_100g'] != null;
        const hasPerServing = nm['energy-kcal_serving'] != null;

        let calories, protein, carbs, fat, servingSize, servingUnit;

        if (hasPerServing) {
          calories = Math.round(nm['energy-kcal_serving'] || 0);
          protein = Math.round((nm.proteins_serving || 0) * 10) / 10;
          carbs = Math.round((nm.carbohydrates_serving || 0) * 10) / 10;
          fat = Math.round((nm.fat_serving || 0) * 10) / 10;
          servingSize = '';
          servingUnit = p.serving_size || 'serving';
        } else if (hasPer100g) {
          calories = Math.round(nm['energy-kcal_100g'] || 0);
          protein = Math.round((nm.proteins_100g || 0) * 10) / 10;
          carbs = Math.round((nm.carbohydrates_100g || 0) * 10) / 10;
          fat = Math.round((nm.fat_100g || 0) * 10) / 10;
          servingSize = 100;
          servingUnit = 'g';
        } else {
          return null;
        }

        // Skip entries with zero calories and zero macros (bad data)
        if (calories === 0 && protein === 0 && carbs === 0 && fat === 0) return null;

        return {
          name: formatFoodName(p.product_name),
          brand: p.brands || null,
          servingSize,
          servingUnit,
          calories,
          protein,
          carbs,
          fat,
          source: 'openfoodfacts',
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ── Open Food Facts (barcode lookup) ──

export async function lookupBarcode(barcode) {
  const url = `${OFF_BASE}/api/v2/product/${barcode}.json`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;

  const p = data.product;
  const nm = p.nutriments || {};

  return {
    name: p.product_name || 'Unknown Product',
    brand: p.brands || null,
    servingSize: parseFloat(p.serving_quantity) || 100,
    servingUnit: p.serving_quantity ? 'serving' : 'g',
    calories: Math.round(nm['energy-kcal_100g'] || nm['energy-kcal'] || 0),
    protein: Math.round((nm.proteins_100g || 0) * 10) / 10,
    carbs: Math.round((nm.carbohydrates_100g || 0) * 10) / 10,
    fat: Math.round((nm.fat_100g || 0) * 10) / 10,
    source: 'openfoodfacts',
    barcode,
  };
}

// ── Debounce helper ──

export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
