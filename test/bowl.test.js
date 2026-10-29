import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, canThrow, createGame, ranking, step } from '../src/games/bowl/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/bowl/cpu.js';

const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
const kinds = Object.keys(PERSONALITIES);
const none = () => PLAYERS.map(() => null);

function run(seed, { personalities = PLAYERS.map((_, i) => kinds[(i + seed) % 3]) } = {}) {
  const s = createGame(PLAYERS, seed);
  const cpus = personalities.map((k, slot) => createCpu(k, seed, slot));
  const events = [];
  let guard = 0;
  while (s.phase !== 'finished') {
    events.push(...step(s, cpus.map((c, slot) => cpuInput(c, s, slot))));
    if (++guard > 400 / STEP) throw new Error('終わらない');
  }
  return { s, events };
}
// aim に なるまで すすめる
function toAim(seed = 1) {
  const s = createGame(PLAYERS, seed);
  while (s.phase !== 'aim') step(s, none());
  return s;
}
// 1投 ぶん: slot 0 だけ inp で 投げて、けっかまで
function throwOnce(s, inp) {
  const ev = [];
  let first = true;
  while (s.phase === 'aim' || s.phase === 'roll') {
    ev.push(...step(s, PLAYERS.map((_, i) => (first || i ? (i === 0 ? inp : { angle: 0.5, speed: 0, spin: 0 }) : null))));
    first = false;
  }
  return ev;
}

test('CPU どうしで さいごまで あそべる。同じシードなら同じ', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const { s, events } = run(seed);
    assert.deepEqual([...ranking(s)].sort(), [0, 1, 2, 3, 4]);
    assert.ok(events.filter((e) => e.type === 'pin').length > 40, 'ピンが たおれる');
    for (const p of s.players) assert.equal(p.frames.length, RULES.frames);
    // 点は フレームの 点の 合計
    for (const p of s.players) assert.equal(p.score, p.frames.reduce((a, b) => a + b, 0));
  }
  assert.deepEqual(ranking(run(7).s), ranking(run(7).s));
});

test('まっすぐ まんなかより すこし ずらすと ストライク。ストライクの 子は 2回目 お休み', () => {
  const s = toAim(1);
  s.obstacles = [];
  const ev = throwOnce(s, { angle: 0.006, speed: 0.75, spin: 0 });
  const sc = ev.find((e) => e.type === 'scored' && e.slot === 0);
  assert.equal(sc.mark, 'strike');
  assert.equal(sc.knocked, 10);
  assert.equal(sc.pts, 10 + RULES.gold + RULES.strike, '金の ピンも たおれて いる');
  while (s.phase !== 'aim') step(s, none());
  assert.equal(s.throwNo, 1);
  assert.ok(!canThrow(s, 0), 'ストライクの 子は 投げない');
  assert.ok(canThrow(s, 1));
});

test('みぞに おちると 0本。2回目で のこりを たおすと スペア', () => {
  const s = toAim(2);
  s.obstacles = [];
  const ev = throwOnce(s, { angle: RULES.maxAngle, speed: 0.8, spin: 0.6 });
  assert.ok(ev.some((e) => e.type === 'gutter' && e.slot === 0));
  assert.equal(ev.find((e) => e.type === 'scored' && e.slot === 0).knocked, 0);
  while (s.phase !== 'aim') step(s, none());
  // 2回目: ぜんぶ たおす
  const ev2 = throwOnce(s, { angle: 0.006, speed: 0.75, spin: 0 });
  const sc = ev2.find((e) => e.type === 'scored' && e.slot === 0);
  assert.equal(sc.mark, 'spare');
  assert.equal(s.players[0].spares, 1);
});

test('立つ 場所を えらべる(はばの 中だけ)。はじに 立てば まんなかの 小石を よけられる', () => {
  const s = toAim(4);
  step(s, PLAYERS.map((_, i) => (i === 0 ? { x: 0.3, angle: 0, speed: 0.6, spin: 0 } : i === 1 ? { x: 9, angle: 0, speed: 0.6, spin: 0 } : null)));
  assert.ok(Math.abs(s.lanes[0].ball.x - 0.3) < 0.05);
  assert.ok(s.lanes[1].ball.x <= RULES.stance + 1e-9, 'はばの そとには 立てない');
  // まんなかに 小石: まんなかから まっすぐは あたる、はじからは あたらない
  const hit = (x) => {
    const g = toAim(4);
    g.obstacles = [{ x: 0, y: 3, r: 0.07, kind: 'stone' }];
    return throwOnce(g, { x, angle: 0, speed: 0.7, spin: 0 }).some((e) => e.type === 'bump' && e.slot === 0);
  };
  assert.ok(hit(0));
  assert.ok(!hit(0.3));
});

test('ひねると まがる', () => {
  const xs = [-0.6, 0, 0.6].map((spin) => {
    const s = toAim(3);
    s.obstacles = [];
    step(s, PLAYERS.map((_, i) => (i === 0 ? { angle: 0, speed: 0.6, spin } : null)));
    for (let k = 0; k < 60; k++) step(s, none());
    return s.lanes[0].ball.x;
  });
  assert.ok(xs[0] < xs[1] - 0.05 && xs[2] > xs[1] + 0.05, `よこの ずれ ${xs}`);
});

test('じゃまものに あたると 向きが かわる', () => {
  const s = toAim(4);
  const o = s.obstacles[0];
  s.obstacles = [o];
  const angle = Math.atan2(o.x, o.y); // じゃまものへ まっすぐ
  const ev = throwOnce(s, { angle, speed: 0.7, spin: 0 });
  assert.ok(ev.some((e) => e.type === 'bump' && e.slot === 0));
});

test('なげないと しばらくして そっと 投げる(すすむ)', () => {
  const s = toAim(5);
  const ev = [];
  for (let k = 0; k < (RULES.aimTime + 0.2) / STEP; k++) ev.push(...step(s, none()));
  assert.equal(ev.filter((e) => e.type === 'throw' && e.auto).length, 5);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 40;
  for (let seed = 1; seed <= NN; seed++) wins[ranking(run(seed * 7 + 1, { personalities: PLAYERS.map(() => 'normal') }).s)[0]]++;
  for (const w of wins) assert.ok(w > NN * 0.06 && w < NN * 0.36, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの うでまえでも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', aim: 0.024, power: 0.12, spinErr: 0.2, spins: [-0.5, 0, 0.5], speeds: [0.75], gold: 1, think: [1.5, 3] };
  try {
    let rankSum = 0, wins = 0;
    const NN = 30;
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
