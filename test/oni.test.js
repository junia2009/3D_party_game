import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, BUSHES, RULES, STEP, createGame, points, ranking, step } from '../src/games/oni/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/oni/cpu.js';

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
// 2人で はじめて、鬼を 席 0 に する
function ready(seed = 1) {
  const s = createGame(PLAYERS.slice(0, 2), seed);
  while (s.phase !== 'play') step(s, [null, null]);
  s.oni = 0;
  s.acorns = [];
  s.nextAcorn = 999;
  return s;
}
const go = (s, sec, inputs) => {
  const ev = [];
  for (let i = 0; i < sec / STEP && s.phase !== 'finished'; i++) ev.push(...step(s, inputs()));
  return ev;
};
const place = (r, x, z) => { r.x = x; r.z = z; r.vx = r.vz = 0; };

test('CPU どうしで 遊ぶと、鬼が 何度も かわって 時間で 決着する', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { s, events } = run(seed);
    const r = ranking(s);
    assert.deepEqual([...r].sort(), [0, 1, 2, 3, 4]);
    assert.equal(r[0], s.winner);
    const tags = events.filter((e) => e.type === 'tag').length;
    assert.ok(tags >= 3 && tags <= 16, `タッチ ${tags} 回`);
    assert.ok(events.some((e) => e.type === 'dash'), 'ダッシュする');
    assert.ok(events.some((e) => e.type === 'pick'), 'どんぐりを ひろう');
    // 点: 鬼で ない 子は 毎刻み 時間が たまる(5人なら 4人ぶん)+ ボーナス
    const total = s.runners.reduce((a, x) => a + x.score, 0);
    assert.ok(Math.abs(total - RULES.playTime * 4) < 0.1, `時間の 合計 ${total}`);
    const bonus = s.runners.reduce((a, x) => a + x.bonus, 0);
    assert.equal(bonus, events.filter((e) => e.type === 'pick').length * RULES.acornBonus);
  }
});

test('2人でも 遊べる。同じシードなら同じ試合', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const { s } = run(seed, { players: PLAYERS.slice(0, 2), personalities: ['normal', 'bold'] });
    assert.deepEqual([...ranking(s)].sort(), [0, 1]);
  }
  const a = run(7).s, b = run(7).s;
  assert.deepEqual(ranking(a), ranking(b));
  assert.deepEqual(a.runners.map(points), b.runners.map(points));
});

test('タッチで 鬼が 交代。新しい 鬼は すこし 動けず、前の 鬼を すぐには タッチ できない', () => {
  const s = ready();
  const a = s.runners[0], b = s.runners[1];
  place(a, -3, 4); place(b, -1.2, 4);
  const ev = [];
  for (let i = 0; i < 60 && !ev.some((e) => e.type === 'tag'); i++) ev.push(...step(s, [{ x: 1, z: 0 }, null]));
  const tag = ev.find((e) => e.type === 'tag');
  assert.ok(tag && tag.from === 0 && tag.to === 1);
  assert.equal(s.oni, 1);
  assert.equal(a.tags, 1);
  assert.equal(b.caught, 1);
  // 新しい 鬼は 動けない
  const bx = b.x;
  place(a, b.x - 3, b.z);
  go(s, RULES.freeze * 0.5, () => [null, { x: 1, z: 0 }]);
  assert.ok(Math.abs(b.x - bx) < 0.05, '鬼に なった すぐは 動けない');
  // 前の 鬼の となりに いっても タッチ返し できない
  place(a, b.x - 0.5, b.z);
  const ev2 = go(s, 1, () => [null, null]);
  assert.ok(!ev2.some((e) => e.type === 'tag'), 'タッチ返しなし');
  // しばらく たてば タッチ できる
  place(a, b.x - 4, b.z);
  go(s, RULES.noTagBack, () => [null, null]);
  place(a, b.x - 0.5, b.z);
  const ev3 = go(s, 0.2, () => [null, null]);
  assert.ok(ev3.some((e) => e.type === 'tag' && e.from === 1 && e.to === 0));
});

test('点は 鬼で なかった 時間。鬼の あいだは ふえない', () => {
  const s = ready();
  place(s.runners[0], -5, -5); place(s.runners[1], 5, 5);
  go(s, 2, () => [null, null]);
  assert.equal(s.runners[0].score, 0, '鬼は ふえない');
  assert.ok(Math.abs(s.runners[1].score - 2) < 0.05);
});

test('ダッシュ: しばらく はやく 走れる。つかったあとは しばらく つかえない', () => {
  const s = ready();
  const b = s.runners[1];
  place(s.runners[0], -7, 0); place(b, 0, -3.5);
  go(s, 0.5, () => [null, { x: 1, z: 0 }]);
  const walk = Math.hypot(b.vx, b.vz);
  let ev = go(s, 0.3, () => [null, { x: 1, z: 0, dash: true }]);
  assert.ok(ev.some((e) => e.type === 'dash' && e.slot === 1));
  assert.ok(Math.hypot(b.vx, b.vz) > walk * 1.4, `${Math.hypot(b.vx, b.vz)} > ${walk}`);
  ev = go(s, 1, () => [null, { x: -1, z: 0, dash: s.t % 0.2 < 0.1 }]);
  assert.ok(!ev.some((e) => e.type === 'dash'), 'すぐには もう 1回 つかえない');
  assert.ok(RULES.oniSpeed > RULES.speed, '鬼は すこし はやい');
});

