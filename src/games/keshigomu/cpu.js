// 森の学校の けしごむ大戦 の CPU。
//
// 人と同じく「おす(ためる)・向き・ひねり」だけを出す。見て いるのは つくえの 上の けしごむの 位置と 大きさ。
// - とまったら すこし 考えて、ねらう 相手を きめる: 相手を まっすぐ おしたとき、つくえの はしまで ちかいほど よい。
//   自分が はしに ちかすぎる ときは、まんなかへ もどる ことも ある。
// - ためる 強さ: 相手が はしまで すべる くらいの はやさを 見つもる(すこし 多めに)。
//   はずれた とき 自分が おちそうなら、しんちょうな 子は 弱めに する。
// - 向きと 強さは ずれる。ひねりは ときどき。
// 性格: aim(向きの ずれ)・power(強さの ずれ)・think(考える 秒)・safe(自分が おちない ように する 気もち)・extra(多めに ためる)。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, seedFrom } from '../../rng.js';
import { RULES, canFlick, halfDesk, launchSpeed } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', aim: 0.17, power: 0.2, think: [1.2, 2.6], safe: 0.9, extra: 0.9 },
  normal: { label: 'ふつう', aim: 0.15, power: 0.2, think: [1.0, 2.2], safe: 0.6, extra: 1.1 },
  bold: { label: 'つよき', aim: 0.14, power: 0.22, think: [0.8, 1.8], safe: 0.3, extra: 1.35 },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:keshigomu-cpu:${slot}`), plan: null, waitUntil: null };
}

// 点 (x, y) から 向き (dx, dy) に すすんで、つくえの はしまでの きょり
function edgeDist(s, x, y, dx, dy) {
  const [hx, hy] = halfDesk(s);
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (hx - x) / dx);
  if (dx < -1e-6) t = Math.min(t, (-hx - x) / dx);
  if (dy > 1e-6) t = Math.min(t, (hy - y) / dy);
  if (dy < -1e-6) t = Math.min(t, (-hy - y) / dy);
  return Math.max(0, t);
}

function gauss(cpu) {
  return (nextRandom(cpu) + nextRandom(cpu) + nextRandom(cpu) - 1.5) * 1.15;
}

function choose(cpu, s, slot) {
  const sk = PERSONALITIES[cpu.personality];
  const me = s.bodies[slot];
  const best = { score: -Infinity };
  // 自分が はしに ちかすぎる → まんなかへ もどる 手も 考える
  const [hx, hy] = halfDesk(s);
  const margin = Math.min(hx - Math.abs(me.x), hy - Math.abs(me.y));
  if (margin < 1.3) {
    const d = Math.hypot(me.x, me.y) || 1;
    const back = { score: (1.3 - margin) * 3 * sk.safe + nextRandom(cpu) * 0.5, aim: Math.atan2(-me.y, -me.x), charge: Math.max(0, (Math.sqrt(2 * me.fric * Math.min(d, 1.8)) - RULES.vmin) / (RULES.vmax - RULES.vmin)) };
    Object.assign(best, back);
  }
  s.bodies.forEach((t, i) => {
    if (i === slot || t.out) return;
    const dx = t.x - me.x, dy = t.y - me.y;
    const dist = Math.hypot(dx, dy);
    const ux = dx / dist, uy = dy / dist;
    const push = edgeDist(s, t.x, t.y, ux, uy); // 相手が おちるまで
    // 相手を はしまで すべらせる はやさ → ぶつかる ときの はやさ → はじく はやさ
    const vT = Math.sqrt(2 * t.fric * (push + 0.6));
    const vi = vT * (me.mass + t.mass) / (me.mass * (1 + RULES.bounce));
    const v0 = Math.sqrt(vi * vi + 2 * me.fric * Math.max(0, dist - 1.4)) * sk.extra;
    const charge = Math.min(1, Math.max(0.05, (v0 - RULES.vmin) / (RULES.vmax - RULES.vmin)));
    // はずれたら 自分は どこまで すべるか
    const v = launchSpeed(charge);
    const travel = v * v / (2 * me.fric);
    const risk = travel > edgeDist(s, me.x, me.y, ux, uy) + 0.5 ? 1 : 0;
    const enough = v0 <= RULES.vmax * 1.05 ? 1 : 0.4;
    const score = -push * 0.8 - dist * 0.25 + enough * 2 - risk * 3 * sk.safe + nextRandom(cpu) * 1.2;
    if (score > best.score) Object.assign(best, { score, aim: Math.atan2(dy, dx), charge });
  });
  if (best.score === -Infinity) return null;
  return {
    aim: best.aim + gauss(cpu) * sk.aim,
    charge: Math.min(1, Math.max(0.05, best.charge * (1 + gauss(cpu) * sk.power))),
    spin: nextRandom(cpu) < 0.25 ? (nextRandom(cpu) - 0.5) * 1.6 : 0,
  };
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'battle') return null;
  const sk = PERSONALITIES[cpu.personality];
  const me = s.bodies[slot];
  if (me.out) return null;
  // ためて いる とちゅう: きめた ぶんまで ためたら はなす
  if (cpu.plan && me.charge > 0) {
    if (me.charge >= cpu.plan.charge) { const p = cpu.plan; cpu.plan = null; return { hold: false, aim: p.aim, spin: p.spin }; }
    return { hold: true, aim: cpu.plan.aim, spin: cpu.plan.spin };
  }
  if (cpu.plan && me.charge === 0 && cpu.plan.started) cpu.plan = null; // ぶつけられて ためが きえた
  if (!canFlick(s, me)) { cpu.waitUntil = null; return { hold: false }; }
  // とまったら すこし 考える
  if (cpu.waitUntil === null) cpu.waitUntil = s.t + sk.think[0] + nextRandom(cpu) * (sk.think[1] - sk.think[0]);
  if (s.t < cpu.waitUntil) return { hold: false };
  cpu.waitUntil = null;
  cpu.plan = choose(cpu, s, slot);
  if (!cpu.plan) return { hold: false };
  cpu.plan.started = true;
  return { hold: true, aim: cpu.plan.aim, spin: cpu.plan.spin };
}
