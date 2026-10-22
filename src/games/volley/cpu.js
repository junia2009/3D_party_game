// 夏の浜べの ビーチバレー の CPU。
//
// 人と同じく「スティック」と「ボタン」だけを出す。頭は rules.js の autoInput(すけっとと 同じ)を、
// 性格の うでまえで よぶ。
// - react: ボールが うたれてから 動きだすまで。err: 落ちる ところの 読みの ずれ。tsd: うつ タイミングの ずれ(秒)。
//   block: 相手の スパイクに ブロックで とぶ 確率。aim: あいている ところを ねらう 確率。dive: 飛びこむ 確率。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, seedFrom } from '../../rng.js';
import { autoInput } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', react: 0.27, err: 0.6, tsd: 0.08, block: 0.3, aim: 0.5, dive: 0.4 },
  normal: { label: 'ふつう', react: 0.26, err: 0.7, tsd: 0.09, block: 0.45, aim: 0.6, dive: 0.45 },
  bold: { label: 'つよき', react: 0.25, err: 0.8, tsd: 0.11, block: 0.6, aim: 0.75, dive: 0.5 },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:volley-cpu:${slot}`) };
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play') return null;
  const i = s.units.findIndex((u) => u.slot === slot);
  return autoInput(s, i, PERSONALITIES[cpu.personality], () => nextRandom(cpu));
}
