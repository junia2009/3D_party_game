// 川原の つなひき の CPU。
//
// 人と同じく「いま タップするか」だけを出す。
// - 連打の 速さは 性格しだい(rate)。ときどき 速く なったり つかれて おそく なったり(wobble)。
// - 「せーの!」に 気づくまで react 秒。気づいたら boost 倍で 連打する。
// - すべったら、少し あわてて(slipReact 秒)から 連打で ふんばる。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, seedFrom } from '../../rng.js';
import { seenoOn } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', rate: 5.7, wobble: 0.1, react: [0.12, 0.25], boost: 1.25, slipReact: [0.15, 0.35] },
  normal: { label: 'ふつう', rate: 5.9, wobble: 0.16, react: [0.15, 0.35], boost: 1.2, slipReact: [0.15, 0.45] },
  bold: { label: 'つよき', rate: 6.1, wobble: 0.24, react: [0.25, 0.5], boost: 1.15, slipReact: [0.2, 0.55] },
};

const between = (cpu, [a, b]) => a + nextRandom(cpu) * (b - a);

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:tsuna-cpu:${slot}`), nextTap: 0, pace: 1, paceUntil: 0, seenoAt: null, slipAt: null };
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play') return false;
  const me = s.runners[slot];
  const p = PERSONALITIES[cpu.personality];
  // 速さの ゆらぎ(1〜2.5 秒ごとに かわる)
  if (s.t >= cpu.paceUntil) {
    cpu.pace = 1 + (nextRandom(cpu) * 2 - 1) * p.wobble;
    cpu.paceUntil = s.t + 1 + nextRandom(cpu) * 1.5;
  }
  let rate = p.rate * cpu.pace;
  // せーの: 気づいたら 力いっぱい
  if (seenoOn(s)) {
    if (cpu.seenoAt === null) cpu.seenoAt = s.t + between(cpu, p.react);
    if (s.t >= cpu.seenoAt) rate *= p.boost;
  } else cpu.seenoAt = null;
  // すべった: あわててから 連打
  if (me.slip) {
    if (cpu.slipAt === null) cpu.slipAt = me.slip.at + between(cpu, p.slipReact);
    if (s.t < cpu.slipAt) return false;
  } else cpu.slipAt = null;
  if (s.t < cpu.nextTap) return false;
  cpu.nextTap = s.t + (1 / rate) * (0.75 + nextRandom(cpu) * 0.5);
  return true;
}
