# Meal Tracker

A lightweight, mindful eating PWA built to replace MyFitnessPal. No ads, no subscriptions, no bloat.

---

## Features

- **Daily food log** — search USDA FoodData Central + Open Food Facts + a built-in common foods library; generic whole foods ranked above branded packaged products
- **Macro rings** — calorie and macro progress displayed as closing SVG rings
- **My Foods library** — save homemade recipes with your own macro data; they appear first in search
- **Favorites** — star any logged food for quick re-logging
- **Search history** — previously logged foods surface in results, deduped across days
- **TDEE calculator** — Mifflin-St Jeor BMR + activity multiplier; auto-applies a calorie target based on your weight goal (deficit/surplus capped at safe rates)
- **Weight tracking** — 30-day chart, week/total change stats, trend projection toward goal
- **Cross-device sync** — Google sign-in via Firebase Auth + Firestore
- **PWA** — installable on iOS/Android home screen, works offline
- **Dark mode** — follows system preference, manual ☀️/🌙 toggle persists to localStorage

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| UI | Vanilla JS ES modules | No build step, no framework overhead |
| Data | localStorage | Zero-latency reads, no backend needed |
| Cloud sync | Firebase Firestore | Free tier, real-time, easy Auth |
| Auth | Firebase Google sign-in | One-tap, no password management |
| Hosting | GitHub Pages | Free, instant deploys from `main` |
| Offline | Service Worker (cache-first) | Works without network after first load |
| Food data | USDA FoodData Central + Open Food Facts + built-in common foods | Free APIs, no key needed for OFF |

---

## Local Development

No install step needed. Just serve the files:

```bash
# Python (macOS built-in)
cd meal-tracker
python3 -m http.server 3000
# → open http://localhost:3000
```

Or use the VS Code Live Server extension, or any static file server.

> **Note:** The service worker only registers on `localhost` or HTTPS. Search APIs are live (USDA, Open Food Facts) and require internet.

---

## File Structure

```
meal-tracker/
├── index.html          # App shell, SW registration
├── manifest.json       # PWA manifest (icons, display mode, scope)
├── sw.js               # Service worker — cache-first for JS/CSS, network-first for HTML
│
├── css/
│   └── style.css       # All styles, CSS variables for light/dark mode
│
├── js/
│   ├── app.js          # Entry point — render loop, modal, auth, nav
│   ├── store.js        # localStorage data layer (goals, meals, weight, favorites, My Foods, TDEE)
│   ├── ui.js           # DOM helpers, SVG rings, meal sections, date utilities
│   ├── api.js          # USDA + Open Food Facts search, common foods library, barcode lookup
│   └── firebase.js     # Auth, Firestore push/pull, cloud sync
│
├── tests/
│   ├── setup.js        # localStorage / crypto / DOM mocks for Node (uses Object.defineProperty for Node 22 compat)
│   ├── store.test.js   # Unit tests for store.js
│   └── utils.test.js   # Unit tests for date utilities, country detection
│
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
│
└── .github/
    └── workflows/
        └── test.yml    # CI: runs tests on every push; failures open a GitHub issue; blocks deploy
```

---

## Deployment

Every push to `main` automatically deploys to GitHub Pages via GitHub Actions.

**Deploy steps:**
1. Make changes
2. Bump `const CACHE = 'meal-tracker-vN'` in `sw.js` (increment N)
3. Commit and push — GitHub Pages deploys within ~1 min

```bash
git add -A
git commit -m "Your message"
git push
```

**Why bump the SW cache?** The service worker caches all app files. Changing the cache name causes the browser to install a fresh SW and download all updated files. Skip this and users get stale code.

**To pick up an update on your installed PWA:** Close the app fully from the app switcher and reopen it. The new SW will take over on next launch.

---

## Rollback

The repo is tagged at stable milestones. To roll back:

```bash
git checkout v1.0.0        # inspect the tag
git checkout -b rollback/v1.0.0 v1.0.0   # branch from tag
git push origin rollback/v1.0.0
# then open a PR → main, or force-push if needed
```

---

## Testing

Tests use Node.js built-in `node:test` — no `npm install` required.

```bash
node --test tests/*.test.js
```

Tests run automatically on every push via GitHub Actions (`.github/workflows/test.yml`). A failed run opens a GitHub issue labeled `test-failure` with the full output.

### What's tested

| Area | Tests |
|---|---|
| Goals | defaults, save/load round-trip, `goalsAreDefaults()` |
| Favorites | add, dedup by name (regression), remove, cloud sync dedup |
| My Foods | save, search by partial name, delete |
| Weight | save/get round-trip, null for unknown date |
| Meal CRUD | add food, remove food, totals calculation |
| History search | finds past foods, deduplicates across days |
| Date utilities | `todayStr()` uses local time (not UTC), `shiftDate()` boundary cases |
| Country detection | locale → OFF country tag mapping |

### Adding a test

When you fix a bug, add a test that would have caught it. Mark it with a `regression:` comment so it's clear why it exists. See `tests/store.test.js` for examples.

---

## Search ranking

Results are returned in priority order:

1. **My Foods** — your saved custom foods (always first)
2. **History** — foods you've logged before (deduped across days)
3. **Common foods** — built-in library of ~50 standard preparations (coffee drinks, eggs, roasted veggies, grains, etc.)
4. **USDA generic** — Foundation + SR Legacy data types (whole foods, raw ingredients)
5. **Open Food Facts** — branded/packaged US products
6. **USDA branded** — packaged products from USDA

Within USDA results, exact and prefix matches are scored higher; very long descriptions and junk-food category names are penalized.

---

## Known Constraints

- **iOS PWA sign-in** uses `signInWithRedirect` (standalone mode) — popup auth state doesn't transfer between Safari and the PWA's WKWebView storage context
- **Open Food Facts data quality** varies — some products have incomplete nutrition data and are filtered out
- **Offline search** only covers favorited foods and previously logged history; USDA/OFF require network
- **TDEE calculator** requires sex, birth year, height, and at least one weight entry to produce a suggestion
