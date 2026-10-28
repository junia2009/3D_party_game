import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, cellOf, createGame, isFloor, moverUp, neighbors, ranking, step } from '../src/games/meiro/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/meiro/cpu.js';

const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
const kinds = Object.keys(PERSONALITIES);

function run(seed, { personalities = PLAYERS.map((_, i) => kinds[(i + seed) % 3]) } = {}) {
  const s = createGame(PLAYERS, seed);
  const cpus = personalities.map((k, slot) => createCpu(k, seed, slot));
  const events = [];
  let guard = 0;
  while (s.phase !== 'finished') {
    events.push(...step(s, cpus.map((c, slot) => cpuInput(c, s, slot))));
    if (++guard > 200 / STEP) throw new Error('終わらない');
  }
  return { s, events };
}
function toPlay(seed = 1) {
  const s = createGame(PLAYERS, seed);
  while (s.phase !== 'play') step(s, PLAYERS.map(() => null));
  s.ghosts = []; // おばけは じゃま なので どける(ひつような テストで もどす)
  return s;
}
const go = (s, inputs, sec) => { const ev = []; for (let k = 0; k < sec / STEP && s.phase === 'play'; k++) ev.push(...step(s, typeof inputs === 'function' ? inputs() : inputs)); return ev; };
// めいろが ぜんぶ つながって いるか(うごく かべは しずんで いる として)
function reachable(s, x0, y0) {
  const seen = new Set([`${x0},${y0}`]);
  const q = [[x0, y0]];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (s.grid[ny]?.[nx] === 0 && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); q.push([nx, ny]); }
    }
  }
  return seen;
}

test('CPU どうしで 60 秒 あそべる。同じシードなら同じ', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const { s, events } = run(seed);
    assert.deepEqual([...ranking(s)].sort(), [0, 1, 2, 3, 4]);
    assert.ok(events.filter((e) => e.type === 'get').length > 50, 'どんぐりが とられる');
  }
  assert.deepEqual(ranking(run(7).s), ranking(run(7).s));
});

test('めいろは シードで ちがって、どこからでも ぜんぶの ゆかへ いける', () => {
  const a = createGame(PLAYERS, 1), b = createGame(PLAYERS, 2);
  assert.notDeepEqual(a.grid, b.grid);
  for (const s of [a, b]) {
    let floors = 0;
    for (let y = 0; y < RULES.size; y++) for (let x = 0; x < RULES.size; x++) if (s.grid[y][x] === 0) floors++;
    const c = (RULES.size - 1) / 2;
    assert.equal(reachable(s, c, c).size, floors);
    // まわりは ぜんぶ かべ
    for (let k = 0; k < RULES.size; k++) assert.ok(s.grid[0][k] && s.grid[k][0] && s.grid[RULES.size - 1][k] && s.grid[k][RULES.size - 1]);
  }
});

test('かべは とおれない。ゆかは はしれる', () => {
  const s = toPlay();
  const p = s.players[1]; // すみ(1, 1)
  go(s, PLAYERS.map((_, i) => (i === 1 ? { x: -1, y: 0 } : null)), 1);
  assert.ok(p.x >= 1 + RULES.radius - 1e-6, 'ひだりの かべで とまる');
  assert.ok(isFloor(s, cellOf(p.x), cellOf(p.y)));
});

test('どんぐりを ひろうと 1点、たからばこは 5点', () => {
  const s = toPlay();
  const p = s.players[0];
  const cx = cellOf(p.x), cy = cellOf(p.y);
  s.items = [{ x: cx, y: cy, kind: 'acorn' }];
  const ev = go(s, PLAYERS.map(() => null), 0.1);
  assert.equal(p.score, 1);
  assert.ok(ev.some((e) => e.type === 'get' && e.slot === 0));
  s.items = [{ x: cx, y: cy, kind: 'chest' }];
  go(s, PLAYERS.map(() => null), 0.1);
  assert.equal(p.score, 1 + RULES.chestValue);
  assert.equal(p.chests, 1);
});

