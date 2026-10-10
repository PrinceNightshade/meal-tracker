# `handoff/` — Pulse refresh, packaged for Claude Code

Everything you need to implement Pulse on top of the existing meal-tracker
PWA. Hand this folder (plus your `meal-tracker/` repo) to Claude Code.

## What's in here

| File                          | What it is                                                         | What to do with it |
|-------------------------------|--------------------------------------------------------------------|--------------------|
| **`HANDOFF.md`**              | The master spec. Read this first.                                  | Reference doc.     |
| `pulse.tokens.css`            | All CSS custom properties (light + dark + accent presets).         | Replaces the `:root` and `.dark` blocks in `css/style.css`. |
| `pulse.components.css`        | All component-level rules (rings, meals, weight, modals, tab bar, accent picker, insights card). | Replaces the existing component rules in `css/style.css`. |
| `pulse.icons.svg.html`        | Inline SVG sprite of every icon (nav, meals, chrome, trends).      | Paste as the first child of `<body>` in `index.html`; reference via `<svg><use href="#i-name"/></svg>`. |
| `pulse.theme.js`              | Theme + accent persistence + render helpers.                        | Load early (before `style.css`) in `index.html`. Calls helpers from `js/ui.js`. |
| **`../Meal Tracker Refresh.html`** | Live visual reference. Open in a browser.                       | The source of truth for every artboard's intent. |

## Recommended Claude Code prompt

> I'm refreshing the meal-tracker PWA per `handoff/HANDOFF.md`. Apply the
> changes in this exact order:
>
> 1. Drop `handoff/pulse.theme.js` into `js/pulse-theme.js` and add it to
>    `<head>` in `index.html` (before `css/style.css`).
> 2. Replace the `:root` + dark-mode blocks in `css/style.css` with
>    `handoff/pulse.tokens.css`.
> 3. Replace the existing component rules in `css/style.css` with
>    `handoff/pulse.components.css` (keep my custom JS hooks untouched).
> 4. Paste `handoff/pulse.icons.svg.html` as the first child of `<body>`
>    in `index.html`.
> 5. Update the markup per §3 and §4 of `HANDOFF.md`:
>    - Date nav restructure
>    - Macro-row replaces the 3 small macro rings (calorie ring stays)
>    - Meal section markup gets per-meal `.meal-section--{key}` class
>    - Action row (water / scan / log)
>    - Insight card as second carousel slide
>    - Accent picker row in the Profile bottom sheet
> 6. Swap every emoji/entity icon (`📋 ⚖️ 🎯 ☀ ☼ ☾ ○ + ×`) for `<svg><use/>` references.
> 7. Wire `Pulse.renderAccentPicker()` and `Pulse.renderThemeToggle()` in
>    the profile-sheet renderer.
> 8. Add the Geist + Geist Mono `@font-face` URLs (or `<link>` to Google
>    Fonts) to `<head>` and to the service-worker cache list.
> 9. Bump `manifest.json` `theme_color` to `#C8FF3D` and
>    `background_color` to `#000000`.
>
> Open `Meal Tracker Refresh.html` for the visual reference of every screen.

## Things to validate after implementation

- [ ] Cold load — no FOUC; theme + accent apply before paint
- [ ] Ring color logic preserved (0-49% red, 50-84% yellow, 85-100% green, >100% red)
- [ ] Added-sugar bar still has inverse-coloring semantics (green low → purple over)
- [ ] All four meal cards show the correct color rail
- [ ] Carousel swipe gestures still work; both slides reachable
- [ ] Accent picker swatches change the app color live (and persist on reload)
- [ ] Theme toggle (Light / Dark / Auto) works and persists
- [ ] PWA still installs and works offline (service worker cache hits Geist fonts)
- [ ] All tap targets ≥ 44pt — check the round close/star/add buttons especially

## Things deliberately NOT changed

- No new screens, tabs, or features (per the design brief's scope)
- No Firebase / auth UI changes (still just signed-in/signed-out)
- The existing JS architecture (`store.js` → `app.js` render → `ui.js` helpers) is preserved; only the markup these helpers output changes
- The `mt_theme` localStorage key is preserved; a new `mt_accent` key is added
