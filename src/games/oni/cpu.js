// 夕ぐれの 森の 広場の おにごっこ の CPU。
//
// 人と同じく「スティックの 向き」と「ダッシュ」だけを出す。react 秒ごとに 考えなおす。
// - 鬼のとき: いちばん つかまえやすい 子(近い・ふちに おいつめた)を おいかける。すこし 先を よんで 走る。
//   草むらに かくれた 子は、見つかる(rules の spotted)まで 見えない。とどきそうなら ダッシュ。
// - にげるとき: 鬼が 遠ければ 金の どんぐりを ひろいに いく・草むらで 休む。
//   近ければ 鬼から はなれる 向きへ(ふちに おいつめられない ように、ふちでは 横へ にげる)。
//   鬼が すぐ そばに 来たら ダッシュ。
// - 木・切り株は よけて 走る。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, randRange, seedFrom } from '../../rng.js';
import { BLOCKS, BUSHES, RULES, inBush } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', react: [0.2, 0.3], aim: 0.26, safe: 5.6, greed: 0.45, bush: 0.5, dashAt: 1.7, chaseDash: 1.9 },
  normal: { label: 'ふつう', react: [0.2, 0.3], aim: 0.26, safe: 5.0, greed: 0.6, bush: 0.4, dashAt: 1.65, chaseDash: 1.9 },
  bold: { label: 'つよき', react: [0.2, 0.3], aim: 0.26, safe: 4.4, greed: 0.7, bush: 0.25, dashAt: 1.6, chaseDash: 2.0 },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:oni-cpu:${slot}`), think: 0, dir: null, dash: false, goal: null };
}

const norm = (x, z) => { const d = Math.hypot(x, z) || 1; return { x: x / d, z: z / d }; };

// 向き (dx, dz) へ 走るとき、前に ある 木・切り株を よける
function avoid(me, d) {
  let { x, z } = d;
  for (const b of BLOCKS) {
    const rx = b.x - me.x, rz = b.z - me.z;
    const along = rx * x + rz * z;
    if (along <= 0 || along > 2.2 + b.r) continue;
    const side = rx * z - rz * x; // + なら 右に ある
    const gap = Math.abs(side) - b.r - RULES.bodyR;
    if (gap > 0.35) continue;
    const push = (0.35 - gap) / (0.35 + b.r) + 0.4;
    // よこへ(ものと はんたいがわへ)
    // 右(side > 0)に ある ものは 左へ、左に ある ものは 右へ。(d.z, -d.x) が 右むき
    const s = side >= 0 ? -1 : 1;
    x += d.z * s * push * 1.4;
    z += -d.x * s * push * 1.4;
  }
  // ふちの 近くでは 内がわへ すこし まげる
  const r = Math.hypot(me.x, me.z);
  if (r > RULES.fieldR - 1.4) {
    const k = (r - (RULES.fieldR - 1.4)) / 1.4;
    const out = (me.x * x + me.z * z) / r;
    if (out > 0) { x -= (me.x / r) * out * k * 1.5; z -= (me.z / r) * out * k * 1.5; }
  }
  return norm(x, z);
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play') return null;
  const me = s.runners[slot];
  if (me.freeze > 0) return null;
  const p = PERSONALITIES[cpu.personality];
  cpu.think -= 1 / 60;
  if (cpu.dash) { cpu.dash = false; return { ...cpu.dir, dash: false }; }
  if (cpu.think > 0 && cpu.dir) return { ...cpu.dir, dash: false };
  cpu.think = randRange(cpu, p.react[0], p.react[1]);
  const jit = () => randRange(cpu, -p.aim, p.aim);
  const go = (dx, dz, dash = false) => {
    const a = Math.atan2(dx, dz) + jit() * 0.5;
    cpu.dir = avoid(me, { x: Math.sin(a), z: Math.cos(a) });
    if (dash && me.cool <= 0) { cpu.dash = true; return { ...cpu.dir, dash: true }; }
    return { ...cpu.dir, dash: false };
  };

  // ── 鬼 ──
  if (slot === s.oni) {
    let best = -1, bs = -Infinity;
    s.runners.forEach((r, i) => {
      if (i === slot || i === me.noTag) return;
      const d = Math.hypot(r.x - me.x, r.z - me.z);
      if (r.hidden && !r.spotted) return; // かくれて いて 見えない
      const edge = Math.hypot(r.x, r.z) / RULES.fieldR; // ふちに いる 子は つかまえやすい
      const score = -d + edge * 1.6 - (r.dash > 0 ? 1 : 0) + nextRandom(cpu) * 0.8 + (i === cpu.goal ? 0.8 : 0);
      if (score > bs) { bs = score; best = i; }
    });
    if (best < 0) {
      // だれも 見えない: 草むらを のぞきに いく
      const b = BUSHES[Math.floor(nextRandom(cpu) * BUSHES.length)];
      return go(b.x - me.x, b.z - me.z);
    }
    cpu.goal = best;
    const v = s.runners[best];
    const d = Math.hypot(v.x - me.x, v.z - me.z);
    const lead = Math.min(0.7, d / 6);
    return go(v.x + v.vx * lead - me.x, v.z + v.vz * lead - me.z, d < p.chaseDash && d > RULES.tagR * 0.8);
  }

  // ── にげる ──
  const o = s.runners[s.oni];
  const dx = me.x - o.x, dz = me.z - o.z, dO = Math.hypot(dx, dz);
  const iAmTarget = o.noTag !== slot;
  if (!iAmTarget || dO > p.safe || o.freeze > 0.4) {
    // 金の どんぐり: 自分の ほうが 鬼より ずっと 近ければ
    let ac = null, ad = Infinity;
    for (const a of s.acorns) {
      const d = Math.hypot(a.x - me.x, a.z - me.z), dOni = Math.hypot(a.x - o.x, a.z - o.z);
      if (d < ad && d < dOni * (0.5 + p.greed * 0.6)) { ad = d; ac = a; }
    }
    if (ac && nextRandom(cpu) < 0.6 + p.greed * 0.4) return go(ac.x - me.x, ac.z - me.z);
    // 草むらで 休む
    if (inBush(me.x, me.z) && nextRandom(cpu) < p.bush) { cpu.dir = { x: 0, z: 0 }; return { x: 0, z: 0, dash: false }; }
    if (nextRandom(cpu) < p.bush * 0.5) {
      let bb = null, bd = Infinity;
      for (const b of BUSHES) {
        const d = Math.hypot(b.x - me.x, b.z - me.z), dOni = Math.hypot(b.x - o.x, b.z - o.z);
        if (dOni > 3.5 && d < bd) { bd = d; bb = b; }
      }
      if (bb) return go(bb.x - me.x, bb.z - me.z);
    }
    // 鬼から はなれた 広い ところへ ゆっくり
    if (dO > p.safe + 1.5) { cpu.dir = { x: 0, z: 0 }; return { x: 0, z: 0, dash: false }; }
  }
  // 鬼から はなれる。ふちでは 横へ(おいつめられない ように まわりこむ)
  let ex = dx / (dO || 1), ez = dz / (dO || 1);
  const r = Math.hypot(me.x, me.z);
  if (r > RULES.fieldR * 0.55) {
    const out = (me.x * ex + me.z * ez) / r;
    if (out > 0) {
      // 外向きの ぶんを へらして、鬼の いない がわの 横へ
      const tx = -me.z / r, tz = me.x / r;
      const side = tx * dx + tz * dz >= 0 ? 1 : -1;
      const k = Math.min(1, (r - RULES.fieldR * 0.55) / (RULES.fieldR * 0.35));
      ex = ex * (1 - k) + tx * side * k * 1.2 - (me.x / r) * out * k * 0.6;
      ez = ez * (1 - k) + tz * side * k * 1.2 - (me.z / r) * out * k * 0.6;
    }
  }
  const close = dO < p.dashAt && iAmTarget && o.freeze <= 0;
  return go(ex, ez, close);
}
