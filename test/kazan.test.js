import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, createGame, pieceAt, ranking, solidAt, step } from '../src/games/kazan/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/kazan/cpu.js';

const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
const kinds = Object.keys(PERSONALITIES);

function run(seed, { personalities = PLAYERS.map((_, i) => kinds[(i + seed) % 3]), players = PLAYERS } = {}) {
  const s = createGame(players, seed);
  const cpus = personalities.map((k, slot) => createCpu(k, seed, slot));
  const events = [];
  let guard = 0;
  while (s.phase !== 'finished') {
    events.push(...step(s, cpus.map((c, slot) => cpuInput(c, s, slot))));
    if (++guard > 200 / STEP) throw new Error('終わらない');
  }
  return { s, events };
}
const toPlay = (s) => { while (s.phase !== 'play') step(s, s.runners.map(() => null)); };
// 何も 出てこない しずかな 岩場にする
const quiet = (s) => { s.nextDrop = s.nextRoll = s.nextItem = s.nextCrumble = 1e9; };
const idle = (s, sec, inputs = () => s.runners.map(() => null)) => {
  const ev = [];
  for (let i = 0; i < sec / STEP && s.phase !== 'finished'; i++) ev.push(...step(s, inputs()));
  return ev;
};

test('CPU どうしで遊ぶと 決着する。順位は 5人ぶん', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { s } = run(seed);
    const r = ranking(s);
    assert.deepEqual([...r].sort(), [0, 1, 2, 3, 4]);
    assert.equal(r[0], s.winner);
  }
});

test('2人でも決着する。同じシードなら同じ試合', () => {
  const { s } = run(3, { players: PLAYERS.slice(0, 2), personalities: ['normal', 'bold'] });
  assert.deepEqual([...ranking(s)].sort(), [0, 1]);
  assert.deepEqual(ranking(run(7).s), ranking(run(7).s));
});

test('落ちる 前に 影(予告)が 出て、その上に いたら 当たって 脱落', () => {
  const s = createGame(PLAYERS.slice(0, 3), 4);
  toPlay(s);
  quiet(s);
  const r = s.runners[0];
  s.drops.push({ id: 99, kind: 'rock', x: r.x, z: r.z, r: RULES.kinds.rock.r, at: s.t + 0.5, warn: 0.5 });
  const ev = idle(s, 0.6);
  const land = ev.find((e) => e.type === 'land_drop');
  assert.ok(land && land.hits.includes(0));
  assert.ok(!r.alive && s.out.includes(0));
  assert.ok(s.runners[1].alive);
});

test('影から 走って にげれば だいじょうぶ', () => {
  const s = createGame(PLAYERS.slice(0, 3), 4);
  toPlay(s);
  quiet(s);
  const r = s.runners[0];
  s.drops.push({ id: 99, kind: 'big', x: r.x, z: r.z, r: RULES.kinds.big.r, at: s.t + 1.2, warn: 1.2 });
  const away = Math.atan2(-r.x, -r.z); // まん中へ
  idle(s, 1.3, () => [{ x: Math.sin(away), z: Math.cos(away) }, null, null]);
  assert.ok(r.alive);
});

test('かさを ひろうと、1回だけ 当たっても だいじょうぶ', () => {
  const s = createGame(PLAYERS.slice(0, 3), 5);
  toPlay(s);
  quiet(s);
  const r = s.runners[0];
  s.items.push({ id: 50, x: r.x, z: r.z, until: s.t + 5 });
  let ev = idle(s, 0.05);
  assert.ok(ev.some((e) => e.type === 'pick' && e.who === 0) && r.shield > 0);
  s.drops.push({ id: 98, kind: 'rock', x: r.x, z: r.z, r: 0.6, at: s.t + 0.1, warn: 0.1 });
  ev = idle(s, 0.2);
  assert.ok(ev.some((e) => e.type === 'block' && e.who === 0));
  assert.ok(r.alive && r.shield === 0);
  s.drops.push({ id: 97, kind: 'rock', x: r.x, z: r.z, r: 0.6, at: s.t + 0.1, warn: 0.1 });
  idle(s, 0.2);
  assert.ok(!r.alive, '2回目は 脱落');
});

test('転がる岩は ジャンプで とびこえられる。とばないと 脱落', () => {
  for (const jump of [true, false]) {
    const s = createGame(PLAYERS.slice(0, 3), 6);
    toPlay(s);
    quiet(s);
    const r = s.runners[0];
    const sp = RULES.rollSpeed;
    // 0.25 秒後に ぶつかる ところから 転がってくる
    s.rolls.push({ id: 70, x: r.x - sp * 0.25 - RULES.rollR - RULES.bodyR, z: r.z, dx: sp, dz: 0, until: s.t + 3 });
    let first = true;
    idle(s, 1.0, () => { const j = jump && first && s.t > 0; first = false; return [{ x: 0, z: 0, jump: j }, null, null]; });
    assert.equal(r.alive, jump, `jump ${jump}`);
  }
});

