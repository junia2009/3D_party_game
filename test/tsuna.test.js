import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, TEAM_SIZE, createGame, ranking, step } from '../src/games/tsuna/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/tsuna/cpu.js';

const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
const kinds = Object.keys(PERSONALITIES);

function run(seed, { personalities = PLAYERS.map((_, i) => kinds[(i + seed) % 3]), players = PLAYERS } = {}) {
  const s = createGame(players, seed);
  const cpus = personalities.map((k, slot) => createCpu(k, seed, slot));
  const events = [];
  let guard = 0;
  while (s.phase !== 'finished') {
    events.push(...step(s, cpus.map((c, slot) => cpuInput(c, s, slot))));
    if (++guard > 120 / STEP) throw new Error('終わらない');
  }
  return { s, events };
}
const toPlay = (s) => { while (s.phase !== 'play') step(s, s.runners.map(() => false)); };
// slot だけ 1秒に rate 回 連打
function mash(s, slot, rate, sec) {
  const end = s.t + sec;
  let next = s.t;
  while (s.t < end && s.phase === 'play') {
    const press = s.t >= next;
    if (press) next += 1 / rate;
    step(s, s.runners.map((_, i) => (i === slot ? press : false)));
  }
}
const quiet = (s) => { s.helpers.forEach((h) => { h.down = 1e9; }); s.runners.forEach((r) => { r.nextSlip = 1e9; }); s.seeno.at = 1e9; };

test('チームは 3人ずつ(たりないぶんは すけっと)。5人なら 3人と 2人+すけっと', () => {
  const s = createGame(PLAYERS, 3);
  assert.equal(s.teams.L.length, TEAM_SIZE);
  assert.equal(s.teams.R.length, TEAM_SIZE);
  assert.equal(s.helpers.length, 1);
  const s2 = createGame(PLAYERS.slice(0, 2), 3);
  assert.equal(s2.helpers.length, 4);
});

test('CPU どうしで遊ぶと 決着する。順位は 勝ったチームが 先', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { s } = run(seed);
    const r = ranking(s);
    assert.deepEqual([...r].sort(), [0, 1, 2, 3, 4]);
    const wins = s.runners.filter((x) => x.side === s.winner).length;
    for (let k = 0; k < wins; k++) assert.equal(s.runners[r[k]].side, s.winner);
    assert.ok(s.t < RULES.readyTime + RULES.timeLimit + 1);
  }
});

test('2人でも決着する。同じシードなら同じ試合', () => {
  const { s } = run(3, { players: PLAYERS.slice(0, 2), personalities: ['normal', 'bold'] });
  assert.deepEqual([...ranking(s)].sort(), [0, 1]);
  assert.deepEqual(run(7).s.p, run(7).s.p);
});

test('連打するほど 強く引ける。ただし 速すぎても 上限まで', () => {
  const pull = (rate) => {
    const s = createGame(PLAYERS.slice(0, 2), 4);
    toPlay(s);
    quiet(s);
    mash(s, 0, rate, 3);
    return s;
  };
  const slow = pull(3), fast = pull(8), crazy = pull(30);
  assert.ok(fast.runners[0].pull > slow.runners[0].pull * 2.2, `${fast.runners[0].pull} / ${slow.runners[0].pull}`);
  assert.ok(crazy.runners[0].pull <= RULES.tapCap * 3 + RULES.tapBurst + 0.01, `上限 ${crazy.runners[0].pull}`);
  const dir = fast.runners[0].side === 'R' ? 1 : -1;
  assert.ok(fast.p * dir > 0, 'じぶんの がわへ つなが動く');
});

test('「せーの!」の あいだは 2倍の 力。予告のあとに 来る', () => {
  const s = createGame(PLAYERS.slice(0, 2), 9);
  toPlay(s);
  quiet(s);
  s.seeno.at = s.t + 0.05;
  const kinds = [];
  let doubled = 0, normal = 0;
  for (let i = 0; i < 2 / STEP; i++) {
    for (const e of step(s, [i % 8 === 0, false])) {
      if (e.type.startsWith('seeno')) kinds.push(e.type);
      if (e.type === 'pull') (e.seeno ? doubled++ : normal++, assert.equal(e.pull, e.seeno ? 2 : 1));
    }
  }
  assert.deepEqual(kinds, ['seenoWarn', 'seeno', 'seenoEnd']);
  assert.ok(doubled > 0 && normal > 0);
});

test('すべったら、すばやく 連打で ふんばれる。まにあわないと 少し 引けない', () => {
  const s = createGame(PLAYERS.slice(0, 2), 5);
  toPlay(s);
  quiet(s);
  const r = s.runners[0];
  r.nextSlip = s.t;
  let ev = step(s, [false, false]);
  assert.ok(ev.some((e) => e.type === 'slip' && e.who === 0));
  const before = r.pull;
  let saved = false;
  for (let i = 0; i < RULES.slipTaps; i++) { step(s, [false, false]); saved ||= step(s, [true, false]).some((e) => e.type === 'save' && e.who === 0); }
  assert.ok(saved && r.slip === null && r.down === 0);
  assert.equal(r.pull, before, 'ふんばる 連打では 引けない');
  r.nextSlip = s.t;
  step(s, [false, false]);
  for (let i = 0; i < (RULES.slipSave + 0.1) / STEP; i++) step(s, [i % 40 === 0, false]); // ゆっくりの タップでは まにあわない
  assert.ok(r.down > 0, 'ころんで 引けない');
});

test('負けている チームは 応援で 少し 強くなる', async () => {
  const { cheer } = await import('../src/games/tsuna/rules.js');
  const s = createGame(PLAYERS.slice(0, 2), 6);
  s.p = 1.2; // R が 勝ちそう
  assert.ok(cheer(s, 'L') > 1 && cheer(s, 'R') === 1);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 150;
  for (let seed = 1; seed <= NN; seed++) wins[ranking(run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s)[0]]++;
  for (const w of wins) assert.ok(w > NN * 0.08 && w < NN * 0.34, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの 連打でも、CPU と互角に戦える', () => {
  // スマホで 1秒に 6回くらい・「せーの!」に 気づくのは 少し おそめ
  PERSONALITIES.human = { label: 'ひと', rate: 6.0, wobble: 0.2, react: [0.25, 0.45], boost: 1.2, slipReact: [0.25, 0.5] };
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