test('木・切り株は とおれない。広場の ふちからは 出られない', () => {
  const s = ready();
  const b = s.runners[1];
  const t = BLOCKS[0];
  place(s.runners[0], 7, -6); place(b, t.x - t.r - 1.5, t.z);
  go(s, 2, () => [null, { x: 1, z: 0 }]);
  assert.ok(Math.hypot(b.x - t.x, b.z - t.z) >= t.r + RULES.bodyR - 1e-6, '木に めりこまない');
  place(b, 0, -6);
  go(s, 3, () => [null, { x: 0, z: -1 }]);
  assert.ok(Math.hypot(b.x, b.z) <= RULES.fieldR - RULES.bodyR + 1e-6, 'ふちから 出ない');
});

test('かくれ草むら: 中で じっと して いれば 見つからない。動くと ガサガサ して 見つかる', () => {
  const s = ready();
  const bush = BUSHES[0];
  place(s.runners[0], 6, 6); place(s.runners[1], bush.x, bush.z);
  s.runners[1].hidden = false; // はじめの 立ち位置が 草むらの ことも ある
  const ev = go(s, 0.1, () => [null, null]);
  assert.ok(s.runners[1].hidden);
  assert.ok(ev.some((e) => e.type === 'hide' && e.slot === 1));
  // 鬼(席 0)は 遠くの かくれた 子を ねらわない。鬼から 見える 子が いないので 見うしなう
  assert.ok(!s.runners[1].spotted);
  assert.ok(s.oniLost, '見うしなう');
  const cpu = createCpu('normal', 1, 0);
  for (let i = 0; i < 20; i++) { cpuInput(cpu, s, 0); cpu.think = 0; }
  assert.equal(cpu.goal, null, '遠くの かくれた 子には 気づかない');
  // じっと して いれば、notice より 遠い ところでは 見つからない
  place(s.runners[0], bush.x + (RULES.notice + RULES.noticeMove) / 2, bush.z);
  go(s, 0.1, () => [null, null]);
  assert.ok(!s.runners[1].spotted, 'じっと して いれば 見つからない');
  // 中で 動くと ガサガサ して 見つかる
  const ev3 = go(s, 0.3, () => [null, { x: 0, z: s.t % 1 < 0.5 ? 1 : -1 }]);
  assert.ok(ev3.some((e) => e.type === 'rustle' && e.slot === 1), 'ガサガサ');
  assert.ok(ev3.some((e) => e.type === 'found' && e.slot === 1), '動くと 見つかる');
  assert.ok(!s.oniLost);
  for (let i = 0; i < 5; i++) { cpuInput(cpu, s, 0); cpu.think = 0; }
  assert.equal(cpu.goal, 1, '見つけたら おう');
  // 草むらから 出ると 見える
  place(s.runners[1], bush.x + bush.r + 1, bush.z);
  const ev2 = go(s, 0.05, () => [null, null]);
  assert.ok(!s.runners[1].hidden && ev2.some((e) => e.type === 'unhide'));
});

test('金の どんぐり: ときどき 落ちてきて、ひろうと 点が ふえる', () => {
  const s = ready();
  s.nextAcorn = 0;
  place(s.runners[0], 8, 0); place(s.runners[1], -8, 0);
  let ev = go(s, 0.1, () => [null, null]);
  const ac = ev.find((e) => e.type === 'acorn');
  assert.ok(ac, '落ちてくる');
  place(s.runners[1], ac.x, ac.z);
  ev = go(s, 0.1, () => [null, null]);
  assert.ok(ev.some((e) => e.type === 'pick' && e.slot === 1));
  assert.equal(s.runners[1].bonus, RULES.acornBonus);
  assert.equal(s.acorns.length, 0);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const NN = 120;
  for (let seed = 1; seed <= NN; seed++) wins[ranking(run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s)[0]]++;
  for (const w of wins) assert.ok(w > NN * 0.08 && w < NN * 0.34, `席ごとの勝ち数 ${wins}`);
});

test('性格ごとの 勝ちやすさが かたよりすぎない', () => {
  const wins = {};
  const NN = 120;
  for (let seed = 1; seed <= NN; seed++) {
    const pers = PLAYERS.map((_, i) => kinds[(i + seed) % 3]);
    const w = ranking(run(seed, { personalities: pers }).s)[0];
    wins[pers[w]] = (wins[pers[w]] ?? 0) + 1;
  }
  for (const k of kinds) assert.ok((wins[k] ?? 0) > NN * 0.12 && (wins[k] ?? 0) < NN * 0.6, `${JSON.stringify(wins)}`);
});
