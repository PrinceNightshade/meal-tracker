// gestures.js — opt-in gesture signals for usage recording
//
// Three signals, all gated by the same opt-in as usage.js (nothing is recorded,
// and handlers return immediately, when "Record how I use the app" is off):
//   1. Section dwell — which named section is in view when scrolling settles, how
//      long the user stays, and how often they come back after leaving.
//   2. Dead scroll   — a vertical drag after which nothing scrolled (page/sheet was
//      already at an edge, or the thing dragged isn't scrollable).
//   3. Dead tap      — a tap on something that isn't interactive.
//
// What is recorded is section NAMES (data-usage-section) and element identifiers
// (data-usage-el, else tag.firstClass) — never pixels, coordinates or text.
// Everything accumulates in memory and goes out as ONE `gestures` event per
// session (on hide, or when the user turns recording off).
//
// The logic lives in pure, exported helpers (classifyDrag, isInteractiveChain,
// describeEl, createDwellTracker, buildSummary) so it is testable without a DOM.
// Only passive listeners are used and touchmove is never listened to.

import { track, isUsageEnabled, addUsageLifecycleHook } from './usage.js';

export const DRAG_MIN_PX = 30;      // a vertical drag must travel at least this far
export const TAP_SLOP_PX = 10;      // a tap moves less than this
export const TAP_MAX_MS = 600;      // ...and is shorter than this (longer = long-press)
export const SETTLE_MS = 250;       // scroll is "settled" this long after the last scroll event
export const SCROLL_CHECK_MS = 150; // look at scroll position this long after touchend (iOS bounce)
export const WHEEL_IDLE_MS = 200;   // a wheel burst ends after this much quiet
export const SUMMARY_CAP = 20;      // max entries per list in the summary
export const MAX_DISTINCT = 200;    // max distinct dead-scroll / dead-tap keys held in memory

// ── Interactive detection (pure) ──

export const INTERACTIVE_TAGS = ['a', 'button', 'input', 'select', 'textarea', 'label', 'summary'];
export const INTERACTIVE_ROLES = ['button', 'tab', 'switch', 'checkbox', 'link'];

// chain: [{ tag, role, tappable }] from the tapped element up to <body>.
// Interactive when any node is one of INTERACTIVE_TAGS, has an interactive ARIA
// role, or carries data-tappable (set by ui.el() for any on* handler; added by
// hand on the few bare-addEventListener clickables).
// Deliberately NOT cursor:pointer — there's no cursor on a phone, so an element
// styled as clickable with no handler (e.g. the streak pill, carousel dots) is
// exactly a "looks tappable, does nothing" dead tap worth recording.
export function isInteractiveChain(chain) {
  for (const n of chain || []) {
    if (!n) continue;
    if (INTERACTIVE_TAGS.includes(String(n.tag || '').toLowerCase())) return true;
    if (n.role && INTERACTIVE_ROLES.includes(String(n.role).toLowerCase())) return true;
    if (n.tappable) return true;
  }
  return false;
}

// chain: [{ tag, classes, usageEl }] target first. Nearest data-usage-el wins;
// otherwise `tag.firstClass` (or just `tag`). Never element text.
export function describeEl(chain) {
  if (!chain || chain.length === 0) return 'unknown';
  for (const n of chain) {
    if (n && n.usageEl) return String(n.usageEl).slice(0, 40);
  }
  const t = chain[0];
  const tag = String(t.tag || 'unknown').toLowerCase();
  const first = String(t.classes || '').trim().split(/\s+/)[0];
  return (first ? `${tag}.${first}` : tag).slice(0, 40);
}

const TEXT_TAGS = ['input', 'textarea', 'select'];
export function isTextEntryTag(tag, isContentEditable = false) {
  return !!isContentEditable || TEXT_TAGS.includes(String(tag || '').toLowerCase());
}

// ── Dead-scroll classification (pure) ──