test('おばけに ぶつかると どんぐりを おとして うごけない。そのあと しばらく ぶつからない', () => {
  const s = toPlay();
  const p = s.players[0];
  p.score = 5;
  s.items = [];
  s.ghosts = [{ x: p.x, y: p.y, tx: null, ty: null }];
  const ev = go(s, PLAYERS.map(() => null), 0.1);
  assert.ok(ev.some((e) => e.type === 'ghost' && e.slot === 0));
  assert.equal(p.score, 5 - RULES.drop);
  assert.equal(s.items.length, RULES.drop, 'まわりに ちらばる');
  assert.ok(p.stun > 0 && p.safe > 0);
  const ev2 = go(s, PLAYERS.map(() => null), 0.5);
  assert.ok(!ev2.some((e) => e.type === 'ghost' && e.slot === 0));
});

test('うごく かべは でたり しずんだり する。でて きた かべの 上の 子は おしだされる', () => {
  const s = toPlay(3);
  const m = s.movers[0];
  let sawUp = false, sawDown = false;
  for (let k = 0; k < RULES.moverPeriod / STEP; k++) {
    step(s, PLAYERS.map(() => null));
    if (moverUp(s, m.x, m.y)) sawUp = true; else sawDown = true;
  }
  assert.ok(sawUp && sawDown);
  // しずんで いる ときに のって、でるまで まつ
  while (moverUp(s, m.x, m.y)) step(s, PLAYERS.map(() => null));
  const p = s.players[0];
  Object.assign(p, { x: m.x + 0.5, y: m.y + 0.5 });
  const ev = [];
  while (!moverUp(s, m.x, m.y) && s.phase === 'play') ev.push(...step(s, PLAYERS.map(() => null)));
  ev.push(...step(s, PLAYERS.map(() => null)));
  assert.ok(ev.some((e) => e.type === 'pushed' && e.slot === 0));
  assert.ok(isFloor(s, cellOf(p.x), cellOf(p.y)));
});

test('じゃんぷ ゆかを ふむと かべを こえて 2ます さきへ', () => {
  const s = toPlay(4);
  const pad = s.pads.find((q) => isFloor(s, q.x + q.dx * 2, q.y + q.dy * 2));
  assert.ok(pad);
  const p = s.players[0];
  Object.assign(p, { x: pad.x + 0.5, y: pad.y + 0.5 });
  const ev = go(s, PLAYERS.map(() => null), RULES.jumpTime + 0.1);
  assert.ok(ev.some((e) => e.type === 'jump' && e.slot === 0));
  assert.equal(cellOf(p.x), pad.x + pad.dx * 2);
  assert.equal(cellOf(p.y), pad.y + pad.dy * 2);
  // 道さがしでも ゆかからは とんだ さきへ
  assert.deepEqual(neighbors(s, pad.x, pad.y).map(([x, y]) => [x, y]), [[pad.x + pad.dx * 2, pad.y + pad.dy * 2]]);
});

test('とった どんぐりは また はえる', () => {
  const s = toPlay();
  const before = s.items.filter((it) => it.kind === 'acorn').length;
  s.items = s.items.slice(0, 10);
  const ev = go(s, PLAYERS.map(() => null), RULES.regrow * 3 + 0.1);
  assert.ok(ev.filter((e) => e.type === 'grow').length >= 3);
  assert.ok(before > 10);
});

test('順位は どんぐり → たからばこ', () => {
  const s = createGame(PLAYERS.slice(0, 3), 1);
  Object.assign(s.players[0], { score: 10, chests: 0 });
  Object.assign(s.players[1], { score: 12, chests: 0 });
  Object.assign(s.players[2], { score: 10, chests: 1 });
  assert.deepEqual(ranking(s), [1, 2, 0]);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 60;
  for (let seed = 1; seed <= NN; seed++) wins[ranking(run(seed * 7 + 1, { personalities: PLAYERS.map(() => 'normal') }).s)[0]]++;
  for (const w of wins) assert.ok(w > NN * 0.06 && w < NN * 0.36, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの うでまえでも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', think: 0.6, fear: 3, chest: 1.3, stray: 0.2, wobble: 0.35 };
  try {
    let rankSum = 0, wins = 0;
    const NN = 60;
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
