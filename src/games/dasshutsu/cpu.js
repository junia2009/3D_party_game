// どんぐりマンション だっしゅつ の CPU。
//
// 人と同じく「行き先」と「あけるボタン」だけを出す。
// - 自分で ためした ドアは おぼえる(まちがい・上へのかいだん)。
// - 同じ階の ほかの子が ドアに入って どうなったか、watch の確率で 見ている(下へ行けた → そこへ / 出てきた → そこは ちがう)。
// - ヒントの印が 光ったら、hint の確率で 気づく。
// - わからないときは、まだ ためしていない ドアの うち 近いものへ(ときどき 気まぐれに 遠いほう)。
// - ドアの前に ついてから react 秒 まって あける。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, randRange, seedFrom } from '../../rng.js';
import { RULES, doorAt, hintOn } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', watch: 0.7, hint: 0.6, react: [0.3, 0.55], whim: 0.15, speed: 0.92 },
  normal: { label: 'ふつう', watch: 0.55, hint: 0.5, react: [0.25, 0.45], whim: 0.25, speed: 0.96 },
  bold: { label: 'つよき', watch: 0.35, hint: 0.35, react: [0.15, 0.3], whim: 0.35, speed: 1.0 },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:dasshutsu-cpu:${slot}`), floor: null, mem: {}, bad: new Set(), good: null, target: null, wait: null, seen: new Map(), hintSeen: false };
}

function choose(cpu, s, me, p) {
  const fl = s.floors[me.floor];
  if (cpu.good !== null) return cpu.good;
  const open = fl.doors.map((d, i) => i).filter((i) => !cpu.bad.has(i));
  if (!open.length) { cpu.bad.clear(); return Math.floor(nextRandom(cpu) * fl.doors.length); }
  open.sort((a, b) => Math.abs(fl.doors[a].x - me.x) - Math.abs(fl.doors[b].x - me.x));
  if (open.length > 1 && nextRandom(cpu) < p.whim) return open[1 + Math.floor(nextRandom(cpu) * (open.length - 1))];
  return open[0];
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play') return null;
  const me = s.runners[slot];
  if (me.done) return null;
  const p = PERSONALITIES[cpu.personality];
  // 階が かわったら、その階で おぼえていたことを 思い出す(上へ もどされても わすれない)
  if (cpu.floor !== me.floor) {
    if (cpu.floor !== null) cpu.mem[cpu.floor] = { bad: cpu.bad, good: cpu.good };
    cpu.floor = me.floor;
    const m = cpu.mem[me.floor];
    cpu.bad = m ? m.bad : new Set();
    cpu.good = m ? m.good : null;
    cpu.target = null;
    cpu.wait = null;
    cpu.seen.clear();
    cpu.hintSeen = false;
  }
  // ほかの子を 見る(1回の出入りにつき 1度だけ)
  s.runners.forEach((o, i) => {
    if (i === slot || o.floor !== me.floor || !o.act || o.act.kind === 'enter' || o.act.kind === 'daze') return;
    const key = `${i}:${o.act.kind}:${o.act.door}:${o.tries}`;
    if (cpu.seen.has(key)) return;
    cpu.seen.set(key, true);
    if (nextRandom(cpu) >= p.watch) return;
    if (o.act.kind === 'stair' || o.act.kind === 'slide') { cpu.good = o.act.door; cpu.target = null; }
    else cpu.bad.add(o.act.door);
  });
  // ヒントの印
  if (!cpu.hintSeen && hintOn(s, me.floor)) {
    cpu.hintSeen = true;
    if (nextRandom(cpu) < p.hint) {
      cpu.good = s.floors[me.floor].doors.findIndex((d) => d.kind === 'down');
      cpu.target = null;
    }
  }
  if (me.act) {
    // 自分の結果を おぼえる
    if (me.act.kind === 'inside' || me.act.kind === 'up') { cpu.bad.add(me.act.door); if (cpu.good === me.act.door) cpu.good = null; cpu.target = null; }
    return null;
  }
  if (cpu.target === null || cpu.bad.has(cpu.target)) { cpu.target = choose(cpu, s, me, p); cpu.wait = null; }
  const door = s.floors[me.floor].doors[cpu.target];
  const at = doorAt(s, me.floor, me.x, me.z) === cpu.target && Math.abs(me.x - door.x) < 0.25;
  if (at) {
    if (cpu.wait === null) cpu.wait = randRange(cpu, p.react[0], p.react[1]);
    cpu.wait -= 1 / 60;
    if (cpu.wait <= 0) { cpu.wait = null; return { x: null, z: null, open: true }; }
    return { x: door.x, z: 0.5, open: false };
  }
  // ちょっとだけ ゆっくり(speed)
  const tx = me.x + (door.x - me.x) * p.speed;
  return { x: Math.abs(door.x - me.x) < 0.3 ? door.x : tx, z: RULES.doorDepth * 0.5, open: false };
}
