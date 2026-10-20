import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, TEAM_SIZE, createGame, onIce, ranking, step } from '../src/games/yuki/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/yuki/cpu.js';

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
const toPlay = (s) => { while (s.phase !== 'play') step(s, s.runners?.map(() => null) || []); };
// すけっとも 止めて、しずかな 広場に する
function quiet(s) {
  s.nextGold = 1e9;
  for (const u of s.units) if (u.slot < 0) { u.alive = false; }
}
const me = (s, slot = 0) => s.units.find((u) => u.slot === slot);
// はじめの 1回だけ なげる
const throwOnce = () => { let first = true; return () => { const t = first; first = false; return [{ x: 0, z: 0, throw: t }, null]; }; };
const idle = (s, sec, inputs) => {
  const ev = [];
  for (let i = 0; i < sec / STEP && s.phase !== 'finished'; i++) ev.push(...step(s, inputs()));
  return ev;
};

test('チームは 3人ずつ(たりないぶんは すけっと)。5人なら 3人と 2人+すけっと', () => {
  const s = createGame(PLAYERS, 3);
  assert.equal(s.teams.L.length, TEAM_SIZE);
  assert.equal(s.teams.R.length, TEAM_SIZE);
  assert.equal(s.units.filter((u) => u.slot < 0).length, 1);
  assert.equal(createGame(PLAYERS.slice(0, 2), 3).units.filter((u) => u.slot < 0).length, 4);
});

test('CPU どうしで遊ぶと 決着する。順位は 勝ったチームが 先', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { s } = run(seed);
    const r = ranking(s);
    assert.deepEqual([...r].sort(), [0, 1, 2, 3, 4]);
    const wins = s.units.filter((u) => u.slot >= 0 && u.side === s.winner).length;
    for (let k = 0; k < wins; k++) assert.equal(me(s, r[k]).side, s.winner);
  }
});

test('2人でも決着する。同じシードなら同じ試合', () => {
  const { s } = run(3, { players: PLAYERS.slice(0, 2), personalities: ['normal', 'bold'] });
  assert.deepEqual([...ranking(s)].sort(), [0, 1]);
  assert.deepEqual(ranking(run(7).s), ranking(run(7).s));
});

test('雪玉は 向いている 向きへ とぶ。当たると 体力が へって、3回で 雪だるま', () => {
  const s = createGame(PLAYERS.slice(0, 2), 4);
  toPlay(s);
  quiet(s);
  s.walls.forEach((w) => { w.hp = 0; });
  const a = me(s, 0), b = me(s, 1);
  a.x = a.side === 'L' ? -2 : 2; a.z = 0; b.x = -a.x; b.z = 0;
  a.face = Math.atan2(b.x - a.x, 0);
  a.ammo = 3;
  for (let n = 1; n <= RULES.hp; n++) {
    const ev = idle(s, 0.8, throwOnce());
    assert.ok(ev.some((e) => e.type === 'hit' && e.by === s.units.indexOf(a)), `${n}回目`);
    assert.equal(b.hp, RULES.hp - n);
    b.x = -a.x; b.z = 0; a.ammo = Math.max(a.ammo, 1);
  }
  assert.ok(!b.alive && s.phase === 'finished' && s.winner === a.side);
  assert.equal(ranking(s)[0], 0);
});

test('よそを 向いていると 当たらない。スティックを 少し たおすと 向きだけ かわる', () => {
  const s = createGame(PLAYERS.slice(0, 2), 4);
  toPlay(s);
  quiet(s);
  const a = me(s, 0), b = me(s, 1);
  a.x = a.side === 'L' ? -2 : 2; a.z = 0; b.x = -a.x; b.z = 0;
  a.face = 0; // 奥でも 手前でもない 向き(z の +)
  let ev = idle(s, 0.6, () => [{ x: 0, z: 0, throw: true }, null]);
  assert.ok(!ev.some((e) => e.type === 'hit'));
  const x0 = a.x;
  const dir = Math.sign(b.x - a.x);
  idle(s, 0.4, () => [{ x: dir * 0.2, z: 0 }, null]);
  assert.ok(Math.abs(a.x - x0) < 0.05, '少しだけ たおしても 動かない');
  assert.ok(Math.abs(Math.sin(a.face) - dir) < 0.05, '向きは かわる');
});

test('まん中の 線から 先へは 行けない', () => {
  const s = createGame(PLAYERS.slice(0, 2), 5);
  toPlay(s);
  quiet(s);
  const a = me(s, 0);
  const dir = a.side === 'L' ? 1 : -1;
  idle(s, 4, () => [{ x: dir, z: 0 }, null]);
  assert.ok(a.x * dir <= -RULES.midGap + 1e-6, `${a.x}`);
});

