// tests/sw-precache.test.js — the service worker must precache every module the
// app boots with (or the app can load blank offline right after an update), and
// must list only real files (one 404 makes cache.addAll reject and the SW never
// installs — users would silently stop receiving updates).
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const assetsBlock = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
const assets = assetsBlock ? [...assetsBlock[1].matchAll(/'([^']+)'/g)].map(m => m[1]) : [];

describe('SW precache', () => {
  test('ASSETS list is found', () => {
    assert.ok(assets.length > 0, 'could not parse ASSETS from sw.js');
  });

  test('covers every module in js/', () => {
    const missing = readdirSync(join(root, 'js'))
      .filter(f => f.endsWith('.js'))
      .filter(f => !assets.includes(`/meal-tracker/js/${f}`));
    assert.deepEqual(missing, [], `add to sw.js ASSETS: ${missing.join(', ')}`);
  });

  test('every listed path exists (a 404 would break SW install)', () => {
    const broken = assets
      .map(a => a.replace(/^\/meal-tracker\//, ''))
      .filter(p => p !== '' && !existsSync(join(root, p)));
    assert.deepEqual(broken, [], `sw.js ASSETS points at missing files: ${broken.join(', ')}`);
  });

  test('every listed path is under /meal-tracker/ and is a shipped file', () => {
    const shipped = /^\/meal-tracker\/($|index\.html$|manifest\.json$|sw\.js$|js\/|css\/|icons\/)/;
    const bad = assets.filter(a => !shipped.test(a));
    assert.deepEqual(bad, [], `not deployed by CI, would 404: ${bad.join(', ')}`);
  });

  test('CI can still rewrite the cache version', () => {
    assert.match(sw, /const CACHE = 'meal-tracker-v\d+'/);
  });
});
