import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, createGame, flipTime, inHole, ranking, showTime, step } from '../src/games/ehon/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/ehon/cpu.js';

const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
const kinds = Object.keys(PERSONALITIES);

function run(seed, { personalities = PLAYERS.map((_, i) => kinds[(i + seed) % 3]), players = PLAYERS } = {}) {
  const s = createGame(players, seed);
  const cpus = personalities.map((k, slot) => createCpu(k, seed, slot));
  const events = [];
  let guard = 0;
  while (s.phase !== 'finished') {
    events.push(...step(s, cpus.map((c, slot) => cpuInput(c, s, slot))));
    if (++guard > 300 / STEP) throw new Error('終わらない');
  }
  return { s, events };
}
function ready(players = PLAYERS.slice(0, 2), seed = 1) {
  const s = createGame(players, seed);
  while (s.phase !== 'play') step(s, players.map(() => null));
  return s;
}
const go = (s, sec, inputs) => {
  const ev = [];
  for (let i = 0; i < sec / STEP && s.phase !== 'finished'; i++) ev.push(...step(s, inputs()));
  return ev;
};

test('ページの 穴は 本の 中に、重ならずに ならぶ', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = createGame(PLAYERS, seed);
    assert.equal(s.holes.length, 4, 'はじめの ページは 4つ');
    for (const h of s.holes) {
      assert.ok(Math.abs(h.x) + h.r <= RULES.W / 2 && h.z - h.r >= 0 && h.z + h.r <= RULES.D);
      for (const o of s.holes) if (o !== h) assert.ok(Math.hypot(o.x - h.x, o.z - h.z) >= h.r * 2);
    }
  }
});

test('CPU どうしで 遊ぶと、ひとりが 残って 決着する', () => {
  let total = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { s, events } = run(seed);
    assert.deepEqual([...ranking(s)].sort(), [0, 1, 2, 3, 4]);
    assert.equal(ranking(s)[0], s.winner);
    assert.ok(events.filter((e) => e.type === 'slam').length >= 3);
    total += s.t;
  }
  assert.ok(total / 30 < 90, `平均 ${(total / 30).toFixed(0)} 秒`);
});

test('2人でも決着する。同じシードなら同じ試合', () => {
  for (let seed = 1; seed <= 10; seed++) assert.deepEqual([...ranking(run(seed, { players: PLAYERS.slice(0, 2), personalities: ['normal', 'bold'] }).s)].sort(), [0, 1]);
  assert.deepEqual(ranking(run(7).s), ranking(run(7).s));
});

test('ページが たおれた とき、穴の 中なら たすかって、外なら ぺちゃんこ', () => {
  const s = ready();
  const h = s.holes[0];
  const a = s.runners[0], b = s.runners[1];
  a.x = h.x; a.z = h.z;
  // b は どの 穴からも 遠い ところ
  let best = null;
  for (let x = -4.5; x <= 4.5; x += 0.25) for (let z = 0.4; z <= 5.6; z += 0.25) if (!inHole(s, x, z) && (!best || Math.min(...s.holes.map((q) => Math.hypot(q.x - x, q.z - z))) > best.d)) best = { x, z, d: Math.min(...s.holes.map((q) => Math.hypot(q.x - x, q.z - z))) };
  b.x = best.x; b.z = best.z;
  const ev = go(s, showTime(0) + flipTime(0) + 0.1, () => [null, null]);
  const slam = ev.find((e) => e.type === 'slam');
  assert.ok(slam);
  assert.deepEqual(slam.squashed, [1]);
  assert.ok(a.alive && !b.alive);
  assert.equal(s.winner, 0);
});

test('穴の 数: はじめの 3まいは 4つ、そのあとは 2〜4', () => {
  const counts = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const { events } = run(seed);
    for (const e of events.filter((x) => x.type === 'page')) {
      if (e.page < 3) assert.equal(e.holes.length, 4, `${e.page}まいめ`);
      else { assert.ok(e.holes.length >= 2 && e.holes.length <= 4); counts.add(e.holes.length); }
    }
  }
  assert.deepEqual([...counts].sort(), [2, 3, 4]);
});

test('つぎの ページは 新しい 穴。めくれる 速さは だんだん 速くなる', () => {
  assert.ok(showTime(0) > showTime(5) && showTime(5) > showTime(15));
  assert.equal(showTime(999), RULES.showMin);
  assert.ok(flipTime(0) > flipTime(10));
  const s = ready(PLAYERS.slice(0, 2), 3);
  const first = s.holes.map((h) => h.x);
  // ふたりとも 穴に 入れて、1まい めくる
  const ev = [];
  for (let i = 0; i < (showTime(0) + flipTime(0) + RULES.after + 0.1) / STEP; i++) {
    s.runners.forEach((r, k) => { const h = s.holes[k]; r.x = h.x; r.z = h.z; });
    ev.push(...step(s, [null, null]));
  }
  assert.equal(s.page, 1);
  assert.ok(ev.some((e) => e.type === 'page' && e.page === 1));
  assert.notDeepEqual(s.holes.map((h) => h.x), first);
});

test('本の 外へは 出られない。ぶつかると おしあう', () => {
  const s = ready();
  const [a, b] = s.runners;
  a.x = 0; a.z = 3;
  b.x = 3; b.z = 3;
  go(s, 2, () => [{ x: -1, z: 1 }, { x: -1, z: 0 }]);
  assert.ok(a.x >= -RULES.W / 2 && a.z <= RULES.D);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= RULES.bodyR * 2 - 0.05);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 100;
  for (let seed = 1; seed <= NN; seed++) wins[ranking(run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s)[0]]++;
  for (const w of wins) assert.ok(w > NN * 0.06 && w < NN * 0.36, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの うでまえでも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', react: [0.32, 0.55], miss: 0.06, crowd: 0.6, aim: 0.35 };
  try {
    let rankSum = 0, wins = 0;
    const NN = 120;
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
