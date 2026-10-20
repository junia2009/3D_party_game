// 雪山の 雪合戦 の CPU。
//
// 人と同じく「スティック」と「なげる」だけを出す。雪玉は 向いている 向きへ とぶので、
// ねらうときは スティックを 少しだけ たおして その場で 向きを かえてから なげる。
// - ねらい: いちばん 近い(体力の 少ない)相手。動きを 少し 先読み(lead)。ずれ(aimErr)は 性格しだい。
// - よける: 自分へ 来る 雪玉に 気づいたら(dodge)、横へ にげる。
// - かべ: ときどき 相手との あいだに かべが 来る ところへ 行って かくれる(cover)。
// - 雪玉が なくなったら、こおりで ない ところで 立ちどまって つくる。金の 雪玉は ひろいに いく(greed)。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, seedFrom } from '../../rng.js';
import { RULES, onIce, teamAlive, wallBetween } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', aimErr: 0.15, aimTol: 0.1, lead: 0.6, dodge: 0.7, cover: 0.6, greed: 0.3, think: 0.24, range: 7 },
  normal: { label: 'ふつう', aimErr: 0.16, aimTol: 0.12, lead: 0.5, dodge: 0.62, cover: 0.4, greed: 0.5, think: 0.22, range: 7.5 },
  bold: { label: 'つよき', aimErr: 0.18, aimTol: 0.15, lead: 0.4, dodge: 0.52, cover: 0.2, greed: 0.75, think: 0.2, range: 8.5 },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:yuki-cpu:${slot}`), next: 0, gx: null, gz: null, err: 0, dodgeUntil: 0, dx: 0, dz: 0, seen: new Set() };
}

const angDiff = (a, b) => ((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play') return null;
  const i = s.units.findIndex((u) => u.slot === slot);
  const me = s.units[i];
  if (!me.alive) return null;
  const p = PERSONALITIES[cpu.personality];
  const foes = teamAlive(s, me.side === 'L' ? 'R' : 'L').map((j) => s.units[j]);
  if (!foes.length) return null;
  const sx = me.side === 'L' ? -1 : 1;
  let target = foes[0], best = Infinity;
  for (const f of foes) {
    const v = Math.hypot(f.x - me.x, f.z - me.z) + f.hp * 0.8;
    if (v < best) { best = v; target = f; }
  }
  const dist = Math.hypot(target.x - me.x, target.z - me.z);
  // ── 雪玉を よける ──
  for (const b of s.balls) {
    if (s.units[b.owner].side === me.side || cpu.seen.has(b.id)) continue;
    const sp = Math.hypot(b.dx, b.dz);
    const rx = me.x - b.x, rz = me.z - b.z;
    const along = (rx * b.dx + rz * b.dz) / sp, side = (rx * b.dz - rz * b.dx) / sp;
    if (along > 0 && along / sp < 0.7 && Math.abs(side) < RULES.bodyR + RULES.ballR + 0.15) {
      cpu.seen.add(b.id);
      if (nextRandom(cpu) < p.dodge) {
        const k = side >= 0 ? 1 : -1;
        cpu.dx = (b.dz / sp) * k;
        cpu.dz = (-b.dx / sp) * k;
        cpu.dodgeUntil = s.t + 0.3;
      }
    }
  }
  if (s.t < cpu.dodgeUntil) return { x: cpu.dx, z: cpu.dz, throw: false };
  // ── 行き先を 決めなおす ──
  if (s.t >= cpu.next || cpu.gx === null) {
    cpu.next = s.t + p.think * (1.5 + nextRandom(cpu) * 2.5);
    cpu.err = (nextRandom(cpu) * 2 - 1) * p.aimErr;
    const gold = s.golds.find((g) => Math.sign(g.x) === sx);
    if (gold && nextRandom(cpu) < p.greed) { cpu.gx = gold.x; cpu.gz = gold.z; }
    else if (nextRandom(cpu) < p.cover) {
      // 相手との あいだに かべが 来る ところ
      const mine = s.walls.filter((w) => w.side === me.side && w.hp > 0);
      const w = mine[Math.floor(nextRandom(cpu) * mine.length)];
      if (w) {
        const d = Math.hypot(target.x - w.x, target.z - w.z) || 1;
        cpu.gx = w.x - ((target.x - w.x) / d) * 0.75;
        cpu.gz = w.z - ((target.z - w.z) / d) * 0.75;
      }
    } else {
      cpu.gx = sx * (1.2 + nextRandom(cpu) * 3.0);
      cpu.gz = (nextRandom(cpu) * 2 - 1) * 3;
    }
  }
  // 雪玉が ない: こおりで なければ 立ちどまって つくる(相手の ほうを 向いておく)
  const want = Math.atan2(target.x + target.vx * (dist / RULES.ballSpeed) * p.lead - me.x, target.z + target.vz * (dist / RULES.ballSpeed) * p.lead - me.z) + cpu.err;
  const turn = { x: Math.sin(want) * 0.2, z: Math.cos(want) * 0.2 };
  if (me.ammo <= 0 && !me.gold) {
    if (!onIce(s, me.x, me.z)) return { ...turn, throw: false };
    cpu.gx = me.x + sx * 0.8; // こおりから 出る
  }
  // ── ねらって なげる ──
  const open = !wallBetween(s, me.x, me.z, target.x, target.z);
  if (me.cd <= 0 && dist < p.range && open) {
    return { ...turn, throw: Math.abs(angDiff(want, me.face)) < p.aimTol };
  }
  const dx = cpu.gx - me.x, dz = cpu.gz - me.z, d = Math.hypot(dx, dz);
  if (d < 0.25) return { ...turn, throw: false };
  return { x: dx / d, z: dz / d, throw: false };
}
