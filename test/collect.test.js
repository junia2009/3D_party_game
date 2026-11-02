import test from 'node:test';
import assert from 'node:assert/strict';
import { freshProgress, normalize, recordGame, recordTaikai, drawGacha, wear, refresh, loadProgress, saveProgress, STORE_KEY } from '../src/collect/progress.js';
import { EARN, GACHA, PRIZES, HATS, SCARVES, STAMPS, TITLES, cleanLook } from '../src/collect/catalog.js';
import { MINIGAMES } from '../src/board/rules.js';

test('ごほうび: 一覧の key が かぶらない・名前が ある', () => {
  for (const list of [HATS, SCARVES, TITLES, STAMPS]) {
    const keys = list.map((x) => x.key);
    assert.equal(new Set(keys).size, keys.length);
  }
  assert.equal(new Set(PRIZES.map((p) => p.id)).size, PRIZES.length);
  for (const p of PRIZES) assert.ok(p.name && ['n', 'r', 's'].includes(p.rare), p.id);
  // どの めずらしさにも 中身が ある(くじが 空に ならない)
  for (const r of ['n', 'r', 's']) assert.ok(PRIZES.some((p) => p.rare === r), r);
  // 競技ごとの スタンプが ぜんぶ ある
  for (const g of MINIGAMES) assert.ok(STAMPS.some((s) => s.game === g), g);
});

test('ごほうび: 競技の 順位で どんぐりが たまり、1位で スタンプと 称号', () => {
  const p = freshProgress(1);
  const r = recordGame(p, { game: 'oni', place: 0, count: 5 });
  assert.equal(r.acorns, EARN.game[0]);
  assert.equal(p.acorns, EARN.game[0]);
  assert.ok(r.stamps.includes('first') && r.stamps.includes('win1') && r.stamps.includes('g-oni'));
  assert.ok(r.titles.includes('winner'));
  // 2回目は 同じ スタンプを もう おさない
  const r2 = recordGame(p, { game: 'oni', place: 4, count: 5 });
  assert.equal(r2.acorns, EARN.game[4]);
  assert.deepEqual(r2.stamps, []);
  // 対決(2人)の 2位は 2位の どんぐり
  assert.equal(recordGame(p, { game: 'sumo', place: 1, count: 2 }).acorns, EARN.game[1]);
  assert.equal(p.stats.plays, 3);
  assert.equal(p.stats.wins, 1);
});

test('ごほうび: 大会は ターン数で どんぐりが かわり、優勝で ステージの 称号', () => {
  const p = freshProgress(2);
  assert.equal(recordTaikai(p, { stage: 'umi', place: 0, turns: 10 }).acorns, EARN.taikai[0]);
  assert.equal(recordTaikai(p, { stage: 'umi', place: 1, turns: 5 }).acorns, Math.round(EARN.taikai[1] / 2));
  assert.equal(recordTaikai(p, { stage: 'shiki', place: 4, turns: 15 }).acorns, Math.round(EARN.taikai[4] * 1.5));
  assert.ok(p.titles.includes('sea') && p.titles.includes('champ'));
  assert.ok(p.stamps['champ-umi']);
  assert.ok(!p.stamps['champ-shiki']);
});

test('ごほうび: ガチャは どんぐりを つかい、かぶったら すこし 返す。同じ たねなら 同じ 中身', () => {
  const p = freshProgress(3);
  assert.equal(drawGacha(p), null); // どんぐりが ない
  p.acorns = GACHA.price * 200;
  const seen = new Set();
  let dups = 0;
  for (let i = 0; i < 200; i++) {
    const before = p.acorns;
    const r = drawGacha(p);
    assert.ok(r.prize);
    assert.equal(p.acorns, before - GACHA.price + (r.dup ? GACHA.refund : 0));
    if (r.dup) dups++;
    seen.add(r.prize.id);
  }
  assert.ok(dups > 0);
  assert.ok(seen.size > PRIZES.length / 2, '200回で 半分 以上は 出る');
  assert.equal(p.stats.gacha, 200);
  assert.ok(p.stamps.gacha1);
  // おなじ たね → おなじ 結果
  const a = freshProgress(9), b = freshProgress(9);
  a.acorns = b.acorns = 1000;
  for (let i = 0; i < 10; i++) assert.equal(drawGacha(a).prize.id, drawGacha(b).prize.id);
});

test('ごほうび: めずらしさの 出かたが おおよそ 重みどおり', () => {
  const p = freshProgress(4);
  p.acorns = GACHA.price * 4000;
  const n = { n: 0, r: 0, s: 0 };
  for (let i = 0; i < 4000; i++) n[drawGacha(p).prize.rare]++;
  assert.ok(n.n / 4000 > 0.62 && n.n / 4000 < 0.78, JSON.stringify(n));
  assert.ok(n.s / 4000 > 0.02 && n.s / 4000 < 0.09, JSON.stringify(n));
});

test('ごほうび: 持って いる ものだけ つけられる', () => {
  const p = freshProgress(5);
  assert.equal(wear(p, 'hat', 'crown'), false);
  p.items['hat:crown'] = 1;
  assert.equal(wear(p, 'hat', 'crown'), true);
  assert.equal(p.look.hat, 'crown');
  assert.equal(wear(p, 'hat', null), true);
  assert.equal(p.look.hat, null);
  assert.equal(wear(p, 'title', 'legend'), false);
  assert.equal(wear(p, 'title', 'rookie'), true);
});

test('ごほうび: こわれた 記録や 知らない key は すてて 読む・保存して 読みなおせる', () => {
  const p = normalize({ acorns: -5, items: { 'hat:crown': 1, 'hat:nope': 3 }, look: { hat: 'crown', scarf: 'star', title: 'legend' }, titles: ['zzz'], stats: { plays: 3 } });
  assert.equal(p.acorns, 0);
  assert.deepEqual(Object.keys(p.items), ['hat:crown']);
  assert.equal(p.look.hat, 'crown');
  assert.equal(p.look.scarf, null); // 持って いない
  assert.equal(p.look.title, 'rookie');
  assert.equal(p.stats.plays, 3);
  assert.equal(normalize('こわれた').acorns, 0);
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const q = freshProgress(6);
  recordGame(q, { game: 'bowl', place: 0 });
  saveProgress(q, storage);
  assert.ok(mem.has(STORE_KEY));
  assert.deepEqual(loadProgress(storage), q);
  assert.equal(loadProgress(null).acorns, 0);
});

test('ごほうび: オンラインの 見た目は 知って いる key だけ とおす', () => {
  assert.deepEqual(cleanLook({ hat: 'crown', scarf: 'star', title: 'sea' }), { hat: 'crown', scarf: 'star', title: 'sea' });
  assert.deepEqual(cleanLook({ hat: '<script>', scarf: 3, title: 'x', extra: 1 }), {});
  assert.deepEqual(cleanLook(null), {});
  // refresh は 何度 よんでも 同じ ものを 2度 くばらない
  const p = freshProgress(7);
  assert.deepEqual(refresh(p).titles, []);
});
