// 遊園地の バンパーカー のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 屋根つきの 丸い リンクの上で、5台の バンパーカーが ぶつけあう。リンクの ふちから 出たら 脱落。最後まで残った子の勝ち。
// - 走る: スティックの 向きへ ハンドルを きる(車は すぐには 曲がれない。前へ しか 進まない)。たおすほど アクセル。
//   ぶつかった あとは 横へ すべる(タイヤの グリップで だんだん 前を 向く)。
// - ダッシュ: ボタンで 少し ためて(windup)、前へ ぐんと 加速。ダッシュ中は 重くて、当てた 相手を 大きく はじく。
//   つかったあとは しばらく つかえない(cool)。
// - リンクが ちぢむ: しばらくすると、ふちが 少しずつ 内がわへ。
// - 回る まん中: まん中の 円盤が 回っている。のると いっしょに 回されて、外へ 流される。とちゅうで 回る 向きが かわる。
//
// inputs[slot]: { x, z(スティックの 向き。長さ 0〜1。null なら 手を はなす), dash(ボタンを おしているか) } か null。
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;

export const RULES = {
  readyTime: 3,
  timeLimit: 75, // これをこえたら、まん中に近い順
  r0: 6.5, // はじめの リンクの 半径
  rMin: 3.4, // ちぢみきった 半径
  shrinkAt: 16, // ちぢみはじめる(はじまってから)
  shrinkEnd: 46, // ちぢみおわる
  shrinkWarn: 2.5, // ちぢむ前の 合図
  edge: 0.05, // 中心が ふちから これだけ 出たら 落ちる
  // 車
  bodyR: 0.62,
  maxSpeed: 3.3,
  accel: 6.5,
  turn: 3.3, // ハンドル(ラジアン/秒)
  grip: 3.2, // 横すべりが へる はやさ
  drag: 1.1, // アクセルを はなしたときの へり
  // ダッシュ
  windup: 0.22,
  boost: 6.0, // 前へ 足す 速さ(m/秒)
  dashTime: 0.45,
  dashMass: 1.9,
  cool: 1.9,
  // ぶつかる
  bounce: 0.9,
  knock: 3.4, // ダッシュで 当てたときの 追加の はじき(いちばん強いとき)
  stunAt: 4.2,
  stun: 0.4,
  // 回る まん中
  diskR: 1.9,
  spin: 1.25, // ラジアン/秒
  fling: 2.6, // 外へ 流す 強さ(m/秒² を 中心からの きょりに かける)
  flipEvery: [9, 13], // 回る 向きが かわる
};

