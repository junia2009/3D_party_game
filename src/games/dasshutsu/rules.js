// どんぐりマンション だっしゅつ のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 大木の幹の中の 6 かいだての どんぐりマンション。5人は いちばん上(5かい)から、1かい(じめん)の出口をめざす。
// どの階も、まっすぐな ろうかの奥の かべに ドアが ならぶ。下の階へ行ける ただしいドアは 1つだけ。
// - まちがいのドア: 入ると、ふしぎなことに 同じドアから 出てきてしまう(少しのあいだ うごけない)。
// - ヒントの印: いくつかの階では、ときどき ただしいドアに どんぐりの印が きらっと光る。
// 下の階へ ついたら、その階の はしの かいだんから 出てくる(階ごとに 右はし・左はしが 入れかわる)。
// いちばん早く 1かい(floor 0)に ついた子の勝ち。
//
// inputs[slot]: { x, z(行き先。null なら止まる), open(あけるボタンを おしたか) } か null。
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;
export const TIMES_OF_DAY = ['morning', 'day', 'evening'];
export const TOP = 5; // スタートの階(5 → 0)
export const HALL_W = 5.2; // ろうかの半分の長さ(x は -HALL_W〜HALL_W)
export const HALL_D = 2.2; // ろうかの おくゆき(z は 0〜HALL_D。z = 0 が ドアの かべ)

export const RULES = {
  readyTime: 3,
  timeLimit: 100,
  maxSpeed: 3.4,
  accel: 20,
  bodyR: 0.36,
  doorReach: 0.7, // ドアの前と みなす はば(x)
  doorDepth: 1.0, // かべから これより近いと あけられる
  enterTime: 0.45, // ドアに入る
  wrongTime: 1.1, // まちがいのドアの中に いる時間
  dazeTime: 0.45, // 出てきて「あれ?」
  stairTime: 0.9, // かいだんを おりる
  hintEvery: 5.0, // ヒントの印が光る間かく
  hintLen: 0.7,
};

// 階ごとの ドアの数(5かいから じゅんに)
const DOORS = { 5: 3, 4: 4, 3: 4, 2: 5, 1: 5 };
// 階 f の かいだんの出口(上から おりてきたとき 出てくるところ)は どちらのはし か
export const arriveSide = (f) => (f % 2 ? 1 : -1);
export const arriveX = (f) => arriveSide(f) * (HALL_W - 0.5);

