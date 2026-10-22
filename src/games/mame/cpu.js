// 空まで まめのきジャンプ の CPU。
//
// 人と同じく「左 / 右 の ボタン」だけを出す。
// - 葉っぱに 乗ったら、つぎの 葉っぱを 見て 少し おくれて(react 秒)おす。
// - ときどき まちがえる(miss)。だんだん 手が はやくなるが、まちがいも ふえる(rush)。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, randRange, seedFrom } from '../../rng.js';
import { nextSide } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', react: [0.27, 0.39], miss: 0.03, rush: 0.2 },
  normal: { label: 'ふつう', react: [0.25, 0.37], miss: 0.045, rush: 0.35 },
  bold: { label: 'つよき', react: [0.235, 0.355], miss: 0.055, rush: 0.5 },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:mame-cpu:${slot}`), at: null };
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play') return null;
  const me = s.runners[slot];
  const p = PERSONALITIES[cpu.personality];
  if (me.jump > 0 || me.stun > 0) { cpu.at = null; return null; }
  // 乗った: いつ おすかを きめる(つづけて うまく いくほど 少し はやく)
  if (cpu.at === null) {
    const k = Math.min(1, (s.t - 3) / 40) * p.rush;
    cpu.at = s.t + randRange(cpu, p.react[0], p.react[1]) * (1 - k * 0.3);
    return null;
  }
  if (s.t < cpu.at) return null;
  cpu.at = null;
  const want = nextSide(s, me);
  const k = Math.min(1, (s.t - 3) / 40) * p.rush;
  const wrong = nextRandom(cpu) < p.miss * (1 + k);
  return { side: wrong ? (want === 'L' ? 'R' : 'L') : want };
}
