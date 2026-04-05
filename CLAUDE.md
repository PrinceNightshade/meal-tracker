# Meal Tracker — Project Guide

## What this app is
A PWA meal tracker focused on weight loss. Users log meals by meal type (Breakfast, Lunch, Dinner, Snacks), track calories and macros against daily goals, log weight over time, and favorite foods for quick re-entry. Deployed to GitHub Pages at `PrinceNightshade/meal-tracker`. No backend — Firebase for auth/sync, localStorage as the primary data store.

## Tech stack
- Vanilla JS (ES modules), no framework
- Firebase (Auth + Firestore) for sign-in and cloud sync
- Service Worker for PWA/offline support
- GitHub Pages for hosting (`/meal-tracker` base path)
- Open Food Facts + USDA FoodData Central APIs for food search
- CSS custom properties for theming (light/dark/purple)

## Key architectural decisions

**Auth: popup-only, no redirect.**
`signInWithRedirect` was removed entirely. iOS Safari's ITP breaks the redirect flow on `firebaseapp.com`. Popup works in iOS 16.4+ standalone PWA via SFSafariViewController.

**Food search: two-phase.**
Phase 1 (instant): `COMMON_FOODS` local array (~590 entries) + My Foods + history render immediately. Phase 2 (background): USDA + Open Food Facts APIs fetch only if local results < 8. This keeps search feeling instant for common foods.

**COMMON_FOODS array.**
Curated local food data in `js/api.js`. Always wins over API results in ranking. Covers whole foods, common meals (fajitas, tikka masala, pad thai, etc.), and branded staples. When expanding, use natural serving units (1 cup, 1 slice, etc.) not raw grams.

**Service worker versioning.**
Cache key is `meal-tracker-vN` in `sw.js`. Bump N on every deploy that changes JS/CSS. The update banner (`#update-banner`) detects waiting SWs and prompts users to reload — no manual reinstall needed.

**Ring colors.**
Red = far from goal (0–49%), Yellow = getting there (50–84%), Green = on track (85–100%), Red = overshot (>100%).

**Favorites are meal-type scoped.**
Each favorite stores a `mealType` field. Favorites filter to the current meal type in the add modal. Legacy favorites (no `mealType`) show in all meals.

## Dev conventions
- No build step — edit files directly, push to deploy
- Always bump `sw.js` cache version on JS/CSS changes
- Keep `COMMON_FOODS` entries with `source: 'common'` and a descriptive `tags` string for search matching
- Calorie/macro values should match USDA or common label data (per natural serving)

---

## AI session routing

This project uses **Haiku as the default model** for all sessions (set in `.claude/settings.json`). Haiku handles planning, backlog grooming, and lightweight tasks. For heavier work, Haiku spawns a subagent.

### When to stay on Haiku
- Discussing features, tradeoffs, or architecture
- Updating this file (backlog, decisions)
- Small, self-contained edits (1–5 lines, config changes, copy tweaks)
- Answering questions about the codebase

### When to spawn a Sonnet agent
- Implementing a new feature end-to-end
- Debugging a non-obvious bug
- Writing or restructuring a significant block of code
- Any change touching 3+ files

### When to spawn an Opus agent
- Genuinely hard problems with no clear solution
- Major architectural changes (e.g. migrating data model, replacing a core module)

### How to hand off to a subagent
Haiku should write a tight, self-contained prompt that includes:
1. What files are relevant (read them first if needed)
2. Exactly what to build/fix
3. Any constraints (don't change X, keep Y pattern)
4. Whether to commit and push when done

---

## Regression Testing Checklist

Before every deployment, verify:

**Core Functionality**
- [ ] App loads (cold start, no cache)
- [ ] All three nav tabs work (Daily, Weight, Goals)
- [ ] Date navigation works (prev/next/today buttons)
- [ ] Can add food to a meal
- [ ] Can remove food from a meal
- [ ] Can edit food quantity/servings
- [ ] Favorites system works (star/unstar)

**Daily View**
- [ ] Calorie ring displays and updates
- [ ] Macro rings (protein/carbs/fat) display
- [ ] Added sugar progress bar displays
- [ ] Carousel swipes horizontally (mobile) or scrolls (desktop)
- [ ] Analytics card shows insight + recommendation + stats

**Data Persistence**
- [ ] Changes sync to Firebase (if online)
- [ ] Service worker updates work (update banner)
- [ ] App works offline after first load

**New Feature Tests (if changed)**
- [ ] Run all related features end-to-end
- [ ] Test edge cases (empty data, no goals set, etc)

---

## Feature backlog

### High priority
- [ ] Calorie budget rollover option (unused calories carry forward)
- [ ] Meal copy — duplicate yesterday's meals to today with one tap
- [ ] Streak tracking — consecutive days logged
- [ ] Push notifications (reminders to log meals)

### Medium priority
- [ ] Custom meal types (user-defined beyond Breakfast/Lunch/Dinner/Snacks)
- [ ] Recipe builder — combine ingredients into a saved dish with calculated macros
- [ ] Water intake tracker
- [ ] Export data to CSV
- [ ] Barcode history — remember recently scanned barcodes

### Low priority / someday
- [ ] AI plate photo analysis (built, paused pending monetization decision — see `js/api.js` `analyzePhoto()` and commented-out UI in `js/app.js`)
- [ ] Social / friend leaderboard
- [ ] Apple Health / Google Fit integration
- [ ] Macro targets by meal type (not just daily totals)
