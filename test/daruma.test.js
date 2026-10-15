import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, STEP, TRACK, createGame, step, ranking, chantCount, lookAmount } from '../src/games/daruma/rules.js';
import { createCpu, cpuHold, PERSONALITIES } from '../src/games/daruma/cpu.js';

const PLAYERS = [0, 1, 2, 3, 4].map((i) => ({ id: `p${i}`, name: `P${i + 1}`, character: 'ponta', cpu: i > 0 }));

// cond が真になるまで進める(押し方は holds(s) が決める)
function runUntil(s, holds, cond, limit = 120) {
  const all = [];
  for (let i = 0; i < limit / STEP; i++) {
    all.push(...step(s, holds(s)));
    if (cond(s, all)) return all;
  }
  throw new Error('条件にたどりつかなかった: phase=' + s.phase);
}
const none = () => [];
const only0 = () => [true];

test('よーい の間は押しても進まない', () => {
  const s = createGame(PLAYERS, 1);
  runUntil(s, only0, (s) => s.t >= RULES.readyTime - 0.1);
  assert.equal(s.phase, 'ready');
  assert.equal(s.runners[0].x, 0);
});

test('数えている間に押すと進み、離すと 0.15 秒ほど滑って止まる', () => {
  const s = createGame(PLAYERS, 2);
  runUntil(s, none, (s) => s.phase === 'chant');
  runUntil(s, only0, (s) => s.runners[0].v === RULES.maxSpeed || s.phase !== 'chant');
  assert.ok(s.runners[0].x > 0);
  const x0 = s.runners[0].x;
  let frames = 0;
  while (s.runners[0].v > 0) {
    step(s, []);
    frames++;
  }
  assert.ok(frames * STEP <= 0.15 + STEP + 1e-9, `止まるまで ${frames * STEP} 秒`);
  const slide = s.runners[0].x - x0;
  assert.ok(slide > 0.05 && slide < 0.15, `滑った距離 ${slide}`);
});

test('見張られている間に動くと見つかり、5m 戻されて動けなくなる', () => {
  const s = createGame(PLAYERS, 3);
  // よーい から走りっぱなし
  const ev = runUntil(s, only0, (s, ev) => ev.some((e) => e.type === 'caught'));
  const caught = ev.find((e) => e.type === 'caught');
  assert.equal(caught.slot, 0);
  const r = s.runners[0];
  assert.equal(r.caught, 1);
  assert.equal(r.v, 0);
  assert.equal(r.stun, RULES.stunTime);
  // 見つかったのは「振り向き終わってから猶予のあと」
  assert.equal(s.phase, 'watch');
  assert.ok(s.phaseTime >= RULES.graceTime - 1e-9);
  // 動けない
  const x = r.x;
  for (let i = 0; i < 30; i++) step(s, [true]);
  assert.equal(r.x, x);
});

test('戻される距離はスタートより手前にならない', () => {
  const s = createGame(PLAYERS, 4);
  runUntil(s, none, (s) => s.phase === 'chant');
  // 数え終わる直前から押し始める → ほとんど進まないうちに見つかる
  runUntil(s, (s) => [s.phase === 'chant' && s.chant.length - s.chant.elapsed < 0.3 || s.phase !== 'chant'],
    (s, ev) => ev.some((e) => e.type === 'caught'));
  assert.equal(s.runners[0].x, 0);
});

test('ふつうの地面なら、数え終わった瞬間に離せば見つからない(滑りと猶予の分だけ余裕がある)', () => {
  for (let seed = 10; seed < 30; seed++) {
    const s = createGame(PLAYERS, seed);
    s.lanes[0].mud.from = s.lanes[0].mud.to = -10; // ぬかるみは別のテストで
    const ev = runUntil(s, (s) => [s.phase === 'chant'], (s) => s.phase === 'back');
    assert.ok(!ev.some((e) => e.type === 'caught'), `seed ${seed}`);
    assert.ok(s.runners[0].x > 0);
  }
});

test('振り向いている途中(turn)は判定しない', () => {
  const s = createGame(PLAYERS, 5);
  runUntil(s, only0, (s) => s.phase === 'turn');
  const ev = runUntil(s, only0, (s) => s.phase === 'watch');
  assert.ok(!ev.some((e) => e.type === 'caught'));
});

