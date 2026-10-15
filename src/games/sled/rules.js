// 落ち葉そりレース のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 紅葉の山道を、落ち葉のそりで5人いっしょにすべりおりる。先にゴールした人の勝ち。
// - 左を押すと左へ、右を押すと右へ。両方押すと体を伏せて速くなる(そのあいだは曲がれない)。
// - カーブでは外がわへ流される。内がわを走るほど道のりが短い。
// - 道のふち・しげみの島にこすると、落ち葉の山にめりこんで遅くなる。
// - キノコのジャンプ台に乗ると大きく飛んで、少し速くなる。
// - どんぐりを拾うと、少しのあいだ速くなる。
// - わかれ道: 島の右(内がわ)はせまい近道、左(外がわ)は広い遠回り(どんぐりとジャンプ台がある)。
//
// state を書きかえるのは step() だけ。乱数は state.rng だけ(いまはコースが決まっているので、時間帯だけに使う)。

import { nextRandom, seedFrom } from '../../rng.js';
import { ACORNS, LENGTH, MUSHROOMS, curvatureAt, halfWidthAt, islandAt } from './course.js';

export const STEP = 1 / 60;
export const TIMES_OF_DAY = ['morning', 'day', 'evening'];
export const RULES = {
  readyTime: 3,
  afterFirst: 10, // 1人めがゴールしてから、のこりを待つ時間
  slope: 2.6, // 坂で速くなる力
  drag: 0.026, // 空気の抵抗(速さの2乗に比例)→ ふつうの最高速は 10m/秒くらい
  tuckSlope: 0.6, // 伏せると、坂の力が少し増えて
  tuckDrag: 0.85, // 抵抗が減る → 12m/秒くらい
  boost: 3.5, // どんぐりの加速
  boostPer: 0.6, // どんぐり1こで加速する時間
  boostMax: 2.0,
  steer: 4.2, // 横へ動く速さ(m/秒)
  steerRate: 10,
  drift: 0.36, // カーブで外へ流される強さ(速さの2乗に比例。10m/秒・半径30m で 1.2m/秒)
  scrape: 4, // ふち・島にこすると遅くなる強さ
  bodyR: 0.4,
  jumpTime: 0.85,
  jumpBoost: 1.5,
  pickR: 0.65,
  mushR: 0.9,
};

