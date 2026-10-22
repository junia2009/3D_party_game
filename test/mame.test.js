import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, createGame, nextSide, ranking, step } from '../src/games/mame/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/mame/cpu.js';

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
function ready(players = PLAYERS.slice(0, 2), seed = 1) {
  const s = createGame(players, seed);
  while (s.phase !== 'play') step(s, players.map(() => null));
  return s;
}
const wait = (s, sec) => { for (let i = 0; i < sec / STEP; i++) step(s, s.runners.map(() => null)); };

test('葉っぱの ならび: 左右は くじで、同じ 側は 4まい まで。金の まめも ある', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = createGame(PLAYERS, seed);
    assert.equal(s.leaves.length, RULES.leaves);
    let run = 0, prev = null;
    for (const l of s.leaves) { run = l.side === prev ? run + 1 : 1; prev = l.side; assert.ok(run <= 4); }
    assert.ok(s.leaves.slice(0, RULES.beanFrom).every((l) => !l.bean));
    assert.ok(s.leaves.some((l) => l.bean));
  }
});

test('CPU どうしで 遊ぶと、40 秒で 決着する。同じシードなら同じ', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { s, events } = run(seed);
    assert.deepEqual([...ranking(s)].sort(), [0, 1, 2, 3, 4]);
    assert.ok(Math.abs(s.t - RULES.readyTime - RULES.timeLimit) < 0.05);
    assert.ok(events.filter((e) => e.type === 'jump').length > 100);
  }
  assert.deepEqual(ranking(run(7).s), ranking(run(7).s));
});

test('生えた ほうを おすと 1まい 上へ。まちがえると 2まい 下がって 少し 動けない', () => {
  const s = ready();
  const r = s.runners[0];
  for (let i = 0; i < 5; i++) {
    const ev = step(s, [{ side: nextSide(s, r) }, null]);
    assert.ok(ev.some((e) => e.type === 'jump' && e.slot === 0));
    // とびうつる あいだは おしても むだ
    const again = step(s, [{ side: nextSide(s, r) }, null]);
    assert.ok(!again.some((e) => e.slot === 0));
    wait(s, RULES.jumpTime);
  }
  assert.equal(r.leaf, 5);
  const wrong = nextSide(s, r) === 'L' ? 'R' : 'L';
  const ev = step(s, [{ side: wrong }, null]);
  assert.ok(ev.some((e) => e.type === 'miss'));
  assert.equal(r.leaf, 5 - RULES.fallBack);
  assert.ok(!step(s, [{ side: nextSide(s, r) }, null]).some((e) => e.type === 'jump'), '動けない');
  wait(s, RULES.stunTime);
  assert.ok(step(s, [{ side: nextSide(s, r) }, null]).some((e) => e.type === 'jump'));
});

test('金の まめ: 乗ると しばらく 1回で 2まい。先に 着いた 子の もの', () => {
  const s = ready();
  const r = s.runners[0];
  const at = s.leaves.findIndex((l) => l.bean);
  r.leaf = at - 1;
  const ev = step(s, [{ side: nextSide(s, r) }, null]);
  assert.ok(ev.some((e) => e.type === 'bean' && e.slot === 0));
  assert.ok(r.power > 0 && !s.leaves[at].bean);
  wait(s, RULES.jumpTime);
  step(s, [{ side: nextSide(s, r) }, null]);
  assert.equal(r.leaf, at + RULES.powerStep);
  wait(s, RULES.powerTime);
  assert.equal(r.power, 0);
  // あとから 来た 子には もう ない
  const o = s.runners[1];
  o.leaf = at - 1;
  assert.ok(!step(s, [null, { side: nextSide(s, o) }]).some((e) => e.type === 'bean'));
});

test('順位は 高さ。同じ 高さなら 先に 着いた子', () => {
  const s = createGame(PLAYERS.slice(0, 3), 1);
  s.runners[0].leaf = 10; s.runners[0].reachedAt = 5;
  s.runners[1].leaf = 12; s.runners[1].reachedAt = 9;
  s.runners[2].leaf = 10; s.runners[2].reachedAt = 4;
  assert.deepEqual(ranking(s), [1, 2, 0]);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 100;
  for (let seed = 1; seed <= NN; seed++) wins[ranking(run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s)[0]]++;
  for (const w of wins) assert.ok(w > NN * 0.06 && w < NN * 0.36, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの うでまえでも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', react: [0.25, 0.37], miss: 0.05, rush: 0.3 };
  try {
    let rankSum = 0, wins = 0;
    const NN = 120;
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
