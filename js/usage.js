// usage.js — private, opt-in usage recording
//
// What this is: a tiny event log so the owner can improve the UI from his real
// habits. It is OFF unless the user flips "Record how I use the app" in Goals
// (account-level flag `usageEnabled` on the synced goals object, so it follows
// the account across devices). While off, track() is a strict no-op and food
// objects are stamped with nothing.
//
// Where the data goes: localStorage buffer per LOCAL day (`mt_usage_<date>`),
// flushed to the user's OWN Firestore at users/{uid}/usage/<date>_<deviceId>.
// No third-party analytics. Per-device doc ids mean phone and laptop never
// clobber each other.
//
// This module is a leaf (imports nothing) so every other module — api.js,
// ui.js, firebase.js — can use it without import cycles. The Firestore write is
// injected via setUsageSink().

const GOALS_KEY = 'mt_goals';
const DEVICE_KEY = 'mt_device_id';
const DAY_PREFIX = 'mt_usage_';
// NOTE: deliberately does NOT start with `mt_usage_` so day-key scans never see it.
const DIRTY_KEY = 'mt_usagesync';
const DAY_KEY_RE = /^mt_usage_(\d{4}-\d{2}-\d{2})$/;

export const MAX_EVENTS_PER_DAY = 2000;
export const FLUSH_DEBOUNCE_MS = 5000;
export const KEEP_DAYS = 14;        // local buffers older than this are pruned after a good flush
export const HARD_KEEP_DAYS = 30;   // ...and regardless of sync state once this old (quota safety)

// ── Pure helpers (exported for tests) ──

export function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 'YYYY-MM-DD' shifted by n days (local calendar arithmetic).
export function shiftDateStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return localDateStr(new Date(y, m - 1, d + n));
}

// { t, type, v, ...props }. Reserved keys in props can't override t/type/v.
export function buildEvent(type, props, v, t) {
  const { t: _t, type: _type, v: _v, ...rest } = props || {};
  return { t, type, v, ...rest };
}

export function buildUsageDocId(date, deviceId) {
  return `${date}_${deviceId}`;
}

export function buildUsageDoc(date, deviceId, events, updatedAt) {
  return { date, deviceId, events, updatedAt };
}

// Returns { events, dropped }. Never mutates the input; drops once the cap is hit.
export function appendEvent(events, event, max = MAX_EVENTS_PER_DAY) {
  const list = Array.isArray(events) ? events : [];
  if (list.length >= max) return { events: list, dropped: true };
  return { events: [...list, event], dropped: false };
}

// "meal-tracker-<sha>" -> "<sha>". Local copies keep the legacy "meal-tracker-vN"
// name (CI replaces it with the SHA), which is not a real version -> 'dev'.
// The FIRST matching key is used: during an update the old cache outlives the new
// one until activation, and the running page's code came from the old one.
export function pickVersionFromKeys(keys) {
  const key = (keys || []).find(k => typeof k === 'string' && k.startsWith('meal-tracker-'));
  if (!key) return 'dev';
  const ver = key.slice('meal-tracker-'.length);
  if (!ver || /^v\d+$/.test(ver)) return 'dev';
  return ver;
}

// Day-buffer keys that should be deleted. `dirty` days (not yet synced) are kept
// unless `ignoreDirty` (the hard cap).
export function staleDayKeys(storageKeys, today, keepDays, dirty = [], ignoreDirty = false) {
  const cutoff = shiftDateStr(today, -keepDays);
  const dirtySet = new Set(dirty);
  const stale = [];
  for (const key of storageKeys) {
    const m = DAY_KEY_RE.exec(key);
    if (!m) continue;
    if (m[1] >= cutoff) continue;
    if (!ignoreDirty && dirtySet.has(m[1])) continue;
    stale.push(key);
  }
  return stale;
}

// ── Storage helpers (never throw) ──

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // quota / private mode — recording is best-effort
  }
}

function allStorageKeys() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    return keys;
  } catch {
    return [];
  }
}

// ── Opt-in flag ──

