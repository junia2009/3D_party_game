// まつぼっくり的あて のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 森の池のほとりの桟橋に5人がならび、池の向こうに出てくる「自分の色の的」へ、まつぼっくりを投げる。
// - ひっぱってはなす(ぱちんこ)。ひっぱる向きで左右、ひっぱる長さで遠さが決まる。
// - 的は子ごとにある(取り合いにしない)。出てくる場所と時間はみんな同じ(自分から見た位置が同じ)ので、公平。
// - 的の種類: ハスの葉の的(1点)・切り株の的(2点)・つるされた的(2点、ゆれる)・
//   金の的(5点、トンボが運ぶ。小さくて動く)・ハチの巣(当てると 3点へって、少しのあいだ投げられない)。
// - 風: ときどき横風が吹いて、まつぼっくりが流される。
// - つづけて当てるとボーナス(3つめから +1、6つめから +2)。外すと(池に落ちると)もとにもどる。
//
// 座標は「投げる子から見た向き」で持つ: x = 右が +、d = 前(池のほう)へのきょり、y = 高さ。
// 画面では、その子の立っている場所(laneX)をたして世界の位置にする。
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, randRange, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;
export const TIMES_OF_DAY = ['morning', 'day', 'evening'];
export const RULES = {
  readyTime: 3,
  timeLimit: 45,
  g: 9.8,
  angle: (38 * Math.PI) / 180, // 投げる角度(上向き)
  vMin: 6, // いちばん弱く投げたときの速さ(m/秒)→ 4m くらい
  vMax: 15.5, // いちばん強く → 24m くらい
  yawMax: 0.6, // 左右にねらえる角度(ラジアン)
  h0: 1.1, // 手をはなす高さ
  d0: 0.4, // 手をはなす前後の位置
  reload: 0.55, // つぎを投げられるまで
  pineR: 0.16, // まつぼっくりの半径
  windMax: 1.4, // 横風のいちばん強いとき(m/秒²)
  windEvery: [6, 10], // 風が変わる間隔
  stun: 1.6, // ハチの巣に当てたとき、投げられない時間
  hivePenalty: 3,
  farD: 26, // これより遠くは森の中(外れ)
};
// 池の上に張った、つるの綱(手前と奥の2本)。つるされた的とハチの巣は、ここから下がる
export const VINES = [10.5, 14.5];
export const VINE_Y = 5.6;

export const KINDS = {
  pad: { points: 1, r: 0.55 }, // ハスの葉の上の的。ゆっくりただよう
  stump: { points: 2, r: 0.5 }, // 向こう岸の切り株の的
  swing: { points: 2, r: 0.5 }, // 枝からつるされた的。ゆれる
  gold: { points: 5, r: 0.36 }, // 金の的。トンボが運ぶ
  hive: { points: -RULES.hivePenalty, r: 0.5 }, // ハチの巣。当てちゃだめ
};

