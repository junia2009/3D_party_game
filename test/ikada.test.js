import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, createGame, ranking, step } from '../src/games/ikada/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/ikada/cpu.js';
import { FALLS, LENGTH, ROCKS, WHIRLS, halfWidthAt } from '../src/games/ikada/course.js';

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
    if (++guard > 300 / STEP) throw new Error('終わらない');
  }
  return { s, events };
}
// ひとりだけ川に置いて、レースが始まるまで進める
function solo(seed = 1) {
  const s = createGame([{ id: 'a' }], seed);
  while (s.phase !== 'race') step(s, [null]);
  return s;
}
// 1秒に rate 回、side の順にたたく(side は -1 左 / 1 右 / 'alt' 交互)
function paddle(s, sec, side, rate = 6) {
  let next = 0, k = 0;
  for (let i = 0; i < sec / STEP; i++) {
    next -= STEP;
    let inp = null;
    if (next <= 0) {
      next = 1 / rate;
      const sd = side === 'alt' ? (k++ % 2 ? 1 : -1) : side;
      inp = sd < 0 ? { left: true } : { right: true };
    }
    step(s, [inp]);
  }
}

test('CPU どうしで下ると、みんなゴールして決着する', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { s, events } = run(seed);
    assert.equal(s.phase, 'finished');
    const r = ranking(s);
    assert.deepEqual([...r].sort(), [0, 1, 2, 3, 4]);
    assert.equal(r[0], s.winner);
    const win = s.runners[s.winner].finish;
    assert.ok(win > 35 && win < 65, `1位のタイム ${win.toFixed(1)} 秒`);
    assert.ok(s.runners.filter((x) => x.finish !== null).length >= 4, 'ほとんどがゴールする');
    assert.ok(events.some((e) => e.type === 'fall') && events.some((e) => e.type === 'splash'), '滝を落ちる');
  }
});

test('2人の対決でも決着する', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const { s } = run(seed, { players: PLAYERS.slice(0, 2), personalities: ['normal', 'bold'] });
    assert.equal(s.phase, 'finished');
    assert.deepEqual([...ranking(s)].sort(), [0, 1]);
  }
});

test('同じシードなら、同じレースになる', () => {
  const a = run(5).s, b = run(5).s;
  assert.deepEqual(a.runners.map((r) => r.finish), b.runners.map((r) => r.finish));
});

test('交互にこぐと まっすぐ速い。同じがわばかりだと 反対へ曲がって(本物の舟と同じ)、進みは弱い', () => {
  const alt = solo(); paddle(alt, 4, 'alt');
  const left = solo(); paddle(left, 4, -1);
  const right = solo(); paddle(right, 4, 1);
  const r0 = alt.runners[0], rl = left.runners[0], rr = right.runners[0];
  assert.ok(r0.v > rl.v + 0.5, `交互 ${r0.v.toFixed(2)} > 左ばかり ${rl.v.toFixed(2)}`);
  assert.ok(rl.x > r0.x + 0.8, '左をこぐと右へ');
  assert.ok(rr.x < r0.x - 0.8, '右をこぐと左へ');
  // こがなくても、流れが運んでくれる(でも こいだほうが速い)
  const idle = solo(); paddle(idle, 4, 'alt', 0.0001);
  assert.ok(idle.runners[0].s > 5 && r0.s > idle.runners[0].s + 8);
});

test('速くたたくほど速い。でも2倍たたいても2倍にはならない。速すぎるタップは数えない', () => {
  // 岩のない、はじめのまっすぐな所で、4 秒にこいで進んだ分(流れのぶんは引く)
  const go = (rate) => { const s = solo(); s.runners[0].x = 0; paddle(s, 4, 'alt', rate); return s.runners[0].s; };
  const idle = go(0.0001), g4 = go(4) - idle, g8 = go(8) - idle;
  assert.ok(g8 > g4 && g8 < g4 * 1.6, `4回 ${g4.toFixed(2)}m / 8回 ${g8.toFixed(2)}m`);
  const s = solo();
  let n = 0;
  for (let i = 0; i < 60; i++) n += step(s, [i % 2 ? { left: true } : { right: true }]).filter((e) => e.type === 'stroke').length;
  assert.ok(n <= 1 / RULES.strokeCool + 1, `1秒に ${n} かき`);
});

