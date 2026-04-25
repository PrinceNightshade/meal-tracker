# Meal Tracker — Architecture

High-level overview of data flow, state management, offline support, and cloud sync patterns.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (PWA)                             │
├─────────────────────────────────────────────────────────────┤
│  index.html (app shell)                                      │
│      ↓                                                       │
│  app.js (render loop, auth, nav)                            │
│      ↓                                                       │
│  ┌─────────────────────────────────────────────┐            │
│  │ localStorage (primary data store)           │            │
│  │  • meals (daily)                            │            │
│  │  • weight entries                           │            │
│  │  • goals, favorites, My Foods               │            │
│  │  • theme, sync state                        │            │
│  └─────────────────────────────────────────────┘            │
│      ↓                                                       │
│  store.js (localStorage abstraction layer)                  │
│      ↓ (on auth change)                                     │
│  firebase.js (push/pull to Firestore)                       │
│      ↓                                                       │
│  ┌─────────────────────────────────────────────┐            │
│  │ Service Worker (sw.js)                      │            │
│  │  • Cache app shell (index.html, js, css)    │            │
│  │  • Serve from cache on offline              │            │
│  │  • Update detection & banner                │            │
│  └─────────────────────────────────────────────┘            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
        ↓                                    ↓
    ┌──────────────────┐          ┌──────────────────┐
    │  USDA API        │          │ Open Food Facts  │
    │  (search foods)  │          │  (branded items) │
    └──────────────────┘          └──────────────────┘
        ↓
    ┌──────────────────┐
    │  Firebase Auth   │
    │  Firebase Store  │
    │  (cloud sync)    │
    └──────────────────┘
```

---

## Data Flow: Adding a Food

1. **User clicks "+ Add" on a meal**
   - Modal opens (`openAddFoodModal(mealType)`)
   - Recents extracted from localStorage for this meal type
   - Favorites filtered to this meal type

2. **User picks food** (three paths):
   - **Path A (Recents):** Click a recent food → serving picker
   - **Path B (Search):** Type in search → Phase 1 local results (My Foods, History, COMMON_FOODS) + Phase 2 async (USDA, OFF)
   - **Path C (Manual):** Enter name, calories, macros manually

3. **Serving picker opens**
   - Food object passed in: `{ name, calories, protein, carbs, fat, servingSize, servingUnit }`
   - User adjusts quantity
   - Confirms addition

4. **Food added to meal**
   - `store.addMealFood(date, mealType, foodObject)`
   - localStorage updated immediately
   - UI re-renders (calories ring, macro totals update)

5. **Cloud sync (if signed in)**
   - Background: `firebase.push({ date, meals })`
   - No modal block; happens async
   - Conflict resolution: last-write-wins (timestamp-based)

6. **Modal behavior**
   - **Single-add:** Modal closes after confirmation
   - **Multi-add:** Modal stays open, recents/favorites redraw (food just added may now appear in recents)

---

## Search Ranking (Two-Phase)

### Phase 1: Instant Local (< 50ms)
- **My Foods** — custom user recipes, always first
- **History** — foods logged in past 90 days, deduped
- **COMMON_FOODS** — hand-curated library (~590 entries)

Runs synchronously in `searchHistory()` and local query in `api.js`.

### Phase 2: Background APIs (1-3s)
Triggers only if Phase 1 returns < 8 results.

- **USDA FoodData Central** — generic whole foods + ingredients
- **Open Food Facts** — branded/packaged products

Results merge with Phase 1, UI updates dynamically as results arrive.

**Ranking within API results:**
- Exact match on food name (e.g., "oatmeal" → "oatmeal (cooked)") → highest
- Prefix match (e.g., "oat" → "oatmeal", "oat bran")
- Penalty for very long descriptions (USDA junk)
- Penalty for junk food categories (soda, candy, fast food)
- USDA results ranked above OFF for same food

---

## Modal State & Multi-Add Workflow

### Modal DOM Structure
```
Modal
├─ Title ("Add to Breakfast")
├─ Search Row (sticky, top: 0)
│  ├─ Search input (NOT auto-focused)
│  └─ Barcode button
├─ Results List (empty initially)
│  └─ Updates as user types
├─ Recents Section
│  ├─ "— recent —" divider
│  ├─ Recent Food Item (checkbox + body + ×)
│  └─ "Show 15 more" button (if > 5 recents)
├─ Favorites Section
│  ├─ "— favorites —" divider
│  └─ Favorite Item (checkbox + body + ×)
├─ Manual Entry
│  ├─ Food name input
│  ├─ Macro inputs (Cal/P/C/F)
│  └─ Add button
└─ Multi-Add Bar (sticky bottom, only when ≥1 row checked)
   ├─ "N selected"
   ├─ Clear
   └─ Add N to {MealType}
