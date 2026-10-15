// だるまさんがころんだ の CPU。
//
// 人間が見ているのと同じもの(字幕の進み具合)だけを見て、押す/離すを決める。
// 数える長さは人間も字幕の速さからだいたい読めるので、「残り時間」で考える。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。
// ゲームの state の乱数を使うと、CPU の数で振り向きのタイミングまで変わってしまう。

import { nextRandom, randRange, seedFrom } from '../../rng.js';
import { RULES } from './rules.js';

export const PERSONALITIES = {
  // margin: 数え終わる何秒前に手を離すか / slip: 止まりそこねる確率 / scared: フェイントで止まる確率
  cautious: { label: 'しんちょう', margin: [0.3, 0.5], slip: 0.03, scared: 0.8 },
  normal: { label: 'ふつう', margin: [0.15, 0.4], slip: 0.1, scared: 0.5 },
  bold: { label: 'つよき', margin: [0.0, 0.2], slip: 0.3, scared: 0.2 },
};

export function createCpu(personality, seed, slot) {
  return {
    personality,
    rng: seedFrom(`${seed}:cpu:${slot}`),
    round: -1,
    plan: null,
  };
}

function newPlan(cpu) {
  const p = PERSONALITIES[cpu.personality];
  const slipped = nextRandom(cpu) < p.slip;
  return {
    startDelay: randRange(cpu, 0.12, 0.4),
    // 止まりそこねたときは、数え終わってもしばらく押したまま
    margin: slipped ? -randRange(cpu, 0.45, 0.8) : randRange(cpu, p.margin[0], p.margin[1]),
    scared: nextRandom(cpu) < p.scared,
    scaredFor: randRange(cpu, 0.3, 0.6),
  };
}

// 押しているかどうかを返す
export function cpuHold(cpu, s, slot) {
  const me = s.runners[slot];
  if (me.finishTime !== null || me.stun > 0) return false;
  if (cpu.round !== s.round) {
    cpu.round = s.round;
    cpu.plan = newPlan(cpu);
  }
  const plan = cpu.plan;
  if (s.phase === 'chant') {
    const c = s.chant;
    if (c.elapsed < plan.startDelay) return false;
    // フェイントで止まったら、驚いて少しのあいだ手を離す
    if (c.pause > 0 && plan.scared) return false;
    if (c.fakeDone && c.pause === 0 && plan.scared && c.elapsed < c.fakeAt * c.length + plan.scaredFor) return false;
    const remaining = c.length - c.elapsed;
    return remaining > plan.margin;
  }
  // 止まりそこね: 振り向いたあとも押し続けてしまう
  if (s.phase === 'turn' || s.phase === 'watch') {
    const late = (s.phase === 'turn' ? s.phaseTime : RULES.turnTime + s.phaseTime);
    return plan.margin < 0 && late < -plan.margin;
  }
  return false;
}
