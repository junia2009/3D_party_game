// まつぼっくり的あて の CPU。
//
// 人と同じく「どの向きへ、どれだけ強く」投げるかだけを出す(ぱちんこを引いて、はなすのと同じ)。
// 人と同じくらいにまちがえる:
// - 的が出てきても、気づいて投げるまでに少しかかる(react)
// - ねらいが少しぶれる(aimErr。遠いほど・動く的ほど外れやすい)
// - 風を読みきれない(windSense: どれだけ風を計算に入れるか)
// - 動く的の先読みが甘い(lead)
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, randRange, seedFrom } from '../../rng.js';
import { KINDS, aimFor, pass, targetPos } from './rules.js';

export const PERSONALITIES = {
  // react: 気づいてから投げるまで(秒)/ aimErr: ねらいのぶれ / windSense: 風を計算に入れる割合
  // lead: 動く的の先読み / greed: 金の的・遠い的への食いつき / think: 投げたあと、次をねらうまで
  // think は「投げてから、次を投げるまで」。人は指をおいて・引いて・ねらって・はなすのに 2 秒くらいかかるので、
  // CPU もそれに合わせる(1試合で 20〜25 回)。速く投げすぎると、ねらいが同じでも数で勝ってしまう
  cautious: { label: 'しんちょう', react: [0.95, 1.3], aimErr: 0.9, windSense: 0.6, lead: 0.55, greed: 0.8, think: [1.35, 1.85] },
  normal: { label: 'ふつう', react: [0.85, 1.2], aimErr: 0.85, windSense: 0.5, lead: 0.5, greed: 1.0, think: [1.25, 1.7] },
  bold: { label: 'つよき', react: [0.75, 1.1], aimErr: 1.05, windSense: 0.4, lead: 0.45, greed: 1.6, think: [1.05, 1.5] },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:cpu:${slot}`), seen: new Map(), wait: 0, target: null };
}

function gauss(cpu) {
  return (nextRandom(cpu) + nextRandom(cpu) + nextRandom(cpu) - 1.5) / 0.5;
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play') return null;
  const p = PERSONALITIES[cpu.personality];
  const me = s.runners[slot];
  if (me.stun > 0 || me.reload > 0) return null;
  cpu.wait -= 1 / 60;
  if (cpu.wait > 0) return null;

  // ねらう的をえらぶ: 気づいていて、まだ当てていない、引っこむまでに届くもの
  let best = null, bestScore = 0;
  for (const tg of s.targets) {
    if (tg.kind === 'hive' || me.hit.has(tg.id)) continue;
    let noticeAt = cpu.seen.get(tg.id);
    if (noticeAt === undefined) { noticeAt = tg.born + randRange(cpu, p.react[0], p.react[1]); cpu.seen.set(tg.id, noticeAt); }
    if (s.t < noticeAt) continue;
    const left = tg.born + tg.life - s.t;
    if (left < 1.2) continue;
    const k = KINDS[tg.kind];
    const value = tg.kind === 'gold' ? k.points * 0.45 * p.greed : k.points * (tg.kind === 'stump' ? 0.6 * p.greed : 1);
    const score = value / (1 + tg.d * 0.08);
    if (score > bestScore) { bestScore = score; best = tg; }
  }
  if (!best) return null;

  // 先読み: 届くまでの時間ぶん、動いた先をねらう(先読みは甘い)
  const now = targetPos(best, s.t);
  let goal = now;
  const fl = pass(aimFor(now, 0), now.d, 0);
  if (fl) {
    const later = targetPos(best, s.t + fl.t);
    goal = { x: now.x + (later.x - now.x) * p.lead, d: now.d + (later.d - now.d) * p.lead, y: now.y + (later.y - now.y) * p.lead };
  }
  const aim = aimFor(goal, s.wind * p.windSense);
  // ぶれ: 遠いほど大きい
  const far = 0.5 + goal.d / 14;
  aim.power += gauss(cpu) * 0.022 * p.aimErr * far;
  aim.yaw += gauss(cpu) * 0.03 * p.aimErr * far;
  cpu.wait = randRange(cpu, p.think[0], p.think[1]);
  if (cpu.seen.size > 80) cpu.seen.clear();
  return { throw: aim };
}
