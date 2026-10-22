// 森の図書館の ぱらぱらブック のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 机の上に ひらいた 大きな 絵本。5人は 手前の ページ(床)の 上に いる。奥には ページが 立っていて、
// どんぐり・葉っぱ・星・花・キノコの 形の 穴が あいている。ページは 手前へ ぱたんと たおれてくる。
// たおれた とき、穴の ところに いれば たすかる。穴の 外に いたら ぺちゃんこで 脱落。
// 立っている ページの 穴は、たおれると 床の 同じ 場所に 来る(上の 穴ほど 手前に 来る)。床には その 影が うつる。
// めくれる 速さが だんだん 速くなる(しかけは それだけ)。最後まで 残った子の勝ち。
// 穴の 数: はじめの 3まいは 4つ、そのあとは 2〜4 の くじ。
// - 走る: スティック(どこでもスティック)。ぶつかると おしあう。本の 外へは 出られない。
//
// inputs[slot]: { x, z(スティックの 向き。長さ 0〜1) } か null。
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;

export const RULES = {
  readyTime: 3,
  timeLimit: 150,
  // 床(手前の ページ): x は -W/2〜W/2、z は 0(ページの とじめ)〜D(手前)
  W: 7.6,
  D: 6.6,
  edge: 0.35, // 本の ふちから これだけ 内がわまで 走れる
  // 穴
  holes: [2, 4], // 1まいの 穴の 数(くじ)
  firstPages: 3, // はじめの 3まいは いつも 4つ
  holeR: 1.0, // 穴の 大きさ(当たりの 半径)
  holeGap: 0.5, // 穴どうしの すきま
  safe: 0.18, // 体の 中心が 穴の ふちから これだけ 内がわなら たすかる
  // めくれる 速さ
  showFirst: 3.2, // ページが 立ってから たおれはじめるまで(はじめ)
  showMin: 0.45,
  showStep: 0.16, // 1まいごとに 短くなる
  flipFirst: 0.7, // たおれる 時間(はじめ)
  flipMin: 0.3,
  flipStep: 0.02,
  after: 0.35, // たおれた あと 次の ページが 立つまで
  // 走る
  speed: 3.4,
  accel: 18,
  bodyR: 0.36,
  bounce: 0.7,
};

export const SHAPES = ['acorn', 'leaf', 'star', 'flower', 'mushroom'];

export const showTime = (page) => Math.max(RULES.showMin, RULES.showFirst - RULES.showStep * page);
export const flipTime = (page) => Math.max(RULES.flipMin, RULES.flipFirst - RULES.flipStep * page);

export function startPos(slot, n) {
  const x = -RULES.W / 2 + 1.4 + ((RULES.W - 2.8) * slot) / Math.max(1, n - 1);
  return { x, z: RULES.D * 0.55 };
}

