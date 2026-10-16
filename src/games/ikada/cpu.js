// いかだレース の CPU。
//
// 人と同じように「左をたたく・右をたたく」しかできない。
// 1. こぐ間隔: 性格ごとの速さ(1秒に何回)で、少しばらつく。ときどき息つぎで手が止まる。
// 2. どこを通るか: 前に見える岩・流木・うず・ほかのいかだ を見て、よけられる横の位置をえらぶ(react 秒ごとに考えなおす)。
//    カーブでは内がわに寄る。ねらいは少しずれる(aim)。
// 3. 向き: ねらいの位置へ向かう向きより右を向きすぎていたら左を、左を向きすぎていたら右を たたく。ちょうどよければ交互。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, randRange, seedFrom } from '../../rng.js';
import { LOGS, LOG_R, ROCKS, WHIRLS, currentAt, curvatureAt, halfWidthAt, logX } from './course.js';
import { RULES } from './rules.js';

export const PERSONALITIES = {
  // rate: 1秒にたたく回数 / jitter: 間隔のばらつき / rest: 息つぎする割合 / react: 考えなおす間隔(秒)
  // aim: ねらいのずれ(m)/ look: 見る先(秒。速いほど遠くまで見る)/ inside: カーブで内がわに寄る強さ / bump: ほかの子に当てにいく
  cautious: { label: 'しんちょう', rate: 5.0, jitter: 0.25, rest: 0.05, react: [0.3, 0.45], aim: 0.2, look: 2.6, inside: 0.4, bump: 0 },
  normal: { label: 'ふつう', rate: 5.4, jitter: 0.25, rest: 0.05, react: [0.25, 0.4], aim: 0.3, look: 2.3, inside: 0.6, bump: 0.2 },
  bold: { label: 'つよき', rate: 5.8, jitter: 0.3, rest: 0.06, react: [0.2, 0.35], aim: 0.4, look: 2.0, inside: 0.8, bump: 0.5 },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:ikada-cpu:${slot}`), next: 0, think: 0, target: 0, rest: 0, side: 1 };
}

// ねらう横の位置をえらぶ: よけるもの・寄りたいところ を点数にして、いちばん良い x
function chooseTarget(cpu, p, s, slot) {
  const r = s.runners[slot];
  const hw = halfWidthAt(r.s + 6) - RULES.bodyR - 0.2;
  const speed = Math.max(3, r.v + currentAt(r.s));
  const look = p.look * (r.v + currentAt(r.s));
  let best = r.x, bestCost = Infinity;
  for (let x = -hw; x <= hw + 1e-9; x += 0.25) {
    let cost = Math.abs(x - r.x) * 0.35; // あまり大きく動かない
    // カーブの内がわ
    const c = curvatureAt(r.s + 10);
    if (c !== 0) cost += (Math.sign(c) * hw * p.inside - x) ** 2 * 0.05;
    // 岩・流木: その x にいると当たるもの と、いまの位置から その x へ動くとちゅうで当たる近いもの
    //   当たるところは、ふちから 0.6m かけて だんだん安全に(ぎりぎりをねらわない)
    const span = (ox, half, d, wgt) => {
      const near = 1 / (1 + Math.max(0, d) * 0.25);
      const out = Math.abs(x - ox) - half;
      if (out < 0.6) cost += wgt * 7 * near * Math.min(1, 1 - out / 0.6);
      // 近いものを またいで反対がわへ動く(とちゅうで当たる)
      if (d < speed * 1.2 && (r.x - ox) * (x - ox) < 0) cost += wgt * 4;
    };
    for (const k of ROCKS) {
      const d = k.s - r.s;
      if (d < -1 || d > look) continue;
      span(k.x, k.r + RULES.bodyR + 0.1, d, 1);
    }
    // 流木は、そこに着くころの位置で
    for (const lg of LOGS) {
      const d = lg.s - r.s;
      if (d < -1 || d > look) continue;
      const cx = logX(lg, s.t + Math.max(0, d) / speed);
      span(cx, lg.len / 2 + LOG_R + RULES.bodyR + 0.2, d, 1);
    }
    // うず
    for (const w of WHIRLS) {
      const d = w.s - r.s;
      if (d < -w.R || d > look + w.R) continue;
      if (Math.abs(x - w.x) < w.R + 0.4) cost += 5 / (1 + Math.max(0, d) * 0.12);
    }
    // ほかのいかだ: すぐ前にいたら よける(つよきは、横にいる子へ当てにいくこともある)
    s.runners.forEach((o, i) => {
      if (i === slot || o.finish !== null) return;
      const d = o.s - r.s;
      if (d > 0 && d < 5 && Math.abs(x - o.x) < 1.5) cost += 2;
      if (p.bump > 0 && Math.abs(d) < 2 && Math.abs(x - o.x) < 0.6) cost -= p.bump * 1.2;
    });
    if (cost < bestCost) { bestCost = cost; best = x; }
  }
  return best;
}

export function cpuInput(cpu, s, slot) {
  const r = s.runners[slot];
  if (s.phase !== 'race' || r.finish !== null) return null;
  const p = PERSONALITIES[cpu.personality];
  const dt = 1 / 60;

  cpu.think -= dt;
  if (cpu.think <= 0) {
    cpu.think = randRange(cpu, p.react[0], p.react[1]);
    cpu.target = chooseTarget(cpu, p, s, slot) + randRange(cpu, -p.aim, p.aim);
  }
  // 息つぎ
  if (cpu.rest > 0) { cpu.rest -= dt; return null; }
  cpu.next -= dt;
  if (cpu.next > 0 || r.air > 0) return null;
  cpu.next = (1 / p.rate) * (1 + randRange(cpu, -p.jitter, p.jitter));
  if (nextRandom(cpu) < p.rest / p.rate * 3) cpu.rest = randRange(cpu, 0.3, 0.7);

  // ねらいへ向かう向き(横のずれに比例。むきすぎない)。流れで外へ流されるぶんも見こむ
  const want = Math.max(-0.7, Math.min(0.7, (cpu.target - r.x - r.kx * 0.3) * 0.45));
  const diff = want - r.yaw - r.yawV * 0.2;
  let side;
  if (diff > 0.12) side = 1;
  else if (diff < -0.12) side = -1;
  else side = r.last === 1 ? -1 : 1; // 交互
  return side < 0 ? { left: true } : { right: true };
}