test('フェイントでは振り向かない', () => {
  // フェイントが起きるシードを探す
  let found = 0;
  for (let seed = 0; seed < 200 && found < 5; seed++) {
    const s = createGame(PLAYERS, seed);
    const ev = runUntil(s, none, (s, ev) => ev.some((e) => e.type === 'turn' || e.type === 'fake'));
    if (!ev.some((e) => e.type === 'fake')) continue;
    found++;
    assert.equal(s.phase, 'chant');
    assert.ok(s.chant.pause > 0);
    assert.equal(lookAmount(s), 0);
    const count = chantCount(s);
    step(s, []);
    assert.equal(chantCount(s), count, '止まっている間は字幕も進まない');
  }
  assert.ok(found >= 3, 'フェイントがほとんど起きない');
});

test('ゴールに触れたら終わり、その人が1位', () => {
  const s = createGame(PLAYERS, 6);
  s.runners[2].x = TRACK - 0.01;
  runUntil(s, none, (s) => s.phase === 'chant');
  const ev = runUntil(s, () => [false, false, true], (s) => s.phase === 'finished');
  assert.ok(ev.some((e) => e.type === 'goal' && e.slot === 2));
  assert.equal(s.winner, 2);
  assert.equal(ranking(s)[0], 2);
  // 終わったあとは何も起きない
  const t = s.t;
  assert.deepEqual(step(s, [true, true, true, true, true]), []);
  assert.equal(s.t, t);
});

test('制限時間で終わったら、進んだ距離で順位が決まる', () => {
  const s = createGame(PLAYERS, 7);
  s.runners[3].x = 4;
  s.runners[1].x = 9;
  const ev = runUntil(s, none, (s) => s.phase === 'finished', RULES.readyTime + RULES.timeLimit + 1);
  assert.ok(ev.some((e) => e.type === 'timeup'));
  assert.deepEqual(ranking(s).slice(0, 2), [1, 3]);
  assert.equal(s.winner, 1);
});

test('同じシードと同じ入力なら、まったく同じ結果になる', () => {
  const play = () => {
    const s = createGame(PLAYERS, 99);
    const cpus = PLAYERS.map((_, i) => createCpu(['cautious', 'normal', 'bold'][i % 3], 99, i));
    while (s.phase !== 'finished') step(s, cpus.map((c, i) => cpuHold(c, s, i)));
    return JSON.stringify(s);
  };
  assert.equal(play(), play());
});

test('CPU だけで遊ぶと、どのゲームも決着し、だいたい1分以内に誰かがゴールする', () => {
  const kinds = Object.keys(PERSONALITIES);
  const wins = Object.fromEntries(kinds.map((k) => [k, 0]));
  let timeups = 0, caught = 0, total = 0;
  const games = 300;
  for (let seed = 0; seed < games; seed++) {
    const s = createGame(PLAYERS, seed);
    const order = PLAYERS.map((_, i) => kinds[(i + seed) % kinds.length]);
    const cpus = order.map((k, i) => createCpu(k, seed, i));
    let guard = 0;
    while (s.phase !== 'finished') {
      step(s, cpus.map((c, i) => cpuHold(c, s, i)));
      assert.ok(++guard < 100 / STEP, '終わらない');
    }
    total += s.t;
    if (s.runners.every((r) => r.finishTime === null)) timeups++;
    caught += s.runners.reduce((n, r) => n + r.caught, 0);
    wins[order[s.winner]]++;
  }
  // 時間切ればかりにならない
  assert.ok(timeups < games * 0.1, `時間切れ ${timeups}/${games}`);
  // 見つかることもある(誰も見つからないと緊張感がない)
  assert.ok(caught > games * 0.5, `見つかった回数 ${caught}`);
  // どの性格もときどき勝つ(ひとつの性格だけが勝ち続けない)
  for (const k of kinds) assert.ok(wins[k] > games * 0.07, `${k} の勝ち ${wins[k]}`);
  console.log(`平均 ${(total / games).toFixed(1)}秒 / 時間切れ ${timeups} / 見つかった ${caught} / 勝ち`, wins);
});

// ── しかけ ─────────────────────────────────────────

