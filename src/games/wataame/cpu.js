// 秋の森の わたあめ まき の CPU。
//
// 人と同じく「回す はやさ」と「ざらめを おす」だけを出す。見て いるのも 人と おなじ
// (はやさの メーターの ちょうどいい ところ・糸の はり・ちぢむ わ)。
// - 回す: ちょうどいい ところの どこかを ねらう(aim: 0 = 下はし、1 = 上はし。1 より 上は はやすぎ)。
//   手は ぶれる(ゆっくり ゆれる + こまかい ゆれ)。
// - はり: 糸が ある くらい はったら ゆっくりに する(気づくのは すこし おくれる)。
// - ざらめ: わが かさなる ころに おす(タイミングは ずれる)。
// 性格: aim・wobble(手の ぶれ)・tol(どこまで はりを がまんするか)・react(気づくまで)・timing(ざらめの ずれ 秒)。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, seedFrom } from '../../rng.js';
import { bandOf, chanceNow } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', aim: [0.3, 0.9], wobble: 0.35, tol: [0.15, 0.35], react: [0.15, 0.35], timing: 0.22 },
  normal: { label: 'ふつう', aim: [0.6, 1.3], wobble: 0.4, tol: [0.3, 0.55], react: [0.15, 0.35], timing: 0.2 },
  bold: { label: 'つよき', aim: [0.9, 1.7], wobble: 0.45, tol: [0.45, 0.8], react: [0.12, 0.3], timing: 0.18 },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:wataame-cpu:${slot}`), plan: null, calm: 0, seen: null, phase: 0, pressAt: [], aim: null };
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'spin') return null;
  const sk = PERSONALITIES[cpu.personality];
  const u = s.units[slot];
  const rnd = () => nextRandom(cpu);
  const r = (a) => a[0] + rnd() * (a[1] - a[0]);
  if (!cpu.plan) cpu.plan = { tol: r(sk.tol), react: r(sk.react), next: 0 };
  // ねらう ところは ときどき かわる
  if (cpu.aim === null || s.t >= cpu.plan.next) {
    cpu.aim = r(sk.aim);
    cpu.plan.next = s.t + 2 + rnd() * 3;
  }
  const p = cpu.plan;
  // 糸が はったのに 気づいたら、しばらく ゆっくり
  if (u.strain >= p.tol && cpu.seen === null) cpu.seen = s.t + p.react;
  if (cpu.seen !== null && s.t >= cpu.seen) { cpu.calm = 1.2 + rnd() * 0.8; cpu.seen = null; }
  if (cpu.calm > 0) cpu.calm -= 1 / 60;
  const [lo, hi] = bandOf(u.size);
  const aim = cpu.calm > 0 ? 0.2 : cpu.aim;
  cpu.phase += (1 / 60) * (0.6 + rnd() * 0.3) * 6.28;
  const spin = Math.max(0, lo + (hi - lo) * aim + Math.sin(cpu.phase) * sk.wobble * 0.6 + (rnd() - 0.5) * sk.wobble);
  // ざらめ: チャンスごとに おす 時を きめる
  let zarame = false;
  const ch = chanceNow(s);
  if (ch.i >= 0 && u.zarame[ch.i] === undefined) {
    if (cpu.pressAt[ch.i] === undefined) {
      const g = (rnd() + rnd() + rnd() - 1.5) * 1.4; // だいたい まんなかに よる ずれ
      cpu.pressAt[ch.i] = s.t + ch.left + g * sk.timing;
    }
    zarame = s.t >= cpu.pressAt[ch.i];
  }
  return { spin, zarame };
}
