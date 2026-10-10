# Meal Tracker — "Pulse" Refresh · Handoff

This is the implementation package for the **Pulse** direction explored in
`Meal Tracker Refresh.html`. Hand the whole `handoff/` folder (or just this
document) to Claude Code along with your existing `meal-tracker/` repo.

The refresh is **CSS-first + a couple of small markup + JS additions**. No
framework, no build step. All tokens are CSS custom properties.

---

## 0 · TL;DR for Claude Code

1. **Replace `css/style.css`'s `:root` and `@media (prefers-color-scheme: dark)` blocks** with the token sets in §2 below.
2. **Restyle the existing components** (rings, macro row, meal cards, weight projection, bottom nav, modals) per the class-by-class notes in §3 — most are token swaps + radii + a few new rules.
3. **Add two new things** (§4):
   - **Insights** as a second carousel slide on the Daily hero.
   - **Accent picker** as a new row in the Profile bottom sheet (6 swatches; tap to recolor app).
4. **Swap iconography** from emoji/HTML entities to the inline SVGs in §5.
5. **Wire a tiny bit of JS** for the accent picker + theme picker in §6.

Everything below is copy-paste-able. Run, ship, iterate.

---

## 1 · Design direction

**Pulse** — OLED-first, glassy, single-accent. Optimized for quick entry
and at-a-glance.

- **Background:** true black (`#000`) on dark, warm white (`#F8F7F2`) on light.
- **Surfaces:** elevated cards with hairline borders, no heavy shadows.
- **Accent:** one vibrant color, used for state + emphasis. User-selectable
  from 6 presets. Default: electric lime `#C8FF3D`.
- **Type:** Geist for UI, Geist Mono for tabular data + microcopy.
  Self-host via Google Fonts.
- **Iconography:** monoline stroke icons (Lucide-style), committed —
  no more mixed emoji/entity icons.