function makeFloor(s, f) {
  const n = DOORS[f];
  const span = (HALL_W - 2.0) * 2; // はしの かいだんに かからないように
  const doors = Array.from({ length: n }, (_, i) => ({ x: -span / 2 + (n === 1 ? 0 : (i / (n - 1)) * span), kind: 'wrong', tried: [] }));
  const order = doors.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(s) * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  doors[order[0]].kind = 'down';
  return { f, doors, hint: f < TOP && nextRandom(s) < 0.6, hintPhase: nextRandom(s) * RULES.hintEvery };
}

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:dasshutsu`),
    phase: 'ready', // ready → play → finished
    winner: null,
    finished: [], // ゴールした順
    floors: {},
    runners: players.map((_, slot) => {
      const x = (slot - (players.length - 1) / 2) * 1.1;
      return {
        floor: TOP, x, z: 1.4, vx: 0, vz: 0, face: 0,
        act: null, // { kind: 'enter' | 'inside' | 'daze' | 'stair', t, door, to }
        done: false, time: null, tries: 0, wrong: 0,
      };
    }),
  };
  s.timeOfDay = TIMES_OF_DAY[Math.floor(nextRandom(s) * TIMES_OF_DAY.length)];
  for (let f = TOP; f >= 1; f--) s.floors[f] = makeFloor(s, f);
  return s;
}

export const playTime = (s) => Math.max(0, s.t - RULES.readyTime);
export const timeLeft = (s) => Math.max(0, RULES.timeLimit - playTime(s));
// いま ヒントの印が 光っているか
export const hintOn = (s, f) => {
  const fl = s.floors[f];
  if (!fl?.hint || s.phase !== 'play') return false;
  return (playTime(s) + fl.hintPhase) % RULES.hintEvery < RULES.hintLen;
};
// (x, z) の前の ドアの番号(なければ -1)
export function doorAt(s, f, x, z) {
  const fl = s.floors[f];
  if (!fl || z > RULES.doorDepth) return -1;
  let best = -1, bd = RULES.doorReach;
  fl.doors.forEach((d, i) => { const dd = Math.abs(d.x - x); if (dd < bd) { bd = dd; best = i; } });
  return best;
}

function arrive(s, r, slot, f, ev) {
  if (f <= 0) {
    r.floor = 0;
    r.done = true;
    r.time = playTime(s);
    s.finished.push(slot);
    ev.push({ type: 'goal', slot, rank: s.finished.length });
    return;
  }
  r.floor = f;
  r.x = arriveX(f);
  r.z = 1.2;
  r.vx = r.vz = 0;
  ev.push({ type: 'arrive', slot, floor: f });
}

export function step(s, inputs) {
  const ev = [];
  if (s.phase === 'finished') return ev;
  const dt = STEP;
  s.t += dt;
  if (s.phase === 'ready' && s.t >= RULES.readyTime) {
    s.phase = 'play';
    ev.push({ type: 'start' });
  }
  const play = s.phase === 'play';
  s.runners.forEach((r, slot) => {
    if (r.done) return;
    const inp = play ? inputs[slot] : null;
    // ── ドアの出入り ──
    if (r.act) {
      const a = r.act;
      a.t -= dt;
      if (a.t > 0) return;
      const door = s.floors[r.floor].doors[a.door];
      if (a.kind === 'enter') {
        door.tried.includes(slot) || door.tried.push(slot);
        if (door.kind === 'down') { r.act = { kind: 'stair', t: RULES.stairTime, door: a.door }; ev.push({ type: 'down', slot, floor: r.floor, door: a.door }); }
        else { r.wrong++; r.act = { kind: 'inside', t: RULES.wrongTime, door: a.door }; ev.push({ type: 'wrong', slot, floor: r.floor, door: a.door }); }
      } else if (a.kind === 'inside') {
        // ふしぎ: 同じドアから 出てくる
        r.x = door.x; r.z = 0.5; r.vx = 0; r.vz = 1.5;
        r.act = { kind: 'daze', t: RULES.dazeTime, door: a.door };
        ev.push({ type: 'out', slot, floor: r.floor, door: a.door });
      } else if (a.kind === 'daze') {
        r.act = null;
      } else if (a.kind === 'stair') {
        r.act = null;
        arrive(s, r, slot, r.floor - 1, ev);
      }
      return;
    }
    // ── あける ──
    if (play && inp?.open) {
      const d = doorAt(s, r.floor, r.x, r.z);
      if (d >= 0) {
        r.tries++;
        r.act = { kind: 'enter', t: RULES.enterTime, door: d };
        r.vx = r.vz = 0;
        r.x = s.floors[r.floor].doors[d].x;
        ev.push({ type: 'open', slot, floor: r.floor, door: d });
        return;
      }
    }
    // ── 走る ──
    let wx = 0, wz = 0;
    if (play && inp && inp.x !== null && inp.x !== undefined) {
      const dx = inp.x - r.x, dz = inp.z - r.z, d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const sp = RULES.maxSpeed * Math.min(1, d / 0.5);
        wx = (dx / d) * sp;
        wz = (dz / d) * sp;
        r.face = Math.atan2(dx, dz);
      }
    }
    const ax = wx - r.vx, az = wz - r.vz, am = Math.hypot(ax, az), lim = RULES.accel * dt;
    const k = am > lim ? lim / am : 1;
    r.vx += ax * k;
    r.vz += az * k;
    r.x = Math.max(-HALL_W + RULES.bodyR, Math.min(HALL_W - RULES.bodyR, r.x + r.vx * dt));
    r.z = Math.max(RULES.bodyR * 0.8, Math.min(HALL_D - RULES.bodyR * 0.8, r.z + r.vz * dt));
  });

  // ── ぶつかる(同じ階で、ドアの出入りを していない子どうし) ──
  const R = s.runners;
  for (let i = 0; i < R.length; i++) {
    for (let j = i + 1; j < R.length; j++) {
      const a = R[i], b = R[j];
      if (a.done || b.done || a.floor !== b.floor || (a.act && a.act.kind !== 'daze') || (b.act && b.act.kind !== 'daze')) continue;
      let dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d >= RULES.bodyR * 2) continue;
      // 同じ おくゆきで 正面から ぶつかると、おしあって 止まってしまう。少し 手前と奥に ずらして すれちがえるように
      if (Math.abs(dz) < 0.08) { dz = (i % 2 ? 0.08 : -0.08); d = Math.hypot(dx, dz) || 1e-6; }
      const push = (RULES.bodyR * 2 - d) / 2;
      a.x -= (dx / d) * push; a.z -= (dz / d) * push;
      b.x += (dx / d) * push; b.z += (dz / d) * push;
      for (const r of [a, b]) {
        r.x = Math.max(-HALL_W + RULES.bodyR, Math.min(HALL_W - RULES.bodyR, r.x));
        r.z = Math.max(RULES.bodyR * 0.8, Math.min(HALL_D - RULES.bodyR * 0.8, r.z));
      }
    }
  }

  if (play && (s.runners.every((r) => r.done) || timeLeft(s) <= 0)) {
    s.phase = 'finished';
    s.winner = ranking(s)[0];
    ev.push({ type: 'finished', winner: s.winner, timeUp: !s.runners.every((r) => r.done) });
  }
  // 3人 ゴールしたら、のこりは もう待たない(決着を早める)
  if (play && s.phase !== 'finished' && s.finished.length >= Math.min(3, s.runners.length - 1) && s.runners.filter((r) => !r.done).length <= Math.max(1, s.runners.length - 3)) {
    s.phase = 'finished';
    s.winner = ranking(s)[0];
    ev.push({ type: 'finished', winner: s.winner, timeUp: false });
  }
  return ev;
}

// 順位: ゴールした順。まだの子は 低い階ほど上、同じ階なら 席の順
export function ranking(s) {
  const rest = s.runners.map((_, i) => i).filter((i) => !s.runners[i].done)
    .sort((a, b) => s.runners[a].floor - s.runners[b].floor || a - b);
  return [...s.finished, ...rest];
}
