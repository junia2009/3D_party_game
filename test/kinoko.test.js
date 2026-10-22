import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEXES, RULES, STEP, createGame, hexAt, inHex, moveTime, ranking, solidAt, step } from '../src/games/kinoko/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/kinoko/cpu.js';

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
const idle = (s) => () => s.runners.map(() => null);
const place = (r, h, dx = 0, dz = 0) => { r.x = h.x + dx; r.z = h.z + dz; r.vx = r.vz = 0; r.y = 0; r.air = false; };

test('キノコは 7つ。まん中と まわり 6つが すきまなく ならぶ', () => {
  assert.equal(HEXES.length, 7);
  assert.equal(new Set(HEXES.map((h) => h.color)).size, 7);
  for (const h of HEXES) assert.equal(hexAt(h.x, h.z)?.id, h.id);
  // となりの キノコの さかいめも 立てる(すきまは ふみこえられる)
  const s = createGame(PLAYERS, 1);
  for (const h of HEXES.slice(1)) assert.ok(solidAt(s, h.x / 2, h.z / 2), `まん中と ${h.color} の あいだ`);
  assert.ok(!solidAt(s, 7, 0), '外は 湖');
  assert.ok(inHex(HEXES[0], 0, RULES.hexR * 0.9) && !inHex(HEXES[0], RULES.hexR * 0.95, 0));
});

test('CPU どうしで 遊ぶと、ひとりが 残って 決着する', () => {
  let total = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { s, events } = run(seed);
    assert.deepEqual([...ranking(s)].sort(), [0, 1, 2, 3, 4]);
    assert.equal(ranking(s)[0], s.winner);
    assert.ok(events.some((e) => e.type === 'flag'));
    total += s.t;
  }
  assert.ok(total / 30 < 75, `平均 ${(total / 30).toFixed(0)} 秒`);
});

test('2人でも決着する。同じシードなら同じ試合', () => {
  for (let seed = 1; seed <= 10; seed++) assert.deepEqual([...ranking(run(seed, { players: PLAYERS.slice(0, 2), personalities: ['normal', 'bold'] }).s)].sort(), [0, 1]);
  assert.deepEqual(ranking(run(7).s), ranking(run(7).s));
});

test('旗の 色の キノコだけ のこって、ほかに いた子は 落ちる', () => {
  const s = ready();
  let guard = 0;
  while (s.stage !== 'signal') { step(s, [null, null]); if (++guard > 600) throw new Error('旗が あがらない'); }
  const keep = HEXES[s.flag], other = HEXES.find((h) => h.id !== s.flag);
  place(s.runners[0], keep);
  place(s.runners[1], other);
  const ev = go(s, moveTime(s.round) + RULES.sinkTime + 0.2, () => [null, null]);
  const fall = ev.find((e) => e.type === 'fall');
  assert.ok(fall && fall.slot === 1 && fall.sunk, '旗では ない キノコの 子が 落ちる');
  assert.ok(s.runners[0].alive);
  assert.equal(s.winner, 0);
});

test('しずむまでの 時間は だんだん 短くなる', () => {
  assert.ok(moveTime(0) > moveTime(5) && moveTime(5) > moveTime(8));
  assert.equal(moveTime(99), RULES.moveMin);
});

test('ジャンプ中に もう一度 おすと ヒップドロップ。まわりの子を はじく', () => {
  const s = createGame(PLAYERS.slice(0, 3), 2);
  while (s.phase !== 'play') step(s, [null, null, null]);
  s.stageT = 99; // 旗を またせる
  const [a, b, c] = s.runners;
  place(a, HEXES[0]); place(b, HEXES[0], 0.9, 0); place(c, HEXES[4]);
  let ev = go(s, STEP, () => [{ x: 0, z: 0, jump: true }, null, null]);
  assert.ok(ev.some((e) => e.type === 'jump') && a.air);
  ev = go(s, 0.2, () => [null, null, null]);
  ev = go(s, STEP, () => [{ x: 0, z: 0, jump: true }, null, null]);
  assert.ok(ev.some((e) => e.type === 'drop'));
  ev = go(s, 0.8, () => [null, null, null]);
  assert.ok(ev.some((e) => e.type === 'slam'));
  assert.ok(ev.some((e) => e.type === 'knock' && e.slot === 1 && e.by === 0));
  assert.ok(b.x > HEXES[0].x + 1.3, `はじかれる ${b.x}`);
});

test('上から 相手の 頭に のると ふんづけ。相手は 少し 動けない', () => {
  const s = ready();
  s.stageT = 99;
  const [a, b] = s.runners;
  place(b, HEXES[0]);
  place(a, HEXES[0]);
  a.y = 1.2; a.air = true; a.vy = -1;
  const ev = go(s, 0.1, () => [null, { x: 1, z: 0 }]);
  assert.ok(ev.some((e) => e.type === 'stomp' && e.slot === 0 && e.target === 1));
  assert.ok(b.squash > 0 && a.vy > 0);
  const x0 = b.x;
  go(s, 0.3, () => [null, { x: 1, z: 0 }]);
  assert.ok(Math.abs(b.x - x0) < 0.2, '動けない');
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 100;
  for (let seed = 1; seed <= NN; seed++) wins[ranking(run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s)[0]]++;
  for (const w of wins) assert.ok(w > NN * 0.06 && w < NN * 0.36, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの うでまえでも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', react: [0.35, 0.6], miss: 0.07, home: 0.65, aggro: 0.4, aim: 0.45 };
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
