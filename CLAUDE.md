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

**Wellness expansion: movement + sleep from Apple Health, not Garmin directly.**
The app is evolving from a meal tracker into a rounded wellness tracker (food + movement + sleep). Garmin has no consumer API and the browser can't read it (CORS + credentials), so we do **not** integrate Garmin directly. Instead we ingest from **Apple Health as the aggregation layer** — Garmin (or any watch) already writes to it. The chosen pipe: `Apple Health → nightly iOS Shortcuts automation → a small HTTP endpoint (a ~30-line Cloud Function w/ shared secret) → Firestore → PWA reads it`. This makes the underlying device swappable forever and keeps the app itself backendless (the endpoint is a thin worker, not an app backend). Chosen over GitHub Actions + `python-garminconnect`, which is simpler to stand up but Garmin-locked, credential-bearing, and ToS-gray/fragile.

**Wellness data model.**
Wellness records are keyed by date in their own store (`mt_wellness` localStorage key; `users/{uid}/wellness/{date}` Firestore collection), kept **separate from `days`** so the externally-written wellness data and the app-written meal data never clobber each other. Logic in `js/wellness.js` (re-exported through the `store` facade). Record shape: `{ date, steps, activeMinutes, sleepMinutes, sleepScore, restingHR, bodyBattery, workouts:[{type,durationMin,distanceKm,calories}], source }`. Manual import (CSV/JSON, file or paste) lives in the Goals view under "Wellness Data" — it's the Phase 1 ingest path and a permanent fallback; the future Shortcut hits the same shape.

**Wellness guardrail: context, never a budget.**
Movement/sleep are shown as behavioral context and never converted into "calories earned." A workout's `calories` field is display-only and must never touch the food calorie ring — crediting exercise calories triggers the compensation effect (see the Apple Health / Google Fit backlog note). The marquee wellness feature is an **"opportunity statement"** over a rolling window (default trailing 7 days, wider than 24h) — one ranked, actionable insight across food/movement/sleep, reusing the existing analytics/insight-carousel patterns.

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

### Wellness expansion (in progress — food + movement + sleep)
- [x] **Phase 1 — data model + manual import.** `js/wellness.js` (CRUD, range/stats, CSV/JSON parser), Firestore `wellness` collection sync (`pushWellness` + pull), "Wellness Data" import section in Goals. Ships the data layer so the UI can be built before the sync is wired.
- [x] **Phase 2 — opportunity-statement engine + wider-window UI.** `js/opportunity.js` ranks insights across food/movement/sleep over a trailing-7d window (detectors: sleep→calories cross-signal, short-sleep week, steps-down, low-movement week, calories-over, protein-short, + positive fallback; cross-signal ranks highest and uses all history for sample size). Surfaced as carousel slide 2 (`renderOpportunityCard`, replacing the old random-height insight card) + a movement/sleep strip (`renderWellnessStrip`) on Daily. Context only — no "calories earned." Degrades gracefully with no wellness data (strip becomes a tap-through-to-import hint).
- [~] **Phase 3 — auto-sync via Apple Health (backend DEPLOYED & verified Sep 2026; only the Shortcut remains).** `functions/syncWellness` (gen2, **Node 22**, us-central1): POST + `X-Sync-Secret` shared secret, merge-writes `users/{uid}/wellness/{date}` via Admin SDK (shape matches `pullFromCloud`). Live at `https://us-central1-meal-tracker-f3bea.cloudfunctions.net/syncWellness`. Blaze enabled; `SYNC_SECRET` set in Secret Manager; deploy verified with curl (valid→ok, wrong secret→401, merge works). App surfaces the Firebase uid ("Sync ID") in Goals → Wellness Data. **Nightly STEPS sync is LIVE** (iOS Shortcut sends steps+source; date omitted → server defaults to yesterday UTC). Host: Cloud Function over Cloudflare Worker (one ecosystem, ~$0 free tier). **Sleep deferred** to a focused follow-up (Garmin writes sleep as stages, and a 3am run mid-sleep + broad window over-counts; plan: ~8am run, ~12h window, span onset→wake, record vs yesterday — details in memory `project_wellness_expansion`).
- [~] **Layout rethink → opportunity-first home (Sep 2026) — REVERTED Sep 15 2026.** Shipped a Daily view where the opportunity statement owned the top and intake shrank to a bare macro micro-row, pushing logging below the fold. In practice this **regressed the macros display** (lost goal + progress per macro — the whole point for a macro tracker) and **dropped engagement** (logging buried). Reverted `a2b173c` to restore the meal-first home: the big calorie ring + 4-up macro cards (value/goal/progress) as the hero, Log/Scan/Water action row up front, opportunity kept as swipeable carousel slide 2, wellness strip below. Weight-tracker fixes + wellness backend/data kept. Lesson: for a macro tracker, macro progress + fast logging must stay above the fold; don't demote the core loop for a secondary insight.
- [~] **Smart logging suggestions (Sep 2026) — REVERTED Sep 15 2026 (rolled back with `a2b173c`).** `js/suggest.js` (currentMealSlot + getSmartSuggestions: usual-combo detection + frequency/recency ranking) and the home quick-log card were removed with the opportunity-first revert. The idea still has merit — revisit by wiring suggestions into the **add-food sheet** (not a home card that competes with the macro hero), and consider the "shore up my macros" gap-filler dinner suggestion Eric floated. `suggest.js` recoverable from git history (commit `a2b173c`).
- [x] **Weight tracker rework (bugs, not cosmetics).** EMA **trend line** (`getWeightSeries`, alpha 0.25) is now the primary signal; `getWeightProjection` uses a 21-day recent-window least-squares slope on the trend instead of the old 2-point all-time slope; `getWeightStats` 7-day change compares to the entry *nearest* 7 days ago (suppressed under ~4 days old) and reports trend-based current/change; chart draws faint raw dots + accent trend line + dashed goal line; stat date formatted. Weigh-in already inline. Done Sep 2026.

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

