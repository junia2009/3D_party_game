import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, RULES, STEP, createGame, ranking, stackTop, step, swingX, tryPlace } from '../src/games/tsumi/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/tsumi/cpu.js';

const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
const kinds = Object.keys(PERSONALITIES);

function run(seed, { personalities = PLAYERS.map((_, i) => kinds[i % 3]), players = PLAYERS, onStep } = {}) {
  const s = createGame(players, seed);
  const cpus = personalities.map((k, slot) => createCpu(k, seed, slot));
  const events = [];
  let guard = 0;
  while (s.phase !== 'finished') {
    const ev = step(s, cpus.map((c, slot) => cpuInput(c, s, slot)));
    events.push(...ev);
    onStep?.(s, ev);
    if (++guard > 1200 / STEP) throw new Error('終わらない');
  }
  return { s, events };
}
const idle = () => PLAYERS.map(() => null);
// 番が来て、ゆれはじめるまで進める
function toAim(s) {
  let guard = 0;
  while (!(s.phase === 'play' && s.stage === 'aim')) { step(s, idle()); if (++guard > 2000) throw new Error('aim にならない'); }
}
// いまの番の子が、x に落とすようにする(ゆれの位相を合わせてから落とす)
function dropAt(s, x) {
  toAim(s);
  s.swing.A = Math.max(Math.abs(x), 0.01);
  s.swing.phase = Math.asin(Math.max(-1, Math.min(1, x / s.swing.A))) - s.swing.w * (s.stageT + STEP);
  const ev = step(s, PLAYERS.map((_, i) => (i === s.cur ? { drop: true } : null)));
  for (let i = 0; i < 300 && !['land', 'collapse', 'miss'].includes(s.stage); i++) ev.push(...step(s, idle()));
  return ev;
}

test('CPU どうしで回すと、ひとりが残って決着する', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { s, events } = run(seed);
    assert.equal(s.phase, 'finished');
    assert.equal(s.alive.filter(Boolean).length, 1);
    assert.equal(events.filter((e) => e.type === 'out').length, 4);
    assert.ok(s.t < 300, `5 分かからない(${s.t.toFixed(0)} 秒)`);
    const r = ranking(s);
    assert.deepEqual([...r].sort(), [0, 1, 2, 3, 4]);
    assert.equal(r[0], s.winner);
    assert.deepEqual(r.slice(1), [...s.out].reverse(), 'あとまで残った子ほど上');
  }
});

test('2人の対決でも決着する', () => {
  const two = PLAYERS.slice(0, 2);
  for (let seed = 1; seed <= 10; seed++) {
    const { s } = run(seed, { players: two, personalities: ['normal', 'bold'] });
    assert.equal(s.phase, 'finished');
    assert.deepEqual([...ranking(s)].sort(), [0, 1]);
  }
});

test('同じシードなら、同じ試合になる', () => {
  const a = run(4).s, b = run(4).s;
  assert.deepEqual(a.out, b.out);
  assert.equal(a.drops, b.drops);
});

test('真ん中に置けば乗る。はしに置くとくずれる。外せば乗らない', () => {
  assert.ok(tryPlace([], 'acorn', 0).ok);
  assert.ok(tryPlace([], 'acorn', 1.0).ok, '切り株は広い');
  assert.ok(tryPlace([], 'acorn', 3).miss, '切り株の外');
  const stack = [{ kind: 'acorn', x: 0, y: 0, w: KINDS.acorn.w, h: KINDS.acorn.h, grip: KINDS.acorn.grip }];
  assert.ok(tryPlace(stack, 'leaf', 0).ok);
  const edge = tryPlace(stack, 'leaf', 0.4);
  assert.ok(!edge.ok && !edge.miss, 'どんぐりの上の葉っぱは、はしに置くとくずれる');
  assert.equal(edge.fallFrom, 1, 'どんぐりの上から落ちる');
  assert.ok(tryPlace(stack, 'leaf', 1.2).miss);
  // 平らな葉っぱの上は、丸いどんぐりの上より乗せやすい
  const onLeaf = [{ kind: 'leaf', x: 0, y: 0, w: KINDS.leaf.w, h: KINDS.leaf.h, grip: KINDS.leaf.grip }];
  assert.ok(tryPlace(onLeaf, 'acorn', 0.35).ok && !tryPlace(stack, 'acorn', 0.35).ok);
});

