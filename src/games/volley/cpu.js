// 夏の浜べの ビーチバレー の CPU。
//
// 人と同じく「スティック」と「ボタン」だけを出す。頭は rules.js の autoInput(すけっとと 同じ)を、
// 性格の うでまえで よぶ。
// - react: ボールが うたれてから 動きだすまで。err: 落ちる ところの 読みの ずれ。press: 手の とどく ところで おす はやさ。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, seedFrom } from '../../rng.js';
import { autoInput } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', react: 0.3, err: 0.45, press: 8 },
  normal: { label: 'ふつう', react: 0.27, err: 0.5, press: 9 },
  bold: { label: 'つよき', react: 0.24, err: 0.6, press: 10 },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:volley-cpu:${slot}`) };
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play') return null;
  const i = s.units.findIndex((u) => u.slot === slot);
  return autoInput(s, i, PERSONALITIES[cpu.personality], () => nextRandom(cpu));
}
