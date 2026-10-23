// 夏祭りの ラムネ しゅわしゅわ の CPU。
//
// 人と同じく「ふる 強さ」と「ポン」だけを出す。見て いるのも 人と おなじ(びんが がたがた ゆれたか)。
// - ふる: 性格の 強さで ふる(ゆらぎ つき)。がたがたが ある 強さに なったら ふるのを やめる(強さの 見きわめも ずれる)。
// - ポン: やめてから すこし まって ポン(まちすぎると ふきこぼれる)。
// 性格: power(ふる 強さ)・brave(どこまで がたがたを がまんするか)・wait(やめてから ポンまで 秒)・react(気づくまでの おくれ)。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, seedFrom } from '../../rng.js';
import { rattleK } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', power: 0.8, brave: [0.0, 0.25], wait: [0.0, 0.2], react: [0.12, 0.3] },
  normal: { label: 'ふつう', power: 0.88, brave: [0.1, 0.45], wait: [0.05, 0.3], react: [0.12, 0.3] },
  bold: { label: 'つよき', power: 0.95, brave: [0.25, 0.65], wait: [0.1, 0.4], react: [0.1, 0.28] },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:ramune-cpu:${slot}`), plan: null };
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'shake') return null;
  const sk = PERSONALITIES[cpu.personality];
  const b = s.bottles[slot];
  const rnd = () => nextRandom(cpu);
  if (cpu.plan?.round !== s.round) {
    const r = (a) => a[0] + rnd() * (a[1] - a[0]);
    cpu.plan = { round: s.round, stopAt: null, react: r(sk.react), wait: r(sk.wait), brave: r(sk.brave) };
  }
  const p = cpu.plan;
  // がたがたが「これくらい」に なったら やめる(気づくのは すこし おくれる)
  if (p.stopAt === null && b.rattle && rattleK(s, b) >= p.brave) p.stopAt = s.t + p.react;
  const stopped = p.stopAt !== null && s.t >= p.stopAt;
  const shake = stopped ? 0 : Math.max(0, Math.min(1, sk.power + (rnd() - 0.5) * 0.3));
  const pop = stopped && s.t >= p.stopAt + p.wait;
  return { shake, pop };
}
