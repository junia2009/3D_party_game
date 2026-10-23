import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, birdX, branchSpan, branchY, createGame, ranking, step } from '../src/games/hikouki/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/hikouki/cpu.js';

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
// ひとりで とばす(入力を 関数で きめる)
function fly(s, f, sec) {
  const ev = [];
  for (let k = 0; k < sec / STEP && s.phase !== 'finished'; k++) ev.push(...step(s, [f(s.planes[0], s)]));
  return ev;
}
function ready(seed = 1) {
  const s = createGame([{ id: 'me' }], seed);
  while (s.phase !== 'play') step(s, [null]);
  return s;
}

test('コースは みんな おなじ。わっか・上昇気流・じゃまもの が ある', () => {
  const a = createGame(PLAYERS, 5), b = createGame(PLAYERS, 5);
  assert.deepEqual(a.rings, b.rings);
  assert.ok(a.rings.length >= 25);
  assert.ok(a.rings.some((r) => r.gold && r.y > 10), '高い 金の わっか');
  assert.ok(a.lifts.length >= 3);
  assert.ok(a.branches.length + a.birds.length >= 4);
  for (const r of a.rings) assert.ok(Math.abs(r.x) < RULES.halfW && r.y > RULES.yMin && r.y < RULES.yMax);
});

test('CPU どうしで とぶと、みんな ゴールして 決着する。同じシードなら同じ', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const { s, events } = run(seed);
    assert.deepEqual([...ranking(s)].sort(), [0, 1, 2, 3, 4]);
    assert.ok(s.planes.every((p) => p.finished !== null), 'みんな ゴール');
    assert.ok(events.filter((e) => e.type === 'ring').length > 40);
    assert.ok(events.some((e) => e.type === 'wind'), 'よこかぜ');
  }
  assert.deepEqual(ranking(run(7).s), ranking(run(7).s));
});

test('なにも しないと ゆっくり 下がる。てまえへ おこすと 上がり おそく、むこうへ たおすと 下がり 速く なる', () => {
  const y = (inp) => { const s = ready(); fly(s, () => inp, 1.5); return { y: s.planes[0].y, v: s.planes[0].v }; };
  const none = y({ x: 0, y: 0 }), up = y({ x: 0, y: 1 }), down = y({ x: 0, y: -1 });
  assert.ok(none.y < RULES.startY - 0.5);
  assert.ok(up.y > RULES.startY, 'おこすと 上がる');
  assert.ok(down.y < none.y - 2);
  assert.ok(up.v < none.v && down.v > none.v);
  // 左右
  const s = ready();
  fly(s, () => ({ x: 1, y: 0 }), 1);
  assert.ok(s.planes[0].x > 2);
});

test('わっかを くぐると 点(金は 3点)。はずすと 点なし', () => {
  const s = ready(3);
  const r = s.rings[0];
  // わっかの まん中へ まっすぐ もっていく
  s.planes[0].x = r.x; s.planes[0].y = r.y + 1;
  const ev = fly(s, (p) => ({ x: (r.x - p.x) * 2, y: (r.y - p.y) * 1.5 }), (r.s / RULES.speed) + 1);
  assert.ok(ev.some((e) => e.type === 'ring' && e.id === r.id));
  const gold = { ...r, gold: true };
  s.rings[1] = { ...s.rings[1], gold: true };
  const s2 = ready(3);
  s2.planes[0].x = RULES.halfW; // はしっこ
  const ev2 = fly(s2, () => ({ x: 1, y: 0 }), r.s / RULES.speed + 1);
  assert.ok(ev2.some((e) => e.type === 'missRing' && e.id === r.id));
  void gold;
});

test('上昇気流に はいると 上がる', () => {
  const s = ready(2);
  const l = s.lifts[0];
  const p = s.planes[0];
  Object.assign(p, { s: l.s + 1, x: l.x, y: 6 });
  fly(s, () => ({ x: 0, y: 0 }), 1);
  assert.ok(p.y > 8, `${p.y}`);
});

test('よこかぜは 前に 合図が あって、ながされる', () => {
  const s = ready(4);
  const ev = fly(s, () => ({ x: 0, y: 0.6 }), RULES.windFirst + 2);
  const soon = ev.findIndex((e) => e.type === 'windSoon');
  const wind = ev.findIndex((e) => e.type === 'wind');
  assert.ok(soon >= 0 && wind > soon);
  const dir = ev[wind].dir;
  Object.assign(s.planes[0], { x: 0, y: 8 });
  const x0 = 0;
  fly(s, () => ({ x: 0, y: 0.6 }), 1.5);
  assert.ok((s.planes[0].x - x0) * dir > 1.5);
});

test('じゃまものに ぶつかると くるくる(あやつれない・おそく なる)', () => {
  const s = ready(6);
  const br = s.branches[0];
  const [a, b] = branchSpan(br);
  const p = s.planes[0];
  Object.assign(p, { s: br.s - 1, x: (a + b) / 2, y: branchY(br, s.t + 1 / RULES.speed) });
  // 枝の 高さに あわせて とぶ
  const ev = fly(s, (q, st) => ({ x: 0, y: (branchY(br, st.t) - q.y) * 2 }), 0.4);
  assert.ok(ev.some((e) => e.type === 'hit' && e.what === 'branch'));
  assert.ok(p.stun > 0);
  const bd = s.birds[0];
  if (bd) {
    const s2 = ready(6);
    const q = s2.planes[0];
    Object.assign(q, { s: bd.s - 0.5, y: bd.y });
    q.x = birdX(bd, s2.t + 0.5 / q.v);
    const ev2 = fly(s2, () => ({ x: 0, y: 0.35 }), 0.3);
    assert.ok(ev2.some((e) => e.type === 'hit' && e.what === 'bird'));
  }
});

test('順位は 点 → 先に ゴール', () => {
  const s = createGame(PLAYERS.slice(0, 3), 1);
  Object.assign(s.planes[0], { points: 10, finished: 50 });
  Object.assign(s.planes[1], { points: 12, finished: 55 });
  Object.assign(s.planes[2], { points: 10, finished: 48 });
  assert.deepEqual(ranking(s), [1, 2, 0]);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 100;
  for (let seed = 1; seed <= NN; seed++) wins[ranking(run(seed * 7 + 1, { personalities: PLAYERS.map(() => 'normal') }).s)[0]]++;
  for (const w of wins) assert.ok(w > NN * 0.06 && w < NN * 0.36, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの うでまえでも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', aim: 1.2, lag: 0.2, avoid: 0.55, wind: 0.5, gold: 0.7 };
  try {
    let rankSum = 0, wins = 0;
    const NN = 100;
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