test('火の玉の あとは しばらく 火が のこって、入ると 脱落', () => {
  const s = createGame(PLAYERS.slice(0, 3), 7);
  toPlay(s);
  quiet(s);
  const r = s.runners[0];
  s.drops.push({ id: 96, kind: 'fire', x: r.x + 1.5, z: r.z, r: 0.55, at: s.t + 0.1, warn: 0.1 });
  idle(s, 0.2);
  assert.ok(r.alive && s.fires.length === 1);
  idle(s, 0.6, () => [{ x: 1, z: 0 }, null, null]);
  assert.ok(!r.alive, '火に 入ると 脱落');
});

test('足場は 外から ぐらぐら → くずれる。その上に いると 落ちて 脱落', () => {
  const s = createGame(PLAYERS.slice(0, 3), 8);
  toPlay(s);
  quiet(s);
  const r = s.runners[0];
  r.x = 4.3; r.z = 0;
  const p = pieceAt(s, r.x, r.z);
  s.order = [p.id];
  s.nextCrumble = s.t - RULES.readyTime;
  let ev = idle(s, 0.05);
  assert.ok(ev.some((e) => e.type === 'shaky' && e.id === p.id));
  assert.ok(solidAt(s, r.x, r.z), 'ぐらぐらの あいだは まだ 立てる');
  ev = idle(s, RULES.crumbleWarn + 0.5);
  assert.ok(ev.some((e) => e.type === 'crumble' && e.id === p.id));
  assert.ok(!r.alive && ev.some((e) => e.type === 'out' && e.who === 0 && e.cause === 'fall'));
  assert.ok(solidAt(s, 0, 0), 'まん中は くずれない');
});

test('だんだん 激しく: 後半ほど ふってくる 間かくが みじかい', () => {
  const gap = (sec) => {
    const s = createGame(PLAYERS, 9);
    toPlay(s);
    s.nextRoll = s.nextItem = s.nextCrumble = 1e9;
    s.t = RULES.readyTime + sec;
    s.nextDrop = 0;
    step(s, s.runners.map(() => null));
    return s.nextDrop - (s.t - RULES.readyTime);
  };
  assert.ok(gap(55) < gap(2) * 0.45, `${gap(2)} → ${gap(55)}`);
  const { events } = run(9);
  assert.ok(events.filter((e) => e.type === 'drop').length > 20);
  assert.ok(events.some((e) => e.type === 'roll') && events.some((e) => e.type === 'item') && events.some((e) => e.type === 'crumble'));
});

test('大ふんか: 予告の あと しばらく、ふってくる 間かくが みじかく なる', () => {
  const s = createGame(PLAYERS, 10);
  toPlay(s);
  for (const r of s.runners) r.shield = 1e9;
  s.nextRoll = s.nextItem = s.nextCrumble = 1e9;
  const kinds = [];
  let inErupt = 0, before = 0;
  while (s.phase === 'play' && s.t < RULES.readyTime + RULES.eruptAt[0] + RULES.eruptTime + 1) {
    for (const e of step(s, s.runners.map(() => null))) {
      if (e.type.startsWith('erupt')) kinds.push(e.type);
      if (e.type === 'drop') { const tp = s.t - RULES.readyTime; if (tp > RULES.eruptAt[0] && tp < RULES.eruptAt[0] + RULES.eruptTime) inErupt++; else if (tp > RULES.eruptAt[0] - RULES.eruptTime && tp < RULES.eruptAt[0]) before++; }
    }
    for (const r of s.runners) { r.shield = 1e9; r.alive = true; r.falling = 0; r.x = r.z = 0; } // だれも 脱落させない
    s.out = [];
    s.drops = [];
    s.fires = [];
  }
  assert.deepEqual(kinds, ['eruptWarn', 'erupt', 'eruptEnd']);
  assert.ok(inErupt > before * 1.5, `ふんか前 ${before} / ふんか中 ${inErupt}`);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 100;
  for (let seed = 1; seed <= NN; seed++) wins[ranking(run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s)[0]]++;
  for (const w of wins) assert.ok(w > NN * 0.06 && w < NN * 0.36, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの 反応でも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', react: 0.35, think: 0.18, noise: 6, greed: 12, jumpSkill: 0.85, margin: 0.45 };
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
