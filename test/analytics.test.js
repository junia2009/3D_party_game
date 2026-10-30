// 匿名のアクセス集計(src/analytics.js)のテスト。
// 「数えてはいけない環境で数えない」「表に無いものは送らない」
// 「集計画面で読める名前になる」の3点を押さえる。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldCount, describe, track, initAnalytics, PAGEVIEW } from '../src/analytics.js';
import { MINIGAMES } from '../src/board/rules.js';
import { LIST as STAGE_LIST } from '../src/board/stages/index.js';

const PAGES = { hostname: 'junia2009.github.io', search: '' };

test('analytics: 公開サイトで ふつうに 開いたときだけ 数える', () => {
  assert.equal(shouldCount(PAGES), true);
  // さそいの リンクや 関係のない 引数なら 数える
  assert.equal(shouldCount({ ...PAGES, search: '?room=1234' }), true);
  assert.equal(shouldCount({ ...PAGES, search: '?utm_source=x' }), true);
});

test('analytics: 手元の開発・E2E・確かめ用の URL では 数えない', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]', '']) {
    assert.equal(shouldCount({ ...PAGES, hostname }), false, hostname);
  }
  assert.equal(shouldCount({ ...PAGES, webdriver: true }), false, 'E2E');
  for (const search of ['?seed=11', '?server=http://127.0.0.1:8787', '?time=night', '?fps']) {
    assert.equal(shouldCount({ ...PAGES, search }), false, search);
  }
});

test('analytics: 集計画面には 日本語の「何をしたか」で 出る', () => {
  assert.deepEqual(describe('game-start', { key: 'catch', name: 'どんぐりキャッチ' }), {
    path: '🎯 競技を遊んだ ― どんぐりキャッチ', title: '競技えらびから 1 本だけ遊んだ(CPU 相手)',
  });
  assert.equal(describe('taikai-start', { stage: 'shiki' }).path, '🎲 大会を始めた ― 四季の森');
  assert.equal(describe('taikai-end', { stage: 'yuen' }).path, '🏁 大会を最後まで遊んだ ― どんぐり遊園地');
  assert.equal(describe('online-game', { key: 'sumo', name: '切り株ずもう' }).path, '🌐 オンラインで競技 ― 切り株ずもう');
  assert.equal(describe('room-join').path, '🌐 あいことばで部屋に入った');
  assert.equal(PAGEVIEW.path, '🌰 ゲームを開いた');
});

test('analytics: どの競技にも 名前が ある(競技を 足しても 集計から もれない)', () => {
  // 名前は title.js の GAMES から 渡す。そこに 名前の ない 競技は 送られない
  const title = readFileSync(new URL('../src/title/title.js', import.meta.url), 'utf8');
  for (const key of MINIGAMES) {
    const name = title.match(new RegExp(`^  ${key}: \\{\\n    name: '([^']+)'`, 'm'))?.[1];
    assert.ok(name, `${key} の 名前(title.js の GAMES)`);
    assert.ok(describe('game-start', { key, name }), `${key}「${name}」が 長すぎる?`);
  }
  for (const s of STAGE_LIST.filter((x) => x.ready)) {
    for (const ev of ['taikai-start', 'taikai-resume', 'taikai-end', 'online-taikai', 'online-taikai-end']) {
      assert.ok(describe(ev, { stage: s.key }), `${ev} / ${s.key}`);
    }
  }
});

test('analytics: 表に無い 出来事・知らない 値は 送らない', () => {
  assert.equal(describe('なにか'), null);
  assert.equal(describe('game-start', { key: 'taikai', name: '大会' }), null, '競技ではない');
  assert.equal(describe('game-start', { key: '1234', name: 'あいことば' }), null, '知らない競技');
  assert.equal(describe('game-start', { key: 'catch' }), null, '名前がない');
  assert.equal(describe('game-start', { key: 'catch', name: 'x'.repeat(31) }), null, '長すぎる名前');
  assert.equal(describe('game-start', undefined), null);
  assert.equal(describe('taikai-start', { stage: 'soon2' }), null, 'じゅんびちゅうの ステージ');
  assert.equal(describe('taikai-start', { stage: 'ゆう' }), null);
});

test('analytics: ブラウザで ない 環境では 何もしない(テストや サーバーから 呼んでも 安全)', () => {
  assert.equal(initAnalytics(undefined), false);
  assert.doesNotThrow(() => track('taikai-start', { stage: 'shiki' }));
});