test('雪の かべは 雪玉を ふせぐ。何回も 当たると くずれる', () => {
  const s = createGame(PLAYERS.slice(0, 2), 6);
  toPlay(s);
  quiet(s);
  const a = me(s, 0), b = me(s, 1);
  const w = s.walls.find((x) => x.side === b.side);
  a.x = a.side === 'L' ? -1 : 1; a.z = w.z; b.x = w.x + Math.sign(w.x) * 0.9; b.z = w.z;
  a.face = Math.atan2(b.x - a.x, 0);
  let blocked = 0;
  for (let n = 0; n < RULES.wallHP; n++) {
    a.ammo = 3; a.cd = 0;
    const ev = idle(s, 0.7, throwOnce());
    blocked += ev.filter((e) => e.type === 'wallHit').length;
    b.x = w.x + Math.sign(w.x) * 0.9; b.z = w.z;
  }
  assert.ok(blocked >= RULES.wallHP && w.hp <= 0, `ふせいだ ${blocked}`);
  assert.equal(b.hp, RULES.hp, 'かべの うしろは 当たらない');
});

test('雪玉は「つくる」の れんだで できる。こおりの 上では できないし、すべる', () => {
  const s = createGame(PLAYERS.slice(0, 2), 7);
  toPlay(s);
  quiet(s);
  const a = me(s, 0);
  const ice = s.ice.find((c) => Math.sign(c.x) === (a.side === 'L' ? -1 : 1));
  a.x = a.side === 'L' ? -4.5 : 4.5; a.z = -3.2; a.ammo = 0;
  idle(s, 2, () => [null, null]);
  assert.equal(a.ammo, 0, '立っているだけでは できない');
  let n = 0;
  idle(s, 1.6, () => [{ x: 0, z: 0, make: n++ % 8 === 0 }, null]); // 1秒に 7.5回
  assert.equal(a.ammo, Math.floor(Math.ceil(1.6 * 60 / 8) / RULES.makeTaps));
  // れんだ している あいだは 動けない
  a.ammo = 0;
  const x0 = a.x;
  n = 0;
  idle(s, 0.5, () => [{ x: a.side === 'L' ? 1 : -1, z: 0, make: n++ % 8 === 0 }, null]);
  assert.ok(Math.abs(a.x - x0) < 0.15, `${a.x - x0}`);
  a.x = ice.x; a.z = ice.z; a.vx = a.vz = 0; a.ammo = 0; a.make = 0;
  n = 0;
  idle(s, 1.6, () => [{ x: 0, z: 0, make: n++ % 8 === 0 }, null]);
  assert.equal(a.ammo, 0, 'こおりの 上では つくれない');
  // こおりの 上で 走って 手を はなすと、すべって なかなか 止まらない
  a.x = ice.x - 0.3; a.z = ice.z;
  a.vx = RULES.speed; a.vz = 0;
  assert.ok(onIce(s, a.x, a.z));
  idle(s, 0.2, () => [null, null]);
  assert.ok(Math.hypot(a.vx, a.vz) > RULES.speed * 0.6, 'すべる');
});

test('金の 雪玉を ひろうと、つぎの 1こが 2つ ぶん', () => {
  const s = createGame(PLAYERS.slice(0, 2), 8);
  toPlay(s);
  quiet(s);
  s.walls.forEach((w) => { w.hp = 0; });
  const a = me(s, 0), b = me(s, 1);
  a.x = a.side === 'L' ? -2 : 2; a.z = 0; b.x = -a.x; b.z = 0;
  s.golds.push({ id: 99, x: a.x, z: a.z, until: s.t + 5 });
  a.face = Math.atan2(b.x - a.x, 0);
  const ev = idle(s, 0.8, () => [{ x: 0, z: 0, throw: true }, null]);
  assert.ok(ev.some((e) => e.type === 'pick'));
  const hit = ev.find((e) => e.type === 'hit');
  assert.ok(hit && hit.gold && b.hp === RULES.hp - 2);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 100;
  for (let seed = 1; seed <= NN; seed++) wins[ranking(run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s)[0]]++;
  for (const w of wins) assert.ok(w > NN * 0.06 && w < NN * 0.36, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの ねらいでも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', aimErr: 0.18, aimTol: 0.16, lead: 0.3, dodge: 0.5, cover: 0.35, greed: 0.5, think: 0.26, range: 7.5, tap: 6 };
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
