// どんぐりキャッチ の CPU。
//
// 人間が見ているのと同じもの(ゆれている枝・地面の影・地面のどんぐり・ほかの子の位置)だけを見て、
// 「どこへ向かうか」を決める。人間と同じように、気づいて動きだすまでに少し間がある。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, randRange, seedFrom } from '../../rng.js';
import { ARENA_R, ITEMS, RULES, isHazard } from './rules.js';

export const PERSONALITIES = {
  // react: 考えなおす間隔(秒)/ fear: 毛虫やまつぼっくりをよける確率 / greed: 金どんぐりへの食いつき
  // bully: かごのいっぱいな子に体当たりしにいく気の強さ / aim: ねらう場所のずれ(m)
  cautious: { label: 'しんちょう', react: [0.28, 0.42], fear: 0.95, greed: 1.0, bully: 0, aim: 0.25 },
  normal: { label: 'ふつう', react: [0.2, 0.34], fear: 0.7, greed: 1.4, bully: 0.15, aim: 0.3 },
  bold: { label: 'つよき', react: [0.14, 0.26], fear: 0.35, greed: 2.0, bully: 0.5, aim: 0.38 },
};

export function createCpu(personality, seed, slot) {
  return {
    personality,
    rng: seedFrom(`${seed}:cpu:${slot}`),
    think: 0,
    target: null,
    fear: new Map(), // 落ちてくるじゃまものごとに、よけるかどうか(1回だけ決める)
  };
}

const reach = (r, x, z) => Math.hypot(x - r.x, z - r.z) / (RULES.maxSpeed * 0.92);

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play') return null;
  const p = PERSONALITIES[cpu.personality];
  const me = s.runners[slot];
  if (me.stun > 0) return null;

  // じゃまものがもうすぐ自分の上に落ちてくるなら、まずよける(考えなおしを待たない)
  for (const it of s.items) {
    if (it.ground !== null || !isHazard(it.kind) || it.left > 0.75) continue;
    if (!cpu.fear.has(it.id)) cpu.fear.set(it.id, nextRandom(cpu) < p.fear);
    if (!cpu.fear.get(it.id)) continue;
    const dx = me.x - it.x, dz = me.z - it.z, d = Math.hypot(dx, dz);
    if (d < RULES.catchR + 0.35) {
      const away = d > 0.01 ? [dx / d, dz / d] : [1, 0];
      cpu.target = { x: me.x + away[0] * 1.4, z: me.z + away[1] * 1.4 };
      cpu.think = 0.25;
      return clampTarget(cpu.target);
    }
  }

  cpu.think -= 1 / 60;
  if (cpu.think > 0 && cpu.target) return clampTarget(cpu.target);
  cpu.think = randRange(cpu, p.react[0], p.react[1]);

  let best = null, bestScore = 0;
  const consider = (x, z, value, until) => {
    const t = reach(me, x, z);
    if (until !== null && t > until + 0.1) return; // 間にあわない
    // ほかの子のほうがずっと早く着くなら、あまりねらわない
    let rival = Infinity;
    s.runners.forEach((o, i) => { if (i !== slot && o.stun <= 0) rival = Math.min(rival, reach(o, x, z)); });
    const contest = rival + 0.25 < t ? 0.35 : 1;
    const score = (value * contest) / (0.4 + t);
    if (score > bestScore) { bestScore = score; best = { x, z }; }
  };
  for (const it of s.items) {
    if (isHazard(it.kind)) continue;
    const value = it.kind === 'gold' ? ITEMS.gold.value * p.greed / 2 : 1;
    if (it.ground === null) consider(it.x, it.z, value, it.left);
    else consider(it.x, it.z, value * 0.9, it.ground);
  }
  // まだ影が出ていない、ゆれている枝の下へ先回り
  for (const sh of s.shakes) consider(sh.x, sh.z, 0.55 * sh.count / 4, null);
  // かごのいっぱいな子に体当たり(気の強い子だけ)
  if (p.bully > 0 && nextRandom(cpu) < p.bully) {
    s.runners.forEach((o, i) => {
      if (i === slot || o.acorns < 3 || o.stun > 0) return;
      consider(o.x + o.vx * 0.3, o.z + o.vz * 0.3, Math.min(RULES.spill, o.acorns) * 0.6, null);
    });
  }
  if (!best) {
    // 何もなければ、広場のまん中寄りでぶらぶら待つ
    best = cpu.target && Math.hypot(cpu.target.x, cpu.target.z) < 2.5 ? cpu.target : { x: randRange(cpu, -1.8, 1.8), z: randRange(cpu, -1.8, 1.8) };
  }
  cpu.target = { x: best.x + randRange(cpu, -p.aim, p.aim), z: best.z + randRange(cpu, -p.aim, p.aim) };
  // 古い じゃまもの の記憶をすてる
  if (cpu.fear.size > 40) cpu.fear.clear();
  return clampTarget(cpu.target);
}

function clampTarget(t) {
  const d = Math.hypot(t.x, t.z), max = ARENA_R - RULES.bodyR;
  return d <= max ? t : { x: (t.x / d) * max, z: (t.z / d) * max };
}
