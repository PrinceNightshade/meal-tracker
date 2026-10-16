// tests/errorlog.test.js — always-on error log (js/errorlog.js)
import { test, describe, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { resetStorage } from './setup.js';
import * as errorlog from '../js/errorlog.js';

beforeEach(() => resetStorage());

describe('logError', () => {
  test('entry shape: t, v, msg, src, stack, context, count', () => {
    const err = new Error('Failed to fetch');
    err.stack = 'TypeError: Failed to fetch\n    at searchOpenFoodFacts (https://example.github.io/meal-tracker/js/api.js:322:17)\n    at async doSearch (https://example.github.io/meal-tracker/js/app.js:1100:9)';
    errorlog.logError('off-search', err);
    const items = errorlog.getErrors();
    assert.equal(items.length, 1);
    const e = items[0];
    assert.equal(e.msg, 'Failed to fetch');
    assert.equal(e.src, 'api.js:322:17');
    assert.equal(e.context, 'off-search');
    assert.equal(e.count, 1);
    assert.equal(typeof e.v, 'string');
    assert.equal(new Date(e.t).toISOString(), e.t);
    assert.ok(e.stack.startsWith('TypeError: Failed to fetch'));
    assert.ok(e.stack.includes('api.js:322:17'));
    assert.ok(!e.stack.includes('https://'));
  });

  test('also parses Safari-style frames', () => {
    assert.equal(errorlog.parseStackSrc('searchOff@https://x.io/meal-tracker/js/api.js:10:5\nrun@https://x.io/js/app.js:1:1'), 'api.js:10:5');
  });

  test('same msg+src increments count and updates t instead of adding an entry', () => {
    const mk = () => { const e = new Error('boom'); e.stack = 'Error: boom\n    at f (https://x.io/js/api.js:5:6)'; return e; };
    errorlog.logError('ctx', mk());
    const first = errorlog.getErrors()[0].t;
    errorlog.logError('ctx', mk());
    errorlog.logError('ctx', mk());
    const items = errorlog.getErrors();
    assert.equal(items.length, 1);
    assert.equal(items[0].count, 3);
    assert.ok(items[0].t >= first);
  });

  test('different messages stay separate', () => {
    errorlog.logError('a', new Error('one'));
    errorlog.logError('a', new Error('two'));
    assert.equal(errorlog.getErrors().length, 2);
  });

  test('non-Error values are handled', () => {
    errorlog.logError('weird', 'just a string');
    errorlog.logError('weird', null);
    errorlog.logError('weird', { code: 'permission-denied', message: 'Missing or insufficient permissions.' });
    const msgs = errorlog.getErrors().map(e => e.msg);
    assert.deepEqual(msgs, ['just a string', 'Unknown error', 'permission-denied: Missing or insufficient permissions.']);
  });

  test('msg capped at 300 chars, stack at 600 chars / 5 lines', () => {
    const err = new Error('x'.repeat(1000));
    err.stack = Array.from({ length: 20 }, (_, i) => `    at fn${i} (https://x.io/js/app.js:${i}:1) ${'y'.repeat(200)}`).join('\n');
    errorlog.logError('big', err);
    const e = errorlog.getErrors()[0];
    assert.equal(e.msg.length, 300);
    assert.ok(e.stack.length <= 600);
    assert.ok(e.stack.split('\n').length <= 5);
  });
});

describe('ring buffer', () => {
  test('keeps only the newest 50 entries', () => {
    for (let i = 0; i < 60; i++) errorlog.logError('ring', new Error(`err ${i}`));
    const items = errorlog.getErrors();
    assert.equal(items.length, 50);
    assert.equal(items[0].msg, 'err 10');
    assert.equal(items[49].msg, 'err 59');
  });

  test('a repeated error moves to the newest slot so it survives eviction', () => {
    errorlog.logError('ring', new Error('keeper'));
    for (let i = 0; i < 49; i++) errorlog.logError('ring', new Error(`filler ${i}`));
    errorlog.logError('ring', new Error('keeper')); // bump
    errorlog.logError('ring', new Error('newest'));  // pushes one out: oldest filler, not keeper
    const msgs = errorlog.getErrors().map(e => e.msg);
    assert.equal(msgs.length, 50);
    assert.ok(msgs.includes('keeper'));
    assert.ok(!msgs.includes('filler 0'));
  });

  test('mergeError is pure', () => {
    const base = [errorlog.buildErrorEntry({ msg: 'a' }, { v: 'x', t: 't1' })];
    const out = errorlog.mergeError(base, errorlog.buildErrorEntry({ msg: 'a' }, { v: 'x', t: 't2' }));
    assert.equal(base[0].count, 1);
    assert.equal(out[0].count, 2);
    assert.equal(out[0].t, 't2');
  });
});

describe('no personal data', () => {
  test('entries only ever contain the whitelisted technical fields', () => {
    errorlog.logError('push day', new Error('Missing or insufficient permissions.'));
    errorlog.logError('off-search', new TypeError('Failed to fetch'));
    for (const e of errorlog.getErrors()) {
      for (const k of Object.keys(e)) {
        assert.ok(['t', 'v', 'msg', 'src', 'stack', 'context', 'count'].includes(k), `unexpected field ${k}`);
      }
    }
  });

  test('query strings and emails are scrubbed from messages and stacks', () => {
    const err = new Error('GET https://world.openfoodfacts.org/cgi/search.pl?search_terms=my%20secret%20lunch failed for a.b@example.com');
    err.stack = 'Error: x\n    at f (https://x.io/js/api.js?q=chicken%20salad:5:6)';
    errorlog.logError('scrub', err);
    const json = JSON.stringify(errorlog.getErrors());
    assert.ok(!json.includes('secret'));
    assert.ok(!json.includes('chicken'));
    assert.ok(!json.includes('example.com'));
    assert.ok(json.includes('[email]'));
  });

  test('scrubText leaves plain messages alone', () => {
    assert.equal(errorlog.scrubText('Failed to fetch'), 'Failed to fetch');
  });
});

describe('sync to Firestore', () => {
  test('flushErrors pushes { items, updatedAt } keyed by device id; signed-out keeps buffering', async () => {
    errorlog.logError('x', new Error('e1'));
    const calls = [];
    let signedIn = false;
    errorlog.setErrorSink(async (id, data) => { calls.push({ id, data }); return signedIn; });
    assert.equal(await errorlog.flushErrors(), false);
    signedIn = true;
    assert.equal(await errorlog.flushErrors(), true);
    const last = calls[calls.length - 1];
    assert.match(last.id, /^[a-z0-9]{6,32}$/);
    assert.equal(last.data.items.length, 1);
    assert.ok(last.data.updatedAt);
    // clean now: nothing more to push
    const n = calls.length;
    await errorlog.flushErrors();
    assert.equal(calls.length, n);
    errorlog.setErrorSink(null);
  });
});
