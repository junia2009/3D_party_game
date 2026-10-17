// お祭りの 大なわとび のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// お祭りの夜の広場。森の なかま2人が 大なわを 回し、5人が 横に ならんで いっせいに とぶ。
// なわが 足もとを 通る しゅんかんに、足が なわより 上に あれば セーフ。ひっかかったら 脱落。
// 最後の1人が 勝ち(勝ちぬき)。
// - とぶ: おしたら ジャンプ。holdTime 秒 おしつづけると、空中で もう1回 ぐーんと 高く(長おしで 大ジャンプ)。
//   大ジャンプは 高いが 空にいる時間も 長い(速い なわでは つぎに まにあわない)。
// - 大なみ: ときどき なわが 高い ところを 通る。大ジャンプでないと こえられない。
//   なわが 上を 通るときに わかる(回す2人が「大なみ!」)。
// - だんだん速く: 回すたびに 少しずつ 速くなる。ときどき 1回だけ 急に ゆっくり(ふいうち)。
// - じゃまのカエル: ときどき カエルが 列に まざって、くずれた リズムで とぶ(まどわされる)。
// - のこっている子が みんな いっしょに ひっかかったら、だれも 脱落しない(もう1回)。
//
// なわの 角度 theta: 0 が 足もと、π が 頭の上。theta が 2π の倍数を こえる しゅんかんが「通る」。
// inputs[slot]: いま おしているか(true / false)。おした しゅんかんに とぶ。
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, randRange, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;
export const TIMES_OF_DAY = ['night'];