// Account-level: lives on the synced goals object (mt_goals -> users/{uid}/data/goals),
// so it follows the account across devices exactly like the other Goals settings.
// Read straight from storage (not via store.js) to keep this module a leaf.
export function isUsageEnabled() {
  const goals = readJSON(GOALS_KEY, null);
  return !!goals && goals.usageEnabled === true;
}

// ── Device id ──

export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (id && /^[a-z0-9]{6,32}$/.test(id)) return id;
    const raw = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    id = raw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || Math.random().toString(36).slice(2, 14);
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    // Storage unavailable: a per-load id keeps things working (just not stable).
    if (!getDeviceId._fallback) getDeviceId._fallback = Math.random().toString(36).slice(2, 14);
    return getDeviceId._fallback;
  }
}

// ── App version (async, resolved once) ──
// CI renames the SW cache to meal-tracker-<git sha>; read it back from CacheStorage.

let appVersion = 'dev';
let versionReady = false;
let versionPromise = null;
const preVersionQueue = []; // events tracked before the version resolved (a few ms at startup)

export function getAppVersion() {
  return appVersion;
}

export function resolveAppVersion() {
  if (versionPromise) return versionPromise;
  if (typeof caches === 'undefined' || !caches || typeof caches.keys !== 'function') {
    versionReady = true;
    versionPromise = Promise.resolve(appVersion);
    return versionPromise;
  }
  versionPromise = caches.keys()
    .then(keys => { appVersion = pickVersionFromKeys(keys); })
    .catch(() => { /* keep 'dev' */ })
    .then(() => {
      versionReady = true;
      drainPreVersionQueue();
      return appVersion;
    });
  return versionPromise;
}

function drainPreVersionQueue() {
  const queued = preVersionQueue.splice(0);
  for (const q of queued) record(buildEvent(q.type, q.props, appVersion, q.t));
}

// ── Recording ──

let sink = null; // async (docId, data) => boolean   (injected: firebase.pushUsageDay)

export function setUsageSink(fn) {
  sink = typeof fn === 'function' ? fn : null;
}

export function getUsageEvents(date) {
  const events = readJSON(DAY_PREFIX + date, []);
  return Array.isArray(events) ? events : [];
}

function readDirty() {
  const d = readJSON(DIRTY_KEY, []);
  return Array.isArray(d) ? d : [];
}

function markDirty(date) {
  const d = readDirty();
  if (!d.includes(date)) { d.push(date); writeJSON(DIRTY_KEY, d); }
}

function clearDirty(date) {
  const d = readDirty();
  if (d.includes(date)) writeJSON(DIRTY_KEY, d.filter(x => x !== date));
}

function record(event) {
  const date = localDateStr(new Date(event.t));
  const { events, dropped } = appendEvent(getUsageEvents(date), event);
  if (dropped) return;
  if (!writeJSON(DAY_PREFIX + date, events)) return;
  markDirty(date);
  scheduleFlush();
}

// Record a usage event. A strict no-op unless the user opted in. Never throws.
export function track(type, props = {}) {
  try {
    if (!isUsageEnabled()) return;
    const t = new Date().toISOString();
    if (!versionReady) {
      preVersionQueue.push({ t, type, props });
      return;
    }
    record(buildEvent(type, props, appVersion, t));
  } catch { /* instrumentation must never reach the UI */ }
}

// ── Foods: timestamp + origin ──

// When recording is on, every add path stamps the food with addedAt (ISO) + via so
// meal timing is visible in day data. When off the food is returned untouched —
// except that stale stamps carried over from a recent/favorite are dropped, so a
// disabled add looks exactly like it did before this feature existed.
export function stampFood(food, via) {
  try {
    if (!isUsageEnabled()) return stripUsageFields(food);
    return { ...food, addedAt: new Date().toISOString(), via };
  } catch {
    return food;
  }
}

export function stripUsageFields(food) {
  if (!food || typeof food !== 'object' || (!('addedAt' in food) && !('via' in food))) return food;
  const { addedAt: _a, via: _v, ...rest } = food;
  return rest;
}

// ── Flushing ──

let flushTimer = null;
let flushing = false;
let flushAgain = false;

function scheduleFlush() {
  if (!sink || flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = null; flushUsage(); }, FLUSH_DEBOUNCE_MS);
  if (flushTimer && typeof flushTimer.unref === 'function') flushTimer.unref();
}