// dx/dy: finger travel from touchstart to touchend (dy>0 = finger moved down).
// scrollers: innermost-first list of the scroll containers that could have moved,
// each { before, after, max } (scroll offsets in px, max = scrollHeight - clientHeight).
// Returns null when the drag doesn't qualify or something scrolled; otherwise
// { edge: 'top' | 'bottom' | 'none' }.
export function classifyDrag({ dx = 0, dy = 0, scrollers = [] } = {}) {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (ady < DRAG_MIN_PX) return null;   // too short to be a deliberate scroll
  if (ady <= adx) return null;          // horizontal-dominant (e.g. carousel swipe)
  const clamp = (v, max) => Math.min(Math.max(v, 0), Math.max(max, 0)); // iOS rubber-banding goes out of range
  for (const s of scrollers) {
    if (clamp(s.before, s.max) !== clamp(s.after, s.max)) return null; // it scrolled — not dead
  }
  const sc = scrollers.find(s => s.max > 1); // innermost container that is actually scrollable
  if (!sc) return { edge: 'none' };          // nothing here scrolls
  const pos = clamp(sc.before, sc.max);
  if (dy > 0 && pos <= 1) return { edge: 'top' };
  if (dy < 0 && pos >= sc.max - 1) return { edge: 'bottom' };
  return { edge: 'none' };
}

// Which section is "in view": the candidate (a rect + name) containing the point,
// else the vertically-nearest one that is horizontally under x (so an off-screen
// carousel slide never wins). Smallest area breaks ties between nested sections.
export function pickSection(cands, x, y) {
  let best = null;
  let bestD = Infinity;
  let bestArea = Infinity;
  for (const c of cands || []) {
    if (x < c.left || x > c.right) continue;
    const d = y < c.top ? c.top - y : (y > c.bottom ? y - c.bottom : 0);
    const area = Math.max(0, c.right - c.left) * Math.max(0, c.bottom - c.top);
    if (d < bestD || (d === bestD && area < bestArea)) { best = c; bestD = d; bestArea = area; }
  }
  return best ? best.name : null;
}

// ── Dwell tracker (pure) ──

// Accumulates, per surface+section: dwell ms, settles (times the user landed there)
// and returns (landings after having been there before and left).
export function createDwellTracker() {
  let data = {};
  let visited = new Set();
  let last = {};
  let active = null; // { surface, section, since }

  const slot = (s) => (data[s] || (data[s] = { dwellMs: {}, settles: {}, returns: {} }));
  const keyOf = (surface, section) => `${surface}\u0000${section}`;

  function close(now) {
    if (!active) return;
    const ms = Math.max(0, now - active.since);
    const d = slot(active.surface);
    d.dwellMs[active.section] = (d.dwellMs[active.section] || 0) + ms;
    last[active.surface] = active.section;
    active = null;
  }

  return {
    // The user landed on surface/section (view opened, scroll settled, sheet screen opened).
    enter(surface, section, now) {
      if (active && active.surface === surface && active.section === section) return false;
      close(now);
      const d = slot(surface);
      const key = keyOf(surface, section);
      if (visited.has(key)) d.returns[section] = (d.returns[section] || 0) + 1;
      visited.add(key);
      d.settles[section] = (d.settles[section] || 0) + 1;
      active = { surface, section, since: now };
      last[surface] = section;
      return true;
    },
    // Same as enter() but uncounted: coming back from the background or from a sheet.
    resume(surface, section, now) {
      if (active && active.surface === surface && active.section === section) return false;
      close(now);
      visited.add(keyOf(surface, section));
      active = { surface, section, since: now };
      last[surface] = section;
      return true;
    },
    pause(now) { close(now); },
    getActive() { return active ? { surface: active.surface, section: active.section } : null; },
    lastSection(surface) { return last[surface] || null; },
    // Rounded-ms snapshot including the in-progress stint; only non-empty surfaces.
    snapshot(now) {
      const out = {};
      const live = active ? Math.max(0, now - active.since) : 0;
      const surfaces = new Set(Object.keys(data));
      if (active) surfaces.add(active.surface);
      for (const s of surfaces) {
        const d = data[s] || { dwellMs: {}, settles: {}, returns: {} };
        const dwellMs = {};
        for (const [sec, ms] of Object.entries(d.dwellMs)) dwellMs[sec] = ms;
        if (active && active.surface === s) dwellMs[active.section] = (dwellMs[active.section] || 0) + live;
        for (const sec of Object.keys(dwellMs)) {
          dwellMs[sec] = Math.round(dwellMs[sec]);
          if (dwellMs[sec] <= 0) delete dwellMs[sec];
        }
        const settles = { ...d.settles };
        const returns = { ...d.returns };
        if (Object.keys(dwellMs).length || Object.keys(settles).length || Object.keys(returns).length) {
          out[s] = { dwellMs, settles, returns };
        }
      }
      return out;
    },
    // Clear the accumulators. A still-active stint keeps running from `now`
    // (and counts as already visited, so leaving and re-entering is a return).
    reset(now) {
      data = {};
      visited = new Set();
      last = {};
      if (active) {
        active.since = now;
        visited.add(keyOf(active.surface, active.section));
        last[active.surface] = active.section;
      }
    },
    stop() { active = null; },
  };
}

