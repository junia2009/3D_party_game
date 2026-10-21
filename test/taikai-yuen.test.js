import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, act, createTournament, ranking, stepsTo } from '../src/board/rules.js';
import { PERSONALITIES, cpuAct, createCpu } from '../src/board/cpu.js';
import { STAGES } from '../src/board/stages/index.js';
import { nextRandom, seedFrom } from '../src/rng.js';

// ステージ「どんぐり遊園地」: 乗り物と、エリアごとの ハプニング
const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
const kinds = Object.keys(PERSONALITIES);
const ST = STAGES.yuen;

function run(seed, { turns = 10, personalities = PLAYERS.map((_, i) => kinds[(i + seed) % 3]), onEvents } = {}) {
  const s = createTournament(PLAYERS, seed, { turns, stage: 'yuen' });
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
  const s = createTournament(PLAYERS, seed, { stage: 'yuen' });
  s.order = [0, 1, 2, 3, 4];
  s.phase = 'turn';
  s.cur = 0;
  s.pending = { type: 'roll', slot: 0, dice: 1 };
  s.owl = 33; // 遠くへ
  return s;
}
function forceDice(s, n) {
  for (let k = 0; k < 1e6; k++) {
    const h = { rng: k };
    if (1 + Math.floor(nextRandom(h) * 10) === n) { s.rng = k; return; }
  }
  throw new Error('見つからない');
}
function rollFrom(s, slot, sq, n) {
  s.players[slot].sq = sq;
  s.cur = s.order.indexOf(slot);
  s.pending = { type: 'roll', slot, dice: 1 };
  forceDice(s, n);
  return act(s, { slot, type: 'roll' });
}
// 乗り物の くじが kind に なるように、乱数を合わせる(サイコロを ふった あとの 状態から さがす)
function forceRide(s, key, kind) {
  const r = ST.rides[key];
  const total = r.outcomes.reduce((a, o) => a + o.w, 0);
  for (let k = 0; k < 1e6; k++) {
    const h = { rng: k };
    let x = nextRandom(h) * total;
    if ((r.outcomes.find((c) => (x -= c.w) < 0) || r.outcomes[0]).kind === kind) { s.rng = k; return; }
  }
  throw new Error('見つからない');
}

test('遊園地: 36 マスで 一周できる。4つの エリアに 乗り場と ハプニング', () => {
  assert.equal(ST.squares.length, 36);
  for (const q of ST.squares) {
    assert.equal(q.next.length, 1);
    assert.ok(stepsTo(ST, q.id, ST.start) < Infinity);
  }
  for (const a of ST.areas) {
    const qs = ST.squares.filter((q) => q.area === a.key);
    assert.equal(qs.length, 9);
    assert.ok(qs.some((q) => q.kind === 'happen'), `${a.key} に ハプニング`);
  }
  const rides = ST.squares.filter((q) => q.kind === 'ride');
  assert.deepEqual(rides.map((q) => q.ride).sort(), ['coaster', 'ghost', 'wheel']);
  for (const q of rides) assert.ok(ST.rides[q.ride]);
  assert.ok(ST.owlSpots.length >= 12 && ST.owlSpots.every((id) => ST.squares[id].kind === 'blue'));
});

test('遊園地: CPU だけで 最後まで 回る。どんぐりの 帳じりも 合う', () => {
  let rides = 0;
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
    rides += events.filter((e) => e.type === 'ride').length;
  }
  assert.ok(rides > 20, `乗り物に 乗っている(${rides})`);
});

test('乗り場に 止まると 乗るかを えらべる。乗らなければ そのまま', () => {
  const s = ready();
  rollFrom(s, 0, 13, 1); // 14 は コースター
  assert.deepEqual(s.pending, { type: 'ride', slot: 0, ride: 'coaster' });
  const ev = act(s, { slot: 0, type: 'rideNo' });
  assert.ok(ev.some((e) => e.type === 'rideSkip'));
  assert.equal(s.players[0].sq, 14);
  assert.equal(s.players[0].acorns, RULES.startAcorns);
  assert.equal(s.pending.slot, 1, '次の子の番');
});

