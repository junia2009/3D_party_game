// 森の谷まの かみひこうき のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 5人が それぞれ 紙ひこうきで、森の 谷まの おなじ コースを とぶ(ぶつかりあわない)。
// コースに ならんだ わっかを くぐると 点(ツタの わっか 1点・金の わっか 3点)。ゴールまで とんで、点の 多い 子の 勝ち。
// - あやつり方: スマホを かたむける(つかえない ときは スティック)。
//   左右 … よこへ まがる。むこうへ たおす … 下がって 速く なる。てまえへ おこす … 上がる けど おそく なる。
//   紙ひこうきは ふつう ゆっくり 下がって いく(てまえへ おこしても すこししか 上がらない)。
// - 上昇気流: 光る 風の 柱に はいると ふわっと 上がる。高い ところの 金の わっかへ とどく。
// - よこかぜ: ときどき よこから 風(すこし 前に 合図)。かたむけて こらえる。
// - じゃまもの: ゆれる 枝・鳥の むれ。ぶつかると くるくる まわって すこし あやつれず、おそく なる。
// - 地面(谷の 川)に つくと はねて、すこし あやつれない。
// 順位: 点 → 先に ゴールした 順(ゴールして いなければ 先へ すすんだ 順)。
//
// 座標: コースに そった s(前へ すすんだ きょり)、x(よこ。右が +)、y(高さ)。コースの まがり方は 見た目だけ。
// inputs[slot]: { x(-1..1 左右), y(-1..1 てまえへ おこす = +) } または null(まっすぐ)
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, randRange, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;

export const RULES = {
  readyTime: 3.0,
  timeLimit: 70, // これまでに ゴール できなくても おしまい
  length: 400, // コースの ながさ(m)
  halfW: 6.5, // よこの はば(半分)
  yMin: 0.6, // 地面(川)
  yMax: 15,
  startY: 7,
  // とび方
  speed: 8.5, // ふつうの 速さ
  speedDive: 3.2, // むこうへ たおすと これだけ 速く
  speedClimb: -2.6, // てまえへ おこすと これだけ おそく
  speedMin: 5,
  sink: 0.9, // なにも しないと 下がる 速さ
  climb: 1.6, // おこしきると 上がる 速さ(sink を ひいた あと)
  dive: 3.6, // たおしきると 下がる 速さ
  side: 5.5, // よこの 速さ(いっぱい かたむけて)
  steer: 5, // かたむけてから 向きが かわる はやさ
  // わっか
  ringR: 1.9,
  goldR: 1.35,
  ringEvery: [10, 13],
  // 上昇気流
  liftR: 2.4,
  lift: 4.6, // 上がる 速さ
  // よこかぜ
  windFirst: 10,
  windEvery: [11, 15],
  windTime: 5,
  windWarn: 1.5,
  wind: 3.6, // よこへ ながされる 速さ
  // じゃまもの
  stunTime: 1.1,
  stunSpeed: 0.45, // ぶつかったあと この ばい の 速さ
  branchHalfH: 0.55,
  birdR: 1.3,
  bumpTime: 0.5, // 地面に ついた あと
};

