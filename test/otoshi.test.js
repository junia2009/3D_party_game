import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, alive, chargeAt, createGame, ranking, step, windowOf } from '../src/games/otoshi/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/otoshi/cpu.js';

const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
const kinds = Object.keys(PERSONALITIES);

function run(seed, { personalities = PLAYERS.map((_, i) => kinds[(i + seed) % 3]) } = {}) {
  const s = createGame(PLAYERS, seed);
  const cpus = personalities.map((k, slot) => createCpu(k, seed, slot));
  const events = [];
  let guard = 0;
  while (s.phase !== 'finished') {
    events.push(...step(s, cpus.map((c, slot) => cpuInput(c, s, slot))));
    if (++guard > 1200 / STEP) throw new Error('終わらない');
  }
  return { s, events };
}
// じぶんの ばんまで すすめる
function toAim(seed = 1) {
  const s = createGame(PLAYERS, seed);
  while (s.phase !== 'aim') step(s, PLAYERS.map(() => null));
  return s;
}
// いまの ばんの 子が power で たたく(のぼりの とちゅうで はなす)
function swing(s, power) {
  const inp = (hold) => PLAYERS.map((_, i) => (i === s.turn ? { hold } : null));
  const ev = [];
  let k = 0;
  do { ev.push(...step(s, inp(true))); k++; } while (chargeAt(s.hold) < power && k < 200);
  ev.push(...step(s, inp(false)));
  return ev;
}

test('CPU どうしで 決着する。同じシードなら同じ', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const { s, events } = run(seed);
    assert.deepEqual([...ranking(s)].sort(), [0, 1, 2, 3, 4]);
    assert.equal(alive(s).length, 1, 'さいごは 1人');
    assert.equal(events.filter((e) => e.type === 'collapse').length, 4, '4回 くずれる');
  }
  assert.deepEqual(ranking(run(7).s), ranking(run(7).s));
});

test('ためる つよさは 0→1→0 と いったり きたり', () => {
  assert.equal(chargeAt(0), 0);
  assert.ok(Math.abs(chargeAt(RULES.period / 2) - 1) < 1e-9);
  assert.ok(chargeAt(RULES.period * 0.75) < 0.6);
});

test('ちょうどいい つよさで ぬける。だるまが 1だん さがる', () => {
  const s = toAim();
  const n = s.tower.length;
  const [lo, hi] = windowOf(s);
  const who = s.turn;
  const ev = swing(s, (lo + hi) / 2);
  const h = ev.find((e) => e.type === 'hit');
  assert.equal(h.result, 'perfect');
  assert.equal(s.tower.length, n - 1);
  assert.equal(s.knocks[who], 1);
  assert.ok(s.wobble < 0.3);
});

test('よわすぎると ずれる だけ。つぎは よわくて いい', () => {
  const s = toAim();
  const n = s.tower.length;
  const [lo] = windowOf(s);
  const ev = swing(s, lo * 0.4);
  assert.equal(ev.find((e) => e.type === 'hit').result, 'weak');
  assert.equal(s.tower.length, n);
  assert.ok(s.shift > 0);
  assert.ok(windowOf(s)[0] < lo);
});

test('つよすぎると 大きく ぐらぐら。ぐらぐら して いる ときに たたくと くずれて アウト', () => {
  const s = toAim();
  const who = s.turn;
  const ev = swing(s, 0.98);
  assert.equal(ev.find((e) => e.type === 'hit').result, 'strong');
  assert.ok(s.wobble > 0.7 || s.outs[who] !== null);
  // まだ くずれて いなければ、すぐ つぎの 子が また つよく たたく
  if (s.outs[who] === null) {
    while (s.phase !== 'aim') step(s, PLAYERS.map(() => null));
    const next = s.turn;
    const ev2 = swing(s, 0.98);
    assert.ok(ev2.some((e) => e.type === 'collapse'));
    assert.notEqual(s.outs[next], null);
  }
});

test('ぐらぐらは まって いると おさまる', () => {
  const s = toAim();
  s.wobble = 0.6;
  for (let k = 0; k < 2 / STEP; k++) step(s, PLAYERS.map(() => null));
  assert.ok(s.wobble < 0.4);
});

test('だんの しゅるいで ちょうどいい つよさが ちがう', () => {
  const s = toAim();
  const at = (kind) => { s.tower[0] = { kind }; return windowOf(s); };
  assert.ok(at('hard')[0] > at('normal')[0]);
  assert.ok(at('slip')[1] < at('normal')[1]);
});

test('時間ぎれだと よわく たたく', () => {
  const s = toAim();
  const ev = [];
  for (let k = 0; k < (RULES.turnTime + 0.1) / STEP; k++) ev.push(...step(s, PLAYERS.map(() => null)));
  assert.ok(ev.some((e) => e.type === 'timeout'));
});

test('ぜんぶ ぬくと つみなおして むずかしく なる', () => {
  const s = toAim();
  const w0 = windowOf(s);
  const ev = [];
  while (s.round === 0 && s.phase !== 'show') {
    if (s.phase === 'aim') { s.wobble = 0; const [lo, hi] = windowOf(s); ev.push(...swing(s, (lo + hi) / 2)); }
    else ev.push(...step(s, PLAYERS.map(() => null)));
  }
  assert.ok(ev.some((e) => e.type === 'clear'));
  s.tower[0] = { kind: 'normal' };
  const w1 = windowOf(s);
  assert.ok(w1[1] - w1[0] < w0[1] - w0[0]);
});

test('順位は のこった 子 → アウトが おそかった 順', () => {
  const s = createGame(PLAYERS.slice(0, 3), 1);
  s.outs = [10, 20, null];
  assert.deepEqual(ranking(s), [2, 1, 0]);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 120;
  for (let seed = 1; seed <= NN; seed++) wins[ranking(run(seed * 7 + 1, { personalities: PLAYERS.map(() => 'normal') }).s)[0]]++;
  for (const w of wins) assert.ok(w > NN * 0.06 && w < NN * 0.36, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの うでまえでも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', patience: 0.2, aim: 0.09, rush: 2 };
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