import { LANES, TIMES_OF_DAY, inMud } from '../src/games/daruma/rules.js';

// 落ちてくるどんぐりを止める(しかけを1つずつ確かめるため)
function noDrops(s) {
  s.drops = [];
  s.rng = 1; // 以降の乱数は気にしない
}

test('しかけの配置: どのレーンも同じ数ずつ、スタート直後とゴール直前には置かない', () => {
  for (let seed = 0; seed < 200; seed++) {
    const s = createGame(PLAYERS, seed);
    assert.equal(s.lanes.length, LANES);
    assert.ok(TIMES_OF_DAY.includes(s.timeOfDay));
    for (const lane of s.lanes) {
      for (const span of [lane.mud, lane.leaves]) {
        assert.ok(span.from >= RULES.startClear && span.to <= TRACK - RULES.goalClear, `seed ${seed}`);
      }
      assert.ok(lane.mud.to + 0.5 <= lane.leaves.from || lane.leaves.to + 0.5 <= lane.mud.from, 'ぬかるみと落ち葉が重なる');
      assert.equal(lane.acorns.length, RULES.acornsPerLane);
      for (const a of lane.acorns) assert.ok(a.x >= RULES.startClear && a.x <= TRACK - RULES.goalClear);
    }
    // レーンごとに位置がちがう
    assert.ok(new Set(s.lanes.map((l) => l.mud.from.toFixed(3))).size > 1);
  }
});

test('配置と時間帯はシードで決まる(オンラインでも全員同じになる)', () => {
  const a = createGame(PLAYERS, 1234), b = createGame(PLAYERS, 1234);
  assert.deepEqual(a.lanes, b.lanes);
  assert.equal(a.timeOfDay, b.timeOfDay);
  const kinds = new Set(Array.from({ length: 40 }, (_, i) => createGame(PLAYERS, i).timeOfDay));
  assert.equal(kinds.size, TIMES_OF_DAY.length, '全部の時間帯が出る');
});

test('ぬかるみで手を離すと、ふだんより長く滑る', () => {
  const slideFrom = (inside) => {
    const s = createGame(PLAYERS, 21);
    noDrops(s);
    const lane = s.lanes[0];
    lane.leaves.from = lane.leaves.to = -10; // 落ち葉はじゃまなのでどける
    lane.acorns = [];
    runUntil(s, none, (s) => s.phase === 'chant');
    s.chant.length = 99;
    s.chant.fakeAt = null;
    s.runners[0].x = inside ? lane.mud.from + 0.1 : (lane.mud.from > 6 ? 2.5 : lane.mud.to + 1);
    s.runners[0].v = RULES.maxSpeed;
    const x0 = s.runners[0].x;
    let frames = 0;
    while (s.runners[0].v > 0) {
      step(s, []);
      frames++;
    }
    return { time: frames * STEP, dist: s.runners[0].x - x0 };
  };
  const dry = slideFrom(false), mud = slideFrom(true);
  assert.ok(Math.abs(dry.time - 0.15) < 0.03, `ふつう ${dry.time}`);
  assert.ok(Math.abs(mud.time - RULES.mudSlide) < 0.03, `ぬかるみ ${mud.time}`);
  assert.ok(mud.dist > dry.dist * 2.5);
});

test('ぬかるみで滑りすぎると、数え終わった瞬間に離しても見つかることがある', () => {
  const s = createGame(PLAYERS, 22);
  noDrops(s);
  const lane = s.lanes[0];
  lane.leaves.from = lane.leaves.to = -10;
  runUntil(s, none, (s) => s.phase === 'chant');
  s.chant.fakeAt = null;
  s.runners[0].x = lane.mud.from;
  s.runners[0].v = RULES.maxSpeed;
  // 数え終わる直前まで走り、終わった瞬間に離す
  s.chant.elapsed = s.chant.length - 0.05;
  const ev = runUntil(s, (s) => [s.phase === 'chant'], (s) => s.phase === 'back');
  assert.ok(inMud(lane, lane.mud.from + 0.1));
  assert.ok(ev.some((e) => e.type === 'caught' && e.slot === 0));
});