```

### Add-Food Lifecycle (two paths)

**Single-add (default):** tap a recent/favorite/result row body → serving picker → confirm → food added → modal **stays open** → recents may reflect the just-added item.

**Multi-add:** tick checkboxes on multiple recents/favorites → sticky "Add N to {MealType}" bar appears at bottom → tap to bulk-add at default servings → toast confirms → modal closes.

The two paths coexist on the same rows — the checkbox sits left of the body, the body itself is still tappable for single-add.

### Dismiss-with-X

Both recents and favorites show an `×` button. Clicking it adds the food name to `mt_hidden_recents[mealType]` (a per-meal-type blocklist in localStorage). Dismissed foods never re-appear in recents until re-added via search. For favorites, the `×` also removes the favorite entry — so the food doesn't pop back tomorrow as a "recent." See `js/store.js` (`removeRecentFood`, `getRecentFoodsByMealType`).

---

## Service Worker & Offline Support

### Cache Strategy

**Cache key:** `meal-tracker-<git-short-sha>` (auto-generated by CI deploy step from the commit SHA — the placeholder `meal-tracker-vN` in `sw.js` is replaced before upload)

**Cache contents:**
- App shell: `index.html`, `css/style.css`, all `js/` files
- Icons: `icon-192.png`, `icon-512.png`
- Manifest: `manifest.json`

**Update mechanism:**
- The CI deploy workflow rewrites `const CACHE = 'meal-tracker-vN'` to `meal-tracker-<git-short-sha>` before publishing — no manual bumps needed
- Browser detects new SW, downloads cache
- Update banner appears (`#update-banner`)
- User clicks "Reload" or closes/reopens app
- New SW activates, old cache deleted

### Offline Behavior

**What works offline:**
- View already-logged meals
- View weight history
- View goals & analytics
- Favorite/unfavorite foods
- Edit meal quantities
- Dark mode toggle

**What doesn't work offline:**
- Search APIs (USDA, Open Food Facts)
- Food barcode scanning (needs camera + API)
- Cloud sync (waits for connection)
- Photo analysis (needs API)

**Local-only search (offline):**
- My Foods (stored locally)
- History (past 90 days in localStorage)
- COMMON_FOODS (hardcoded in app)

Users can still log meals offline using favorites, recents, or manual entry.

---

## Cloud Sync (Firebase)

### Auth Flow

**Popup-only (no redirects):**
- User clicks "Sign in"
- `signInWithPopup(googleProvider)` opens popup
- User authenticates in popup
- Popup closes, auth state updates
- App detects sign-in, starts sync

**Why popup-only?** iOS Safari ITP breaks redirect flow on `firebaseapp.com`. Popup works in iOS 16.4+ standalone PWA via SFSafariViewController.

### Sync Mechanism

**Push (localStorage → Firestore):**
- Triggered on: sign-in, every food add/edit/delete, goal change
- Payload: `{ date, meals, goals, favorites, weight }`
- Non-blocking: user sees instant local change; sync happens background
- Conflict resolution: server timestamp wins (last-write-wins)