- **Voice:** restrained. The analytics slide observes facts ("Protein on
  goal 5 of 7 days") rather than scolding.

The hero ring carousel has **two slides**: rings (today's progress) and
insights (last 7 days' patterns).

---

## 2 · Token system

### 2a · Fonts

Add to `<head>` in `index.html` (or self-host the WOFF2s for offline-first):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

If you self-host, add the WOFF2s to the service-worker cache list in
`js/sw.js` (or wherever your SW lives).

### 2b · Tokens

Replace the existing `:root` block in `css/style.css` with this:

```css
:root {
  /* type */
  --font: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: "Geist Mono", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;

  /* light surfaces — warm, not cool */
  --bg:         #F8F7F2;
  --surface:    #FFFFFF;
  --surface-2:  #F2F1EB;   /* sunken inset (macro cards, nutrition rows) */
  --hair:       #E4E2DA;   /* card borders, dividers */
  --hair-2:     #EEECE5;   /* in-card row dividers */
  --ink:        #15171A;   /* primary text */
  --ink-2:      #5B6066;   /* secondary text */
  --ink-3:      #9AA0A6;   /* tertiary / micro labels */

  /* glass surfaces — for the floating tab bar + backdrops */
  --glass:        rgba(255,255,255,0.78);
  --glass-shadow: 0 8px 28px rgba(20,22,25,0.08);
  --backdrop:     rgba(20,22,25,0.22);

  /* card lift — minimal in light mode */
  --card-shadow: 0 1px 2px rgba(20,22,25,0.04);

  /* accent — user-selectable; defaults to lime. Set as --accent + --accent-rgb
     so we can derive transparent variants without recomputing channels. */
  --accent:        #C8FF3D;
  --accent-rgb:    200, 255, 61;
  --accent-ink:    #0A0A0A;                       /* text on accent bg */
  --accent-dim:    rgba(var(--accent-rgb), 0.65); /* outlined borders, dimmed lines */
  --accent-soft:   rgba(var(--accent-rgb), 0.12); /* tinted backgrounds */
  --accent-glow:   rgba(var(--accent-rgb), 0.14); /* halos around buttons */

  /* status — context-specific, NOT swapped by accent */
  --good: #3F9F3C;
  --warn: #D97A0A;
  --over: #D44747;

  /* meal accents — used for the left-edge color rail on meal cards */
  --meal-breakfast: #D97A0A;
  --meal-lunch:     var(--accent);
  --meal-dinner:    #1B96B0;
  --meal-snacks:    #B83AA0;

  /* geometry */
  --radius-sm: 12px;
  --radius:    18px;
  --radius-lg: 24px;
  --radius-xl: 28px;

  /* type scale — committed; replaces the noisy 10-step scale */
  --t-display:  56px;  /* hero numeral (calorie ring center) */
  --t-stat:     32px;  /* big stat (TDEE, weight) */
  --t-h1:       28px;  /* screen titles */
  --t-h2:       22px;  /* card titles, modal headers */
  --t-body:     14px;  /* body, food names */
  --t-small:    13px;  /* secondary */
  --t-micro:    11px;  /* mono microcopy */
  --t-eyebrow:  10px;  /* uppercase mono eyebrows */
}
```

Then replace the dark-mode block. Pulse uses a real dark mode, not a swap:

```css
.dark, :root.dark {
  --bg:         #000000;
  --surface:    #0E0E10;
  --surface-2:  #16161A;
  --hair:       #22222A;
  --hair-2:     #1A1A20;
  --ink:        #F4F4F5;
  --ink-2:      #A0A0AA;
  --ink-3:      #5F5F69;

  --glass:        rgba(20,20,24,0.85);
  --glass-shadow: 0 12px 40px rgba(0,0,0,0.5);
  --backdrop:     rgba(0,0,0,0.55);

  --card-shadow:  none;   /* glow does the lifting in dark */

  --accent-dim:   rgba(var(--accent-rgb), 0.55);
  --accent-soft:  rgba(var(--accent-rgb), 0.10);
  --accent-glow:  rgba(var(--accent-rgb), 0.18);

  --good: #7DE07A;
  --warn: #FFB547;
  --over: #FF6E6E;

  --meal-breakfast: #FFB547;
  --meal-lunch:     var(--accent);
  --meal-dinner:    #5BE9F0;
  --meal-snacks:    #FF6BE5;
}

/* Auto mode = follow OS pref; we keep .light / .dark for explicit overrides */
@media (prefers-color-scheme: dark) {
  :root:not(.light) {
    /* duplicate the .dark block above, OR refactor to apply via :root selector
       chain — your call. Easiest is duplication; same values. */
  }
}
```

> The current app stores `mt_theme` in `localStorage` and applies it as a
> class on `<html>`. Keep that mechanism. Three theme states: `light`,
> `dark`, `''` (auto/system).

### 2c · Accent presets

These are the 6 swatches in the picker. Store the user's pick in
`localStorage.mt_accent` and apply via inline style on `<html>`:

| Name    | Hex       | RGB              |
|---------|-----------|------------------|
| Lime    | `#C8FF3D` | `200, 255, 61`   |
| Cyan    | `#5BE9F0` | `91, 233, 240`   |
| Magenta | `#FF6BE5` | `255, 107, 229`  |
| Amber   | `#FFB547` | `255, 181, 71`   |
| Purple  | `#A78BFA` | `167, 139, 250`  |
| Mint    | `#7DE07A` | `125, 224, 122`  |

See §6 for the JS that applies the accent.

### 2d · Notes on the accent-on-text contrast

Lime, Cyan, Mint, Amber → use `--accent-ink: #0A0A0A` (black-ish on bright)
Magenta, Purple        → use `--accent-ink: #FFFFFF` (white on darker)

The accent picker JS in §6 computes this from RGB luminance, so you don't
need a lookup table.

---

## 3 · Class-by-class restyle

This section enumerates the existing classes from your `style.css` and the
specific changes Pulse needs. Numbers in `[brackets]` are the existing
property values to delete.

### 3a · `.app` (the column container)

No structural change. Just tokens flow through automatically.

### 3b · `.date-nav` (sticky top header)

**Restructure** — current is a row of mixed-purpose buttons. New: a left-aligned title block + right-aligned cluster.

```css
.date-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px 14px;
  background: var(--bg);
  position: sticky; top: 0; z-index: 10;
}
.date-nav__title {
  font-family: var(--font);
  font-weight: 600;
  font-size: var(--t-h1);
  color: var(--ink);
  letter-spacing: -0.8px;
  line-height: 1.1;
}
.date-nav__eyebrow {
  font-family: var(--font-mono);
  font-size: var(--t-eyebrow);
  letter-spacing: 1.2px;
  color: var(--ink-3);
  text-transform: uppercase;
  white-space: nowrap;
}
.date-nav__streak {
  /* small pill: "STREAK 12" with a glowing dot */
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--hair);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-2);
  letter-spacing: 0.4px;
}
.date-nav__streak::before {
  content: "";
  width: 6px; height: 6px; border-radius: 100px;
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent);
}
```

The prev/next chevrons currently live in `.date-nav`. **Move them** into
the rings hero card (left/right edges, ghost buttons) so the header reads
as title-only. Alternatively, leave them but restyle to ghost buttons
sized 28×28, color `var(--ink-3)`.

### 3c · `.daily-summary` + `.carousel-card` (hero card)

```css
.daily-summary {
  margin: 0 14px;
  padding: 20px 18px 18px;
  background:
    radial-gradient(120% 80% at 50% 0%, var(--accent-glow), transparent 60%),
    var(--surface);
  border: 1px solid var(--hair);
  border-radius: var(--radius-xl);
  box-shadow: var(--card-shadow);
  position: relative;
  overflow: hidden;
}
.daily-summary__corner {
  position: absolute; top: 16px;
  font-family: var(--font-mono); font-size: var(--t-eyebrow);
  color: var(--ink-3); letter-spacing: 0.8px;
}
.daily-summary__corner--left  { left: 18px; }
.daily-summary__corner--right { right: 18px; text-align: right; }
.daily-summary__corner b {
  display: block; margin-top: 2px;
  font-family: var(--font);
  font-weight: 600; font-size: 20px;
  letter-spacing: -0.5px; line-height: 1;
  font-variant-numeric: tabular-nums;
}
.daily-summary__corner--left b  { color: var(--accent); }
.daily-summary__corner--right b { color: var(--ink); }

/* Carousel dots */
.carousel-dots {
  display: flex; gap: 6px;
  justify-content: center;
  margin: 8px 0;
}
.carousel-dot {
  width: 5px; height: 5px;
  border-radius: 100px;
  background: var(--hair);
  transition: width 0.2s;
}
.carousel-dot.active {
  width: 16px;
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent-glow);
}
```

### 3d · `.rings-container` + `.ring-*` (the ring SVGs)

The calorie ring **stays large**, the 3 macro rings **get demoted to
cards** (faster at-a-glance, fewer rings competing).

```css
.rings-container { display: flex; justify-content: center; }

/* Calorie ring — center text restyle */
.ring-calorie .ring-current {
  font-family: var(--font);
  font-weight: 600; font-size: var(--t-display);
  color: var(--ink);
  letter-spacing: -2.5px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.ring-calorie .ring-goal {
  font-family: var(--font-mono);
  font-size: var(--t-micro);
  color: var(--ink-2);
  letter-spacing: 0.6px;
  margin-top: 4px;
}
.ring-calorie .ring-name {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--ink-3);
  letter-spacing: 1.4px;
  text-transform: uppercase;
}

/* Stroke updates */
.ring-track  { stroke: var(--hair); }
.ring-fill   { stroke: var(--accent); stroke-linecap: round; }
.ring-fill--warn { stroke: var(--warn); }
.ring-fill--over { stroke: var(--over); }
.ring-fill--good { stroke: var(--good); }

/* Ring color logic — keep the existing 0-49 red / 50-84 yellow / 85-100 green / 100+ red.
   Apply via the JS that already does this, just point it at the new tokens. */
```

**Replace** the 3 small macro rings with a 4-up grid of macro+sugar cards:

```css
.macro-row {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.macro-card {
  padding: 10px 10px 12px;
  background: var(--surface-2);
  border: 1px solid var(--hair);
  border-radius: 14px;
}
.macro-card__label {
  font-family: var(--font-mono);
  font-size: 8.5px;
  color: var(--ink-3);
  letter-spacing: 1px;
  margin-bottom: 4px;
}
.macro-card__value {
  display: flex; align-items: baseline; gap: 2px;
}
.macro-card__value b {
  font-family: var(--font);
  font-weight: 600; font-size: 17px;
  color: var(--ink);
  letter-spacing: -0.5px;
  font-variant-numeric: tabular-nums;
}
.macro-card__value span {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--ink-3);
}
.macro-card__value.over b { color: var(--over); }
.macro-card__bar {
  margin-top: 6px;
  height: 4px;
  background: var(--hair);
  border-radius: 100px;
  overflow: hidden;
}
.macro-card__bar > div {
  height: 100%;
  background: var(--accent);
  border-radius: 100px;
  box-shadow: 0 0 8px var(--accent-glow);
}
```

The added-sugar row no longer needs a separate `.progress-bar`; it lives
inside the macro grid as the 4th card with a `--label: "SUGAR · CEILING"`
treatment.

### 3e · `.water-chip` (and the new action row)

Restructure the area below the hero into a 3-column action row:

```html
<div class="action-row">
  <div class="water-chip">
    <svg class="ico"><use href="#i-water"/></svg>
    <div>
      <div class="eyebrow">WATER</div>
      <div><b>4</b><span>/8</span></div>
    </div>
    <button class="round-ghost">+</button>
  </div>
  <button class="action-btn">
    <svg class="ico ico--accent"><use href="#i-scan"/></svg> Scan
  </button>
  <button class="action-btn action-btn--primary">
    <svg class="ico"><use href="#i-bolt"/></svg> Log
  </button>
</div>
```

```css
.action-row {
  margin: 12px 14px 0;
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 8px;
}
.action-row > * {
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--hair);
  background: var(--surface);
  color: var(--ink);
}
.action-btn--primary {
  background: var(--accent);
  color: var(--accent-ink);
  border-color: transparent;
  box-shadow: 0 0 24px var(--accent-glow);
  font-weight: 700;
}
```

### 3f · `.meal-section` (the four meal cards)

```css
.meal-section {
  background: var(--surface);
  border: 1px solid var(--hair);
  border-radius: var(--radius);
  overflow: hidden;
  position: relative;
}
/* Left-edge color rail per meal */
.meal-section::before {
  content: "";
  position: absolute; top: 0; left: 0;
  width: 3px; height: 100%;
  background: var(--meal-color, var(--accent));
  box-shadow: 0 0 12px color-mix(in oklch, var(--meal-color) 50%, transparent);
}
.meal-section--breakfast { --meal-color: var(--meal-breakfast); }
.meal-section--lunch     { --meal-color: var(--meal-lunch); }
.meal-section--dinner    { --meal-color: var(--meal-dinner); }
.meal-section--snacks    { --meal-color: var(--meal-snacks); }

.meal-title {
  font-family: var(--font);
  font-size: var(--t-body);
  font-weight: 600;
  color: var(--ink);
  letter-spacing: -0.2px;
}
.meal-time {
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--ink-3);
  letter-spacing: 0.6px;
  margin-top: 1px;
}
.meal-cals {
  font-family: var(--font);
  font-weight: 600; font-size: 18px;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;
}

.food-item {
  padding: 7px 0;
  border-top: 1px solid var(--hair-2);
  display: flex; align-items: center; gap: 8px;
}
.food-name {
  font-size: 13px;
  color: var(--ink);
  font-weight: 500;
}
.food-detail {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-3);
  letter-spacing: 0.2px;
  margin-top: 1px;
}
```

**Empty meal cards** — keep the existing "whole card is tappable" behavior.
The new copy is shorter:

```css
.meal-section--empty .meal-empty-hint {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-3);
  letter-spacing: 0.4px;
  text-transform: uppercase;
  /* "TAP TO COMPOSE" */
}
```

The `+ Add` button gets demoted to a 26×26 round button in the meal header
(`background: var(--hair)`, no text label — the icon is the affordance).

### 3g · `.weight-projection` (the lede)

```css
.weight-projection {
  margin: 0 14px;
  background:
    radial-gradient(80% 100% at 100% 0%, var(--accent-glow), transparent 60%),
    var(--surface);
  border: 1px solid var(--hair);
  border-radius: var(--radius-lg);
  padding: 18px;
  position: relative; overflow: hidden;
}
.weight-projection__eyebrow {
  font-family: var(--font-mono);
  font-size: var(--t-eyebrow);
  color: var(--ink-3);
  letter-spacing: 1.2px;
}
.weight-projection__copy {
  margin-top: 4px;
  font-size: 17px;
  color: var(--ink);
  line-height: 1.3;
  letter-spacing: -0.3px;
}
.weight-projection__copy .target,
.weight-projection__copy .date {
  font-weight: 600;
}
.weight-projection__copy .target {
  color: var(--accent);
}
.weight-projection__now {
  text-align: right;
}
.weight-projection__now b {
  font-family: var(--font);
  font-weight: 600;
  font-size: 44px;
  color: var(--ink);
  letter-spacing: -2px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  display: block;
}
```

The 3 stat tiles below ("7-day / total / pace") become inset cards inside
the projection block:

```css
.weight-stats {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.weight-stat {
  padding: 10px 12px;
  background: var(--surface-2);
  border: 1px solid var(--hair);
  border-radius: 12px;
}
```

### 3h · `.weight-chart` (the line chart)

The chart already uses SVG. Three changes:

1. Replace the line stroke with a gradient (cyan → accent):
   ```svg
   <defs>
     <linearGradient id="w-grad" x1="0" y1="0" x2="1" y2="0">
       <stop offset="0%" stop-color="#5BE9F0"/>
       <stop offset="100%" stop-color="var(--accent)"/>
     </linearGradient>
   </defs>
   <path stroke="url(#w-grad)" stroke-width="2" .../>
   ```
2. Add a glow circle behind the most recent point:
   ```svg
   <circle cx="..." cy="..." r="10" fill="var(--accent)" opacity="0.15"/>
   ```
3. Add a dashed target line at the target weight:
   ```svg
   <line stroke="var(--accent-dim)" stroke-width="1" stroke-dasharray="2 3" .../>
   ```

### 3i · `.bottom-nav` (the tab bar)

Major restructure — from edge-anchored row to floating glass pill:

```css
.bottom-nav {
  position: fixed;
  left: 16px; right: 16px;
  bottom: calc(20px + env(safe-area-inset-bottom));
  background: var(--glass);
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  border: 1px solid var(--hair);
  border-radius: 999px;
  box-shadow: var(--glass-shadow);
  padding: 7px 8px;
  display: flex;
  gap: 4px;
  z-index: 20;
}
.nav-btn {
  flex: 1;
  display: flex; align-items: center; justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 999px;
  color: var(--ink-2);
  font-family: var(--font);
  font-weight: 500;
  font-size: 12px;
  background: transparent;
  border: none;
  transition: background 0.15s, color 0.15s;
}
.nav-btn.active {
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 700;
  letter-spacing: 0.3px;
  box-shadow: 0 0 20px var(--accent-glow);
}
.nav-btn:not(.active) .nav-label { display: none; }  /* labels only on active */
.nav-icon { width: 16px; height: 16px; display: inline-flex; }
```

The current emoji icons get **replaced with SVGs** (§5).

### 3j · `.modal` (bottom sheets)

```css
.modal {
  position: fixed; inset: 0;
  background: var(--backdrop);
  z-index: 100;
  display: flex; align-items: flex-end;
}
.modal-content {
  width: 100%;
  background: var(--surface);
  border-top-left-radius: var(--radius-xl);
  border-top-right-radius: var(--radius-xl);
  border: 1px solid var(--hair);
  border-bottom: none;
  box-shadow: 0 -8px 60px var(--accent-glow);
  max-height: 92dvh;
  display: flex; flex-direction: column;
}
.modal-grabber {
  width: 38px; height: 4px;
  border-radius: 100px;
  background: var(--hair);
  margin: 8px auto 0;
}
```

Search row inside the add-food modal stays sticky-top. Restyle the input:

```css
.input-search {
  background: var(--surface-2);
  border: 1px solid var(--hair);
  border-radius: 12px;
  padding: 10px 14px 10px 36px;  /* room for left icon */
  font-family: var(--font);
  font-size: 14px;
  color: var(--ink);
  outline: none;
}
.input-search:focus { border-color: var(--accent-dim); box-shadow: 0 0 0 3px var(--accent-glow); }
```

### 3k · `.collapsible` (Goals page)

```css
.collapsible {
  background: var(--surface);
  border: 1px solid var(--hair);
  border-radius: var(--radius);
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.collapsible.open {
  border-color: var(--accent-dim);
  box-shadow: 0 0 24px var(--accent-glow);
}
.collapsible__head {
  padding: 14px 16px;
  display: flex; align-items: center; gap: 8px;
  cursor: pointer;
}
.collapsible__body {
  border-top: 1px solid var(--hair-2);
  background: var(--surface-2);
  padding: 14px 16px;
}
.collapsible__title {
  font-size: var(--t-body); font-weight: 600;
  color: var(--ink); letter-spacing: -0.2px;
}
.collapsible__sub {
  font-family: var(--font-mono);
  font-size: var(--t-micro);
  color: var(--ink-3);
  letter-spacing: 0.3px;
  margin-top: 2px;
}
.collapsible.open .collapsible__sub { color: var(--accent); }
```

### 3l · `.tdee-suggestion` & `.weight-projection`

The accent-tinted callout cards already exist; just retoken backgrounds
to `var(--accent-soft)` and borders to `var(--accent-dim)`.

---

## 4 · Two new components

### 4a · Insights — second slide on the Daily hero carousel

You already have the carousel scaffolding (`.daily-summary` swipes). Add a
second slide alongside the rings card:

```html
<div class="daily-summary insight-card">
  <header class="insight-card__head">
    <span class="insight-card__icon">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h7v8l9-12h-7V2z"/></svg>
    </span>
    <span class="eyebrow">INSIGHT · LAST 7 DAYS</span>
  </header>

  <h2 class="insight-card__hed">
    Protein on goal <em>5 of 7 days</em>
  </h2>
  <p class="insight-card__sub">
    Best streak since you started. Saturday came up short — light lunch.
  </p>

  <div class="insight-card__chart">
    <!-- 7 bars; .bar.hit gets the glowing accent, others get --hair -->
    <div class="bar hit" style="--h:62px"><span>M</span></div>
    <div class="bar"     style="--h:53px"><span>T</span></div>
    <div class="bar hit" style="--h:62px"><span>W</span></div>
    <div class="bar hit" style="--h:60px"><span>T</span></div>
    <div class="bar hit" style="--h:64px"><span>F</span></div>
    <div class="bar"     style="--h:56px"><span>S</span></div>
    <div class="bar hit" style="--h:59px"><span>S</span></div>
  </div>

  <div class="insight-card__note">
    <span class="trend trend-up">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17l5-5 5 5M7 11l5-5 5 5"/></svg>
    </span>
    <div>
      <div class="note__title">Fat trending up</div>
      <div class="note__sub">3 DAYS OVER · DINNER SAUCES?</div>
    </div>
  </div>
</div>
```

```css
.insight-card__head { display: flex; align-items: center; gap: 8px; }
.insight-card__icon {
  width: 26px; height: 26px; border-radius: 100px;
  background: var(--accent-soft); color: var(--accent);
  border: 1px solid var(--accent-dim);
  display: inline-flex; align-items: center; justify-content: center;
}
.insight-card__hed {
  margin: 14px 0 0;
  font-family: var(--font);
  font-weight: 500; font-size: var(--t-h2);
  color: var(--ink);
  letter-spacing: -0.5px;
  line-height: 1.2;
}
.insight-card__hed em {
  font-style: normal; font-weight: 700;
  color: var(--accent);
}
.insight-card__sub {
  margin: 4px 0 0;
  font-size: var(--t-small);
  color: var(--ink-2);
  line-height: 1.4;
}
.insight-card__chart {
  margin-top: 18px;
  padding: 12px 4px 6px;
  background: var(--surface-2);
  border: 1px solid var(--hair);
  border-radius: 14px;
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 90px;
}
.insight-card__chart .bar {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.insight-card__chart .bar::before {
  content: "";
  width: 70%; height: var(--h);
  background: var(--hair);
  border-radius: 3px;
}
.insight-card__chart .bar.hit::before {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
}
.insight-card__chart .bar span {
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--ink-3);
}
.insight-card__chart .bar.hit span {
  color: var(--ink);
  font-weight: 600;
}
.insight-card__note {
  margin-top: 12px;
  padding: 10px 12px;
  background: var(--surface-2);
  border: 1px solid var(--hair);
  border-radius: 12px;
  display: flex; align-items: center; gap: 10px;
}
.insight-card__note .trend-up {
  width: 20px; height: 20px; border-radius: 100px; flex-shrink: 0;
  background: rgba(212,71,71,0.15);
  color: var(--over);
  display: inline-flex; align-items: center; justify-content: center;
}
```

**JS:** the carousel needs to compute the insight data from the user's
actual history (`store.js`). For v1 it's fine to render fixed copy keyed
to the last 7 days of protein-hit booleans, computed inline.

### 4b · Accent picker — new row in the Profile bottom sheet

Add inside the existing `.profile-sheet` (or whatever the profile-modal
class is), between Theme and Units:

```html
<div class="sheet-row sheet-row--block">
  <div class="sheet-row__label">ACCENT</div>
  <div class="accent-picker">
    <button class="accent-swatch" data-accent="#C8FF3D" data-rgb="200,255,61">
      <span class="dot" style="background:#C8FF3D"></span>
      <small>LIME</small>
    </button>
    <!-- ...repeat for Cyan / Magenta / Amber / Purple / Mint -->
  </div>
</div>
```

```css
.accent-picker {
  display: flex; gap: 10px; flex-wrap: wrap;
}
.accent-swatch {
  flex: 1; min-width: 0;
  padding: 10px 8px 8px;
  background: transparent;
  border: 1px solid var(--hair);
  border-radius: 12px;
  text-align: center;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.accent-swatch[aria-pressed="true"] {
  background: var(--surface-2);
  border-color: var(--accent-dim);
  box-shadow: 0 0 14px var(--accent-glow);
}
.accent-swatch .dot {
  display: block;
  width: 28px; height: 28px;
  border-radius: 100px;
  margin: 0 auto;
  box-shadow: 0 0 12px currentColor;  /* see JS to set color-mix */
}
.accent-swatch small {
  display: block;
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.6px;
  color: var(--ink-3);
}
.accent-swatch[aria-pressed="true"] small { color: var(--ink); }
```

JS handler in §6c.

---

## 5 · Iconography

Drop these as inline `<svg>` (or as a hidden `<svg>` sprite at the top of
`index.html` and reference via `<use href="#i-name"/>`):

```html
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <!-- bottom nav -->
    <symbol id="i-daily" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 4h16v16H4z"/><path d="M4 9h16M9 4v5"/>
    </symbol>
    <symbol id="i-weight" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 8h14l1 13H4L5 8z"/><path d="M9 8a3 3 0 0 1 6 0"/>
    </symbol>
    <symbol id="i-goals" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>
    </symbol>

    <!-- meal icons (replace the ☀ ☼ ☾ ○ entities) -->
    <symbol id="i-meal-breakfast" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>
    </symbol>
    <symbol id="i-meal-lunch" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 12h18M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/><path d="M8 12V8M16 12V8"/>
    </symbol>
    <symbol id="i-meal-dinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>
    </symbol>
    <symbol id="i-meal-snacks" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
      <circle cx="12" cy="12" r="8"/>
    </symbol>

    <!-- chrome -->
    <symbol id="i-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></symbol>
    <symbol id="i-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></symbol>
    <symbol id="i-star" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></symbol>
    <symbol id="i-star-fill" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></symbol>

    <symbol id="i-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></symbol>
    <symbol id="i-camera" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 7h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13" r="4"/></symbol>
    <symbol id="i-scan" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M11 8v8M15 8v8"/></symbol>
    <symbol id="i-bolt" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h7v8l9-12h-7V2z"/></symbol>
    <symbol id="i-water" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3s7 8 7 13a7 7 0 0 1-14 0c0-5 7-13 7-13z"/></symbol>
    <symbol id="i-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
  </defs>
</svg>
```

Use sites:
- `.nav-btn` icons → `i-daily / i-weight / i-goals`
- Meal section icons → `i-meal-{key}`
- `+ Add` in meals → `i-plus`
- Star/unstar food item → `i-star-fill / i-star`
- Modal close → `i-close`
- Search input prefix → `i-search`
- Camera/barcode button → `i-camera` or `i-scan`
- Big "Log" CTA → `i-bolt`
- Water chip → `i-water`
- Collapsible chevron → `i-arrow`

---

## 6 · JS additions

### 6a · Theme + accent persistence (apply before paint)

Replace the current pre-paint snippet in `index.html`:

```html
<script>
  // Theme: '' (auto) | 'light' | 'dark'
  const theme = localStorage.getItem('mt_theme') || '';
  if (theme) document.documentElement.classList.add(theme);

  // Accent: hex or null (default lime)
  const accent = localStorage.getItem('mt_accent');
  if (accent) applyAccent(accent);

  function applyAccent(hex) {
    const h = hex.replace('#','');
    const n = parseInt(h, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const lum = 0.299*r + 0.587*g + 0.114*b;
    const root = document.documentElement;
    root.style.setProperty('--accent', hex);
    root.style.setProperty('--accent-rgb', `${r},${g},${b}`);
    root.style.setProperty('--accent-ink', lum > 160 ? '#0A0A0A' : '#FFFFFF');
  }
  window.applyAccent = applyAccent;
</script>
```

### 6b · Theme picker in Profile sheet

```js
// in ui.js or wherever the profile sheet renders
function setTheme(mode) {
  // mode: 'light' | 'dark' | 'auto'
  document.documentElement.classList.remove('light', 'dark');
  if (mode === 'light') document.documentElement.classList.add('light');
  if (mode === 'dark')  document.documentElement.classList.add('dark');
  localStorage.setItem('mt_theme', mode === 'auto' ? '' : mode);
}
```

Wire to the existing `.toggle-group` segmented control.

### 6c · Accent picker in Profile sheet

```js
const ACCENTS = [
  { name: 'Lime',    hex: '#C8FF3D' },
  { name: 'Cyan',    hex: '#5BE9F0' },
  { name: 'Magenta', hex: '#FF6BE5' },
  { name: 'Amber',   hex: '#FFB547' },
  { name: 'Purple',  hex: '#A78BFA' },
  { name: 'Mint',    hex: '#7DE07A' },
];

function renderAccentPicker(container) {
  const current = (localStorage.getItem('mt_accent') || '#C8FF3D').toLowerCase();
  container.innerHTML = ACCENTS.map(a => `
    <button class="accent-swatch" data-hex="${a.hex}"
            aria-pressed="${a.hex.toLowerCase() === current}">
      <span class="dot" style="background:${a.hex};color:${a.hex}"></span>
      <small>${a.name.toUpperCase()}</small>
    </button>
  `).join('');

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.accent-swatch');
    if (!btn) return;
    const hex = btn.dataset.hex;
    window.applyAccent(hex);
    localStorage.setItem('mt_accent', hex);
    container.querySelectorAll('.accent-swatch').forEach(b => {
      b.setAttribute('aria-pressed', b.dataset.hex.toLowerCase() === hex.toLowerCase());
    });
  });
}
```

### 6d · Carousel — insights slide

If the existing carousel uses scroll-snap, the insight card slots in
automatically as a second `.carousel-card` sibling. If it's JS-driven,
add slide 2 to whatever array drives the renderer and dot-indicator.

The insight content (5-of-7 days, trend up on fat) should be computed
from the last 7 days of `store.js` logs. Suggested helpers:

```js
function proteinHitsThisWeek() {
  const last7 = lastNDays(7);
  return last7.map(day => ({
    label: day.dateLabel,  // 'M' / 'T' / 'W' ...
    pct: day.protein / day.proteinGoal,
    hit: day.protein >= day.proteinGoal,
  }));
}
```

---

## 7 · File checklist

- [ ] `css/style.css` — wholesale token replacement + new component rules from §3, §4
- [ ] `index.html`:
  - [ ] `<head>` — Geist + Geist Mono `<link>`
  - [ ] Pre-paint script — theme + accent application (§6a)
  - [ ] SVG sprite — `<svg style="position:absolute">` at top of `<body>` (§5)
  - [ ] Bottom nav — swap emoji icons for `<svg><use/></svg>`
  - [ ] Daily summary — add carousel slide 2 markup (§4a)
  - [ ] Profile sheet — add accent picker row (§4b)
- [ ] `js/ui.js`:
  - [ ] `setTheme(mode)` + wire to Theme segmented control
  - [ ] `renderAccentPicker(container)` + wire to Profile sheet
  - [ ] Update ring center text classes to match new tokens
- [ ] `js/app.js`:
  - [ ] Update `renderDaily` to add the meal `--meal-color` CSS variable on each `.meal-section` based on meal key
  - [ ] Update meal section markup to use `<svg><use/></svg>` icons
- [ ] `js/sw.js`:
  - [ ] Add Geist + Geist Mono WOFF2 URLs to the cache list (if self-hosting)
- [ ] `manifest.json`:
  - [ ] Update `theme_color` to `#C8FF3D` (or current accent) and `background_color` to `#000000`

---

## 8 · Caveats & open questions

- **Color-mix() support** — used in §3f for the meal-rail glow. Safari 16.4+,
  Chrome 111+, Firefox 113+. The current PWA targets iPhone 16 Pro (Safari 17+)
  so this is fine. If you ever ship for older Android browsers, fall back to a
  static rgba.
- **`backdrop-filter`** — same browser support story; fine on iPhone.
- **The macro-row demotion** is the biggest UX change. The current 3-ring
  cluster (P/C/F) becomes a 4-cell card grid that includes Added Sugar as a
  peer. If you want to preserve the rings, keep `.ring-protein/.ring-carbs/.ring-fat`
  and skip the `.macro-row` section — just retoken the existing rings.
- **The carousel** currently has 2 slides (rings ↔ insights). If you decide
  later to add a third (e.g. weekly trend), the dot-indicator CSS supports
  any count.
- **Accent application order matters** — set CSS vars on `<html>` *before*
  React/vanilla render so derived rgba values resolve cleanly on first
  paint. The pre-paint script in §6a handles this.
- **Service worker** — invalidate the cache after shipping; the existing
  update banner pattern handles this.

---

## 9 · Visual reference

Open `Meal Tracker Refresh.html` in this project. The Pulse direction is
on the canvas (with both light + dark toggleable via Tweaks bottom-right).
Every artboard there matches a 1:1 implementation target.

