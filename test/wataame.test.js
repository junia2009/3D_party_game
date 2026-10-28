import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, bandOf, chanceNow, createGame, gainOf, ranking, step } from '../src/games/wataame/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/wataame/cpu.js';

const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
const kinds = Object.keys(PERSONALITIES);

function run(seed, { personalities = PLAYERS.map((_, i) => kinds[(i + seed) % 3]) } = {}) {
  const s = createGame(PLAYERS, seed);
  const cpus = personalities.map((k, slot) => createCpu(k, seed, slot));
  const events = [];
  let guard = 0;
  while (s.phase !== 'finished') {
    events.push(...step(s, cpus.map((c, slot) => cpuInput(c, s, slot))));
    if (++guard > 200 / STEP) throw new Error('終わらない');
  }
  return { s, events };
}
// 回す 時間に なるまで すすめる
function toSpin(seed = 1) {
  const s = createGame([{ id: 'me' }], seed);
  while (s.phase !== 'spin') step(s, [null]);
  return s;
}
const go = (s, inp, sec) => { const ev = []; for (let k = 0; k < sec / STEP && s.phase === 'spin'; k++) ev.push(...step(s, [typeof inp === 'function' ? inp(s) : inp])); return ev; };
const mid = (s) => { const [lo, hi] = bandOf(s.units[0].size); return (lo + hi) / 2; };

test('CPU どうしで 決着する。同じシードなら同じ', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { s, events } = run(seed);
    assert.deepEqual([...ranking(s)].sort(), [0, 1, 2, 3, 4]);
    assert.equal(events.filter((e) => e.type === 'chance').length, RULES.chances.length);
    for (const u of s.units) assert.equal(u.zarame.length, RULES.chances.length, 'チャンスは かならず きまる');
  }
  assert.deepEqual(ranking(run(7).s), ranking(run(7).s));
});

test('ちょうどいい はやさで よく まける。おそいと あまり まけない。止まると まけない', () => {
  const a = toSpin(), b = toSpin(), c = toSpin();
  go(a, (s) => ({ spin: mid(s) }), 5);
  go(b, { spin: 0.8 }, 5);
  go(c, { spin: 0 }, 5);
  assert.ok(a.units[0].size > b.units[0].size + 2, `${a.units[0].size} ${b.units[0].size}`);
  assert.equal(c.units[0].size, 0);
});

test('大きく なると ちょうどいい はやさが おそく なる', () => {
  const [lo0, hi0] = bandOf(0);
  const [lo1, hi1] = bandOf(40);
  assert.ok(hi1 < hi0 && lo1 < lo0);
  assert.ok(gainOf(hi0, 40) > 1, '大きい わたあめには もう はやすぎ');
});

test('はやすぎると すこし よけいに まけるが、はりが たまって ちぎれる', () => {
  const s = toSpin(2);
  go(s, (st) => ({ spin: mid(st) }), 4);
  const before = s.units[0].size;
  const [, hi] = bandOf(before);
  assert.ok(gainOf(hi + 0.5, before) > 1);
  const ev = [];
  for (let k = 0; k < 4 / STEP && !ev.some((e) => e.type === 'tear'); k++) ev.push(...step(s, [{ spin: hi + 1.2 }]));
  const tear = ev.find((e) => e.type === 'tear');
  assert.ok(tear, 'ちぎれる');
  assert.ok(tear.lost > 0);
  assert.equal(s.units[0].tears, 1);
  // ゆっくりに すれば はりは もどる
  const t = toSpin(2);
  go(t, { spin: bandOf(0)[1] + 1.0 }, 1.2);
  const st = t.units[0].strain;
  assert.ok(st > 0);
  go(t, { spin: 0.8 }, 1);
  assert.ok(t.units[0].strain < st);
});

test('ちょうどいいより ちょっと はやい くらいでは はりは たまらない', () => {
  const s = toSpin(6);
  go(s, (st) => ({ spin: bandOf(st.units[0].size)[1] + RULES.grace * 0.5 }), 3);
  assert.equal(s.units[0].strain, 0);
});

test('ちぎれた あとは しばらく まけない', () => {
  const s = toSpin(3);
  go(s, (st) => ({ spin: mid(st) }), 3);
  go(s, { spin: 4.5 }, 3);
  assert.ok(s.units[0].tears >= 1);
  const u = s.units[0];
  // ちぎれた しゅんかんまで もどすのは むずかしいので、stun を 見る
  if (u.stun > 0) {
    const sz = u.size;
    go(s, (st) => ({ spin: mid(st) }), Math.min(u.stun, 0.5) - STEP);
    assert.ok(s.units[0].size - sz < 0.05);
  }
});

test('ざらめ: わが かさなった ときに おすと ボーナス。はやすぎ・おくれ・止まったままは なし', () => {
  const press = (offset, spin = null) => {
    const s = toSpin(4);
    go(s, (st) => ({ spin: spin ?? mid(st) }), s.chances[0] - 0.2);
    let ev = [];
    let pressed = false;
    for (let k = 0; k < 6 / STEP && s.phase === 'spin' && s.units[0].zarame[0] === undefined; k++) {
      const ch = chanceNow(s);
      const want = ch.i === 0 && !pressed && ch.left <= offset;
      if (want) pressed = true;
      ev.push(...step(s, [{ spin: spin ?? mid(s), zarame: want }]));
    }
    return ev.find((e) => e.type === 'zarame');
  };
  assert.equal(press(0).q, 'perfect');
  assert.equal(press(0).bonus, RULES.bonus.perfect);
  assert.equal(press(0.25).q, 'good');
  assert.equal(press(1.2).q, 'early');
  assert.equal(press(-1).q, 'miss');
  assert.equal(press(0, 0).q, 'still');
  assert.equal(press(0, 0).bonus, 0);
});

test('順位は 大きさ → ちぎれた 回数', () => {
  const s = createGame(PLAYERS.slice(0, 3), 1);
  Object.assign(s.units[0], { size: 40, tears: 1 });
  Object.assign(s.units[1], { size: 45, tears: 2 });
  Object.assign(s.units[2], { size: 40, tears: 0 });
  assert.deepEqual(ranking(s), [1, 2, 0]);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 150;
  for (let seed = 1; seed <= NN; seed++) wins[ranking(run(seed * 7 + 1, { personalities: PLAYERS.map(() => 'normal') }).s)[0]]++;
  for (const w of wins) assert.ok(w > NN * 0.06 && w < NN * 0.36, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの うでまえでも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', aim: [0.3, 1.4], wobble: 0.9, tol: [0.3, 0.7], react: [0.25, 0.5], timing: 0.3 };
  try {
    let rankSum = 0, wins = 0;
    const NN = 150;
    for (let seed = 1; seed <= NN; seed++) {
      const r = ranking(run(seed, { personalities: PLAYERS.map((_, i) => (i === 0 ? 'human' : kinds[(i + seed) % 3])) }).s);
      rankSum += r.indexOf(0) + 1;
      if (r[0] === 0) wins++;
    }
    assert.ok(rankSum / NN <= 3.4, `人の平均順位 ${rankSum / NN}`);
    assert.ok(wins / NN >= 0.1, `人の勝ち ${wins}/${NN}`);
  } finally {
    delete PERSONALITIES.human;
  }
});