**Pull (Firestore → localStorage):**
- Triggered on: app startup (after auth check), manually via settings
- Fetches full user document
- Merges with local state: newer timestamp wins
- If server has newer data, local is overwritten

**Sync state:**
- `lastSyncTime` stored in localStorage
- If sync fails, retry on next action
- Transparent to user (no manual sync button)

---

## Food Data Structure

### Food Object (Internal)
```javascript
{
  name: "Oatmeal",
  servingSize: 1,
  servingUnit: "cup (cooked)",
  calories: 150,
  protein: 5,      // grams
  carbs: 27,       // grams
  fat: 3,          // grams
  addedSugars: 0,  // grams (if available)
  source: "common" // "common" | "my-food" | "history" | "api"
}
```

### COMMON_FOODS Curation
- ~590 entries covering: whole foods, ethnic staples, coffee drinks, snacks, international meals
- Always ranks above API results for same food name
- Uses natural serving units (1 cup, 1 tbsp, 1 oz, not raw grams)
- Entries tagged with keywords for search matching

**Recent additions:**
- Persian cuisine: Ghormeh Sabzi, Fesenjan, Tahdig, Zereshk Polo, etc.
- International favorites: Pad Thai, Tikka Masala, Enchilada, Adobo

---

## Analytics & Insights

### Analytics Card

**Trigger:** Appears on Goals tab; displays pattern insights from meal history

**Data sources:**
- Past 7-90 days of logged meals
- Grouped by nutrient/metric (vegetables, protein, carbs, etc.)
- Computed on-demand when user views Goals tab

**Insight format:**
```
Pattern: "Getting enough vegetables?"
Callout: "You're logging more than average 🌱"
Stats line: "You've recorded 8.5 servings in 7 days, (goal: 2.5 servings daily)"
```

**Limitations:**
- No real-time updates (re-computed only when Goals tab opened)
- Limited to 6-8 insights (carousel, user swipes)
- Requires sufficient meal history to detect patterns

---

## Key Architectural Decisions

### Why localStorage-first, not a backend?
- **Zero latency:** Reads are instant (no API round-trip)
- **Offline-first:** PWA works without network
- **Simplicity:** No server to manage, auth, or pay for
- **Scale:** User data is typically <1MB (meal history + weight, not photos)
- **Privacy:** Data stays on user's device until they sign in

### Why two-phase search?
- **UX:** Results appear instantly (local) while API runs async
- **Cost:** Avoids API calls for common foods (our COMMON_FOODS covers ~70% of logs)
- **Speed:** Typing feels responsive, not laggy

### Why popup auth, not redirect?
- **iOS PWA fix:** Redirect breaks in standalone mode on iOS < 16.4
- **UX:** No page navigation, stays in-app context
- **Fallback:** If popup blocked, user clicks "Sign in" again

### Why Service Worker cache key increment?
- **Cache busting:** Changing cache name forces browser to refetch all files
- **Safety:** Old and new versions never share cache (no stale JS + new HTML conflicts)
- **Manual control:** We decide when to force update, not the browser

---

## Future Directions (Under Consideration)

### Photo-First UX
**Trade-off analysis:** Move from text-search-first to camera-first (barcode + plate recognition).
- **Pros:** Lower friction, mobile-native, leverages existing AI photo analysis
- **Cons:** Offline regression, camera permission gate, accuracy dependency, API costs
- **Decision:** TBD — depends on accuracy benchmarks and user segment

---

## References

- **localStorage structure:** See `store.js` `getAllDays()` (line 155)
- **Search implementation:** `searchHistory()` (line 362) + Phase 2 in `api.js`
- **Modal flow:** `openAddFoodModal()` in `app.js` (line 651)
- **Sync logic:** `firebase.js` — `push()` and `pull()`
- **Service Worker:** `sw.js` — cache version, install/activate lifecycle
- **Testing:** See `CLAUDE.md` for test strategy and patterns
