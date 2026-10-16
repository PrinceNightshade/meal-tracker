// tests/usage.test.js — opt-in usage recording (js/usage.js)
import { test, describe, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { resetStorage } from './setup.js';
import * as store from '../js/store.js';
import * as usage from '../js/usage.js';

const today = () => usage.localDateStr();
const enable = () => store.saveGoals({ ...store.DEFAULT_GOALS, usageEnabled: true });
const keys = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
const dayKeys = () => keys().filter(k => /^mt_usage_\d{4}-\d{2}-\d{2}$/.test(k));

beforeEach(() => resetStorage());

describe('opt-in flag', () => {
  test('defaults to off and DEFAULT_GOALS carries usageEnabled:false', () => {
    assert.equal(usage.isUsageEnabled(), false);
    assert.equal(store.DEFAULT_GOALS.usageEnabled, false);
  });

  test('rides on the synced goals object', () => {
    enable();
    assert.equal(usage.isUsageEnabled(), true);
    store.saveGoals({ ...store.getGoals(), usageEnabled: false });
    assert.equal(usage.isUsageEnabled(), false);
  });

  test('goals saved without the flag (older accounts) read as off', () => {
    store.saveGoals({ calories: 2000, protein: 150, carbs: 200, fat: 65 });
    assert.equal(usage.isUsageEnabled(), false);
  });
});

describe('disabled', () => {
  test('track() records nothing', () => {
    usage.track('tab', { to: 'goals' });
    usage.track('session', { ev: 'open' });
    assert.deepEqual(dayKeys(), []);
    assert.equal(localStorage.getItem('mt_usagesync'), null);
  });

  test('stampFood leaves the food exactly as it was (same object)', () => {
    const food = { name: 'Egg', calories: 70, servings: 2 };
    const out = usage.stampFood(food, 'search');
    assert.equal(out, food);
    assert.equal('addedAt' in out, false);
    assert.equal('via' in out, false);
  });

  test('stampFood drops stale stamps carried over from a recent when disabled', () => {
    const out = usage.stampFood({ name: 'Egg', addedAt: '2026-01-01T00:00:00Z', via: 'search' }, 'recent');
    assert.deepEqual(out, { name: 'Egg' });
  });
});

describe('enabled', () => {
  test('event shape: t (ISO), type, v, plus props', () => {
    enable();
    usage.track('tab', { to: 'weight' });
    const events = usage.getUsageEvents(today());
    assert.equal(events.length, 1);
    const e = events[0];
    assert.equal(e.type, 'tab');
    assert.equal(e.to, 'weight');
    assert.equal(typeof e.v, 'string');
    assert.ok(e.v.length > 0);
    assert.equal(new Date(e.t).toISOString(), e.t);
  });

  test('buffers per LOCAL date in mt_usage_<date>', () => {
    enable();
    usage.track('a');
    usage.track('b');
    assert.deepEqual(dayKeys(), [`mt_usage_${today()}`]);
    assert.deepEqual(usage.getUsageEvents(today()).map(e => e.type), ['a', 'b']);
    assert.deepEqual(JSON.parse(localStorage.getItem('mt_usagesync')), [today()]);
  });

  test('buildEvent keeps reserved keys from being overridden by props', () => {
    const e = usage.buildEvent('x', { type: 'evil', t: 'no', v: 'no', ok: 1 }, '1.0', '2026-10-16T00:00:00.000Z');
    assert.deepEqual(e, { t: '2026-10-16T00:00:00.000Z', type: 'x', v: '1.0', ok: 1 });
  });

  test('stampFood adds addedAt (ISO) and via, without mutating the input', () => {
    enable();
    const food = { name: 'Egg', calories: 70, servings: 1 };
    const out = usage.stampFood(food, 'recent');
    assert.equal(out.via, 'recent');
    assert.equal(new Date(out.addedAt).toISOString(), out.addedAt);
    assert.equal(out.calories, 70);
    assert.equal('addedAt' in food, false);
  });

  test('stamped foods leave day totals unchanged', () => {
    enable();
    const plain = { name: 'Egg', calories: 70, protein: 6, carbs: 0, fat: 5, servings: 2 };
    store.addFoodToMeal('2026-10-10', 'breakfast', plain);
    store.addFoodToMeal('2026-10-11', 'breakfast', usage.stampFood(plain, 'search'));
    const a = store.getDayTotals('2026-10-10');
    const b = store.getDayTotals('2026-10-11');
    assert.deepEqual(a, b);
    const stored = store.getDay('2026-10-11').meals.breakfast[0];
    assert.equal(stored.via, 'search');
    assert.ok(stored.addedAt);
  });

  test('stripUsageFields removes only addedAt/via', () => {
    assert.deepEqual(usage.stripUsageFields({ name: 'a', addedAt: 'x', via: 'y', calories: 1 }), { name: 'a', calories: 1 });
  });
});

describe('daily cap', () => {
  test('appendEvent drops past the cap and never mutates', () => {
    const full = Array.from({ length: usage.MAX_EVENTS_PER_DAY }, (_, i) => ({ i }));
    const r = usage.appendEvent(full, { i: 'extra' });
    assert.equal(r.dropped, true);
    assert.equal(r.events.length, usage.MAX_EVENTS_PER_DAY);
    const r2 = usage.appendEvent(full.slice(0, 5), { i: 'new' });
    assert.equal(r2.dropped, false);
    assert.equal(r2.events.length, 6);
  });

  test('track() stops storing at 2000 events/day', () => {
    enable();
    const seed = Array.from({ length: 1999 }, (_, i) => ({ t: 'x', type: 'seed', v: 'dev', i }));
    localStorage.setItem(`mt_usage_${today()}`, JSON.stringify(seed));
    usage.track('one-more');
    usage.track('dropped');
    usage.track('dropped-too');
    const events = usage.getUsageEvents(today());
    assert.equal(events.length, 2000);
    assert.equal(events[1999].type, 'one-more');
  });
});

describe('device id + doc id', () => {
  test('device id is created once and stable', () => {
    const a = usage.getDeviceId();
    const b = usage.getDeviceId();
    assert.equal(a, b);
    assert.match(a, /^[a-z0-9]{6,32}$/);
    assert.equal(localStorage.getItem('mt_device_id'), a);
  });

  test('doc id is <date>_<deviceId>', () => {
    assert.equal(usage.buildUsageDocId('2026-10-16', 'abc123def456'), '2026-10-16_abc123def456');
    const doc = usage.buildUsageDoc('2026-10-16', 'dev1', [{ t: 1 }], 'now');
    assert.deepEqual(doc, { date: '2026-10-16', deviceId: 'dev1', events: [{ t: 1 }], updatedAt: 'now' });
  });
});

describe('app version', () => {
  test('uses the meal-tracker-<sha> cache key; legacy vN and none -> dev', () => {
    assert.equal(usage.pickVersionFromKeys(['other', 'meal-tracker-a1b2c3d']), 'a1b2c3d');
    assert.equal(usage.pickVersionFromKeys(['meal-tracker-v62']), 'dev');
    assert.equal(usage.pickVersionFromKeys([]), 'dev');
    assert.equal(usage.pickVersionFromKeys(undefined), 'dev');
  });
});

describe('flush + prune', () => {
  test('flushUsage pushes dirty days via the sink, then clears dirty; signed-out keeps them', async () => {
    enable();
    usage.track('a');
    const calls = [];
    let signedIn = false;
    usage.setUsageSink(async (id, data) => { calls.push({ id, data }); return signedIn; });
    assert.equal(await usage.flushUsage(), false);
    assert.deepEqual(JSON.parse(localStorage.getItem('mt_usagesync')), [today()]); // still pending
    signedIn = true;
    assert.equal(await usage.flushUsage(), true);
    const last = calls[calls.length - 1];
    assert.equal(last.id, `${today()}_${usage.getDeviceId()}`);
    assert.equal(last.data.date, today());
    assert.equal(last.data.deviceId, usage.getDeviceId());
    assert.equal(last.data.events.length, 1);
    assert.ok(last.data.updatedAt);
    assert.deepEqual(JSON.parse(localStorage.getItem('mt_usagesync')), []);
    usage.setUsageSink(null);
  });

  test('after a good flush, buffers older than 14 days are pruned (recent kept)', async () => {
    enable();
    const old = usage.shiftDateStr(today(), -20);
    const recent = usage.shiftDateStr(today(), -3);
    localStorage.setItem(`mt_usage_${old}`, JSON.stringify([{ t: 'x', type: 'old' }]));
    localStorage.setItem(`mt_usage_${recent}`, JSON.stringify([{ t: 'x', type: 'recent' }]));
    usage.track('now');
    usage.setUsageSink(async () => true);
    await usage.flushUsage();
    assert.equal(localStorage.getItem(`mt_usage_${old}`), null);
    assert.ok(localStorage.getItem(`mt_usage_${recent}`));
    assert.ok(localStorage.getItem(`mt_usage_${today()}`));
    usage.setUsageSink(null);
  });

  test('staleDayKeys keeps unsynced days unless the hard cap applies', () => {
    const t = '2026-10-16';
    const ks = ['mt_usage_2026-09-01', 'mt_usage_2026-10-15', 'mt_goals', 'mt_usagesync'];
    assert.deepEqual(usage.staleDayKeys(ks, t, 14, ['2026-09-01']), []);
    assert.deepEqual(usage.staleDayKeys(ks, t, 14, ['2026-09-01'], true), ['mt_usage_2026-09-01']);
    assert.deepEqual(usage.staleDayKeys(ks, t, 14, []), ['mt_usage_2026-09-01']);
  });

  test('shiftDateStr does calendar arithmetic across month ends', () => {
    assert.equal(usage.shiftDateStr('2026-03-01', -1), '2026-02-28');
    assert.equal(usage.shiftDateStr('2026-12-31', 1), '2027-01-01');
  });
});