// ── Summary (pure) ──

// Increment (or create) a counter entry, bounded so a pathological session can't
// grow memory without limit.
export function bumpCount(map, key, fields) {
  const cur = map.get(key);
  if (cur) { cur.n += 1; return; }
  if (map.size >= MAX_DISTINCT) return;
  map.set(key, { ...fields, n: 1 });
}

export function sortedCapped(map, cap = SUMMARY_CAP) {
  return [...map.values()]
    .sort((a, b) => (b.n - a.n) || JSON.stringify(a).localeCompare(JSON.stringify(b)))
    .slice(0, cap);
}

// snapshot: tracker.snapshot(); deadScrolls/deadTaps: Maps of counters.
// Returns the event props, or null when there is nothing to report.
export function buildSummary(snapshot, deadScrolls, deadTaps) {
  const surfaces = snapshot || {};
  const scrolls = sortedCapped(deadScrolls || new Map());
  const taps = sortedCapped(deadTaps || new Map());
  if (Object.keys(surfaces).length === 0 && scrolls.length === 0 && taps.length === 0) return null;
  return { surfaces, deadScrolls: scrolls, deadTaps: taps };
}

// ── Module state ──

const tracker = createDwellTracker();
let deadScrolls = new Map();
let deadTaps = new Map();

export function getTracker() { return tracker; }

export function recordDeadScroll(surface, section, edge) {
  bumpCount(deadScrolls, `${surface}|${section}|${edge}`, { surface, section, edge });
}

export function recordDeadTap(surface, section, elId) {
  bumpCount(deadTaps, `${surface}|${section}|${elId}`, { surface, section, el: elId });
}

function resetGestureState(now = Date.now()) {
  tracker.reset(now);
  deadScrolls = new Map();
  deadTaps = new Map();
}

// Emit the single per-session event, then reset. Closes the in-progress dwell stint
// first (the tracker is paused: it resumes on the next 'show'/'enable'). If
// recording is off by now, whatever was gathered is dropped, not recorded.
export function emitGesturesSummary(now = Date.now()) {
  try {
    const on = isUsageEnabled();
    tracker.pause(now);
    const summary = buildSummary(tracker.snapshot(now), deadScrolls, deadTaps);
    resetGestureState(now);
    if (on && summary) track('gestures', summary);
    return on && summary ? summary : null;
  } catch {
    return null;
  }
}

// ── DOM glue (browser only; everything wrapped in try/catch) ──

