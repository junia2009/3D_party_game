// 森の図書館の ぱらぱらブック の CPU。
//
// 人と同じく「スティックの 向き」だけを出す。
// - 新しい ページが 立ったら、少し おくれて(react)穴を 見る。
// - 行く 穴: 近くて、ほかの 子が あまり ねらっていない 穴。ときどき 見まちがえる(miss: となりの 穴へ 行きかける)。
// - 穴に ついたら まん中で まつ。こんでいて(2人 いる)おしだされそうなら、まだ 時間が あれば ほかの 穴へ。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, randRange, seedFrom } from '../../rng.js';
import { RULES } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', react: [0.3, 0.52], miss: 0.04, crowd: 0.8, aim: 0.25 },
  normal: { label: 'ふつう', react: [0.3, 0.52], miss: 0.05, crowd: 0.6, aim: 0.3 },
  bold: { label: 'つよき', react: [0.29, 0.5], miss: 0.07, crowd: 0.35, aim: 0.35 },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:ehon-cpu:${slot}`), page: -1, at: 0, target: null, wrong: 0, wrongTo: null, check: 0 };
}

// 穴 h を いま ねらっている(近くに いる)ほかの 子の 数
const crowd = (s, h, slot) => s.runners.filter((o, i) => i !== slot && o.alive && Math.hypot(o.x - h.x, o.z - h.z) < h.r + 0.3).length;

function pick(cpu, s, slot, p, exclude = null) {
  const me = s.runners[slot];
  let best = null, bestScore = Infinity;
  for (const h of s.holes) {
    if (h === exclude) continue;
    const d = Math.hypot(h.x - me.x, h.z - me.z);
    const score = d + crowd(s, h, slot) * 2.2 * p.crowd + nextRandom(cpu) * 0.8;
    if (score < bestScore) { bestScore = score; best = h; }
  }
  const a = nextRandom(cpu) * Math.PI * 2, r = nextRandom(cpu) * best.r * p.aim;
  return { h: best, x: best.x + Math.cos(a) * r, z: best.z + Math.sin(a) * r };
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play') return null;
  const me = s.runners[slot];
  if (!me.alive) return null;
  const p = PERSONALITIES[cpu.personality];
  const dt = 1 / 60;
  if (cpu.page !== s.page) {
    cpu.page = s.page;
    cpu.at = s.t + randRange(cpu, p.react[0], p.react[1]);
    cpu.target = null;
  }
  if (s.t < cpu.at) return { x: 0, z: 0 };
  if (!cpu.target) {
    cpu.target = pick(cpu, s, slot, p);
    cpu.wrong = 0;
    if (nextRandom(cpu) < p.miss && s.holes.length > 1) {
      const w = s.holes[(s.holes.indexOf(cpu.target.h) + 1) % s.holes.length];
      cpu.wrongTo = { h: w, x: w.x, z: w.z };
      cpu.wrong = randRange(cpu, 0.3, 0.6);
    }
    cpu.check = 0.4;
  }
  let t = cpu.target;
  if (cpu.wrong > 0) { cpu.wrong -= dt; t = cpu.wrongTo; }
  // こんでいたら ほかの 穴へ(まだ 間に あいそうなら)
  cpu.check -= dt;
  if (cpu.check <= 0 && cpu.wrong <= 0) {
    cpu.check = 0.35;
    const left = s.stage === 'show' ? s.stageT : 0;
    if (crowd(s, t.h, slot) >= 2 && left > 0.8) {
      const other = pick(cpu, s, slot, p, t.h);
      if (Math.hypot(other.x - me.x, other.z - me.z) / RULES.speed < left) cpu.target = t = other;
    }
  }
  const dx = t.x - me.x, dz = t.z - me.z, d = Math.hypot(dx, dz);
  if (d < 0.08) return { x: 0, z: 0 };
  const m = Math.min(1, d / 0.5);
  return { x: (dx / d) * m, z: (dz / d) * m };
}
