import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, act, createTournament, ranking, stepsTo } from '../src/board/rules.js';
import { PERSONALITIES, cpuAct, createCpu } from '../src/board/cpu.js';
import { STAGES } from '../src/board/stages/index.js';
import { nextRandom, seedFrom } from '../src/rng.js';

// ステージ「海の中の 探検」: 海流・宝箱・クジラと、エリアごとの ハプニング
const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
const kinds = Object.keys(PERSONALITIES);
const ST = STAGES.umi;

function run(seed, { turns = 10, personalities = PLAYERS.map((_, i) => kinds[(i + seed) % 3]), onEvents } = {}) {
  const s = createTournament(PLAYERS, seed, { turns, stage: 'umi' });
  const cpus = personalities.map((k, i) => createCpu(k, seed, i));
  const fake = { rng: seedFrom(`fake:${seed}`) };
  const events = [];
  let guard = 0;
  while (s.phase !== 'finished') {
    const pend = s.pending;
    let a;
    if (pend.type === 'minigame') {
      const r = PLAYERS.map((_, i) => i);
      for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(nextRandom(fake) * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
      a = { type: 'minigameResult', ranking: r };
    } else if (pend.type === 'duelGame') a = { type: 'duelResult', winner: nextRandom(fake) < 0.5 ? pend.a : pend.b };
    else a = cpuAct(cpus[pend.slot], s, pend.slot);
    const ev = act(s, a);
    events.push(...ev);
    onEvents?.(s, ev);
    if (++guard > 20000) throw new Error('終わらない');
  }
  return { s, events };
}
function ready(seed = 1) {
  const s = createTournament(PLAYERS, seed, { stage: 'umi' });
  s.order = [0, 1, 2, 3, 4];
  s.phase = 'turn';
  s.cur = 0;
  s.pending = { type: 'roll', slot: 0, dice: 1 };
  s.owl = 37; // 遠くへ
  s.whale = 25; // クジラは 沈没船
  return s;
}
function forceDice(s, n) {
  for (let k = 0; k < 1e6; k++) {
    const h = { rng: k };
    if (1 + Math.floor(nextRandom(h) * 10) === n) { s.rng = k; return; }
  }
  throw new Error('見つからない');
}
// サイコロが n で、そのつぎの 乱数が ok(r) に なる ように 合わせる(宝箱・宝の地図の くじ)
function forceDiceThen(s, n, ok) {
  for (let k = 0; k < 1e6; k++) {
    const h = { rng: k };
    if (1 + Math.floor(nextRandom(h) * 10) === n && ok(nextRandom(h))) { s.rng = k; return; }
  }
  throw new Error('見つからない');
}
function rollThen(s, slot, sq, n, ok) {
  s.players[slot].sq = sq;
  s.cur = s.order.indexOf(slot);
  s.pending = { type: 'roll', slot, dice: 1 };
  forceDiceThen(s, n, ok);
  return act(s, { slot, type: 'roll' });
}
function rollFrom(s, slot, sq, n) {
  s.players[slot].sq = sq;
  s.cur = s.order.indexOf(slot);
  s.pending = { type: 'roll', slot, dice: 1 };
  forceDice(s, n);
  return act(s, { slot, type: 'roll' });
}

test('海の中: 40 マスで 一周できる。4つの エリアに ハプニング。海流・宝箱・お店', () => {
  assert.equal(ST.squares.length, 40);
  for (const q of ST.squares) {
    assert.equal(q.next.length, 1);
    assert.ok(stepsTo(ST, q.id, ST.start) < Infinity);
  }
  for (const a of ST.areas) {
    const qs = ST.squares.filter((q) => q.area === a.key);
    assert.equal(qs.length, 10);
    assert.ok(qs.some((q) => q.kind === 'happen'), `${a.key} に ハプニング`);
  }
  assert.ok(ST.squares.filter((q) => q.kind === 'current').length >= 5);
  assert.ok(ST.squares.filter((q) => q.kind === 'chest').every((q) => q.area === 'wreck' || q.area === 'deep'));
  assert.equal(ST.squares.filter((q) => q.kind === 'shop').length, 1);
  assert.ok(ST.owlSpots.length >= 10 && ST.owlSpots.every((id) => ST.squares[id].kind === 'blue'));
});

test('海の中: CPU だけで 最後まで 回る。どんぐりの 帳じりも 合う。しかけも 出る', () => {
  const count = { current: 0, chest: 0, whaleRide: 0, flow: 0 };
  for (let seed = 1; seed <= 20; seed++) {
    const acorns = PLAYERS.map(() => RULES.startAcorns);
    const { s, events } = run(seed, {
      onEvents: (_, ev) => {
        for (const e of ev) if (e.type === 'acorns') { acorns[e.slot] += e.delta; assert.equal(acorns[e.slot], e.total); }
      },
    });
    assert.equal(s.phase, 'finished');
    assert.ok(!events.some((e) => e.type === 'invalid'), 'CPU は できない 操作を 出さない');
    assert.deepEqual(s.players.map((p) => p.acorns), acorns);
    for (const k of Object.keys(count)) count[k] += events.filter((e) => e.type === k).length;
  }
  for (const [k, n] of Object.entries(count)) assert.ok(n > 5, `${k} が 出る(${JSON.stringify(count)})`);
});

test('海流: 止まると 流れの 向きへ 5 マス 運ばれて、着いた マスの 効果も うける', () => {
  let s = ready();
  s.flow = 1;
  let ev = rollFrom(s, 0, 1, 2); // 3 は 海流
  let e = ev.find((x) => x.type === 'current');
  assert.ok(e && e.from === 3 && e.to === 8 && e.dir === 1);
  assert.equal(s.players[0].sq, 8);
  assert.equal(s.players[0].acorns, RULES.startAcorns - RULES.red, '着いた 赤マスの 効果');
  s = ready();
  s.flow = -1;
  ev = rollFrom(s, 0, 10, 2); // 12 は 海流
  e = ev.find((x) => x.type === 'current');
  assert.ok(e && e.to === 7 && e.dir === -1, 'うしろ向きの 流れ');
});

test('流れの 向きは ターンごとに くじ。ときどき うしろ向き', () => {
  let back = 0, turns = 0;
  for (let seed = 1; seed <= 10; seed++) {
    run(seed, { onEvents: (s, ev) => { if (ev.some((e) => e.type === 'turn' && e.turn > 1)) { turns++; if (s.flow < 0) back++; } } });
  }
  assert.ok(back / turns > 0.15 && back / turns < 0.55, `うしろ向き ${back}/${turns}`);
});

test('宝箱: くじで どんぐり。たまに びっくり箱', () => {
  // くじの 重み: 55 / 25 / 20
  for (const [r, want] of [[0.1, 8], [0.6, 15], [0.9, -5]]) {
    const s = ready();
    const ev = rollThen(s, 0, 19, 2, (x) => Math.abs(x - r) < 0.05); // 21 は 宝箱
    const e = ev.find((x) => x.type === 'chest');
    assert.equal(e.acorns, want);
    assert.equal(s.players[0].acorns, Math.max(0, RULES.startAcorns + want));
  }
});

test('クジラ: 毎ターン 前へ 泳ぐ。クジラの 近くに 止まると 背中に のって 10 マス 先へ', () => {
  let s = ready();
  s.whale = 16;
  let ev = rollFrom(s, 0, 13, 2); // 15(クジラの 1 マス 手前)
  const e = ev.find((x) => x.type === 'whaleRide');
  assert.ok(e && e.from === 15 && e.to === 25);
  assert.equal(s.players[0].sq, 25, '着いた 海流マスでは もう 流されない');
  assert.equal(s.whale, 25, 'クジラも いっしょに');
  // 遠ければ のらない
  s = ready();
  s.whale = 30;
  ev = rollFrom(s, 0, 13, 2);
  assert.ok(!ev.some((x) => x.type === 'whaleRide'));
  // ターンが かわると 泳ぐ
  const { events } = run(3, { turns: 5 });
  const swims = events.filter((x) => x.type === 'whale');
  assert.equal(swims.length, 4);
  for (const w of swims) assert.ok(w.n >= ST.sea.whaleSwim[0] && w.n <= ST.sea.whaleSwim[1]);
});

test('ハプニング: ふぐ・ラッコ・宝の地図・電気クラゲ', () => {
  // サンゴ礁: ふぐ。止まった子 +3、近くの子は 3 マス うしろへ
  let s = ready();
  s.players[1].sq = 8;
  s.players[2].sq = 30; // よそ
  rollFrom(s, 0, 5, 1); // 6
  assert.equal(s.players[0].acorns, RULES.startAcorns + 3);
  assert.equal(s.players[1].sq, 5);
  assert.equal(s.players[2].sq, 30);
  // 海藻の森: ラッコの 貝わり 1〜12
  s = ready();
  let ev = rollFrom(s, 0, 13, 2); // 15
  const sh = ev.find((x) => x.type === 'shell');
  assert.ok(sh && sh.n >= 1 && sh.n <= 12);
  assert.equal(s.players[0].acorns, RULES.startAcorns + sh.n);
  // 沈没船: 宝の地図。あたりは 先生の 2 マス 手前、はずれは 4 マス もどる
  s = ready();
  s.whale = 5;
  ev = rollThen(s, 0, 22, 2, (x) => x < 0.5); // 24
  let m = ev.find((x) => x.type === 'treasureMap');
  assert.ok(m.good);
  assert.equal(stepsTo(ST, m.to, s.owl), 2);
  s = ready();
  s.whale = 5;
  ev = rollThen(s, 0, 22, 2, (x) => x >= 0.5);
  m = ev.find((x) => x.type === 'treasureMap');
  assert.ok(!m.good);
  assert.equal(m.to, 20);
  // 深海: 電気クラゲ。深海に いる 子は みんな -4
  s = ready();
  s.whale = 5;
  s.players[1].sq = 37;
  s.players[2].sq = 3;
  rollFrom(s, 0, 31, 2); // 33
  assert.equal(s.players[0].acorns, RULES.startAcorns - 4);
  assert.equal(s.players[1].acorns, RULES.startAcorns - 4);
  assert.equal(s.players[2].acorns, RULES.startAcorns);
});

test('海の中でも どの性格の CPU も 優勝できる', () => {
  const wins = { cautious: 0, normal: 0, bold: 0 };
  const N = 120;
  for (let seed = 1; seed <= N; seed++) {
    const personalities = PLAYERS.map((_, i) => kinds[(i + seed) % 3]);
    const { s } = run(seed, { personalities });
    wins[personalities[ranking(s)[0]]]++;
  }
  for (const k of kinds) assert.ok(wins[k] > N * 0.15, `優勝の数 ${JSON.stringify(wins)}`);
});