### Recently Completed (Jun 2026 — add-food modal UX, also applied to gdm-tracker)
- [x] Search results no longer hide under the sticky search row — scroll moved from `renderResults` (re-fired on phase-2 API append, yanking the view) to once per query in `doSearch`; `.search-results` got `scroll-margin-top: 64px` to clear the sticky row
- [x] iOS focus auto-zoom fixed — all modal/Goals form inputs bumped to 16px (below that iOS Safari zooms on focus and the PWA stays zoomed), element-level `max(16px, 1em)` guard for unstyled inputs, `maximum-scale=1` in the viewport meta (suppresses auto-zoom only; user pinch still works on iOS ≥10)
- [x] Search dedup normalized — `normalizeFoodKey` in api.js (lowercase, NFKD accent-strip, collapse punctuation/whitespace) used for every dedup `seen` key in api.js + app.js, so "Coca-Cola" / "coca cola " / OFF names with trailing spaces merge; store.js blocklist matching intentionally untouched (exact lowercase, consistent with stored data)

### Recently Completed (Phase 6, May 2026 — Pulse visual refresh)
- [x] Full CSS rewrite to Pulse design system — OLED-first tokens (`--bg`, `--surface`, `--accent`, `--ink-*`), glass pill bottom nav, radial glow on daily summary card
- [x] Geist font family (Geist + Geist Mono) via Google Fonts CDN
- [x] Inline SVG sprite in `index.html` — all icons via `<use href="#i-name"/>`, no external icon library
- [x] `js/pulse-theme.js` — before-paint IIFE for theme/accent; `window.Pulse.applyTheme()`, `applyAccent()`, `renderThemeToggle()`, `renderAccentPicker()`; 6 accent presets stored in `mt_accent`
- [x] Macro-card grid — calorie ring stays large, 4-up `.macro-card` grid (Protein/Carbs/Fat/Sugar) replaces 3 small macro rings + separate sugar bar; sugar card inverse coloring preserved
- [x] Action row — water chip | Scan | Log laid out in 3-column grid below hero carousel
- [x] Insight carousel slide — protein-hit 7-bar chart from last 7 days; fat trend note if 3+ over days
- [x] Meal section rails — `::before` left-border accent per meal type; "TAP TO COMPOSE" empty hint
- [x] Log button opens meal picker (2×2 grid) when no meal preselected; same for Scan
- [x] Profile sheet — accent swatch picker + theme 3-state toggle (Light/Dark/Auto) in bottom-sheet
- [x] Ring fill colors class-based (`.ring-fill--good|warn|over`) instead of inline stroke attributes
- [x] `manifest.json` updated — `theme_color: #C8FF3D`, `background_color: #000000`

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
