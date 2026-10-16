// 花ぬり陣取り のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 丘の上の まん丸な花畑(まん中に大きなひまわり)。5人が走りまわると、通ったところに自分の色の花が咲く。ほかの子の花も上から咲きかえられる。
// 45 秒で、いちばん広く咲かせた子の勝ち。
// - じょうろ: 拾うと、まわりを まるく一気に咲かせる。
// - ミツバチ: 拾うと、少しのあいだ通ったあとが太くなる(ハチが いっしょに飛んで咲かせる)。
// - つむじ風: ときどき花畑を横切る。通ったところの花は散ってしまう。当たった子は飛ばされて、少し目が回る。
// - 体当たり: 勢いよくぶつかると、当てられた子が ふらふらして、そのまわりの花が 当てた子の色に変わる。
//
// 花畑は 40cm のます目(まん丸の中だけ)。ます目ごとに、だれの花か(-1 = まだ咲いていない)。
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, randRange, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;
export const TIMES_OF_DAY = ['morning', 'day', 'evening'];
export const FIELD_R = 6.0; // 花畑の半径(m)
export const CELL = 0.4; // ます目の大きさ(m)
export const N = 31; // ます目の数(1辺)。まん中が 15
export const SUN_R = 0.5; // まん中の大きなひまわり(ここは通れない。花も咲かない)
const C = (N - 1) / 2;

export const RULES = {
  readyTime: 3,
  timeLimit: 45,
  lastTime: 10, // のこりこれだけで「ラストスパート」
  maxSpeed: 4.0,
  accel: 22,
  bodyR: 0.38,
  paintR: 0.5, // 通ったところを咲かせる半径
  beeR: 0.95, // ミツバチがいるあいだの半径
  beeTime: 5,
  canR: 1.7, // じょうろで一気に咲かせる半径
  pickR: 0.7,
  itemEvery: [4.5, 6.5], // じょうろ・ミツバチが出てくる間隔(秒)
  itemMax: 2,
  itemLife: 9, // 拾われないと消える
  windEvery: [8, 11], // つむじ風の間隔
  windFirst: 9, // はじめてのつむじ風(はじまってから)
  windSpeed: 2.2,
  windR: 0.85, // 花を散らす半径・当たる半径
  windWarn: 1.2, // 出てくる前に、来るところを知らせる時間
  blowSpeed: 6, // 飛ばされる勢い
  blowStun: 0.8,
  bumpSpeed: 3.5, // これより速く突っこむと「体当たり」(ほぼ全速で まっすぐ当てたときだけ)
  bumpOther: 1.2, // 当てられたほうも これより速く向かってきていたら、出あいがしら(どちらも当てていない)
  bumpCool: 1.0,
  bumpStun: 0.9, // 当てられた子が ふらふらする時間
  bumpR: 0.95, // 当てられた子のまわりで、色が変わる半径
};

// ます目の番号 ⇔ 場所
export const cellX = (i) => (i - C) * CELL;
export const inField = (i, j) => { const d = Math.hypot(cellX(i), cellX(j)); return d <= FIELD_R - CELL * 0.5 && d >= SUN_R; };
const CELLS = [];
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (inField(i, j)) CELLS.push(j * N + i);
export const CELL_COUNT = CELLS.length;

