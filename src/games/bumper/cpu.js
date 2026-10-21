// 遊園地の バンパーカー の CPU。
//
// 人と同じく「スティックの 向き」と「ダッシュ」だけを出す。react 秒ごとに 考えなおす。
// - ふちに 近づきすぎたら、まん中へ もどる(margin。しんちょうほど 大きい)。
// - 回る まん中に のってしまったら、外へ ぬける(つよきは 気にしない)。
// - ねらう子: ふちに 近い子ほど ねらいめ。その子の 内がわへ まわりこみ、ふちの ほうへ むかって ぶつける。
//   車の 向きが 相手に そろって、近ければ ダッシュ。
// - ダッシュで 来る 車が 近いと、よこへ ハンドルを きって よける(dodge)。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, randRange, seedFrom } from '../../rng.js';
import { RULES, onDisk } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', react: [0.3, 0.45], aim: 0.32, margin: 1.3, aggro: 0.55, dashAt: 2.8, align: 0.32, dodge: 0.5, disk: 0.9 },
  normal: { label: 'ふつう', react: [0.28, 0.42], aim: 0.34, margin: 1.15, aggro: 0.58, dashAt: 3.0, align: 0.35, dodge: 0.38, disk: 0.6 },
  bold: { label: 'つよき', react: [0.28, 0.4], aim: 0.42, margin: 0.95, aggro: 0.68, dashAt: 3.2, align: 0.42, dodge: 0.25, disk: 0.3 },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:bumper-cpu:${slot}`), think: 0, dir: null, dash: false, rest: 0 };
}

const norm = (x, z) => { const d = Math.hypot(x, z) || 1; return { x: x / d, z: z / d }; };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play') return null;
  const me = s.runners[slot];
  if (!me.alive) return null;
  const p = PERSONALITIES[cpu.personality];
  const R = s.radius;
  const dMe = Math.hypot(me.x, me.z) || 0.01;
  cpu.think -= 1 / 60;
  cpu.rest -= 1 / 60;
  // ダッシュボタンは 1 回 おしたら はなす(つぎに おせるように)
  if (cpu.dash) { cpu.dash = false; return { ...cpu.dir, dash: false }; }
  if (cpu.think > 0 && cpu.dir) return { ...cpu.dir, dash: false };
  cpu.think = randRange(cpu, p.react[0], p.react[1]);
  const jitter = () => randRange(cpu, -p.aim, p.aim);
  const toward = (tx, tz) => { const n = norm(tx - me.x, tz - me.z); const a = Math.atan2(n.x, n.z) + jitter() * 0.5; return { x: Math.sin(a), z: Math.cos(a) }; };

  // ① ふちが 近い: まん中へ(進む 向きが 外なら 強く)
  const outV = (me.vx * me.x + me.vz * me.z) / dMe;
  if (dMe > R - p.margin - Math.max(0, outV) * 0.25) {
    const a = Math.atan2(-me.x, -me.z) + jitter();
    cpu.dir = { x: Math.sin(a), z: Math.cos(a) };
    return { ...cpu.dir, dash: false };
  }
  // ② 回る まん中: 外へ ぬける(リンクの まん中あたりの 輪へ)
  if (onDisk(me) && nextRandom(cpu) < p.disk) {
    const a = Math.atan2(me.x, me.z) + jitter();
    cpu.dir = { x: Math.sin(a), z: Math.cos(a) };
    return { ...cpu.dir, dash: false };
  }
  // ③ ダッシュで 来る 車: よける
  for (let i = 0; i < s.runners.length; i++) {
    const o = s.runners[i];
    if (i === slot || !o.alive || (o.dash <= 0 && o.wind <= 0)) continue;
    const dx = me.x - o.x, dz = me.z - o.z, d = Math.hypot(dx, dz);
    const facing = (Math.sin(o.h) * dx + Math.cos(o.h) * dz) / Math.max(0.01, d);
    if (d < 3.2 && facing > 0.8 && nextRandom(cpu) < p.dodge) {
      // 相手の 向きの よこ(まん中に 近いほう)
      const sx = Math.cos(o.h), sz = -Math.sin(o.h);
      const side = (me.x + sx) ** 2 + (me.z + sz) ** 2 < (me.x - sx) ** 2 + (me.z - sz) ** 2 ? 1 : -1;
      cpu.dir = { x: sx * side, z: sz * side };
      cpu.think = 0.35;
      return { ...cpu.dir, dash: false };
    }
  }
  // ④ ねらう子
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < s.runners.length; i++) {
    const o = s.runners[i];
    if (i === slot || !o.alive) continue;
    const dO = Math.hypot(o.x, o.z), d = Math.hypot(o.x - me.x, o.z - me.z);
    const score = (dO / R) * 2 - d * 0.3 + nextRandom(cpu) * 0.4 + (o.stun > 0 ? 0.5 : 0);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  const warm = s.t - RULES.readyTime < 1.2 + (slot % 3) * 0.5;
  if (best === null || warm || cpu.rest > 0 || nextRandom(cpu) > p.aggro) {
    // ようすを見る: リンクの 中ほどを ぐるっと 走る
    const a = Math.atan2(me.x, me.z) + 0.9;
    const rr = Math.max(RULES.diskR + 0.9, R * 0.55);
    cpu.dir = toward(Math.sin(a) * rr, Math.cos(a) * rr);
    return { ...cpu.dir, dash: false };
  }
  const v = s.runners[best];
  const dV = Math.hypot(v.x, v.z) || 0.01;
  const nx = v.x / dV, nz = v.z / dV; // 相手の 外向き
  const dx = v.x - me.x, dz = v.z - me.z, d = Math.hypot(dx, dz);
  const align = (dx * nx + dz * nz) / Math.max(0.01, d); // 自分→相手 が 外向きと そろっているか
  const lead = Math.min(0.6, d / 6);
  const tx = v.x + v.vx * lead, tz = v.z + v.vz * lead;
  const face = Math.abs(wrap(Math.atan2(tx - me.x, tz - me.z) - me.h));
  if (d < p.dashAt && align > 0.3 && face < p.align && me.cool <= 0 && dMe < R - p.margin * 0.7) {
    cpu.dash = true;
    cpu.rest = randRange(cpu, 0.8, 1.6);
    cpu.dir = toward(tx, tz);
    return { ...cpu.dir, dash: true };
  }
  if (align > 0.4) cpu.dir = toward(tx, tz);
  else cpu.dir = toward(v.x - nx * 1.6, v.z - nz * 1.6); // 内がわへ まわりこむ
  return { ...cpu.dir, dash: false };
}
