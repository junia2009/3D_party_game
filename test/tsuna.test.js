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
// slot のチームだけ タップ(ぴったり / ずらす)
function pullFor(s, slot, offset, sec) {
  const end = s.t + sec;
  let done = -1;
  while (s.t < end && s.phase === 'play') {
    const b = s.beats[s.nextBeat];
    const press = b && done !== s.nextBeat && s.t >= b.t + offset;
    if (press) done = s.nextBeat;
    step(s, s.runners.map((_, i) => (i === slot ? press : false)));
  }
}

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

test('ビートに ぴったり タップすると、でたらめより 強く引ける', () => {
  const just = createGame(PLAYERS.slice(0, 2), 4);
  toPlay(just);
  const off = createGame(PLAYERS.slice(0, 2), 4);
  toPlay(off);
  just.helpers.forEach((h) => { h.down = 99; }); off.helpers.forEach((h) => { h.down = 99; });
  just.runners[1].down = off.runners[1].down = 99;
  just.runners[0].nextSlip = off.runners[0].nextSlip = 1e9;
  pullFor(just, 0, 0, 4);
  pullFor(off, 0, 0.3, 4);
  assert.ok(just.runners[0].pull > off.runners[0].pull * 2.5, `${just.runners[0].pull} / ${off.runners[0].pull}`);
  const dir = just.runners[0].side === 'R' ? 1 : -1;
  assert.ok(just.p * dir > 0, 'じぶんの がわへ つなが動く');
});

test('すべったら、すぐ タップで ふんばれる。まにあわないと 少し 引けない', () => {
  const s = createGame(PLAYERS.slice(0, 2), 5);
  toPlay(s);
  const r = s.runners[0];
  r.nextSlip = s.t;
  let ev = step(s, [false, false]);
  assert.ok(ev.some((e) => e.type === 'slip' && e.who === 0));
  ev = step(s, [true, false]);
  assert.ok(ev.some((e) => e.type === 'save' && e.who === 0) && r.down === 0);
  r.nextSlip = s.t;
  step(s, [false, false]);
  for (let i = 0; i < (RULES.slipSave + 0.1) / STEP; i++) step(s, [false, false]);
  assert.ok(r.down > 0, 'ころんで 引けない');
});

test('負けている チームは 応援で 少し 強くなる', async () => {
  const { cheer } = await import('../src/games/tsuna/rules.js');
  const s = createGame(PLAYERS.slice(0, 2), 6);
  s.p = 1.2;
  assert.ok(cheer(s, 'R') > 1 && cheer(s, 'L') === 1);
});

test('リズムが ときどき 速く・ゆっくりに なる', () => {
  const s = createGame(PLAYERS, 8);
  const kinds = new Set(s.beats.map((b) => b.kind));
  assert.ok(kinds.has('fast') || kinds.has('slow'));
  assert.ok(kinds.has('normal'));
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 150;
  for (let seed = 1; seed <= NN; seed++) wins[ranking(run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s)[0]]++;
  for (const w of wins) assert.ok(w > NN * 0.08 && w < NN * 0.34, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの リズム感でも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', sd: 0.095, bias: 0.03, spam: 0.2, react: [0.35, 0.9] };
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