export function startX(slot) {
  return (slot - 2) * 1.1;
}

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:sled`),
    phase: 'ready', // ready → race → finished
    firstFinish: null,
    winner: null,
    taken: players.map(() => new Set()), // 子ごとに、拾ったどんぐり(番号)。どんぐりは子ごとにある(取り合いにしない)
    runners: players.map(() => ({ s: 0, x: 0, v: 0, vx: 0, air: 0, boost: 0, acorns: 0, jumps: 0, tuck: false, scrape: false, finish: null, bumpCool: 0 })),
  };
  s.timeOfDay = TIMES_OF_DAY[Math.floor(nextRandom(s) * TIMES_OF_DAY.length)];
  // スタートの並びはレースごとにくじで決める(最初のカーブの内がわの子が得をするので、毎回入れかえる)
  const lanes = players.map((_, i) => i);
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(s) * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  s.runners.forEach((r, slot) => { r.x = startX(lanes[slot]); r.lane = lanes[slot]; });
  return s;
}

// inputs[slot]: { left: bool, right: bool }
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
    const inp = inputs[slot] || {};
    const done = r.finish !== null;
    const left = !done && inp.left, right = !done && inp.right;
    r.tuck = left && right && r.air <= 0;
    const steer = r.tuck ? 0 : (right ? 1 : 0) - (left ? 1 : 0);

    // 前へ: 坂で速くなり、抵抗で頭打ち。伏せる・どんぐりで速く。ゴールしたらゆっくり止まる
    let acc = RULES.slope + (r.tuck ? RULES.tuckSlope : 0) - RULES.drag * (r.tuck ? RULES.tuckDrag : 1) * r.v * r.v;
    if (r.boost > 0) { acc += RULES.boost; r.boost = Math.max(0, r.boost - dt); }
    if (done) acc = -6;
    r.v = Math.max(0, r.v + acc * dt);

    // 横: 押した向きへ。空中では半分しか効かない。カーブでは外へ流される
    const want = steer * RULES.steer * (r.air > 0 ? 0.5 : 1);
    r.vx += (want - r.vx) * Math.min(1, RULES.steerRate * dt);
    // 流される分は、押した横の動きとは別に、位置を直接ずらす(横の動きのブレーキで消えないように)
    const c = curvatureAt(r.s);
    const drift = r.air > 0 ? 0 : -c * r.v * r.v * RULES.drift;
    r.x += (r.vx + drift) * dt;

    // 道のりを進める: 内がわほど短い(1 - c*x で割る)
    const ds = (r.v * dt) / Math.max(0.6, 1 - c * r.x);
    const before = r.s;
    r.s += ds;

    // ふち・島にこすると遅くなる(空中はこすらない)
    r.scrape = false;
    const hw = halfWidthAt(r.s) - RULES.bodyR;
    if (r.x > hw || r.x < -hw) {
      r.x = Math.max(-hw, Math.min(hw, r.x));
      r.vx = 0;
      if (r.air <= 0) r.scrape = true;
    }
    const isl = islandAt(r.s);
    if (isl && r.x > isl.x0 - RULES.bodyR && r.x < isl.x1 + RULES.bodyR) {
      // 近いがわへ押しもどす
      const mid = (isl.x0 + isl.x1) / 2;
      r.x = r.x < mid ? isl.x0 - RULES.bodyR : isl.x1 + RULES.bodyR;
      r.vx = 0;
      if (r.air <= 0) r.scrape = true;
    }
    if (r.scrape) r.v = Math.max(3.5, r.v - RULES.scrape * dt);

    // ジャンプ台
    if (r.air > 0) {
      r.air = Math.max(0, r.air - dt);
      if (r.air === 0) ev.push({ type: 'land', slot });
    } else if (!done) {
      for (const m of MUSHROOMS) {
        if (before < m.s && r.s >= m.s && Math.abs(r.x - m.x) < RULES.mushR) {
          r.air = RULES.jumpTime;
          r.v += RULES.jumpBoost;
          r.jumps++;
          ev.push({ type: 'jump', slot, s: m.s, x: m.x });
        }
      }
    }
    // どんぐり(子ごとに1つずつある。空中でも拾える)
    if (!done) {
      ACORNS.forEach((a, i) => {
        if (s.taken[slot].has(i)) return;
        if (Math.abs(r.s - a.s) < RULES.pickR && Math.abs(r.x - a.x) < RULES.pickR) {
          s.taken[slot].add(i);
          r.acorns++;
          r.boost = Math.min(RULES.boostMax, r.boost + RULES.boostPer);
          ev.push({ type: 'acorn', slot, i });
        }
      });
    }
    // ゴール
    if (!done && r.s >= LENGTH) {
      r.finish = s.t - RULES.readyTime;
      if (s.firstFinish === null) s.firstFinish = s.t;
      ev.push({ type: 'goal', slot, time: r.finish });
    }
  });

  // そりどうしがぶつかる: 横に押しあう。うしろの子が少し遅くなる
  const R = s.runners;
  for (let i = 0; i < R.length; i++) {
    for (let j = i + 1; j < R.length; j++) {
      const a = R[i], b = R[j];
      if (a.finish !== null || b.finish !== null || a.air > 0 || b.air > 0) continue;
      const ds = b.s - a.s, dx = b.x - a.x;
      if (Math.abs(ds) > 1.1 || Math.abs(dx) > RULES.bodyR * 2) continue;
      const push = (RULES.bodyR * 2 - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1);
      a.x -= push; b.x += push;
      const avx = a.vx; a.vx = b.vx; b.vx = avx;
      // うしろからぶつかったときだけ、うしろの子が少し遅くなる(横にならんで押しあうだけなら遅くならない)
      if (Math.abs(ds) > 0.35 && a.bumpCool <= 0 && b.bumpCool <= 0) {
        const back = ds >= 0 ? a : b;
        back.v *= 0.95;
        a.bumpCool = b.bumpCool = 0.6;
        ev.push({ type: 'bump', a: i, b: j });
      }
    }
  }

  // 押しあいで道の外・島に押し出されたら、もどす
  for (const r of R) keepOnCourse(r);

  if (s.phase === 'race' && (R.every((r) => r.finish !== null) || (s.firstFinish !== null && s.t >= s.firstFinish + RULES.afterFirst))) {
    s.phase = 'finished';
    s.winner = ranking(s)[0];
    ev.push({ type: 'finished', winner: s.winner });
  }
  return ev;
}

function keepOnCourse(r) {
  const hw = halfWidthAt(r.s) - RULES.bodyR;
  r.x = Math.max(-hw, Math.min(hw, r.x));
  const isl = islandAt(r.s);
  if (isl && r.x > isl.x0 - RULES.bodyR && r.x < isl.x1 + RULES.bodyR) {
    r.x = r.x < (isl.x0 + isl.x1) / 2 ? isl.x0 - RULES.bodyR : isl.x1 + RULES.bodyR;
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
