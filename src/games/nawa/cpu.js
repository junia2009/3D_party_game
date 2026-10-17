// お祭りの 大なわとび の CPU。
//
// 人と同じく「いま おしているか」だけを出す。
// - なわが 頭の上を 通ったら、つぎに 足もとを 通る 時刻を 見て、とぶ 時刻を 決める。
//   ずれ方は 性格しだい(sd)。なわが 速いほど、となりに カエルが いると、もっと ずれる。
// - 大なみに 気づけば(notice)長おし。気づかないと ふつうの ジャンプで ひっかかる。
// - ふいうちの ゆっくりに 気づかないと(slowNotice)、いつもの 速さの つもりで とんでしまう。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, seedFrom } from '../../rng.js';
import { RULES, frogNear, timeToPass } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', sd: 0.037, notice: 0.92, slowNotice: 0.72, speedFear: 0.04 },
  normal: { label: 'ふつう', sd: 0.034, notice: 0.88, slowNotice: 0.6, speedFear: 0.05 },
  bold: { label: 'つよき', sd: 0.031, notice: 0.86, slowNotice: 0.5, speedFear: 0.06 },
};

// ジャンプの 高さが いちばん 上に 来るまで、ではなく「なわを こえられる まどの まん中」までの 秒
const LEAD = { low: 0.125, high: 0.255 };
const gauss = (cpu) => nextRandom(cpu) + nextRandom(cpu) + nextRandom(cpu) + nextRandom(cpu) - 2; // sd ≒ 0.58

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:nawa-cpu:${slot}`), plannedFor: -1, pressAt: null, releaseAt: null };
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play' || !s.alive[slot]) return false;
  const p = PERSONALITIES[cpu.personality];
  const r = s.rope;
  const passN = r.n + 1;
  // 頭の上を こえたら(つぎの 通過を 決めたら)計画する
  if (cpu.plannedFor !== passN && r.theta % (Math.PI * 2) >= Math.PI) {
    cpu.plannedFor = passN;
    const high = r.kind === 'high' && nextRandom(cpu) < p.notice;
    let tPass = s.t + timeToPass(s);
    // ゆっくりに 気づかなければ、ふつうの 速さの つもりで 早く とぶ
    if (r.slow && nextRandom(cpu) > p.slowNotice) tPass = s.t + timeToPass(s) / RULES.slowFactor;
    const fast = Math.max(0, RULES.period - r.period) * p.speedFear * 10;
    const sd = p.sd * (1 + fast) * (frogNear(s, slot) ? 1.6 : 1);
    cpu.pressAt = tPass - LEAD[high ? 'high' : 'low'] + gauss(cpu) * sd / 0.58;
    cpu.releaseAt = cpu.pressAt + (high ? RULES.holdTime + 0.08 : STEP_HOLD);
  }
  if (cpu.pressAt === null) return false;
  if (s.t >= cpu.pressAt && s.t < cpu.releaseAt) return true;
  if (s.t >= cpu.releaseAt) { cpu.pressAt = null; }
  return false;
}

const STEP_HOLD = 0.05;
