import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, aliveSlots, createGame, ranking, step } from '../src/games/hayauchi/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/hayauchi/cpu.js';

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
    if (++guard > 600 / STEP) throw new Error('終わらない');
  }
  return { s, events };
}
// 合図を待つところまで進める(だれも うたない)
function toPhase(s, phase, n) {
  for (let i = 0; i < 60 / STEP && s.phase !== phase; i++) step(s, Array(n).fill(false));
}

test('CPU どうしで遊ぶと、勝ちぬきで決着する(時間もかかりすぎない)', () => {
  let total = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { s, events } = run(seed);
    assert.equal(s.phase, 'finished');
    const r = ranking(s);
    assert.deepEqual([...r].sort(), [0, 1, 2, 3, 4]);
    assert.equal(r[0], s.winner);
    assert.equal(aliveSlots(s).length, 1);
    assert.ok(s.t < 120, `${s.t.toFixed(0)} 秒`);
    total += s.t;
    assert.ok(events.some((e) => e.type === 'go'));
  }
  assert.ok(total / 40 < 70, `平均 ${(total / 40).toFixed(0)} 秒`);
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

test('合図のあと いちばん遅い子が脱落する', () => {
  const s = createGame(PLAYERS.slice(0, 3), 1);
  toPhase(s, 'go', 3);
  // 0 → 2 → 1 の順に うつ
  const order = [[0], [2], [1]];
  for (const who of order) {
    for (let i = 0; i < 5; i++) step(s, [false, false, false]);
    step(s, [0, 1, 2].map((k) => who.includes(k)));
  }
  assert.equal(s.phase, 'judge');
  assert.deepEqual(s.last.out, [1]);
  assert.equal(s.last.fastest, 0);
  assert.ok(Math.abs(s.shots[0].react - 6 * STEP) < 1e-6);
  assert.equal(s.alive[1], false);
});

test('合図より前に うつと おてつきで脱落(遅い子は助かる)。なにに つられたかも分かる', () => {
  const s = createGame(PLAYERS.slice(0, 3), 2);
  toPhase(s, 'wait', 3);
  s.fake = { id: 99, kind: 'gyaku', left: 0.5 };
  const ev = step(s, [false, true, false]);
  assert.ok(ev.some((e) => e.type === 'fault' && e.slot === 1 && e.kind === 'gyaku'));
  toPhase(s, 'go', 3);
  for (let i = 0; i < 10; i++) step(s, [i === 2, false, false]);
  for (let i = 0; i < RULES.goLimit / STEP + 2 && s.phase === 'go'; i++) step(s, [false, false, false]);
  assert.equal(s.phase, 'judge');
  assert.deepEqual(s.last.out, [1]);
  assert.ok(s.alive[0] && s.alive[2], 'うてなかった子も、おてつきがいれば助かる');
});

test('かまえているあいだに うっても おてつき', () => {
  const s = createGame(PLAYERS.slice(0, 2), 3);
  toPhase(s, 'ready', 2);
  const ev = step(s, [true, false]);
  assert.ok(ev.some((e) => e.type === 'fault' && e.kind === 'ready'));
});

test('みんな おてつきしたら、だれも脱落せず やりなおし', () => {
  const s = createGame(PLAYERS.slice(0, 3), 4);
  toPhase(s, 'wait', 3);
  const ev = step(s, [true, true, true]);
  assert.ok(ev.some((e) => e.type === 'judge' && e.redo));
  assert.deepEqual(s.alive, [true, true, true]);
  const round = s.round;
  toPhase(s, 'ready', 3);
  assert.equal(s.round, round + 1);
  assert.ok(s.shots.every((x) => x === null));
});

test('ひっかけ: はじめの回は じゃまものだけ。回が進むと にせの合図や 逆も出る', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    run(seed, {
      onStep: (s, ev) => {
        for (const e of ev) {
          if (e.type !== 'fake') continue;
          if (s.round === 1) assert.equal(e.kind, 'jama');
          seen.add(e.kind);
        }
      },
    });
  }
  assert.deepEqual([...seen].sort(), ['gyaku', 'jama', 'nise']);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 150;
  for (let seed = 1; seed <= NN; seed++) wins[run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s.winner]++;
  for (const w of wins) assert.ok(w > NN * 0.08 && w < NN * 0.34, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの反応・つられやすさでも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', react: [0.31, 0.06], fooled: { nise: 0.1, jama: 0.03, gyaku: 0.2 }, itchy: 0.01 };
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