let enabled = false;   // cached opt-in flag; refreshed only at gesture start / settle / lifecycle
let gesture = null;    // in-flight touch or mouse gesture
let wheel = null;      // in-flight wheel burst
let settleTimer = null;
let syncTimer = null;
let activeIsModal = false;
let initialized = false;

function refreshEnabled() {
  const was = enabled;
  enabled = isUsageEnabled();
  if (was && !enabled) { tracker.stop(); resetGestureState(); }
  return enabled;
}

const byId = (id) => document.getElementById(id);

// { surface, modal } for what the user is looking at right now, or null.
function surfaceInfo() {
  const modal = byId('modal');
  if (modal && modal.classList.contains('open')) {
    const body = byId('modal-body');
    return { surface: (body && body.getAttribute('data-usage-surface')) || 'sheet', modal: true };
  }
  const view = byId('view-content');
  const surface = view && view.getAttribute('data-usage-surface');
  return surface ? { surface, modal: false } : null;
}

function sectionOfEl(node, info) {
  const s = node && node.closest ? node.closest('[data-usage-section]') : null;
  const name = s && s.getAttribute('data-usage-section');
  return name || (info && info.modal ? info.surface : 'other');
}

// The section at the visual center of the surface's visible area.
function sectionAtCenter(info) {
  const vh = window.innerHeight || 0;
  const vw = window.innerWidth || 0;
  let top = 0;
  let bottom = vh;
  if (info.modal) {
    const r = document.querySelector('.modal-content');
    if (r) { const b = r.getBoundingClientRect(); top = Math.max(b.top, 0); bottom = Math.min(b.bottom, vh); }
  } else {
    const hdr = document.querySelector('.date-nav');
    const nav = document.querySelector('.bottom-nav');
    if (hdr) top = Math.max(hdr.getBoundingClientRect().bottom, 0);
    if (nav) { const nt = nav.getBoundingClientRect().top; if (nt > 0) bottom = Math.min(nt, vh); }
  }
  const x = vw / 2;
  const y = (top + bottom) / 2;
  const hit = document.elementFromPoint(x, y);
  const fromHit = hit && hit.closest ? hit.closest('[data-usage-section]') : null;
  if (fromHit) return fromHit.getAttribute('data-usage-section');
  const root = info.modal ? byId('modal-body') : byId('view-content');
  if (root) {
    const cands = [...root.querySelectorAll('[data-usage-section]')].map(n => {
      const b = n.getBoundingClientRect();
      return { name: n.getAttribute('data-usage-section'), top: b.top, bottom: b.bottom, left: b.left, right: b.right };
    });
    const picked = pickSection(cands, x, y);
    if (picked) return picked;
  }
  return info.modal ? info.surface : 'other';
}

// Bring the dwell tracker in line with what is on screen.
//   'auto'   — surface/section may have changed (DOM mutation, settle): counted entries.
//   'resume' — page became visible again: uncounted.
function syncSurface(mode) {
  const info = surfaceInfo();
  if (!info) return;
  const now = Date.now();
  const section = sectionAtCenter(info);
  const act = tracker.getActive();
  if (mode === 'resume') {
    tracker.resume(info.surface, section, now);
  } else if (act && act.surface === info.surface) {
    if (act.section !== section) tracker.enter(info.surface, section, now);
  } else if (activeIsModal && !info.modal && tracker.lastSection(info.surface)) {
    // Back from a sheet to the view it covered: same place, not a "return".
    tracker.resume(info.surface, tracker.lastSection(info.surface), now);
  } else {
    tracker.enter(info.surface, section, now);
  }
  activeIsModal = info.modal;
}

function queueSync() {
  if (!enabled || syncTimer) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    try { if (enabled) syncSurface('auto'); } catch { /* never break the UI */ }
  }, 60);
}

function onSettle() {
  settleTimer = null;
  try {
    if (!refreshEnabled()) return; // the one flag read for this settle
    syncSurface('auto');
  } catch { /* never break the UI */ }
}

