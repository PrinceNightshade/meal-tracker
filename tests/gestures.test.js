// tests/gestures.test.js — opt-in gesture signals (js/gestures.js)
// The logic is pure/exported, so none of this needs a real DOM.
import { test, describe, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { resetStorage } from './setup.js';
import * as store from '../js/store.js';
import * as usage from '../js/usage.js';
import * as g from '../js/gestures.js';

const today = () => usage.localDateStr();
const enable = () => store.saveGoals({ ...store.DEFAULT_GOALS, usageEnabled: true });
const gestureEvents = () => usage.getUsageEvents(today()).filter(e => e.type === 'gestures');

beforeEach(() => {
  resetStorage();
  // module-level accumulators persist across tests: drain them
  g.emitGesturesSummary(0);
});

describe('classifyDrag (dead scroll)', () => {
  const at = (before, max, after = before) => ({ before, after, max });

  test('vertical drag, scroll unchanged at the top -> top', () => {
    assert.deepEqual(g.classifyDrag({ dx: 4, dy: 80, scrollers: [at(0, 600)] }), { edge: 'top' });
  });

  test('vertical drag, scroll unchanged at the bottom -> bottom', () => {
    assert.deepEqual(g.classifyDrag({ dx: -3, dy: -90, scrollers: [at(600, 600)] }), { edge: 'bottom' });
  });

  test('non-scrollable (nothing to scroll, or no containers) -> none', () => {
    assert.deepEqual(g.classifyDrag({ dx: 0, dy: 60, scrollers: [at(0, 0)] }), { edge: 'none' });
    assert.deepEqual(g.classifyDrag({ dx: 0, dy: 60, scrollers: [] }), { edge: 'none' });
  });

  test('scroll position changed -> not dead', () => {
    assert.equal(g.classifyDrag({ dx: 0, dy: -80, scrollers: [at(0, 600, 120)] }), null);
  });

  test('any container that moved (scroll chaining) -> not dead', () => {
    const inner = at(0, 200);          // sheet stayed put...
    const outer = at(0, 900, 40);      // ...but the page behind it moved
    assert.equal(g.classifyDrag({ dx: 0, dy: -80, scrollers: [inner, outer] }), null);
  });

  test('horizontal-dominant drag is ignored (carousel swipe)', () => {
    assert.equal(g.classifyDrag({ dx: 120, dy: 40, scrollers: [at(0, 600)] }), null);
    assert.equal(g.classifyDrag({ dx: 50, dy: 50, scrollers: [at(0, 600)] }), null); // not vertical-dominant
  });

  test('drags under 30px are ignored', () => {
    assert.equal(g.classifyDrag({ dx: 0, dy: 29, scrollers: [at(0, 600)] }), null);
    assert.deepEqual(g.classifyDrag({ dx: 0, dy: 30, scrollers: [at(0, 600)] }), { edge: 'top' });
  });

  test('iOS rubber-banding (out-of-range offsets) still counts as unchanged', () => {
    assert.deepEqual(g.classifyDrag({ dx: 0, dy: 70, scrollers: [{ before: 0, after: -42, max: 600 }] }), { edge: 'top' });
    assert.deepEqual(g.classifyDrag({ dx: 0, dy: -70, scrollers: [{ before: 600, after: 640, max: 600 }] }), { edge: 'bottom' });
  });

  test('mid-page with nothing moving, or dragging the "wrong" way at an edge -> none', () => {
    assert.deepEqual(g.classifyDrag({ dx: 0, dy: 80, scrollers: [at(300, 600)] }), { edge: 'none' });
    assert.deepEqual(g.classifyDrag({ dx: 0, dy: -80, scrollers: [at(0, 600)] }), { edge: 'none' });
  });

  test('innermost scrollable container decides the edge', () => {
    const sheet = at(0, 300);   // sheet at its top
    const page = at(500, 500);  // page (behind) at its bottom
    assert.deepEqual(g.classifyDrag({ dx: 0, dy: 80, scrollers: [sheet, page] }), { edge: 'top' });
  });
});

describe('interactive detection', () => {
  const node = (o = {}) => ({ tag: 'div', ...o });

  test('interactive tags anywhere up the chain', () => {
    for (const tag of ['a', 'button', 'input', 'select', 'textarea', 'label', 'summary']) {
      assert.equal(g.isInteractiveChain([node({ tag: 'span' }), node({ tag }), node({ tag: 'body' })]), true, tag);
    }
    assert.equal(g.isInteractiveChain([node({ tag: 'BUTTON' })]), true);
  });

  test('interactive roles', () => {
    for (const role of ['button', 'tab', 'switch', 'checkbox', 'link']) {
      assert.equal(g.isInteractiveChain([node({ role })]), true, role);
    }
    assert.equal(g.isInteractiveChain([node({ role: 'presentation' })]), false);
  });

  test('data-tappable on target or an ancestor', () => {
    assert.equal(g.isInteractiveChain([node(), node({ tappable: true })]), true);
    assert.equal(g.isInteractiveChain([node({ tappable: true })]), true);
  });

  test('cursor:pointer alone is NOT interactive (no cursor on phones → a dead tap worth recording)', () => {
    assert.equal(g.isInteractiveChain([node({ cursor: 'pointer' })]), false);
    assert.equal(g.isInteractiveChain([node({ cursor: 'pointer', tappable: true })]), true);
  });

  test('plain non-interactive chain -> false', () => {
    assert.equal(g.isInteractiveChain([node({ tag: 'span' }), node(), node({ tag: 'body' })]), false);
    assert.equal(g.isInteractiveChain([]), false);
  });

  test('text-entry tags', () => {
    assert.equal(g.isTextEntryTag('INPUT'), true);
    assert.equal(g.isTextEntryTag('textarea'), true);
    assert.equal(g.isTextEntryTag('div', true), true); // contenteditable
    assert.equal(g.isTextEntryTag('div'), false);
  });
});

describe('describeEl (dead-tap element id)', () => {
  test('nearest data-usage-el wins, even from an ancestor', () => {
    const chain = [
      { tag: 'span', classes: 'macro-card__label' },
      { tag: 'div', classes: 'macro-card', usageEl: 'macro-card-protein' },
      { tag: 'div', classes: 'macro-row', usageEl: 'outer' },
    ];
    assert.equal(g.describeEl(chain), 'macro-card-protein');
  });

  test('falls back to tag.firstClass of the target', () => {
    assert.equal(g.describeEl([{ tag: 'DIV', classes: 'meal-title meal-title--big' }, { tag: 'div', classes: 'meal-header' }]), 'div.meal-title');
  });

  test('no class -> just the tag; never text', () => {
    const chain = [{ tag: 'span', classes: '', textContent: 'Chicken breast 320 cal' }];
    const id = g.describeEl(chain);
    assert.equal(id, 'span');
    assert.ok(!/chicken|320/i.test(id));
    assert.equal(g.describeEl([]), 'unknown');
  });
});

describe('dwell tracker', () => {
  test('accumulates dwell, settles and returns across settles and a view switch', () => {
    const t = g.createDwellTracker();
    t.enter('daily', 'ring', 0);
    t.enter('daily', 'meal-breakfast', 1000);   // ring: 1000ms
    t.enter('daily', 'ring', 3000);             // breakfast: 2000ms, ring returned (1)
    t.enter('goals', 'goals-profile', 4000);    // view switch: ring +1000 -> 2000
    t.enter('daily', 'ring', 9000);             // goals-profile: 5000ms, ring returned (2)
    const snap = t.snapshot(10000);             // ring +1000 in progress
    assert.deepEqual(snap.daily.dwellMs, { ring: 3000, 'meal-breakfast': 2000 });
    assert.deepEqual(snap.daily.settles, { ring: 3, 'meal-breakfast': 1 });
    assert.deepEqual(snap.daily.returns, { ring: 2 });
    assert.deepEqual(snap.goals.dwellMs, { 'goals-profile': 5000 });
    assert.deepEqual(snap.goals.settles, { 'goals-profile': 1 });
    assert.deepEqual(snap.goals.returns, {});
  });

  test('entering the section you are already on is a no-op', () => {
    const t = g.createDwellTracker();
    assert.equal(t.enter('daily', 'ring', 0), true);
    assert.equal(t.enter('daily', 'ring', 500), false);
    assert.deepEqual(t.snapshot(800).daily.settles, { ring: 1 });
    assert.deepEqual(t.snapshot(800).daily.dwellMs, { ring: 800 });
  });

  test('pause stops the clock; resume continues uncounted', () => {
    const t = g.createDwellTracker();
    t.enter('daily', 'ring', 0);
    t.pause(1000);                              // backgrounded
    t.resume('daily', 'ring', 60000);           // a minute later
    const snap = t.snapshot(61000);
    assert.equal(snap.daily.dwellMs.ring, 2000);
    assert.deepEqual(snap.daily.settles, { ring: 1 });
    assert.deepEqual(snap.daily.returns, {});
  });

  test('sheet round-trip: resume the covered section without a return', () => {
    const t = g.createDwellTracker();
    t.enter('daily', 'meal-lunch', 0);
    t.enter('add-sheet', 'add-search', 1000);   // sheet opens (daily stint closes)
    assert.equal(t.lastSection('daily'), 'meal-lunch');
    t.resume('daily', t.lastSection('daily'), 5000);
    const snap = t.snapshot(6000);
    assert.deepEqual(snap.daily.returns, {});
    assert.deepEqual(snap.daily.dwellMs, { 'meal-lunch': 2000 });
    assert.deepEqual(snap['add-sheet'].dwellMs, { 'add-search': 4000 });
  });

  test('reset clears counts but keeps a live stint running', () => {
    const t = g.createDwellTracker();
    t.enter('daily', 'ring', 0);
    t.reset(1000);
    assert.deepEqual(t.snapshot(1000), {});
    t.enter('daily', 'macro-cards', 2000);
    t.enter('daily', 'ring', 3000);
    assert.deepEqual(t.snapshot(3000).daily.returns, { ring: 1 }); // the stint that survived the reset counts as visited
  });
});

describe('summary', () => {
  test('empty -> null', () => {
    assert.equal(g.buildSummary({}, new Map(), new Map()), null);
    assert.equal(g.buildSummary(undefined, undefined, undefined), null);
  });

  test('shape + sorting by n desc', () => {
    const scrolls = new Map();
    const taps = new Map();
    g.bumpCount(scrolls, 'a', { surface: 'daily', section: 'ring', edge: 'top' });
    for (let i = 0; i < 3; i++) g.bumpCount(scrolls, 'b', { surface: 'goals', section: 'goals-profile', edge: 'bottom' });
    g.bumpCount(taps, 'x', { surface: 'daily', section: 'ring', el: 'calorie-ring' });
    g.bumpCount(taps, 'x', { surface: 'daily', section: 'ring', el: 'calorie-ring' });
    const s = g.buildSummary({ daily: { dwellMs: { ring: 100 }, settles: { ring: 1 }, returns: {} } }, scrolls, taps);
    assert.deepEqual(s.deadScrolls.map(d => d.n), [3, 1]);
    assert.deepEqual(s.deadScrolls[0], { surface: 'goals', section: 'goals-profile', edge: 'bottom', n: 3 });
    assert.deepEqual(s.deadTaps, [{ surface: 'daily', section: 'ring', el: 'calorie-ring', n: 2 }]);
    assert.deepEqual(Object.keys(s), ['surfaces', 'deadScrolls', 'deadTaps']);
  });

  test('lists are capped at 20 entries', () => {
    const taps = new Map();
    for (let i = 0; i < 35; i++) {
      for (let k = 0; k <= i; k++) g.bumpCount(taps, `k${i}`, { surface: 'daily', section: 'ring', el: `e${i}` });
    }
    const s = g.buildSummary({}, new Map(), taps);
    assert.equal(s.deadTaps.length, 20);
    assert.equal(s.deadTaps[0].n, 35);       // most frequent first
    assert.equal(s.deadTaps[19].n, 16);      // 35..16 kept, the rest dropped
  });

  test('distinct keys are bounded in memory', () => {
    const m = new Map();
    for (let i = 0; i < g.MAX_DISTINCT + 50; i++) g.bumpCount(m, `k${i}`, { el: `e${i}` });
    assert.equal(m.size, g.MAX_DISTINCT);
    g.bumpCount(m, 'k0', { el: 'e0' });       // existing keys still count
    assert.equal(m.get('k0').n, 2);
  });
});

describe('emission gating', () => {
  test('recording off -> no gestures event, accumulators dropped', () => {
    g.recordDeadTap('daily', 'ring', 'calorie-ring');
    g.getTracker().enter('daily', 'ring', 0);
    assert.equal(g.emitGesturesSummary(1000), null);
    assert.equal(gestureEvents().length, 0);
    enable();
    assert.equal(g.emitGesturesSummary(2000), null); // nothing left over from the disabled period
    assert.equal(gestureEvents().length, 0);
  });

  test('recording on + empty -> nothing emitted', () => {
    enable();
    assert.equal(g.emitGesturesSummary(1000), null);
    assert.equal(gestureEvents().length, 0);
  });

  test('recording on -> exactly one gestures event, then the accumulators reset', () => {
    enable();
    const tr = g.getTracker();
    tr.enter('daily', 'ring', 0);
    tr.enter('daily', 'macro-cards', 2000);
    g.recordDeadTap('daily', 'ring', 'calorie-ring');
    g.recordDeadTap('daily', 'ring', 'calorie-ring');
    g.recordDeadScroll('daily', 'ring', 'top');
    const summary = g.emitGesturesSummary(5000);
    assert.ok(summary);
    const evs = gestureEvents();
    assert.equal(evs.length, 1);
    assert.equal(evs[0].type, 'gestures');
    assert.deepEqual(evs[0].surfaces.daily.dwellMs, { ring: 2000, 'macro-cards': 3000 });
    assert.deepEqual(evs[0].deadTaps, [{ surface: 'daily', section: 'ring', el: 'calorie-ring', n: 2 }]);
    assert.deepEqual(evs[0].deadScrolls, [{ surface: 'daily', section: 'ring', edge: 'top', n: 1 }]);
    assert.equal(g.emitGesturesSummary(6000), null); // reset: second emit is empty
    assert.equal(gestureEvents().length, 1);
  });
});

describe('usage lifecycle hooks', () => {
  test('hide / enable / disable hooks fire and a throwing hook is isolated', () => {
    const seen = [];
    usage.addUsageLifecycleHook(() => { throw new Error('boom'); });
    usage.addUsageLifecycleHook(ev => seen.push(ev));
    usage.prepareUsageDisable();
    usage.onUsageEnabledChanged(true);
    usage.onUsageEnabledChanged(false);
    assert.deepEqual(seen, ['disable', 'enable', 'disable']);
  });
});