// 桟橋の上の立ち位置(世界の x)
export function laneX(slot, n = 5) {
  return (slot - (n - 1) / 2) * 1.9;
}

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:mato`),
    phase: 'ready', // ready → play → finished
    winner: null,
    targets: [], // みんな共通の的の出かた { id, kind, x, d, y, born, life, ph }
    nextId: 0,
    spawnAt: RULES.readyTime + 0.3,
    wind: 0,
    windTo: 0,
    windAt: RULES.readyTime + 8,
    shots: [], // 飛んでいるまつぼっくり { slot, x, d, y, vx, vd, vy }
    runners: players.map(() => ({ score: 0, hits: 0, throws: 0, combo: 0, best: 0, reload: 0, stun: 0, hit: new Set() })),
  };
  s.timeOfDay = TIMES_OF_DAY[Math.floor(nextRandom(s) * TIMES_OF_DAY.length)];
  return s;
}

export function timeLeft(s) {
  return Math.max(0, RULES.readyTime + RULES.timeLimit - s.t);
}

// 的がいま、どこにあるか(その子から見た位置)。out に書いて返す
export function targetPos(tg, t, out = { x: 0, d: 0, y: 0 }) {
  const a = t - tg.born;
  out.x = tg.x;
  out.d = tg.d;
  out.y = tg.y;
  switch (tg.kind) {
    case 'pad':
      out.x += Math.sin(a * 0.6 + tg.ph) * 0.7;
      out.d += Math.cos(a * 0.45 + tg.ph) * 0.3;
      break;
    case 'swing':
    case 'hive':
      out.x += Math.sin(a * 1.9 + tg.ph) * (tg.kind === 'hive' ? 0.35 : 0.8);
      break;
    case 'gold':
      out.x += Math.sin(a * 0.9 + tg.ph) * 2.6;
      out.y += Math.sin(a * 2.3 + tg.ph) * 0.35;
      break;
  }
  return out;
}

// 出てくる的を決める(みんな共通)
function spawn(s) {
  const r = nextRandom(s);
  const t = s.t;
  let kind;
  if (r < 0.34) kind = 'pad';
  else if (r < 0.58) kind = 'stump';
  else if (r < 0.8) kind = 'swing';
  else if (r < 0.9) kind = 'gold';
  else kind = 'hive';
  const tg = { id: s.nextId++, kind, born: t, ph: nextRandom(s) * Math.PI * 2, x: 0, d: 0, y: 0, life: 0 };
  switch (kind) {
    case 'pad': tg.d = randRange(s, 6, 14); tg.x = randRange(s, -4.5, 4.5); tg.y = 0.7; tg.life = randRange(s, 4.5, 6); break;
    case 'stump': tg.d = randRange(s, 17, 21); tg.x = randRange(s, -5, 5); tg.y = 1.0; tg.life = randRange(s, 4, 5.5); break;
    case 'swing': tg.d = VINES[nextRandom(s) < 0.5 ? 0 : 1]; tg.x = randRange(s, -4.5, 4.5); tg.y = randRange(s, 2.2, 3.2); tg.life = randRange(s, 4, 5.5); break;
    case 'gold': tg.d = randRange(s, 9, 17); tg.x = randRange(s, -2.5, 2.5); tg.y = randRange(s, 2, 3); tg.life = randRange(s, 3, 4); break;
    case 'hive': tg.d = VINES[nextRandom(s) < 0.5 ? 0 : 1]; tg.x = randRange(s, -4, 4); tg.y = randRange(s, 2.4, 3.2); tg.life = randRange(s, 5, 7); break;
  }
  // ほかの的とかさならないように、近すぎたら少しずらす
  for (const o of s.targets) {
    if (Math.abs(o.x - tg.x) < 1.4 && Math.abs(o.d - tg.d) < 2) tg.x += tg.x > o.x ? 1.6 : -1.6;
  }
  tg.x = Math.max(-5.5, Math.min(5.5, tg.x));
  s.targets.push(tg);
}

// 投げ方(左右・強さ)から、はじめの速さを出す
export function launch(aim) {
  const power = Math.max(0, Math.min(1, aim.power));
  const yaw = Math.max(-RULES.yawMax, Math.min(RULES.yawMax, aim.yaw));
  const v = RULES.vMin + (RULES.vMax - RULES.vMin) * power;
  const vh = v * Math.cos(RULES.angle);
  return { x: 0, d: RULES.d0, y: RULES.h0, vx: vh * Math.sin(yaw), vd: vh * Math.cos(yaw), vy: v * Math.sin(RULES.angle) };
}

// 1刻み進める(重さと横風)
export function fly(p, wind, dt = STEP) {
  p.vx += wind * dt;
  p.vy -= RULES.g * dt;
  p.x += p.vx * dt;
  p.d += p.vd * dt;
  p.y += p.vy * dt;
}

// ねらう場所(x, d, y)に届く投げ方を、くりかえし試して見つける(CPU と、画面のねらいの線に使う)。
// wind: 計算に入れる風(CPU は風を少し見あやまる)
export function aimFor(goal, wind = 0) {
  let yaw = Math.atan2(goal.x, goal.d - RULES.d0);
  let power = 0.5;
  for (let iter = 0; iter < 3; iter++) {
    // 強さ: 前へのきょりで、ねらう高さを通るように(2分探索)
    let lo = 0, hi = 1;
    for (let k = 0; k < 18; k++) {
      const mid = (lo + hi) / 2;
      const y = heightAt({ yaw, power: mid }, goal.d, wind);
      if (y === null || y < goal.y) lo = mid; else hi = mid;
    }
    power = (lo + hi) / 2;
    // 左右: 風で流されるぶんをずらす
    const p = pass({ yaw, power }, goal.d, wind);
    if (!p) break;
    yaw += Math.atan2(goal.x - p.x, goal.d);
  }
  return { yaw: Math.max(-RULES.yawMax, Math.min(RULES.yawMax, yaw)), power: Math.max(0, Math.min(1, power)) };
}
// 投げて、前へ d まで来たときの位置と時間(届かなければ null)
export function pass(aim, d, wind = 0) {
  const p = launch(aim);
  let t = 0;
  while (p.d < d) {
    fly(p, wind);
    t += STEP;
    if (p.y < 0 || t > 5) return null;
  }
  return { x: p.x, y: p.y, t };
}
function heightAt(aim, d, wind) {
  const p = pass(aim, d, wind);
  return p ? p.y : null;
}

// inputs[slot]: { throw: { yaw, power } } を、投げたいときだけ
export function step(s, inputs) {
  const ev = [];
  const dt = STEP;
  s.t += dt;
  if (s.phase === 'ready' && s.t >= RULES.readyTime) {
    s.phase = 'play';
    ev.push({ type: 'start' });
  }
  if (s.phase === 'finished') return ev;
  const playing = s.phase === 'play';

  // 風: ときどき向きと強さが変わる(なぎのときもある)。ゆっくり変わる
  if (playing && s.t >= s.windAt) {
    s.windAt = s.t + randRange(s, RULES.windEvery[0], RULES.windEvery[1]);
    s.windTo = nextRandom(s) < 0.3 ? 0 : randRange(s, -RULES.windMax, RULES.windMax);
    ev.push({ type: 'wind', to: s.windTo });
  }
  s.wind += Math.max(-dt, Math.min(dt, s.windTo - s.wind)) * 0.8;

  // 的: 出てくる・引っこむ
  if (playing && s.t >= s.spawnAt) {
    spawn(s);
    s.spawnAt = s.t + randRange(s, 0.75, 1.15);
  }
  s.targets = s.targets.filter((tg) => s.t - tg.born < tg.life);

  // 投げる
  s.runners.forEach((r, slot) => {
    r.reload = Math.max(0, r.reload - dt);
    r.stun = Math.max(0, r.stun - dt);
    const aim = inputs[slot]?.throw;
    if (!playing || !aim || r.reload > 0 || r.stun > 0) return;
    if (!(aim.power >= 0) || !(Math.abs(aim.yaw) < 10)) return; // こわれた入力は無視(サーバーでも同じ)
    s.shots.push({ slot, ...launch(aim) });
    r.reload = RULES.reload;
    r.throws++;
    ev.push({ type: 'throw', slot, aim: { yaw: aim.yaw, power: aim.power } });
  });

  // 飛んでいるまつぼっくり: 自分の的に当たったか、池(地面)に落ちたか
  const tp = { x: 0, d: 0, y: 0 };
  s.shots = s.shots.filter((p) => {
    fly(p, s.wind, dt);
    const r = s.runners[p.slot];
    for (const tg of s.targets) {
      if (r.hit.has(tg.id)) continue;
      targetPos(tg, s.t, tp);
      const k = KINDS[tg.kind];
      if ((p.x - tp.x) ** 2 + (p.d - tp.d) ** 2 + (p.y - tp.y) ** 2 > (k.r + RULES.pineR) ** 2) continue;
      r.hit.add(tg.id);
      if (tg.kind === 'hive') {
        r.score = Math.max(0, r.score - RULES.hivePenalty);
        r.combo = 0;
        r.stun = RULES.stun;
        ev.push({ type: 'sting', slot: p.slot, id: tg.id, x: tp.x, d: tp.d, y: tp.y });
      } else {
        r.combo++;
        r.best = Math.max(r.best, r.combo);
        const bonus = r.combo >= 6 ? 2 : r.combo >= 3 ? 1 : 0;
        r.score += k.points + bonus;
        r.hits++;
        ev.push({ type: 'hit', slot: p.slot, id: tg.id, kind: tg.kind, points: k.points, bonus, combo: r.combo, x: tp.x, d: tp.d, y: tp.y });
      }
      return false;
    }
    if (p.y <= 0 || p.d > RULES.farD) {
      r.combo = 0;
      ev.push({ type: 'miss', slot: p.slot, x: p.x, d: p.d, water: p.d < 16 });
      return false;
    }
    return true;
  });

  if (playing && timeLeft(s) <= 0) {
    s.phase = 'finished';
    s.shots = [];
    s.winner = ranking(s)[0];
    ev.push({ type: 'finished', winner: s.winner });
  }
  return ev;
}

// 順位: 点数 → 当てた数 → 席の順
export function ranking(s) {
  return s.runners.map((_, i) => i).sort((a, b) => {
    const A = s.runners[a], B = s.runners[b];
    return B.score - A.score || B.hits - A.hits || a - b;
  });
}
