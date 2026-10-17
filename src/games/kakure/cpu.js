// おぼえて かくれんぼ の CPU。
//
// 人と同じように「目で追う」: かくれた かごを おぼえて、いれかわりの たびに 追いかける。
// - 追っている かごが いれかわると、miss の確率で 見うしなって もうひとつのほうを 追ってしまう
//   (速い いれかわりほど、かごが 多いほど 見うしないやすい。まっくらのあいだは もっと)。
// - 追っていない かごどうしの いれかわりでも、ときどき つられる(stray)。
// - キツネの かごは 見分けて さけようとするが、見うしなっていると えらんでしまうこともある。
// - こたえる早さ: think 秒 + ばらつき。自信がないと(見うしなった数が多いと)ゆっくり。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, randRange, seedFrom } from '../../rng.js';
import { roundInfo } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', miss: 0.06, stray: 0.015, dark: 2.5, think: [1.4, 2.4] },
  normal: { label: 'ふつう', miss: 0.08, stray: 0.02, dark: 3, think: [1.1, 2.0] },
  bold: { label: 'つよき', miss: 0.11, stray: 0.03, dark: 3.5, think: [0.8, 1.5] },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:kakure-cpu:${slot}`), round: -1, track: 0, seen: 0, lost: 0, answerAt: null };
}

export function cpuInput(cpu, s, slot) {
  const p = PERSONALITIES[cpu.personality];
  if (s.phase === 'show') {
    if (cpu.round !== s.round) {
      cpu.round = s.round;
      cpu.track = s.baskets[s.hider].slot; // かくれたところ(置き場所)
      cpu.seen = 0;
      cpu.lost = 0;
      cpu.answerAt = null;
    }
    return null;
  }
  if (s.phase === 'shuffle') {
    const R = roundInfo(s);
    // むずかしさ: 速いほど・かごが多いほど 見うしないやすい
    const hard = (0.55 / R.dur) * (1 + (R.n - 3) * 0.25);
    while (cpu.seen < s.nextSwap) {
      const w = s.swaps[cpu.seen++];
      const inDark = s.dark && w.t0 + w.dur > s.dark.t0 && w.t0 < s.dark.t0 + s.dark.len;
      const k = (inDark ? p.dark : 1) * hard;
      if (w.a === cpu.track || w.b === cpu.track) {
        const other = w.a === cpu.track ? w.b : w.a;
        // ただしく ついていく / 見うしなって その場に のこったと思う
        if (nextRandom(cpu) < p.miss * k) cpu.lost++;
        else cpu.track = other;
      } else if (nextRandom(cpu) < p.stray * k) {
        // 追っていない かごに つられる
        cpu.track = nextRandom(cpu) < 0.5 ? w.a : w.b;
        cpu.lost++;
      }
    }
    return null;
  }
  if (s.phase === 'ask') {
    if (s.answers[slot]) return null;
    if (cpu.answerAt === null) cpu.answerAt = randRange(cpu, p.think[0], p.think[1]) * (1 + cpu.lost * 0.35);
    if (s.phaseT < cpu.answerAt) return null;
    return cpu.track;
  }
  return null;
}