function onScroll() {
  if (!enabled) return; // cached flag: trivial when recording is off
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(onSettle, SETTLE_MS);
}

// Containers that could have moved for a drag starting on `target`, innermost
// first. Inside the sheet only the sheet's own containers count (the page behind
// it isn't what the user is dragging).
function collectScrollers(target, modal) {
  const out = [];
  const stop = modal ? byId('modal') : null;
  for (let n = target; n && n.nodeType === 1; n = n.parentElement) {
    if (n === document.body || n === document.documentElement) break;
    if (n.scrollHeight > n.clientHeight + 1) {
      const oy = getComputedStyle(n).overflowY;
      if (oy === 'auto' || oy === 'scroll') {
        out.push({ el: n, before: n.scrollTop, max: n.scrollHeight - n.clientHeight });
      }
    }
    if (n === stop) break;
  }
  if (!modal) {
    const root = document.scrollingElement || document.documentElement;
    out.push({ el: root, root: true, before: window.scrollY || 0, max: root.scrollHeight - root.clientHeight });
  }
  return out;
}

function readScroll(s) {
  return s.root ? (window.scrollY || 0) : s.el.scrollTop;
}

function startGesture(target, x, y) {
  const info = surfaceInfo();
  const a = document.activeElement;
  return {
    x, y,
    t: Date.now(),
    target,
    surface: info ? info.surface : 'other',
    section: sectionOfEl(target, info),
    modal: !!(info && info.modal),
    textFocused: !!a && isTextEntryTag(a.tagName, a.isContentEditable),
    scrollers: null, // collected lazily-ish below for touch (needs the pre-drag offsets)
  };
}

function buildChain(target) {
  const chain = [];
  for (let n = target; n && n.nodeType === 1; n = n.parentElement) {
    chain.push({
      tag: (n.localName || n.nodeName || '').toLowerCase(),
      role: n.getAttribute('role'),
      tappable: n.hasAttribute('data-tappable'),
      classes: n.getAttribute('class') || '',
      usageEl: n.getAttribute('data-usage-el'),
    });
    if (n === document.body) break;
  }
  return chain;
}

function isIgnoredTapTarget(target) {
  if (!target || target.nodeType !== 1) return true;
  if (target === byId('modal')) return true;          // backdrop tap closes the sheet
  if (target.closest('.bottom-nav, #toast, #update-banner')) return true;
  return false;
}

function handleTap(g) {
  if (g.textFocused) return;              // tapping to dismiss the keyboard
  if (isIgnoredTapTarget(g.target)) return;
  const chain = buildChain(g.target);
  if (isInteractiveChain(chain)) return;
  recordDeadTap(g.surface, g.section, describeEl(chain));
}

function checkDrag(g, dx, dy) {
  try {
    if (!g.scrollers) return;
    const scrollers = g.scrollers.map(s => ({ before: s.before, after: readScroll(s), max: s.max }));
    const r = classifyDrag({ dx, dy, scrollers });
    if (r) recordDeadScroll(g.surface, g.section, r.edge);
  } catch { /* never break the UI */ }
}

function finishGesture(g, x, y, { tapOnly = false } = {}) {
  const dx = x - g.x;
  const dy = y - g.y;
  const dur = Date.now() - g.t;
  if (Math.hypot(dx, dy) <= TAP_SLOP_PX && dur <= TAP_MAX_MS) { handleTap(g); return; }
  if (tapOnly) return;
  if (Math.abs(dy) >= DRAG_MIN_PX && Math.abs(dy) > Math.abs(dx)) {
    setTimeout(() => checkDrag(g, dx, dy), SCROLL_CHECK_MS);
  }
}

