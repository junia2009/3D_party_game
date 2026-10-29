// 森の 倒れ木の どんぐりボウリング の ルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 倒れ木を わって つくった レーンが 5本 ならんで いて、5人が いっせいに 投げる(まち時間なし)。
// - 3フレーム。1フレームに 2回まで 投げる(1回目で ぜんぶ たおしたら ストライク、2回目は なし)。
// - 投げる: 立つ 場所(x)・向き(angle)・はやさ(speed)・ひねり(spin)。立つ 場所で じゃまものを よけられる。
//   ひねると ころがる うちに だんだん まがる(カーブ)。
// - ピン(まつぼっくり)は 10本。たおれた ピンも すべって ほかの ピンを たおす。
// - 金の ピン: フレームごとに 1本だけ。たおすと +3。
// - じゃまもの: レーンに 小石や こぶ。あたると どんぐりが はねて 向きが かわる。
// - 点: たおした ピン 1本 1点、金の ピン +3、ストライク +5、スペア(2回で ぜんぶ)+3。
// 順位: 点 → ストライクの 数 → スペアの 数 → くじ(はじめに きめる。席で きまらない ように)。
//
// 5本の レーンは おなじ ならび(金の ピンと じゃまものの 場所も おなじ)。うでまえだけで きそう。
//
// inputs[slot]: { x(立つ 場所。-stance〜stance), angle(ラジアン。0 = まっすぐ、+ = 右), speed(0〜1), spin(-1〜1。+ = 右へ まがる) } または null
//   投げて いい ときに 1回だけ うけとる。
// 座標(レーンごと): x は よこ(まんなか 0、右 +)、y は 投げる 線から おくへ。
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, randRange, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;
const SUB = 4; // はやい どんぐりが ピンを すりぬけない ように こまかく

export const RULES = {
  readyTime: 2.6,
  frames: 3,
  aimTime: 7, // この 秒で 投げなければ、そっと まっすぐ 投げる
  rollMax: 6, // 投げてから この 秒で うちきり
  settle: 0.8, // ぜんぶ とまって この 秒 たったら おわり
  resultTime: 1.4, // 1投 ごとの けっか 見せ
  frameTime: 1.6, // フレームの おわりの けっか 見せ
  showTime: 2.6,
  laneW: 1.06, // レーンの はば(この そとは みぞ)
  laneL: 10, // 投げる 線から いちばん おくの ピンの うしろまで
  headPin: 8.2, // 先頭の ピンの 場所
  pinGap: 0.27, // ピンの あいだ
  pinR: 0.07,
  ballR: 0.12,
  vmin: 3.2,
  vmax: 8.5,
  maxAngle: 0.07, // 投げる 向きの はば
  stance: 0.36, // 立つ 場所の はば(まんなかから)
  hook: 0.3, // ひねりの まがる 強さ
  rollFric: 0.18, // どんぐりの ころがり まさつ(はやさに かける)
  pinFric: 2.4, // たおれた ピンの すべり まさつ
  ballMass: 4,
  pinMass: 1,
  bounce: 0.55,
  knock: 0.55, // ピンが この はやさで おされたら たおれる
  gold: 3,
  strike: 5,
  spare: 3,
  obstacles: 2, // フレームごとの じゃまもの
  obstacleR: [0.05, 0.08],
  nudge: 0.45, // じゃまものに あたった ときの よこへの はねかた(はやさの 上限)
};

// ピンの ならび(先頭から 4れつ)
export function pinSpots() {
  const out = [];
  const dy = RULES.pinGap * Math.sqrt(3) / 2;
  for (let row = 0; row < 4; row++) {
    for (let k = 0; k <= row; k++) out.push([(k - row / 2) * RULES.pinGap, RULES.headPin + row * dy]);
  }
  return out;
}

