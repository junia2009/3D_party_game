// どんぐりキャッチ のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 大木の根もとの丸い広場で、5人がどんぐりを拾い合う。
// - 大木の枝がゆれると、その下(広場のどこか)にどんぐりが何こか降ってくる。地面に影が出てから落ちる。
// - 落ちてくるところにいれば、かごで受けとる。受けとりそこねたどんぐりは、しばらく地面に残るので拾える。
// - 金どんぐりは 5 こ分。毛虫・まつぼっくりを受けると、少しのあいだ目が回って動けない。
// - 勢いよくぶつかると、ぶつけられた人のかごからどんぐりがこぼれる。
// - 終わりの 10 秒は「どんぐりの雨」: たくさん降る。
// - 時間切れのとき、どんぐりがいちばん多い人の勝ち。
//
// state を書きかえるのは step() だけ。乱数は state.rng(シード付き)だけを使う。

import { nextRandom, randRange, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;
export const ARENA_R = 5.6; // 広場の半径(m)
export const TIMES_OF_DAY = ['morning', 'day', 'evening'];

export const ITEMS = {
  acorn: { value: 1 },
  gold: { value: 5 },
  worm: { stun: 1.6 }, // 毛虫
  cone: { stun: 1.2 }, // まつぼっくり
};
export const isHazard = (kind) => kind === 'worm' || kind === 'cone';

export const RULES = {
  readyTime: 3,
  timeLimit: 45,
  rainTime: 10, // 終わりの何秒が どんぐりの雨 か
  maxSpeed: 4.4,
  accel: 24,
  bodyR: 0.4,
  catchR: 0.72, // 落ちてきたものを受けとれる距離
  pickR: 0.55, // 地面のどんぐりを拾える距離
  fallTime: 1.25, // 影が出てから落ちるまで
  shakeTime: 0.9, // 枝がゆれてから、ひとつめの影が出るまで
  groundTime: 2.6, // 地面に落ちたどんぐりが残る時間
  bumpSpeed: 3.4, // これより勢いよくぶつかると、相手のかごからこぼれる
  bumpCool: 0.9,
  spill: 2, // 1回でこぼれる数
  spillLock: 0.4, // こぼれたどんぐりが、地面に落ちて拾えるようになるまで
};

// 何秒ごとに枝がゆれるか / 1回に何こ降るか / 何が降るか
const RATE = {
  normal: { every: [1.2, 1.8], count: [2, 4], gold: 0.06, worm: 0.07, cone: 0.07 },
  rain: { every: [0.45, 0.65], count: [4, 6], gold: 0.1, worm: 0.05, cone: 0.05 },
};

// 席ごとのスタート位置: 広場のまん中を囲む円の上に等間隔(だれも有利にならないように)
export function startPos(slot, n) {
  const a = Math.PI / 2 + (slot / n) * Math.PI * 2;
  return { x: Math.cos(a) * 2.6, z: Math.sin(a) * 2.6 };
}

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:catch`),
    phase: 'ready', // ready → play → finished
    rain: false,
    nextShake: 0.4,
    shakes: [], // { x, z, left, count }
    items: [], // { id, kind, x, z, left(落ちるまで), ground(地面に残る時間。落ちる前は null), lock }
    nextId: 1,
    winner: null,
    timeOfDay: null,
    runners: players.map((_, slot) => {
      const p = startPos(slot, players.length);
      return { x: p.x, z: p.z, vx: 0, vz: 0, stun: 0, acorns: 0, golds: 0, bumpCool: 0, caught: 0 };
    }),
  };
  s.timeOfDay = TIMES_OF_DAY[Math.floor(nextRandom(s) * TIMES_OF_DAY.length)];
  return s;
}

export const playing = (s) => s.phase === 'play';
export const timeLeft = (s) => Math.max(0, RULES.timeLimit - Math.max(0, s.t - RULES.readyTime));

function pickKind(s, rate) {
  const r = nextRandom(s);
  if (r < rate.gold) return 'gold';
  if (r < rate.gold + rate.worm) return 'worm';
  if (r < rate.gold + rate.worm + rate.cone) return 'cone';
  return 'acorn';
}

function insideArena(x, z, margin) {
  const d = Math.hypot(x, z), max = ARENA_R - margin;
  return d <= max ? { x, z } : { x: (x / d) * max, z: (z / d) * max };
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
  if (s.phase === 'play' && !s.rain && timeLeft(s) <= RULES.rainTime) {
    s.rain = true;
    ev.push({ type: 'rain' });
  }

  // ── 枝がゆれて、どんぐりが降る ──
  if (s.phase === 'play') {
    const rate = s.rain ? RATE.rain : RATE.normal;
    s.nextShake -= dt;
    if (s.nextShake <= 0) {
      s.nextShake = randRange(s, rate.every[0], rate.every[1]);
      const a = nextRandom(s) * Math.PI * 2, d = Math.sqrt(nextRandom(s)) * (ARENA_R - 1.2);
      const sh = { x: Math.cos(a) * d, z: Math.sin(a) * d, left: RULES.shakeTime, count: rate.count[0] + Math.floor(nextRandom(s) * (rate.count[1] - rate.count[0] + 1)) };
      s.shakes.push(sh);
      ev.push({ type: 'shake', x: sh.x, z: sh.z, count: sh.count });
    }
  }
  for (const sh of s.shakes) {
    sh.left -= dt;
    if (sh.left > 0) continue;
    const rate = s.rain ? RATE.rain : RATE.normal;
    for (let k = 0; k < sh.count; k++) {
      const a = nextRandom(s) * Math.PI * 2, d = Math.sqrt(nextRandom(s)) * 1.3;
      const p = insideArena(sh.x + Math.cos(a) * d, sh.z + Math.sin(a) * d, 0.4);
      const it = { id: s.nextId++, kind: pickKind(s, rate), x: p.x, z: p.z, left: RULES.fallTime + k * 0.16, ground: null, lock: 0 };
      s.items.push(it);
      ev.push({ type: 'drop', id: it.id, kind: it.kind, x: it.x, z: it.z, left: it.left });
    }
  }
  s.shakes = s.shakes.filter((sh) => sh.left > 0);

  // ── 走る ──
  s.runners.forEach((r, slot) => {
    r.bumpCool = Math.max(0, r.bumpCool - dt);
    let wx = 0, wz = 0;
    if (r.stun > 0) {
      r.stun = Math.max(0, r.stun - dt);
    } else if (s.phase === 'play' && inputs[slot]) {
      const dx = inputs[slot].x - r.x, dz = inputs[slot].z - r.z, d = Math.hypot(dx, dz);
      if (d > 0.08) {
        const sp = RULES.maxSpeed * Math.min(1, d / 0.6); // 着く手前でゆるめる
        wx = (dx / d) * sp;
        wz = (dz / d) * sp;
      }
    }
    const ax = wx - r.vx, az = wz - r.vz, am = Math.hypot(ax, az), lim = RULES.accel * dt;
    const k = am > lim ? lim / am : 1;
    r.vx += ax * k;
    r.vz += az * k;
    r.x += r.vx * dt;
    r.z += r.vz * dt;
    // 広場の外へは出ない
    const d = Math.hypot(r.x, r.z), max = ARENA_R - RULES.bodyR;
    if (d > max) {
      const nx = r.x / d, nz = r.z / d;
      r.x = nx * max;
      r.z = nz * max;
      const out = r.vx * nx + r.vz * nz;
      if (out > 0) {
        r.vx -= out * nx;
        r.vz -= out * nz;
      }
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
      // おたがいに向かう速さ
      const sa = a.vx * nx + a.vz * nz, sb = -(b.vx * nx + b.vz * nz);
      if (sa + sb > RULES.bumpSpeed && a.bumpCool <= 0 && b.bumpCool <= 0 && s.phase === 'play') {
        // 勢いのあったほうがぶつけた側。ぶつけられた側のかごからこぼれる
        const [hit, by, sign] = sa >= sb ? [j, i, 1] : [i, j, -1];
        const victim = R[hit];
        const k = Math.min(RULES.spill, victim.acorns);
        victim.acorns -= k;
        for (let n = 0; n < k; n++) {
          const ang = Math.atan2(nz * sign, nx * sign) + randRange(s, -1.2, 1.2), dist = randRange(s, 0.9, 1.5);
          const p = insideArena(victim.x + Math.cos(ang) * dist, victim.z + Math.sin(ang) * dist, 0.4);
          const it = { id: s.nextId++, kind: 'acorn', x: p.x, z: p.z, left: 0, ground: RULES.groundTime, lock: RULES.spillLock, from: hit };
          s.items.push(it);
          ev.push({ type: 'spill', id: it.id, x: it.x, z: it.z, from: hit });
        }
        victim.vx += nx * sign * 3.2;
        victim.vz += nz * sign * 3.2;
        R[by].vx *= 0.3;
        R[by].vz *= 0.3;
        a.bumpCool = b.bumpCool = RULES.bumpCool;
        ev.push({ type: 'bump', by, hit, spilled: k, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
      } else {
        // ふつうに押し合う: 向かう速さを消す
        const rel = sa + sb;
        if (rel > 0) {
          a.vx -= nx * rel / 2; a.vz -= nz * rel / 2;
          b.vx += nx * rel / 2; b.vz += nz * rel / 2;
        }
      }
    }
  }

  // 押し合いで外へ押し出されたら、広場の中へもどす
  for (const r of R) {
    const d = Math.hypot(r.x, r.z), max = ARENA_R - RULES.bodyR;
    if (d > max) { r.x = (r.x / d) * max; r.z = (r.z / d) * max; }
  }

  // ── 落ちる・受けとる・拾う ──
  const keep = [];
  for (const it of s.items) {
    if (it.ground === null) {
      it.left -= dt;
      if (it.left > 0) { keep.push(it); continue; }
      // 着地: いちばん近くの、目が回っていない人が受けとる
      let best = -1, bd = RULES.catchR;
      R.forEach((r, slot) => {
        const d = Math.hypot(r.x - it.x, r.z - it.z);
        if (r.stun <= 0 && d < bd) { bd = d; best = slot; }
      });
      if (best >= 0 && s.phase === 'play') {
        const r = R[best];
        if (isHazard(it.kind)) {
          r.stun = ITEMS[it.kind].stun;
          ev.push({ type: 'stun', slot: best, kind: it.kind, id: it.id });
        } else {
          r.acorns += ITEMS[it.kind].value;
          r.caught++;
          if (it.kind === 'gold') r.golds++;
          ev.push({ type: 'catch', slot: best, kind: it.kind, id: it.id });
        }
        continue;
      }
      if (isHazard(it.kind) || s.phase !== 'play') {
        ev.push({ type: 'land', id: it.id, kind: it.kind, x: it.x, z: it.z, gone: true });
        continue;
      }
      it.ground = RULES.groundTime;
      ev.push({ type: 'land', id: it.id, kind: it.kind, x: it.x, z: it.z, gone: false });
      keep.push(it);
      continue;
    }
    // 地面のどんぐり
    it.lock = Math.max(0, it.lock - dt);
    it.ground -= dt;
    let taken = false;
    if (it.lock <= 0 && s.phase === 'play') {
      for (let slot = 0; slot < R.length; slot++) {
        const r = R[slot];
        if (r.stun > 0 || Math.hypot(r.x - it.x, r.z - it.z) > RULES.pickR) continue;
        r.acorns += ITEMS[it.kind].value;
        if (it.kind === 'gold') r.golds++;
        ev.push({ type: 'pickup', slot, kind: it.kind, id: it.id });
        taken = true;
        break;
      }
    }
    if (taken) continue;
    if (it.ground <= 0) {
      ev.push({ type: 'vanish', id: it.id });
      continue;
    }
    keep.push(it);
  }
  s.items = keep;

  // ── 時間切れ ──
  if (s.phase === 'play' && s.t >= RULES.readyTime + RULES.timeLimit) {
    s.phase = 'finished';
    s.winner = ranking(s)[0];
    for (const it of s.items) ev.push({ type: 'vanish', id: it.id });
    s.items = [];
    s.shakes = [];
    ev.push({ type: 'timeup' });
    ev.push({ type: 'finished', winner: s.winner });
  }
  return ev;
}

// 順位: どんぐりの数 → 金どんぐりの数 → 席の順
export function ranking(s) {
  return s.runners.map((_, i) => i).sort((a, b) => {
    const A = s.runners[a], B = s.runners[b];
    return B.acorns - A.acorns || B.golds - A.golds || a - b;
  });
}
