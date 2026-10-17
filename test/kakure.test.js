import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUNDS, RULES, STEP, createGame, ranking, step } from '../src/games/kakure/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/kakure/cpu.js';

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
// ask になるまで(だれも えらばない)
const until = (s, phase) => { for (let i = 0; i < 60 / STEP && s.phase !== phase; i++) step(s, s.runners.map(() => null)); };

test('CPU どうしで遊ぶと、5 回やって決着する(1分ちょっと)', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { s, events } = run(seed);
    assert.equal(s.round, ROUNDS.length - 1);
    const r = ranking(s);
    assert.deepEqual([...r].sort(), [0, 1, 2, 3, 4]);
    assert.equal(r[0], s.winner);
    assert.ok(s.t < 90, `${s.t.toFixed(0)} 秒`);
    assert.equal(events.filter((e) => e.type === 'reveal').length, ROUNDS.length);
  }
});

test('2人でも決着する。同じシードなら同じ試合', () => {
  const { s } = run(3, { players: PLAYERS.slice(0, 2), personalities: ['normal', 'bold'] });
  assert.deepEqual([...ranking(s)].sort(), [0, 1]);
  assert.deepEqual(run(7).s.runners, run(7).s.runners);
});

test('いれかわりのあと、リスの かごの置き場所が あたり。早いもの順にボーナス', () => {
  const s = createGame(PLAYERS.slice(0, 3), 4);
  until(s, 'ask');
  const hiderSlot = s.baskets[s.hider].slot;
  const wrong = (hiderSlot + 1) % 3;
  // 0 番がいちばん早く あてる、2 番が つぎ、1 番は はずす
  step(s, [hiderSlot, null, null]);
  step(s, [null, wrong, null]);
  const ev = step(s, [null, null, hiderSlot]);
  const rv = ev.find((e) => e.type === 'reveal');
  assert.ok(rv, 'みんな こたえたら すぐ こたえあわせ');
  assert.equal(rv.hiderSlot, hiderSlot);
  assert.equal(s.runners[0].score, RULES.hit + RULES.bonus[0]);
  assert.equal(s.runners[2].score, RULES.hit + RULES.bonus[1]);
  assert.equal(s.runners[1].score, 0);
});

test('いれかわりは ほんとうに かごを入れかえる(リスを追える)', () => {
  const s = createGame(PLAYERS.slice(0, 2), 9);
  until(s, 'shuffle');
  let hs = s.baskets[s.hider].slot;
  for (const w of s.swaps) { if (w.a === hs) hs = w.b; else if (w.b === hs) hs = w.a; }
  until(s, 'ask');
  assert.equal(s.baskets[s.hider].slot, hs);
});

test('だんだんむずかしく。3回目から キツネ(えらぶと へる)、4回目から まっくら', () => {
  const s = createGame(PLAYERS.slice(0, 2), 5);
  const seen = [];
  for (let r = 0; r < ROUNDS.length; r++) {
    until(s, 'ask');
    seen.push({ n: s.baskets.length, swaps: s.swaps.length, fox: s.fox !== null, dark: !!s.dark });
    if (s.fox !== null) {
      const fs = s.baskets[s.fox].slot;
      const before = s.runners[0].score;
      step(s, [fs, s.baskets[s.hider].slot]);
      assert.equal(s.runners[0].score, before + RULES.foxPenalty);
    }
    until(s, r + 1 < ROUNDS.length ? 'show' : 'finished');
  }
  assert.ok(seen[0].n < seen[4].n && seen[0].swaps < seen[4].swaps);
  assert.deepEqual(seen.map((x) => x.fox), [false, false, true, true, true]);
  assert.deepEqual(seen.map((x) => x.dark), [false, false, false, true, true]);
});

test('時間ぎれで こたえあわせ(えらばなかった子は 0 点)', () => {
  const s = createGame(PLAYERS.slice(0, 2), 2);
  until(s, 'ask');
  for (let i = 0; i < RULES.askTime / STEP + 2 && s.phase === 'ask'; i++) step(s, [null, null]);
  assert.equal(s.phase, 'reveal');
  assert.deepEqual(s.runners.map((r) => r.score), [0, 0]);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 150;
  for (let seed = 1; seed <= NN; seed++) wins[run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s.winner]++;
  for (const w of wins) assert.ok(w > NN * 0.08 && w < NN * 0.34, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの おぼえ・早さでも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', miss: 0.08, stray: 0.025, dark: 3, think: [1.0, 2.0] };
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