export const RULES = {
  readyTime: 3.0, // 「よーい」(なわは 頭の上で 止まっている)
  period: 1.4, // さいしょの 1回の 時間(秒)
  speedUp: 0.972, // 1回ごとに これを かける
  minPeriod: 0.56,
  slowFrom: 8, // この回から ふいうちの ゆっくり
  slowChance: 0.1,
  slowFactor: 1.7,
  highFrom: 4, // この回から 大なみ
  highChance: 0.18,
  afterHigh: 1.12, // 大なみの つぎの 1回は 少し ゆっくり
  clearLow: 0.1, // なわが 通るとき、足が これより 上なら セーフ
  clearHigh: 0.38,
  jumpV: 4.2,
  gravity: 32,
  holdTime: 0.12, // これだけ おしつづけたら(ふつうの タップより 長く)、空中で もう1回 ぐーんと
  boostV: 4.6,
  recover: 0.1, // 着地のあと とべない 時間
  frogEvery: [7, 12], // カエルが 来る 間かく
  frogStay: 4, // カエルが いる 回数
  maxRevs: 200,
  allOutLimit: 3, // みんな いっしょに ひっかかるのが これだけ つづいたら、ふつうに 脱落させる
};

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:nawa`),
    phase: 'ready', // ready → play → finished
    rope: { theta: Math.PI, period: RULES.period, kind: 'low', slow: false, n: 0 }, // n: 何回 通ったか
    alive: players.map(() => true),
    out: [], // 脱落した順(席の番号)。同じ回なら、より悪いほうが先
    allOut: 0,
    winner: null,
    frog: null, // { gap(0〜人数: 何番目の子の ひだり), until(この回まで) }
    nextFrog: 0,
    runners: players.map(() => ({ y: 0, vy: 0, air: false, held: false, holdT: 0, recover: 0, jumps: 0, bigs: 0, clears: 0 })),
  };
  s.timeOfDay = TIMES_OF_DAY[0];
  s.nextFrog = RULES.readyTime + randRange(s, RULES.frogEvery[0], RULES.frogEvery[1]);
  return s;
}

export const aliveSlots = (s) => s.alive.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
export const clearance = (kind) => (kind === 'high' ? RULES.clearHigh : RULES.clearLow);
// つぎに なわが 足もとを 通るまでの 秒
export function timeToPass(s) {
  const r = s.rope;
  const left = (Math.floor(r.theta / (Math.PI * 2)) + 1) * Math.PI * 2 - r.theta;
  return (left / (Math.PI * 2)) * r.period;
}

// なわが 頭の上を 通った: つぎの 1回の 速さと 高さを 決める
function onTop(s, ev) {
  const r = s.rope;
  const wasHigh = r.kind === 'high';
  let period = Math.max(RULES.minPeriod, RULES.period * RULES.speedUp ** r.n);
  if (wasHigh) period *= RULES.afterHigh;
  r.slow = r.n >= RULES.slowFrom && !r.slow && nextRandom(s) < RULES.slowChance;
  if (r.slow) period *= RULES.slowFactor;
  r.kind = r.n >= RULES.highFrom && !wasHigh && !r.slow && nextRandom(s) < RULES.highChance ? 'high' : 'low';
  r.period = period;
  ev.push({ type: 'top', kind: r.kind, slow: r.slow, period });
}

// なわが 足もとを 通った: ひっかかった子を 脱落
function onPass(s, ev) {
  const r = s.rope;
  r.n++;
  const need = clearance(r.kind);
  const alive = aliveSlots(s);
  const caught = alive.filter((i) => s.runners[i].y < need);
  for (const i of alive) if (!caught.includes(i)) s.runners[i].clears++;
  const all = caught.length === alive.length && alive.length > 1;
  if (all && s.allOut < RULES.allOutLimit) {
    s.allOut++;
    ev.push({ type: 'pass', kind: r.kind, n: r.n, caught, redo: true });
    return;
  }
  s.allOut = 0;
  // 同じ回なら、より 低かった子が 先に 脱落(順位が 下)
  caught.sort((a, b) => s.runners[a].y - s.runners[b].y || b - a);
  // みんな ひっかかったときは、いちばん 高かった子だけ のこす
  if (caught.length === alive.length) caught.pop();
  for (const i of caught) { s.alive[i] = false; s.out.push(i); }
  ev.push({ type: 'pass', kind: r.kind, n: r.n, caught, redo: false });
  if (aliveSlots(s).length <= 1 || r.n >= RULES.maxRevs) {
    s.phase = 'finished';
    s.winner = ranking(s)[0];
    ev.push({ type: 'finished', winner: s.winner });
  }
}

function moveRunner(s, u, held, dt, ev, slot) {
  const press = held && !u.held;
  u.held = held;
  u.recover = Math.max(0, u.recover - dt);
  if (press && !u.air && u.recover <= 0) {
    u.air = true;
    u.vy = RULES.jumpV;
    u.holdT = 0;
    u.jumps++;
    ev.push({ type: 'jump', who: slot });
  }
  if (!u.air) return;
  if (u.holdT >= 0) {
    if (!held) u.holdT = -1; // 1度 はなしたら もう 高くならない
    else if ((u.holdT += dt) >= RULES.holdTime) {
      u.holdT = -1;
      u.vy = RULES.boostV;
      u.bigs++;
      ev.push({ type: 'big', who: slot });
    }
  }
  u.vy -= RULES.gravity * dt;
  u.y += u.vy * dt;
  if (u.y <= 0) {
    u.y = 0;
    u.vy = 0;
    u.air = false;
    u.recover = RULES.recover;
    ev.push({ type: 'land', who: slot });
  }
}

export function step(s, inputs) {
  const ev = [];
  if (s.phase === 'finished') return ev;
  const dt = STEP;
  s.t += dt;
  if (s.phase === 'ready') {
    if (s.t >= RULES.readyTime) {
      s.phase = 'play';
      ev.push({ type: 'start' });
      onTop(s, ev);
    }
    return ev;
  }
  for (const i of aliveSlots(s)) moveRunner(s, s.runners[i], !!inputs[i], dt, ev, i);
  // カエル
  if (!s.frog && s.t >= s.nextFrog && s.alive.length > 1) {
    s.frog = { gap: Math.floor(nextRandom(s) * (s.alive.length + 1)), until: s.rope.n + RULES.frogStay };
    ev.push({ type: 'frog', gap: s.frog.gap });
  }
  // なわが 回る
  const r = s.rope;
  const before = r.theta;
  r.theta += (Math.PI * 2 * dt) / r.period;
  const TAU = Math.PI * 2;
  if (Math.floor(r.theta / TAU) > Math.floor(before / TAU)) {
    onPass(s, ev);
    if (s.frog && r.n >= s.frog.until) {
      s.frog = null;
      s.nextFrog = s.t + randRange(s, RULES.frogEvery[0], RULES.frogEvery[1]);
      ev.push({ type: 'frogLeave' });
    }
  }
  if (s.phase === 'play' && Math.floor((r.theta + Math.PI) / TAU) > Math.floor((before + Math.PI) / TAU)) onTop(s, ev);
  return ev;
}

export function ranking(s) {
  const alive = aliveSlots(s).sort((a, b) => s.runners[b].y - s.runners[a].y || a - b);
  return [...alive, ...[...s.out].reverse()];
}

// カエルが となりに いるか(CPU が まどわされる)
export function frogNear(s, slot) {
  return !!s.frog && (s.frog.gap === slot || s.frog.gap === slot + 1);
}
