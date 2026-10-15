import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, createGame, ranking, step } from '../src/games/sled/rules.js';
import { LENGTH, ACORNS, MUSHROOMS, curvatureAt, halfWidthAt, islandAt } from '../src/games/sled/course.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/sled/cpu.js';

const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
const kinds = ['cautious', 'normal', 'bold'];

function run(seed, { personalities = PLAYERS.map((_, i) => kinds[i % 3]), onStep } = {}) {
  const s = createGame(PLAYERS, seed);
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

function solo() {
  const s = createGame(PLAYERS, 1);
  s.t = RULES.readyTime;
  s.phase = 'race';
  return s;
}
const none = () => PLAYERS.map(() => ({}));

test('CPU どうしで回すと、ちゃんとゴールして決着する(30〜50秒)', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { s } = run(seed);
    assert.equal(s.phase, 'finished');
    const w = s.runners[s.winner];
    assert.ok(w.finish !== null, '勝った子はゴールしている');
    assert.ok(w.finish > 25 && w.finish < 50, `seed ${seed}: 1位のタイム ${w.finish.toFixed(1)}秒`);
    assert.ok(s.runners.filter((r) => r.finish !== null).length >= 3, '半分以上はゴールする');
  }
});

test('同じシードなら、同じレースになる', () => {
  const a = run(42).s, b = run(42).s;
  assert.deepEqual(a.runners, b.runners);
});

test('だれも道の外・しげみの島に入らない', () => {
  run(7, { onStep: (s) => {
    for (const r of s.runners) {
      if (r.finish !== null) continue;
      assert.ok(Math.abs(r.x) <= halfWidthAt(r.s) - RULES.bodyR + 1e-6, `x=${r.x} s=${r.s}`);
      const isl = islandAt(r.s);
      if (isl) assert.ok(r.x <= isl.x0 - RULES.bodyR + 1e-6 || r.x >= isl.x1 + RULES.bodyR - 1e-6);
    }
  } });
});

test('なにも押さないと、カーブで外がわへ流されて、ふちにこする', () => {
  const s = solo();
  let scraped = false;
  for (let i = 0; i < 20 / STEP && s.runners[0].s < 80; i++) {
    step(s, none());
    if (s.runners[0].scrape) scraped = true;
  }
  assert.ok(scraped);
});

test('カーブの内がわを走るほうが、外がわより速く進む', () => {
  const lap = (x) => {
    const s = solo();
    const r = s.runners[0];
    r.s = 100; r.v = 9; r.x = x;
    for (const o of s.runners.slice(1)) o.s = -100;
    for (let i = 0; i < 2 / STEP; i++) { step(s, none()); r.x = x; r.vx = 0; }
    return r.s;
  };
  assert.ok(lap(2.4) > lap(-2.4) + 1, '右カーブの内がわ(右)が先に進む');
});

test('両方押すと伏せて速くなる。そのあいだは曲がれない', () => {
  const go = (inp) => {
    const s = solo();
    const r = s.runners[0];
    r.s = 0; r.x = 0;
    for (const o of s.runners.slice(1)) o.s = -100;
    for (let i = 0; i < 2.5 / STEP; i++) step(s, [inp, {}, {}, {}, {}]);
    return r;
  };
  const tuck = go({ left: true, right: true }), plain = go({});
  assert.ok(tuck.v > plain.v + 0.3);
  assert.ok(Math.abs(tuck.x) < 0.01, '伏せているあいだは横に動かない');
});

test('どんぐりを拾うと速くなる。同じどんぐりは2回拾えない', () => {
  const s = solo();
  const r = s.runners[0];
  const a = ACORNS[0];
  r.s = a.s - 1; r.x = a.x; r.v = 8;
  for (const o of s.runners.slice(1)) o.s = -100;
  for (let i = 0; i < 20; i++) { step(s, none()); r.x = a.x; }
  assert.ok(r.acorns >= 1);
  assert.ok(r.boost > 0 || r.v > 8);
  const n = r.acorns;
  r.s = a.s - 1;
  for (let i = 0; i < 20; i++) { step(s, none()); r.x = a.x; }
  assert.ok(r.acorns <= n + 1, 'もう拾ったどんぐりは数えない(となりのどんぐりは拾える)');
});

test('キノコのジャンプ台に乗ると飛ぶ', () => {
  const s = solo();
  const r = s.runners[0];
  const m = MUSHROOMS[0];
  r.s = m.s - 1; r.x = m.x; r.v = 9;
  for (const o of s.runners.slice(1)) o.s = -100;
  let jumped = false;
  for (let i = 0; i < 30; i++) { if (step(s, none()).some((e) => e.type === 'jump')) jumped = true; }
  assert.ok(jumped && r.air > 0);
});

test('わかれ道は、近道のほうが速い', () => {
  const through = (x) => {
    const s = solo();
    const r = s.runners[0];
    r.s = 168; r.v = 10; r.x = x;
    for (const o of s.runners.slice(1)) o.s = -100;
    let t = 0;
    while (r.s < 212) { step(s, none()); r.x = x; r.vx = 0; t += STEP; }
    return t;
  };
  // 遠回りは、どんぐりの列とジャンプ台をよけたところで比べる(拾うと速くなるので)
  assert.ok(through(3.2) < through(-3.6) - 0.3);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const N = 150;
  for (let seed = 1; seed <= N; seed++) wins[run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s.winner]++;
  for (const w of wins) assert.ok(w > N * 0.06 && w < N * 0.4, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの反応でも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', react: [0.45, 0.6], aim: 0.5, look: 22, greed: 1.0, shortcut: 0.5, tuck: 0.6, inside: 0.6 };
  try {
    let rankSum = 0, wins = 0;
    const N = 200; // 100 回だと、はじめの並びだけで勝ち数がぶれる
    for (let seed = 1; seed <= N; seed++) {
      const order = PLAYERS.map((_, i) => (i === 0 ? 'human' : kinds[(i + seed) % 3]));
      const r = ranking(run(seed, { personalities: order }).s);
      rankSum += r.indexOf(0) + 1;
      if (r[0] === 0) wins++;
    }
    assert.ok(rankSum / N <= 3.4, `人の平均順位 ${rankSum / N}`);
    assert.ok(wins / N >= 0.12, `人の勝ち ${wins}/${N}`);
  } finally {
    delete PERSONALITIES.human;
  }
});

test('コースの形: ゴールまでの長さと、わかれ道', () => {
  assert.equal(LENGTH, 320);
  assert.ok(curvatureAt(190) > 0, 'わかれ道は右カーブのとちゅう');
  assert.ok(islandAt(190));
});
