// 花ぬり陣取り の CPU。
//
// 人と同じく「どこへ向かうか」だけを出す(どこでもスティックで指したところへ走るのと同じ)。
// react 秒ごとに考えなおす: 自分のまわりの いくつかの行き先をくらべて、
// 「とちゅうで まだ咲いていない・ほかの子の色の ます目を、どれだけ通れるか」がいちばん大きいところへ。
// - じょうろ・ミツバチが近くにあれば取りに行く(greed)。
// - つむじ風(来ると知らされたものも)の通り道は さける(fear)。
// - つよきは、近くの子に 体当たりしに行くことがある(bully)。
// - ねらいは少しずれる(aim)。見る行き先の数にも限りがある(look)。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, randRange, seedFrom } from '../../rng.js';
import { CELL, FIELD_R, N, RULES, cellX, inField } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', react: [0.4, 0.55], aim: 0.3, look: 12, greed: 1.0, fear: 1.0, bully: 0 },
  normal: { label: 'ふつう', react: [0.32, 0.45], aim: 0.3, look: 14, greed: 1.3, fear: 0.75, bully: 0.08 },
  bold: { label: 'つよき', react: [0.3, 0.42], aim: 0.4, look: 14, greed: 1.6, fear: 0.45, bully: 0.25 },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:hana-cpu:${slot}`), think: 0, target: null };
}

const C = (N - 1) / 2;
// (x, z) の ます目は、自分にとって どれだけうれしいか(まだ咲いていない 1、ほかの子 1.15、自分 0)
function worth(s, x, z, slot) {
  const i = Math.round(x / CELL + C), j = Math.round(z / CELL + C);
  if (i < 0 || j < 0 || i >= N || j >= N || !inField(i, j)) return 0;
  const o = s.grid[j * N + i];
  return o === slot ? 0 : o < 0 ? 1 : 1.15;
}
// 自分から (tx, tz) へ走ったとき、とちゅうで咲かせられる量(ざっくり)
function gain(s, slot, x0, z0, tx, tz) {
  const len = Math.hypot(tx - x0, tz - z0);
  if (len < 0.1) return 0;
  const ux = (tx - x0) / len, uz = (tz - z0) / len;
  let g = 0;
  for (let d = 0.4; d <= len; d += CELL) {
    const x = x0 + ux * d, z = z0 + uz * d;
    // 通り道のはば(はんけい 0.5)の、まん中と左右
    g += worth(s, x, z, slot) + 0.6 * (worth(s, x - uz * 0.35, z + ux * 0.35, slot) + worth(s, x + uz * 0.35, z - ux * 0.35, slot));
  }
  return g;
}
// 線分(自分 → 行き先)と、つむじ風の通り道が近いか
function windRisk(s, x0, z0, tx, tz) {
  let risk = 0;
  for (const w of s.winds) {
    // これから 2 秒で風が通るところを、いくつか点で見る
    for (let t = 0; t <= 2; t += 0.4) {
      const delay = Math.max(0, w.warn);
      const wx = w.x + w.dx * RULES.windSpeed * Math.max(0, t - delay), wz = w.z + w.dz * RULES.windSpeed * Math.max(0, t - delay);
      // 自分がそのころ いるところ
      const k = Math.min(1, (t * RULES.maxSpeed) / Math.max(0.1, Math.hypot(tx - x0, tz - z0)));
      const px = x0 + (tx - x0) * k, pz = z0 + (tz - z0) * k;
      if (Math.hypot(px - wx, pz - wz) < RULES.windR + 0.9) risk += 1;
    }
  }
  return risk;
}
function clampField(x, z, m = 0.5) {
  const d = Math.hypot(x, z), max = FIELD_R - m;
  return d <= max ? { x, z } : { x: (x / d) * max, z: (z / d) * max };
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play') return null;
  const me = s.runners[slot];
  if (me.stun > 0) return null;
  const p = PERSONALITIES[cpu.personality];
  cpu.think -= 1 / 60;
  if (cpu.think <= 0 || !cpu.target || Math.hypot(cpu.target.x - me.x, cpu.target.z - me.z) < 0.6) {
    cpu.think = randRange(cpu, p.react[0], p.react[1]);
    let best = null, bestScore = -Infinity;
    // 行き先の候補: まわりの いろいろな向き・遠さ(いまの進む向きに近いほど少しよい = くねくねしない)
    const heading = Math.atan2(me.vz, me.vx);
    const moving = Math.hypot(me.vx, me.vz) > 0.5;
    const a0 = nextRandom(cpu) * Math.PI * 2;
    for (let k = 0; k < p.look; k++) {
      const a = a0 + (k / p.look) * Math.PI * 2;
      for (const dist of [1.6, 3.0]) {
        const t = clampField(me.x + Math.cos(a) * dist, me.z + Math.sin(a) * dist);
        let score = gain(s, slot, me.x, me.z, t.x, t.z) / (0.6 + Math.hypot(t.x - me.x, t.z - me.z) / RULES.maxSpeed);
        if (moving) score *= 1 + 0.15 * Math.cos(a - heading);
        score -= windRisk(s, me.x, me.z, t.x, t.z) * 6 * p.fear;
        // ほかの子の すぐそばを通る道は さける(ぶつかって止まると損。つよきは気にしない)
        for (let i = 0; i < s.runners.length; i++) {
          if (i === slot) continue;
          const o = s.runners[i];
          if (Math.hypot(o.x - (me.x + t.x) / 2, o.z - (me.z + t.z) / 2) < 1.0) score -= 2 * (1 - p.bully * 3);
        }
        if (score > bestScore) { bestScore = score; best = t; }
      }
    }
    // じょうろ・ミツバチ: 近いほど、うれしい
    for (const it of s.items) {
      const d = Math.hypot(it.x - me.x, it.z - me.z);
      if (d > 4.5) continue;
      // 先に だれかが着きそうなら あきらめる
      if (s.runners.some((o, i) => i !== slot && Math.hypot(it.x - o.x, it.z - o.z) < d * 0.6)) continue;
      const score = ((it.kind === 'can' ? 26 : 18) * p.greed) / (0.6 + d / RULES.maxSpeed) - windRisk(s, me.x, me.z, it.x, it.z) * 6 * p.fear;
      if (score > bestScore) { bestScore = score; best = { x: it.x, z: it.z }; }
    }
    // 体当たり(つよき): すぐ近くに ほかの子がいたら、たまに当てに行く
    if (p.bully > 0 && nextRandom(cpu) < p.bully) {
      const o = s.runners.find((o, i) => i !== slot && o.stun <= 0 && Math.hypot(o.x - me.x, o.z - me.z) < 2.2);
      if (o) best = { x: o.x + o.vx * 0.25, z: o.z + o.vz * 0.25 };
    }
    // ねらいは少しずれる
    const e = clampField(best.x + randRange(cpu, -p.aim, p.aim), best.z + randRange(cpu, -p.aim, p.aim));
    cpu.target = e;
  }
  return cpu.target;
}
