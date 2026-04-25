// api.js — Nutrition API integration (USDA FoodData Central + Open Food Facts)
import { COMMON_FOODS } from './common-foods.js';

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';
const OFF_BASE = 'https://world.openfoodfacts.net';

// Map locale region codes to Open Food Facts country tags
const OFF_COUNTRY_TAGS = {
  US: 'en:united-states',
  CA: 'en:canada',
  GB: 'en:united-kingdom',
  AU: 'en:australia',
  NZ: 'en:new-zealand',
  IE: 'en:ireland',
  FR: 'en:france',
  DE: 'en:germany',
  ES: 'en:spain',
  IT: 'en:italy',
  MX: 'en:mexico',
  BR: 'en:brazil',
  IN: 'en:india',
  JP: 'en:japan',
};

function detectOffCountryTag() {
  const lang = (navigator.language || navigator.languages?.[0] || '').toUpperCase();
  const region = lang.split('-')[1]; // "EN-US" → "US"
  return region ? (OFF_COUNTRY_TAGS[region] || null) : null;
}

// Parse Open Food Facts `serving_size` strings into a {size, unit} pair.
// Examples:
//   "1 burrito (170g)" → { size: 1, unit: 'burrito (170g)' }
//   "28 g"             → { size: 28, unit: 'g' }
//   "1 pouch (90g)"    → { size: 1, unit: 'pouch (90g)' }
//   "5.5 oz"           → { size: 5.5, unit: 'oz' }
//   ""                 → { size: '', unit: '' }
// Falls back to using `serving_quantity` (always grams) if the label is empty.
export function parseServingLabel(label, fallbackQty) {
  const trimmed = (label || '').trim();
  const m = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (m) {
    const size = Math.round(parseFloat(m[1].replace(',', '.')) * 10) / 10;
    const unit = m[2].trim() || 'serving';
    return { size, unit };
  }
  if (trimmed) return { size: 1, unit: trimmed };
  // No usable label — fall back to grams from serving_quantity (numeric)
  const qty = parseFloat(fallbackQty);
  if (qty && isFinite(qty)) return { size: Math.round(qty * 10) / 10, unit: 'g' };
  return { size: '', unit: '' };
}

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

// Extract added sugars from Open Food Facts data
function extractAddedSugarsFromOFF(product) {
  // Look for added_sugars_100g or sugars_100g field
  if (product.sugars_100g && product.sugars_100g > 0) {
    // For now, use total sugars as a proxy if no added sugar is explicitly marked
    // A better source would be the NOVA classification, but OFF's added_sugars field is unreliable
    return Math.round(product.sugars_100g * 10) / 10;
  }
  return null;
}


export function searchCommonFoods(query) {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/);
  return COMMON_FOODS
    .filter(f => queryWords.every(w => f.tags.includes(w) || f.name.toLowerCase().includes(w)))
    .map(({ tags, ...food }) => food);
}

// Look up a food in COMMON_FOODS by exact name match (case-insensitive)
// Returns the food entry or null if not found
export function getCommonFood(foodName) {
  if (!foodName) return null;
  const nameLower = foodName.toLowerCase();
  return COMMON_FOODS.find(f => f.name.toLowerCase() === nameLower) || null;
}

// ── USDA FoodData Central ──

// Fetch results from USDA + Open Food Facts only (no local data).
// Returns deduped list ordered: USDA generic → OFF branded → USDA branded.
export async function searchFoodsFromAPI(query, pageSize = 15, alreadySeen = new Set()) {
  if (!query || query.trim().length < 2) return [];

  const [usdaResults, offResults] = await Promise.all([
    searchUSDA(query, pageSize),
    searchOpenFoodFacts(query, pageSize),
  ]);

  const usdaGeneric = usdaResults.filter(f => f._dataType !== 'Branded');
  const usdaBranded = usdaResults.filter(f => f._dataType === 'Branded');

  const seen = new Set(alreadySeen);
  const merged = [];

  function addAll(list) {
    for (const { _dataType, ...food } of list) {
      const key = food.name.toLowerCase();
      if (!seen.has(key)) { seen.add(key); merged.push(food); }
    }
  }

  addAll(usdaGeneric);
  addAll(offResults);
  addAll(usdaBranded);

  return merged.slice(0, pageSize);
}

