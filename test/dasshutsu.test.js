import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, TOP, arriveX, createGame, ranking, step } from '../src/games/dasshutsu/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/dasshutsu/cpu.js';

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
function ready(players = PLAYERS.slice(0, 2), seed = 1) {
  const s = createGame(players, seed);
  while (s.phase !== 'play') step(s, players.map(() => null));
  return s;
}
// slot 0 を ドア d の前に立たせて あける。出入りが おわるまで すすめる
function tryDoor(s, d) {
  const r = s.runners[0];
  r.x = s.floors[r.floor].doors[d].x; r.z = 0.4;
  const ev = [...step(s, [{ x: null, z: null, open: true }, null])];
  for (let i = 0; i < 5 / STEP && r.act; i++) ev.push(...step(s, [null, null]));
  return ev;
}

test('CPU どうしで遊ぶと、だれかが 1かいに ついて 決着する', () => {
  let total = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { s, events } = run(seed);
    const r = ranking(s);
    assert.deepEqual([...r].sort(), [0, 1, 2, 3, 4]);
    assert.equal(r[0], s.winner);
    assert.ok(s.runners[s.winner].done, '勝った子は 1かいに ついている');
    assert.ok(events.some((e) => e.type === 'wrong'));
    total += s.t;
  }
  assert.ok(total / 40 < 70, `平均 ${(total / 40).toFixed(0)} 秒`);
});

test('2人でも決着する。同じシードなら同じ試合', () => {
  const { s } = run(3, { players: PLAYERS.slice(0, 2), personalities: ['normal', 'bold'] });
  assert.deepEqual([...ranking(s)].sort(), [0, 1]);
  assert.deepEqual(ranking(run(7).s), ranking(run(7).s));
});

test('ただしいドアは 1つ。入ると 下の階の かいだんの はしから 出てくる', () => {
  const s = ready();
  for (let f = TOP; f >= 1; f--) assert.equal(s.floors[f].doors.filter((d) => d.kind === 'down').length, 1);
  const d = s.floors[TOP].doors.findIndex((x) => x.kind === 'down');
  const ev = tryDoor(s, d);
  assert.ok(ev.some((e) => e.type === 'down'));
  assert.equal(s.runners[0].floor, TOP - 1);
  assert.ok(Math.abs(s.runners[0].x - arriveX(TOP - 1)) < 0.01);
});

test('まちがいのドアは、入っても 同じドアから 出てくる(少し うごけない)', () => {
  const s = ready();
  const d = s.floors[TOP].doors.findIndex((x) => x.kind === 'wrong');
  const t0 = s.t;
  const ev = tryDoor(s, d);
  assert.ok(ev.some((e) => e.type === 'wrong') && ev.some((e) => e.type === 'out'));
  assert.equal(s.runners[0].floor, TOP);
  assert.ok(Math.abs(s.runners[0].x - s.floors[TOP].doors[d].x) < 0.01);
  assert.ok(s.t - t0 >= RULES.enterTime + RULES.wrongTime + RULES.dazeTime - 0.05);
});

test('すべり台は 2かい、上へのかいだんは 1かい 上へ', () => {
  let slide = false, up = false;
  for (let seed = 1; seed <= 30 && !(slide && up); seed++) {
    const s = ready(PLAYERS.slice(0, 2), seed);
    for (let f = TOP - 1; f >= 1; f--) {
      const ds = s.floors[f].doors.findIndex((x) => x.kind === 'slide');
      const du = s.floors[f].doors.findIndex((x) => x.kind === 'up');
      if (ds >= 0 && !slide) {
        s.runners[0].floor = f;
        tryDoor(s, ds);
        assert.equal(s.runners[0].floor, f - 2);
        slide = true;
      }
      if (du >= 0 && !up && !s.runners[0].done) {
        s.runners[0].floor = f;
        s.runners[0].act = null;
        tryDoor(s, du);
        assert.equal(s.runners[0].floor, f + 1);
        up = true;
      }
    }
  }
  assert.ok(slide && up, 'すべり台と 上へのかいだんが どこかに ある');
});

test('1かいに ついたら ゴール。ゴールの順が 順位', () => {
  const s = ready();
  s.runners[0].floor = 1;
  const d = s.floors[1].doors.findIndex((x) => x.kind === 'down');
  const ev = tryDoor(s, d);
  assert.ok(ev.some((e) => e.type === 'goal' && e.slot === 0));
  assert.equal(s.phase, 'finished');
  assert.deepEqual(ranking(s), [0, 1]);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 150;
  for (let seed = 1; seed <= NN; seed++) wins[run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s.winner]++;
  for (const w of wins) assert.ok(w > NN * 0.08 && w < NN * 0.34, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの反応・見る力でも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', watch: 0.5, hint: 0.45, react: [0.35, 0.6], whim: 0.3, speed: 0.94 };
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
