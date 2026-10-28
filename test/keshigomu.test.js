import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, SHAPES, STEP, canFlick, createGame, halfDesk, launchSpeed, makeBody, ranking, shapeOf, step } from '../src/games/keshigomu/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/keshigomu/cpu.js';

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
// 2つだけ おいた つくえ(ほかは とおくで おちた ことに する)
function duel(kindA = 'maru', kindB = 'maru') {
  const s = createGame(PLAYERS.slice(0, 2), 1);
  while (s.phase !== 'battle') step(s, [null, null]);
  s.bodies[0] = { ...makeBody(kindA, -2, 0, 0) };
  s.bodies[1] = { ...makeBody(kindB, 0, 0, 0) };
  return s;
}
const run2 = (s, inputs, sec) => { const ev = []; for (let k = 0; k < sec / STEP && s.phase === 'battle'; k++) ev.push(...step(s, typeof inputs === 'function' ? inputs(k) : inputs)); return ev; };
// ためて はなす
function flick(s, slot, charge, aim, spin = 0) {
  const ev = [];
  const n = Math.round(charge * RULES.chargeTime / STEP);
  const inp = (hold) => s.bodies.map((_, i) => (i === slot ? { hold, aim, spin } : null));
  for (let k = 0; k < n; k++) ev.push(...step(s, inp(true)));
  ev.push(...step(s, inp(false)));
  return ev;
}
const momentum = (s) => s.bodies.reduce((m, b) => [m[0] + b.mass * b.vx, m[1] + b.mass * b.vy], [0, 0]);

test('CPU どうしで 決着する。同じシードなら同じ', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { s, events } = run(seed);
    assert.deepEqual([...ranking(s)].sort(), [0, 1, 2, 3, 4]);
    assert.ok(events.some((e) => e.type === 'out'));
    assert.ok(s.bodies.filter((b) => !b.out).length <= 1 || s.t > RULES.battleTime, 'のこりが 1つに なるまで(か 時間ぎれ)');
  }
  assert.deepEqual(ranking(run(7).s), ranking(run(7).s));
});

test('ためるほど つよく とぶ。とまって いないと ためられない', () => {
  const a = duel(), b = duel();
  flick(a, 0, 0.2, Math.PI / 2);
  flick(b, 0, 0.9, Math.PI / 2);
  assert.ok(Math.abs(a.bodies[0].vy - launchSpeed(0.2)) < 0.6);
  assert.ok(b.bodies[0].vy > a.bodies[0].vy + 4);
  // うごいて いる あいだは ためられない
  assert.equal(canFlick(b, b.bodies[0]), false);
  run2(b, [{ hold: true, aim: 0 }, null], 0.1);
  assert.equal(b.bodies[0].charge, 0);
});

test('すべると まさつで とまる', () => {
  const s = duel();
  flick(s, 0, 0.3, Math.PI / 2);
  run2(s, [null, null], 3);
  assert.ok(canFlick(s, s.bodies[0]) || s.bodies[0].out);
});

test('ぶつかると 相手が おされる。ぶつかりで いきおいは ふえない', () => {
  const s = duel();
  flick(s, 0, 0.6, 0);
  let before = null;
  for (let k = 0; k < 120 && s.phase === 'battle'; k++) {
    const m = momentum(s);
    const ev = step(s, [null, null]);
    if (ev.some((e) => e.type === 'hit') && !before) {
      before = Math.hypot(...m);
      assert.ok(Math.hypot(...momentum(s)) <= before + 0.3, 'いきおいが ふえない');
    }
  }
  assert.ok(before, 'ぶつかる');
  assert.ok(s.bodies[1].x > 0.5, '相手が おされた');
});

test('ずれて あたると 回る(かどに あたる)', () => {
  const s = duel('kaku', 'naga');
  Object.assign(s.bodies[1], { y: 0.7, a: Math.PI / 2 }); // たての ながしかくの はしっこに あてる
  flick(s, 0, 0.6, 0);
  run2(s, [null, null], 0.6);
  assert.ok(Math.abs(s.bodies[1].a) > 0.05 || Math.abs(s.bodies[1].w) > 0.2);
});

test('ひねると 回りながら すべって、すこし まがる', () => {
  const a = duel(), b = duel();
  for (const t of [a, b]) Object.assign(t.bodies[1], { x: 4, y: -3 }); // じゃまを どける
  flick(a, 0, 0.5, Math.PI / 2, 0);
  flick(b, 0, 0.5, Math.PI / 2, 1);
  assert.ok(Math.abs(b.bodies[0].w) > 3);
  run2(a, [null, null], 0.5);
  run2(b, [null, null], 0.5);
  assert.ok(Math.abs(b.bodies[0].x - a.bodies[0].x) > 0.05, 'まがる');
});

test('つくえから 出ると おちる。おとした 子を おぼえる', () => {
  const s = duel();
  s.bodies[1].x = halfDesk(s)[0] - 0.6;
  s.bodies[0].x = s.bodies[1].x - 2;
  const ev = flick(s, 0, 0.8, 0).concat(run2(s, [null, null], 2));
  const out = ev.find((e) => e.type === 'out' && e.slot === 1);
  assert.ok(out);
  assert.equal(out.by, 0);
});

test('ぶつけられると ためが きえる。いちど はなすまで ためられない', () => {
  const s = duel();
  // 1 が ためて いる ところへ 0 が ぶつかる
  flick(s, 0, 0.7, 0);
  let blocked = false;
  for (let k = 0; k < 60; k++) {
    step(s, [null, { hold: true, aim: 0 }]);
    if (s.bodies[1].blocked) blocked = true;
  }
  assert.ok(blocked);
  assert.equal(s.bodies[1].charge, 0);
});

test('しばらく すると つくえが せまく なる', () => {
  const s = createGame(PLAYERS, 3);
  const ev = [];
  for (let k = 0; k < (RULES.readyTime + RULES.shrinkFrom + 5) / STEP && s.phase !== 'show'; k++) ev.push(...step(s, PLAYERS.map(() => null)));
  assert.ok(ev.some((e) => e.type === 'shrink'));
  assert.ok(s.shrink < 1);
});

test('かたちで おもさと すべりが ちがう', () => {
  assert.equal(shapeOf({ character: 'gonzo' }, 0), 'naga');
  assert.equal(shapeOf({}, 1), 'maru');
  const s = duel('maru', 'naga');
  assert.ok(s.bodies.every((b) => b.mass > 0 && b.I > 0));
  for (const k of Object.keys(SHAPES)) assert.ok(SHAPES[k].circles.length >= 1);
});

test('順位は のこった 子 → おちるのが おそかった 順', () => {
  const s = createGame(PLAYERS.slice(0, 3), 1);
  Object.assign(s.bodies[0], { out: true, outAt: 10 });
  Object.assign(s.bodies[1], { out: true, outAt: 20 });
  assert.deepEqual(ranking(s), [2, 1, 0]);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 150;
  for (let seed = 1; seed <= NN; seed++) wins[ranking(run(seed * 7 + 1, { personalities: PLAYERS.map(() => 'normal') }).s)[0]]++;
  for (const w of wins) assert.ok(w > NN * 0.06 && w < NN * 0.36, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの うでまえでも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', aim: 0.2, power: 0.3, think: [1.2, 2.6], safe: 0.5, extra: 1.1 };
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