function pruneLocal(keepDays, ignoreDirty) {
  try {
    const stale = staleDayKeys(allStorageKeys(), localDateStr(), keepDays, readDirty(), ignoreDirty);
    if (stale.length === 0) return; // nothing to do — don't create keys for users who never opted in
    stale.forEach(k => localStorage.removeItem(k));
    if (ignoreDirty) {
      // Forget dirty markers for days we just discarded.
      const dirty = readDirty().filter(d => localStorage.getItem(DAY_PREFIX + d) !== null);
      writeJSON(DIRTY_KEY, dirty);
    }
  } catch { /* ignore */ }
}

// Push every not-yet-synced day buffer to Firestore. Safe to call any time:
// signed out -> the sink returns false and the days stay buffered.
export async function flushUsage() {
  if (!sink) return false;
  if (flushing) { flushAgain = true; return false; }
  flushing = true;
  let okAny = false;
  try {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    const deviceId = getDeviceId();
    for (const date of readDirty()) {
      const events = getUsageEvents(date);
      if (events.length === 0) { clearDirty(date); continue; }
      const ok = await sink(
        buildUsageDocId(date, deviceId),
        buildUsageDoc(date, deviceId, events, new Date().toISOString()),
      );
      if (!ok) break; // signed out / offline — try again later
      okAny = true;
      // Events may have landed while the write was in flight: keep the day dirty then.
      if (getUsageEvents(date).length === events.length) clearDirty(date);
      else flushAgain = true;
    }
    if (okAny) pruneLocal(KEEP_DAYS, false);
  } catch { /* never throw */ } finally {
    flushing = false;
    if (flushAgain) { flushAgain = false; scheduleFlush(); }
  }
  return okAny;
}

// ── Session tracking + lifecycle ──

let openedAt = null;
let initialized = false;

// Lifecycle hooks: other leaf-ish modules (gestures.js) mirror the session
// lifecycle without usage.js importing them. fn(ev) with ev one of
// 'show' | 'hide' | 'enable' | 'disable'. Each hook is isolated in try/catch.
const lifecycleHooks = [];

export function addUsageLifecycleHook(fn) {
  if (typeof fn === 'function' && !lifecycleHooks.includes(fn)) lifecycleHooks.push(fn);
}

function fireHooks(ev) {
  for (const fn of lifecycleHooks.slice()) {
    try { fn(ev); } catch { /* instrumentation must never reach the UI */ }
  }
}

// Called by the Goals toggle BEFORE it saves usageEnabled=false, so hooks can
// still record what was gathered while recording was on (track() is a no-op once
// the flag is off).
export function prepareUsageDisable() {
  fireHooks('disable');
}

function onVisible() {
  openedAt = Date.now();
  track('session', { ev: 'open' });
  fireHooks('show');
}

function onHidden() {
  fireHooks('hide');
  if (openedAt != null) {
    const ms = Date.now() - openedAt;
    openedAt = null;
    track('session', { ev: 'hide', ms });
  }
  flushUsage();
}

// Called once at startup (app.js). Safe to call when recording is off: every
// track() inside is a no-op, and flushUsage() only does work if days are pending.
export function initUsage() {
  if (initialized) return;
  initialized = true;
  resolveAppVersion();
  pruneLocal(HARD_KEEP_DAYS, true);
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onHidden(); else onVisible();
    });
    window.addEventListener('pagehide', onHidden);
    if (document.visibilityState !== 'hidden') onVisible();
  } catch { /* non-browser environment */ }
}

// The Goals toggle calls this after saving the flag. Turning on starts a session
// clock right away; turning off flushes what was already recorded.
export function onUsageEnabledChanged(on) {
  try {
    if (on) {
      openedAt = Date.now();
      track('session', { ev: 'open' });
      fireHooks('enable');
    } else {
      fireHooks('disable'); // no-op if prepareUsageDisable() already ran
      flushUsage();
    }
  } catch { /* ignore */ }
}

// Start resolving the version as soon as the module loads (errors can precede initUsage).
resolveAppVersion();
