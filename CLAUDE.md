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
Curated local food data in `js/common-foods.js` (imported by `js/api.js`). Always wins over API results in ranking. Covers whole foods, common meals (fajitas, tikka masala, pad thai, etc.), and branded staples. When expanding, use natural serving units (1 cup, 1 slice, etc.) not raw grams.

**Service worker versioning.**
Cache key is auto-generated from the git commit SHA during CI deploy (`meal-tracker-<sha>`). No manual version bumps needed. The update banner (`#update-banner`) detects waiting SWs and prompts users to reload. Logic lives in `js/sw-manager.js`.

**Ring colors.**
Red = far from goal (0–49%), Yellow = getting there (50–84%), Green = on track (85–100%), Red = overshot (>100%).

**Favorites are meal-type scoped.**
Each favorite stores a `mealType` field. Favorites filter to the current meal type in the add modal. Legacy favorites (no `mealType`) show in all meals.

**Dismiss-with-X is sticky.**
Clicking the × on a recent or favorite adds the food name to `mt_hidden_recents[mealType]` (a per-meal-type blocklist in localStorage). Dismissed foods never re-appear in recents until the user re-adds them via search. Dismissing a favorite removes it from favorites **and** adds it to the blocklist — so the food doesn't pop back tomorrow as a "recent." Logic in `js/store.js` (`removeRecentFood`, `getRecentFoodsByMealType`).

**Goals page autosaves.**
No Save buttons — every input saves on blur, every toggle/select saves on change. A green border briefly flashes the field as confirmation. The first time the profile is fully filled in (sex + birth year + height) and goals are still at defaults, TDEE-derived goals are auto-applied with a toast.

**Profile sheet (top-right).**
Theme toggle and auth controls live in a single bottom-sheet opened from the top-right `#btn-profile` button. Theme has three states: Light / Dark / Auto (Auto follows OS via `prefers-color-scheme`). Replaces the previous separate `theme-toggle` + `auth-btn` chrome that crowded the date row.

**Multi-add from recents/favorites.**
Each row in the recents/favorites sections shows a checkbox. Selecting any row reveals a sticky bottom action bar (`.multi-add-bar`) inside the modal: "N selected | Clear | Add N to Breakfast." Bulk-add closes the modal after pushing all items. Tapping the row body (anywhere except the checkbox or X) still goes straight to the serving picker for the single-add flow.

**UI/UX guiding principle: breathe freely.**
Favor whitespace and reduce competing elements. When in doubt, remove chrome rather than add toggles. Examples: "Today" hides when on today; date drops the year in the header; whole empty meal cards are tappable instead of relying on the small "+ Add" button alone; tap targets ≥44pt for one-handed use.

## Security

**Firestore security rules** (project: `meal-tracker-f3bea`):
- All reads/writes must be scoped to `users/{userId}` where `request.auth.uid == userId`
- Unauthenticated requests are denied at the top level
- Verify in Firebase Console > Firestore > Rules that these rules are active

**Rollback strategy:**
- No automated rollback workflow exists. To roll back a deployment, manually re-run the deploy workflow at a previous git SHA via GitHub Actions > "Run workflow" or by reverting the commit on `main`. This is acceptable for a single-developer PWA.

## Deploy pipeline

**SW cache versioning** is automated: the CI deploy step replaces `meal-tracker-vN` in `sw.js` with `meal-tracker-<git-short-sha>` before upload. No manual version bumps needed.

**Deploy artifacts** are filtered: only `js/`, `css/`, `icons/`, `index.html`, `manifest.json`, and `sw.js` are deployed. `.git/`, `.claude/`, `.md` files, and `tests/` are excluded.

## Dev conventions
- No build step — edit files directly, push to deploy
- SW cache version is auto-generated from git SHA in CI (no manual bumps needed)
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

## Testing Strategy

### Pre-Commit: Local Validation (Before Any Commit)

**Syntax & Imports**
- [ ] No console errors when loading locally
- [ ] All new imports resolve (check console for 404s)
- [ ] Service worker loads without errors
- [ ] No unused imports or variables (check console/devtools)

**Critical Paths**
- [ ] Main feature works end-to-end
- [ ] Existing features still work (smoke test)
- [ ] If touching SW: verify cache version is bumped

**Code Quality**
- [ ] No hardcoded test values left in code
- [ ] No console.log() spam (remove debug logs before commit)
- [ ] Commit message is clear and references what changed

