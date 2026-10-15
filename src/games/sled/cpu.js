// 落ち葉そりレース の CPU。
//
// 人と同じように「左・右・両方(伏せる)・はなす」の4つしか押せない。
// 前方に見えるもの(どんぐりの列・ジャンプ台・カーブ・わかれ道)を見て、ねらう横の位置を決め、
// そこへ向かって左右を押す。人と同じくらいに まちがえる:
// - 考えなおすのに間がある(react)/ ねらう位置が少しずれる(aim)/ 見える先に限りがある(look)
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, randRange, seedFrom } from '../../rng.js';
import { ACORNS, ISLANDS, MUSHROOMS, curvatureAt, halfWidthAt } from './course.js';
import { RULES } from './rules.js';

export const PERSONALITIES = {
  // react: 考えなおす間隔(秒)/ aim: ねらいのずれ(m)/ look: 見る先(m)/ greed: どんぐり・ジャンプ台への食いつき
  // shortcut: 近道を選ぶ確率 / tuck: まっすぐな所で伏せる確率 / inside: カーブで内がわに寄る強さ
  cautious: { label: 'しんちょう', react: [0.3, 0.45], aim: 0.45, look: 20, greed: 0.8, shortcut: 0.2, tuck: 0.5, inside: 0.5 },
  normal: { label: 'ふつう', react: [0.25, 0.4], aim: 0.5, look: 24, greed: 1.0, shortcut: 0.5, tuck: 0.7, inside: 0.7 },
  bold: { label: 'つよき', react: [0.2, 0.34], aim: 0.6, look: 28, greed: 1.3, shortcut: 0.85, tuck: 0.9, inside: 0.9 },
};

export function createCpu(personality, seed, slot) {
  const cpu = { personality, rng: seedFrom(`${seed}:cpu:${slot}`), think: 0, target: 0, tuck: false };
  cpu.shortcut = nextRandom(cpu) < PERSONALITIES[personality].shortcut;
  return cpu;
}

export function cpuInput(cpu, s, slot) {
  const r = s.runners[slot];
  if (s.phase !== 'race' || r.finish !== null) return { left: false, right: false };
  const p = PERSONALITIES[cpu.personality];

  cpu.think -= 1 / 60;
  if (cpu.think <= 0) {
    cpu.think = randRange(cpu, p.react[0], p.react[1]);
    cpu.target = chooseTarget(cpu, p, s, slot) + randRange(cpu, -p.aim, p.aim);
    // すぐ前に だれかいたら、横へずれて追いこす(ぶつかると遅くなる)
    for (let i = 0; i < s.runners.length; i++) {
      const o = s.runners[i];
      if (i === slot || o.finish !== null) continue;
      const d = o.s - r.s;
      if (d > 0 && d < 4 && Math.abs(o.x - cpu.target) < 1.0) {
        const hw = halfWidthAt(r.s + 4) - 0.9;
        const side = o.x > 0 ? -1 : 1; // 道のまん中がわへ
        cpu.target = Math.max(-hw, Math.min(hw, o.x + side * 1.2));
      }
    }
    // まっすぐで、ねらいに近ければ伏せる
    const ahead = Math.abs(curvatureAt(r.s + 10)) + Math.abs(curvatureAt(r.s + 20));
    cpu.tuck = ahead < 0.001 && Math.abs(cpu.target - r.x) < 0.5 && nextRandom(cpu) < p.tuck;
  }
  if (cpu.tuck && Math.abs(cpu.target - r.x) < 0.7) return { left: true, right: true };
  // 流される分も見こして、ねらいへ向かう
  const err = cpu.target - (r.x + r.vx * 0.25);
  if (err > 0.25) return { left: false, right: true };
  if (err < -0.25) return { left: true, right: false };
  return { left: false, right: false };
}

function chooseTarget(cpu, p, s, slot) {
  const r = s.runners[slot];
  // わかれ道: 手前から、決めておいたがわへ寄せる
  for (const isl of ISLANDS) {
    if (r.s > isl.from - 25 && r.s < isl.to) {
      if (cpu.shortcut) return (isl.x1 + halfWidthAt(isl.from + 5)) / 2;
      return Math.min(isl.x0 - 1.2, nearestLine(r, s, slot, isl.from, isl.to) ?? -2.6);
    }
  }
  // 前方のどんぐりの列・ジャンプ台: 近くて、まだ拾っていないもの
  let best = null, bestScore = 0;
  ACORNS.forEach((a, i) => {
    const d = a.s - r.s;
    if (d < 3 || d > p.look || s.taken[slot].has(i)) return;
    const reachable = Math.abs(a.x - r.x) / RULES.steer < d / Math.max(4, r.v) + 0.2;
    if (!reachable) return;
    const score = (p.greed * 1.0) / (1 + d * 0.08);
    if (score > bestScore) { bestScore = score; best = a.x; }
  });
  for (const m of MUSHROOMS) {
    const d = m.s - r.s;
    if (d < 3 || d > p.look) continue;
    const reachable = Math.abs(m.x - r.x) / RULES.steer < d / Math.max(4, r.v) + 0.2;
    if (!reachable) continue;
    const score = (p.greed * 1.4) / (1 + d * 0.08);
    if (score > bestScore) { bestScore = score; best = m.x; }
  }
  if (best !== null) return best;
  // カーブ: 内がわへ(内がわほど道のりが短い)
  const c = curvatureAt(r.s + 12);
  const hw = halfWidthAt(r.s + 12) - 0.9;
  if (c !== 0) return Math.sign(c) * hw * p.inside;
  // まっすぐで何もなければ、いまの位置のまま(みんなでまん中に寄ると、まん中の席が得をする)
  return r.x;
}

function nearestLine(r, s, slot, from, to) {
  const a = ACORNS.find((a, i) => a.s > Math.max(r.s, from) && a.s < to && !s.taken[slot].has(i));
  return a ? a.x : null;
}
