import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, createGame, ranking, step, timeToPass } from '../src/games/nawa/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/nawa/cpu.js';

const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
const kinds = Object.keys(PERSONALITIES);

function run(seed, { personalities = PLAYERS.map((_, i) => kinds[(i + seed) % 3]), players = PLAYERS } = {}) {
  const s = createGame(players, seed);
  const cpus = personalities.map((k, slot) => createCpu(k, seed, slot));
  const events = [];
  let guard = 0;
  while (s.phase !== 'finished') {
    events.push(...step(s, cpus.map((c, slot) => cpuInput(c, s, slot))));
    if (++guard > 600 / STEP) throw new Error('終わらない');
  }
  return { s, events };
}
const toPlay = (s) => { while (s.phase !== 'play') step(s, s.runners.map(() => false)); };
// slot 0 だけ: つぎの 通過の lead 秒前に おして hold 秒 おしつづける。ほかの子は ずっと とんでいない
function jumpOnce(s, lead, hold) {
  const pressAt = s.t + timeToPass(s) - lead;
  const n = s.rope.n;
  const ev = [];
  while (s.rope.n === n) ev.push(...step(s, s.runners.map((_, i) => i === 0 && s.t >= pressAt && s.t < pressAt + hold)));
  return ev.find((e) => e.type === 'pass');
}

test('CPU どうしで遊ぶと 決着する。順位は 5人ぶん', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { s } = run(seed);
    const r = ranking(s);
    assert.deepEqual([...r].sort(), [0, 1, 2, 3, 4]);
    assert.equal(r[0], s.winner);
    assert.equal(s.alive.filter(Boolean).length, 1);
  }
});

test('2人でも決着する。同じシードなら同じ試合', () => {
  const { s } = run(3, { players: PLAYERS.slice(0, 2), personalities: ['normal', 'bold'] });
  assert.deepEqual([...ranking(s)].sort(), [0, 1]);
  assert.deepEqual(ranking(run(7).s), ranking(run(7).s));
});

test('ちょうどよく とべば セーフ。とばないと ひっかかる', () => {
  const s = createGame(PLAYERS.slice(0, 3), 4);
  toPlay(s);
  const pass = jumpOnce(s, 0.125, 0.06);
  assert.equal(pass.kind, 'low');
  assert.ok(!pass.caught.includes(0), 'ジャンプした子は セーフ');
  assert.ok(pass.caught.includes(1) && pass.caught.includes(2));
  assert.ok(s.alive[0] && !s.alive[1] && !s.alive[2]);
});

test('早すぎても 遅すぎても ひっかかる', () => {
  for (const lead of [0.45, -0.02]) {
    const s = createGame(PLAYERS.slice(0, 3), 4);
    toPlay(s);
    const pass = jumpOnce(s, lead, 0.06);
    assert.ok(pass.caught.includes(0), `lead ${lead}`);
  }
});

test('みんな いっしょに ひっかかったら、だれも 脱落しない', () => {
  const s = createGame(PLAYERS, 4);
  toPlay(s);
  const n = s.rope.n;
  let pass;
  while (!pass) pass = step(s, PLAYERS.map(() => false)).find((e) => e.type === 'pass');
  assert.ok(pass.redo && s.rope.n === n + 1);
  assert.equal(s.alive.filter(Boolean).length, 5);
});

test('大なみは 長おしの 大ジャンプで こえられる。ふつうの ジャンプでは ひっかかる', () => {
  const make = () => {
    const s = createGame(PLAYERS.slice(0, 3), 4);
    toPlay(s);
    s.rope.kind = 'high';
    return s;
  };
  const big = jumpOnce(make(), 0.255, RULES.holdTime + 0.08);
  assert.equal(big.kind, 'high');
  assert.ok(!big.caught.includes(0), '大ジャンプなら セーフ');
  const small = jumpOnce(make(), 0.125, 0.06);
  assert.ok(small.caught.includes(0), 'ふつうの ジャンプでは ひっかかる');
  // スマホの タップくらい(0.1 秒)では 大ジャンプに ならない
  const tap = jumpOnce(make(), 0.125, 0.1);
  assert.ok(tap.caught.includes(0));
});

test('なわは だんだん 速くなる。ときどき 大なみ・ゆっくり・カエル', () => {
  const tops = [];
  const { events } = run(11);
  for (const e of events) if (e.type === 'top') tops.push(e);
  assert.ok(Math.min(...tops.map((e) => e.period)) < tops[0].period * 0.8);
  let high = 0, slow = 0, frog = 0;
  for (let seed = 1; seed <= 20; seed++) {
    for (const e of run(seed).events) {
      if (e.type === 'top' && e.kind === 'high') high++;
      if (e.type === 'top' && e.slow) slow++;
      if (e.type === 'frog') frog++;
    }
  }
  assert.ok(high > 0 && slow > 0 && frog > 0, `${high} ${slow} ${frog}`);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 150;
  for (let seed = 1; seed <= NN; seed++) wins[ranking(run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s)[0]]++;
  for (const w of wins) assert.ok(w > NN * 0.08 && w < NN * 0.34, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの タイミングでも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', sd: 0.038, notice: 0.9, slowNotice: 0.6, speedFear: 0.05 };
  try {
    let rankSum = 0, wins = 0;
    const NN = 200;
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
