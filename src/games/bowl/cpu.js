// 森の 倒れ木の どんぐりボウリング の CPU。
//
// 人と同じく「向き・はやさ・ひねり」を 1回 出すだけ。見て いるのは 自分の レーンの ピンと じゃまもの。
// - 立つ 場所(まんなか・左・右)も えらぶ。投げる まえに、いくつかの 投げかたを 頭の 中で ころがして(ルールと おなじ 計算)、たおれる 本数を くらべる。
//   ぴったり 1つの 向きだけで うまく いく 投げかたより、となりの 向きでも うまく いく ものを えらぶ(ずれに つよい)。
// - えらんだ 投げかたから、向き・はやさ・ひねりが すこし ずれる。
// 性格: aim(向きの ずれ)・power(はやさの ずれ)・spins(つかう ひねり)・gold(金の ピンを ねらう 気もち)・think(考える 秒)。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, seedFrom } from '../../rng.js';
import { RULES, STEP, canThrow, stepLane, throwBall } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', aim: 0.024, power: 0.08, spinErr: 0.12, spins: [0], speeds: [0.6], gold: 0.5, think: [1.2, 2.6] },
  normal: { label: 'ふつう', aim: 0.027, power: 0.1, spinErr: 0.16, spins: [-0.5, 0, 0.5], speeds: [0.75], gold: 1, think: [0.9, 2.2] },
  bold: { label: 'つよき', aim: 0.033, power: 0.12, spinErr: 0.2, spins: [-0.8, 0, 0.8], speeds: [0.95], gold: 2, think: [0.6, 1.8] },
};

const ANGLES = Array.from({ length: 9 }, (_, k) => (k - 4) * (RULES.maxAngle / 4.5));
const STANCES = [-0.3, 0, 0.3];

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:bowl-cpu:${slot}`), key: null, waitUntil: null, plan: null };
}

function gauss(cpu) {
  return (nextRandom(cpu) + nextRandom(cpu) + nextRandom(cpu) - 1.5) * 1.15;
}

// 投げかたを 1つ ためす: 自分の レーンを うつして ころがし、点を かえす
function trial(s, lane, inp, goldWant) {
  const sim = { lanes: [{ ball: null, pins: lane.pins.map((p) => ({ ...p })), thrown: false, done: false }], obstacles: s.obstacles };
  const l = sim.lanes[0];
  throwBall(sim, 0, inp);
  for (let k = 0; k < (RULES.rollMax / STEP) && !l.done; k += 2) {
    stepLane(sim, l, STEP * 2);
    // どんぐりが ピンを ぬけて、うごく ピンが なくなったら もう かわらない
    if (k % 8 === 0 && l.ball.y > RULES.headPin + 1.2 && !l.pins.some((p) => p.down && Math.abs(p.vx) + Math.abs(p.vy) > 0.3)) break;
    if (l.ball.gutter && l.ball.y < RULES.headPin - 1) break; // みぞ: 0本
  }
  const before = lane.pins.filter((p) => p.down).length;
  const down = l.pins.filter((p) => p.down).length - before;
  const gold = l.pins.some((p) => p.gold && p.down && !lane.pins[p.i].down);
  const all = l.pins.every((p) => p.down);
  return down + (gold ? RULES.gold * goldWant : 0) + (all ? (s.throwNo === 0 ? RULES.strike : RULES.spare) : 0);
}

// 1回目は 5本の レーンが みんな おなじ ならびなので、ためした けっかを みんなで つかう
const shared = new WeakMap();

function choose(cpu, s, slot) {
  const sk = PERSONALITIES[cpu.personality];
  const lane = s.lanes[slot];
  const key = `${s.frame}:${s.throwNo}:${sk.spins}:${sk.speeds}:${sk.gold}`;
  let table = null;
  if (s.throwNo === 0) {
    let m = shared.get(s);
    if (!m) shared.set(s, (m = new Map()));
    table = m.get(key);
  }
  if (!table) {
    table = [];
    for (const x of STANCES) for (const spin of sk.spins) for (const speed of sk.speeds) {
      const row = ANGLES.map((a) => ({ x, angle: a, speed, spin, v: trial(s, lane, { x, angle: a, speed, spin }, sk.gold) }));
      table.push(row);
    }
    if (s.throwNo === 0) shared.get(s).set(key, table);
  }
  // となりの 向きも ふくめた へいきんで くらべる(ずれても たおれる 投げかたが よい)
  let best = null, bs = -Infinity;
  for (const row of table) {
    row.forEach((c, k) => {
      const v = c.v * 0.5 + ((row[k - 1]?.v ?? 0) + (row[k + 1]?.v ?? 0)) * 0.25;
      if (v > bs + 1e-9) { bs = v; best = c; }
    });
  }
  return best;
}

export function cpuInput(cpu, s, slot) {
  if (!canThrow(s, slot)) { cpu.key = null; return null; }
  const sk = PERSONALITIES[cpu.personality];
  const key = `${s.frame}:${s.throwNo}`;
  if (cpu.key !== key) {
    cpu.key = key;
    cpu.waitUntil = s.t + sk.think[0] + nextRandom(cpu) * (sk.think[1] - sk.think[0]);
    cpu.plan = null;
  }
  if (s.t < cpu.waitUntil) return null;
  if (!cpu.plan) cpu.plan = choose(cpu, s, slot) || { angle: 0, speed: 0.7, spin: 0 };
  const p = cpu.plan;
  return {
    x: (p.x ?? 0) + gauss(cpu) * sk.aim * 2,
    angle: p.angle + gauss(cpu) * sk.aim,
    speed: Math.max(0, Math.min(1, p.speed + gauss(cpu) * sk.power)),
    spin: Math.max(-1, Math.min(1, p.spin + gauss(cpu) * sk.spinErr)),
  };
}