// コースを つくる(みんな おなじ)
function buildCourse(s) {
  const rings = [], lifts = [], branches = [], birds = [];
  let x = 0, y = RULES.startY, at = 22;
  let k = 0;
  while (at < RULES.length - 15) {
    k++;
    // 上昇気流と 高い 金の わっか(4こに 1回くらい)
    if (k % 4 === 0 && at < RULES.length - 40) {
      const lx = clamp(x + randRange(s, -2.5, 2.5), -RULES.halfW + 2, RULES.halfW - 2);
      lifts.push({ s: at, len: 14, x: lx });
      rings.push({ id: rings.length, s: at + 18, x: lx + randRange(s, -0.8, 0.8), y: randRange(s, 12, 13.5), gold: true });
      at += 18 + randRange(s, RULES.ringEvery[0], RULES.ringEvery[1]);
      x = lx;
      y = 9;
      continue;
    }
    x = clamp(x + randRange(s, -3.2, 3.2), -RULES.halfW + 1.5, RULES.halfW - 1.5);
    y = clamp(y + randRange(s, -2.5, 1.6), 2.2, 9.5);
    // ときどき 低い ところの 金の わっか(むずかしい ところ)
    const gold = nextRandom(s) < 0.12;
    rings.push({ id: rings.length, s: at, x, y: gold ? Math.min(y, 2.4) : y, gold });
    // じゃまもの: わっかと わっかの あいだ
    const mid = at + randRange(s, 4.5, 6.5);
    if (k > 2 && nextRandom(s) < 0.4) {
      if (nextRandom(s) < 0.5) {
        // ゆれる 枝: 片がわから のびる
        const from = nextRandom(s) < 0.5 ? -1 : 1;
        branches.push({ s: mid, from, len: randRange(s, 5, 8), y: randRange(s, 3, 9), amp: randRange(s, 0.8, 1.6), w: randRange(s, 1.2, 2), ph: randRange(s, 0, 6.28) });
      } else {
        birds.push({ s: mid, y: randRange(s, 3, 10), amp: randRange(s, 3, 5), w: randRange(s, 0.7, 1.2), ph: randRange(s, 0, 6.28) });
      }
    }
    at += randRange(s, RULES.ringEvery[0], RULES.ringEvery[1]);
  }
  return { rings, lifts, branches, birds };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 枝の 高さ・鳥の よこ位置(時間で うごく)
export const branchY = (br, t) => br.y + Math.sin(t * br.w + br.ph) * br.amp;
export const birdX = (bd, t) => Math.sin(t * bd.w + bd.ph) * bd.amp;
// 枝が かかっている よこの はんい
export const branchSpan = (br) => (br.from < 0 ? [-RULES.halfW - 1, -RULES.halfW + br.len] : [RULES.halfW - br.len, RULES.halfW + 1]);

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:hikouki`),
    phase: 'ready', // ready → play → finished
    wind: { x: 0, until: 0, next: RULES.windFirst, warn: 0, dir: 0 },
    winner: null,
  };
  Object.assign(s, buildCourse(s));
  s.planes = players.map((_, i) => ({
    s: 0, x: 0, y: RULES.startY, // みんな おなじ ところから(ぶつかりあわない)
    vx: 0, vy: 0, v: RULES.speed, roll: 0, pitch: 0,
    stun: 0, bump: 0, points: 0, rings: 0, golds: 0, finished: null, next: 0,
  }));
  return s;
}

export const playTime = (s) => Math.max(0, s.t - RULES.readyTime);
export const timeLeft = (s) => Math.max(0, RULES.timeLimit - playTime(s));
export const inLift = (s, p) => s.lifts.some((l) => p.s >= l.s && p.s <= l.s + l.len && Math.abs(p.x - l.x) < RULES.liftR);

export function step(s, inputs) {
  const ev = [];
  if (s.phase === 'finished') return ev;
  const dt = STEP;
  s.t += dt;
  if (s.phase === 'ready' && s.t >= RULES.readyTime) {
    s.phase = 'play';
    ev.push({ type: 'start' });
  }
  if (s.phase !== 'play') return ev;

  // ── よこかぜ ──
  const tp = playTime(s);
  const w = s.wind;
  if (!w.warn && tp >= w.next - RULES.windWarn) {
    w.dir = nextRandom(s) < 0.5 ? -1 : 1;
    w.warn = 1;
    ev.push({ type: 'windSoon', dir: w.dir });
  }
  if (w.warn && tp >= w.next) {
    w.x = w.dir * RULES.wind;
    w.until = tp + RULES.windTime;
    w.next = w.until + randRange(s, RULES.windEvery[0], RULES.windEvery[1]);
    w.warn = 0;
    ev.push({ type: 'wind', dir: w.dir, time: RULES.windTime });
  }
  if (w.x && tp >= w.until) { w.x = 0; ev.push({ type: 'windEnd' }); }

  s.planes.forEach((p, slot) => {
    if (p.finished !== null) { p.s += RULES.speed * dt; return; } // ゴールした あとも ゆっくり とびつづける(見た目)
    const inp = inputs[slot];
    const free = p.stun <= 0 && p.bump <= 0;
    const ix = free && inp ? clamp(inp.x || 0, -1, 1) : 0;
    const iy = free && inp ? clamp(inp.y || 0, -1, 1) : 0;
    p.stun = Math.max(0, p.stun - dt);
    p.bump = Math.max(0, p.bump - dt);
    // 向き(見た目にも つかう): かたむきに おくれて ついてくる
    const k = Math.min(1, RULES.steer * dt);
    p.roll += (ix - p.roll) * k;
    p.pitch += (iy - p.pitch) * k;
    // 速さ: たおすと 速く、おこすと おそく
    const target = clamp(RULES.speed + (p.pitch < 0 ? -p.pitch * RULES.speedDive : -p.pitch * -RULES.speedClimb), RULES.speedMin, 14);
    p.v += (target - p.v) * Math.min(1, 1.5 * dt);
    const v = p.v * (p.stun > 0 ? RULES.stunSpeed : 1);
    // 上下: ふつうは ゆっくり 下がる。おこすと 上がる、たおすと 下がる。上昇気流で ふわっと
    let vy = -RULES.sink + (p.pitch > 0 ? p.pitch * (RULES.climb + RULES.sink) : p.pitch * RULES.dive);
    const lifting = inLift(s, p);
    if (lifting) vy += RULES.lift;
    if (lifting && !p.lifting) ev.push({ type: 'lift', slot });
    p.lifting = lifting;
    p.vy += (vy - p.vy) * Math.min(1, 3 * dt);
    // よこ: かたむけた ほうへ + よこかぜ
    const vx = p.roll * RULES.side + w.x;
    p.vx += (vx - p.vx) * Math.min(1, 4 * dt);
    const ps = p.s, px = p.x, py = p.y;
    p.s += v * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // 谷の かべ・空
    if (Math.abs(p.x) > RULES.halfW) { p.x = Math.sign(p.x) * RULES.halfW; p.vx *= -0.3; }
    if (p.y > RULES.yMax) { p.y = RULES.yMax; p.vy = Math.min(0, p.vy); }
    // 川に ついた: はねて すこし あやつれない
    if (p.y < RULES.yMin) {
      p.y = RULES.yMin;
      p.vy = 3;
      p.bump = RULES.bumpTime;
      p.v = Math.max(RULES.speedMin, p.v * 0.7);
      ev.push({ type: 'splash', slot, s: p.s, x: p.x });
    }
    // わっか: その s を こえた ときに くぐったか
    while (p.next < s.rings.length && s.rings[p.next].s <= p.s) {
      const r = s.rings[p.next];
      const f = (r.s - ps) / Math.max(1e-6, p.s - ps);
      const cx = px + (p.x - px) * f, cy = py + (p.y - py) * f;
      const d = Math.hypot(cx - r.x, cy - r.y);
      if (d < (r.gold ? RULES.goldR : RULES.ringR)) {
        const pts = r.gold ? 3 : 1;
        p.points += pts;
        p.rings++;
        if (r.gold) p.golds++;
        ev.push({ type: 'ring', slot, id: r.id, gold: r.gold, pts, center: d < 0.5 });
      } else ev.push({ type: 'missRing', slot, id: r.id });
      p.next++;
    }
    // じゃまもの: その s を こえた ときに 当たったか
    if (p.stun <= 0) {
      for (const br of s.branches) {
        if (!(br.s > ps && br.s <= p.s)) continue;
        const [a, b] = branchSpan(br);
        if (p.x > a && p.x < b && Math.abs(p.y - branchY(br, s.t)) < RULES.branchHalfH + 0.35) {
          p.stun = RULES.stunTime;
          ev.push({ type: 'hit', slot, what: 'branch', s: br.s });
        }
      }
      for (const bd of s.birds) {
        if (!(bd.s > ps && bd.s <= p.s)) continue;
        if (Math.hypot(p.x - birdX(bd, s.t), p.y - bd.y) < RULES.birdR) {
          p.stun = RULES.stunTime;
          ev.push({ type: 'hit', slot, what: 'bird', s: bd.s });
        }
      }
    }
    if (p.s >= RULES.length) {
      p.finished = s.t;
      ev.push({ type: 'goal', slot, points: p.points, order: s.planes.filter((q) => q.finished !== null).length });
    }
  });

  if (s.planes.every((p) => p.finished !== null) || timeLeft(s) <= 0) {
    s.phase = 'finished';
    s.winner = ranking(s)[0];
    ev.push({ type: 'finished', winner: s.winner });
  }
  return ev;
}

// 順位: 点 → 先に ゴール → 先へ すすんだ → 席
export function ranking(s) {
  return s.planes.map((_, i) => i).sort((a, b) => {
    const A = s.planes[a], B = s.planes[b];
    return B.points - A.points || (A.finished ?? Infinity) - (B.finished ?? Infinity) || B.s - A.s || a - b;
  });
}
