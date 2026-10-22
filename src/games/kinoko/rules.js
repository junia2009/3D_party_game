// 森の湖の いろいろキノコ のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 湖に うかぶ 7色の 六角の キノコ(まん中に 1つ、まわりに 6つ)。ホーホー先生が 旗を あげると、
// その色の キノコだけ のこして、ほかは 湖に しずむ。しずむ までに 旗の 色へ 行けなかった子は 落ちて 脱落。
// しずんだ キノコは また 上がってきて、次の 旗。だんだん しずむ までの 時間が 短くなる。最後まで 残った子の勝ち。
// - 走る: スティック(どこでもスティック)。
// - ジャンプ: ボタン。空中で もう一度 おすと ヒップドロップ(まっすぐ 落ちて、まわりの子を はじきとばす)。
// - ふんづけ: 落ちてきて 相手の 頭に のると、相手は ぺしゃんこ(少し 動けない)。自分は ぽーんと はねる。
// - ぶつかると おしあう。キノコの 外(湖)に 出ても 落ちる。
//
// inputs[slot]: { x, z(スティックの 向き。長さ 0〜1), jump(ボタンを おしたか。おした 瞬間だけ true) } か null。
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;

export const RULES = {
  readyTime: 3,
  timeLimit: 120, // これをこえたら、旗の キノコの まん中に 近い順
  hexR: 2.4, // キノコの 六角の 大きさ(中心から かどまで)
  gap: 0.06, // キノコの あいだの すきま(この ぶん 小さく)
  // 旗の ながれ
  waitTime: [0.9, 1.7], // 旗が あがるまで
  moveFirst: 4.0, // 旗が あがってから しずむまで(はじめ)
  moveMin: 1.0, // いちばん 短い とき
  moveStep: 0.38, // 1回ごとに 短くなる
  sinkTime: 0.45, // しずむ
  holdTime: 1.1, // しずんだ まま
  riseTime: 0.8, // 上がってくる
  // 走る・とぶ
  speed: 4.2,
  accel: 16,
  airControl: 0.55,
  gravity: 22,
  jumpV: 7.0,
  dropV: -15, // ヒップドロップ
  dropPause: 0.12, // 空中で 一瞬 とまってから 落ちる
  dropR: 1.8, // ヒップドロップで はじく はんい
  dropKick: 6.0,
  stompBounce: 6.5,
  squash: 0.8, // ふんづけられて 動けない
  stun: 0.45, // ヒップドロップで はじかれて ふらふら
  bodyR: 0.4,
  bounce: 0.8,
};

export const COLORS = ['white', 'red', 'yellow', 'green', 'blue', 'purple', 'pink'];
export const COLOR_NAMES = { white: 'しろ', red: 'あか', yellow: 'きいろ', green: 'みどり', blue: 'あお', purple: 'むらさき', pink: 'ピンク' };

// キノコ: 0 が まん中、1〜6 が まわり(右から 左回り)。とがった かどが 上下(z)の 六角
export const HEXES = COLORS.map((color, i) => {
  if (i === 0) return { id: 0, color, x: 0, z: 0 };
  const a = ((i - 1) / 6) * Math.PI * 2;
  const d = RULES.hexR * Math.sqrt(3);
  return { id: i, color, x: Math.cos(a) * d, z: -Math.sin(a) * d };
});

// (x, z) が 六角 h の 上か(とがった かどが ±z)
export function inHex(h, x, z, shrink = RULES.gap) {
  const r = RULES.hexR - shrink;
  const dx = Math.abs(x - h.x), dz = Math.abs(z - h.z);
  const w = (r * Math.sqrt(3)) / 2; // よこの はば(半分)
  if (dx > w || dz > r) return false;
  return dz <= r - dx / Math.sqrt(3);
}
export const hexAt = (x, z) => HEXES.find((h) => inHex(h, x, z)) ?? null;

