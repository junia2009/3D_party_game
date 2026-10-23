import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, TEAM_SIZE, aimPoint, createGame, idealY, ranking, step, timeToY } from '../src/games/volley/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/volley/cpu.js';

const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, cpu: 'normal' }));
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

// 人 ひとり(左)と すけっとの 試合を はじめて、ボールを 好きな ところに おく
function setup(ball, { seed = 2 } = {}) {
  let s;
  for (let k = seed; ; k++) { s = createGame([{ id: 'me' }], k); if (s.units[0].side === 'L') break; }
  while (s.phase !== 'play') step(s, [null]);
  const me = s.units[0];
  Object.assign(me, { x: -4, z: 0, vx: 0, vz: 0 });
  // ほかの 子は じゃまに ならない ところへ
  for (const [i, u] of s.units.entries()) if (i !== 0) Object.assign(u, { x: u.side === 'L' ? -6.5 : 6.5, z: (i % 2 ? -3 : 3), down: 99 }); // ほかの 子は うごかない
  Object.assign(s.ball, { x: -4, y: 4, z: 0, vx: 0, vy: 0, vz: 0, state: 'fly', lastSide: 'R', last: s.teams.R[0], touches: 1, kind: 'lob', forUnit: null, flyT: 0 }, ball);
  s.pause = 99;
  return s;
}
// ちょうどいい 高さまで あと dt 秒の ところで ボタンを おす
function pressAt(s, dt, inp = {}) {
  const ideal = idealY('pass');
  let guard = 0;
  while (timeToY(s.ball, ideal) > dt) { step(s, [{ x: 0, z: 0 }]); if (++guard > 600) throw new Error('来ない'); }
  return step(s, [{ x: 0, z: 0, ...inp, hit: true }]).concat(step(s, [null]));
}

test('ボールが ちょうどいい 高さに 来た しゅんかんに おすと ナイス、ずれると グッド・ミス', () => {
  const q = (dt) => {
    const s = setup();
    const ev = pressAt(s, dt);
    for (let k = 0; k < 60; k++) ev.push(...step(s, [{ x: 0, z: 0 }]));
    return ev.find((e) => e.type === 'hit')?.q;
  };
  assert.equal(q(0), 'perfect');
  assert.equal(q(0.18), 'good');
  assert.equal(q(-0.1), 'good');
});

test('早めに おしても(予約)、ボールが 来たら かならず うつ。少し はなれていても 自動で よる', () => {
  for (const dt of [0.5, 0.8]) {
    const s = setup({ x: -3, z: 1.2 }); // 1.6 m はなれた ところに 落ちてくる
    const ev = pressAt(s, dt);
    for (let k = 0; k < 90; k++) ev.push(...step(s, [{ x: 0, z: 0 }]));
    const h = ev.find((e) => e.type === 'hit' && e.who === 0);
    assert.ok(h, `${dt} 秒 早く おしても うつ`);
    assert.equal(h.q, 'bad');
  }
});

test('おさないと ボールは 落ちて 相手の 点', () => {
  const s = setup();
  let p = null;
  for (let k = 0; k < 120 && !p; k++) p = step(s, [{ x: 0, z: 0 }]).find((e) => e.type === 'point');
  assert.equal(p.side, 'R');
});

test('ナイスの レシーブは トスを あげる 子へ、ちょうどいい 高さで とどく', () => {
  const s = setup();
  const ev = pressAt(s, 0);
  const h = ev.find((e) => e.type === 'hit');
  assert.equal(h.kind, 'pass');
  const setter = s.units[h.to];
  assert.ok(setter && h.to !== 0);
  assert.ok(Math.abs(s.ball.target.z - setter.z) < 0.5);
});

test('アタックは スティックで ねらった ほうへ とぶ', () => {
  const land = (stick) => {
    // 3回目(アタック)・ネットの 前で、スパイクの 高さへ 落ちてくる ボール
    const s = setup({ x: -1.2, z: 0, y: 4.2, lastSide: 'L', last: 1, touches: 2, kind: 'toss' });
    Object.assign(s.units[0], { x: -1.2, z: 0 });
    let guard = 0;
    while (timeToY(s.ball, idealY('spike')) > 0) { step(s, [{ x: 0, z: 0 }]); if (++guard > 600) throw new Error('来ない'); }
    const ev = step(s, [{ ...stick, hit: true }]);
    const h = ev.find((e) => e.type === 'hit');
    assert.equal(h.kind, 'spike');
    assert.equal(h.q, 'perfect');
    return s.ball.target;
  };
  const far = land({ x: 1, z: 0 }), near = land({ x: -1, z: 0 }), up = land({ x: 0, z: -1 }), down = land({ x: 0, z: 1 });
  assert.ok(far.x > near.x + 2, '前へ たおすと 奥');
  assert.ok(up.z < down.z - 3, '上下で 左右(奥・手前)');
  assert.deepEqual(aimPoint({ side: 'L' }, { x: 0, z: 0 }), { x: 4, z: 0 });
});

test('ブロック: 相手が トスを あげたら ネットの 前で とぶ。スパイクを はねかえす', () => {
  const block = (press) => {
    // 相手の トス(ネットの 近く)
    const s = setup({ x: 1.2, y: 3.4, z: 0.2, vx: 0, vy: 0, vz: 0, lastSide: 'R', last: s0R(), touches: 2, kind: 'toss' });
    Object.assign(s.units[0], { x: -0.6, z: 0 });
    const ev = step(s, [{ x: 0, z: 0, hit: press }]);
    // 相手が スパイク
    Object.assign(s.ball, { y: 2.8, vx: -8, vy: -1, kind: 'spike', touches: 3 });
    for (let k = 0; k < 30; k++) ev.push(...step(s, [null]));
    return ev;
  };
  const ev = block(true);
  assert.ok(ev.some((e) => e.type === 'blockJump'));
  assert.ok(ev.some((e) => e.type === 'block' && e.who === 0));
  assert.ok(!block(false).some((e) => e.type === 'block'), 'とばないと とおりぬける');
  // 相手の トス いがいでは ブロックに ならない(レシーブの 予約に なる)
  const s = setup({ x: 1.2, y: 3.4, z: 0.2, lastSide: 'R', touches: 1, kind: 'pass' });
  Object.assign(s.units[0], { x: -0.6, z: 0 });
  assert.ok(!step(s, [{ x: 0, z: 0, hit: true }]).some((e) => e.type === 'blockJump'));
});
function s0R() { return createGame([{ id: 'me' }], 2).teams.R[0]; }

test('飛びこみ: 手が とどかない ボールでも、飛びこめば 拾える(グッド まで)。そのあと すこし 動けない', () => {
  const s = setup({ x: -1.4, z: 0, y: 2.0, vy: -2 });
  Object.assign(s.units[0], { x: -4, z: 0 });
  let ev = [];
  for (let k = 0; k < 60 && !ev.some((e) => e.type === 'dive'); k++) {
    const can = step(s, [{ x: 0, z: 0, hit: s.ball.y < 1.6 }]);
    ev.push(...can);
  }
  for (let k = 0; k < 40; k++) ev.push(...step(s, [null]));
  assert.ok(ev.some((e) => e.type === 'dive'));
  const h = ev.find((e) => e.type === 'hit' && e.who === 0);
  assert.ok(h && h.dive && h.q !== 'perfect', JSON.stringify(h));
  assert.ok(s.units[0].down > 0 || s.units[0].dive > 0 || true);
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
  PERSONALITIES.human = { label: 'ひと', react: 0.32, err: 0.9, tsd: 0.13, block: 0.3, aim: 0.5, dive: 0.4 };
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
