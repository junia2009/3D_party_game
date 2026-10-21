import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, createGame, onDisk, radiusAt, ranking, step } from '../src/games/bumper/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/bumper/cpu.js';

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
function ready(players = PLAYERS.slice(0, 2), seed = 1) {
  const s = createGame(players, seed);
  while (s.phase !== 'play') step(s, players.map(() => null));
  return s;
}
const idle = (s) => s.runners.map(() => null);
const go = (s, sec, inputs) => {
  const ev = [];
  for (let i = 0; i < sec / STEP && s.phase !== 'finished'; i++) ev.push(...step(s, inputs()));
  return ev;
};

test('CPU どうしで遊ぶと、ひとりが残って決着する', () => {
  let total = 0, timeUp = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { s, events } = run(seed);
    const r = ranking(s);
    assert.deepEqual([...r].sort(), [0, 1, 2, 3, 4]);
    assert.equal(r[0], s.winner);
    total += s.t;
    if (events.find((e) => e.type === 'finished').timeUp) timeUp++;
    assert.ok(events.some((e) => e.type === 'dash'), 'ダッシュする');
    assert.ok(events.some((e) => e.type === 'bump'), 'ぶつかる');
  }
  assert.ok(total / 40 < 60, `平均 ${(total / 40).toFixed(0)} 秒`);
  assert.ok(timeUp <= 4, `時間ぎれ ${timeUp}`);
});

test('2人でも決着する。同じシードなら同じ試合', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const { s } = run(seed, { players: PLAYERS.slice(0, 2), personalities: ['normal', 'bold'] });
    assert.deepEqual([...ranking(s)].sort(), [0, 1]);
  }
  assert.deepEqual(ranking(run(7).s), ranking(run(7).s));
});

test('車は 前へ しか 進まない。スティックの 向きへ だんだん 曲がる', () => {
  const s = ready();
  const r = s.runners[0];
  r.x = 0; r.z = -3; r.h = 0; // +z を 向いている
  s.runners[1].x = -4; s.runners[1].z = 3;
  // 真横(+x)へ たおす: すぐには 横へ 動かない
  go(s, 0.1, () => [{ x: 1, z: 0 }, null]);
  assert.ok(r.h > 0 && r.h < Math.PI / 2, `少し 曲がる ${r.h}`);
  go(s, 1.0, () => [{ x: 1, z: 0 }, null]);
  assert.ok(Math.abs(r.h - Math.PI / 2) < 0.05, '向きが そろう');
  assert.ok(r.vx > 2, `前(+x)へ 走る ${r.vx}`);
  // 手を はなすと だんだん 止まる
  go(s, 2.5, () => [null, null]);
  assert.ok(Math.hypot(r.vx, r.vz) < 0.4);
});

test('ダッシュ: 少し ためてから 前へ ぐんと。つかったあとは しばらく つかえない', () => {
  const s = ready();
  const r = s.runners[0];
  r.x = 0; r.z = -3; r.h = 0; r.vx = r.vz = 0;
  s.runners[1].x = -4; s.runners[1].z = 3;
  let ev = go(s, 0.05, () => [{ x: 0, z: 1, dash: true }, null]);
  assert.ok(ev.some((e) => e.type === 'windup'));
  assert.ok(!ev.some((e) => e.type === 'dash'), 'すぐには とびださない');
  ev = go(s, RULES.windup + 0.05, () => [{ x: 0, z: 1, dash: false }, null]);
  assert.ok(ev.some((e) => e.type === 'dash'));
  assert.ok(r.vz > RULES.boost, `${r.vz}`);
  // すぐ もう一度 おしても でない
  ev = go(s, 0.6, () => [{ x: 0, z: -1, dash: true }, null]);
  assert.ok(!ev.some((e) => e.type === 'windup'));
});

test('ダッシュで 当てると、相手は 大きく はじかれて ふちから 落ちる', () => {
  const s = ready();
  const a = s.runners[0], b = s.runners[1];
  a.x = 0; a.z = 3.0; a.h = 0; a.vx = a.vz = 0;
  b.x = 0; b.z = 4.6; b.h = Math.PI / 2; b.vx = b.vz = 0;
  let pressed = false;
  const ev = go(s, 3, () => { const t = !pressed; pressed = true; return [{ x: 0, z: 1, dash: t }, null]; });
  const bump = ev.find((e) => e.type === 'bump');
  assert.ok(bump && bump.by === 0);
  const fall = ev.find((e) => e.type === 'fall');
  assert.ok(fall && fall.slot === 1 && fall.by === 0);
  assert.equal(s.winner, 0);
  assert.equal(a.pushes, 1);
});

test('リンクは しばらくすると 少しずつ ちぢむ。ふちの 外に いると 落ちる', () => {
  assert.equal(radiusAt(0), RULES.r0);
  assert.equal(radiusAt(RULES.shrinkAt), RULES.r0);
  assert.ok(radiusAt((RULES.shrinkAt + RULES.shrinkEnd) / 2) < RULES.r0);
  assert.equal(radiusAt(999), RULES.rMin);
  const s = ready();
  s.runners[0].x = RULES.r0 - 0.3; s.runners[0].z = 0;
  s.runners[1].x = 0; s.runners[1].z = 2.6;
  const ev = go(s, RULES.shrinkAt + 5, () => idle(s));
  assert.ok(ev.some((e) => e.type === 'shrinkWarn') && ev.some((e) => e.type === 'shrink'));
  const fall = ev.find((e) => e.type === 'fall');
  assert.ok(fall && fall.slot === 0, 'ちぢんだ ふちから 落ちる');
});

test('回る まん中: のると いっしょに 回されて、外へ 流される。回る 向きは かわる', () => {
  const s = ready();
  const r = s.runners[0];
  r.x = 0.8; r.z = 0; r.h = 0; r.vx = r.vz = 0;
  s.runners[1].x = 0; s.runners[1].z = -5;
  assert.ok(onDisk(r));
  const a0 = Math.atan2(r.x, r.z);
  go(s, 0.5, () => idle(s));
  assert.notEqual(Math.atan2(r.x, r.z).toFixed(3), a0.toFixed(3), '回される');
  assert.ok(Math.hypot(r.x, r.z) > 0.8, '外へ 流される');
  const ev = go(s, 30, () => idle(s));
  assert.ok(ev.some((e) => e.type === 'flip'));
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 100;
  for (let seed = 1; seed <= NN; seed++) wins[ranking(run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s)[0]]++;
  for (const w of wins) assert.ok(w > NN * 0.06 && w < NN * 0.36, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの うでまえでも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', react: [0.3, 0.45], aim: 0.42, margin: 1.2, aggro: 0.55, dashAt: 2.9, align: 0.42, dodge: 0.3, disk: 0.6 };
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