export function startPos(slot, n) {
  // まわりの キノコに 1人ずつ(5人なら 1〜5)。まん中は あけておく
  const h = HEXES[1 + Math.round((slot / n) * 6) % 6];
  return { x: h.x, z: h.z };
}

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:kinoko`),
    phase: 'ready', // ready → play → finished
    stage: 'wait', // wait(旗を まつ)→ signal(旗。しずむまで)→ sink → hold → rise → wait …
    stageT: 0, // いまの 段の のこり時間
    round: 0,
    flag: null, // いま あがっている 旗の 色(HEXES の id)
    last: null,
    sink: HEXES.map(() => 0), // 0 うかんでいる 〜 1 しずんだ
    winner: null,
    out: [],
    runners: players.map((_, slot) => {
      const p = startPos(slot, players.length);
      return {
        x: p.x, z: p.z, y: 0, vx: 0, vz: 0, vy: 0, face: Math.atan2(-p.x, -p.z), alive: true,
        air: false, drop: 0, dropping: false, squash: 0, stun: 0, jumps: 0, stomps: 0, drops: 0, survived: 0,
      };
    }),
  };
  s.stageT = waitTime(s);
  return s;
}

const waitTime = (s) => RULES.waitTime[0] + nextRandom(s) * (RULES.waitTime[1] - RULES.waitTime[0]);
export const moveTime = (round) => Math.max(RULES.moveMin, RULES.moveFirst - RULES.moveStep * round);
export const playTime = (s) => Math.max(0, s.t - RULES.readyTime);
export const aliveSlots = (s) => s.runners.map((r, i) => (r.alive ? i : -1)).filter((i) => i >= 0);
// 足もとに 立てる キノコが あるか(しずみかけは 立てない)
// (となりの キノコとの すきまは ふみこえられるように、少し 大きめに 見る)
export const solidAt = (s, x, z) => HEXES.some((h) => s.sink[h.id] < 0.5 && inHex(h, x, z, -0.1));

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

  // ── 旗と キノコ ──
  if (play) {
    s.stageT -= dt;
    if (s.stage === 'wait' && s.stageT <= 0) {
      let c;
      do c = Math.floor(nextRandom(s) * HEXES.length); while (c === s.last);
      s.flag = c;
      s.last = c;
      s.stage = 'signal';
      s.stageT = moveTime(s.round);
      ev.push({ type: 'flag', id: c, color: HEXES[c].color, time: s.stageT, round: s.round });
    } else if (s.stage === 'signal' && s.stageT <= 0) {
      s.stage = 'sink';
      s.stageT = RULES.sinkTime;
      ev.push({ type: 'sink', keep: s.flag });
    } else if (s.stage === 'sink' && s.stageT <= 0) {
      s.stage = 'hold';
      s.stageT = RULES.holdTime;
      for (const r of s.runners) if (r.alive) r.survived++;
    } else if (s.stage === 'hold' && s.stageT <= 0) {
      s.stage = 'rise';
      s.stageT = RULES.riseTime;
      ev.push({ type: 'rise' });
    } else if (s.stage === 'rise' && s.stageT <= 0) {
      s.stage = 'wait';
      s.stageT = waitTime(s);
      s.flag = null;
      s.round++;
    }
    HEXES.forEach((h, i) => {
      const down = (s.stage === 'sink' || s.stage === 'hold') && i !== s.flag;
      const up = s.stage === 'rise' || s.stage === 'wait' || s.stage === 'signal';
      if (down) s.sink[i] = Math.min(1, s.sink[i] + dt / RULES.sinkTime);
      else if (up) s.sink[i] = Math.max(0, s.sink[i] - dt / RULES.riseTime);
    });
  }

  // ── 走る・とぶ ──
  s.runners.forEach((r, slot) => {
    if (!r.alive) return;
    const inp = play ? inputs[slot] : null;
    r.squash = Math.max(0, r.squash - dt);
    r.stun = Math.max(0, r.stun - dt);
    const can = play && r.squash <= 0 && r.stun <= 0;
    // ジャンプ / ヒップドロップ
    if (can && inp?.jump) {
      if (!r.air) {
        r.air = true;
        r.vy = RULES.jumpV;
        r.jumps++;
        ev.push({ type: 'jump', slot });
      } else if (!r.dropping && r.y > 0.4) {
        r.dropping = true;
        r.drop = RULES.dropPause;
        r.vx = r.vz = 0;
        r.drops++;
        ev.push({ type: 'drop', slot });
      }
    }
    // 走る
    let wx = 0, wz = 0;
    if (can && inp && inp.x != null && !r.dropping) {
      const m = Math.min(1, Math.hypot(inp.x, inp.z));
      if (m > 0.12) {
        wx = (inp.x / Math.hypot(inp.x, inp.z)) * RULES.speed * m;
        wz = (inp.z / Math.hypot(inp.x, inp.z)) * RULES.speed * m;
        r.face = Math.atan2(inp.x, inp.z);
      }
    }
    if (!r.dropping) {
      const k = Math.min(1, RULES.accel * (r.air ? RULES.airControl : 1) * dt / Math.max(0.01, RULES.speed));
      r.vx += (wx - r.vx) * k;
      r.vz += (wz - r.vz) * k;
    }
    // 上下
    if (r.air) {
      if (r.dropping && r.drop > 0) { r.drop -= dt; r.vy = 0; }
      else if (r.dropping) r.vy = RULES.dropV;
      else r.vy -= RULES.gravity * dt;
      r.y += r.vy * dt;
    }
    r.x += r.vx * dt;
    r.z += r.vz * dt;
    // 着地(キノコの 上なら)
    if (r.air && r.y <= 0) {
      if (solidAt(s, r.x, r.z)) {
        r.y = 0;
        r.vy = 0;
        r.air = false;
        if (r.dropping) {
          r.dropping = false;
          ev.push({ type: 'slam', slot, x: r.x, z: r.z });
          // まわりの子を はじく
          s.runners.forEach((o, j) => {
            if (j === slot || !o.alive || o.air) return;
            const dx = o.x - r.x, dz = o.z - r.z, d = Math.hypot(dx, dz);
            if (d > RULES.dropR || d < 1e-6) return;
            const k = RULES.dropKick * (1 - d / RULES.dropR * 0.5);
            o.vx += (dx / d) * k;
            o.vz += (dz / d) * k;
            o.stun = Math.max(o.stun, RULES.stun);
            ev.push({ type: 'knock', slot: j, by: slot });
          });
        } else ev.push({ type: 'land', slot });
      }
    }
  });

  // ── ふんづけ と ぶつかる ──
  const R = s.runners;
  for (let i = 0; i < R.length; i++) {
    for (let j = 0; j < R.length; j++) {
      if (i === j) continue;
      const a = R[i], b = R[j];
      if (!a.alive || !b.alive) continue;
      // a が 上から b に のった
      if (a.air && a.vy < 0 && a.y > 0.5 && a.y < 1.3 && b.y < 0.3 && b.squash <= 0 && Math.hypot(a.x - b.x, a.z - b.z) < RULES.bodyR * 1.6) {
        a.vy = RULES.stompBounce;
        a.y = 1.3;
        a.dropping = false;
        b.squash = RULES.squash;
        b.vx = b.vz = 0;
        a.stomps++;
        ev.push({ type: 'stomp', slot: i, target: j });
      }
    }
  }
  for (let i = 0; i < R.length; i++) {
    for (let j = i + 1; j < R.length; j++) {
      const a = R[i], b = R[j];
      if (!a.alive || !b.alive || Math.abs(a.y - b.y) > 0.6) continue;
      let dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      const minD = RULES.bodyR * 2;
      if (d >= minD) continue;
      if (d < 1e-6) { dx = 1; dz = 0; d = 1e-6; }
      const nx = dx / d, nz = dz / d;
      const over = (minD - d) / 2;
      a.x -= nx * over; a.z -= nz * over;
      b.x += nx * over; b.z += nz * over;
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (rel <= 0) continue;
      const imp = (RULES.bounce * rel) / 2 + rel / 2;
      a.vx -= imp * nx; a.vz -= imp * nz;
      b.vx += imp * nx; b.vz += imp * nz;
      if (play && rel > 2) ev.push({ type: 'bump', a: i, b: j, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, force: rel });
    }
  }

  // ── 落ちる ──
  if (play) {
    const fell = [];
    s.runners.forEach((r, slot) => {
      if (!r.alive || r.air) return;
      if (solidAt(s, r.x, r.z)) return;
      r.alive = false;
      fell.push(slot);
      ev.push({ type: 'fall', slot, x: r.x, z: r.z, sunk: !!hexAt(r.x, r.z) });
    });
    // 同時に 落ちたら、旗の キノコから 遠い子が 下
    const keep = HEXES[s.flag ?? 0];
    fell.sort((p, q) => Math.hypot(s.runners[q].x - keep.x, s.runners[q].z - keep.z) - Math.hypot(s.runners[p].x - keep.x, s.runners[p].z - keep.z) || q - p);
    s.out.push(...fell);
    const alive = aliveSlots(s);
    if (alive.length <= 1 || playTime(s) >= RULES.timeLimit) {
      s.phase = 'finished';
      s.winner = ranking(s)[0];
      ev.push({ type: 'finished', winner: s.winner, timeUp: alive.length > 1 });
    }
  }
  return ev;
}

// 順位: のこっている子(旗の キノコ・まん中に 近い順)、そのあとは 落ちたのが おそい順
export function ranking(s) {
  const keep = HEXES[s.flag ?? 0];
  const alive = aliveSlots(s).sort((a, b) => Math.hypot(s.runners[a].x - keep.x, s.runners[a].z - keep.z) - Math.hypot(s.runners[b].x - keep.x, s.runners[b].z - keep.z) || a - b);
  return [...alive, ...[...s.out].reverse()];
}