// ページの 穴を くじで つくる(重ならないように)
// このページの 穴の 数: はじめの 3まいは 4つ、そのあとは 2〜4 の くじ
export function holeCount(s, page) {
  if (page < RULES.firstPages) return RULES.holes[1];
  return RULES.holes[0] + Math.floor(nextRandom(s) * (RULES.holes[1] - RULES.holes[0] + 1));
}
function makeHoles(s, n) {
  let best = [];
  // うまく ならばなかったら、はじめから やりなおす(いちばん 多く ならんだ ものを つかう)
  for (let round = 0; round < 30 && best.length < n; round++) {
    const holes = placeHoles(s, n);
    if (holes.length > best.length) best = holes;
  }
  return best;
}
function placeHoles(s, n) {
  const holes = [];
  const m = RULES.holeR + 0.25;
  for (let tries = 0; holes.length < n && tries < 60; tries++) {
    const x = -RULES.W / 2 + m + nextRandom(s) * (RULES.W - m * 2);
    const z = m + nextRandom(s) * (RULES.D - m * 2);
    if (holes.some((h) => Math.hypot(h.x - x, h.z - z) < RULES.holeR * 2 + RULES.holeGap)) continue;
    holes.push({ x, z, r: RULES.holeR, shape: SHAPES[Math.floor(nextRandom(s) * SHAPES.length)], rot: (nextRandom(s) - 0.5) * 0.8 });
  }
  return holes;
}

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:ehon`),
    phase: 'ready', // ready → play → finished
    stage: 'show', // show(ページが 立っている)→ flip(たおれてくる)→ after → show …
    stageT: 0,
    page: 0, // いま 立っている ページの 番号
    holes: [],
    winner: null,
    out: [],
    runners: players.map((_, slot) => {
      const p = startPos(slot, players.length);
      return { x: p.x, z: p.z, vx: 0, vz: 0, face: Math.PI, alive: true, safe: 0 };
    }),
  };
  s.holes = makeHoles(s, holeCount(s, 0));
  s.stageT = showTime(0);
  return s;
}

export const playTime = (s) => Math.max(0, s.t - RULES.readyTime);
export const aliveSlots = (s) => s.runners.map((r, i) => (r.alive ? i : -1)).filter((i) => i >= 0);
// (x, z) は 穴の 中か(体の 中心で 見る)
export const inHole = (s, x, z) => s.holes.some((h) => Math.hypot(x - h.x, z - h.z) <= h.r - RULES.safe);
// いちばん 近い 穴の ふちまで(中なら マイナス)
export const holeDist = (s, x, z) => Math.min(...s.holes.map((h) => Math.hypot(x - h.x, z - h.z) - h.r));

export function step(s, inputs) {
  const ev = [];
  if (s.phase === 'finished') return ev;
  const dt = STEP;
  s.t += dt;
  if (s.phase === 'ready' && s.t >= RULES.readyTime) {
    s.phase = 'play';
    ev.push({ type: 'start' });
    ev.push({ type: 'page', page: s.page, holes: s.holes, time: s.stageT });
  }
  const play = s.phase === 'play';

  // ── 走る ──
  const lo = -RULES.W / 2 + RULES.edge, hi = RULES.W / 2 - RULES.edge;
  s.runners.forEach((r, slot) => {
    if (!r.alive) return;
    const inp = play ? inputs[slot] : null;
    let wx = 0, wz = 0;
    if (inp && inp.x != null) {
      const m = Math.min(1, Math.hypot(inp.x, inp.z));
      if (m > 0.12) {
        const d = Math.hypot(inp.x, inp.z);
        wx = (inp.x / d) * RULES.speed * m;
        wz = (inp.z / d) * RULES.speed * m;
        r.face = Math.atan2(inp.x, inp.z);
      }
    }
    const k = Math.min(1, (RULES.accel * dt) / RULES.speed);
    r.vx += (wx - r.vx) * k;
    r.vz += (wz - r.vz) * k;
    r.x = Math.max(lo, Math.min(hi, r.x + r.vx * dt));
    r.z = Math.max(RULES.edge, Math.min(RULES.D - RULES.edge, r.z + r.vz * dt));
  });
  // ぶつかる(おしあう)
  const R = s.runners;
  for (let i = 0; i < R.length; i++) {
    for (let j = i + 1; j < R.length; j++) {
      const a = R[i], b = R[j];
      if (!a.alive || !b.alive) continue;
      let dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      const minD = RULES.bodyR * 2;
      if (d >= minD) continue;
      if (d < 1e-6) { dx = 1; dz = 0; d = 1e-6; }
      const nx = dx / d, nz = dz / d, over = (minD - d) / 2;
      a.x -= nx * over; a.z -= nz * over;
      b.x += nx * over; b.z += nz * over;
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (rel > 0) {
        const imp = (rel * (1 + RULES.bounce)) / 2;
        a.vx -= imp * nx; a.vz -= imp * nz;
        b.vx += imp * nx; b.vz += imp * nz;
      }
    }
  }

  // ── ページ ──
  if (play) {
    s.stageT -= dt;
    if (s.stage === 'show' && s.stageT <= 0) {
      s.stage = 'flip';
      s.stageT = flipTime(s.page);
      ev.push({ type: 'flip', page: s.page, time: s.stageT });
    } else if (s.stage === 'flip' && s.stageT <= 0) {
      // ぱたん: 穴の 外の 子は ぺちゃんこ
      const squashed = [];
      s.runners.forEach((r, slot) => {
        if (!r.alive) return;
        if (inHole(s, r.x, r.z)) { r.safe++; return; }
        r.alive = false;
        squashed.push(slot);
      });
      // 同時なら、穴から 遠い子が 下
      squashed.sort((p, q) => holeDist(s, R[q].x, R[q].z) - holeDist(s, R[p].x, R[p].z) || q - p);
      s.out.push(...squashed);
      ev.push({ type: 'slam', page: s.page, squashed, holes: s.holes });
      for (const slot of squashed) ev.push({ type: 'squash', slot, x: R[slot].x, z: R[slot].z });
      s.stage = 'after';
      s.stageT = RULES.after;
      const alive = aliveSlots(s);
      if (alive.length <= 1 || playTime(s) >= RULES.timeLimit) {
        s.phase = 'finished';
        s.winner = ranking(s)[0];
        ev.push({ type: 'finished', winner: s.winner, timeUp: alive.length > 1 });
        return ev;
      }
    } else if (s.stage === 'after' && s.stageT <= 0) {
      s.page++;
      s.holes = makeHoles(s, holeCount(s, s.page));
      s.stage = 'show';
      s.stageT = showTime(s.page);
      ev.push({ type: 'page', page: s.page, holes: s.holes, time: s.stageT });
      if (s.page % 5 === 0) ev.push({ type: 'faster', page: s.page });
    }
  }
  return ev;
}

// 順位: のこっている子(穴の まん中に 近い順)、そのあとは 落ちたのが おそい順
export function ranking(s) {
  const alive = aliveSlots(s).sort((a, b) => holeDist(s, s.runners[a].x, s.runners[a].z) - holeDist(s, s.runners[b].x, s.runners[b].z) || a - b);
  return [...alive, ...[...s.out].reverse()];
}