// Legacy combined search — kept for any future use
export async function searchFoods(query, pageSize = 15) {
  if (!query || query.trim().length < 2) return [];
  const commonResults = searchCommonFoods(query);
  const seen = new Set(commonResults.map(f => f.name.toLowerCase()));
  const apiResults = await searchFoodsFromAPI(query, pageSize, seen);
  return [...commonResults, ...apiResults].slice(0, pageSize);
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
          _dataType: food.dataType,
        };
      })
      .sort((a, b) => a._score - b._score)
      .slice(0, pageSize)
      .map(({ _score, ...food }) => food); // keep _dataType for merge split, stripped later
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
    const countryTag = detectOffCountryTag();
    const params = new URLSearchParams({
      search_terms: query,
      search_simple: '1',
      action: 'process',
      json: '1',
      page_size: String(pageSize),
      fields: 'product_name,brands,serving_quantity,serving_size,nutriments',
      ...(countryTag && {
        tagtype_0: 'countries',
        tag_contains_0: 'contains',
        tag_0: countryTag,
      }),
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
          // Use the full `serving_size` label (e.g. "1 burrito (170g)") rather than
          // grafting the gram qty onto the first matched word (which produced "170 burrito").
          ({ size: servingSize, unit: servingUnit } = parseServingLabel(p.serving_size, p.serving_quantity));
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

  let calories, protein, carbs, fat, servingSize, servingUnit;

  if (nm['energy-kcal_serving'] != null) {
    // Prefer per-serving values — calories shown match the package label
    calories = Math.round(nm['energy-kcal_serving'] || 0);
    protein  = Math.round((nm.proteins_serving       || 0) * 10) / 10;
    carbs    = Math.round((nm.carbohydrates_serving  || 0) * 10) / 10;
    fat      = Math.round((nm.fat_serving            || 0) * 10) / 10;
    ({ size: servingSize, unit: servingUnit } = parseServingLabel(p.serving_size, p.serving_quantity));
  } else {
    // Fall back to per-100g
    calories = Math.round(nm['energy-kcal_100g'] || nm['energy-kcal'] || 0);
    protein  = Math.round((nm.proteins_100g      || 0) * 10) / 10;
    carbs    = Math.round((nm.carbohydrates_100g || 0) * 10) / 10;
    fat      = Math.round((nm.fat_100g           || 0) * 10) / 10;
    servingSize = 100;
    servingUnit = 'g';
  }

  return {
    name: p.product_name || 'Unknown Product',
    brand: p.brands || null,
    servingSize,
    servingUnit,
    calories,
    protein,
    carbs,
    fat,
    source: 'openfoodfacts',
    barcode,
  };
}

// ── AI Photo Analysis (OpenAI GPT-4o Vision) ──

async function resizeImageToBase64(file, maxDim = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export async function analyzePhoto(file) {
  const key = localStorage.getItem('mt_openai_key');
  if (!key) throw Object.assign(new Error('API key not set'), { code: 'no_key' });

  const base64 = await resizeImageToBase64(file, 800);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Identify every distinct food item in this meal photo and estimate nutrition for the visible portion.

Return ONLY a JSON array, no markdown, no explanation:
[{"name":"Grilled chicken breast","amount":6,"unit":"oz","calories":280,"protein":52,"carbs":0,"fat":6}]

Rules:
- Calories and macros are for the estimated portion visible, not per 100g
- Use realistic home/restaurant portion sizes
- Mixed dishes (curry, soup, stew) → single item
- Round calories to nearest 5, macros to nearest 1g`,
          },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64}`, detail: 'low' },
          },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) throw Object.assign(new Error('Invalid API key'), { code: 'auth_error' });
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices[0].message.content.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Unexpected response from AI');

  return JSON.parse(match[0]).map(item => ({
    name: item.name,
    servingSize: item.amount,
    servingUnit: item.unit,
    calories: Math.round(item.calories),
    protein: Math.round((item.protein || 0) * 10) / 10,
    carbs:   Math.round((item.carbs   || 0) * 10) / 10,
    fat:     Math.round((item.fat     || 0) * 10) / 10,
    source: 'ai',
  }));
}

// ── Debounce helper ──

export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
