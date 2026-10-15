// だるまさんがころんだ の CPU。
//
// 人間が見ているのと同じもの(字幕の進み具合・しかけ・落ちてくるどんぐりの影)だけを見て、
// 押す/離すを決める。数える長さは人間も字幕の速さからだいたい読めるので、「残り時間」で考える。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。
// ゲームの state の乱数を使うと、CPU の数で振り向きのタイミングまで変わってしまう。

import { nextRandom, randRange, seedFrom } from '../../rng.js';
import { RULES, inMud } from './rules.js';

export const PERSONALITIES = {
  // margin: 数え終わる何秒前に手を離すか / slip: 止まりそこねる確率 / scared: フェイントで止まる確率
  // mudSense: ぬかるみで早めに止まる確率 / greed: どんぐりを拾いに止まる確率 / dodge: 落ちてくるどんぐりをよける確率
  cautious: { label: 'しんちょう', margin: [0.3, 0.5], slip: 0.03, scared: 0.8, mudSense: 0.9, greed: 0.3, dodge: 0.9 },
  normal: { label: 'ふつう', margin: [0.15, 0.4], slip: 0.1, scared: 0.5, mudSense: 0.6, greed: 0.5, dodge: 0.6 },
  bold: { label: 'つよき', margin: [0.0, 0.2], slip: 0.3, scared: 0.2, mudSense: 0.3, greed: 0.2, dodge: 0.3 },
};

export function createCpu(personality, seed, slot) {
  return {
    personality,
    rng: seedFrom(`${seed}:cpu:${slot}`),
    round: -1,
    plan: null,
    dodge: new Map(), // 落ちてくるどんぐりごとに、よけるかどうか(1回だけ決める)
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
    mudSense: nextRandom(cpu) < p.mudSense,
    greedy: nextRandom(cpu) < p.greed,
  };
}

// 止まったときに滑る距離(いまの速さから)
function slideDistance(lane, r) {
  const t = inMud(lane, r.x) ? RULES.mudSlide : RULES.maxSpeed / RULES.decel;
  return (r.v * r.v) / (2 * (RULES.maxSpeed / t));
}

// 押しているかどうかを返す
export function cpuHold(cpu, s, slot) {
  const me = s.runners[slot];
  const lane = s.lanes[slot];
  if (me.finishTime !== null || me.stun > 0) return false;
  if (cpu.round !== s.round) {
    cpu.round = s.round;
    cpu.plan = newPlan(cpu);
  }
  const plan = cpu.plan;
  const p = PERSONALITIES[cpu.personality];
  if (s.phase === 'chant') {
    const c = s.chant;
    if (c.elapsed < plan.startDelay) return false;
    // フェイントで止まったら、驚いて少しのあいだ手を離す
    if (c.pause > 0 && plan.scared) return false;
    if (c.fakeDone && c.pause === 0 && plan.scared && c.elapsed < c.fakeAt * c.length + plan.scaredFor) return false;
    // 落ちてくるどんぐりの影が目の前にあれば待つ
    for (const d of s.drops) {
      if (d.lane !== slot) continue;
      const ahead = d.x - me.x;
      if (ahead > -RULES.dropReach && ahead < 1.0 && d.left < 0.7) {
        if (!cpu.dodge.has(d)) cpu.dodge.set(d, nextRandom(cpu) < p.dodge);
        if (cpu.dodge.get(d)) return false;
      }
    }
    // どんぐりの手前で手を離して、ちょうど上で止まる
    if (plan.greedy) {
      const slide = slideDistance(lane, me);
      for (const a of lane.acorns) {
        if (a.taken) continue;
        const ahead = a.x - me.x;
        if (ahead >= 0 && ahead <= slide + 0.12) return false;
      }
    }
    let margin = plan.margin;
    if (plan.mudSense && inMud(lane, me.x)) margin += RULES.mudSlide - RULES.maxSpeed / RULES.decel;
    return c.length - c.elapsed > margin;
  }
  // 止まりそこね: 振り向いたあとも押し続けてしまう
  if (s.phase === 'turn' || s.phase === 'watch') {
    const late = s.phase === 'turn' ? s.phaseTime : RULES.turnTime + s.phaseTime;
    return plan.margin < 0 && late < -plan.margin;
  }
  return false;
}
