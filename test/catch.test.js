import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARENA_R, ITEMS, RULES, STEP, createGame, ranking, step, timeLeft } from '../src/games/catch/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/catch/cpu.js';

const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
const kinds = Object.keys(PERSONALITIES);

function run(seed, { personalities = PLAYERS.map((_, i) => kinds[i % kinds.length]), onStep } = {}) {
  const s = createGame(PLAYERS, seed);
  const cpus = personalities.map((k, slot) => createCpu(k, seed, slot));
  const events = [];
  let guard = 0;
  while (s.phase !== 'finished') {
    const ev = step(s, cpus.map((c, slot) => cpuInput(c, s, slot)));
    events.push(...ev);
    onStep?.(s, ev);
    if (++guard > (RULES.readyTime + RULES.timeLimit + 5) / STEP) throw new Error('終わらない');
  }
  return { s, events };
}

// 何も降らない静かな試合を作る(しかけを自分で置いて試す)
function quiet(seed = 1) {
  const s = createGame(PLAYERS, seed);
  s.t = RULES.readyTime;
  s.phase = 'play';
  s.nextShake = 999;
  return s;
}
const idle = () => PLAYERS.map(() => null);

test('CPU どうしで回すと、時間どおりに決着する', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { s, events } = run(seed);
    assert.equal(s.phase, 'finished');
    assert.ok(s.winner !== null);
    assert.equal(ranking(s)[0], s.winner);
    assert.ok(events.some((e) => e.type === 'rain'), 'どんぐりの雨が来る');
    // 勝った子はちゃんと拾っている(ゲームとして成り立っている)
    assert.ok(s.runners[s.winner].acorns >= 5, `seed ${seed}: 勝者が ${s.runners[s.winner].acorns} こ`);
  }
});

test('同じシードなら、同じ試合になる', () => {
  const a = run(42).s, b = run(42).s;
  assert.deepEqual(a.runners, b.runners);
  assert.equal(a.winner, b.winner);
});

test('だれも広場の外に出ない', () => {
  run(7, { onStep: (s) => {
    for (const r of s.runners) assert.ok(Math.hypot(r.x, r.z) <= ARENA_R - RULES.bodyR + 1e-6);
  } });
});

test('どんぐりは消えも増えもしない(受けとる・こぼれる・拾う)', () => {
  // 空から来た数 = かごの中 + 地面にあるもの + 消えたもの
  let fromSky = 0, vanished = 0;
  const value = (it) => (ITEMS[it.kind].value || 0);
  const known = new Map(); // id → 値(空から来たもの・こぼれたもの)
  run(9, { onStep: (s, ev) => {
    for (const e of ev) {
      if (e.type === 'drop') { fromSky += value(e); known.set(e.id, value(e)); }
      if (e.type === 'spill') known.set(e.id, 1);
      if (e.type === 'land' && e.gone) vanished += known.get(e.id); // 試合が終わってから落ちたもの
      if (e.type === 'vanish') vanished += known.get(e.id);
    }
    const inBaskets = s.runners.reduce((n, r) => n + r.acorns, 0);
    const onGround = s.items.filter((it) => it.ground !== null).reduce((n, it) => n + value(it), 0);
    const falling = s.items.filter((it) => it.ground === null).reduce((n, it) => n + value(it), 0);
    assert.equal(inBaskets + onGround + falling + vanished, fromSky);
  } });
});

test('落ちてくるところにいれば受けとれる。金どんぐりは 5 こ分', () => {
  const s = quiet();
  const r = s.runners[0];
  s.items.push({ id: 1, kind: 'acorn', x: r.x + 0.3, z: r.z, left: 0.05, ground: null, lock: 0 });
  s.items.push({ id: 2, kind: 'gold', x: r.x, z: r.z + 0.2, left: 0.1, ground: null, lock: 0 });
  for (let i = 0; i < 10; i++) step(s, idle());
  assert.equal(r.acorns, 1 + ITEMS.gold.value);
  assert.equal(r.golds, 1);
});

test('受けとりそこねたどんぐりは、地面に残って拾える。時間がたつと消える', () => {
  const s = quiet();
  s.items.push({ id: 1, kind: 'acorn', x: 0, z: 0, left: 0.02, ground: null, lock: 0 });
  step(s, idle());
  step(s, idle());
  assert.equal(s.items[0].ground !== null, true, '地面に残る');
  // 0番の子が拾いに行く
  for (let i = 0; i < 120 && s.items.length; i++) step(s, [{ x: 0, z: 0 }, null, null, null, null]);
  assert.equal(s.runners[0].acorns, 1);
  // だれも拾わないと消える
  s.items.push({ id: 2, kind: 'acorn', x: 4, z: 0, left: 0, ground: RULES.groundTime, lock: 0 });
  for (let i = 0; i < (RULES.groundTime + 0.2) / STEP; i++) step(s, idle());
  assert.equal(s.items.length, 0);
});