test('重心で見る: 下の段がずれていても、上で反対へもどせば立つ', () => {
  const k = (kind, x, y) => ({ kind, x, y, w: KINDS[kind].w, h: KINDS[kind].h, grip: KINDS[kind].grip });
  // 小枝の上のキノコは右へずれている(ぎりぎり立つ)
  const stack = [k('twig', 0, 0), k('mushroom', 0.55, 0.16)];
  const worse = tryPlace(stack, 'mushroom', 0.9);
  assert.ok(!worse.ok, 'さらに右へのせると、2つの重心が小枝からはみ出して、くずれる');
  assert.equal(worse.fallFrom, 1, '小枝の上から落ちる');
  assert.ok(tryPlace(stack, 'mushroom', 0.25).ok, '左へもどすようにのせれば立つ');
});

test('落とすと乗る → 次の子の番。くずすと脱落して、山は切り株から', () => {
  const s = createGame(PLAYERS, 1);
  toAim(s);
  const first = s.cur;
  let ev = dropAt(s, 0);
  assert.ok(ev.some((e) => e.type === 'land'));
  assert.equal(s.stack.length, 1);
  assert.equal(s.runners[first].placed, 1);
  toAim(s);
  assert.notEqual(s.cur, first, '次の子の番');
  const second = s.cur;
  // 乗っているものの はしの外へ
  ev = dropAt(s, s.stack[0].x + s.stack[0].w / 2 + KINDS[s.piece.kind].w / 2 + 0.2);
  assert.ok(ev.some((e) => e.type === 'miss' || e.type === 'collapse'));
  assert.ok(!s.alive[second]);
  for (let i = 0; i < 400 && s.stage !== 'aim'; i++) step(s, idle());
  if (ev.some((e) => e.type === 'collapse')) assert.equal(s.stack.length, 0, 'くずれたら山はやりなおし');
  assert.notEqual(s.cur, second, '脱落した子の番は来ない');
  assert.equal(stackTop(s) >= 0, true);
});

test('待っていても、ひとりでに落ちる', () => {
  const s = createGame(PLAYERS, 2);
  toAim(s);
  let ev = [];
  for (let i = 0; i < (RULES.aimLimit + 0.1) / STEP; i++) ev.push(...step(s, idle()));
  assert.ok(ev.some((e) => e.type === 'drop' && e.auto));
});

test('番でない子のタップは効かない。ゆれは高くなるほど速い', () => {
  const s = createGame(PLAYERS, 3);
  toAim(s);
  const other = (s.cur + 1) % 5;
  const ev = step(s, PLAYERS.map((_, i) => (i === other ? { drop: true } : null)));
  assert.ok(!ev.some((e) => e.type === 'drop'));
  const w0 = s.swing.w;
  dropAt(s, 0);
  dropAt(s, 0);
  toAim(s);
  assert.ok(s.swing.w > w0 && s.swing.A >= 0.9);
  assert.ok(Math.abs(swingX(s)) <= s.swing.A + 1e-9);
});

test('同じ性格どうしなら、どの番の子も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const N = 150;
  for (let seed = 1; seed <= N; seed++) wins[run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s.winner]++;
  for (const w of wins) assert.ok(w > N * 0.08 && w < N * 0.34, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの反応でも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', react: [0.6, 1.0], err: 0.08, aim: 0.75, wait: 1 };
  try {
    let rankSum = 0, wins = 0;
    const N = 200;
    for (let seed = 1; seed <= N; seed++) {
      const r = ranking(run(seed, { personalities: PLAYERS.map((_, i) => (i === 0 ? 'human' : kinds[(i + seed) % 3])) }).s);
      rankSum += r.indexOf(0) + 1;
      if (r[0] === 0) wins++;
    }
    assert.ok(rankSum / N <= 3.4, `人の平均順位 ${rankSum / N}`);
    assert.ok(wins / N >= 0.1, `人の勝ち ${wins}/${N}`);
  } finally {
    delete PERSONALITIES.human;
  }
});
