// いかだレース のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 朝もやの森の川を、5人がそれぞれのいかだで下る。先にゴール(ビーバーのダムの水門)した子の勝ち。
// - 画面の左と右を「交互に」たたいて、こぐ。交互だと まっすぐ速く進む。
// - かいが水をとらえるには間がいるので、間をつめすぎると1かきが弱くなる。
//   左をたたくと左へ、右をたたくと右へ向きが変わる。同じがわを続けてたたくと、大きく曲がる(そのかわり進みは弱い)。
// - 水の抵抗があるので、速くたたくほど速いが、2倍たたいても2倍にはならない(ただの連打勝負になりすぎない)。
// - 川の流れがいつも少し運んでくれる。急流では速い。
// - 岩・流木にぶつかると止まって、くるっと回る(少しのあいだ うまくこげない)。
// - うずに近づくと吸いこまれて、ぐるぐる回る。強くこいで抜け出す。
// - 小さな滝では ざぶーんと落ちて、落ちたあと少し速くなる。
// - ほかの子のいかだと ぶつかり合える。横から当てると、相手がはじかれる。
//
// state を書きかえるのは step() だけ。乱数は state.rng だけ(時間帯とスタートの並び)。

import { nextRandom, seedFrom } from '../../rng.js';
import { FALLS, LENGTH, LOGS, LOG_R, POND_END, ROCKS, WHIRLS, currentAt, curvatureAt, halfWidthAt, logX } from './course.js';

export const STEP = 1 / 60;
export const TIMES_OF_DAY = ['morning', 'day', 'evening'];
export const RULES = {
  readyTime: 3,
  afterFirst: 12, // 1人めがゴールしてから、のこりを待つ時間
  stroke: 0.8, // 1かきで速くなる量(m/秒。間を十分あけたとき)
  catchTime: 0.12, // かいが水をとらえるのにかかる間(秒)
  sameSide: 0.55, // 同じがわを続けたとき、進む力はこれだけ
  strokeCool: 0.075, // これより速いタップは数えない(1秒に 13 回まで)
  dragLin: 0.32, // 水の抵抗(速さに比例)
  dragQuad: 0.1, // 水の抵抗(速さの2乗に比例)→ 1秒に6かきで 4.6m/秒くらい
  yawAlt: 0.22, // 交互のとき、1かきで向きが変わる勢い
  yawSame: 0.95, // 同じがわを続けたとき
  sideAlt: 0.12, // 交互のとき、1かきで横へ押す勢い(m/秒)
  sideSame: 0.45, // 同じがわを続けたとき
  yawDamp: 4, // 向きを変える勢いのおさまり方
  align: 0.55, // 流れが、いかだを川の向きへもどす強さ
  yawMax: 1.0,
  bodyR: 0.62, // いかだの大きさ(半径)
  bank: 2.5, // 岸にこすると遅くなる
  crashSlow: 0.25, // ぶつかったら、こいだ速さがこれだけに
  spinTime: 0.8, // ぶつかったあと、くるっと回っているあいだ(こいでも半分しか効かない)
  whirlPull: 2.4, // うずの吸いこむ強さ(m/秒、まん中ほど強い)
  whirlSwirl: 2.6, // うずの回す強さ
  fallTime: 0.6, // 滝で落ちているあいだ
  fallBoost: 1.4, // 落ちたあとの勢い
  kickDamp: 3.2, // ぶつかり合いではじかれた勢いのおさまり方
};

