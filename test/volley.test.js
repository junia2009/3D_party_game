import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, TEAM_SIZE, createGame, landing, ranking, step } from '../src/games/volley/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/volley/cpu.js';

const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
const kinds = Object.keys(PERSONALITIES);

function run(seed, { personalities = PLAYERS.map((_, i) => kinds[(i + seed) % 3]), players = PLAYERS } = {}) {
  const s = createGame(players, seed);
  const cpus = personalities.map((k, slot) => createCpu(k, seed, slot));
  const events = [];
  let guard = 0;
  while (s.phase !== 'finished') {
    events.push(...step(s, cpus.map((c, slot) => cpuInput(c, s, slot))));
    if (++guard > 300 / STEP) throw new Error('終わらない');
  }
  return { s, events };
}

test('チームは 3人ずつ。たりない ところは すけっと', () => {
  for (const n of [1, 2, 3, 4, 5]) {
    const s = createGame(PLAYERS.slice(0, n), n);
    assert.equal(s.teams.L.length, TEAM_SIZE);
    assert.equal(s.teams.R.length, TEAM_SIZE);
    assert.equal(s.units.filter((u) => u.slot >= 0).length, n);
    assert.ok(Math.abs(s.units.filter((u) => u.slot >= 0 && u.side === 'L').length - s.units.filter((u) => u.slot >= 0 && u.side === 'R').length) <= 1);
  }
});

test('CPU どうしで 遊ぶと 決着する。同じシードなら同じ', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { s, events } = run(seed);
    assert.deepEqual([...ranking(s)].sort(), [0, 1, 2, 3, 4]);
    assert.ok(s.score[s.winner] > s.score[s.winner === 'L' ? 'R' : 'L']);
    assert.ok(s.score[s.winner] >= RULES.winScore || events.at(-1).timeUp);
    // 勝った チームの 子が 上
    const top = ranking(s).slice(0, s.teams[s.winner].filter((i) => s.units[i].slot >= 0).length);
    for (const slot of top) assert.equal(s.units.find((u) => u.slot === slot).side, s.winner);
    assert.ok(events.some((e) => e.type === 'hit' && e.kind === 'spike'), 'スパイクが 出る');
    assert.ok(events.some((e) => e.type === 'wind'), '風が ふく');
  }
  assert.deepEqual(ranking(run(7).s), ranking(run(7).s));
});

test('ラリーが つづく(1点 あたり 平均 3回 以上 さわる)', () => {
  let hits = 0, pts = 0;
  for (let seed = 1; seed <= 20; seed++) for (const e of run(seed).events) { if (e.type === 'point') { pts++; hits += e.rally; } }
  assert.ok(hits / pts >= 3, `${hits / pts}`);
});

test('ボールの 落ちる ところへ 行って ボタンを おすと うてる。おさないと 相手の 点', () => {
  for (const press of [true, false]) {
    const s = createGame(PLAYERS.slice(0, 1), 3);
    s.serving = 'R';
    // サーブが 飛ぶまで 進める(人は 動かない)
    let guard = 0;
    while (s.ball.state !== 'fly') { step(s, [null]); if (++guard > 1e4) throw new Error('サーブが こない'); }
    const me = s.units.find((u) => u.slot === 0);
    if (me.side !== 'L') return; // くじで 右なら この 形は ためさない
    const land = landing(s, 1.0);
    let hit = false, lost = false;
    for (let k = 0; k < 4 / STEP && !hit && !lost; k++) {
      const dx = land.x - me.x, dz = land.z - me.z, d = Math.hypot(dx, dz);
      const inp = { x: d > 0.05 ? dx / d : 0, z: d > 0.05 ? dz / d : 0, hit: press && s.ball.y < 2 };
      for (const e of step(s, [inp])) {
        if (e.type === 'hit' && e.who === s.units.indexOf(me)) hit = true;
        if (e.type === 'point') lost = true;
      }
    }
    assert.equal(hit, press);
  }
});

test('ネットに かかったら、さいごに さわった チームの 失点', () => {
  const s = createGame(PLAYERS.slice(0, 2), 1);
  while (s.phase !== 'play') step(s, [null, null]);
  Object.assign(s.ball, { x: -0.5, y: 1.0, z: 0, vx: 4, vy: 0, vz: 0, state: 'fly', lastSide: 'L', last: s.teams.L[0], touches: 1, kind: 'pass' });
  const ev = step(s, [null, null]).concat(...Array.from({ length: 30 }, () => step(s, [null, null])));
  const p = ev.find((e) => e.type === 'point');
  assert.equal(p.why, 'net');
  assert.equal(p.side, 'R');
});

test('チームが 勝つ 回数は 左右で かたよらない', () => {
  const wins = { L: 0, R: 0 };
  const seats = [0, 0, 0, 0, 0];
  const NN = 80;
  for (let seed = 1; seed <= NN; seed++) {
    const { s } = run(seed * 5, { personalities: PLAYERS.map(() => 'normal') });
    wins[s.winner]++;
    seats[ranking(s)[0]]++;
  }
  assert.ok(wins.L > NN * 0.3 && wins.R > NN * 0.3, `${JSON.stringify(wins)}`);
  for (const w of seats) assert.ok(w > NN * 0.06 && w < NN * 0.36, `席ごとの 1位 ${seats}`);
});

test('人くらいの うでまえでも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', react: 0.36, err: 1.0, press: 16 };
  try {
    let rankSum = 0, wins = 0;
    const NN = 100;
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
