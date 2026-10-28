// お正月の お寺の だるまおとし の CPU。
//
// 人と同じく「おす・はなす」だけを出す。見て いるのは だるまの ぐらぐらと、いちばん 下の だんの しゅるい(と ずれ)。
// - じぶんの ばんに なったら、ぐらぐらが おさまるのを まつ(どこまで まつかは 性格)。時間が なく なったら またずに ためる。
// - ねらう つよさは ちょうどいい はばの まんなか。手が ずれる(aim)。
// - つよさが ねらいに とどいたら はなす。
// 性格: patience(この ぐらぐらまで まつ)・aim(つよさの ずれ)・rush(のこり 何秒で あきらめて ためるか)。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, seedFrom } from '../../rng.js';
import { RULES, chargeAt, windowOf } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', patience: 0.14, aim: 0.095, rush: 1.6 },
  normal: { label: 'ふつう', patience: 0.24, aim: 0.088, rush: 1.9 },
  bold: { label: 'つよき', patience: 0.36, aim: 0.08, rush: 2.3 },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:otoshi-cpu:${slot}`), plan: null };
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'aim' || s.turn !== slot) { cpu.plan = null; return null; }
  const sk = PERSONALITIES[cpu.personality];
  if (!cpu.plan) {
    const [lo, hi] = windowOf(s);
    const g = (nextRandom(cpu) + nextRandom(cpu) + nextRandom(cpu) - 1.5) * 1.15;
    cpu.plan = { target: Math.max(0.03, Math.min(0.99, (lo + hi) / 2 + g * sk.aim)), started: false };
  }
  const p = cpu.plan;
  if (!p.started) {
    // ぐらぐらが おさまるまで まつ(時間が なければ はじめる)
    if (s.wobble > sk.patience && s.phaseT > sk.rush) return { hold: false };
    p.started = true;
  }
  // ためて いる: ねらいに とどいたら はなす(のぼり の とちゅうで)
  if (s.hold > 0 && chargeAt(s.hold) >= p.target && s.hold < RULES.period / 2) return { hold: false };
  return { hold: true };
}