test('落ち葉を走って踏むと鳴り、残りの数えが速くなる。鳴った山はもう鳴らない', () => {
  const s = createGame(PLAYERS, 23);
  noDrops(s);
  runUntil(s, none, (s) => s.phase === 'chant');
  s.chant.length = 4;
  s.chant.fakeAt = null;
  const lane = s.lanes[0];
  s.runners[0].x = lane.leaves.from - 0.05;
  s.runners[0].v = RULES.maxSpeed;
  const before = s.chant.length - s.chant.elapsed;
  const ev = runUntil(s, only0, (s, ev) => ev.some((e) => e.type === 'rustle'), 2);
  assert.ok(ev.some((e) => e.type === 'rustle' && e.slot === 0));
  const after = s.chant.length - s.chant.elapsed;
  assert.ok(after < before * 0.65, `残り ${before.toFixed(2)} → ${after.toFixed(2)}`);
  assert.equal(lane.leaves.scattered, true);
  // 戻ってもう一度踏んでも鳴らない
  s.runners[0].x = lane.leaves.from - 0.05;
  for (let i = 0; i < 30; i++) assert.ok(!step(s, [true]).some((e) => e.type === 'rustle'));
});

test('落ち葉は止まっていれば鳴らない', () => {
  const s = createGame(PLAYERS, 24);
  noDrops(s);
  runUntil(s, none, (s) => s.phase === 'chant');
  s.runners[0].x = (s.lanes[0].leaves.from + s.lanes[0].leaves.to) / 2;
  for (let i = 0; i < 60; i++) assert.ok(!step(s, []).some((e) => e.type === 'rustle'));
});

test('どんぐりは、その上で止まると拾える。通り過ぎただけでは拾えない', () => {
  const s = createGame(PLAYERS, 25);
  noDrops(s);
  const lane = s.lanes[0];
  lane.leaves.from = lane.leaves.to = -10;
  lane.mud.from = lane.mud.to = -10;
  lane.acorns = [{ x: 5, taken: false }, { x: 8, taken: false }];
  runUntil(s, none, (s) => s.phase === 'chant');
  s.chant.length = 99;
  s.chant.fakeAt = null;
  // 5m を走って通り過ぎる
  s.runners[0].x = 4;
  s.runners[0].v = RULES.maxSpeed;
  runUntil(s, only0, (s) => s.runners[0].x > 6, 5);
  assert.equal(s.runners[0].acorns, 0);
  // 8m のすぐ手前で離す → 滑って 8m の上で止まる
  runUntil(s, only0, (s) => s.runners[0].x >= 8 - 0.12, 5);
  const ev = runUntil(s, none, (s, ev) => ev.some((e) => e.type === 'pickup'), 2);
  assert.ok(ev.some((e) => e.type === 'pickup' && e.x === 8));
  assert.equal(s.runners[0].acorns, 1);
  assert.equal(lane.acorns[1].taken, true);
});

test('落ちてくるどんぐりは大木の下だけ。影が出てから 0.8 秒で落ち、当たるとひるむ', () => {
  let bonked = 0;
  for (let seed = 0; seed < 40; seed++) {
    const s = createGame(PLAYERS, seed);
    runUntil(s, none, (s) => s.phase === 'chant');
    s.chant.length = 99;
    s.chant.fakeAt = null;
    // 全員を大木の下に置いて待つ
    for (const r of s.runners) r.x = TRACK - 3;
    const ev = runUntil(s, none, (s, ev) => ev.some((e) => e.type === 'drop'), 30);
    const warn = ev.find((e) => e.type === 'dropWarn');
    const drop = ev.find((e) => e.type === 'drop');
    assert.ok(warn.x >= TRACK - RULES.dropZone && warn.x < TRACK);
    assert.equal(drop.x, warn.x);
    const bonk = ev.find((e) => e.type === 'bonk');
    if (bonk) {
      bonked++;
      const r = s.runners[bonk.slot];
      assert.ok(Math.abs(r.x - bonk.x) <= RULES.dropReach);
      assert.ok(r.stun > 0 && r.stun <= RULES.bonkTime);
    } else {
      // 当たらなかったどんぐりは、拾えるどんぐりとして残る
      assert.ok(s.lanes[drop.lane].acorns.some((a) => a.fell && a.x === drop.x));
    }
  }
  assert.ok(bonked > 0, '一度も当たらない');
});
