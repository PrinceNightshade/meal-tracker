// api.js — Nutrition API integration (USDA FoodData Central + Open Food Facts)

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

// ── Common foods — curated whole-food entries that always surface first ──
const COMMON_FOODS = [

  // ── Coffee & Hot Drinks ──
  { name: 'Black Coffee', servingSize: 8, servingUnit: 'fl oz', calories: 2, protein: 0, carbs: 0, fat: 0, source: 'common', tags: 'coffee black brewed drip filter' },
  { name: 'Espresso (single shot)', servingSize: 1, servingUnit: 'fl oz', calories: 3, protein: 0, carbs: 0.5, fat: 0, source: 'common', tags: 'espresso coffee shot single' },
  { name: 'Espresso (double shot)', servingSize: 2, servingUnit: 'fl oz', calories: 6, protein: 0, carbs: 1, fat: 0, source: 'common', tags: 'espresso coffee shot double' },
  { name: 'Americano', servingSize: 12, servingUnit: 'fl oz', calories: 10, protein: 0, carbs: 1, fat: 0, source: 'common', tags: 'americano coffee espresso water' },
  { name: 'Cappuccino', servingSize: 8, servingUnit: 'fl oz', calories: 80, protein: 4, carbs: 6, fat: 4, source: 'common', tags: 'cappuccino coffee espresso latte milk' },
  { name: 'Cappuccino (large, 16oz)', servingSize: 16, servingUnit: 'fl oz', calories: 160, protein: 8, carbs: 12, fat: 8, source: 'common', tags: 'cappuccino coffee espresso latte milk large' },
  { name: 'Latte', servingSize: 12, servingUnit: 'fl oz', calories: 150, protein: 8, carbs: 12, fat: 6, source: 'common', tags: 'latte coffee espresso milk' },
  { name: 'Latte (large, 16oz)', servingSize: 16, servingUnit: 'fl oz', calories: 200, protein: 10, carbs: 16, fat: 8, source: 'common', tags: 'latte coffee espresso milk large' },
  { name: 'Flat White', servingSize: 8, servingUnit: 'fl oz', calories: 120, protein: 6, carbs: 9, fat: 6, source: 'common', tags: 'flat white coffee espresso milk' },
  { name: 'Mocha', servingSize: 12, servingUnit: 'fl oz', calories: 290, protein: 8, carbs: 35, fat: 12, source: 'common', tags: 'mocha coffee espresso chocolate milk' },
  { name: 'Cold Brew Coffee', servingSize: 12, servingUnit: 'fl oz', calories: 5, protein: 0, carbs: 1, fat: 0, source: 'common', tags: 'cold brew coffee black iced' },
  { name: 'Green Tea', servingSize: 8, servingUnit: 'fl oz', calories: 2, protein: 0, carbs: 0, fat: 0, source: 'common', tags: 'green tea hot drink' },
  { name: 'Black Tea', servingSize: 8, servingUnit: 'fl oz', calories: 2, protein: 0, carbs: 0, fat: 0, source: 'common', tags: 'black tea hot drink' },

  // ── Beverages ──
  { name: 'Whole Milk', servingSize: 1, servingUnit: 'cup (244ml)', calories: 149, protein: 8, carbs: 12, fat: 8, source: 'common', tags: 'whole milk dairy drink' },
  { name: '2% Milk', servingSize: 1, servingUnit: 'cup (244ml)', calories: 122, protein: 8, carbs: 12, fat: 5, source: 'common', tags: '2% milk reduced fat dairy drink' },
  { name: 'Skim Milk', servingSize: 1, servingUnit: 'cup (244ml)', calories: 83, protein: 8, carbs: 12, fat: 0, source: 'common', tags: 'skim nonfat milk dairy drink' },
  { name: 'Oat Milk', servingSize: 1, servingUnit: 'cup (240ml)', calories: 120, protein: 3, carbs: 16, fat: 5, source: 'common', tags: 'oat milk plant based dairy free drink' },
  { name: 'Almond Milk (unsweetened)', servingSize: 1, servingUnit: 'cup (240ml)', calories: 30, protein: 1, carbs: 1, fat: 3, source: 'common', tags: 'almond milk unsweetened plant based dairy free drink' },
  { name: 'Orange Juice', servingSize: 8, servingUnit: 'fl oz', calories: 110, protein: 2, carbs: 26, fat: 0, source: 'common', tags: 'orange juice oj drink' },
  { name: 'Apple Juice', servingSize: 8, servingUnit: 'fl oz', calories: 115, protein: 0, carbs: 28, fat: 0, source: 'common', tags: 'apple juice drink' },
  { name: 'Protein Shake (whey, water)', servingSize: 1, servingUnit: 'scoop (30g)', calories: 120, protein: 24, carbs: 3, fat: 2, source: 'common', tags: 'protein shake whey powder supplement' },
  { name: 'Protein Shake (whey, milk)', servingSize: 1, servingUnit: 'serving', calories: 270, protein: 32, carbs: 15, fat: 7, source: 'common', tags: 'protein shake whey milk supplement' },

  // ── Eggs ──
  { name: 'Egg (whole, large)', servingSize: 1, servingUnit: 'large egg', calories: 72, protein: 6, carbs: 0, fat: 5, source: 'common', tags: 'egg whole large raw boiled' },
  { name: 'Fried Egg', servingSize: 1, servingUnit: 'large egg', calories: 90, protein: 6, carbs: 0, fat: 7, source: 'common', tags: 'egg fried breakfast' },
  { name: 'Scrambled Eggs (2)', servingSize: 2, servingUnit: 'large eggs', calories: 182, protein: 12, carbs: 2, fat: 14, source: 'common', tags: 'eggs scrambled breakfast' },
  { name: 'Scrambled Eggs (3)', servingSize: 3, servingUnit: 'large eggs', calories: 273, protein: 18, carbs: 3, fat: 21, source: 'common', tags: 'eggs scrambled breakfast' },
  { name: 'Hard-Boiled Egg', servingSize: 1, servingUnit: 'large egg', calories: 78, protein: 6, carbs: 1, fat: 5, source: 'common', tags: 'egg hard boiled' },
  { name: 'Poached Egg', servingSize: 1, servingUnit: 'large egg', calories: 72, protein: 6, carbs: 0, fat: 5, source: 'common', tags: 'egg poached breakfast' },
  { name: 'Egg Whites (3)', servingSize: 3, servingUnit: 'egg whites', calories: 51, protein: 11, carbs: 1, fat: 0, source: 'common', tags: 'egg whites protein breakfast' },
  { name: 'Omelette (2 eggs, plain)', servingSize: 1, servingUnit: 'omelette', calories: 190, protein: 13, carbs: 1, fat: 15, source: 'common', tags: 'omelette omelet eggs breakfast' },
  { name: 'Omelette (3 eggs, cheese)', servingSize: 1, servingUnit: 'omelette', calories: 350, protein: 24, carbs: 2, fat: 27, source: 'common', tags: 'omelette omelet eggs cheese breakfast' },

  // ── Breakfast Foods ──
  { name: 'Oatmeal (cooked)', servingSize: 1, servingUnit: 'cup', calories: 154, protein: 5, carbs: 27, fat: 3, source: 'common', tags: 'oatmeal oats porridge breakfast hot cereal' },
  { name: 'Overnight Oats', servingSize: 1, servingUnit: 'cup', calories: 215, protein: 9, carbs: 36, fat: 5, source: 'common', tags: 'overnight oats breakfast' },
  { name: 'Granola', servingSize: 0.5, servingUnit: 'cup (58g)', calories: 250, protein: 6, carbs: 37, fat: 9, source: 'common', tags: 'granola cereal breakfast' },
  { name: 'Pancakes (2 medium)', servingSize: 2, servingUnit: 'pancakes', calories: 260, protein: 7, carbs: 40, fat: 8, source: 'common', tags: 'pancakes flapjacks breakfast' },
  { name: 'Waffle (1 large)', servingSize: 1, servingUnit: 'large waffle', calories: 220, protein: 6, carbs: 30, fat: 9, source: 'common', tags: 'waffle breakfast' },
  { name: 'French Toast (1 slice)', servingSize: 1, servingUnit: 'slice', calories: 150, protein: 5, carbs: 20, fat: 6, source: 'common', tags: 'french toast breakfast' },
  { name: 'Toast (white)', servingSize: 1, servingUnit: 'slice', calories: 75, protein: 2, carbs: 14, fat: 1, source: 'common', tags: 'toast bread white slice breakfast' },
  { name: 'Toast (whole wheat)', servingSize: 1, servingUnit: 'slice', calories: 70, protein: 4, carbs: 12, fat: 1, source: 'common', tags: 'toast bread whole wheat slice breakfast' },
  { name: 'Bagel (plain)', servingSize: 1, servingUnit: 'medium (105g)', calories: 270, protein: 10, carbs: 53, fat: 2, source: 'common', tags: 'bagel bread plain breakfast' },
  { name: 'Bagel (everything)', servingSize: 1, servingUnit: 'medium (105g)', calories: 270, protein: 10, carbs: 52, fat: 2, source: 'common', tags: 'bagel everything bread breakfast' },
  { name: 'English Muffin', servingSize: 1, servingUnit: 'muffin', calories: 130, protein: 5, carbs: 25, fat: 1, source: 'common', tags: 'english muffin bread breakfast' },
  { name: 'Croissant', servingSize: 1, servingUnit: 'medium (57g)', calories: 231, protein: 5, carbs: 26, fat: 12, source: 'common', tags: 'croissant pastry bread butter breakfast' },
  { name: 'Croissant (large/Costco)', servingSize: 1, servingUnit: 'large (85g)', calories: 340, protein: 7, carbs: 38, fat: 17, source: 'common', tags: 'croissant pastry bread butter large costco kirkland' },
  { name: 'Avocado Toast', servingSize: 1, servingUnit: 'slice', calories: 190, protein: 5, carbs: 18, fat: 12, source: 'common', tags: 'avocado toast bread breakfast' },
  { name: 'Breakfast Burrito', servingSize: 1, servingUnit: 'burrito', calories: 380, protein: 18, carbs: 40, fat: 16, source: 'common', tags: 'breakfast burrito eggs tortilla' },

  // ── Chicken ──
  { name: 'Chicken Breast (grilled)', servingSize: 6, servingUnit: 'oz', calories: 280, protein: 52, carbs: 0, fat: 6, source: 'common', tags: 'chicken breast grilled cooked' },
  { name: 'Chicken Breast (baked/roasted)', servingSize: 6, servingUnit: 'oz', calories: 275, protein: 51, carbs: 0, fat: 6, source: 'common', tags: 'chicken breast baked roasted cooked' },
  { name: 'Chicken Breast (4 oz)', servingSize: 4, servingUnit: 'oz', calories: 185, protein: 35, carbs: 0, fat: 4, source: 'common', tags: 'chicken breast cooked small' },
  { name: 'Chicken Thigh (bone-in, roasted)', servingSize: 1, servingUnit: 'thigh (109g)', calories: 255, protein: 26, carbs: 0, fat: 16, source: 'common', tags: 'chicken thigh bone in roasted baked' },
  { name: 'Chicken Thigh (boneless, cooked)', servingSize: 4, servingUnit: 'oz', calories: 210, protein: 28, carbs: 0, fat: 11, source: 'common', tags: 'chicken thigh boneless cooked' },
  { name: 'Chicken Drumstick (roasted)', servingSize: 1, servingUnit: 'drumstick (77g)', calories: 195, protein: 24, carbs: 0, fat: 11, source: 'common', tags: 'chicken drumstick leg roasted' },
  { name: 'Chicken Wing (roasted)', servingSize: 1, servingUnit: 'wing (29g)', calories: 86, protein: 8, carbs: 0, fat: 6, source: 'common', tags: 'chicken wing roasted baked' },
  { name: 'Rotisserie Chicken Breast', servingSize: 1, servingUnit: 'breast half', calories: 250, protein: 44, carbs: 0, fat: 8, source: 'common', tags: 'rotisserie chicken breast' },
  { name: 'Rotisserie Chicken Thigh', servingSize: 1, servingUnit: 'thigh', calories: 200, protein: 23, carbs: 0, fat: 12, source: 'common', tags: 'rotisserie chicken thigh' },
  { name: 'Chicken Stir Fry', servingSize: 1, servingUnit: 'cup', calories: 230, protein: 28, carbs: 12, fat: 7, source: 'common', tags: 'chicken stir fry' },
  { name: 'Ground Chicken (cooked)', servingSize: 4, servingUnit: 'oz', calories: 195, protein: 26, carbs: 0, fat: 10, source: 'common', tags: 'ground chicken cooked' },

  // ── Beef ──
  { name: 'Ground Beef (80/20, cooked)', servingSize: 4, servingUnit: 'oz', calories: 285, protein: 25, carbs: 0, fat: 20, source: 'common', tags: 'ground beef 80 20 cooked burger' },
  { name: 'Ground Beef (90/10, cooked)', servingSize: 4, servingUnit: 'oz', calories: 215, protein: 28, carbs: 0, fat: 11, source: 'common', tags: 'ground beef 90 10 lean cooked' },
  { name: 'Ground Beef (93/7, cooked)', servingSize: 4, servingUnit: 'oz', calories: 190, protein: 29, carbs: 0, fat: 8, source: 'common', tags: 'ground beef 93 7 extra lean cooked' },
  { name: 'Hamburger Patty (¼ lb)', servingSize: 1, servingUnit: 'patty (113g)', calories: 290, protein: 25, carbs: 0, fat: 20, source: 'common', tags: 'hamburger patty beef burger' },
  { name: 'Ribeye Steak', servingSize: 8, servingUnit: 'oz', calories: 620, protein: 52, carbs: 0, fat: 45, source: 'common', tags: 'ribeye steak beef grilled' },
  { name: 'Sirloin Steak', servingSize: 6, servingUnit: 'oz', calories: 310, protein: 44, carbs: 0, fat: 13, source: 'common', tags: 'sirloin steak beef grilled' },
  { name: 'New York Strip', servingSize: 8, servingUnit: 'oz', calories: 470, protein: 54, carbs: 0, fat: 27, source: 'common', tags: 'new york strip steak beef grilled' },
  { name: 'Filet Mignon', servingSize: 6, servingUnit: 'oz', calories: 320, protein: 42, carbs: 0, fat: 16, source: 'common', tags: 'filet mignon tenderloin steak beef' },
  { name: 'Flank Steak', servingSize: 4, servingUnit: 'oz', calories: 195, protein: 28, carbs: 0, fat: 9, source: 'common', tags: 'flank steak beef grilled' },
  { name: 'Skirt Steak', servingSize: 4, servingUnit: 'oz', calories: 205, protein: 25, carbs: 0, fat: 11, source: 'common', tags: 'skirt steak beef grilled' },
  { name: 'Beef Brisket (smoked)', servingSize: 4, servingUnit: 'oz', calories: 290, protein: 28, carbs: 0, fat: 19, source: 'common', tags: 'brisket beef smoked bbq' },
  { name: 'Beef Stew', servingSize: 1, servingUnit: 'cup', calories: 260, protein: 22, carbs: 18, fat: 11, source: 'common', tags: 'beef stew cooked' },
  { name: 'Meatballs (beef)', servingSize: 3, servingUnit: 'meatballs', calories: 220, protein: 16, carbs: 6, fat: 15, source: 'common', tags: 'meatballs beef cooked' },

  // ── Pork ──
  { name: 'Bacon (pan-fried)', servingSize: 3, servingUnit: 'slices (34g)', calories: 160, protein: 11, carbs: 0, fat: 12, source: 'common', tags: 'bacon pork fried breakfast' },
  { name: 'Bacon (1 slice)', servingSize: 1, servingUnit: 'slice (11g)', calories: 54, protein: 4, carbs: 0, fat: 4, source: 'common', tags: 'bacon pork slice fried' },
  { name: 'Pork Tenderloin (roasted)', servingSize: 4, servingUnit: 'oz', calories: 190, protein: 31, carbs: 0, fat: 6, source: 'common', tags: 'pork tenderloin roasted lean' },
  { name: 'Pork Chop (bone-in, grilled)', servingSize: 1, servingUnit: 'chop (156g)', calories: 320, protein: 38, carbs: 0, fat: 18, source: 'common', tags: 'pork chop bone in grilled' },
  { name: 'Pork Chop (boneless, grilled)', servingSize: 1, servingUnit: 'chop (140g)', calories: 290, protein: 36, carbs: 0, fat: 15, source: 'common', tags: 'pork chop boneless grilled' },
  { name: 'Ham (deli sliced)', servingSize: 4, servingUnit: 'slices (57g)', calories: 70, protein: 11, carbs: 1, fat: 3, source: 'common', tags: 'ham deli sliced lunch meat pork' },
  { name: 'Ham (baked)', servingSize: 4, servingUnit: 'oz', calories: 200, protein: 26, carbs: 0, fat: 10, source: 'common', tags: 'ham baked pork' },
  { name: 'Pulled Pork', servingSize: 4, servingUnit: 'oz', calories: 245, protein: 26, carbs: 5, fat: 14, source: 'common', tags: 'pulled pork bbq' },
  { name: 'Pork Sausage (link)', servingSize: 2, servingUnit: 'links (57g)', calories: 200, protein: 10, carbs: 1, fat: 18, source: 'common', tags: 'pork sausage link breakfast' },
  { name: 'Italian Sausage', servingSize: 1, servingUnit: 'link (83g)', calories: 230, protein: 14, carbs: 4, fat: 18, source: 'common', tags: 'italian sausage pork' },
  { name: 'Prosciutto', servingSize: 1, servingUnit: 'oz (28g)', calories: 70, protein: 7, carbs: 0, fat: 5, source: 'common', tags: 'prosciutto ham cured pork italian' },
  { name: 'Pepperoni', servingSize: 15, servingUnit: 'slices (28g)', calories: 140, protein: 5, carbs: 1, fat: 13, source: 'common', tags: 'pepperoni pizza pork' },

  // ── Turkey ──
  { name: 'Turkey Breast (roasted)', servingSize: 4, servingUnit: 'oz', calories: 175, protein: 35, carbs: 0, fat: 3, source: 'common', tags: 'turkey breast roasted lean' },
  { name: 'Turkey (deli sliced)', servingSize: 4, servingUnit: 'slices (56g)', calories: 60, protein: 12, carbs: 1, fat: 1, source: 'common', tags: 'turkey deli sliced lunch meat' },
  { name: 'Ground Turkey (cooked)', servingSize: 4, servingUnit: 'oz', calories: 200, protein: 27, carbs: 0, fat: 10, source: 'common', tags: 'ground turkey cooked' },
  { name: 'Ground Turkey 99% lean (cooked)', servingSize: 4, servingUnit: 'oz', calories: 150, protein: 30, carbs: 0, fat: 3, source: 'common', tags: 'ground turkey 99 lean extra lean cooked' },
  { name: 'Turkey Burger', servingSize: 1, servingUnit: 'patty (113g)', calories: 235, protein: 28, carbs: 0, fat: 13, source: 'common', tags: 'turkey burger patty' },

  // ── Fish & Seafood ──
  { name: 'Salmon (baked/grilled)', servingSize: 6, servingUnit: 'oz', calories: 310, protein: 44, carbs: 0, fat: 14, source: 'common', tags: 'salmon baked grilled fish' },
  { name: 'Salmon (4 oz)', servingSize: 4, servingUnit: 'oz', calories: 205, protein: 29, carbs: 0, fat: 9, source: 'common', tags: 'salmon fish cooked' },
  { name: 'Canned Tuna (in water)', servingSize: 1, servingUnit: 'can (142g)', calories: 130, protein: 30, carbs: 0, fat: 1, source: 'common', tags: 'tuna canned water fish' },
  { name: 'Canned Tuna (in oil)', servingSize: 1, servingUnit: 'can (142g)', calories: 225, protein: 30, carbs: 0, fat: 12, source: 'common', tags: 'tuna canned oil fish' },
  { name: 'Tuna Steak (grilled)', servingSize: 6, servingUnit: 'oz', calories: 250, protein: 43, carbs: 0, fat: 7, source: 'common', tags: 'tuna steak grilled fish' },
  { name: 'Tilapia (baked)', servingSize: 6, servingUnit: 'oz', calories: 220, protein: 44, carbs: 0, fat: 5, source: 'common', tags: 'tilapia baked fish lean' },
  { name: 'Cod (baked)', servingSize: 6, servingUnit: 'oz', calories: 180, protein: 39, carbs: 0, fat: 2, source: 'common', tags: 'cod baked fish lean' },
  { name: 'Halibut (grilled)', servingSize: 6, servingUnit: 'oz', calories: 240, protein: 45, carbs: 0, fat: 5, source: 'common', tags: 'halibut grilled fish' },
  { name: 'Mahi-Mahi (grilled)', servingSize: 6, servingUnit: 'oz', calories: 210, protein: 44, carbs: 0, fat: 2, source: 'common', tags: 'mahi mahi grilled fish' },
  { name: 'Shrimp (cooked)', servingSize: 4, servingUnit: 'oz (about 11 large)', calories: 120, protein: 23, carbs: 1, fat: 2, source: 'common', tags: 'shrimp cooked seafood' },
  { name: 'Scallops (pan-seared)', servingSize: 4, servingUnit: 'oz', calories: 130, protein: 24, carbs: 4, fat: 2, source: 'common', tags: 'scallops seared seafood' },
  { name: 'Crab Meat', servingSize: 4, servingUnit: 'oz', calories: 100, protein: 21, carbs: 0, fat: 1, source: 'common', tags: 'crab meat seafood' },
  { name: 'Lobster Tail', servingSize: 1, servingUnit: 'tail (85g)', calories: 90, protein: 19, carbs: 0, fat: 1, source: 'common', tags: 'lobster tail seafood' },
  { name: 'Sardines (canned in oil)', servingSize: 1, servingUnit: 'can (92g)', calories: 190, protein: 23, carbs: 0, fat: 11, source: 'common', tags: 'sardines canned fish oil' },

  // ── Dairy ──
  { name: 'Greek Yogurt (plain, nonfat)', servingSize: 1, servingUnit: 'cup (227g)', calories: 130, protein: 22, carbs: 9, fat: 0, source: 'common', tags: 'greek yogurt plain nonfat dairy' },
  { name: 'Greek Yogurt (plain, whole milk)', servingSize: 1, servingUnit: 'cup (227g)', calories: 220, protein: 20, carbs: 8, fat: 11, source: 'common', tags: 'greek yogurt plain whole milk full fat dairy' },
  { name: 'Greek Yogurt (5.3 oz cup)', servingSize: 1, servingUnit: 'container (150g)', calories: 90, protein: 15, carbs: 6, fat: 0, source: 'common', tags: 'greek yogurt single serve cup nonfat dairy' },
  { name: 'Cottage Cheese (low fat)', servingSize: 1, servingUnit: 'cup (226g)', calories: 180, protein: 25, carbs: 10, fat: 5, source: 'common', tags: 'cottage cheese low fat dairy' },
  { name: 'Cottage Cheese (full fat)', servingSize: 1, servingUnit: 'cup (226g)', calories: 220, protein: 25, carbs: 6, fat: 10, source: 'common', tags: 'cottage cheese full fat dairy' },
  { name: 'Cheddar Cheese', servingSize: 1, servingUnit: 'oz (28g)', calories: 115, protein: 7, carbs: 0, fat: 9, source: 'common', tags: 'cheddar cheese dairy' },
  { name: 'Mozzarella (fresh)', servingSize: 1, servingUnit: 'oz (28g)', calories: 85, protein: 6, carbs: 1, fat: 6, source: 'common', tags: 'mozzarella fresh cheese dairy' },
  { name: 'Mozzarella (shredded)', servingSize: 0.25, servingUnit: 'cup (28g)', calories: 85, protein: 6, carbs: 1, fat: 6, source: 'common', tags: 'mozzarella shredded cheese dairy pizza' },
  { name: 'Parmesan (grated)', servingSize: 2, servingUnit: 'tbsp (10g)', calories: 40, protein: 4, carbs: 0, fat: 3, source: 'common', tags: 'parmesan grated cheese dairy' },
  { name: 'Swiss Cheese', servingSize: 1, servingUnit: 'oz (28g)', calories: 110, protein: 8, carbs: 0, fat: 8, source: 'common', tags: 'swiss cheese dairy' },
  { name: 'Feta Cheese', servingSize: 1, servingUnit: 'oz (28g)', calories: 75, protein: 4, carbs: 1, fat: 6, source: 'common', tags: 'feta cheese dairy greek' },
  { name: 'Cream Cheese', servingSize: 2, servingUnit: 'tbsp (29g)', calories: 100, protein: 2, carbs: 1, fat: 10, source: 'common', tags: 'cream cheese dairy spread' },
  { name: 'Butter', servingSize: 1, servingUnit: 'tbsp (14g)', calories: 102, protein: 0, carbs: 0, fat: 12, source: 'common', tags: 'butter dairy fat cooking' },
  { name: 'Heavy Cream', servingSize: 2, servingUnit: 'tbsp (30ml)', calories: 100, protein: 0, carbs: 1, fat: 11, source: 'common', tags: 'heavy cream whipping dairy fat' },
  { name: 'Sour Cream', servingSize: 2, servingUnit: 'tbsp (29g)', calories: 60, protein: 1, carbs: 1, fat: 5, source: 'common', tags: 'sour cream dairy' },

  // ── Vegetables ──
  { name: 'Broccoli (raw)', servingSize: 1, servingUnit: 'cup (91g)', calories: 31, protein: 3, carbs: 6, fat: 0, source: 'common', tags: 'broccoli raw vegetables veggies' },
  { name: 'Broccoli (steamed)', servingSize: 1, servingUnit: 'cup (156g)', calories: 54, protein: 4, carbs: 11, fat: 0, source: 'common', tags: 'broccoli steamed cooked vegetables veggies' },
  { name: 'Broccoli (roasted)', servingSize: 1, servingUnit: 'cup', calories: 55, protein: 4, carbs: 11, fat: 0, source: 'common', tags: 'broccoli roasted vegetables veggies' },
  { name: 'Spinach (raw)', servingSize: 2, servingUnit: 'cups (60g)', calories: 14, protein: 2, carbs: 2, fat: 0, source: 'common', tags: 'spinach raw salad vegetables leafy greens' },
  { name: 'Spinach (cooked/sautéed)', servingSize: 1, servingUnit: 'cup (180g)', calories: 41, protein: 5, carbs: 7, fat: 0, source: 'common', tags: 'spinach cooked sauteed vegetables' },
  { name: 'Kale (raw)', servingSize: 1, servingUnit: 'cup (67g)', calories: 33, protein: 3, carbs: 7, fat: 0, source: 'common', tags: 'kale raw salad vegetables leafy greens' },
  { name: 'Kale (cooked)', servingSize: 1, servingUnit: 'cup (130g)', calories: 36, protein: 2, carbs: 7, fat: 0, source: 'common', tags: 'kale cooked vegetables' },
  { name: 'Romaine Lettuce', servingSize: 2, servingUnit: 'cups (94g)', calories: 16, protein: 1, carbs: 3, fat: 0, source: 'common', tags: 'romaine lettuce salad vegetables leafy' },
  { name: 'Mixed Greens / Arugula', servingSize: 2, servingUnit: 'cups (60g)', calories: 15, protein: 2, carbs: 2, fat: 0, source: 'common', tags: 'mixed greens arugula salad vegetables leafy' },
  { name: 'Cauliflower (raw)', servingSize: 1, servingUnit: 'cup (100g)', calories: 25, protein: 2, carbs: 5, fat: 0, source: 'common', tags: 'cauliflower raw vegetables' },
  { name: 'Cauliflower (roasted)', servingSize: 1, servingUnit: 'cup', calories: 50, protein: 4, carbs: 10, fat: 0, source: 'common', tags: 'cauliflower roasted vegetables veggies' },
  { name: 'Brussels Sprouts (roasted)', servingSize: 1, servingUnit: 'cup (156g)', calories: 65, protein: 5, carbs: 13, fat: 0, source: 'common', tags: 'brussels sprouts roasted vegetables veggies' },
  { name: 'Asparagus (roasted/grilled)', servingSize: 1, servingUnit: 'cup (180g)', calories: 40, protein: 4, carbs: 7, fat: 0, source: 'common', tags: 'asparagus roasted grilled vegetables veggies' },
  { name: 'Green Beans', servingSize: 1, servingUnit: 'cup (100g)', calories: 31, protein: 2, carbs: 7, fat: 0, source: 'common', tags: 'green beans vegetables cooked steamed' },
  { name: 'Carrots (raw)', servingSize: 1, servingUnit: 'medium carrot (61g)', calories: 25, protein: 1, carbs: 6, fat: 0, source: 'common', tags: 'carrots raw vegetables snack' },
  { name: 'Carrots (cooked)', servingSize: 1, servingUnit: 'cup (156g)', calories: 54, protein: 1, carbs: 13, fat: 0, source: 'common', tags: 'carrots cooked vegetables' },
  { name: 'Bell Pepper (raw)', servingSize: 1, servingUnit: 'medium (119g)', calories: 31, protein: 1, carbs: 7, fat: 0, source: 'common', tags: 'bell pepper raw vegetables' },
  { name: 'Cucumber', servingSize: 1, servingUnit: 'cup sliced (119g)', calories: 16, protein: 1, carbs: 4, fat: 0, source: 'common', tags: 'cucumber raw vegetables salad' },
  { name: 'Celery', servingSize: 2, servingUnit: 'stalks (80g)', calories: 12, protein: 0, carbs: 3, fat: 0, source: 'common', tags: 'celery raw vegetables snack' },
  { name: 'Tomato', servingSize: 1, servingUnit: 'medium (123g)', calories: 22, protein: 1, carbs: 5, fat: 0, source: 'common', tags: 'tomato raw vegetables' },
  { name: 'Cherry Tomatoes', servingSize: 1, servingUnit: 'cup (149g)', calories: 27, protein: 1, carbs: 6, fat: 0, source: 'common', tags: 'cherry tomatoes raw vegetables salad' },
  { name: 'Zucchini (sautéed)', servingSize: 1, servingUnit: 'cup (124g)', calories: 27, protein: 2, carbs: 5, fat: 0, source: 'common', tags: 'zucchini sauteed cooked vegetables' },
  { name: 'Mushrooms (sautéed)', servingSize: 1, servingUnit: 'cup (156g)', calories: 44, protein: 3, carbs: 8, fat: 1, source: 'common', tags: 'mushrooms sauteed cooked vegetables' },
  { name: 'Onion (raw)', servingSize: 0.5, servingUnit: 'medium onion (55g)', calories: 22, protein: 1, carbs: 5, fat: 0, source: 'common', tags: 'onion raw vegetables' },
  { name: 'Corn (cooked)', servingSize: 1, servingUnit: 'ear', calories: 130, protein: 5, carbs: 29, fat: 2, source: 'common', tags: 'corn cooked ear vegetables' },
  { name: 'Corn (canned)', servingSize: 0.5, servingUnit: 'cup (82g)', calories: 66, protein: 2, carbs: 15, fat: 1, source: 'common', tags: 'corn canned vegetables' },
  { name: 'Edamame (shelled)', servingSize: 0.5, servingUnit: 'cup (78g)', calories: 95, protein: 8, carbs: 8, fat: 4, source: 'common', tags: 'edamame soybeans shelled vegetables protein' },
  { name: 'Peas (cooked)', servingSize: 0.5, servingUnit: 'cup (80g)', calories: 67, protein: 4, carbs: 12, fat: 0, source: 'common', tags: 'peas cooked vegetables' },
  { name: 'Mixed Vegetables (frozen, cooked)', servingSize: 1, servingUnit: 'cup (182g)', calories: 80, protein: 4, carbs: 15, fat: 0, source: 'common', tags: 'mixed vegetables frozen cooked' },
  { name: 'Roasted Vegetables (mixed)', servingSize: 1, servingUnit: 'cup', calories: 80, protein: 3, carbs: 16, fat: 1, source: 'common', tags: 'roasted vegetables veggies mixed' },
  { name: 'Stir-Fried Vegetables', servingSize: 1, servingUnit: 'cup', calories: 70, protein: 3, carbs: 12, fat: 2, source: 'common', tags: 'stir fry vegetables veggies mixed' },

  // ── Potatoes & Starches ──
  { name: 'Baked Potato (plain)', servingSize: 1, servingUnit: 'medium (173g)', calories: 160, protein: 4, carbs: 37, fat: 0, source: 'common', tags: 'baked potato plain starch' },
  { name: 'Sweet Potato (baked)', servingSize: 1, servingUnit: 'medium (130g)', calories: 115, protein: 2, carbs: 27, fat: 0, source: 'common', tags: 'sweet potato baked roasted starch' },
  { name: 'Mashed Potatoes', servingSize: 1, servingUnit: 'cup (210g)', calories: 235, protein: 4, carbs: 35, fat: 9, source: 'common', tags: 'mashed potatoes starch' },
  { name: 'French Fries', servingSize: 1, servingUnit: 'medium order (117g)', calories: 365, protein: 4, carbs: 48, fat: 17, source: 'common', tags: 'french fries fries potatoes fried' },
  { name: 'Roasted Sweet Potato', servingSize: 1, servingUnit: 'medium (130g)', calories: 115, protein: 2, carbs: 27, fat: 0, source: 'common', tags: 'sweet potato roasted vegetables veggies' },

  // ── Fruits ──
  { name: 'Apple', servingSize: 1, servingUnit: 'medium (182g)', calories: 95, protein: 0, carbs: 25, fat: 0, source: 'common', tags: 'apple fruit' },
  { name: 'Banana', servingSize: 1, servingUnit: 'medium (118g)', calories: 105, protein: 1, carbs: 27, fat: 0, source: 'common', tags: 'banana fruit' },
  { name: 'Orange', servingSize: 1, servingUnit: 'medium (131g)', calories: 62, protein: 1, carbs: 15, fat: 0, source: 'common', tags: 'orange fruit citrus' },
  { name: 'Grapes', servingSize: 1, servingUnit: 'cup (92g)', calories: 62, protein: 1, carbs: 16, fat: 0, source: 'common', tags: 'grapes fruit' },
  { name: 'Strawberries', servingSize: 1, servingUnit: 'cup (152g)', calories: 49, protein: 1, carbs: 12, fat: 0, source: 'common', tags: 'strawberries fruit berries' },
  { name: 'Blueberries', servingSize: 1, servingUnit: 'cup (148g)', calories: 84, protein: 1, carbs: 21, fat: 0, source: 'common', tags: 'blueberries fruit berries' },
  { name: 'Raspberries', servingSize: 1, servingUnit: 'cup (123g)', calories: 64, protein: 1, carbs: 15, fat: 1, source: 'common', tags: 'raspberries fruit berries' },
  { name: 'Blackberries', servingSize: 1, servingUnit: 'cup (144g)', calories: 62, protein: 2, carbs: 14, fat: 1, source: 'common', tags: 'blackberries fruit berries' },
  { name: 'Mango', servingSize: 1, servingUnit: 'cup diced (165g)', calories: 99, protein: 1, carbs: 25, fat: 1, source: 'common', tags: 'mango fruit tropical' },
  { name: 'Pineapple', servingSize: 1, servingUnit: 'cup diced (165g)', calories: 82, protein: 1, carbs: 22, fat: 0, source: 'common', tags: 'pineapple fruit tropical' },
  { name: 'Watermelon', servingSize: 2, servingUnit: 'cups diced (280g)', calories: 84, protein: 2, carbs: 21, fat: 0, source: 'common', tags: 'watermelon fruit summer' },
  { name: 'Peach', servingSize: 1, servingUnit: 'medium (150g)', calories: 58, protein: 1, carbs: 14, fat: 0, source: 'common', tags: 'peach fruit' },
  { name: 'Pear', servingSize: 1, servingUnit: 'medium (178g)', calories: 101, protein: 1, carbs: 27, fat: 0, source: 'common', tags: 'pear fruit' },
  { name: 'Avocado (whole)', servingSize: 1, servingUnit: 'medium (150g)', calories: 240, protein: 3, carbs: 13, fat: 22, source: 'common', tags: 'avocado fruit whole' },
  { name: 'Avocado (half)', servingSize: 0.5, servingUnit: 'avocado (75g)', calories: 120, protein: 2, carbs: 6, fat: 11, source: 'common', tags: 'avocado fruit half' },
  { name: 'Cherries', servingSize: 1, servingUnit: 'cup (138g)', calories: 87, protein: 1, carbs: 22, fat: 0, source: 'common', tags: 'cherries fruit' },
  { name: 'Kiwi', servingSize: 1, servingUnit: 'medium (69g)', calories: 42, protein: 1, carbs: 10, fat: 0, source: 'common', tags: 'kiwi fruit' },
  { name: 'Grapefruit', servingSize: 0.5, servingUnit: 'grapefruit (123g)', calories: 52, protein: 1, carbs: 13, fat: 0, source: 'common', tags: 'grapefruit fruit citrus' },
  { name: 'Dates (Medjool)', servingSize: 2, servingUnit: 'dates (48g)', calories: 133, protein: 1, carbs: 36, fat: 0, source: 'common', tags: 'dates medjool fruit dried' },

  // ── Grains & Rice ──
  { name: 'White Rice (cooked)', servingSize: 1, servingUnit: 'cup (186g)', calories: 205, protein: 4, carbs: 45, fat: 0, source: 'common', tags: 'white rice cooked grain' },
  { name: 'Brown Rice (cooked)', servingSize: 1, servingUnit: 'cup (195g)', calories: 215, protein: 5, carbs: 45, fat: 2, source: 'common', tags: 'brown rice cooked grain whole' },
  { name: 'Jasmine Rice (cooked)', servingSize: 1, servingUnit: 'cup (186g)', calories: 205, protein: 4, carbs: 45, fat: 0, source: 'common', tags: 'jasmine rice cooked grain' },
  { name: 'Fried Rice', servingSize: 1, servingUnit: 'cup (198g)', calories: 260, protein: 7, carbs: 40, fat: 8, source: 'common', tags: 'fried rice cooked grain chinese' },
  { name: 'Quinoa (cooked)', servingSize: 1, servingUnit: 'cup (185g)', calories: 222, protein: 8, carbs: 39, fat: 4, source: 'common', tags: 'quinoa cooked grain protein' },
  { name: 'Pasta (cooked)', servingSize: 1, servingUnit: 'cup (140g)', calories: 220, protein: 8, carbs: 43, fat: 1, source: 'common', tags: 'pasta cooked spaghetti noodles grain' },
  { name: 'Whole Wheat Pasta (cooked)', servingSize: 1, servingUnit: 'cup (140g)', calories: 200, protein: 8, carbs: 40, fat: 1, source: 'common', tags: 'whole wheat pasta cooked grain' },
  { name: 'Couscous (cooked)', servingSize: 1, servingUnit: 'cup (157g)', calories: 176, protein: 6, carbs: 36, fat: 0, source: 'common', tags: 'couscous cooked grain' },
  { name: 'Bread (white, 1 slice)', servingSize: 1, servingUnit: 'slice (25g)', calories: 67, protein: 2, carbs: 13, fat: 1, source: 'common', tags: 'white bread slice loaf' },
  { name: 'Bread (whole wheat, 1 slice)', servingSize: 1, servingUnit: 'slice (28g)', calories: 69, protein: 4, carbs: 12, fat: 1, source: 'common', tags: 'whole wheat bread slice loaf' },
  { name: 'Sourdough Bread (1 slice)', servingSize: 1, servingUnit: 'slice (47g)', calories: 120, protein: 5, carbs: 23, fat: 1, source: 'common', tags: 'sourdough bread slice loaf' },
  { name: 'Flour Tortilla (10")', servingSize: 1, servingUnit: 'tortilla (72g)', calories: 220, protein: 6, carbs: 36, fat: 6, source: 'common', tags: 'flour tortilla wrap burrito' },
  { name: 'Corn Tortilla (6")', servingSize: 2, servingUnit: 'tortillas (46g)', calories: 100, protein: 3, carbs: 21, fat: 1, source: 'common', tags: 'corn tortilla taco' },
  { name: 'Pita Bread', servingSize: 1, servingUnit: 'pita (60g)', calories: 165, protein: 5, carbs: 33, fat: 1, source: 'common', tags: 'pita bread wrap' },
  { name: 'Oatmeal (cooked)', servingSize: 1, servingUnit: 'cup (234g)', calories: 154, protein: 5, carbs: 27, fat: 3, source: 'common', tags: 'oatmeal oats porridge cooked grain breakfast' },

  // ── Legumes ──
  { name: 'Black Beans (cooked)', servingSize: 1, servingUnit: 'cup (172g)', calories: 227, protein: 15, carbs: 41, fat: 1, source: 'common', tags: 'black beans cooked legumes' },
  { name: 'Chickpeas / Garbanzo Beans', servingSize: 1, servingUnit: 'cup (164g)', calories: 269, protein: 15, carbs: 45, fat: 4, source: 'common', tags: 'chickpeas garbanzo beans cooked legumes' },
  { name: 'Lentils (cooked)', servingSize: 1, servingUnit: 'cup (198g)', calories: 230, protein: 18, carbs: 40, fat: 1, source: 'common', tags: 'lentils cooked legumes' },
  { name: 'Kidney Beans (cooked)', servingSize: 1, servingUnit: 'cup (177g)', calories: 225, protein: 15, carbs: 40, fat: 1, source: 'common', tags: 'kidney beans cooked legumes' },
  { name: 'Pinto Beans (cooked)', servingSize: 1, servingUnit: 'cup (171g)', calories: 245, protein: 15, carbs: 45, fat: 1, source: 'common', tags: 'pinto beans cooked legumes' },
  { name: 'White Beans / Cannellini', servingSize: 1, servingUnit: 'cup (179g)', calories: 255, protein: 17, carbs: 46, fat: 1, source: 'common', tags: 'white beans cannellini cooked legumes' },
  { name: 'Edamame (in pod)', servingSize: 1, servingUnit: 'cup in pod (155g)', calories: 120, protein: 11, carbs: 11, fat: 5, source: 'common', tags: 'edamame soybeans pod vegetables protein' },
  { name: 'Hummus', servingSize: 2, servingUnit: 'tbsp (30g)', calories: 50, protein: 2, carbs: 5, fat: 3, source: 'common', tags: 'hummus chickpeas dip spread' },
  { name: 'Tofu (firm, cooked)', servingSize: 4, servingUnit: 'oz (113g)', calories: 90, protein: 10, carbs: 2, fat: 5, source: 'common', tags: 'tofu firm cooked plant protein' },
  { name: 'Tempeh', servingSize: 4, servingUnit: 'oz (113g)', calories: 220, protein: 21, carbs: 10, fat: 13, source: 'common', tags: 'tempeh fermented soy plant protein' },

  // ── Nuts & Seeds ──
  { name: 'Almonds', servingSize: 1, servingUnit: 'oz (23 nuts, 28g)', calories: 165, protein: 6, carbs: 6, fat: 14, source: 'common', tags: 'almonds nuts snack' },
  { name: 'Walnuts', servingSize: 1, servingUnit: 'oz (14 halves, 28g)', calories: 185, protein: 4, carbs: 4, fat: 18, source: 'common', tags: 'walnuts nuts snack' },
  { name: 'Cashews', servingSize: 1, servingUnit: 'oz (18 nuts, 28g)', calories: 157, protein: 5, carbs: 9, fat: 12, source: 'common', tags: 'cashews nuts snack' },
  { name: 'Pecans', servingSize: 1, servingUnit: 'oz (19 halves, 28g)', calories: 196, protein: 3, carbs: 4, fat: 20, source: 'common', tags: 'pecans nuts snack' },
  { name: 'Macadamia Nuts', servingSize: 1, servingUnit: 'oz (10-12 nuts, 28g)', calories: 204, protein: 2, carbs: 4, fat: 21, source: 'common', tags: 'macadamia nuts snack' },
  { name: 'Pistachios (shelled)', servingSize: 1, servingUnit: 'oz (49 nuts, 28g)', calories: 159, protein: 6, carbs: 8, fat: 13, source: 'common', tags: 'pistachios nuts snack' },
  { name: 'Peanuts (dry roasted)', servingSize: 1, servingUnit: 'oz (28g)', calories: 166, protein: 7, carbs: 6, fat: 14, source: 'common', tags: 'peanuts dry roasted nuts snack' },
  { name: 'Peanut Butter', servingSize: 2, servingUnit: 'tbsp (32g)', calories: 190, protein: 8, carbs: 6, fat: 16, source: 'common', tags: 'peanut butter nut butter spread' },
  { name: 'Almond Butter', servingSize: 2, servingUnit: 'tbsp (32g)', calories: 200, protein: 7, carbs: 7, fat: 18, source: 'common', tags: 'almond butter nut butter spread' },
  { name: 'Sunflower Seeds', servingSize: 1, servingUnit: 'oz (28g)', calories: 164, protein: 6, carbs: 7, fat: 14, source: 'common', tags: 'sunflower seeds snack' },
  { name: 'Pumpkin Seeds (pepitas)', servingSize: 1, servingUnit: 'oz (28g)', calories: 163, protein: 9, carbs: 4, fat: 14, source: 'common', tags: 'pumpkin seeds pepitas snack' },
  { name: 'Chia Seeds', servingSize: 2, servingUnit: 'tbsp (20g)', calories: 97, protein: 3, carbs: 9, fat: 6, source: 'common', tags: 'chia seeds superfood' },
  { name: 'Flaxseeds (ground)', servingSize: 2, servingUnit: 'tbsp (14g)', calories: 75, protein: 3, carbs: 4, fat: 6, source: 'common', tags: 'flaxseeds ground flax omega' },

  // ── Oils, Fats & Condiments ──
  { name: 'Olive Oil', servingSize: 1, servingUnit: 'tbsp (14g)', calories: 119, protein: 0, carbs: 0, fat: 14, source: 'common', tags: 'olive oil fat cooking' },
  { name: 'Coconut Oil', servingSize: 1, servingUnit: 'tbsp (14g)', calories: 121, protein: 0, carbs: 0, fat: 14, source: 'common', tags: 'coconut oil fat cooking' },
  { name: 'Avocado Oil', servingSize: 1, servingUnit: 'tbsp (14g)', calories: 124, protein: 0, carbs: 0, fat: 14, source: 'common', tags: 'avocado oil fat cooking' },
  { name: 'Mayonnaise', servingSize: 1, servingUnit: 'tbsp (14g)', calories: 94, protein: 0, carbs: 0, fat: 10, source: 'common', tags: 'mayonnaise mayo condiment' },
  { name: 'Ketchup', servingSize: 1, servingUnit: 'tbsp (17g)', calories: 17, protein: 0, carbs: 5, fat: 0, source: 'common', tags: 'ketchup condiment tomato' },
  { name: 'Mustard (yellow)', servingSize: 1, servingUnit: 'tsp (5g)', calories: 3, protein: 0, carbs: 0, fat: 0, source: 'common', tags: 'mustard yellow condiment' },
  { name: 'Salsa', servingSize: 2, servingUnit: 'tbsp (34g)', calories: 10, protein: 0, carbs: 2, fat: 0, source: 'common', tags: 'salsa condiment tomato' },
  { name: 'Guacamole', servingSize: 2, servingUnit: 'tbsp (30g)', calories: 45, protein: 1, carbs: 3, fat: 4, source: 'common', tags: 'guacamole avocado dip condiment' },
  { name: 'Ranch Dressing', servingSize: 2, servingUnit: 'tbsp (30g)', calories: 130, protein: 1, carbs: 2, fat: 14, source: 'common', tags: 'ranch dressing salad dip' },
  { name: 'Italian Dressing', servingSize: 2, servingUnit: 'tbsp (30g)', calories: 85, protein: 0, carbs: 3, fat: 8, source: 'common', tags: 'italian dressing salad' },
  { name: 'Balsamic Vinaigrette', servingSize: 2, servingUnit: 'tbsp (30g)', calories: 90, protein: 0, carbs: 4, fat: 8, source: 'common', tags: 'balsamic vinaigrette dressing salad' },
  { name: 'Soy Sauce', servingSize: 1, servingUnit: 'tbsp (16ml)', calories: 9, protein: 1, carbs: 1, fat: 0, source: 'common', tags: 'soy sauce condiment asian' },
  { name: 'Hot Sauce', servingSize: 1, servingUnit: 'tsp (5ml)', calories: 1, protein: 0, carbs: 0, fat: 0, source: 'common', tags: 'hot sauce tabasco condiment spicy' },
  { name: 'BBQ Sauce', servingSize: 2, servingUnit: 'tbsp (36g)', calories: 70, protein: 0, carbs: 17, fat: 0, source: 'common', tags: 'bbq sauce condiment barbecue' },
  { name: 'Honey', servingSize: 1, servingUnit: 'tbsp (21g)', calories: 64, protein: 0, carbs: 17, fat: 0, source: 'common', tags: 'honey sweetener' },
  { name: 'Maple Syrup', servingSize: 1, servingUnit: 'tbsp (20ml)', calories: 52, protein: 0, carbs: 13, fat: 0, source: 'common', tags: 'maple syrup sweetener pancakes' },

  // ── Common Meals & Dishes ──
  { name: 'Caesar Salad (entrée)', servingSize: 1, servingUnit: 'serving (300g)', calories: 360, protein: 8, carbs: 18, fat: 30, source: 'common', tags: 'caesar salad entree' },
  { name: 'Garden Salad (no dressing)', servingSize: 1, servingUnit: 'serving', calories: 20, protein: 1, carbs: 4, fat: 0, source: 'common', tags: 'garden salad no dressing' },
  { name: 'Burrito Bowl (chicken, rice, beans)', servingSize: 1, servingUnit: 'bowl', calories: 650, protein: 42, carbs: 80, fat: 16, source: 'common', tags: 'burrito bowl chicken rice beans chipotle' },
  { name: 'Taco (chicken, soft)', servingSize: 1, servingUnit: 'taco', calories: 210, protein: 14, carbs: 22, fat: 7, source: 'common', tags: 'taco chicken soft' },
  { name: 'Pizza (cheese, 1 slice)', servingSize: 1, servingUnit: 'slice (107g)', calories: 285, protein: 12, carbs: 36, fat: 10, source: 'common', tags: 'pizza cheese slice' },
  { name: 'Cheeseburger (fast food)', servingSize: 1, servingUnit: 'burger', calories: 510, protein: 28, carbs: 41, fat: 26, source: 'common', tags: 'cheeseburger burger fast food' },
  { name: 'Grilled Cheese Sandwich', servingSize: 1, servingUnit: 'sandwich', calories: 390, protein: 14, carbs: 36, fat: 22, source: 'common', tags: 'grilled cheese sandwich' },
  { name: 'Turkey Sandwich (deli)', servingSize: 1, servingUnit: 'sandwich', calories: 350, protein: 26, carbs: 38, fat: 8, source: 'common', tags: 'turkey sandwich deli lunch' },
  { name: 'BLT Sandwich', servingSize: 1, servingUnit: 'sandwich', calories: 390, protein: 14, carbs: 34, fat: 22, source: 'common', tags: 'blt sandwich bacon lettuce tomato' },
  { name: 'Sushi Roll (8 pieces)', servingSize: 8, servingUnit: 'pieces', calories: 300, protein: 10, carbs: 50, fat: 6, source: 'common', tags: 'sushi roll california maki' },
  { name: 'Chicken Soup / Broth', servingSize: 1, servingUnit: 'cup (245ml)', calories: 75, protein: 6, carbs: 6, fat: 3, source: 'common', tags: 'chicken soup broth' },
  { name: 'Beef Chili', servingSize: 1, servingUnit: 'cup (253g)', calories: 290, protein: 22, carbs: 24, fat: 12, source: 'common', tags: 'beef chili soup' },
  { name: 'Spaghetti with Meat Sauce', servingSize: 1, servingUnit: 'cup (252g)', calories: 320, protein: 18, carbs: 38, fat: 10, source: 'common', tags: 'spaghetti meat sauce pasta italian' },
  { name: 'Chicken Fried Rice', servingSize: 1, servingUnit: 'cup (198g)', calories: 280, protein: 14, carbs: 36, fat: 9, source: 'common', tags: 'chicken fried rice asian' },
  { name: 'Pad Thai', servingSize: 1, servingUnit: 'cup (200g)', calories: 310, protein: 16, carbs: 38, fat: 10, source: 'common', tags: 'pad thai noodles asian thai' },

  // ── More Vegetables ──
  { name: 'Cabbage (raw)', servingSize: 1, servingUnit: 'cup shredded (89g)', calories: 22, protein: 1, carbs: 5, fat: 0, source: 'common', tags: 'cabbage raw vegetables shredded slaw' },
  { name: 'Red Cabbage (raw)', servingSize: 1, servingUnit: 'cup shredded (89g)', calories: 28, protein: 1, carbs: 7, fat: 0, source: 'common', tags: 'red cabbage raw vegetables' },
  { name: 'Beets (cooked)', servingSize: 0.5, servingUnit: 'cup sliced (85g)', calories: 37, protein: 1, carbs: 8, fat: 0, source: 'common', tags: 'beets cooked vegetables' },
  { name: 'Artichoke Heart', servingSize: 0.5, servingUnit: 'cup (84g)', calories: 45, protein: 2, carbs: 10, fat: 0, source: 'common', tags: 'artichoke heart vegetables' },
  { name: 'Leeks (cooked)', servingSize: 1, servingUnit: 'cup (104g)', calories: 32, protein: 1, carbs: 8, fat: 0, source: 'common', tags: 'leeks cooked vegetables' },
  { name: 'Bok Choy (cooked)', servingSize: 1, servingUnit: 'cup (170g)', calories: 20, protein: 3, carbs: 3, fat: 0, source: 'common', tags: 'bok choy cooked vegetables asian' },
  { name: 'Snap Peas', servingSize: 1, servingUnit: 'cup (98g)', calories: 41, protein: 3, carbs: 7, fat: 0, source: 'common', tags: 'snap peas vegetables snack' },
  { name: 'Snow Peas', servingSize: 1, servingUnit: 'cup (98g)', calories: 41, protein: 3, carbs: 7, fat: 0, source: 'common', tags: 'snow peas vegetables stir fry' },
  { name: 'Broccoli Rabe', servingSize: 1, servingUnit: 'cup (40g)', calories: 9, protein: 1, carbs: 1, fat: 0, source: 'common', tags: 'broccoli rabe rapini vegetables italian' },
  { name: 'Swiss Chard (cooked)', servingSize: 1, servingUnit: 'cup (175g)', calories: 35, protein: 3, carbs: 7, fat: 0, source: 'common', tags: 'swiss chard cooked vegetables leafy greens' },
  { name: 'Collard Greens (cooked)', servingSize: 1, servingUnit: 'cup (190g)', calories: 49, protein: 4, carbs: 9, fat: 1, source: 'common', tags: 'collard greens cooked vegetables leafy southern' },
  { name: 'Eggplant (roasted)', servingSize: 1, servingUnit: 'cup (99g)', calories: 35, protein: 1, carbs: 9, fat: 0, source: 'common', tags: 'eggplant roasted vegetables aubergine' },
  { name: 'Butternut Squash (roasted)', servingSize: 1, servingUnit: 'cup cubed (205g)', calories: 82, protein: 2, carbs: 22, fat: 0, source: 'common', tags: 'butternut squash roasted vegetables' },
  { name: 'Acorn Squash (baked)', servingSize: 0.5, servingUnit: 'squash (172g)', calories: 57, protein: 1, carbs: 15, fat: 0, source: 'common', tags: 'acorn squash baked vegetables' },
  { name: 'Spaghetti Squash (cooked)', servingSize: 1, servingUnit: 'cup (155g)', calories: 42, protein: 1, carbs: 10, fat: 0, source: 'common', tags: 'spaghetti squash cooked vegetables low carb' },
  { name: 'Jalapeño', servingSize: 1, servingUnit: 'medium (45g)', calories: 18, protein: 1, carbs: 4, fat: 0, source: 'common', tags: 'jalapeno pepper spicy vegetables' },
  { name: 'Garlic (raw)', servingSize: 3, servingUnit: 'cloves (9g)', calories: 13, protein: 1, carbs: 3, fat: 0, source: 'common', tags: 'garlic raw vegetables seasoning' },
  { name: 'Radishes', servingSize: 1, servingUnit: 'cup sliced (116g)', calories: 19, protein: 1, carbs: 4, fat: 0, source: 'common', tags: 'radishes raw vegetables salad' },
  { name: 'Turnip (cooked)', servingSize: 1, servingUnit: 'cup mashed (230g)', calories: 51, protein: 2, carbs: 12, fat: 0, source: 'common', tags: 'turnip cooked vegetables' },
  { name: 'Jicama (raw)', servingSize: 1, servingUnit: 'cup sliced (120g)', calories: 46, protein: 1, carbs: 11, fat: 0, source: 'common', tags: 'jicama raw vegetables snack' },
  { name: 'Fennel (raw)', servingSize: 1, servingUnit: 'cup sliced (87g)', calories: 27, protein: 1, carbs: 6, fat: 0, source: 'common', tags: 'fennel raw vegetables' },
  { name: 'Brussels Sprouts (steamed)', servingSize: 1, servingUnit: 'cup (156g)', calories: 56, protein: 4, carbs: 11, fat: 0, source: 'common', tags: 'brussels sprouts steamed cooked vegetables' },
  { name: 'Spinach Salad', servingSize: 2, servingUnit: 'cups (60g)', calories: 14, protein: 2, carbs: 2, fat: 0, source: 'common', tags: 'spinach salad raw vegetables' },
  { name: 'Iceberg Lettuce', servingSize: 2, servingUnit: 'cups (110g)', calories: 14, protein: 1, carbs: 2, fat: 0, source: 'common', tags: 'iceberg lettuce salad vegetables' },

  // ── More Fruits ──
  { name: 'Plum', servingSize: 1, servingUnit: 'medium (66g)', calories: 30, protein: 0, carbs: 8, fat: 0, source: 'common', tags: 'plum fruit' },
  { name: 'Apricot', servingSize: 2, servingUnit: 'apricots (70g)', calories: 34, protein: 1, carbs: 8, fat: 0, source: 'common', tags: 'apricot fruit' },
  { name: 'Cantaloupe', servingSize: 1, servingUnit: 'cup diced (160g)', calories: 54, protein: 1, carbs: 13, fat: 0, source: 'common', tags: 'cantaloupe melon fruit' },
  { name: 'Honeydew Melon', servingSize: 1, servingUnit: 'cup diced (170g)', calories: 61, protein: 1, carbs: 15, fat: 0, source: 'common', tags: 'honeydew melon fruit' },
  { name: 'Pomegranate Seeds', servingSize: 0.5, servingUnit: 'cup (87g)', calories: 72, protein: 1, carbs: 16, fat: 1, source: 'common', tags: 'pomegranate seeds arils fruit' },
  { name: 'Fig (fresh)', servingSize: 2, servingUnit: 'medium figs (100g)', calories: 74, protein: 1, carbs: 19, fat: 0, source: 'common', tags: 'fig fresh fruit' },
  { name: 'Dried Mango', servingSize: 1, servingUnit: 'oz (28g)', calories: 85, protein: 0, carbs: 22, fat: 0, source: 'common', tags: 'dried mango fruit snack' },
  { name: 'Raisins', servingSize: 0.25, servingUnit: 'cup (41g)', calories: 123, protein: 1, carbs: 33, fat: 0, source: 'common', tags: 'raisins dried grapes fruit snack' },
  { name: 'Cranberries (fresh)', servingSize: 1, servingUnit: 'cup (110g)', calories: 51, protein: 0, carbs: 13, fat: 0, source: 'common', tags: 'cranberries fresh fruit' },
  { name: 'Lemon', servingSize: 1, servingUnit: 'medium (58g)', calories: 17, protein: 1, carbs: 5, fat: 0, source: 'common', tags: 'lemon citrus fruit' },
  { name: 'Lime', servingSize: 1, servingUnit: 'medium (67g)', calories: 20, protein: 0, carbs: 7, fat: 0, source: 'common', tags: 'lime citrus fruit' },
  { name: 'Passion Fruit', servingSize: 2, servingUnit: 'fruits (36g)', calories: 35, protein: 1, carbs: 8, fat: 0, source: 'common', tags: 'passion fruit tropical' },
  { name: 'Papaya', servingSize: 1, servingUnit: 'cup cubed (145g)', calories: 62, protein: 1, carbs: 16, fat: 0, source: 'common', tags: 'papaya tropical fruit' },
  { name: 'Coconut Meat (raw)', servingSize: 1, servingUnit: 'oz (28g)', calories: 99, protein: 1, carbs: 4, fat: 9, source: 'common', tags: 'coconut meat raw fruit' },
  { name: 'Mixed Berries (frozen)', servingSize: 1, servingUnit: 'cup (140g)', calories: 70, protein: 1, carbs: 17, fat: 0, source: 'common', tags: 'mixed berries frozen fruit' },

  // ── Snack Foods ──
  { name: 'Popcorn (air-popped)', servingSize: 3, servingUnit: 'cups (24g)', calories: 93, protein: 3, carbs: 19, fat: 1, source: 'common', tags: 'popcorn air popped snack' },
  { name: 'Popcorn (microwave, butter)', servingSize: 3, servingUnit: 'cups (33g)', calories: 150, protein: 2, carbs: 17, fat: 9, source: 'common', tags: 'popcorn microwave butter snack' },
  { name: 'Rice Cakes (plain)', servingSize: 2, servingUnit: 'cakes (18g)', calories: 70, protein: 1, carbs: 15, fat: 0, source: 'common', tags: 'rice cakes plain snack low calorie' },
  { name: 'Crackers (whole wheat)', servingSize: 5, servingUnit: 'crackers (16g)', calories: 70, protein: 2, carbs: 13, fat: 2, source: 'common', tags: 'crackers whole wheat snack' },
  { name: 'Pretzels', servingSize: 1, servingUnit: 'oz (28g)', calories: 108, protein: 3, carbs: 23, fat: 1, source: 'common', tags: 'pretzels snack' },
  { name: 'Potato Chips', servingSize: 1, servingUnit: 'oz (28g, ~15 chips)', calories: 152, protein: 2, carbs: 15, fat: 10, source: 'common', tags: 'potato chips crisps snack' },
  { name: 'Tortilla Chips', servingSize: 1, servingUnit: 'oz (28g, ~12 chips)', calories: 140, protein: 2, carbs: 19, fat: 7, source: 'common', tags: 'tortilla chips nachos snack' },
  { name: 'Beef Jerky', servingSize: 1, servingUnit: 'oz (28g)', calories: 116, protein: 9, carbs: 3, fat: 7, source: 'common', tags: 'beef jerky snack protein dried' },
  { name: 'Turkey Jerky', servingSize: 1, servingUnit: 'oz (28g)', calories: 70, protein: 13, carbs: 3, fat: 1, source: 'common', tags: 'turkey jerky snack protein dried' },
  { name: 'String Cheese', servingSize: 1, servingUnit: 'stick (28g)', calories: 80, protein: 6, carbs: 0, fat: 6, source: 'common', tags: 'string cheese mozzarella snack dairy' },
  { name: 'Hard-Boiled Egg (snack)', servingSize: 1, servingUnit: 'egg', calories: 78, protein: 6, carbs: 1, fat: 5, source: 'common', tags: 'hard boiled egg snack protein' },
  { name: 'Celery with Peanut Butter', servingSize: 1, servingUnit: 'serving', calories: 100, protein: 3, carbs: 7, fat: 7, source: 'common', tags: 'celery peanut butter snack' },
  { name: 'Apple with Peanut Butter', servingSize: 1, servingUnit: 'medium apple + 1 tbsp PB', calories: 190, protein: 4, carbs: 30, fat: 8, source: 'common', tags: 'apple peanut butter snack' },
  { name: 'Trail Mix', servingSize: 0.25, servingUnit: 'cup (38g)', calories: 175, protein: 5, carbs: 17, fat: 11, source: 'common', tags: 'trail mix nuts dried fruit snack' },
  { name: 'Protein Bar (generic)', servingSize: 1, servingUnit: 'bar (60g)', calories: 210, protein: 20, carbs: 23, fat: 7, source: 'common', tags: 'protein bar snack supplement' },
  { name: 'Granola Bar', servingSize: 1, servingUnit: 'bar (47g)', calories: 190, protein: 4, carbs: 29, fat: 7, source: 'common', tags: 'granola bar snack oats' },
  { name: 'Dark Chocolate (70%+)', servingSize: 1, servingUnit: 'oz (28g)', calories: 170, protein: 2, carbs: 13, fat: 12, source: 'common', tags: 'dark chocolate 70 snack dessert' },

  // ── Deli & Lunch Meats ──
  { name: 'Roast Beef (deli)', servingSize: 4, servingUnit: 'slices (57g)', calories: 80, protein: 13, carbs: 1, fat: 3, source: 'common', tags: 'roast beef deli sliced lunch meat' },
  { name: 'Salami', servingSize: 4, servingUnit: 'slices (40g)', calories: 170, protein: 8, carbs: 1, fat: 15, source: 'common', tags: 'salami deli lunch meat pork' },
  { name: 'Chicken Breast (deli)', servingSize: 4, servingUnit: 'slices (57g)', calories: 60, protein: 12, carbs: 1, fat: 1, source: 'common', tags: 'chicken breast deli sliced lunch meat' },
  { name: 'Tuna Salad', servingSize: 0.5, servingUnit: 'cup (103g)', calories: 190, protein: 16, carbs: 5, fat: 11, source: 'common', tags: 'tuna salad mayo lunch' },
  { name: 'Chicken Salad', servingSize: 0.5, servingUnit: 'cup (109g)', calories: 210, protein: 18, carbs: 4, fat: 13, source: 'common', tags: 'chicken salad mayo lunch' },
  { name: 'Egg Salad', servingSize: 0.5, servingUnit: 'cup (105g)', calories: 210, protein: 10, carbs: 2, fat: 18, source: 'common', tags: 'egg salad mayo lunch' },

  // ── Pasta Dishes ──
  { name: 'Mac and Cheese (homemade)', servingSize: 1, servingUnit: 'cup (200g)', calories: 390, protein: 16, carbs: 48, fat: 15, source: 'common', tags: 'mac and cheese macaroni pasta' },
  { name: 'Lasagna (meat)', servingSize: 1, servingUnit: 'piece (250g)', calories: 380, protein: 22, carbs: 35, fat: 16, source: 'common', tags: 'lasagna meat pasta italian' },
  { name: 'Fettuccine Alfredo', servingSize: 1, servingUnit: 'cup (224g)', calories: 480, protein: 14, carbs: 44, fat: 28, source: 'common', tags: 'fettuccine alfredo pasta italian cream' },
  { name: 'Pasta Primavera', servingSize: 1, servingUnit: 'cup (220g)', calories: 260, protein: 9, carbs: 40, fat: 8, source: 'common', tags: 'pasta primavera vegetables italian' },
  { name: 'Penne alla Vodka', servingSize: 1, servingUnit: 'cup (224g)', calories: 350, protein: 11, carbs: 44, fat: 14, source: 'common', tags: 'penne vodka sauce pasta italian' },
  { name: 'Pasta Salad', servingSize: 1, servingUnit: 'cup (180g)', calories: 270, protein: 7, carbs: 35, fat: 12, source: 'common', tags: 'pasta salad cold lunch' },

  // ── International Staples ──
  { name: 'Naan Bread', servingSize: 1, servingUnit: 'piece (90g)', calories: 262, protein: 9, carbs: 45, fat: 5, source: 'common', tags: 'naan bread indian' },
  { name: 'Rice Noodles (cooked)', servingSize: 1, servingUnit: 'cup (176g)', calories: 190, protein: 3, carbs: 43, fat: 0, source: 'common', tags: 'rice noodles cooked asian thai vietnamese' },
  { name: 'Udon Noodles (cooked)', servingSize: 1, servingUnit: 'cup (200g)', calories: 210, protein: 7, carbs: 43, fat: 1, source: 'common', tags: 'udon noodles cooked japanese asian' },
  { name: 'Miso Soup', servingSize: 1, servingUnit: 'cup (240ml)', calories: 35, protein: 2, carbs: 5, fat: 1, source: 'common', tags: 'miso soup japanese asian' },
  { name: 'Falafel (fried)', servingSize: 3, servingUnit: 'balls (84g)', calories: 255, protein: 9, carbs: 26, fat: 14, source: 'common', tags: 'falafel fried chickpeas middle eastern' },
  { name: 'Gyoza / Dumplings (steamed)', servingSize: 4, servingUnit: 'pieces (88g)', calories: 200, protein: 8, carbs: 28, fat: 6, source: 'common', tags: 'gyoza dumplings steamed potstickers asian' },
  { name: 'Spring Roll (fresh, rice paper)', servingSize: 1, servingUnit: 'roll (75g)', calories: 100, protein: 5, carbs: 17, fat: 2, source: 'common', tags: 'spring roll fresh rice paper vietnamese' },
  { name: 'Egg Roll (fried)', servingSize: 1, servingUnit: 'roll (85g)', calories: 220, protein: 7, carbs: 24, fat: 11, source: 'common', tags: 'egg roll fried chinese asian' },
  { name: 'Basmati Rice (cooked)', servingSize: 1, servingUnit: 'cup (163g)', calories: 210, protein: 4, carbs: 46, fat: 0, source: 'common', tags: 'basmati rice cooked indian grain' },
  { name: 'Lentil Soup (dal)', servingSize: 1, servingUnit: 'cup (248g)', calories: 215, protein: 13, carbs: 36, fat: 3, source: 'common', tags: 'lentil soup dal indian' },
  { name: 'Chicken Tikka Masala', servingSize: 1, servingUnit: 'cup (244g)', calories: 320, protein: 28, carbs: 12, fat: 18, source: 'common', tags: 'chicken tikka masala indian curry' },
  { name: 'Beef Tacos (2)', servingSize: 2, servingUnit: 'tacos', calories: 370, protein: 22, carbs: 34, fat: 16, source: 'common', tags: 'beef tacos mexican' },
  { name: 'Shakshuka (2 eggs)', servingSize: 1, servingUnit: 'serving', calories: 220, protein: 13, carbs: 15, fat: 12, source: 'common', tags: 'shakshuka eggs tomato middle eastern' },
  { name: 'Pho (beef broth & noodles)', servingSize: 1, servingUnit: 'bowl (500ml)', calories: 350, protein: 20, carbs: 45, fat: 8, source: 'common', tags: 'pho beef noodle soup vietnamese' },
  { name: 'Ramen (broth & noodles)', servingSize: 1, servingUnit: 'bowl', calories: 430, protein: 18, carbs: 55, fat: 14, source: 'common', tags: 'ramen noodle soup japanese' },
  { name: 'Bibimbap', servingSize: 1, servingUnit: 'bowl', calories: 490, protein: 24, carbs: 65, fat: 14, source: 'common', tags: 'bibimbap korean rice bowl' },
  { name: 'Chicken Shawarma', servingSize: 1, servingUnit: 'serving (150g)', calories: 320, protein: 28, carbs: 8, fat: 20, source: 'common', tags: 'chicken shawarma middle eastern wrap' },

  // ── More Fast Food & Restaurant ──
  { name: 'Chicken Burrito (flour tortilla)', servingSize: 1, servingUnit: 'burrito', calories: 720, protein: 44, carbs: 75, fat: 24, source: 'common', tags: 'chicken burrito flour tortilla mexican' },
  { name: 'Beef Burrito', servingSize: 1, servingUnit: 'burrito', calories: 780, protein: 42, carbs: 72, fat: 30, source: 'common', tags: 'beef burrito mexican' },
  { name: 'Pizza (pepperoni, 1 slice)', servingSize: 1, servingUnit: 'slice (107g)', calories: 313, protein: 13, carbs: 34, fat: 13, source: 'common', tags: 'pizza pepperoni slice' },
  { name: 'Chicken Nuggets (6 pc)', servingSize: 6, servingUnit: 'pieces (100g)', calories: 280, protein: 14, carbs: 17, fat: 17, source: 'common', tags: 'chicken nuggets fast food' },
  { name: 'Chicken Sandwich (grilled)', servingSize: 1, servingUnit: 'sandwich', calories: 430, protein: 38, carbs: 42, fat: 10, source: 'common', tags: 'grilled chicken sandwich fast food' },
  { name: 'Chicken Sandwich (fried)', servingSize: 1, servingUnit: 'sandwich', calories: 600, protein: 35, carbs: 57, fat: 25, source: 'common', tags: 'fried chicken sandwich fast food' },
  { name: 'Hot Dog (with bun)', servingSize: 1, servingUnit: 'hot dog', calories: 310, protein: 11, carbs: 24, fat: 19, source: 'common', tags: 'hot dog frankfurter bun' },
  { name: 'Nachos with Cheese', servingSize: 1, servingUnit: 'serving (113g)', calories: 345, protein: 9, carbs: 36, fat: 19, source: 'common', tags: 'nachos cheese chips' },
  { name: 'Fish Tacos (2)', servingSize: 2, servingUnit: 'tacos', calories: 340, protein: 20, carbs: 36, fat: 12, source: 'common', tags: 'fish tacos mexican' },
  { name: 'Starbucks Latte (grande)', servingSize: 1, servingUnit: '16 fl oz', calories: 190, protein: 13, carbs: 19, fat: 7, source: 'common', tags: 'starbucks latte grande 2% milk coffee' },
  { name: 'Starbucks Frappuccino (grande)', servingSize: 1, servingUnit: '16 fl oz', calories: 420, protein: 5, carbs: 62, fat: 16, source: 'common', tags: 'starbucks frappuccino grande blended coffee' },

  // ── Breakfast Additions ──
  { name: 'Smoothie (fruit, no added sugar)', servingSize: 1, servingUnit: '12 fl oz', calories: 180, protein: 3, carbs: 42, fat: 1, source: 'common', tags: 'smoothie fruit blended breakfast drink' },
  { name: 'Green Smoothie', servingSize: 1, servingUnit: '12 fl oz', calories: 150, protein: 4, carbs: 32, fat: 2, source: 'common', tags: 'green smoothie spinach fruit blended' },
  { name: 'Protein Smoothie', servingSize: 1, servingUnit: '16 fl oz', calories: 310, protein: 30, carbs: 35, fat: 6, source: 'common', tags: 'protein smoothie shake blended' },
  { name: 'Acai Bowl', servingSize: 1, servingUnit: 'bowl (300g)', calories: 380, protein: 8, carbs: 60, fat: 14, source: 'common', tags: 'acai bowl breakfast granola fruit' },
  { name: 'Yogurt Parfait', servingSize: 1, servingUnit: 'parfait', calories: 280, protein: 14, carbs: 42, fat: 7, source: 'common', tags: 'yogurt parfait granola fruit breakfast' },
  { name: 'Muffin (blueberry)', servingSize: 1, servingUnit: 'large muffin (130g)', calories: 430, protein: 6, carbs: 67, fat: 16, source: 'common', tags: 'blueberry muffin breakfast baked' },
  { name: 'Biscuit (plain)', servingSize: 1, servingUnit: 'biscuit (60g)', calories: 215, protein: 4, carbs: 27, fat: 10, source: 'common', tags: 'biscuit plain bread breakfast southern' },
  { name: 'Breakfast Sandwich (egg, cheese, sausage)', servingSize: 1, servingUnit: 'sandwich', calories: 490, protein: 21, carbs: 36, fat: 29, source: 'common', tags: 'breakfast sandwich egg cheese sausage muffin' },
  { name: 'Banana Bread (1 slice)', servingSize: 1, servingUnit: 'slice (60g)', calories: 196, protein: 3, carbs: 33, fat: 6, source: 'common', tags: 'banana bread slice baked breakfast snack' },

  // ── Soups & Stews ──
  { name: 'Tomato Soup', servingSize: 1, servingUnit: 'cup (245g)', calories: 90, protein: 2, carbs: 20, fat: 1, source: 'common', tags: 'tomato soup canned' },
  { name: 'Minestrone Soup', servingSize: 1, servingUnit: 'cup (241g)', calories: 82, protein: 4, carbs: 15, fat: 1, source: 'common', tags: 'minestrone soup vegetable italian' },
  { name: 'French Onion Soup', servingSize: 1, servingUnit: 'cup (245g)', calories: 155, protein: 7, carbs: 21, fat: 5, source: 'common', tags: 'french onion soup' },
  { name: 'Clam Chowder (New England)', servingSize: 1, servingUnit: 'cup (245g)', calories: 190, protein: 10, carbs: 18, fat: 8, source: 'common', tags: 'clam chowder new england soup' },
  { name: 'Lentil Soup', servingSize: 1, servingUnit: 'cup (248g)', calories: 215, protein: 13, carbs: 36, fat: 3, source: 'common', tags: 'lentil soup vegetarian legumes' },
  { name: 'Chicken Noodle Soup', servingSize: 1, servingUnit: 'cup (241g)', calories: 75, protein: 6, carbs: 9, fat: 2, source: 'common', tags: 'chicken noodle soup' },
  { name: 'Black Bean Soup', servingSize: 1, servingUnit: 'cup (247g)', calories: 218, protein: 14, carbs: 40, fat: 1, source: 'common', tags: 'black bean soup legumes' },

  // ── Desserts ──
  { name: 'Ice Cream (vanilla)', servingSize: 0.5, servingUnit: 'cup (66g)', calories: 137, protein: 2, carbs: 16, fat: 7, source: 'common', tags: 'ice cream vanilla dessert' },
  { name: 'Ice Cream (chocolate)', servingSize: 0.5, servingUnit: 'cup (66g)', calories: 143, protein: 3, carbs: 19, fat: 7, source: 'common', tags: 'ice cream chocolate dessert' },
  { name: 'Frozen Yogurt', servingSize: 0.5, servingUnit: 'cup (113g)', calories: 115, protein: 3, carbs: 24, fat: 1, source: 'common', tags: 'frozen yogurt froyo dessert' },
  { name: 'Chocolate Chip Cookie', servingSize: 1, servingUnit: 'medium cookie (40g)', calories: 178, protein: 2, carbs: 24, fat: 9, source: 'common', tags: 'chocolate chip cookie dessert baked' },
  { name: 'Brownie', servingSize: 1, servingUnit: 'square (56g)', calories: 243, protein: 3, carbs: 36, fat: 11, source: 'common', tags: 'brownie chocolate dessert baked' },
  { name: 'Cheesecake (1 slice)', servingSize: 1, servingUnit: 'slice (125g)', calories: 400, protein: 6, carbs: 37, fat: 26, source: 'common', tags: 'cheesecake dessert slice' },
  { name: 'Apple Pie (1 slice)', servingSize: 1, servingUnit: 'slice (125g)', calories: 296, protein: 2, carbs: 43, fat: 14, source: 'common', tags: 'apple pie dessert slice' },
  { name: 'Dark Chocolate Bar', servingSize: 1, servingUnit: 'oz (28g)', calories: 170, protein: 2, carbs: 13, fat: 12, source: 'common', tags: 'dark chocolate bar dessert snack 70' },
  { name: 'Milk Chocolate', servingSize: 1, servingUnit: 'oz (28g)', calories: 153, protein: 2, carbs: 17, fat: 9, source: 'common', tags: 'milk chocolate dessert snack' },
  { name: 'Donut (glazed)', servingSize: 1, servingUnit: 'donut (60g)', calories: 253, protein: 3, carbs: 30, fat: 14, source: 'common', tags: 'donut glazed breakfast dessert' },

  // ── Protein & Health Foods ──
  { name: 'Whey Protein Powder', servingSize: 1, servingUnit: 'scoop (31g)', calories: 120, protein: 25, carbs: 3, fat: 1, source: 'common', tags: 'whey protein powder supplement' },
  { name: 'Casein Protein Powder', servingSize: 1, servingUnit: 'scoop (34g)', calories: 120, protein: 24, carbs: 4, fat: 1, source: 'common', tags: 'casein protein powder supplement slow' },
  { name: 'Plant Protein Powder', servingSize: 1, servingUnit: 'scoop (32g)', calories: 115, protein: 20, carbs: 5, fat: 3, source: 'common', tags: 'plant protein powder vegan supplement pea' },
  { name: 'Greek Yogurt (2% plain)', servingSize: 1, servingUnit: 'cup (227g)', calories: 150, protein: 20, carbs: 8, fat: 4, source: 'common', tags: 'greek yogurt 2% plain dairy protein' },
  { name: 'Kefir (plain)', servingSize: 1, servingUnit: 'cup (240ml)', calories: 110, protein: 11, carbs: 12, fat: 2, source: 'common', tags: 'kefir plain dairy probiotic drink' },
  { name: 'Bone Broth', servingSize: 1, servingUnit: 'cup (240ml)', calories: 35, protein: 7, carbs: 0, fat: 1, source: 'common', tags: 'bone broth collagen drink' },
  { name: 'Collagen Peptides', servingSize: 2, servingUnit: 'tbsp (20g)', calories: 70, protein: 18, carbs: 0, fat: 0, source: 'common', tags: 'collagen peptides supplement powder' },

  // ── More Grains & Breads ──
  { name: 'Bulgur (cooked)', servingSize: 1, servingUnit: 'cup (182g)', calories: 151, protein: 6, carbs: 34, fat: 0, source: 'common', tags: 'bulgur cooked grain whole wheat' },
  { name: 'Farro (cooked)', servingSize: 1, servingUnit: 'cup (200g)', calories: 220, protein: 8, carbs: 46, fat: 2, source: 'common', tags: 'farro cooked grain ancient whole' },
  { name: 'Barley (cooked)', servingSize: 1, servingUnit: 'cup (157g)', calories: 193, protein: 4, carbs: 44, fat: 1, source: 'common', tags: 'barley cooked grain whole' },
  { name: 'Polenta (cooked)', servingSize: 1, servingUnit: 'cup (240g)', calories: 145, protein: 3, carbs: 31, fat: 1, source: 'common', tags: 'polenta cooked cornmeal grain italian' },
  { name: 'Grits (cooked)', servingSize: 1, servingUnit: 'cup (242g)', calories: 182, protein: 4, carbs: 38, fat: 1, source: 'common', tags: 'grits cooked cornmeal southern breakfast' },
  { name: 'Wild Rice (cooked)', servingSize: 1, servingUnit: 'cup (164g)', calories: 166, protein: 7, carbs: 35, fat: 1, source: 'common', tags: 'wild rice cooked grain' },
  { name: 'Sourdough Roll', servingSize: 1, servingUnit: 'roll (57g)', calories: 145, protein: 5, carbs: 28, fat: 1, source: 'common', tags: 'sourdough roll bread dinner' },
  { name: 'Dinner Roll', servingSize: 1, servingUnit: 'roll (28g)', calories: 87, protein: 2, carbs: 15, fat: 2, source: 'common', tags: 'dinner roll bread white' },
  { name: 'Flatbread', servingSize: 1, servingUnit: 'piece (45g)', calories: 130, protein: 4, carbs: 26, fat: 1, source: 'common', tags: 'flatbread bread wrap' },
  { name: 'Rye Bread (1 slice)', servingSize: 1, servingUnit: 'slice (32g)', calories: 83, protein: 3, carbs: 15, fat: 1, source: 'common', tags: 'rye bread slice loaf' },
  { name: 'Cornbread (1 piece)', servingSize: 1, servingUnit: 'piece (65g)', calories: 188, protein: 4, carbs: 28, fat: 7, source: 'common', tags: 'cornbread piece southern baked' },

  // ── More Dairy & Cheese ──
  { name: 'Ricotta (whole milk)', servingSize: 0.5, servingUnit: 'cup (124g)', calories: 216, protein: 14, carbs: 4, fat: 16, source: 'common', tags: 'ricotta whole milk cheese dairy italian' },
  { name: 'Brie', servingSize: 1, servingUnit: 'oz (28g)', calories: 95, protein: 6, carbs: 0, fat: 8, source: 'common', tags: 'brie cheese dairy french soft' },
  { name: 'Gouda', servingSize: 1, servingUnit: 'oz (28g)', calories: 101, protein: 7, carbs: 1, fat: 8, source: 'common', tags: 'gouda cheese dairy dutch' },
  { name: 'Goat Cheese (chèvre)', servingSize: 1, servingUnit: 'oz (28g)', calories: 75, protein: 5, carbs: 0, fat: 6, source: 'common', tags: 'goat cheese chevre dairy soft' },
  { name: 'Provolone', servingSize: 1, servingUnit: 'oz (28g)', calories: 98, protein: 7, carbs: 1, fat: 7, source: 'common', tags: 'provolone cheese dairy italian' },
  { name: 'Colby Jack', servingSize: 1, servingUnit: 'oz (28g)', calories: 110, protein: 7, carbs: 0, fat: 9, source: 'common', tags: 'colby jack cheese dairy' },
  { name: 'Half & Half', servingSize: 2, servingUnit: 'tbsp (30ml)', calories: 39, protein: 1, carbs: 1, fat: 3, source: 'common', tags: 'half half cream dairy coffee' },
  { name: 'Whipped Cream', servingSize: 2, servingUnit: 'tbsp (8g)', calories: 20, protein: 0, carbs: 1, fat: 2, source: 'common', tags: 'whipped cream dairy dessert topping' },
  { name: 'Skyr (Icelandic yogurt)', servingSize: 1, servingUnit: 'cup (227g)', calories: 100, protein: 17, carbs: 6, fat: 0, source: 'common', tags: 'skyr icelandic yogurt dairy protein' },

  // ── More Beverages ──
  { name: 'Coconut Water', servingSize: 1, servingUnit: 'cup (240ml)', calories: 46, protein: 2, carbs: 9, fat: 0, source: 'common', tags: 'coconut water electrolytes drink' },
  { name: 'Kombucha', servingSize: 1, servingUnit: '16 fl oz bottle', calories: 60, protein: 0, carbs: 14, fat: 0, source: 'common', tags: 'kombucha fermented tea probiotic drink' },
  { name: 'Sports Drink (Gatorade)', servingSize: 1, servingUnit: '20 fl oz bottle', calories: 140, protein: 0, carbs: 36, fat: 0, source: 'common', tags: 'gatorade sports drink electrolytes' },
  { name: 'Energy Drink (Red Bull)', servingSize: 1, servingUnit: '8.4 fl oz can', calories: 110, protein: 1, carbs: 27, fat: 0, source: 'common', tags: 'red bull energy drink caffeine' },
  { name: 'Sparkling Water', servingSize: 12, servingUnit: 'fl oz', calories: 0, protein: 0, carbs: 0, fat: 0, source: 'common', tags: 'sparkling water seltzer carbonated drink' },
  { name: 'Soda (cola, 12 oz)', servingSize: 12, servingUnit: 'fl oz', calories: 150, protein: 0, carbs: 39, fat: 0, source: 'common', tags: 'soda cola coke pepsi carbonated drink' },
  { name: 'Diet Soda', servingSize: 12, servingUnit: 'fl oz', calories: 0, protein: 0, carbs: 0, fat: 0, source: 'common', tags: 'diet soda cola zero sugar drink' },
  { name: 'Whole Milk Latte (homemade)', servingSize: 12, servingUnit: 'fl oz', calories: 200, protein: 10, carbs: 16, fat: 8, source: 'common', tags: 'latte whole milk homemade coffee' },
  { name: 'Matcha Latte', servingSize: 12, servingUnit: 'fl oz', calories: 160, protein: 8, carbs: 16, fat: 7, source: 'common', tags: 'matcha latte green tea milk drink' },
  { name: 'Hot Chocolate', servingSize: 8, servingUnit: 'fl oz', calories: 195, protein: 8, carbs: 27, fat: 6, source: 'common', tags: 'hot chocolate cocoa milk drink' },
  { name: 'Protein Shake (ready to drink)', servingSize: 1, servingUnit: '11 fl oz bottle', calories: 160, protein: 30, carbs: 6, fat: 3, source: 'common', tags: 'protein shake ready to drink fairlife premier' },

  // ── Lamb, Venison & Other Proteins ──
  { name: 'Lamb Chop (grilled)', servingSize: 3, servingUnit: 'oz (85g)', calories: 250, protein: 22, carbs: 0, fat: 17, source: 'common', tags: 'lamb chop grilled meat' },
  { name: 'Ground Lamb (cooked)', servingSize: 4, servingUnit: 'oz', calories: 320, protein: 23, carbs: 0, fat: 25, source: 'common', tags: 'ground lamb cooked meat' },
  { name: 'Venison / Deer (roasted)', servingSize: 4, servingUnit: 'oz', calories: 215, protein: 32, carbs: 0, fat: 9, source: 'common', tags: 'venison deer roasted game meat' },
  { name: 'Bison Burger', servingSize: 1, servingUnit: 'patty (113g)', calories: 245, protein: 27, carbs: 0, fat: 15, source: 'common', tags: 'bison buffalo burger patty lean' },
  { name: 'Duck Breast (cooked)', servingSize: 4, servingUnit: 'oz', calories: 230, protein: 26, carbs: 0, fat: 14, source: 'common', tags: 'duck breast cooked poultry' },

  // ── More Seafood ──
  { name: 'Mussels (steamed)', servingSize: 3, servingUnit: 'oz (85g)', calories: 73, protein: 10, carbs: 3, fat: 2, source: 'common', tags: 'mussels steamed seafood shellfish' },
  { name: 'Oysters (raw)', servingSize: 6, servingUnit: 'medium oysters (84g)', calories: 57, protein: 6, carbs: 3, fat: 2, source: 'common', tags: 'oysters raw seafood shellfish' },
  { name: 'Clams (steamed)', servingSize: 3, servingUnit: 'oz (85g)', calories: 63, protein: 11, carbs: 2, fat: 1, source: 'common', tags: 'clams steamed seafood shellfish' },
  { name: 'Swordfish (grilled)', servingSize: 6, servingUnit: 'oz', calories: 310, protein: 40, carbs: 0, fat: 15, source: 'common', tags: 'swordfish grilled fish' },
  { name: 'Trout (baked)', servingSize: 6, servingUnit: 'oz', calories: 280, protein: 40, carbs: 0, fat: 13, source: 'common', tags: 'trout baked fish' },
  { name: 'Anchovies (canned)', servingSize: 5, servingUnit: 'anchovies (20g)', calories: 42, protein: 6, carbs: 0, fat: 2, source: 'common', tags: 'anchovies canned fish pizza salad' },
  { name: 'Imitation Crab (surimi)', servingSize: 3, servingUnit: 'oz (85g)', calories: 81, protein: 8, carbs: 13, fat: 0, source: 'common', tags: 'imitation crab surimi seafood' },
  { name: 'Fish Fillet (battered, fried)', servingSize: 1, servingUnit: 'fillet (91g)', calories: 205, protein: 13, carbs: 15, fat: 11, source: 'common', tags: 'fish fillet battered fried' },

  // ── Dips, Spreads & Sauces ──
  { name: 'Tzatziki', servingSize: 2, servingUnit: 'tbsp (30g)', calories: 30, protein: 2, carbs: 2, fat: 2, source: 'common', tags: 'tzatziki greek yogurt cucumber dip' },
  { name: 'Baba Ganoush', servingSize: 2, servingUnit: 'tbsp (30g)', calories: 45, protein: 1, carbs: 4, fat: 3, source: 'common', tags: 'baba ganoush eggplant dip middle eastern' },
  { name: 'Tahini', servingSize: 1, servingUnit: 'tbsp (15g)', calories: 89, protein: 3, carbs: 3, fat: 8, source: 'common', tags: 'tahini sesame paste spread middle eastern' },
  { name: 'Pesto', servingSize: 2, servingUnit: 'tbsp (30g)', calories: 160, protein: 3, carbs: 2, fat: 16, source: 'common', tags: 'pesto basil sauce pasta italian' },
  { name: 'Marinara Sauce', servingSize: 0.5, servingUnit: 'cup (125g)', calories: 70, protein: 2, carbs: 14, fat: 2, source: 'common', tags: 'marinara sauce tomato pasta italian' },
  { name: 'Alfredo Sauce', servingSize: 0.25, servingUnit: 'cup (62g)', calories: 180, protein: 3, carbs: 3, fat: 18, source: 'common', tags: 'alfredo sauce cream pasta italian' },
  { name: 'Teriyaki Sauce', servingSize: 2, servingUnit: 'tbsp (30ml)', calories: 60, protein: 1, carbs: 14, fat: 0, source: 'common', tags: 'teriyaki sauce asian marinade' },
  { name: 'Coconut Milk (canned, full fat)', servingSize: 0.25, servingUnit: 'cup (60ml)', calories: 110, protein: 1, carbs: 2, fat: 12, source: 'common', tags: 'coconut milk canned full fat cooking thai' },
  { name: 'Sriracha', servingSize: 1, servingUnit: 'tsp (6g)', calories: 5, protein: 0, carbs: 1, fat: 0, source: 'common', tags: 'sriracha hot sauce spicy condiment' },
  { name: 'Worcestershire Sauce', servingSize: 1, servingUnit: 'tsp (5ml)', calories: 4, protein: 0, carbs: 1, fat: 0, source: 'common', tags: 'worcestershire sauce condiment' },

  // ── More Salads & Light Meals ──
  { name: 'Greek Salad', servingSize: 1, servingUnit: 'serving (300g)', calories: 185, protein: 5, carbs: 10, fat: 15, source: 'common', tags: 'greek salad feta olives cucumber tomato' },
  { name: 'Cobb Salad', servingSize: 1, servingUnit: 'serving', calories: 480, protein: 30, carbs: 12, fat: 36, source: 'common', tags: 'cobb salad chicken bacon egg' },
  { name: 'Caprese Salad', servingSize: 1, servingUnit: 'serving (200g)', calories: 250, protein: 14, carbs: 6, fat: 18, source: 'common', tags: 'caprese salad mozzarella tomato basil italian' },
  { name: 'Nicoise Salad', servingSize: 1, servingUnit: 'serving', calories: 340, protein: 24, carbs: 22, fat: 16, source: 'common', tags: 'nicoise salad tuna egg french' },
  { name: 'Waldorf Salad', servingSize: 1, servingUnit: 'cup (150g)', calories: 220, protein: 2, carbs: 20, fat: 15, source: 'common', tags: 'waldorf salad apple walnut celery' },
  { name: 'Tabbouleh', servingSize: 0.5, servingUnit: 'cup (75g)', calories: 95, protein: 2, carbs: 13, fat: 5, source: 'common', tags: 'tabbouleh bulgur parsley middle eastern' },
  { name: 'Quinoa Salad', servingSize: 1, servingUnit: 'cup (185g)', calories: 285, protein: 10, carbs: 42, fat: 9, source: 'common', tags: 'quinoa salad grain bowl' },

  // ── More Restaurant & Takeout ──
  { name: 'Chicken Caesar Wrap', servingSize: 1, servingUnit: 'wrap', calories: 510, protein: 32, carbs: 44, fat: 22, source: 'common', tags: 'chicken caesar wrap lunch' },
  { name: 'Veggie Burger', servingSize: 1, servingUnit: 'patty (113g)', calories: 120, protein: 15, carbs: 9, fat: 3, source: 'common', tags: 'veggie burger plant based patty' },
  { name: 'Salmon Bowl (rice + veggies)', servingSize: 1, servingUnit: 'bowl', calories: 580, protein: 38, carbs: 58, fat: 18, source: 'common', tags: 'salmon bowl rice vegetables poke' },
  { name: 'Poke Bowl (tuna)', servingSize: 1, servingUnit: 'bowl', calories: 520, protein: 30, carbs: 64, fat: 12, source: 'common', tags: 'poke bowl tuna rice hawaiian' },
  { name: 'Breakfast Bowl (egg, potato, veggie)', servingSize: 1, servingUnit: 'bowl', calories: 420, protein: 18, carbs: 42, fat: 20, source: 'common', tags: 'breakfast bowl egg potato vegetables' },
  { name: 'Açaí Bowl (large)', servingSize: 1, servingUnit: 'large bowl', calories: 500, protein: 10, carbs: 80, fat: 18, source: 'common', tags: 'acai bowl large granola fruit' },
  { name: 'Club Sandwich', servingSize: 1, servingUnit: 'sandwich', calories: 590, protein: 36, carbs: 44, fat: 28, source: 'common', tags: 'club sandwich turkey bacon triple decker' },
  { name: 'Philly Cheesesteak', servingSize: 1, servingUnit: 'sandwich', calories: 710, protein: 38, carbs: 52, fat: 38, source: 'common', tags: 'philly cheesesteak sandwich beef' },
  { name: 'Chicken Quesadilla', servingSize: 1, servingUnit: 'quesadilla (1 tortilla)', calories: 530, protein: 32, carbs: 40, fat: 26, source: 'common', tags: 'chicken quesadilla tortilla cheese mexican' },
  { name: 'Cheese Quesadilla', servingSize: 1, servingUnit: 'quesadilla (1 tortilla)', calories: 410, protein: 18, carbs: 38, fat: 22, source: 'common', tags: 'cheese quesadilla tortilla mexican' },

  // ── Miscellaneous Whole Foods ──
  { name: 'Egg Noodles (cooked)', servingSize: 1, servingUnit: 'cup (160g)', calories: 221, protein: 7, carbs: 40, fat: 3, source: 'common', tags: 'egg noodles cooked pasta' },
  { name: 'Tortellini (cheese, cooked)', servingSize: 1, servingUnit: 'cup (108g)', calories: 332, protein: 15, carbs: 51, fat: 8, source: 'common', tags: 'tortellini cheese cooked pasta italian' },
  { name: 'Gnocchi (cooked)', servingSize: 1, servingUnit: 'cup (180g)', calories: 250, protein: 6, carbs: 52, fat: 2, source: 'common', tags: 'gnocchi cooked potato pasta italian' },
  { name: 'Breakfast Sausage (patty)', servingSize: 2, servingUnit: 'patties (53g)', calories: 190, protein: 10, carbs: 2, fat: 16, source: 'common', tags: 'breakfast sausage patty pork morning' },
  { name: 'Canadian Bacon', servingSize: 3, servingUnit: 'slices (51g)', calories: 70, protein: 11, carbs: 1, fat: 3, source: 'common', tags: 'canadian bacon back pork breakfast lean' },
  { name: 'Liverwurst', servingSize: 2, servingUnit: 'oz (57g)', calories: 185, protein: 8, carbs: 2, fat: 16, source: 'common', tags: 'liverwurst liver sausage pork' },
  { name: 'Spam (classic)', servingSize: 2, servingUnit: 'oz (56g)', calories: 174, protein: 7, carbs: 2, fat: 15, source: 'common', tags: 'spam canned pork luncheon meat' },
  { name: 'Cream of Wheat (cooked)', servingSize: 1, servingUnit: 'cup (239g)', calories: 133, protein: 4, carbs: 28, fat: 0, source: 'common', tags: 'cream of wheat cooked hot cereal breakfast' },
  { name: 'Bagel with Cream Cheese', servingSize: 1, servingUnit: 'bagel + 2 tbsp cream cheese', calories: 370, protein: 12, carbs: 54, fat: 12, source: 'common', tags: 'bagel cream cheese breakfast' },
  { name: 'Pancakes with Syrup (2)', servingSize: 2, servingUnit: 'pancakes + 2 tbsp syrup', calories: 365, protein: 7, carbs: 67, fat: 8, source: 'common', tags: 'pancakes maple syrup breakfast' },
  { name: 'Oatmeal with Banana & Honey', servingSize: 1, servingUnit: 'bowl', calories: 300, protein: 6, carbs: 63, fat: 3, source: 'common', tags: 'oatmeal banana honey breakfast bowl' },
  { name: 'Refried Beans', servingSize: 0.5, servingUnit: 'cup (128g)', calories: 117, protein: 7, carbs: 20, fat: 2, source: 'common', tags: 'refried beans mexican pinto' },
  { name: 'Guacamole (with chips)', servingSize: 1, servingUnit: 'serving (45g guac + chips)', calories: 215, protein: 3, carbs: 22, fat: 14, source: 'common', tags: 'guacamole chips avocado snack' },
  { name: 'Coleslaw (creamy)', servingSize: 0.5, servingUnit: 'cup (113g)', calories: 150, protein: 1, carbs: 12, fat: 11, source: 'common', tags: 'coleslaw creamy cabbage side' },
  { name: 'Corn on the Cob (with butter)', servingSize: 1, servingUnit: 'ear', calories: 155, protein: 5, carbs: 31, fat: 4, source: 'common', tags: 'corn cob butter cooked' },
  { name: 'Baked Beans', servingSize: 0.5, servingUnit: 'cup (127g)', calories: 119, protein: 6, carbs: 27, fat: 0, source: 'common', tags: 'baked beans canned side barbecue' },
  { name: 'Potato Salad', servingSize: 0.5, servingUnit: 'cup (125g)', calories: 179, protein: 3, carbs: 20, fat: 10, source: 'common', tags: 'potato salad mayo side' },
  // ── More Proteins ──
  { name: 'Chicken Thigh (skinless, baked)', servingSize: 1, servingUnit: 'thigh (109g)', calories: 185, protein: 25, carbs: 0, fat: 9, source: 'common', tags: 'chicken thigh skinless baked roasted' },
  { name: 'Ground Turkey (93% lean)', servingSize: 4, servingUnit: 'oz (113g)', calories: 170, protein: 22, carbs: 0, fat: 9, source: 'common', tags: 'ground turkey lean cooked' },
  { name: 'Pork Tenderloin (roasted)', servingSize: 3, servingUnit: 'oz (85g)', calories: 120, protein: 22, carbs: 0, fat: 3, source: 'common', tags: 'pork tenderloin lean roasted' },
  { name: 'Lamb Chop (grilled)', servingSize: 3, servingUnit: 'oz (85g)', calories: 200, protein: 23, carbs: 0, fat: 11, source: 'common', tags: 'lamb chop grilled' },
  { name: 'Canned Chicken (in water)', servingSize: 0.5, servingUnit: 'cup (112g)', calories: 130, protein: 25, carbs: 0, fat: 3, source: 'common', tags: 'canned chicken white meat' },
  // ── More Vegetables ──
  { name: 'Roasted Brussels Sprouts', servingSize: 1, servingUnit: 'cup (156g)', calories: 65, protein: 5, carbs: 13, fat: 0, source: 'common', tags: 'brussels sprouts roasted baked vegetable' },
  { name: 'Steamed Broccoli', servingSize: 1, servingUnit: 'cup (156g)', calories: 55, protein: 4, carbs: 11, fat: 1, source: 'common', tags: 'broccoli steamed vegetable' },
  { name: 'Mashed Cauliflower', servingSize: 1, servingUnit: 'cup (200g)', calories: 65, protein: 5, carbs: 12, fat: 1, source: 'common', tags: 'cauliflower mashed low carb' },
  { name: 'Sautéed Mushrooms', servingSize: 0.5, servingUnit: 'cup (78g)', calories: 50, protein: 2, carbs: 4, fat: 3, source: 'common', tags: 'mushrooms sauteed cooked' },
  { name: 'Grilled Zucchini', servingSize: 1, servingUnit: 'cup slices (180g)', calories: 30, protein: 2, carbs: 5, fat: 1, source: 'common', tags: 'zucchini grilled squash vegetable' },
  // ── More Dairy / Eggs ──
  { name: 'Egg Whites (cooked)', servingSize: 3, servingUnit: 'large whites (99g)', calories: 50, protein: 11, carbs: 0, fat: 0, source: 'common', tags: 'egg whites cooked protein' },
  { name: 'Cottage Cheese (2%)', servingSize: 0.5, servingUnit: 'cup (113g)', calories: 90, protein: 13, carbs: 5, fat: 2, source: 'common', tags: 'cottage cheese 2% low fat' },
  { name: 'Whole Milk Yogurt (plain)', servingSize: 1, servingUnit: 'cup (245g)', calories: 150, protein: 9, carbs: 11, fat: 8, source: 'common', tags: 'yogurt whole milk plain' },
  { name: 'Kefir (plain)', servingSize: 1, servingUnit: 'cup (240ml)', calories: 110, protein: 10, carbs: 12, fat: 2, source: 'common', tags: 'kefir fermented dairy probiotic' },
  // ── More Grains / Bread ──
  { name: 'Pita Bread (whole wheat)', servingSize: 1, servingUnit: 'pita (64g)', calories: 165, protein: 6, carbs: 33, fat: 1, source: 'common', tags: 'pita bread whole wheat' },
  { name: 'English Muffin', servingSize: 1, servingUnit: 'muffin (57g)', calories: 130, protein: 5, carbs: 25, fat: 1, source: 'common', tags: 'english muffin breakfast bread' },
  { name: 'Whole Wheat Crackers', servingSize: 16, servingUnit: 'crackers (30g)', calories: 130, protein: 3, carbs: 22, fat: 4, source: 'common', tags: 'whole wheat crackers snack' },
  { name: 'Granola Bar', servingSize: 1, servingUnit: 'bar (47g)', calories: 190, protein: 4, carbs: 29, fat: 7, source: 'common', tags: 'granola bar snack oats' },
  // ── More Fruit ──
  { name: 'Pineapple (fresh)', servingSize: 1, servingUnit: 'cup chunks (165g)', calories: 82, protein: 1, carbs: 22, fat: 0, source: 'common', tags: 'pineapple fresh fruit tropical' },
  { name: 'Kiwi', servingSize: 2, servingUnit: 'medium (148g)', calories: 90, protein: 2, carbs: 22, fat: 1, source: 'common', tags: 'kiwi fruit vitamin c' },
  { name: 'Dried Cranberries', servingSize: 0.25, servingUnit: 'cup (40g)', calories: 130, protein: 0, carbs: 33, fat: 0, source: 'common', tags: 'dried cranberries craisins snack' },
  { name: 'Raisins', servingSize: 0.25, servingUnit: 'cup (41g)', calories: 123, protein: 1, carbs: 33, fat: 0, source: 'common', tags: 'raisins dried grapes snack' },
  // ── More Meals / Mixed Dishes ──
  { name: 'Chicken Caesar Salad', servingSize: 1, servingUnit: 'plate (~400g)', calories: 470, protein: 36, carbs: 20, fat: 28, source: 'common', tags: 'chicken caesar salad restaurant' },
  { name: 'Stir-Fry (chicken & vegetables)', servingSize: 1, servingUnit: 'cup (200g)', calories: 220, protein: 22, carbs: 14, fat: 8, source: 'common', tags: 'chicken stir fry vegetables rice' },
  { name: 'Beef Tacos (2)', servingSize: 2, servingUnit: 'tacos (~200g)', calories: 380, protein: 22, carbs: 34, fat: 16, source: 'common', tags: 'beef tacos mexican corn tortilla' },
  { name: 'Vegetable Curry with Rice', servingSize: 1, servingUnit: 'plate (~350g)', calories: 380, protein: 9, carbs: 65, fat: 10, source: 'common', tags: 'vegetable curry rice indian' },
  { name: 'Egg Fried Rice', servingSize: 1, servingUnit: 'cup (198g)', calories: 238, protein: 8, carbs: 38, fat: 6, source: 'common', tags: 'egg fried rice chinese takeout' },
  { name: 'Spaghetti with Marinara', servingSize: 1, servingUnit: 'cup pasta + sauce (280g)', calories: 290, protein: 10, carbs: 56, fat: 4, source: 'common', tags: 'spaghetti marinara pasta tomato' },
  { name: 'Falafel (3 pieces)', servingSize: 3, servingUnit: 'pieces (90g)', calories: 210, protein: 8, carbs: 22, fat: 10, source: 'common', tags: 'falafel middle eastern chickpea fried' },
  { name: 'Edamame', servingSize: 0.5, servingUnit: 'cup shelled (78g)', calories: 94, protein: 9, carbs: 7, fat: 4, source: 'common', tags: 'edamame soybean appetizer japanese snack' },
  { name: 'Miso Soup', servingSize: 1, servingUnit: 'cup (240ml)', calories: 35, protein: 3, carbs: 4, fat: 1, source: 'common', tags: 'miso soup japanese tofu seaweed' },
  { name: 'Chicken Noodle Soup', servingSize: 1, servingUnit: 'cup (241g)', calories: 75, protein: 6, carbs: 9, fat: 2, source: 'common', tags: 'chicken noodle soup homemade canned' },
  { name: 'Pad Thai', servingSize: 1, servingUnit: 'plate (300g)', calories: 450, protein: 20, carbs: 55, fat: 17, source: 'common', tags: 'pad thai noodles thai restaurant' },
  { name: 'Hummus', servingSize: 2, servingUnit: 'tbsp (30g)', calories: 50, protein: 2, carbs: 6, fat: 3, source: 'common', tags: 'hummus chickpea dip spread' },
  { name: 'Baby Carrots', servingSize: 1, servingUnit: 'cup (128g)', calories: 53, protein: 1, carbs: 12, fat: 0, source: 'common', tags: 'baby carrots raw snack vegetable' },
  { name: 'String Cheese', servingSize: 1, servingUnit: 'stick (28g)', calories: 80, protein: 6, carbs: 1, fat: 6, source: 'common', tags: 'string cheese mozzarella stick snack' },
  { name: 'Cashews', servingSize: 1, servingUnit: 'oz (28g)', calories: 157, protein: 5, carbs: 9, fat: 12, source: 'common', tags: 'cashews nuts snack' },
  { name: 'Sunflower Seeds', servingSize: 1, servingUnit: 'oz (28g)', calories: 165, protein: 5, carbs: 7, fat: 14, source: 'common', tags: 'sunflower seeds snack nuts' },
  { name: 'Dark Chocolate (70%+)', servingSize: 1, servingUnit: 'oz (28g)', calories: 170, protein: 2, carbs: 13, fat: 12, source: 'common', tags: 'dark chocolate 70% cocoa snack dessert' },

  // ── Mexican / Tex-Mex Dishes ──
  { name: 'Chicken Fajitas', servingSize: 1, servingUnit: 'serving (2 tortillas + filling)', calories: 500, protein: 36, carbs: 45, fat: 18, source: 'common', tags: 'chicken fajitas mexican tex mex peppers onions tortilla' },
  { name: 'Beef Fajitas', servingSize: 1, servingUnit: 'serving (2 tortillas + filling)', calories: 560, protein: 34, carbs: 45, fat: 22, source: 'common', tags: 'beef fajitas steak mexican tex mex peppers onions tortilla' },
  { name: 'Shrimp Fajitas', servingSize: 1, servingUnit: 'serving (2 tortillas + filling)', calories: 430, protein: 30, carbs: 46, fat: 14, source: 'common', tags: 'shrimp fajitas mexican tex mex seafood peppers onions tortilla' },
  { name: 'Chicken Burrito', servingSize: 1, servingUnit: 'burrito (~400g)', calories: 740, protein: 45, carbs: 85, fat: 22, source: 'common', tags: 'chicken burrito mexican rice beans cheese' },
  { name: 'Beef Burrito', servingSize: 1, servingUnit: 'burrito (~400g)', calories: 800, protein: 40, carbs: 86, fat: 28, source: 'common', tags: 'beef burrito mexican rice beans cheese' },
  { name: 'Bean & Cheese Burrito', servingSize: 1, servingUnit: 'burrito (~280g)', calories: 490, protein: 18, carbs: 72, fat: 14, source: 'common', tags: 'bean cheese burrito vegetarian mexican' },
  { name: 'Cheese Quesadilla', servingSize: 1, servingUnit: 'quesadilla (half 10" tortilla)', calories: 380, protein: 16, carbs: 34, fat: 20, source: 'common', tags: 'cheese quesadilla mexican snack' },
  { name: 'Chicken Quesadilla', servingSize: 1, servingUnit: 'quesadilla (half 10" tortilla)', calories: 450, protein: 30, carbs: 34, fat: 21, source: 'common', tags: 'chicken quesadilla mexican' },
  { name: 'Cheese Enchiladas (2)', servingSize: 2, servingUnit: 'enchiladas', calories: 480, protein: 20, carbs: 46, fat: 24, source: 'common', tags: 'cheese enchiladas mexican baked' },
  { name: 'Chicken Enchiladas (2)', servingSize: 2, servingUnit: 'enchiladas', calories: 520, protein: 34, carbs: 46, fat: 20, source: 'common', tags: 'chicken enchiladas mexican baked' },
  { name: 'Nachos (with cheese)', servingSize: 1, servingUnit: 'serving (~200g)', calories: 550, protein: 14, carbs: 58, fat: 30, source: 'common', tags: 'nachos cheese chips mexican appetizer' },
  { name: 'Nachos (fully loaded)', servingSize: 1, servingUnit: 'serving (~350g)', calories: 850, protein: 30, carbs: 70, fat: 48, source: 'common', tags: 'nachos loaded beef sour cream guacamole mexican' },
  { name: 'Fish Tacos (2)', servingSize: 2, servingUnit: 'tacos (~200g)', calories: 380, protein: 24, carbs: 38, fat: 14, source: 'common', tags: 'fish tacos baja seafood corn tortilla slaw' },
  { name: 'Shrimp Tacos (2)', servingSize: 2, servingUnit: 'tacos (~190g)', calories: 350, protein: 22, carbs: 38, fat: 12, source: 'common', tags: 'shrimp tacos seafood corn tortilla' },
  { name: 'Carnitas (3 oz)', servingSize: 3, servingUnit: 'oz (85g)', calories: 210, protein: 24, carbs: 0, fat: 12, source: 'common', tags: 'carnitas pork slow cooked mexican' },
  { name: 'Carne Asada (3 oz)', servingSize: 3, servingUnit: 'oz (85g)', calories: 185, protein: 22, carbs: 0, fat: 10, source: 'common', tags: 'carne asada beef steak mexican grilled' },
  { name: 'Spanish Rice', servingSize: 0.5, servingUnit: 'cup (95g)', calories: 150, protein: 3, carbs: 32, fat: 2, source: 'common', tags: 'spanish rice mexican side tomato' },
  { name: 'Pico de Gallo', servingSize: 0.25, servingUnit: 'cup (65g)', calories: 15, protein: 1, carbs: 4, fat: 0, source: 'common', tags: 'pico de gallo salsa fresh tomato onion' },
  { name: 'Sour Cream', servingSize: 2, servingUnit: 'tbsp (30g)', calories: 60, protein: 1, carbs: 1, fat: 6, source: 'common', tags: 'sour cream dairy topping mexican' },
  { name: 'Salsa (jarred)', servingSize: 2, servingUnit: 'tbsp (30g)', calories: 10, protein: 0, carbs: 2, fat: 0, source: 'common', tags: 'salsa jarred tomato condiment mexican' },

  // ── Asian Dishes ──
  { name: 'General Tso\'s Chicken', servingSize: 1, servingUnit: 'cup (240g)', calories: 430, protein: 22, carbs: 48, fat: 16, source: 'common', tags: 'general tso chicken chinese takeout fried' },
  { name: 'Orange Chicken', servingSize: 1, servingUnit: 'cup (240g)', calories: 480, protein: 20, carbs: 56, fat: 18, source: 'common', tags: 'orange chicken chinese takeout fried panda express' },
  { name: 'Kung Pao Chicken', servingSize: 1, servingUnit: 'cup (240g)', calories: 410, protein: 26, carbs: 30, fat: 20, source: 'common', tags: 'kung pao chicken chinese takeout peanuts' },
  { name: 'Beef & Broccoli', servingSize: 1, servingUnit: 'cup (240g)', calories: 340, protein: 28, carbs: 18, fat: 17, source: 'common', tags: 'beef broccoli chinese takeout stir fry' },
  { name: 'Lo Mein (chicken)', servingSize: 1, servingUnit: 'cup (220g)', calories: 320, protein: 18, carbs: 40, fat: 9, source: 'common', tags: 'lo mein chicken noodles chinese takeout' },
  { name: 'Chow Mein', servingSize: 1, servingUnit: 'cup (220g)', calories: 290, protein: 12, carbs: 38, fat: 10, source: 'common', tags: 'chow mein noodles chinese takeout' },
  { name: 'Sweet & Sour Chicken', servingSize: 1, servingUnit: 'cup (240g)', calories: 440, protein: 20, carbs: 58, fat: 14, source: 'common', tags: 'sweet sour chicken chinese takeout fried' },
  { name: 'Teriyaki Chicken (bowl)', servingSize: 1, servingUnit: 'bowl (380g)', calories: 480, protein: 38, carbs: 55, fat: 10, source: 'common', tags: 'teriyaki chicken bowl japanese rice' },
  { name: 'Teriyaki Salmon', servingSize: 1, servingUnit: 'fillet + sauce (200g)', calories: 370, protein: 40, carbs: 18, fat: 14, source: 'common', tags: 'teriyaki salmon japanese grilled fish' },
  { name: 'California Roll (8 pcs)', servingSize: 8, servingUnit: 'pieces', calories: 250, protein: 8, carbs: 42, fat: 6, source: 'common', tags: 'california roll sushi crab avocado cucumber' },
  { name: 'Spicy Tuna Roll (8 pcs)', servingSize: 8, servingUnit: 'pieces', calories: 290, protein: 14, carbs: 38, fat: 8, source: 'common', tags: 'spicy tuna roll sushi' },
  { name: 'Sashimi (6 pcs)', servingSize: 6, servingUnit: 'pieces (~120g)', calories: 160, protein: 28, carbs: 0, fat: 5, source: 'common', tags: 'sashimi sushi raw fish tuna salmon japanese' },
  { name: 'Spring Rolls (fried, 2)', servingSize: 2, servingUnit: 'rolls (~120g)', calories: 280, protein: 8, carbs: 32, fat: 14, source: 'common', tags: 'spring rolls fried chinese appetizer' },
  { name: 'Dumplings / Potstickers (6)', servingSize: 6, servingUnit: 'pieces (~180g)', calories: 310, protein: 14, carbs: 38, fat: 11, source: 'common', tags: 'dumplings potstickers gyoza chinese japanese' },
  { name: 'Chicken Tikka Masala', servingSize: 1, servingUnit: 'cup (240g)', calories: 360, protein: 30, carbs: 18, fat: 18, source: 'common', tags: 'chicken tikka masala indian curry tomato' },
  { name: 'Butter Chicken', servingSize: 1, servingUnit: 'cup (240g)', calories: 390, protein: 28, carbs: 16, fat: 22, source: 'common', tags: 'butter chicken indian curry creamy' },
  { name: 'Saag Paneer', servingSize: 1, servingUnit: 'cup (240g)', calories: 280, protein: 14, carbs: 12, fat: 20, source: 'common', tags: 'saag paneer spinach cheese indian curry' },
  { name: 'Fried Dumplings (6)', servingSize: 6, servingUnit: 'pieces (~180g)', calories: 380, protein: 14, carbs: 38, fat: 18, source: 'common', tags: 'fried dumplings potstickers pan fried chinese' },

  // ── American Comfort / Casual Dining ──
  { name: 'Chicken Parmesan', servingSize: 1, servingUnit: 'plate (~350g)', calories: 620, protein: 48, carbs: 42, fat: 28, source: 'common', tags: 'chicken parmesan parm italian american breaded' },
  { name: 'BBQ Chicken (half bird)', servingSize: 0.5, servingUnit: 'chicken (~300g)', calories: 580, protein: 62, carbs: 12, fat: 30, source: 'common', tags: 'bbq chicken barbecue grilled half' },
  { name: 'BBQ Ribs (half rack)', servingSize: 0.5, servingUnit: 'rack (~340g)', calories: 730, protein: 52, carbs: 16, fat: 50, source: 'common', tags: 'bbq ribs pork barbecue half rack' },
  { name: 'Pulled Pork (sandwich)', servingSize: 1, servingUnit: 'sandwich (~300g)', calories: 540, protein: 32, carbs: 52, fat: 20, source: 'common', tags: 'pulled pork sandwich bbq barbecue bun' },
  { name: 'Beef Chili', servingSize: 1, servingUnit: 'cup (253g)', calories: 290, protein: 22, carbs: 24, fat: 12, source: 'common', tags: 'beef chili beans tomato' },
  { name: 'White Chicken Chili', servingSize: 1, servingUnit: 'cup (253g)', calories: 260, protein: 26, carbs: 22, fat: 8, source: 'common', tags: 'white chicken chili beans' },
  { name: 'Pot Roast', servingSize: 1, servingUnit: 'serving (4 oz beef + veg)', calories: 380, protein: 35, carbs: 18, fat: 18, source: 'common', tags: 'pot roast beef slow cooked vegetables' },
  { name: 'Beef Stew', servingSize: 1, servingUnit: 'cup (245g)', calories: 250, protein: 20, carbs: 22, fat: 9, source: 'common', tags: 'beef stew vegetables potatoes hearty' },
  { name: 'Chicken Pot Pie', servingSize: 1, servingUnit: 'individual pie (284g)', calories: 550, protein: 20, carbs: 48, fat: 30, source: 'common', tags: 'chicken pot pie crust vegetables' },
  { name: 'Meatloaf', servingSize: 1, servingUnit: 'slice (150g)', calories: 290, protein: 24, carbs: 12, fat: 16, source: 'common', tags: 'meatloaf beef ground comfort food' },
  { name: 'Pork Chop (grilled)', servingSize: 1, servingUnit: 'chop (6 oz)', calories: 280, protein: 38, carbs: 0, fat: 13, source: 'common', tags: 'pork chop grilled boneless' },
  { name: 'Fried Chicken (2 pieces)', servingSize: 2, servingUnit: 'pieces (~200g)', calories: 480, protein: 38, carbs: 20, fat: 26, source: 'common', tags: 'fried chicken crispy breaded skin' },
  { name: 'Chicken Tenders (4)', servingSize: 4, servingUnit: 'tenders (~170g)', calories: 400, protein: 30, carbs: 28, fat: 18, source: 'common', tags: 'chicken tenders strips breaded fried' },
  { name: 'Chicken Nuggets (10)', servingSize: 10, servingUnit: 'nuggets (~170g)', calories: 420, protein: 24, carbs: 26, fat: 24, source: 'common', tags: 'chicken nuggets mcdonalds fried fast food' },
  { name: 'Fish & Chips', servingSize: 1, servingUnit: 'plate (~400g)', calories: 700, protein: 32, carbs: 70, fat: 32, source: 'common', tags: 'fish chips fried cod fries british' },
  { name: 'Shepherd\'s Pie', servingSize: 1, servingUnit: 'cup (240g)', calories: 300, protein: 18, carbs: 28, fat: 12, source: 'common', tags: 'shepherds pie lamb beef mashed potato' },
  { name: 'Macaroni & Cheese (homemade)', servingSize: 1, servingUnit: 'cup (200g)', calories: 390, protein: 14, carbs: 48, fat: 16, source: 'common', tags: 'mac cheese macaroni homemade' },
  { name: 'Grilled Salmon with Vegetables', servingSize: 1, servingUnit: 'plate (fillet + veg)', calories: 420, protein: 44, carbs: 16, fat: 18, source: 'common', tags: 'grilled salmon vegetables plate dinner' },
  { name: 'Shrimp Scampi', servingSize: 1, servingUnit: 'plate (~300g with pasta)', calories: 520, protein: 30, carbs: 46, fat: 22, source: 'common', tags: 'shrimp scampi pasta butter garlic italian' },
  { name: 'Steak & Potatoes', servingSize: 1, servingUnit: 'plate (6 oz steak + potato)', calories: 680, protein: 50, carbs: 48, fat: 28, source: 'common', tags: 'steak potatoes dinner baked potato sirloin' },
  { name: 'Chicken & Rice (plain)', servingSize: 1, servingUnit: 'plate (6 oz chicken + 1 cup rice)', calories: 530, protein: 54, carbs: 55, fat: 8, source: 'common', tags: 'chicken rice plain diet meal prep' },

  // ── Sandwiches & Wraps ──
  { name: 'Club Sandwich', servingSize: 1, servingUnit: 'sandwich', calories: 560, protein: 36, carbs: 42, fat: 26, source: 'common', tags: 'club sandwich turkey bacon triple decker' },
  { name: 'Philly Cheesesteak', servingSize: 1, servingUnit: 'sandwich (hoagie roll)', calories: 700, protein: 40, carbs: 58, fat: 30, source: 'common', tags: 'philly cheesesteak beef hoagie peppers onions' },
  { name: 'Reuben Sandwich', servingSize: 1, servingUnit: 'sandwich', calories: 620, protein: 32, carbs: 46, fat: 32, source: 'common', tags: 'reuben sandwich corned beef sauerkraut swiss rye' },
  { name: 'Italian Sub / Hoagie', servingSize: 1, servingUnit: 'sandwich (12")', calories: 680, protein: 36, carbs: 56, fat: 32, source: 'common', tags: 'italian sub hoagie salami pepperoni ham' },
  { name: 'Meatball Sub', servingSize: 1, servingUnit: 'sandwich (6")', calories: 580, protein: 28, carbs: 62, fat: 22, source: 'common', tags: 'meatball sub sandwich marinara mozzarella' },
  { name: 'Tuna Melt', servingSize: 1, servingUnit: 'sandwich', calories: 430, protein: 28, carbs: 34, fat: 20, source: 'common', tags: 'tuna melt sandwich cheese toasted' },
  { name: 'Chicken Wrap (grilled)', servingSize: 1, servingUnit: 'wrap', calories: 420, protein: 34, carbs: 38, fat: 12, source: 'common', tags: 'chicken wrap grilled tortilla lettuce' },
  { name: 'Crispy Chicken Sandwich', servingSize: 1, servingUnit: 'sandwich', calories: 650, protein: 32, carbs: 58, fat: 32, source: 'common', tags: 'crispy chicken sandwich fried fast food bun' },
  { name: 'Grilled Chicken Sandwich', servingSize: 1, servingUnit: 'sandwich', calories: 420, protein: 36, carbs: 40, fat: 12, source: 'common', tags: 'grilled chicken sandwich bun' },
  { name: 'Hot Dog (with bun)', servingSize: 1, servingUnit: 'hot dog', calories: 290, protein: 11, carbs: 24, fat: 17, source: 'common', tags: 'hot dog bun frank beef pork' },
  { name: 'Gyro (pita)', servingSize: 1, servingUnit: 'gyro pita sandwich', calories: 520, protein: 28, carbs: 46, fat: 22, source: 'common', tags: 'gyro pita lamb beef tzatziki greek' },

  // ── Breakfast Dishes ──
  { name: 'Omelette (3-egg, plain)', servingSize: 1, servingUnit: 'omelette', calories: 220, protein: 18, carbs: 1, fat: 16, source: 'common', tags: 'omelette omelet 3 egg plain breakfast' },
  { name: 'Veggie Omelette (3-egg)', servingSize: 1, servingUnit: 'omelette', calories: 260, protein: 20, carbs: 8, fat: 16, source: 'common', tags: 'veggie vegetable omelette omelet egg breakfast' },
  { name: 'Denver Omelette', servingSize: 1, servingUnit: 'omelette', calories: 380, protein: 28, carbs: 6, fat: 26, source: 'common', tags: 'denver omelette omelet ham peppers cheese breakfast' },
  { name: 'French Toast (2 slices)', servingSize: 2, servingUnit: 'slices', calories: 320, protein: 10, carbs: 44, fat: 12, source: 'common', tags: 'french toast breakfast slices eggs bread' },
  { name: 'Waffles (2)', servingSize: 2, servingUnit: 'waffles', calories: 340, protein: 8, carbs: 52, fat: 12, source: 'common', tags: 'waffles breakfast two syrup' },
  { name: 'Eggs Benedict', servingSize: 1, servingUnit: 'plate (2 halves)', calories: 550, protein: 24, carbs: 28, fat: 36, source: 'common', tags: 'eggs benedict hollandaise poached ham muffin brunch' },
  { name: 'Avocado Toast (with egg)', servingSize: 1, servingUnit: 'slice toast + avocado + egg', calories: 350, protein: 14, carbs: 24, fat: 22, source: 'common', tags: 'avocado toast egg breakfast brunch' },
  { name: 'Avocado Toast (plain)', servingSize: 1, servingUnit: 'slice toast + avocado', calories: 250, protein: 5, carbs: 24, fat: 16, source: 'common', tags: 'avocado toast plain breakfast brunch' },
  { name: 'Huevos Rancheros', servingSize: 1, servingUnit: 'plate', calories: 470, protein: 22, carbs: 44, fat: 22, source: 'common', tags: 'huevos rancheros eggs mexican salsa tortilla beans' },
  { name: 'Shakshuka (2 eggs)', servingSize: 1, servingUnit: 'serving (2 eggs in sauce)', calories: 260, protein: 16, carbs: 18, fat: 14, source: 'common', tags: 'shakshuka eggs tomato sauce middle eastern' },

  // ── Soups ──
  { name: 'Tomato Soup (creamy)', servingSize: 1, servingUnit: 'cup (245g)', calories: 160, protein: 4, carbs: 20, fat: 8, source: 'common', tags: 'tomato soup creamy canned homemade' },
  { name: 'French Onion Soup', servingSize: 1, servingUnit: 'cup with crouton & cheese', calories: 280, protein: 12, carbs: 28, fat: 14, source: 'common', tags: 'french onion soup gruyere crouton' },
  { name: 'Clam Chowder (New England)', servingSize: 1, servingUnit: 'cup (248g)', calories: 220, protein: 10, carbs: 22, fat: 10, source: 'common', tags: 'clam chowder new england cream white soup' },
  { name: 'Minestrone', servingSize: 1, servingUnit: 'cup (241g)', calories: 120, protein: 5, carbs: 20, fat: 3, source: 'common', tags: 'minestrone italian vegetable soup pasta beans' },
  { name: 'Lentil Soup', servingSize: 1, servingUnit: 'cup (248g)', calories: 180, protein: 12, carbs: 28, fat: 3, source: 'common', tags: 'lentil soup vegetarian hearty' },
  { name: 'Split Pea Soup', servingSize: 1, servingUnit: 'cup (253g)', calories: 190, protein: 11, carbs: 32, fat: 3, source: 'common', tags: 'split pea soup ham hearty' },
  { name: 'Black Bean Soup', servingSize: 1, servingUnit: 'cup (243g)', calories: 200, protein: 12, carbs: 34, fat: 3, source: 'common', tags: 'black bean soup vegetarian latin' },
  { name: 'Broccoli Cheddar Soup', servingSize: 1, servingUnit: 'cup (248g)', calories: 240, protein: 9, carbs: 18, fat: 15, source: 'common', tags: 'broccoli cheddar soup cheese panera' },
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

  // Split USDA into generic (Foundation/SR Legacy — whole foods, ingredients)
  // and branded (packaged products)
  const usdaGeneric   = usdaResults.filter(f => f._dataType !== 'Branded');
  const usdaBranded   = usdaResults.filter(f => f._dataType === 'Branded');

  // Merge order: common → USDA generic → OFF branded → USDA branded
  // Generic whole foods surface first; branded/packaged come after
  const seen = new Set(commonResults.map(f => f.name.toLowerCase()));
  const merged = [...commonResults];

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
          // serving_quantity is a numeric field (may have float precision issues), serving_size is the full label string
          const qty = parseFloat(p.serving_quantity);
          if (qty && isFinite(qty)) {
            // Extract unit from the serving_size label (e.g. "28 g" → "g", "1 oz (28g)" → "oz")
            const unitMatch = (p.serving_size || '').match(/[a-zA-Z]+/);
            servingSize = Math.round(qty * 10) / 10;
            servingUnit = unitMatch ? unitMatch[0] : 'serving';
          } else {
            // Fall back to the label as-is but strip float noise from any leading number
            servingSize = '';
            servingUnit = (p.serving_size || 'serving').replace(/(\d+\.\d*?[1-9])0+\d*/g, '$1');
          }
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
    const qty = parseFloat(p.serving_quantity);
    if (qty && isFinite(qty)) {
      const unitMatch = (p.serving_size || '').match(/[a-zA-Z]+/);
      servingSize = Math.round(qty * 10) / 10;
      servingUnit = unitMatch ? unitMatch[0] : 'g';
    } else {
      servingSize = '';
      servingUnit = (p.serving_size || 'serving').replace(/(\d+\.\d*?[1-9])0+\d*/g, '$1');
    }
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