test('乗り物の くじ: 大当たりは 先生の 1マス手前・先へ・うしろへ。はらった どんぐりは へる', () => {
  // 大当たり
  let s = ready();
  rollFrom(s, 0, 13, 1);
  forceRide(s, 'coaster', 'owl');
  let ev = act(s, { slot: 0, type: 'rideYes' });
  assert.equal(s.players[0].sq, 32, '先生(33)の 1マス手前');
  assert.ok(ev.some((e) => e.type === 'ride' && e.outcome === 'owl' && e.to === 32));
  assert.ok(ev.some((e) => e.type === 'acorns' && e.why === 'ride' && e.delta === -3));
  // 先へ 8〜12
  s = ready();
  rollFrom(s, 0, 13, 1);
  forceRide(s, 'coaster', 'ahead');
  act(s, { slot: 0, type: 'rideYes' });
  const d = stepsTo(ST, 14, s.players[0].sq);
  assert.ok(d >= 8 && d <= 12, `${d}`);
  // おばけ屋敷: うしろへ 6〜9
  s = ready();
  rollFrom(s, 0, 28, 1); // 29 は おばけ屋敷
  forceRide(s, 'ghost', 'back');
  act(s, { slot: 0, type: 'rideYes' });
  const b = stepsTo(ST, s.players[0].sq, 29);
  assert.ok(b >= 6 && b <= 9, `${b}`);
  // 観覧車: その場で どんぐり
  s = ready();
  rollFrom(s, 0, 20, 1); // 21 は 観覧車
  forceRide(s, 'wheel', 'stay');
  act(s, { slot: 0, type: 'rideYes' });
  assert.equal(s.players[0].sq, 21);
  assert.equal(s.players[0].acorns, RULES.startAcorns - 3 + 6);
  assert.equal(s.pending.slot, 1);
});

test('どんぐりが たりないと 乗れない', () => {
  const s = ready();
  s.players[0].acorns = 2;
  const ev = rollFrom(s, 0, 13, 1);
  assert.ok(ev.some((e) => e.type === 'rideSkip'));
  assert.equal(s.pending.slot, 1);
});

test('ハプニング: 風船・宙がえり・花火・おばけ', () => {
  // 入口: 風船で 3〜5 マス 先へ
  let s = ready();
  rollFrom(s, 0, 6, 1); // 7
  const n = stepsTo(ST, 7, s.players[0].sq);
  assert.ok(n >= 3 && n <= 5, `${n}`);
  // コースター: 5 こ 落として、コースターに いる 子が 山分け
  s = ready();
  s.players[1].sq = 12;
  s.players[2].sq = 17;
  s.players[3].sq = 30; // よそ
  rollFrom(s, 0, 14, 1); // 15
  assert.equal(s.players[0].acorns, RULES.startAcorns - 5);
  assert.equal(s.players[1].acorns, RULES.startAcorns + 2);
  assert.equal(s.players[2].acorns, RULES.startAcorns + 2);
  assert.equal(s.players[3].acorns, RULES.startAcorns);
  // 観覧車: 花火で みんな +3、止まった子は +6
  s = ready();
  rollFrom(s, 0, 23, 1); // 24
  assert.equal(s.players[0].acorns, RULES.startAcorns + 6);
  for (let i = 1; i < 5; i++) assert.equal(s.players[i].acorns, RULES.startAcorns + 3);
  // おばけ屋敷: だれかと 場所が いれかわる
  s = ready();
  s.players.forEach((p, i) => { p.sq = [0, 3, 13, 22, 27][i]; });
  const ev = rollFrom(s, 0, 30, 1); // 31
  const e = ev.find((x) => x.type === 'ghostSwap');
  assert.ok(e && e.target !== 0);
  assert.equal(s.players[e.target].sq, 31);
  assert.equal(s.players[0].sq, [0, 3, 13, 22, 27][e.target]);
});

test('遊園地でも どの性格の CPU も 優勝できる', () => {
  const wins = { cautious: 0, normal: 0, bold: 0 };
  const N = 120;
  for (let seed = 1; seed <= N; seed++) {
    const personalities = PLAYERS.map((_, i) => kinds[(i + seed) % 3]);
    const { s } = run(seed, { personalities });
    wins[personalities[ranking(s)[0]]]++;
  }
  for (const k of kinds) assert.ok(wins[k] > N * 0.15, `優勝の数 ${JSON.stringify(wins)}`);
});
