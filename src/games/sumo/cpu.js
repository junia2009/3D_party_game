// 切り株ずもう の CPU。
//
// 人と同じく「行き先」と「ためるか」だけを出す。react 秒ごとに考えなおす。
// - ふちに近づきすぎたら、まん中へ もどる(margin。しんちょうほど大きい)。
// - ねらう子: ふちに近い子ほど ねらいめ。その子の「内がわ」(まん中がわ)へまわりこみ、
//   ふちのほうへ むかって おす。まっすぐ ならんだら、ためて とっしん。
// - 金どんぐりが近ければ とりにいく。こけ(すべる)は なるべく さける。
// - とっしんして来る子が近いと、よこへ よける(dodge)。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, randRange, seedFrom } from '../../rng.js';
import { RULES, onMoss } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', react: [0.35, 0.5], aim: 0.35, margin: 1.2, aggro: 0.4, dashAt: 1.5, charge: [0.3, 0.55], dodge: 0.55 },
  normal: { label: 'ふつう', react: [0.3, 0.45], aim: 0.35, margin: 0.95, aggro: 0.58, dashAt: 1.8, charge: [0.35, 0.65], dodge: 0.4 },
  bold: { label: 'つよき', react: [0.28, 0.42], aim: 0.45, margin: 0.7, aggro: 0.78, dashAt: 2.1, charge: [0.45, 0.8], dodge: 0.25 },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:sumo-cpu:${slot}`), think: 0, target: null, hold: false, want: 0.5, victim: null, rest: 0, pushT: 0 };
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play') return null;
  const me = s.runners[slot];
  if (!me.alive || me.stun > 0 || me.dash > 0) return cpu.target ? { ...cpu.target, hold: false } : null;
  const p = PERSONALITIES[cpu.personality];
  const R = s.radius;
  const dMe = Math.hypot(me.x, me.z);
  cpu.think -= 1 / 60;

  // ためている: 十分ためたか、相手が近づいたら はなす
  if (cpu.hold) {
    const v = cpu.victim !== null ? s.runners[cpu.victim] : null;
    const close = v && v.alive && Math.hypot(v.x - me.x, v.z - me.z) < p.dashAt * 0.8;
    if (me.charge >= cpu.want || (close && me.charge >= 0.3) || dMe > R - 0.4) {
      cpu.hold = false;
      cpu.rest = randRange(cpu, 1.0, 2.0); // とっしんのあとは ひといき
    }
    // ためているあいだも、相手のほうを向き続ける
    if (v && v.alive) cpu.target = { x: v.x, z: v.z };
    return { ...cpu.target, hold: cpu.hold };
  }

  cpu.rest -= 1 / 60;
  if (cpu.think > 0 && cpu.target) return { ...cpu.target, hold: false };
  cpu.think = randRange(cpu, p.react[0], p.react[1]);
  const jitter = () => randRange(cpu, -p.aim, p.aim);

  // ① ふちが近い: まん中へ
  if (dMe > R - p.margin) {
    cpu.target = { x: (me.x / dMe) * (R * 0.2) + jitter(), z: (me.z / dMe) * (R * 0.2) + jitter() };
    return { ...cpu.target, hold: false };
  }
  // ② とっしんが来る: よける
  for (let i = 0; i < s.runners.length; i++) {
    const o = s.runners[i];
    if (i === slot || !o.alive || o.dash <= 0) continue;
    const dx = me.x - o.x, dz = me.z - o.z, d = Math.hypot(dx, dz);
    const toward = (o.vx * dx + o.vz * dz) / Math.max(0.01, d);
    if (d < 2.6 && toward > 3 && nextRandom(cpu) < p.dodge) {
      // 進む向きの よこ(まん中に近いほう)へ
      const sx = -o.vz, sz = o.vx, sl = Math.hypot(sx, sz) || 1;
      const side = (me.x + sx / sl) ** 2 + (me.z + sz / sl) ** 2 < (me.x - sx / sl) ** 2 + (me.z - sz / sl) ** 2 ? 1 : -1;
      cpu.target = { x: me.x + (sx / sl) * side * 1.5, z: me.z + (sz / sl) * side * 1.5 };
      cpu.think = 0.35;
      return { ...cpu.target, hold: false };
    }
  }
  // ③ 金どんぐり
  for (const it of s.items) {
    const d = Math.hypot(it.x - me.x, it.z - me.z);
    const rival = s.runners.some((o, i) => i !== slot && o.alive && Math.hypot(it.x - o.x, it.z - o.z) < d * 0.7);
    if (d < 3.2 && !rival) {
      cpu.target = { x: it.x, z: it.z };
      return { ...cpu.target, hold: false };
    }
  }
  // ④ ねらう子をえらぶ: ふちに近いほど、自分に近いほど
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < s.runners.length; i++) {
    const o = s.runners[i];
    if (i === slot || !o.alive) continue;
    const dO = Math.hypot(o.x, o.z), d = Math.hypot(o.x - me.x, o.z - me.z);
    const score = (dO / R) * 2 - d * 0.35 + nextRandom(cpu) * 0.4 + (o.recover > 0 ? 0.6 : 0) - (o.power > 0 ? 0.8 : 0) + (me.power > 0 ? 0.3 : 0);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  // はじめの数秒と、とっしんのあとの ひといきは、ようすを見る
  const warm = s.t - RULES.readyTime < 1.5 + (slot % 3) * 0.6;
  if (best === null || warm || cpu.rest > 0 || nextRandom(cpu) > p.aggro) {
    cpu.pushT = 0;
    // ようすを見る: まん中あたりを うろうろ
    const a = nextRandom(cpu) * Math.PI * 2, d = nextRandom(cpu) * R * 0.35;
    cpu.target = { x: Math.cos(a) * d, z: Math.sin(a) * d };
    cpu.victim = null;
    return { ...cpu.target, hold: false };
  }
  const v = s.runners[best];
  cpu.victim = best;
  const dV = Math.hypot(v.x, v.z) || 0.01;
  const nx = v.x / dV, nz = v.z / dV; // その子の外向き
  // その子の内がわ(まん中がわ)の点
  const behind = { x: v.x - nx * 1.1, z: v.z - nz * 1.1 };
  const dx = v.x - me.x, dz = v.z - me.z, d = Math.hypot(dx, dz);
  const align = (dx * nx + dz * nz) / Math.max(0.01, d); // 自分→相手 が 外向きと そろっているか
  if (d < p.dashAt && align > 0.55 && dMe < R - p.margin * 0.8) {
    // ならんだ: ためて とっしん
    cpu.hold = true;
    cpu.want = randRange(cpu, p.charge[0], p.charge[1]);
    cpu.target = { x: v.x + jitter() * 0.5, z: v.z + jitter() * 0.5 };
    return { ...cpu.target, hold: true };
  }
  if (align > 0.5 && d < 1.3 && cpu.pushT < 1.2) {
    // おしていく(ずっとは おさない。つかれたら はなれる)
    cpu.pushT += cpu.think;
    cpu.target = { x: v.x + nx * 0.6 + jitter(), z: v.z + nz * 0.6 + jitter() };
    if (cpu.pushT >= 1.2) cpu.rest = randRange(cpu, 0.6, 1.2);
  } else {
    // 内がわへ まわりこむ(こけは さける)
    let tx = behind.x + jitter(), tz = behind.z + jitter();
    if (onMoss(s, tx, tz)) { tx *= 0.7; tz *= 0.7; }
    cpu.target = { x: tx, z: tz };
  }
  return { ...cpu.target, hold: false };
}