test('毛虫を受けると目が回って、しばらく動けない', () => {
  const s = quiet();
  const r = s.runners[0];
  s.items.push({ id: 1, kind: 'worm', x: r.x, z: r.z, left: 0.02, ground: null, lock: 0 });
  step(s, idle());
  step(s, idle());
  assert.ok(r.stun > 0);
  const x = r.x;
  for (let i = 0; i < 30; i++) step(s, [{ x: x + 3, z: r.z }, null, null, null, null]);
  assert.ok(Math.abs(r.x - x) < 0.05, '目が回っているあいだは進まない');
  for (let i = 0; i < ITEMS.worm.stun / STEP; i++) step(s, [{ x: x + 3, z: r.z }, null, null, null, null]);
  assert.ok(r.x - x > 0.3, '治ったら動ける');
});

test('勢いよくぶつかると、ぶつけられた子のかごからこぼれる', () => {
  const s = quiet();
  const [a, b] = s.runners;
  a.x = -1.5; a.z = 0; b.x = 0.2; b.z = 0;
  b.acorns = 5;
  for (const r of s.runners.slice(2)) { r.x = 0; r.z = 4.5; }
  s.runners[2].x = -3; s.runners[3].x = 3; s.runners[4].x = 0; s.runners[4].z = -4.5;
  let bump = null;
  for (let i = 0; i < 60 && !bump; i++) {
    const ev = step(s, [{ x: 3, z: 0 }, null, null, null, null]);
    bump = ev.find((e) => e.type === 'bump');
  }
  assert.ok(bump, 'ぶつかった');
  assert.equal(bump.by, 0);
  assert.equal(bump.hit, 1);
  assert.equal(b.acorns, 5 - RULES.spill);
  assert.equal(s.items.filter((it) => it.ground !== null).length, RULES.spill, 'こぼれたどんぐりが地面にある');
});

test('終わりの 10 秒は、どんぐりがたくさん降る', () => {
  let before = 0, rain = 0;
  run(5, { onStep: (s, ev) => {
    const drops = ev.filter((e) => e.type === 'drop').length;
    if (s.phase !== 'play') return;
    if (timeLeft(s) > RULES.rainTime + 10) return;
    if (timeLeft(s) > RULES.rainTime) before += drops;
    else rain += drops;
  } });
  assert.ok(rain > before * 1.6, `雨 ${rain} / ふだん ${before}`);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const N = 150;
  for (let seed = 1; seed <= N; seed++) wins[run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s.winner]++;
  for (const w of wins) assert.ok(w > N * 0.08 && w < N * 0.36, `席ごとの勝ち数 ${wins}`);
});

test('つよき・ふつう・しんちょう、どの性格にも勝ち目がある', () => {
  const wins = Object.fromEntries(kinds.map((k) => [k, 0]));
  for (let seed = 1; seed <= 120; seed++) {
    // 席の有利不利が出ないよう、性格の並びを回す
    const order = PLAYERS.map((_, i) => kinds[(i + seed) % kinds.length]);
    const { s } = run(seed, { personalities: order });
    wins[order[s.winner]]++;
  }
  for (const k of kinds) assert.ok(wins[k] >= 10, `性格ごとの勝ち数 ${JSON.stringify(wins)}`);
});

test('人間くらいの反応(気づくのに 0.6〜0.9 秒)でも、CPU と互角に戦える', () => {
  // 人のかわり: 影に気づくのが遅く、考えなおすのも遅い。席 0 に置いて、CPU の性格はいろいろ
  PERSONALITIES.human = { label: 'ひと', notice: [0.6, 0.9], guess: 0.6, reachMax: 4.2, react: [0.45, 0.6], fear: 0.8, greed: 1.5, bully: 0.05 };
  try {
    let rankSum = 0, wins = 0;
    const N = 100;
    for (let seed = 1; seed <= N; seed++) {
      const order = PLAYERS.map((_, i) => (i === 0 ? 'human' : kinds[(i + seed) % kinds.length]));
      const { s } = run(seed, { personalities: order });
      const r = ranking(s);
      rankSum += r.indexOf(0) + 1;
      if (r[0] === 0) wins++;
    }
    // 5人なので、互角なら平均 3 位・勝ち 20%
    assert.ok(rankSum / N <= 3.4, `人の平均順位 ${rankSum / N}`);
    assert.ok(wins / N >= 0.12, `人の勝ち ${wins}/${N}`);
  } finally {
    delete PERSONALITIES.human;
  }
});