test('岩にぶつかると止まって回る。岸に近い岩でも、はさまらずに通りぬけられる', () => {
  for (const rock of ROCKS) {
    const s = solo();
    const r = s.runners[0];
    r.s = rock.s - 4;
    r.x = rock.x;
    let crashed = false;
    for (let i = 0; i < 20 / STEP && r.s < rock.s + 2; i++) {
      const ev = step(s, [i % 10 === 0 ? (i % 20 ? { left: true } : { right: true }) : null]);
      if (ev.some((e) => e.type === 'crash')) {
        if (!crashed) { assert.ok(r.spin > 0); }
        crashed = true;
      }
    }
    assert.ok(crashed, `岩 s=${rock.s} にぶつかる`);
    assert.ok(r.s >= rock.s + 2, `岩 s=${rock.s} を通りぬける`);
    assert.ok(r.crashes <= 2, `岩 s=${rock.s}: 押しつけられているあいだは数えない(${r.crashes})`);
  }
});

test('うずに入ると、こがなければ しばらく出られない。こげば抜け出せる', () => {
  for (const w of WHIRLS) {
    const s = solo();
    const r = s.runners[0];
    r.s = w.s - w.R * 0.5;
    r.x = w.x;
    let inside = 0;
    for (let i = 0; i < 4 / STEP; i++) { step(s, [null]); if (r.whirl >= 0) inside++; }
    assert.ok(inside * STEP > 3, `こがないと うずの中(${(inside * STEP).toFixed(1)} 秒)`);
    paddle(s, 6, 'alt', 6);
    assert.equal(r.whirl, -1, 'こいで抜け出す');
    assert.ok(r.s > w.s + w.R);
  }
});

test('滝で落ちて、落ちたあとは勢いがつく', () => {
  const s = solo();
  const r = s.runners[0];
  r.s = FALLS[0].s - 1;
  r.x = 0;
  const ev = [];
  for (let i = 0; i < 1.2 / STEP; i++) ev.push(...step(s, [null]));
  assert.ok(ev.some((e) => e.type === 'fall'));
  assert.ok(ev.some((e) => e.type === 'splash'));
  assert.ok(r.v >= RULES.fallBoost * 0.7);
});

test('横からぶつかると、当てられたほうが大きくはじかれる', () => {
  const s = createGame(PLAYERS.slice(0, 2), 1);
  while (s.phase !== 'race') step(s, [null, null]);
  const [a, b] = s.runners;
  a.s = b.s = 20; a.x = -0.8; b.x = 0.6;
  a.v = 3; a.yaw = 0.8; b.v = 3; b.yaw = 0;
  let ev = [];
  for (let i = 0; i < 20 && !ev.some((e) => e.type === 'bump'); i++) ev = step(s, [null, null]);
  assert.ok(ev.some((e) => e.type === 'bump'));
  assert.ok(b.kx > Math.abs(a.kx), `当てられた ${b.kx.toFixed(2)} / 当てた ${a.kx.toFixed(2)}`);
});

test('いかだは川の外へ出ない', () => {
  run(3, { onStep: (s) => { for (const r of s.runners) assert.ok(Math.abs(r.x) <= halfWidthAt(r.s) + 1e-6); } });
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const N = 100;
  for (let seed = 1; seed <= N; seed++) wins[run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s.winner]++;
  for (const w of wins) assert.ok(w > N * 0.08 && w < N * 0.34, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの速さ(1秒に6回)・反応でも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', rate: 6.0, jitter: 0.35, rest: 0.08, react: [0.4, 0.6], aim: 0.5, look: 1.8, inside: 0.4, bump: 0 };
  try {
    let rankSum = 0, wins = 0;
    const N = 120;
    for (let seed = 1; seed <= N; seed++) {
      const r = ranking(run(seed, { personalities: PLAYERS.map((_, i) => (i === 0 ? 'human' : kinds[(i + seed) % 3])) }).s);
      rankSum += r.indexOf(0) + 1;
      if (r[0] === 0) wins++;
    }
    assert.ok(rankSum / N <= 3.4, `人の平均順位 ${rankSum / N}`);
    assert.ok(wins / N >= 0.1, `人の勝ち ${wins}/${N}`);
  } finally {
    delete PERSONALITIES.human;
  }
});

test('川は ゴールまで続いていて、岩は川の中にある', () => {
  for (const k of ROCKS) assert.ok(Math.abs(k.x) + k.r < halfWidthAt(k.s), `岩 s=${k.s}`);
  assert.ok(LENGTH > 200);
});
