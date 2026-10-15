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

test('数え終わった瞬間に離せば見つからない(滑りと猶予の分だけ余裕がある)', () => {
  for (let seed = 10; seed < 30; seed++) {
    const s = createGame(PLAYERS, seed);
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
