import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOSS, RULES, STEP, aliveSlots, createGame, radiusAt, ranking, step } from '../src/games/sumo/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/sumo/cpu.js';

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
    if (++guard > 200 / STEP) throw new Error('終わらない');
  }
  return { s, events };
}
// はじまるまで進めて、金どんぐりも出ないようにする
function ready(players = PLAYERS.slice(0, 2), seed = 1) {
  const s = createGame(players, seed);
  while (s.phase !== 'play') step(s, players.map(() => null));
  s.nextItem = 1e9;
  return s;
}
const idle = (s) => s.runners.map(() => null);

test('CPU どうしで遊ぶと、ひとりが残って決着する', () => {
  let total = 0, timeUp = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { s, events } = run(seed);
    const r = ranking(s);
    assert.deepEqual([...r].sort(), [0, 1, 2, 3, 4]);
    assert.equal(r[0], s.winner);
    total += s.t;
    if (events.find((e) => e.type === 'finished').timeUp) timeUp++;
    assert.ok(events.some((e) => e.type === 'dash'), 'とっしんする');
    assert.ok(events.filter((e) => e.type === 'fall').length >= 3);
  }
  assert.ok(total / 40 < 60, `平均 ${(total / 40).toFixed(0)} 秒`);
  assert.ok(timeUp <= 4, `時間ぎれ ${timeUp}`);
});

test('2人でも決着する', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const { s } = run(seed, { players: PLAYERS.slice(0, 2), personalities: ['normal', 'bold'] });
    assert.deepEqual([...ranking(s)].sort(), [0, 1]);
  }
});

test('同じシードなら、同じ試合になる', () => {
  assert.deepEqual(ranking(run(7).s), ranking(run(7).s));
});

test('ふちから出ると落ちる。土俵は だんだん ちぢむ', () => {
  const s = ready();
  const r = s.runners[0];
  r.x = s.radius + 0.3; r.z = 0;
  const ev = step(s, idle(s));
  assert.ok(ev.some((e) => e.type === 'fall' && e.slot === 0));
  assert.equal(r.alive, false);
  assert.equal(s.phase, 'finished');
  assert.equal(s.winner, 1);
  assert.equal(radiusAt(0), RULES.r0);
  assert.ok(radiusAt(RULES.shrinkAt + RULES.shrinkTime / 2) < RULES.r0);
  assert.equal(radiusAt(999), RULES.rMin);
});

test('ためて はなすと とっしん。ためるほど速い。ためているあいだは ゆっくり', () => {
  const dashSpeed = (holdSec) => {
    const s = ready();
    const r = s.runners[0];
    r.x = 0; r.z = 0; r.vx = r.vz = 0;
    s.runners[1].x = 3; s.runners[1].z = 3;
    for (let i = 0; i < holdSec / STEP; i++) step(s, [{ x: 0, z: -3, hold: true }, null]);
    const slow = Math.hypot(r.vx, r.vz);
    const ev = step(s, [{ x: 0, z: -3, hold: false }, null]);
    return { ev, sp: Math.hypot(r.vx, r.vz), slow };
  };
  const weak = dashSpeed(0.2), strong = dashSpeed(0.8);
  assert.ok(weak.ev.some((e) => e.type === 'dash'));
  assert.ok(strong.sp > weak.sp + 2, `${weak.sp} → ${strong.sp}`);
  assert.ok(strong.slow <= RULES.maxSpeed * RULES.chargeSpeed + 0.01, 'ためているあいだは ゆっくり');
  assert.ok(!dashSpeed(0.05).ev.some((e) => e.type === 'dash'), 'ちょっとだけ おしたら とっしんしない');
});

test('とっしんで当てると、当てられた子は ふちから落ちる', () => {
  const s = ready();
  const [a, b] = s.runners;
  a.x = 0; a.z = 0; b.x = 0; b.z = -2.4;
  for (let i = 0; i < 0.8 / STEP; i++) step(s, [{ x: 0, z: -3, hold: true }, null]);
  let fell = null;
  step(s, [{ x: 0, z: -3, hold: false }, null]);
  for (let i = 0; i < 3 / STEP && !fell; i++) fell = step(s, idle(s)).find((e) => e.type === 'fall');
  assert.ok(fell && fell.slot === 1 && fell.by === 0, JSON.stringify(fell));
  assert.equal(s.runners[0].pushes, 1);
});

test('金どんぐりで大きく重くなる(おされにくい)', () => {
  const pushed = (power) => {
    const s = ready();
    const [a, b] = s.runners;
    a.x = 0; a.z = 0; b.x = 0; b.z = -1.2;
    if (power) b.power = 99;
    for (let i = 0; i < 0.6 / STEP; i++) step(s, [{ x: 0, z: -3, hold: true }, null]);
    step(s, [{ x: 0, z: -3, hold: false }, null]);
    // 当てられた直後の いちばん速いとき
    let top = 0;
    for (let i = 0; i < 0.4 / STEP && s.phase === 'play'; i++) { step(s, idle(s)); top = Math.max(top, Math.hypot(b.vx, b.vz)); }
    return top;
  };
  assert.ok(pushed(true) < pushed(false) * 0.75, `${pushed(true)} / ${pushed(false)}`);
  const s = ready();
  s.items.push({ id: 9, x: s.runners[0].x, z: s.runners[0].z, life: 5 });
  assert.ok(step(s, idle(s)).some((e) => e.type === 'power' && e.slot === 0));
});

test('こけの上は つるっとすべって、止まるのに時間がかかる', () => {
  const stopDist = (x, z) => {
    const s = ready();
    const r = s.runners[0];
    r.x = x - 0.6; r.z = z; r.vx = 3; r.vz = 0;
    s.runners[1].x = -3; s.runners[1].z = 0.5;
    const x0 = r.x;
    for (let i = 0; i < 1 / STEP; i++) step(s, idle(s));
    return r.x - x0;
  };
  const m = MOSS[0];
  assert.ok(stopDist(m.x, m.z) > stopDist(0, 0.3) * 1.8, `${stopDist(m.x, m.z)} / ${stopDist(0, 0.3)}`);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 120;
  for (let seed = 1; seed <= NN; seed++) wins[run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s.winner]++;
  for (const w of wins) assert.ok(w > NN * 0.08 && w < NN * 0.34, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの反応・ねらいでも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', react: [0.45, 0.65], aim: 0.55, margin: 0.95, aggro: 0.7, dashAt: 1.8, charge: [0.3, 0.7], dodge: 0.3 };
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
