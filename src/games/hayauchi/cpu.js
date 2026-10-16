// どんぐり早うち の CPU。
//
// 人と同じく「いま うつか」だけを出す。
// - 合図を見てから react 秒(毎回 少しばらつく)で うつ。
// - ひっかけ(にせの合図・じゃまもの・逆)を見ると、fooled の確率で つられて うってしまう(そのときも react 秒あと)。
// - 長く待たされると、ごくまれに がまんできずに うつ(itchy。じらしに弱い)。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, seedFrom } from '../../rng.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', react: [0.33, 0.05], fooled: { nise: 0.04, jama: 0.01, gyaku: 0.08 }, itchy: 0.0 },
  normal: { label: 'ふつう', react: [0.3, 0.05], fooled: { nise: 0.08, jama: 0.03, gyaku: 0.15 }, itchy: 0.01 },
  bold: { label: 'つよき', react: [0.27, 0.05], fooled: { nise: 0.15, jama: 0.05, gyaku: 0.25 }, itchy: 0.025 },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:hayauchi-cpu:${slot}`), round: -1, fireAt: null, seen: new Set(), itchyAt: null };
}

// ふつう分布っぽいばらつき(一様乱数3つの和)
function gauss(cpu, mean, sd) {
  const u = nextRandom(cpu) + nextRandom(cpu) + nextRandom(cpu) - 1.5;
  return mean + u * sd * 2;
}

export function cpuInput(cpu, s, slot) {
  if (!s.alive[slot] || s.shots[slot]) return false;
  const p = PERSONALITIES[cpu.personality];
  const react = () => Math.max(0.15, gauss(cpu, p.react[0], p.react[1]));
  // 回が変わったら、考えなおす
  if (cpu.round !== s.round) {
    cpu.round = s.round;
    cpu.fireAt = null;
    cpu.seen.clear();
    // じらしに負ける時刻(4 秒をこえて待たされたときだけ)
    cpu.itchyAt = nextRandom(cpu) < p.itchy * 10 ? 4 + nextRandom(cpu) * 3 : null;
  }
  if (s.phase === 'wait') {
    if (s.fake && !cpu.seen.has(s.fake.id)) {
      cpu.seen.add(s.fake.id);
      if (nextRandom(cpu) < p.fooled[s.fake.kind]) cpu.fireAt = s.t + react();
    }
    if (cpu.itchyAt !== null && s.phaseT >= cpu.itchyAt && cpu.fireAt === null) cpu.fireAt = s.t;
  } else if (s.phase === 'go') {
    // 合図: つられて うつ予定がなければ、ここから react 秒
    if (cpu.fireAt === null) cpu.fireAt = s.goAt + react();
  } else {
    return false;
  }
  return cpu.fireAt !== null && s.t >= cpu.fireAt;
}
