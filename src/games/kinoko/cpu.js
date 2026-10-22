// 森の湖の いろいろキノコ の CPU。
//
// 人と同じく「スティックの 向き」と「ジャンプ」だけを出す。
// - 旗を まつ あいだ: どの キノコにも 近い まん中あたりで まつ(しんちょうほど まん中に こだわる)。
// - 旗が あがったら: 少し おくれて(react)気づいて、旗の 色の キノコの 中ほどへ 走る。
//   ときどき 色を まちがえて、となりの キノコへ 行きかける(miss)。
// - 旗の キノコで 近くに 相手が いたら、ジャンプして ヒップドロップで はじきとばす(aggro。つよきほど よく やる)。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, randRange, seedFrom } from '../../rng.js';
import { HEXES, RULES, inHex } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', react: [0.32, 0.58], miss: 0.05, home: 0.85, aggro: 0.25, aim: 0.35 },
  normal: { label: 'ふつう', react: [0.28, 0.52], miss: 0.06, home: 0.65, aggro: 0.45, aim: 0.4 },
  bold: { label: 'つよき', react: [0.25, 0.48], miss: 0.08, home: 0.45, aggro: 0.7, aim: 0.45 },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:kinoko-cpu:${slot}`), seen: null, at: 0, target: null, wrong: 0, wait: null, think: 0, attack: null };
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play') return null;
  const me = s.runners[slot];
  if (!me.alive) return null;
  const p = PERSONALITIES[cpu.personality];
  const dt = 1 / 60;
  const go = (t, jump = false) => {
    const dx = t.x - me.x, dz = t.z - me.z, d = Math.hypot(dx, dz);
    if (d < 0.12) return { x: 0, z: 0, jump };
    const m = Math.min(1, d / 0.5);
    return { x: (dx / d) * m, z: (dz / d) * m, jump };
  };
  // ヒップドロップの とちゅう: 相手の 上に 来たら 落ちる
  if (cpu.attack !== null && me.air) {
    const v = s.runners[cpu.attack];
    const near = v && Math.hypot(v.x - me.x, v.z - me.z) < 0.9;
    if (!me.dropping && me.vy < 1.5 && (near || me.vy < -1)) { cpu.attack = null; return { ...go(v || me), jump: true }; }
    return v ? go(v) : { x: 0, z: 0 };
  }
  if (!me.air) cpu.attack = null;

  // 旗が あがった: 少し おくれて 気づく
  if (s.flag !== null && cpu.seen !== s.round) {
    cpu.seen = s.round;
    cpu.at = s.t + randRange(cpu, p.react[0], p.react[1]);
    const h = HEXES[s.flag];
    const a = nextRandom(cpu) * Math.PI * 2, r = nextRandom(cpu) * RULES.hexR * p.aim;
    cpu.target = { x: h.x + Math.cos(a) * r, z: h.z + Math.sin(a) * r };
    // 色を まちがえる: となりの キノコへ 行きかける
    cpu.wrong = 0;
    if (nextRandom(cpu) < p.miss) {
      const others = HEXES.filter((x) => x.id !== s.flag);
      cpu.wrongTo = others[Math.floor(nextRandom(cpu) * others.length)];
      cpu.wrong = randRange(cpu, 0.25, 0.6);
    }
  }
  if (s.flag !== null && s.stage !== 'rise') {
    if (s.t < cpu.at) return { x: 0, z: 0 };
    if (cpu.wrong > 0) { cpu.wrong -= dt; return go(cpu.wrongTo); }
    const h = HEXES[s.flag];
    const onIt = inHex(h, me.x, me.z, 0.35);
    // 旗の キノコに ついて、近くに 相手が いたら ジャンプ → ヒップドロップ
    if (onIt && !me.air && (s.stage === 'signal' || s.stage === 'sink')) {
      for (let i = 0; i < s.runners.length; i++) {
        const o = s.runners[i];
        if (i === slot || !o.alive || o.air) continue;
        const d = Math.hypot(o.x - me.x, o.z - me.z);
        if (d < 1.3 && nextRandom(cpu) < p.aggro * dt * 3) { cpu.attack = i; return { ...go(o), jump: true }; }
      }
    }
    // 中ほどから ずれたら もどる
    if (onIt && Math.hypot(me.x - cpu.target.x, me.z - cpu.target.z) < 0.3) return { x: 0, z: 0 };
    return go(cpu.target);
  }
  // 旗を まつ あいだ: まん中あたり(ときどき 行き先を かえる)
  cpu.think -= dt;
  if (cpu.think <= 0 || !cpu.wait) {
    cpu.think = randRange(cpu, 0.8, 1.6);
    const center = nextRandom(cpu) < p.home;
    const a = nextRandom(cpu) * Math.PI * 2;
    const r = center ? nextRandom(cpu) * RULES.hexR * 0.7 : RULES.hexR * (0.9 + nextRandom(cpu) * 0.6);
    cpu.wait = { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }
  return go(cpu.wait);
}
