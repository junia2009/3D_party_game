import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELL_COUNT, N, RULES, STEP, createGame, paint, ranking, step } from '../src/games/hana/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/hana/cpu.js';

const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
const kinds = Object.keys(PERSONALITIES);

function run(seed, { personalities = PLAYERS.map((_, i) => kinds[(i + seed) % 3]), players = PLAYERS, onStep } = {}) {
  const s = createGame(players, seed);
  const cpus = personalities.map((k, slot) => createCpu(k, seed, slot));
  const events = [];
  let guard = 0;
  while (s.phase !== 'finished') {
    const ev = step(s, cpus.map((c, slot) => cpuInput(c, s, slot)));
    events.push(...ev);
    onStep?.(s, ev);
    if (++guard > 120 / STEP) throw new Error('終わらない');
  }
  return { s, events };
}
// ます目を数えなおす(counts と合っているか)
function tally(s) {
  const c = s.counts.map(() => 0);
  for (let k = 0; k < N * N; k++) if (s.grid[k] >= 0) c[s.grid[k]]++;
  return c;
}
// レースが始まるまで進めて、だれも動かないようにする(仕掛けも止める)
function ready(players = PLAYERS, seed = 1) {
  const s = createGame(players, seed);
  while (s.phase !== 'play') step(s, players.map(() => null));
  s.nextItem = 1e9;
  s.nextWind = 1e9;
  return s;
}
const idle = (s) => s.runners.map(() => null);

test('CPU どうしで遊ぶと、45 秒で決着して、花畑の多くが咲く', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { s, events } = run(seed);
    assert.equal(s.phase, 'finished');
    const r = ranking(s);
    assert.deepEqual([...r].sort(), [0, 1, 2, 3, 4]);
    assert.equal(r[0], s.winner);
    assert.deepEqual(tally(s), s.counts, '数えた広さと ます目が合う');
    const covered = s.counts.reduce((a, b) => a + b, 0) / CELL_COUNT;
    assert.ok(covered > 0.6, `咲いたのは ${(covered * 100).toFixed(0)}%`);
    assert.ok(events.some((e) => e.type === 'wind'), 'つむじ風が来る');
    assert.ok(events.some((e) => e.type === 'can' || e.type === 'bee'), 'じょうろかミツバチを拾う');
  }
});

test('2人でも決着する', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const { s } = run(seed, { players: PLAYERS.slice(0, 2), personalities: ['normal', 'bold'] });
    assert.equal(s.phase, 'finished');
    assert.deepEqual([...ranking(s)].sort(), [0, 1]);
  }
});

test('同じシードなら、同じ試合になる', () => {
  assert.deepEqual(run(7).s.counts, run(7).s.counts);
});

test('走ったところに、自分の色の花が咲く。ほかの子の花も咲きかえられる', () => {
  const s = ready();
  const r = s.runners[0];
  r.x = -3; r.z = 0;
  const before = s.counts[0];
  const go = (x, z) => { for (let i = 0; i < 1.6 / STEP; i++) step(s, s.runners.map((_, k) => (k === 0 ? { x, z } : null))); };
  go(3, 0);
  assert.ok(s.counts[0] > before + 15, `${before} → ${s.counts[0]}`);
  // ほかの子の色の上を走ると、自分の色になる
  r.x = -3; r.z = 1.5; r.vx = r.vz = 0;
  paint(s, 0, 1.5, 0.8, 1);
  const theirs = s.counts[1];
  go(3, 1.5);
  assert.ok(s.counts[1] < theirs - 10, `咲きかえられた ${theirs} → ${s.counts[1]}`);
  assert.deepEqual(tally(s), s.counts);
});

test('じょうろは まわりを一気に咲かせ、ミツバチは しばらく通り道を太くする', () => {
  const s = ready();
  const r = s.runners[0];
  s.items.push({ id: 99, kind: 'can', x: r.x, z: r.z, life: 5 });
  const before = s.counts[0];
  const ev = step(s, idle(s));
  assert.ok(ev.some((e) => e.type === 'can' && e.slot === 0));
  assert.ok(s.counts[0] - before > 30, `じょうろで +${s.counts[0] - before}`);
  // ミツバチ: 同じ道のりで、ふつうより多く咲く
  const len = (bee) => {
    const t = ready();
    const me = t.runners[0];
    if (bee) t.items.push({ id: 98, kind: 'bee', x: me.x, z: me.z, life: 5 });
    const b = t.counts[0];
    for (let i = 0; i < 1.5 / STEP; i++) step(t, t.runners.map((_, k) => (k === 0 ? { x: 0, z: 0 } : null)));
    return t.counts[0] - b;
  };
  assert.ok(len(true) > len(false) * 1.4, `ミツバチ ${len(true)} / ふつう ${len(false)}`);
});

test('つむじ風は 通ったところの花を散らし、当たった子を飛ばす', () => {
  const s = ready();
  paint(s, 0, 0, 3, 2);
  const r = s.runners[0];
  r.x = 0; r.z = 0;
  s.winds.push({ id: 50, x: -5, z: 0, dx: 1, dz: 0, warn: 0, left: 10 / RULES.windSpeed });
  let blown = false;
  for (let i = 0; i < 4 / STEP; i++) if (step(s, idle(s)).some((e) => e.type === 'blown' && e.slot === 0)) blown = true;
  assert.ok(blown, '飛ばされる');
  assert.ok(r.blown === 1 && Math.hypot(r.x, r.z) > 0.8);
  // 風の通り道(z = 0 の線)の花は散っている
  let left = 0;
  for (let i = 0; i < N; i++) if (s.grid[15 * N + i] === 2) left++;
  assert.equal(left, 0);
  assert.deepEqual(tally(s), s.counts);
});

test('全速で当てると相手がふらふらして、まわりが当てた子の色に。出あいがしらは数えない', () => {
  const hit = (bVel) => {
    const s = ready(PLAYERS.slice(0, 2));
    const [a, b] = s.runners;
    a.x = -0.8; a.z = 3; b.x = 0; b.z = 3; // まん中は ひまわり
    a.vx = 4; a.vz = 0; b.vx = bVel; b.vz = 0;
    let ev = [];
    for (let i = 0; i < 20 && !ev.some((e) => e.type === 'bump'); i++) ev = step(s, [{ x: 5, z: 3 }, bVel ? { x: -5, z: 3 } : null]);
    return { s, ev };
  };
  const { s, ev } = hit(0);
  const e = ev.find((x) => x.type === 'bump');
  assert.ok(e && e.by === 0 && e.hit === 1);
  assert.ok(s.runners[1].stun > 0);
  assert.ok(e.n >= 8, `${e.n} ます 色が変わる`); // 当てた子が通ってきたところは もう自分の色
  assert.ok(!hit(-4).ev.some((x) => x.type === 'bump'), '向かいあって ぶつかったときは どちらも当てていない');
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 100;
  for (let seed = 1; seed <= NN; seed++) wins[run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s.winner]++;
  for (const w of wins) assert.ok(w > NN * 0.08 && w < NN * 0.34, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの反応・ねらいでも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', react: [0.5, 0.7], aim: 0.6, look: 8, greed: 1.2, fear: 0.6, bully: 0.05 };
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
