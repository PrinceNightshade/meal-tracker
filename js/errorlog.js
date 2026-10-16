// errorlog.js — always-on, personal-data-free error log
//
// Unlike usage recording this is NOT opt-in: it exists so silent failures (e.g. a
// third-party API being down) become visible. To keep that safe it records only
// technical facts: message, source file:line:col, a short scrubbed stack, an
// optional fixed context label, and a count. Never food names, weights, goals or
// any other user data — callers pass a constant `context`, never user input, and
// every string is scrubbed of query strings / emails and length-capped.
//
// Storage: ring buffer of 50 in localStorage `mt_errors`. Sync: users/{uid}/errors/<deviceId>
// as { items, updatedAt }, debounced, buffered while signed out. The Firestore
// write is injected via setErrorSink().

import { getDeviceId, getAppVersion } from './usage.js';

const KEY = 'mt_errors';
const DIRTY_KEY = 'mt_errors_dirty';
export const MAX_ERRORS = 50;
export const MAX_MSG = 300;
export const MAX_STACK = 600;
export const STACK_LINES = 5;
export const SYNC_DEBOUNCE_MS = 5000;

// ── Pure helpers (exported for tests) ──

// Strip anything that could carry user data out of an error string: URL query
// strings / hashes (search terms live there), and email addresses.
export function scrubText(text) {
  return String(text ?? '')
    .replace(/(https?:\/\/[^\s)'"?#]*)[?#][^\s)'"]*/g, '$1')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]');
}

function basename(url) {
  const clean = String(url || '').split(/[?#]/)[0];
  return clean.split('/').filter(Boolean).pop() || '';
}

// "file.js:line:col" from window.onerror args.
export function buildSrc(filename, line, col) {
  const file = basename(filename);
  if (!file) return undefined;
  return line ? `${file}:${line}${col ? ':' + col : ''}` : file;
}

// First stack frame -> "file.js:line:col". Handles Chrome ("at fn (url:1:2)") and
// Safari/Firefox ("fn@url:1:2") formats.
export function parseStackSrc(stack) {
  if (typeof stack !== 'string') return undefined;
  const m = stack.match(/(https?:\/\/[^\s)]+?|[\w./-]+\.js):(\d+):(\d+)/);
  if (!m) return undefined;
  return buildSrc(m[1], m[2], m[3]);
}

// First ~5 lines, URLs collapsed to basename:line:col, scrubbed, capped.
export function cleanStack(stack) {
  if (typeof stack !== 'string' || !stack) return undefined;
  const lines = stack.split('\n').slice(0, STACK_LINES).map(line =>
    scrubText(line)
      .replace(/https?:\/\/[^\s)]*\/([^/\s):]+):(\d+):(\d+)/g, '$1:$2:$3')
      .trim()
  );
  return lines.join('\n').slice(0, MAX_STACK);
}

export function buildErrorEntry({ msg, src, stack, context }, { v = 'dev', t = new Date().toISOString() } = {}) {
  const entry = { t, v, msg: scrubText(msg || 'Unknown error').slice(0, MAX_MSG) };
  if (src) entry.src = String(src).slice(0, 80);
  const st = cleanStack(stack);
  if (st) entry.stack = st;
  if (context) entry.context = String(context).slice(0, 60);
  entry.count = 1;
  return entry;
}

export function errorKey(entry) {
  return `${entry.msg}|${entry.src || ''}|${entry.context || ''}`;
}

// Merge a new entry into the list. Same msg+src(+context) -> bump count and `t`
// and move it to the newest slot; otherwise append. Oldest entries fall off past
// `max`. Returns a new array.
export function mergeError(items, entry, max = MAX_ERRORS) {
  const list = Array.isArray(items) ? [...items] : [];
  const key = errorKey(entry);
  const i = list.findIndex(e => errorKey(e) === key);
  if (i !== -1) {
    const [existing] = list.splice(i, 1);
    list.push({ ...existing, t: entry.t, v: entry.v, count: (existing.count || 1) + 1 });
  } else {
    list.push(entry);
  }
  return list.length > max ? list.slice(list.length - max) : list;
}

// ── Storage ──

export function getErrors() {
  try {
    const raw = localStorage.getItem(KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

let sink = null; // async (deviceId, { items, updatedAt }) => boolean   (injected: firebase.pushErrors)

export function setErrorSink(fn) {
  sink = typeof fn === 'function' ? fn : null;
}

let syncTimer = null;
let syncing = false;
let syncAgain = false;

function scheduleSync() {
  if (!sink || syncTimer) return;
  syncTimer = setTimeout(() => { syncTimer = null; flushErrors(); }, SYNC_DEBOUNCE_MS);
  if (syncTimer && typeof syncTimer.unref === 'function') syncTimer.unref();
}

function addError(fields) {
  const entry = buildErrorEntry(fields, { v: getAppVersion() });
  const items = mergeError(getErrors(), entry);
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    localStorage.setItem(DIRTY_KEY, '1');
  } catch { /* quota — drop silently, a logger must not throw */ }
  scheduleSync();
}

// Push the ring buffer to Firestore. Signed out / offline -> sink returns false
// and the buffer stays dirty for next time.
export async function flushErrors() {
  if (!sink) return false;
  if (syncing) { syncAgain = true; return false; }
  syncing = true;
  let ok = false;
  try {
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
    if (localStorage.getItem(DIRTY_KEY) !== '1') return false;
    const items = getErrors();
    if (items.length === 0) { localStorage.removeItem(DIRTY_KEY); return false; }
    ok = await sink(getDeviceId(), { items, updatedAt: new Date().toISOString() });
    if (ok) {
      // Another error may have landed mid-write; if the buffer changed, stay dirty.
      const same = JSON.stringify(getErrors()) === JSON.stringify(items);
      if (same) localStorage.removeItem(DIRTY_KEY); else syncAgain = true;
    }
  } catch { /* never throw */ } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; scheduleSync(); }
  }
  return ok;
}

// ── Public API ──

// Explicit logging. `context` MUST be a fixed label ('push profile', 'off-search'),
// never anything derived from user input.
export function logError(context, err) {
  try {
    const isObj = err !== null && typeof err === 'object';
    let msg;
    if (isObj) {
      msg = err.message || err.name || 'Unknown error';
      if (err.code && !String(msg).includes(String(err.code))) msg = `${err.code}: ${msg}`;
    } else {
      msg = err == null ? 'Unknown error' : String(err);
    }
    const stack = isObj && typeof err.stack === 'string' ? err.stack : undefined;
    addError({ msg, src: parseStackSrc(stack), stack, context });
  } catch { /* a logger must never throw */ }
}

let initialized = false;

// Global handlers. Called once at startup regardless of the usage opt-in.
export function initErrorLog() {
  if (initialized) return;
  initialized = true;
  try {
    window.addEventListener('error', (ev) => {
      // Resource-load errors (img/script) bubble here too with no message — skip them.
      if (!ev || (!ev.error && !ev.message)) return;
      try {
        const err = ev.error;
        const stack = err && typeof err.stack === 'string' ? err.stack : undefined;
        addError({
          msg: (err && err.message) || ev.message,
          src: buildSrc(ev.filename, ev.lineno, ev.colno) || parseStackSrc(stack),
          stack,
        });
      } catch { /* ignore */ }
    });
    window.addEventListener('unhandledrejection', (ev) => {
      try {
        const r = ev && ev.reason;
        const isObj = r !== null && typeof r === 'object';
        const stack = isObj && typeof r.stack === 'string' ? r.stack : undefined;
        const msg = isObj
          ? (r.message || r.name || 'Unhandled rejection (non-Error)')
          : (r == null ? 'Unhandled rejection' : String(r));
        addError({ msg, src: parseStackSrc(stack), stack, context: 'unhandledrejection' });
      } catch { /* ignore */ }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushErrors();
    });
    window.addEventListener('pagehide', () => flushErrors());
  } catch { /* non-browser environment */ }
}
