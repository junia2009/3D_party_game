import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, createGame, limitOf, rattleK, ranking, step } from '../src/games/ramune/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/ramune/cpu.js';

const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
const kinds = Object.keys(PERSONALITIES);

function run(seed, { personalities = PLAYERS.map((_, i) => kinds[(i + seed) % 3]), players = PLAYERS } = {}) {
  const s = createGame(players, seed);
  const cpus = personalities.map((k, slot) => createCpu(k, seed, slot));
  const events = [];
  let guard = 0;
  while (s.phase !== 'finished') {
    events.push(...step(s, cpus.map((c, slot) => cpuInput(c, s, slot))));
    if (++guard > 200 / STEP) throw new Error('終わらない');
  }
  return { s, events };
}
// ふる 時間に なるまで すすめる
function toShake(seed = 1) {
  const s = createGame([{ id: 'me' }], seed);
  while (s.phase !== 'shake') step(s, [null]);
  return s;
}
const go = (s, inp, sec) => { const ev = []; for (let k = 0; k < sec / STEP && s.phase === 'shake'; k++) ev.push(...step(s, [inp])); return ev; };

test('3回せん。CPU どうしで 決着する。同じシードなら同じ', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { s, events } = run(seed);
    assert.deepEqual([...ranking(s)].sort(), [0, 1, 2, 3, 4]);
    assert.equal(events.filter((e) => e.type === 'round').length, RULES.rounds);
    for (const b of s.bottles) assert.equal(b.heights.length, RULES.rounds);
  }
  assert.deepEqual(ranking(run(7).s), ranking(run(7).s));
});

test('ふると あわが たまる。ふらないと こおりが とけて へる', () => {
  const s = toShake();
  go(s, { shake: 1 }, 1);
  const a = s.bottles[0].fizz;
  assert.ok(a > 15, `${a}`);
  go(s, { shake: 0 }, 0.8); // いきおいの ぶん すこし ふえる
  const b = s.bottles[0].fizz;
  assert.ok(b > a, 'やめても すこし ふえる');
  go(s, { shake: 0 }, 2);
  assert.ok(s.bottles[0].fizz < b - 3, 'こおりが とけて へる');
});

test('ポンで とぶ 高さは あわの 量。合計に たされる', () => {
  const s = toShake();
  go(s, { shake: 0.6 }, 1.2);
  const f = s.bottles[0].fizz;
  const ev = step(s, [{ shake: 0, pop: true }]);
  const p = ev.find((e) => e.type === 'pop');
  assert.ok(p);
  assert.ok(Math.abs(p.height - f * RULES.meter) < 0.6);
  assert.equal(s.bottles[0].total, p.height);
});

test('げんかいを こえると ふきこぼれて 0。その前に がたがた(だんだん はげしく)', () => {
  const s = toShake(3);
  const L = limitOf(s);
  let rattleAt = null, ks = [];
  const ev = [];
  for (let k = 0; k < 8 / STEP && s.phase === 'shake' && !s.bottles[0].burst; k++) {
    ev.push(...step(s, [{ shake: 1 }]));
    if (s.bottles[0].rattle && rattleAt === null) rattleAt = s.bottles[0].fizz;
    if (s.bottles[0].rattle) ks.push(rattleK(s, s.bottles[0]));
  }
  assert.ok(ev.some((e) => e.type === 'rattle'));
  assert.ok(rattleAt > L * 0.6 && rattleAt < L * 0.85);
  assert.ok(ks.at(-1) > ks[0], 'がたがたが はげしく なる');
  assert.ok(ev.some((e) => e.type === 'burst'));
  assert.equal(s.bottles[0].height, 0);
});

test('時間ぎれなら 自動で ポン', () => {
  const s = toShake();
  const ev = go(s, { shake: 0.18 }, RULES.shakeTime + 0.1); // ふきこぼれない くらいに よわく
  assert.ok(ev.some((e) => e.type === 'pop' && e.auto));
});

test('順位は 合計 → いちばん 高い 1回', () => {
  const s = createGame(PLAYERS.slice(0, 3), 1);
  Object.assign(s.bottles[0], { total: 40, best: 18 });
  Object.assign(s.bottles[1], { total: 45, best: 16 });
  Object.assign(s.bottles[2], { total: 40, best: 20 });
  assert.deepEqual(ranking(s), [1, 2, 0]);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 150;
  for (let seed = 1; seed <= NN; seed++) wins[ranking(run(seed * 7 + 1, { personalities: PLAYERS.map(() => 'normal') }).s)[0]]++;
  for (const w of wins) assert.ok(w > NN * 0.06 && w < NN * 0.36, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの うでまえでも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', power: 0.8, brave: [0, 0.6], wait: [0, 0.4], react: [0.2, 0.45] };
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