function onTouchStart(e) {
  gesture = null;
  try {
    if (!refreshEnabled()) return;                   // the one flag read for this gesture
    if (!e.touches || e.touches.length !== 1) return; // multi-touch (pinch) isn't a scroll or a tap
    const t = e.touches[0];
    const g = startGesture(e.target, t.clientX, t.clientY);
    g.scrollers = collectScrollers(e.target, g.modal);
    gesture = g;
  } catch { gesture = null; }
}

function onTouchEnd(e) {
  const g = gesture;
  gesture = null;
  if (!g) return;
  try {
    const t = e.changedTouches && e.changedTouches[0];
    if (t) finishGesture(g, t.clientX, t.clientY);
  } catch { /* never break the UI */ }
}

function onTouchCancel() { gesture = null; }

// Desktop fallback: mouse clicks are taps; wheel bursts are scrolls.
function onPointerDown(e) {
  if (e.pointerType !== 'mouse' || e.button) return;
  gesture = null;
  try {
    if (!refreshEnabled()) return;
    gesture = startGesture(e.target, e.clientX, e.clientY);
  } catch { gesture = null; }
}

function onPointerUp(e) {
  if (e.pointerType !== 'mouse') return;
  const g = gesture;
  gesture = null;
  if (!g) return;
  try { finishGesture(g, e.clientX, e.clientY, { tapOnly: true }); } catch { /* ignore */ }
}

function finishWheel() {
  const w = wheel;
  wheel = null;
  if (!w) return;
  try {
    // wheel deltaY>0 scrolls content down = finger moving up, so flip the sign
    checkDrag(w, -w.sumX, -w.sumY);
  } catch { /* ignore */ }
}

function onWheel(e) {
  if (!enabled) return; // cached flag: trivial when recording is off
  try {
    if (!wheel) {
      const g = startGesture(e.target, 0, 0);
      g.scrollers = collectScrollers(e.target, g.modal);
      g.sumX = 0;
      g.sumY = 0;
      g.timer = null;
      wheel = g;
    }
    wheel.sumX += e.deltaX || 0;
    wheel.sumY += e.deltaY || 0;
    if (wheel.timer) clearTimeout(wheel.timer);
    wheel.timer = setTimeout(finishWheel, WHEEL_IDLE_MS);
  } catch { wheel = null; }
}

function onLifecycle(ev) {
  try {
    if (ev === 'hide') {
      emitGesturesSummary();
      activeIsModal = false;
    } else if (ev === 'show') {
      if (refreshEnabled()) syncSurface('resume');
    } else if (ev === 'enable') {
      if (refreshEnabled()) syncSurface('auto');
    } else if (ev === 'disable') {
      emitGesturesSummary();
      enabled = false;
      tracker.stop();
      activeIsModal = false;
    }
  } catch { /* never break the UI */ }
}

// Called once at startup (app.js). Safe when recording is off.
export function initGestures() {
  if (initialized) return;
  initialized = true;
  try {
    const opts = { passive: true, capture: true };
    document.addEventListener('touchstart', onTouchStart, opts);
    document.addEventListener('touchend', onTouchEnd, opts);
    document.addEventListener('touchcancel', onTouchCancel, opts);
    document.addEventListener('pointerdown', onPointerDown, opts);
    document.addEventListener('pointerup', onPointerUp, opts);
    document.addEventListener('wheel', onWheel, opts);
    document.addEventListener('scroll', onScroll, opts); // capture: also catches #modal-body / .modal-content

    if (typeof MutationObserver !== 'undefined') {
      const mo = new MutationObserver(queueSync);
      const view = byId('view-content');
      const modal = byId('modal');
      const body = byId('modal-body');
      if (view) mo.observe(view, { childList: true });
      if (modal) mo.observe(modal, { attributes: true, attributeFilter: ['class'] });
      if (body) mo.observe(body, { childList: true, attributes: true, attributeFilter: ['data-usage-surface'] });
    }

    addUsageLifecycleHook(onLifecycle);
    refreshEnabled();
    if (enabled) queueSync();
  } catch { /* instrumentation must never reach the UI */ }
}