export function startX(lane) {
  return (lane - 2) * 1.7;
}

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:ikada`),
    phase: 'ready', // ready → race → finished
    firstFinish: null,
    winner: null,
    runners: players.map(() => ({
      s: 0, x: 0, v: 0, yaw: 0, yawV: 0, kx: 0, ks: 0, spin: 0, air: 0, whirl: -1, last: null, lastT: -1, cool: 0,
      strokes: 0, crashes: 0, finish: null, bumpCool: 0, bank: false, touch: false, wasTouch: false,
    })),
  };
  s.timeOfDay = TIMES_OF_DAY[Math.floor(nextRandom(s) * TIMES_OF_DAY.length)];
  // スタートの並びはくじ(最初のカーブの内がわが得をするので、毎回入れかえる)
  const lanes = players.map((_, i) => i);
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(s) * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  const n = players.length;
  s.runners.forEach((r, slot) => { r.lane = lanes[slot]; r.x = startX(lanes[slot] + (5 - n) / 2); });
  return s;
}

// 1かき。side: -1 = 左、1 = 右、0 = 両方いっしょ(まっすぐ)
function stroke(s, r, side, ev, slot) {
  const alt = side === 0 || r.last === null || r.last !== side;
  // かいが水をとらえるには間がいる: 前のかきから間がないほど弱い(連打の速さだけで決まりすぎないように)
  const gap = s.t - r.lastT;
  let push = RULES.stroke * (alt ? 1 : RULES.sameSide) * (1 - Math.exp(-gap / RULES.catchTime));
  r.lastT = s.t;
  if (r.spin > 0) push *= 0.5;
  r.v += push;
  if (side !== 0) {
    r.yawV += side * (alt ? RULES.yawAlt : RULES.yawSame);
    // かいで横へも少し押す(止まっていても、よけられるように)
    r.kx += side * (alt ? RULES.sideAlt : RULES.sideSame);
  }
  r.last = side === 0 ? null : side;
  r.cool = RULES.strokeCool;
  r.strokes++;
  ev.push({ type: 'stroke', slot, side });
}

// inputs[slot]: { left: bool, right: bool }(その瞬間にたたいたかどうか)
export function step(s, inputs) {
  const ev = [];
  const dt = STEP;
  s.t += dt;
  if (s.phase === 'ready' && s.t >= RULES.readyTime) {
    s.phase = 'race';
    ev.push({ type: 'start' });
  }
  const racing = s.phase === 'race';

  s.runners.forEach((r, slot) => {
    r.bumpCool = Math.max(0, r.bumpCool - dt);
    if (!racing && r.finish === null) return;
    const done = r.finish !== null;
    const inp = done ? {} : inputs[slot] || {};
    r.cool = Math.max(0, r.cool - dt);
    r.spin = Math.max(0, r.spin - dt);

    // こぐ(空中ではこげない)
    if (r.air <= 0 && r.cool <= 0 && (inp.left || inp.right)) stroke(s, r, inp.left && inp.right ? 0 : inp.left ? -1 : 1, ev, slot);

    // 水の抵抗。ゴールしたら ゆっくり止まる
    r.v = Math.max(0, r.v - (RULES.dragLin * r.v + RULES.dragQuad * r.v * r.v + (done ? 1.5 : 0)) * dt);

    // 向き: こいだ勢いで変わり、流れで川の向きへもどる
    r.yaw += r.yawV * dt;
    r.yawV *= Math.exp(-RULES.yawDamp * dt);
    r.yaw -= r.yaw * RULES.align * dt;
    r.yaw = Math.max(-RULES.yawMax, Math.min(RULES.yawMax, r.yaw));

    // 動く: 流れ + こいだ速さ(向きのぶん横へ)+ はじかれた勢い
    const u = currentAt(r.s);
    const c = curvatureAt(r.s);
    let vs = u + r.v * Math.cos(r.yaw) + r.ks;
    let vx = r.v * Math.sin(r.yaw) + r.kx - c * u * u * 0.25; // カーブでは外へ少し流される
    r.kx *= Math.exp(-RULES.kickDamp * dt);
    r.ks *= Math.exp(-RULES.kickDamp * dt);

    // うず: 吸いこまれて、まわりを回る。まん中では流れに運ばれない
    let inWhirl = -1;
    WHIRLS.forEach((w, i) => {
      const ds = r.s - w.s, dx = r.x - w.x;
      const d = Math.hypot(ds, dx);
      if (d >= w.R || r.air > 0) return;
      inWhirl = i;
      const k = 1 - d / w.R;
      const nd = Math.max(d, 0.3);
      vs -= (ds / nd) * RULES.whirlPull * k + u * k * 0.8;
      vx -= (dx / nd) * RULES.whirlPull * k;
      // 左まわり
      vs += (-dx / nd) * RULES.whirlSwirl * k;
      vx += (ds / nd) * RULES.whirlSwirl * k;
      r.yaw += RULES.whirlSwirl * k * dt * 0.8; // いかだもくるくる
    });
    if (inWhirl !== r.whirl) {
      if (inWhirl >= 0) ev.push({ type: 'whirlIn', slot, i: inWhirl });
      else ev.push({ type: 'whirlOut', slot, i: r.whirl });
      r.whirl = inWhirl;
    }

    const before = r.s;
    r.s += (vs * dt) / Math.max(0.6, 1 - c * r.x);
    r.x += vx * dt;

    // 滝
    if (r.air > 0) {
      r.air = Math.max(0, r.air - dt);
      if (r.air === 0) { r.v += RULES.fallBoost; ev.push({ type: 'splash', slot }); }
    } else {
      for (const f of FALLS) if (before < f.s && r.s >= f.s) { r.air = RULES.fallTime; ev.push({ type: 'fall', slot, i: FALLS.indexOf(f) }); }
    }

    // 岸: こすると遅くなって、川のまん中へ向きなおる
    const hw = halfWidthAt(r.s) - RULES.bodyR;
    r.bank = false;
    if (Math.abs(r.x) > hw) {
      r.x = Math.sign(r.x) * hw;
      r.kx = 0;
      r.bank = true;
      r.v = Math.max(0, r.v - RULES.bank * dt);
      r.yaw -= Math.sign(r.yaw) * Math.min(Math.abs(r.yaw), 2 * dt);
    }

    // 岩・流木(当たりはじめだけ「ぶつかった」。押しつけられているあいだは数えない)
    r.wasTouch = r.touch;
    r.touch = false;
    if (r.air <= 0 && !done) {
      for (const k of ROCKS) hit(s, r, slot, k.s, k.x, k.r, ev, 'rock');
      for (const lg of LOGS) {
        // 流木は横に長い: いちばん近い点で当たりを見る
        const cx = logX(lg, s.t);
        const nx = Math.max(cx - lg.len / 2, Math.min(cx + lg.len / 2, r.x));
        hit(s, r, slot, lg.s, nx, LOG_R, ev, 'log');
      }
    }

    // 池のおわり(ダムのかべ)より先へは行かない
    if (r.s > POND_END - 2) { r.s = POND_END - 2; r.v = 0; }

    // ゴール
    if (!done && r.s >= LENGTH) {
      r.finish = s.t - RULES.readyTime;
      if (s.firstFinish === null) s.firstFinish = s.t;
      ev.push({ type: 'goal', slot, time: r.finish });
    }
  });

  // いかだどうし: 押しあう。横から当てると相手がはじかれる。うしろから当てると前の子が押される
  const R = s.runners;
  for (let i = 0; i < R.length; i++) {
    for (let j = i + 1; j < R.length; j++) {
      const a = R[i], b = R[j];
      if (a.finish !== null || b.finish !== null || a.air > 0 || b.air > 0) continue;
      const ds = b.s - a.s, dx = b.x - a.x;
      const d = Math.hypot(ds, dx);
      const min = RULES.bodyR * 2;
      if (d >= min || d === 0) continue;
      const ns = ds / d, nx = dx / d;
      const over = (min - d) / 2;
      a.s -= ns * over; a.x -= nx * over;
      b.s += ns * over; b.x += nx * over;
      if (a.bumpCool > 0 || b.bumpCool > 0) continue;
      // ぶつかる勢い: 横の動きの差(当てにいったほうが強い)
      const avx = a.v * Math.sin(a.yaw) + a.kx, bvx = b.v * Math.sin(b.yaw) + b.kx;
      const rel = (avx - bvx) * nx + (a.v - b.v) * ns; // a が b へ向かう速さ
      const hard = Math.max(0.6, Math.abs(rel));
      // 向かっていったがわは あまりはじかれず、受けたがわが大きくはじかれる
      const toA = rel > 0 ? 0.35 : 1, toB = rel > 0 ? 1 : 0.35;
      a.kx -= nx * hard * 1.6 * toA; a.ks -= ns * hard * 0.6 * toA;
      b.kx += nx * hard * 1.6 * toB; b.ks += ns * hard * 0.6 * toB;
      a.bumpCool = b.bumpCool = 0.5;
      ev.push({ type: 'bump', a: i, b: j, hard });
    }
  }
  for (const r of R) {
    const hw = halfWidthAt(r.s) - RULES.bodyR;
    r.x = Math.max(-hw, Math.min(hw, r.x));
  }

  if (s.phase === 'race' && (R.every((r) => r.finish !== null) || (s.firstFinish !== null && s.t >= s.firstFinish + RULES.afterFirst))) {
    s.phase = 'finished';
    s.winner = ranking(s)[0];
    ev.push({ type: 'finished', winner: s.winner });
  }
  return ev;
}

// 岩・流木(の いちばん近い点)に当たったか。当たったら押しもどして、止めて、回す
function hit(s, r, slot, hs, hx, hr, ev, kind) {
  const ds = r.s - hs, dx = r.x - hx;
  const d = Math.hypot(ds, dx);
  const min = hr + RULES.bodyR;
  if (d >= min) return;
  // 押しもどす。まっすぐ当たっても横へよけられるように、横にも少しずらす
  const nd = d || 0.001;
  r.s = hs + (ds / nd) * min;
  r.x = hx + (dx / nd) * min;
  // よける向き: ふつうは当たったがわへ。ただし岸に近い岩なら、川のまん中のほうへ(岸とのすきまに はまらないように)
  const gap = halfWidthAt(hs) - Math.abs(hx) - hr;
  let side = dx !== 0 ? Math.sign(dx) : (slot % 2 ? 1 : -1);
  if (gap < RULES.bodyR * 2 + 0.2 && side === Math.sign(hx)) side = -side;
  r.x += side * 1.8 * STEP;
  r.touch = true;
  if (r.spin <= 0 && !r.wasTouch) {
    r.v *= RULES.crashSlow;
    r.ks = Math.min(r.ks, -1.2); // 少し はねかえる
    r.kx += side * 0.8;
    r.yawV += side * 3;
    r.spin = RULES.spinTime;
    r.crashes++;
    ev.push({ type: 'crash', slot, kind, s: hs, x: hx });
  }
}

// 順位: ゴールした順 → ゴールしていない子は進んだ道のりの順
export function ranking(s) {
  return s.runners.map((_, i) => i).sort((a, b) => {
    const A = s.runners[a], B = s.runners[b];
    if (A.finish !== null && B.finish !== null) return A.finish - B.finish || a - b;
    if (A.finish !== null) return -1;
    if (B.finish !== null) return 1;
    return B.s - A.s || a - b;
  });
}

export const progress = (r) => Math.min(1, Math.max(0, r.s / LENGTH));