function newLane() {
  return { ball: null, pins: [], thrown: false, done: false, down1: 0, score: 0, gold: false, log: [] };
}

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:bowl`),
    phase: 'ready', // ready → aim → roll → result →(aim …)→ frameEnd →(aim …)→ show → finished
    phaseT: RULES.readyTime,
    frame: 0,
    throwNo: 0, // 0 = 1回目、1 = 2回目
    goldPin: 0,
    obstacles: [],
    winner: null,
  };
  s.players = players.map(() => ({ score: 0, strikes: 0, spares: 0, frames: [], lot: nextRandom(s) }));
  s.lanes = players.map(() => newLane());
  setupFrame(s);
  return s;
}

// フレームの はじめ: ピンを ならべて、金の ピンと じゃまものを きめる
function setupFrame(s) {
  s.goldPin = Math.floor(nextRandom(s) * 10);
  s.obstacles = [];
  for (let k = 0; k < RULES.obstacles; k++) {
    // 投げる 線と ピンの あいだ。まんなか ふきんに おいて、よけるか 利用するか えらばせる
    const r = randRange(s, ...RULES.obstacleR);
    const y = randRange(s, 2.6 + k * 2.4, 4.2 + k * 2.4);
    const x = randRange(s, -RULES.laneW / 2 + 0.18, RULES.laneW / 2 - 0.18);
    s.obstacles.push({ x, y, r, kind: nextRandom(s) < 0.5 ? 'stone' : 'knot' });
  }
  for (const lane of s.lanes) {
    lane.pins = pinSpots().map(([x, y], i) => ({ i, x, y, vx: 0, vy: 0, down: false, gold: i === s.goldPin }));
    lane.down1 = 0;
    lane.gold = false;
  }
}

const standing = (lane) => lane.pins.filter((p) => !p.down).length;

// 投げる。はやさ・向き・ひねりを 0〜1 / ラジアン / -1〜1 に まるめる
export function throwBall(s, slot, inp) {
  const lane = s.lanes[slot];
  const angle = Math.max(-RULES.maxAngle, Math.min(RULES.maxAngle, inp.angle || 0));
  const k = Math.max(0, Math.min(1, inp.speed ?? 0.6));
  const v = RULES.vmin + (RULES.vmax - RULES.vmin) * k;
  lane.ball = { x: Math.max(-RULES.stance, Math.min(RULES.stance, inp.x ?? 0)), y: 0, vx: Math.sin(angle) * v, vy: Math.cos(angle) * v, spin: Math.max(-1, Math.min(1, inp.spin || 0)), gutter: false, t: 0, still: 0, hitObstacle: false };
  lane.thrown = true;
}

// 1レーンを すすめる(CPU の よみでも つかう)
export function stepLane(s, lane, dt, ev = null, slot = 0) {
  const b = lane.ball;
  if (!b || lane.done) return;
  const h = dt / SUB;
  for (let sub = 0; sub < SUB; sub++) {
    b.t += h;
    // どんぐり
    if (b.y < RULES.laneL + 0.5) {
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0.01 && !b.gutter) {
        // ひねり: すすむ 向きに たいして よこへ(はやさが おちるほど よく まがる)
        const turn = (b.spin * RULES.hook * h) / Math.max(1.5, sp * 0.55);
        const a = Math.atan2(b.vx, b.vy) + turn;
        b.vx = Math.sin(a) * sp;
        b.vy = Math.cos(a) * sp;
      }
      const f = 1 - RULES.rollFric * h;
      b.vx *= f; b.vy *= f;
      b.x += b.vx * h;
      b.y += b.vy * h;
      // みぞ: まんなかが レーンの そとへ 出たら おちる(あとは まっすぐ おくへ)
      if (!b.gutter && b.y < RULES.headPin - 0.2 && Math.abs(b.x) > RULES.laneW / 2) {
        b.gutter = true;
        b.x = Math.sign(b.x) * (RULES.laneW / 2 + RULES.ballR);
        b.vx = 0;
        b.vy = Math.max(b.vy, 2);
        if (ev) ev.push({ type: 'gutter', slot });
      }
      // じゃまもの
      if (!b.gutter) {
        for (const o of s.obstacles) {
          const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy), min = o.r + RULES.ballR;
          if (d >= min || d < 1e-6) continue;
          const nx = dx / d, ny = dy / d;
          b.x = o.x + nx * min; b.y = o.y + ny * min;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            // まるい ものに あたって よこへ それる(すすむ 力は のこす。みぞへ とばしすぎない)
            const sp = Math.hypot(b.vx, b.vy);
            b.vx = Math.max(-RULES.nudge, Math.min(RULES.nudge, b.vx - 1.3 * vn * nx));
            b.vy = Math.sqrt(Math.max(0.5, sp * sp * 0.92 - b.vx * b.vx));
            if (ev && !b.hitObstacle) ev.push({ type: 'bump', slot, kind: o.kind });
            b.hitObstacle = true;
          }
        }
      }
    }
    // ピンどうし・どんぐりと ピン
    const bodies = lane.pins;
    if (!b.gutter) for (const p of bodies) collide(b, RULES.ballR, RULES.ballMass, p, ev, slot, lane);
    for (let i = 0; i < bodies.length; i++) {
      const p = bodies[i];
      if (!p.down) continue; // たおれて うごく ピンだけが ほかを おす
      for (let j = 0; j < bodies.length; j++) if (j !== i) collide(p, RULES.pinR, RULES.pinMass, bodies[j], ev, slot, lane);
    }
    for (const p of bodies) {
      if (!p.down) continue;
      const f = Math.max(0, 1 - RULES.pinFric * h);
      p.vx *= f; p.vy *= f;
      p.x += p.vx * h; p.y += p.vy * h;
    }
  }
  // おわり: どんぐりが おくへ 行って、ピンが ぜんぶ とまった
  const moving = lane.pins.some((p) => p.down && Math.hypot(p.vx, p.vy) > 0.05);
  const ballGone = b.y > RULES.laneL + 0.5 || Math.hypot(b.vx, b.vy) < 0.15;
  if (ballGone && !moving) b.still += dt; else b.still = 0;
  if (b.still > RULES.settle || b.t > RULES.rollMax) lane.done = true;
}

function collide(a, ra, ma, p, ev, slot, lane) {
  const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy), min = ra + RULES.pinR;
  if (d >= min || d < 1e-6) return;
  const nx = dx / d, ny = dy / d;
  const mp = RULES.pinMass;
  // めりこみを もどす(立って いる ピンは うごかない ことに して、ぶつけた ほうを もどす)
  const over = min - d;
  if (p.down) { a.x -= nx * over * mp / (ma + mp); a.y -= ny * over * mp / (ma + mp); p.x += nx * over * ma / (ma + mp); p.y += ny * over * ma / (ma + mp); } else { a.x -= nx * over * 0.5; a.y -= ny * over * 0.5; p.x += nx * over * 0.5; p.y += ny * over * 0.5; }
  const rel = (a.vx - p.vx) * nx + (a.vy - p.vy) * ny;
  if (rel <= 0) return;
  const j = ((1 + RULES.bounce) * rel) / (1 / ma + 1 / mp);
  a.vx -= (j / ma) * nx; a.vy -= (j / ma) * ny;
  p.vx += (j / mp) * nx; p.vy += (j / mp) * ny;
  if (!p.down && Math.hypot(p.vx, p.vy) > RULES.knock) {
    p.down = true;
    if (ev) ev.push({ type: 'pin', slot, i: p.i, gold: p.gold, x: p.x, y: p.y, speed: Math.hypot(p.vx, p.vy) });
  } else if (!p.down) { p.vx = 0; p.vy = 0; }
}

// 1投の けっかを 点に する
function scoreThrow(s, slot, ev) {
  const lane = s.lanes[slot];
  const pl = s.players[slot];
  const downNow = 10 - standing(lane);
  const knocked = downNow - lane.down1;
  let pts = knocked;
  const gold = lane.pins[s.goldPin].down && !lane.gold;
  if (gold) { lane.gold = true; pts += RULES.gold; }
  let mark = null;
  if (s.throwNo === 0 && downNow === 10) { mark = 'strike'; pts += RULES.strike; pl.strikes++; }
  else if (s.throwNo === 1 && downNow === 10 && lane.down1 < 10) { mark = 'spare'; pts += RULES.spare; pl.spares++; }
  lane.down1 = downNow;
  pl.score += pts;
  lane.log.push({ frame: s.frame, throwNo: s.throwNo, knocked, pts, mark, gold });
  ev.push({ type: 'scored', slot, knocked, pts, mark, total: pl.score, gold });
}

export function step(s, inputs) {
  const ev = [];
  const dt = STEP;
  s.t += dt;
  s.phaseT -= dt;
  switch (s.phase) {
    case 'ready':
      if (s.phaseT <= 0) startAim(s, ev);
      break;
    case 'aim':
    case 'roll': {
      // 投げる(aim の あいだ。roll に なっても まだの 子は 投げられる)
      s.lanes.forEach((lane, slot) => {
        if (!needsThrowAny(s, slot)) return;
        const inp = inputs[slot];
        if (inp && (inp.speed !== undefined || inp.angle !== undefined)) { throwBall(s, slot, inp); ev.push({ type: 'throw', slot }); }
        else if (s.aimLeft <= 0) { throwBall(s, slot, { angle: 0, speed: 0.35, spin: 0 }); ev.push({ type: 'throw', slot, auto: true }); }
      });
      s.aimLeft -= dt;
      s.lanes.forEach((lane, slot) => {
        if (!lane.thrown || lane.done) return;
        stepLane(s, lane, dt, ev, slot);
        if (lane.done) { scoreThrow(s, slot, ev); ev.push({ type: 'laneDone', slot }); }
      });
      if (s.phase === 'aim' && s.lanes.some((l) => l.thrown)) s.phase = 'roll';
      if (s.lanes.every((l, slot) => l.done || skip(s, slot))) {
        s.phase = 'result';
        s.phaseT = RULES.resultTime;
        ev.push({ type: 'result', frame: s.frame, throwNo: s.throwNo });
      }
      break;
    }
    case 'result':
      if (s.phaseT <= 0) {
        const again = s.throwNo === 0 && s.lanes.some((l) => l.down1 < 10);
        if (again) { s.throwNo = 1; startAim(s, ev); break; }
        // フレームの おわり
        s.players.forEach((pl, slot) => pl.frames.push(s.lanes[slot].log.filter((x) => x.frame === s.frame).reduce((a, x) => a + x.pts, 0)));
        s.phase = 'frameEnd';
        s.phaseT = RULES.frameTime;
        ev.push({ type: 'frameEnd', frame: s.frame });
      }
      break;
    case 'frameEnd':
      if (s.phaseT <= 0) {
        if (s.frame + 1 >= RULES.frames) {
          s.phase = 'show';
          s.phaseT = RULES.showTime;
          ev.push({ type: 'show' });
        } else {
          s.frame++;
          s.throwNo = 0;
          setupFrame(s);
          startAim(s, ev);
        }
      }
      break;
    case 'show':
      if (s.phaseT <= 0) {
        s.phase = 'finished';
        s.winner = ranking(s)[0];
        ev.push({ type: 'finished', winner: s.winner });
      }
      break;
  }
  return ev;
}
// まだ 投げる 子(2回目は ストライクの 子は お休み)
const skip = (s, slot) => s.throwNo === 1 && s.lanes[slot].down1 === 10 && !s.lanes[slot].thrown;
const needsThrowAny = (s, slot) => (s.phase === 'aim' || s.phase === 'roll') && !s.lanes[slot].thrown && !skip(s, slot);
export const canThrow = needsThrowAny;

function startAim(s, ev) {
  s.phase = 'aim';
  s.aimLeft = RULES.aimTime;
  for (const lane of s.lanes) {
    lane.ball = null; lane.thrown = false; lane.done = false;
    if (s.throwNo === 1) clearDown(lane); // たおれた ピンは かたづける
  }
  ev.push({ type: 'aim', frame: s.frame, throwNo: s.throwNo });
}

export function ranking(s) {
  const P = s.players;
  return P.map((p, slot) => slot).sort((a, b) => P[b].score - P[a].score || P[b].strikes - P[a].strikes || P[b].spares - P[a].spares || P[b].lot - P[a].lot);
}

// たおれた ピンを レーンから どける(2回目の まえ。見た目と ぶつかりの ため)
export function clearDown(lane) {
  for (const p of lane.pins) if (p.down) { p.x = 9; p.y = -9; p.vx = 0; p.vy = 0; }
}