### Pre-Deploy: Browser Testing (Before Push to Main)

Run through these checks in the live preview server or on deployed staging:

**App Shell**
- [ ] App loads without errors (cold start, private mode)
- [ ] All three nav tabs work (Daily, Weight, Goals)
- [ ] Date navigation works (prev/next/today)
- [ ] Theme switching works (light/dark/purple)

**Core User Flows**
- [ ] Add food to a meal
- [ ] Edit food quantity
- [ ] Remove food from a meal
- [ ] Star/unstar favorites
- [ ] Navigate between days

**Data Display**
- [ ] Calorie ring renders and updates
- [ ] Macro rings (protein/carbs/fat) render
- [ ] Added sugar progress bar displays (if goals set)
- [ ] Carousel/swipe functionality works (if present)
- [ ] All text renders without overflow or truncation

**Service Worker & Updates**
- [ ] SW registers without errors (DevTools > Application > Service Workers)
- [ ] App works offline after first load
- [ ] If SW changed: verify cache version bumped in sw.js
- [ ] Test update banner: deploy a dummy change, reload, check for "Update Available"

**Edge Cases**
- [ ] App works with no logged foods (empty state)
- [ ] App works with no user goals set
- [ ] Long food names don't break layout
- [ ] Numbers with decimals display correctly

### Post-Deploy: Live Site Verification (After Pushing to Main)

- [ ] Visit live URL, hard refresh (Cmd+Shift+R)
- [ ] Run pre-deploy checklist on production
- [ ] Check on mobile device (different screen size, touchscreen)
- [ ] If PWA: test PWA version (add to home screen, test offline)

### Critical Issue Patterns to Catch

**Recent bugs we missed:**
- Analytics.js syntax error (hidden characters, encoding issues) → Solution: Test all imports load correctly
- Service worker skipWaiting() bypass → Solution: Review SW event handlers before commit
- Added sugar bar not displaying → Solution: Test with foods that have new fields

**Red flags to investigate:**
- Blank white/black screen → Likely JS error, check console
- Missing UI elements → CSS not loaded or JS didn't render, check network tab
- Stale data after reload → Service worker caching issue
- Update banner never appears → SW update detection broken, check sw.js and app.js update listener

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

### Under Evaluation / someday
- [ ] **Photo-first UX pivot** — consolidate barcode scanning + plate image recognition into a single unified camera workflow. Trade-off: reduced friction for common meals vs. offline capability loss and accuracy dependency. See discussion in session notes.
- [ ] AI plate photo analysis (built, functionality exists in `js/api.js` `analyzePhoto()` and commented-out UI in `js/app.js`)
- [ ] Social / friend leaderboard
- [ ] Apple Health / Google Fit integration — **weight sync only**, explicitly NOT calorie-burn import. Crediting exercise calories triggers the well-documented compensation effect (people overestimate burn 2–4x and the resulting "earned it" snack flips a deficit day into a surplus). The app is intentionally one-sided: precise about intake, silent about burn.
- [ ] Macro targets by meal type (not just daily totals)

### Recently Completed (Phase 5, Apr 2026 — UI/UX refresh)
- [x] Header refresh — drop year from date, "Today" replaces date when on today, hide Today button on today, prev/next bumped to 44pt tap targets, theme + auth collapsed into a single Profile bottom-sheet
- [x] Goals autosave — removed three Save buttons, save on blur with green border flash
- [x] Multi-add — checkbox column on recents/favorites with sticky "Add N to MealType" bar
- [x] Dismiss-with-X persistence — X on recents/favorites adds to `mt_hidden_recents` blocklist so the food doesn't reappear next day
- [x] Whole empty meal cards tappable (not just the small "+ Add" button)
- [x] Sticky search row no longer leaks results above it (modal padding restructure)

### Recently Completed (Phase 4, Q1 2026)
- [x] Recents-first modal UX — show meal-type filtered recent foods before search
- [x] "Show more" for recents — collapse to 5 items, expand with button click
- [x] Multi-add workflow — keep modal open after adding, enable quick meal logging
- [x] Analytics insights — pattern detection on macro/nutrient trends with conversational copy
- [x] Persian cuisine expansion — 8 traditional dishes (Ghormeh Sabzi, Fesenjan, Tahdig, etc.)
- [x] Modal scroll UX fix — navigate to results instead of jumping to top when typing