export function startPos(slot, n) {
  const a = Math.PI / 2 + (slot / n) * Math.PI * 2;
  return { x: Math.cos(a) * 3.4, z: Math.sin(a) * 3.4 };
}

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:hana`),
    phase: 'ready', // ready → play → finished
    last: false,
    winner: null,
    grid: new Int8Array(N * N).fill(-1),
    counts: players.map(() => 0),
    items: [], // { id, kind: 'can' | 'bee', x, z, life }
    nextItem: 2.5,
    winds: [], // { id, x, z, dx, dz, warn, left }
    nextWind: RULES.windFirst,
    nextId: 1,
    runners: players.map((_, slot) => {
      const p = startPos(slot, players.length);
      return { x: p.x, z: p.z, vx: 0, vz: 0, stun: 0, bee: 0, bumpCool: 0, cans: 0, bees: 0, bumps: 0, blown: 0 };
    }),
  };
  s.timeOfDay = TIMES_OF_DAY[Math.floor(nextRandom(s) * TIMES_OF_DAY.length)];
  // はじめは、それぞれの足もとに少しだけ咲いている
  s.runners.forEach((r, slot) => paint(s, r.x, r.z, 0.9, slot));
  return s;
}

export const timeLeft = (s) => Math.max(0, RULES.timeLimit - Math.max(0, s.t - RULES.readyTime));

// (x, z) のまわり半径 r を、slot の色に(slot = -1 なら散らす)。変わったます目の数を返す
export function paint(s, x, z, r, slot) {
  const i0 = Math.max(0, Math.floor((x - r) / CELL + C)), i1 = Math.min(N - 1, Math.ceil((x + r) / CELL + C));
  const j0 = Math.max(0, Math.floor((z - r) / CELL + C)), j1 = Math.min(N - 1, Math.ceil((z + r) / CELL + C));
  let n = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (!inField(i, j)) continue;
      const dx = cellX(i) - x, dz = cellX(j) - z;
      if (dx * dx + dz * dz > r * r) continue;
      const k = j * N + i;
      const was = s.grid[k];
      if (was === slot) continue;
      if (was >= 0) s.counts[was]--;
      if (slot >= 0) s.counts[slot]++;
      s.grid[k] = slot;
      n++;
    }
  }
  return n;
}

function randomSpot(s, margin) {
  const a = nextRandom(s) * Math.PI * 2, d = Math.sqrt(nextRandom(s)) * (FIELD_R - margin);
  return { x: Math.cos(a) * d, z: Math.sin(a) * d };
}

// inputs[slot]: { x, z }(そこへ向かう)か null(止まる)
export function step(s, inputs) {
  const ev = [];
  const dt = STEP;
  s.t += dt;
  if (s.phase === 'ready' && s.t >= RULES.readyTime) {
    s.phase = 'play';
    ev.push({ type: 'start' });
  }
  const play = s.phase === 'play';
  if (play && !s.last && timeLeft(s) <= RULES.lastTime) {
    s.last = true;
    ev.push({ type: 'last' });
  }

  // ── じょうろ・ミツバチが出てくる ──
  if (play) {
    s.nextItem -= dt;
    if (s.nextItem <= 0) {
      s.nextItem = randRange(s, RULES.itemEvery[0], RULES.itemEvery[1]);
      if (s.items.length < RULES.itemMax) {
        // 人の近くには出さない(だれかが すぐ拾えないように)
        let p = randomSpot(s, 0.8);
        for (let k = 0; k < 6 && s.runners.some((r) => Math.hypot(r.x - p.x, r.z - p.z) < 1.8); k++) p = randomSpot(s, 0.8);
        const it = { id: s.nextId++, kind: nextRandom(s) < 0.55 ? 'can' : 'bee', x: p.x, z: p.z, life: RULES.itemLife };
        s.items.push(it);
        ev.push({ type: 'item', ...it });
      }
    }
    for (const it of s.items) it.life -= dt;
    for (const it of s.items) if (it.life <= 0) ev.push({ type: 'itemGone', id: it.id });
    s.items = s.items.filter((it) => it.life > 0);
  }

  // ── つむじ風: 外から外へ、まん中のあたりを横切る ──
  if (play) {
    s.nextWind -= dt;
    if (s.nextWind <= 0) {
      s.nextWind = randRange(s, RULES.windEvery[0], RULES.windEvery[1]);
      const a = nextRandom(s) * Math.PI * 2;
      const sx = Math.cos(a) * (FIELD_R + 0.5), sz = Math.sin(a) * (FIELD_R + 0.5);
      // 向こうがわの、少しずれたところへ
      const b = a + Math.PI + randRange(s, -0.7, 0.7);
      const ex = Math.cos(b) * (FIELD_R + 0.5), ez = Math.sin(b) * (FIELD_R + 0.5);
      const len = Math.hypot(ex - sx, ez - sz);
      const w = { id: s.nextId++, x: sx, z: sz, dx: (ex - sx) / len, dz: (ez - sz) / len, warn: RULES.windWarn, left: len / RULES.windSpeed };
      s.winds.push(w);
      ev.push({ type: 'wind', id: w.id, x: sx, z: sz, ex, ez, warn: w.warn });
    }
  }
  for (const w of s.winds) {
    if (w.warn > 0) { w.warn -= dt; continue; }
    w.x += w.dx * RULES.windSpeed * dt;
    w.z += w.dz * RULES.windSpeed * dt;
    w.left -= dt;
    if (play) paint(s, w.x, w.z, RULES.windR, -1);
  }
  for (const w of s.winds) if (w.left <= 0) ev.push({ type: 'windGone', id: w.id });
  s.winds = s.winds.filter((w) => w.left > 0);

  // ── 走る ──
  s.runners.forEach((r, slot) => {
    r.bumpCool = Math.max(0, r.bumpCool - dt);
    r.bee = Math.max(0, r.bee - dt);
    let wx = 0, wz = 0;
    if (r.stun > 0) {
      r.stun = Math.max(0, r.stun - dt);
    } else if (play && inputs[slot]) {
      const dx = inputs[slot].x - r.x, dz = inputs[slot].z - r.z, d = Math.hypot(dx, dz);
      if (d > 0.08) {
        const sp = RULES.maxSpeed * Math.min(1, d / 0.6);
        wx = (dx / d) * sp;
        wz = (dz / d) * sp;
      }
    }
    // 飛ばされているあいだ(目が回っているあいだ)は、ゆっくり止まる
    const accel = r.stun > 0 ? 6 : RULES.accel;
    const ax = wx - r.vx, az = wz - r.vz, am = Math.hypot(ax, az), lim = accel * dt;
    const k = am > lim ? lim / am : 1;
    r.vx += ax * k;
    r.vz += az * k;
    r.x += r.vx * dt;
    r.z += r.vz * dt;
    keepIn(r);
    // 通ったところに咲く(目が回っているあいだは咲かない)
    if (play && r.stun <= 0) paint(s, r.x, r.z, r.bee > 0 ? RULES.beeR : RULES.paintR, slot);
    // 拾う
    if (play && r.stun <= 0) {
      for (const it of s.items) {
        if (Math.hypot(it.x - r.x, it.z - r.z) > RULES.pickR) continue;
        it.life = 0;
        if (it.kind === 'can') {
          r.cans++;
          const n = paint(s, it.x, it.z, RULES.canR, slot);
          ev.push({ type: 'can', slot, x: it.x, z: it.z, n, id: it.id });
        } else {
          r.bees++;
          r.bee = RULES.beeTime;
          ev.push({ type: 'bee', slot, x: it.x, z: it.z, id: it.id });
        }
      }
      s.items = s.items.filter((it) => it.life > 0);
    }
    // つむじ風に当たる
    for (const w of s.winds) {
      if (w.warn > 0 || r.stun > 0) continue;
      const dx = r.x - w.x, dz = r.z - w.z, d = Math.hypot(dx, dz);
      if (d > RULES.windR + RULES.bodyR) continue;
      // 風の進む向きの横へ、くるっと飛ばす
      const side = dx * w.dz - dz * w.dx >= 0 ? 1 : -1;
      r.vx = (w.dx * 0.5 + w.dz * side) * RULES.blowSpeed;
      r.vz = (w.dz * 0.5 - w.dx * side) * RULES.blowSpeed;
      r.stun = RULES.blowStun;
      r.blown++;
      ev.push({ type: 'blown', slot, x: r.x, z: r.z });
    }
  });

  // ── ぶつかる ──
  const R = s.runners;
  for (let i = 0; i < R.length; i++) {
    for (let j = i + 1; j < R.length; j++) {
      const a = R[i], b = R[j];
      let dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d >= RULES.bodyR * 2) continue;
      if (d < 1e-6) { dx = 1; dz = 0; d = 1e-6; }
      const nx = dx / d, nz = dz / d, push = (RULES.bodyR * 2 - d) / 2;
      a.x -= nx * push; a.z -= nz * push;
      b.x += nx * push; b.z += nz * push;
      keepIn(a); keepIn(b);
      // おたがいに向かう速さ。速く突っこんだほうが「当てた」
      const sa = a.vx * nx + a.vz * nz, sb = -(b.vx * nx + b.vz * nz);
      if (play && Math.max(sa, sb) > RULES.bumpSpeed && Math.min(sa, sb) < RULES.bumpOther && a.bumpCool <= 0 && b.bumpCool <= 0) {
        const [by, hit, byI, hitI, dir] = sa >= sb ? [a, b, i, j, 1] : [b, a, j, i, -1];
        if (hit.stun > 0) continue;
        hit.stun = RULES.bumpStun;
        hit.vx = nx * dir * 3.2;
        hit.vz = nz * dir * 3.2;
        by.vx *= 0.4; by.vz *= 0.4;
        by.bumps++;
        a.bumpCool = b.bumpCool = RULES.bumpCool;
        const n = paint(s, hit.x, hit.z, RULES.bumpR, byI);
        ev.push({ type: 'bump', by: byI, hit: hitI, x: hit.x, z: hit.z, n });
      }
    }
  }

  if (play && timeLeft(s) <= 0) {
    s.phase = 'finished';
    s.winner = ranking(s)[0];
    ev.push({ type: 'finished', winner: s.winner });
  }
  return ev;
}

function keepIn(r) {
  const d = Math.hypot(r.x, r.z), max = FIELD_R - RULES.bodyR, min = SUN_R + RULES.bodyR;
  // まん中のひまわりの くきに当たったら、外へ押しもどす
  if (d < min) {
    const nx = d > 1e-6 ? r.x / d : 1, nz = d > 1e-6 ? r.z / d : 0;
    r.x = nx * min; r.z = nz * min;
    const inn = r.vx * nx + r.vz * nz;
    if (inn < 0) { r.vx -= inn * nx; r.vz -= inn * nz; }
    return;
  }
  if (d <= max) return;
  const nx = r.x / d, nz = r.z / d;
  r.x = nx * max;
  r.z = nz * max;
  const out = r.vx * nx + r.vz * nz;
  if (out > 0) { r.vx -= out * nx; r.vz -= out * nz; }
}

// 順位: 咲かせた広さ(ます目の数)の多い順。同じなら席の順
export function ranking(s) {
  return s.counts.map((_, i) => i).sort((a, b) => s.counts[b] - s.counts[a] || a - b);
}
export const share = (s, slot) => s.counts[slot] / CELL_COUNT; // 花畑の何わりか
