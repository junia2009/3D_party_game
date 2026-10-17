// 川原の つなひき の CPU。
//
// 人と同じく「いま タップするか」だけを出す。
// - つぎの ビートに 合わせて タップ。ずれ方は 性格しだい(sd)。リズムが かわった すぐあとは もっと ずれる。
// - つよきは、ときどき ついでに 連打する(spam)。
// - すべったら、react 秒で ふんばる(ときどき まにあわない)。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, seedFrom } from '../../rng.js';
import { RULES } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', sd: 0.09, bias: 0.02, spam: 0, react: [0.4, 0.85] },
  normal: { label: 'ふつう', sd: 0.1, bias: 0.02, spam: 0.15, react: [0.35, 0.9] },
  bold: { label: 'つよき', sd: 0.105, bias: 0.01, spam: 0.45, react: [0.3, 0.95] },
};

const gauss = (cpu) => nextRandom(cpu) + nextRandom(cpu) + nextRandom(cpu) - 1.5; // だいたい ±1.5、sd ≒ 0.5

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:tsuna-cpu:${slot}`), forBeat: -1, at: null, extra: [], saveAt: null };
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play') return false;
  const me = s.runners[slot];
  const p = PERSONALITIES[cpu.personality];
  // すべった: ふんばる
  if (me.slip) {
    if (cpu.saveAt === null) cpu.saveAt = me.slip.at + p.react[0] + nextRandom(cpu) * (p.react[1] - p.react[0]);
    if (s.t >= cpu.saveAt) { cpu.saveAt = null; return true; }
    return false;
  }
  cpu.saveAt = null;
  const bi = s.nextBeat;
  const b = s.beats[bi];
  if (!b) return false;
  if (cpu.forBeat !== bi) {
    cpu.forBeat = bi;
    const prev = s.beats[bi - 1];
    const changed = prev && prev.kind !== b.kind;
    cpu.at = b.t + p.bias + gauss(cpu) * 2 * p.sd * (changed ? 1.8 : 1);
    cpu.extra = nextRandom(cpu) < p.spam ? [cpu.at + 0.09, cpu.at + 0.18] : [];
  }
  if (cpu.at !== null && s.t >= cpu.at) { cpu.at = null; return true; }
  if (cpu.extra.length && s.t >= cpu.extra[0]) { cpu.extra.shift(); return true; }
  void RULES;
  return false;
}