export function startPos(slot, n) {
  const a = Math.PI / 2 + (slot / n) * Math.PI * 2;
  return { x: Math.cos(a) * 4.3, z: Math.sin(a) * 4.3 };
}

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:bumper`),
    phase: 'ready', // ready → play → finished
    radius: RULES.r0,
    warned: false,
    shrinking: false,
    spinDir: 1,
    diskAngle: 0,
    nextFlip: 0,
    winner: null,
    out: [], // 落ちた順
    runners: players.map((_, slot) => {
      const p = startPos(slot, players.length);
      return {
        x: p.x, z: p.z, vx: 0, vz: 0, h: Math.atan2(-p.x, -p.z), alive: true,
        wind: 0, dash: 0, cool: 0, stun: 0, held: false, steer: 0,
        lastHit: null, lastHitT: -9, pushes: 0, dashes: 0,
      };
    }),
  };
  s.spinDir = nextRandom(s) < 0.5 ? 1 : -1;
  s.nextFlip = RULES.flipEvery[0] + nextRandom(s) * (RULES.flipEvery[1] - RULES.flipEvery[0]);
  return s;
}

export const playTime = (s) => Math.max(0, s.t - RULES.readyTime);
export const timeLeft = (s) => Math.max(0, RULES.timeLimit - playTime(s));
export const aliveSlots = (s) => s.runners.map((r, i) => (r.alive ? i : -1)).filter((i) => i >= 0);
export const onDisk = (r) => Math.hypot(r.x, r.z) < RULES.diskR;
const mass = (r) => (r.dash > 0 ? RULES.dashMass : 1);
// 時間 tp の リンクの 半径
export function radiusAt(tp) {
  if (tp <= RULES.shrinkAt) return RULES.r0;
  const k = Math.min(1, (tp - RULES.shrinkAt) / (RULES.shrinkEnd - RULES.shrinkAt));
  return RULES.r0 + (RULES.rMin - RULES.r0) * k;
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

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
  const tp = playTime(s);

  // ── リンクが ちぢむ / まん中が 回る ──
  if (play) {
    if (!s.warned && tp >= RULES.shrinkAt - RULES.shrinkWarn) { s.warned = true; ev.push({ type: 'shrinkWarn' }); }
    if (!s.shrinking && tp >= RULES.shrinkAt) { s.shrinking = true; ev.push({ type: 'shrink' }); }
    s.radius = radiusAt(tp);
    if (tp >= s.nextFlip) {
      s.spinDir *= -1;
      s.nextFlip += RULES.flipEvery[0] + nextRandom(s) * (RULES.flipEvery[1] - RULES.flipEvery[0]);
      ev.push({ type: 'flip', dir: s.spinDir });
    }
  }
  const w = play ? RULES.spin * s.spinDir : RULES.spin * 0.4 * s.spinDir;
  s.diskAngle += w * dt;

  // ── 走る ──
  s.runners.forEach((r, slot) => {
    if (!r.alive) return;
    const inp = play ? inputs[slot] : null;
    r.dash = Math.max(0, r.dash - dt);
    r.cool = Math.max(0, r.cool - dt);
    r.stun = Math.max(0, r.stun - dt);
    const can = play && r.stun <= 0;
    // ダッシュ: おした 瞬間に ため → windup の あとで 前へ
    const press = !!inp?.dash;
    if (can && press && !r.held && r.cool <= 0 && r.wind <= 0 && r.dash <= 0) {
      r.wind = RULES.windup;
      ev.push({ type: 'windup', slot });
    }
    r.held = press;
    if (r.wind > 0) {
      r.wind -= dt;
      if (r.wind <= 0) {
        r.wind = 0;
        r.vx += Math.sin(r.h) * RULES.boost;
        r.vz += Math.cos(r.h) * RULES.boost;
        r.dash = RULES.dashTime;
        r.cool = RULES.cool;
        r.dashes++;
        ev.push({ type: 'dash', slot });
      }
    }
    // ハンドルと アクセル
    let throttle = 0;
    r.steer = 0;
    if (can && inp && inp.x != null) {
      const m = Math.min(1, Math.hypot(inp.x, inp.z));
      if (m > 0.15) {
        const diff = wrap(Math.atan2(inp.x, inp.z) - r.h);
        const turn = Math.sign(diff) * Math.min(Math.abs(diff), RULES.turn * dt);
        r.h = wrap(r.h + turn);
        r.steer = Math.max(-1, Math.min(1, diff * 2));
        throttle = m * (0.3 + 0.7 * Math.max(0, Math.cos(diff)));
      }
    }
    if (r.wind > 0) throttle *= 0.3; // ためている あいだは ゆっくり
    // 前と 横に わける
    const fx = Math.sin(r.h), fz = Math.cos(r.h);
    let f = r.vx * fx + r.vz * fz;
    let l = r.vx * fz - r.vz * fx;
    if (r.dash <= 0) {
      if (throttle > 0 && f < RULES.maxSpeed * throttle) f = Math.min(RULES.maxSpeed * throttle, f + RULES.accel * throttle * dt);
      else f *= Math.exp(-RULES.drag * dt);
      if (f > RULES.maxSpeed && r.dash <= 0) f += (RULES.maxSpeed - f) * Math.min(1, dt * 2.5); // ダッシュの いきおいは だんだん もどる
    }
    l *= Math.exp(-RULES.grip * dt);
    r.vx = fx * f + fz * l;
    r.vz = fz * f - fx * l;
    // 回る まん中: いっしょに 回されて、外へ 流される
    if (onDisk(r)) {
      const d = Math.hypot(r.x, r.z) || 1e-3;
      const a = w * dt, c = Math.cos(a), sn = Math.sin(a);
      const x = r.x * c + r.z * sn, z = -r.x * sn + r.z * c; // 上から見て 回す(y 軸まわり)
      r.x = x; r.z = z;
      r.h = wrap(r.h + a);
      r.vx += (r.x / d) * RULES.fling * d * dt;
      r.vz += (r.z / d) * RULES.fling * d * dt;
    }
    r.x += r.vx * dt;
    r.z += r.vz * dt;
  });

  // ── ぶつかる ──
  const R = s.runners;
  for (let i = 0; i < R.length; i++) {
    for (let j = i + 1; j < R.length; j++) {
      const a = R[i], b = R[j];
      if (!a.alive || !b.alive) continue;
      let dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      const minD = RULES.bodyR * 2;
      if (d >= minD) continue;
      if (d < 1e-6) { dx = 1; dz = 0; d = 1e-6; }
      const nx = dx / d, nz = dz / d;
      const ma = mass(a), mb = mass(b);
      const over = minD - d;
      a.x -= nx * over * (mb / (ma + mb)); a.z -= nz * over * (mb / (ma + mb));
      b.x += nx * over * (ma / (ma + mb)); b.z += nz * over * (ma / (ma + mb));
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (rel <= 0) continue;
      const imp = ((1 + RULES.bounce) * rel) / (1 / ma + 1 / mb) * 0.5;
      a.vx -= (imp / ma) * nx; a.vz -= (imp / ma) * nz;
      b.vx += (imp / mb) * nx; b.vz += (imp / mb) * nz;
      const byA = a.dash > 0 && !(b.dash > 0 && b.dash > a.dash);
      const byB = b.dash > 0 && !byA;
      const kick = RULES.knock * Math.min(1, rel / (RULES.maxSpeed + RULES.boost));
      if (byA) { b.vx += nx * kick; b.vz += nz * kick; a.dash = 0; }
      if (byB) { a.vx -= nx * kick; a.vz -= nz * kick; b.dash = 0; }
      if (rel > RULES.stunAt) {
        if (!byA) a.stun = Math.max(a.stun, RULES.stun);
        if (!byB) b.stun = Math.max(b.stun, RULES.stun);
      }
      a.lastHit = j; a.lastHitT = s.t;
      b.lastHit = i; b.lastHitT = s.t;
      if (play && rel > 0.8) ev.push({ type: 'bump', a: i, b: j, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, force: rel, by: byA ? i : byB ? j : null });
    }
  }

  // ── 落ちる ──
  if (play) {
    const fell = [];
    s.runners.forEach((r, slot) => {
      if (!r.alive) return;
      if (Math.hypot(r.x, r.z) <= s.radius + RULES.edge) return;
      r.alive = false;
      r.wind = 0;
      const by = r.lastHit !== null && s.t - r.lastHitT < 2 ? r.lastHit : null;
      if (by !== null) s.runners[by].pushes++;
      fell.push(slot);
      ev.push({ type: 'fall', slot, x: r.x, z: r.z, vx: r.vx, vz: r.vz, by });
    });
    fell.sort((p, q) => {
      const P = s.runners[p], Q = s.runners[q];
      const op = (P.vx * P.x + P.vz * P.z) / Math.hypot(P.x, P.z), oq = (Q.vx * Q.x + Q.vz * Q.z) / Math.hypot(Q.x, Q.z);
      return oq - op || q - p;
    });
    s.out.push(...fell);
    const alive = aliveSlots(s);
    if (alive.length <= 1 || timeLeft(s) <= 0) {
      s.phase = 'finished';
      s.winner = ranking(s)[0];
      ev.push({ type: 'finished', winner: s.winner, timeUp: alive.length > 1 });
    }
  }
  return ev;
}

// 順位: のこっている子(まん中に近い順)、そのあとは 落ちたのが おそい順
export function ranking(s) {
  const alive = aliveSlots(s).sort((a, b) => Math.hypot(s.runners[a].x, s.runners[a].z) - Math.hypot(s.runners[b].x, s.runners[b].z) || a - b);
  return [...alive, ...[...s.out].reverse()];
}
