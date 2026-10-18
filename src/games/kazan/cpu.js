// 火山の 落ちものよけ の CPU。
//
// 人と同じく「スティックの 向き」と「ジャンプ」だけを出す。
// - 影(落ちる ところ)に 気づくまで react 秒。気づいた 影・火の あと・くずれる 足場を さけて、
//   まわりの 行き先候補から いちばん 安全な ところへ 走る(ときどき 見まちがえる = noise)。
// - かさが 落ちていたら ひろいに いく(greed)。
// - 転がる岩が 来たら、ぶつかる 少し前に ジャンプ(jumpSkill の わりあいで うまく とべる)。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, seedFrom } from '../../rng.js';
import { RULES, shakyAt, solidAt } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', react: 0.3, think: 0.16, noise: 3, greed: 6, jumpSkill: 0.93, margin: 0.6 },
  normal: { label: 'ふつう', react: 0.26, think: 0.15, noise: 5, greed: 12, jumpSkill: 0.9, margin: 0.5 },
  bold: { label: 'つよき', react: 0.22, think: 0.14, noise: 8, greed: 22, jumpSkill: 0.86, margin: 0.4 },
};

const DIRS = Array.from({ length: 16 }, (_, i) => [Math.cos((i / 16) * Math.PI * 2), Math.sin((i / 16) * Math.PI * 2)]);

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:kazan-cpu:${slot}`), next: 0, tx: null, tz: null, rollSeen: new Set() };
}

function score(cpu, s, me, p, x, z) {
  if (!solidAt(s, x, z) || Math.hypot(x, z) > RULES.r0 - 0.25) return -1000;
  let v = -Math.hypot(x - me.x, z - me.z) * 0.6 - Math.hypot(x, z) * 0.9;
  if (shakyAt(s, x, z)) v -= 60;
  for (const d of s.drops) {
    if (s.t < d.at - d.warn + p.react) continue; // まだ 気づいていない
    if (Math.hypot(x - d.x, z - d.z) < d.r + RULES.bodyR + p.margin) v -= 120;
  }
  for (const f of s.fires) if (Math.hypot(x - f.x, z - f.z) < f.r + RULES.bodyR + 0.3) v -= 80;
  // 転がる岩の 通り道(これから 1.2 秒ぶん)
  for (const ro of s.rolls) {
    const sp = Math.hypot(ro.dx, ro.dz);
    const along = ((x - ro.x) * ro.dx + (z - ro.z) * ro.dz) / sp;
    const side = Math.abs((x - ro.x) * ro.dz - (z - ro.z) * ro.dx) / sp;
    if (along > -0.5 && along < sp * 1.2 && side < RULES.rollR + RULES.bodyR + 0.35) v -= 40;
  }
  for (const r of s.runners) if (r !== me && r.alive && Math.hypot(x - r.x, z - r.z) < 0.8) v -= 4;
  if (me.shield <= 0) for (const it of s.items) v += p.greed / (1 + Math.hypot(x - it.x, z - it.z) * 2);
  return v + (nextRandom(cpu) - 0.5) * p.noise;
}

export function cpuInput(cpu, s, slot) {
  const me = s.runners[slot];
  if (s.phase !== 'play' || !me.alive) return null;
  const p = PERSONALITIES[cpu.personality];
  // 行き先を 決めなおす
  if (s.t >= cpu.next) {
    cpu.next = s.t + p.think;
    let best = score(cpu, s, me, p, me.x, me.z) + 3, bx = me.x, bz = me.z; // その場に いるのを 少し ひいきする
    for (const step of [0.8, 1.6, 2.6]) {
      for (const [dx, dz] of DIRS) {
        const x = me.x + dx * step, z = me.z + dz * step;
        // 通り道に 穴が あったら 行かない
        let path = true;
        for (const k of [0.33, 0.66]) if (!solidAt(s, me.x + dx * step * k, me.z + dz * step * k)) path = false;
        if (!path) continue;
        const v = score(cpu, s, me, p, x, z);
        if (v > best) { best = v; bx = x; bz = z; }
      }
    }
    cpu.tx = bx; cpu.tz = bz;
  }
  // 転がる岩: ぶつかる 少し前に ジャンプ
  let jump = false;
  for (const ro of s.rolls) {
    const rx = me.x - ro.x, rz = me.z - ro.z;
    const sp = Math.hypot(ro.dx, ro.dz);
    const along = (rx * ro.dx + rz * ro.dz) / sp; // 岩の 進む 向きで どれだけ 先に いるか
    const side = Math.abs(rx * ro.dz - rz * ro.dx) / sp;
    const tHit = (along - RULES.rollR - RULES.bodyR * 0.6) / sp;
    if (side < RULES.rollR + RULES.bodyR + 0.1 && tHit > 0.02 && tHit < 0.2 && me.y <= 0 && !cpu.rollSeen.has(ro.id)) {
      cpu.rollSeen.add(ro.id);
      jump = nextRandom(cpu) < p.jumpSkill;
    }
  }
  const dx = cpu.tx - me.x, dz = cpu.tz - me.z, d = Math.hypot(dx, dz);
  if (d < 0.08) return { x: 0, z: 0, jump };
  const m = Math.min(1, d / 0.35);
  return { x: (dx / d) * m, z: (dz / d) * m, jump };
}
