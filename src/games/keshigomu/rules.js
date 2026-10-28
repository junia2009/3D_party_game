// 森の学校の けしごむ大戦 のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 5人が それぞれ 自分の けしごむを つくえの 上で はじいて、ほかの けしごむを つくえから おとす。
// さいごまで のこった 子の 勝ち。
// - はじく: けしごむが とまって いる ときなら いつでも。おして いる あいだ ためて(長いほど つよい)、はなすと とぶ。
//   向き(aim)は じぶんで きめる。ひねり(spin)を 入れると くるっと 回りながら すべり、すこし まがる。
//   ぶつかって いる とちゅうで おされると ためは きえる。
// - けしごむの かたち: まる・しかく・ながしかく・どんぐり。おもさと すべりが ちがう。かたちは 円を いくつか
//   くみあわせて あらわす(角に あたると 回る)。
// - だんだん せまく なる: しばらく すると つくえの はしが けずれて いく。
// - おちる: けしごむの まんなかが つくえの そとに 出たら おちる。
// 順位: のこった 子 → おちるのが おそかった 順。時間ぎれは まんなかに ちかい 順。
//
// inputs[slot]: { hold(おして いる), aim(向き。ラジアン), spin(-1〜1) } または null
// 座標: つくえの まんなかが 原点。x は よこ、y は おく(画面の 上)。単位は だいたい けしごむ 1こ ぶん。
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { randRange, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;
const SUB = 2; // 1ステップを こまかく わけて ぶつかりを みる

export const RULES = {
  readyTime: 3.0,
  battleTime: 80, // これで おわり(のこった 子は まんなかに ちかい 順)
  showTime: 2.6,
  desk: [14, 9.5], // つくえの はば・おくゆき
  shrinkFrom: 20, // せまく なりはじめる(秒)
  shrinkTo: 65, // ここで いちばん せまい
  shrinkMin: 0.4, // いちばん せまい ときの 大きさ(わりあい)
  chargeTime: 0.9, // ためが いっぱいに なるまで
  vmin: 2.5, // ちょっとだけ ためた ときの はやさ
  vmax: 9, // いっぱい ためた ときの はやさ
  spin: 10, // ひねりの 回る はやさ(いっぱいの とき)
  curve: 0.07, // 回って いると すこし まがる
  restSpeed: 0.35, // これより おそければ「とまって いる」
  restSpin: 1.2,
  cool: 0.35, // はじいた あと つぎに ためられるまで
  bounce: 0.45, // ぶつかった ときの はねかえり
  rub: 0.25, // ぶつかった ときの こすれ(回る もと)
};

// けしごむの かたち。circles: [x, y, 半径](けしごむの 中の 座標)
export const SHAPES = {
  maru: { label: 'まる', circles: [[0, 0, 0.78]], density: 1.0, fric: 4.2 },
  kaku: { label: 'しかく', circles: [[-0.38, -0.38, 0.44], [0.38, -0.38, 0.44], [-0.38, 0.38, 0.44], [0.38, 0.38, 0.44]], density: 0.62, fric: 5.4 },
  naga: { label: 'ながしかく', circles: [[-0.62, 0, 0.46], [0, 0, 0.46], [0.62, 0, 0.46]], density: 0.8, fric: 5.8 },
  donguri: { label: 'どんぐり', circles: [[0, -0.22, 0.64], [0, 0.56, 0.4]], density: 0.9, fric: 4.8 },
};
const BY_CHAR = { ponta: 'donguri', mimi: 'maru', gonzo: 'naga', penne: 'maru', konko: 'kaku', kerosuke: 'donguri', kirin: 'naga', ray: 'kaku' };
const BY_SEAT = ['kaku', 'maru', 'naga', 'donguri', 'maru'];
export const shapeOf = (player, slot) => BY_CHAR[player?.character] || BY_SEAT[slot % BY_SEAT.length];

export function makeBody(kind, x, y, a) {
  const sh = SHAPES[kind];
  let mass = 0, inertia = 0;
  for (const [cx, cy, r] of sh.circles) {
    const m = sh.density * r * r * 2.2;
    mass += m;
    inertia += m * (r * r / 2 + cx * cx + cy * cy);
  }
  return { kind, x, y, a, vx: 0, vy: 0, w: 0, mass, I: inertia, fric: sh.fric, out: false, outAt: null, outBy: null, charge: 0, blocked: false, cool: 0, hitBy: null, hitAt: -9, flicks: 0 };
}

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:keshigomu`),
    phase: 'ready', // ready → battle → show → finished
    phaseT: RULES.readyTime,
    shrink: 1, // いまの つくえの 大きさ(わりあい)
    winner: null,
  };
  const [W, D] = RULES.desk;
  // はじめの ならび: だ円の 上に 5つ(すこし ずらす)
  const off = randRange(s, 0, Math.PI * 2);
  s.bodies = players.map((p, slot) => {
    const ang = off + (slot / players.length) * Math.PI * 2;
    return makeBody(shapeOf(p, slot), Math.cos(ang) * W * 0.28, Math.sin(ang) * D * 0.28, randRange(s, 0, Math.PI));
  });
  return s;
}

// いまの つくえの はんぶんの 大きさ
export function halfDesk(s) {
  return [RULES.desk[0] / 2 * s.shrink, RULES.desk[1] / 2 * s.shrink];
}
// けしごむの 中の 円の 世界の 位置
export function circlesOf(b) {
  const c = Math.cos(b.a), sn = Math.sin(b.a);
  return SHAPES[b.kind].circles.map(([x, y, r]) => [b.x + x * c - y * sn, b.y + x * sn + y * c, r]);
}
export const speedOf = (b) => Math.hypot(b.vx, b.vy);
export const canFlick = (s, b) => s.phase === 'battle' && !b.out && b.cool <= 0 && speedOf(b) < RULES.restSpeed && Math.abs(b.w) < RULES.restSpin;
export const aliveCount = (s) => s.bodies.filter((b) => !b.out).length;
export const timeLeft = (s) => (s.phase === 'battle' ? Math.max(0, s.phaseT) : 0);
// ためた ぶんの はやさ
export const launchSpeed = (charge) => RULES.vmin + (RULES.vmax - RULES.vmin) * charge;

// ぶつかり: 円どうしで しらべて、はねかえり と こすれ(回る もと)を いれる
function collide(s, A, B, ia, ib, ev) {
  const ca = circlesOf(A), cb = circlesOf(B);
  const invA = 1 / A.mass, invB = 1 / B.mass, invIA = 1 / A.I, invIB = 1 / B.I;
  for (const [ax, ay, ar] of ca) for (const [bx, by, br] of cb) {
    let dx = bx - ax, dy = by - ay;
    const d = Math.hypot(dx, dy);
    if (d >= ar + br || d < 1e-6) continue;
    const nx = dx / d, ny = dy / d;
    const pen = ar + br - d;
    // めりこみを もどす(おもさで わける)
    const corr = pen * 0.8 / (invA + invB);
    A.x -= nx * corr * invA; A.y -= ny * corr * invA;
    B.x += nx * corr * invB; B.y += ny * corr * invB;
    // ふれた ところ
    const px = ax + nx * ar, py = ay + ny * ar;
    const rax = px - A.x, ray = py - A.y, rbx = px - B.x, rby = py - B.y;
    const rvx = (B.vx - B.w * rby) - (A.vx - A.w * ray);
    const rvy = (B.vy + B.w * rbx) - (A.vy + A.w * rax);
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) continue;
    const ran = rax * ny - ray * nx, rbn = rbx * ny - rby * nx;
    const j = -(1 + RULES.bounce) * vn / (invA + invB + ran * ran * invIA + rbn * rbn * invIB);
    let ix = j * nx, iy = j * ny;
    // こすれ
    const tx = rvx - vn * nx, ty = rvy - vn * ny;
    const tl = Math.hypot(tx, ty);
    if (tl > 1e-6) {
      const ux = tx / tl, uy = ty / tl;
      const rat = rax * uy - ray * ux, rbt = rbx * uy - rby * ux;
      let jt = -tl / (invA + invB + rat * rat * invIA + rbt * rbt * invIB);
      jt = Math.max(-RULES.rub * j, Math.min(RULES.rub * j, jt));
      ix += jt * ux; iy += jt * uy;
    }
    A.vx -= ix * invA; A.vy -= iy * invA; A.w -= (rax * iy - ray * ix) * invIA;
    B.vx += ix * invB; B.vy += iy * invB; B.w += (rbx * iy - rby * ix) * invIB;
    // ぶつけられた 子は ためが きえる(いちど はなすまで ためられない)。だれに やられたか おぼえる
    for (const X of [A, B]) if (X.charge > 0) { X.charge = 0; X.blocked = true; }
    A.hitBy = ib; A.hitAt = s.t; B.hitBy = ia; B.hitAt = s.t;
    if (j > 0.6) ev.push({ type: 'hit', a: ia, b: ib, power: j, x: px, y: py });
  }
}

function moveBody(b, dt) {
  // まわって いると すこし まがる
  if (Math.abs(b.w) > 0.5) {
    const k = -b.w * RULES.curve * dt;
    const c = Math.cos(k), sn = Math.sin(k);
    [b.vx, b.vy] = [b.vx * c - b.vy * sn, b.vx * sn + b.vy * c];
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.a += b.w * dt;
  // つくえとの まさつ(すべりは かたちで ちがう)
  const sp = speedOf(b);
  if (sp > 0) {
    const ns = Math.max(0, sp - b.fric * dt);
    b.vx *= ns / sp; b.vy *= ns / sp;
  }
  const dw = b.fric * 1.2 * dt;
  b.w = Math.abs(b.w) <= dw ? 0 : b.w - Math.sign(b.w) * dw;
}

export function step(s, inputs) {
  const ev = [];
  if (s.phase === 'finished') return ev;
  s.t += STEP;
  s.phaseT -= STEP;
  if (s.phase === 'ready') {
    if (s.phaseT <= 0) {
      s.phase = 'battle';
      s.phaseT = RULES.battleTime;
      ev.push({ type: 'go' });
    }
    return ev;
  }
  if (s.phase === 'show') {
    if (s.phaseT <= 0) {
      s.phase = 'finished';
      s.winner = ranking(s)[0];
      ev.push({ type: 'finished', winner: s.winner });
    }
    return ev;
  }
  // つくえが せまく なる
  const bt = RULES.battleTime - s.phaseT;
  const k = Math.max(0, Math.min(1, (bt - RULES.shrinkFrom) / (RULES.shrinkTo - RULES.shrinkFrom)));
  const was = s.shrink;
  s.shrink = 1 - (1 - RULES.shrinkMin) * k;
  if (was === 1 && s.shrink < 1) ev.push({ type: 'shrink' });
  // ためる・はじく
  s.bodies.forEach((b, slot) => {
    if (b.out) return;
    if (b.cool > 0) b.cool = Math.max(0, b.cool - STEP);
    const inp = inputs[slot];
    const hold = !!inp?.hold;
    if (!hold) b.blocked = false;
    if (hold && !b.blocked && (b.charge > 0 || canFlick(s, b))) {
      b.charge = Math.min(1, b.charge + STEP / RULES.chargeTime);
    } else if (!hold && b.charge > 0) {
      const v = launchSpeed(b.charge);
      const aim = inp?.aim ?? 0;
      b.vx = Math.cos(aim) * v;
      b.vy = Math.sin(aim) * v;
      const spin = Math.max(-1, Math.min(1, inp?.spin || 0));
      b.w = spin * RULES.spin * (0.4 + 0.6 * b.charge);
      b.cool = RULES.cool;
      b.flicks++;
      ev.push({ type: 'flick', slot, power: b.charge, spin });
      b.charge = 0;
    }
  });
  // うごかす・ぶつかる
  const dt = STEP / SUB;
  for (let k2 = 0; k2 < SUB; k2++) {
    for (const b of s.bodies) if (!b.out) moveBody(b, dt);
    for (let i = 0; i < s.bodies.length; i++) for (let j = i + 1; j < s.bodies.length; j++) {
      if (s.bodies[i].out || s.bodies[j].out) continue;
      collide(s, s.bodies[i], s.bodies[j], i, j, ev);
    }
  }
  // おちる
  const [hx, hy] = halfDesk(s);
  s.bodies.forEach((b, slot) => {
    if (b.out || (Math.abs(b.x) <= hx && Math.abs(b.y) <= hy)) return;
    b.out = true;
    b.outAt = s.t;
    b.outBy = b.hitBy !== null && s.t - b.hitAt < 3 ? b.hitBy : null;
    b.charge = 0;
    ev.push({ type: 'out', slot, by: b.outBy, x: b.x, y: b.y, vx: b.vx, vy: b.vy });
  });
  if (aliveCount(s) <= 1 || s.phaseT <= 0) {
    s.phase = 'show';
    s.phaseT = RULES.showTime;
    ev.push({ type: 'show' });
  }
  return ev;
}

// 順位: のこった 子(まんなかに ちかい 順)→ おちるのが おそかった 順 → 席
export function ranking(s) {
  return s.bodies.map((_, i) => i).sort((a, b) => {
    const A = s.bodies[a], B = s.bodies[b];
    if (A.out !== B.out) return A.out ? 1 : -1;
    if (!A.out) return Math.hypot(A.x, A.y) - Math.hypot(B.x, B.y) || a - b;
    return B.outAt - A.outAt || a - b;
  });
}
