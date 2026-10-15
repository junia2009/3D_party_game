// sw.js のプリキャッシュ一覧と版が、いまのファイルと合っているか。
// 合っていなければ `npm run gen:precache` を忘れている(オフラインで古い版や欠けたファイルになる)。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render } from '../tools/gen-precache.mjs';

test('sw.js のプリキャッシュが最新(npm run gen:precache)', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.equal(render(sw), sw, 'sw.js が古い。npm run gen:precache を実行する');
});

test('プリキャッシュに入口と three が入っている', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  for (const f of ['./index.html', './manifest.webmanifest', './vendor/three.module.js', './src/title/title.js', './models/hoho.glb', './icons/icon-192.png']) {
    assert.ok(sw.includes(`"${f}"`), `${f} がない`);
  }
});
