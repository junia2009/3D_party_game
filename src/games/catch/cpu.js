// どんぐりキャッチ の CPU。
//
// 人間が見ているのと同じもの(ゆれている枝・地面の影・地面のどんぐり・ほかの子の位置)だけを見て、
// 「どこへ向かうか」を決める。そして、人間と同じくらいにまちがえる:
// - 影が出ても、気づくまでに少しかかる(notice)
// - 落ちる場所を少し見まちがえる。落ちてくるにつれて、だんだん正しくなる(guess)
// - 遠くのものは追わない(reachMax)
// - 考えなおすのにも間がある(react)
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, randRange, seedFrom } from '../../rng.js';
import { ARENA_R, ITEMS, RULES, isHazard } from './rules.js';

export const PERSONALITIES = {
  // notice: 影に気づくまで(秒)/ guess: 落ちる場所の見まちがい(m)/ reachMax: 追いかける遠さ(m)
  // react: 考えなおす間隔(秒)/ fear: じゃまものをよける確率 / greed: 金どんぐりへの食いつき / bully: 体当たりの気の強さ
  cautious: { label: 'しんちょう', notice: [0.55, 0.8], guess: 0.6, reachMax: 3.4, react: [0.45, 0.6], fear: 0.9, greed: 1.0, bully: 0 },
  normal: { label: 'ふつう', notice: [0.45, 0.7], guess: 0.65, reachMax: 3.8, react: [0.4, 0.55], fear: 0.65, greed: 1.4, bully: 0.05 },
  bold: { label: 'つよき', notice: [0.38, 0.62], guess: 0.8, reachMax: 4.2, react: [0.35, 0.5], fear: 0.35, greed: 2.0, bully: 0.22 },
};

export function createCpu(personality, seed, slot) {
  return {
    personality,
    rng: seedFrom(`${seed}:cpu:${slot}`),
    think: 0,
    target: null,
    seen: new Map(), // 落ちてくるものごとの見え方 { notice, dx, dz, fear }(1回だけ決める)
  };
}

const reach = (r, x, z) => Math.hypot(x - r.x, z - r.z) / (RULES.maxSpeed * 0.9);

// その子に、落ちてくるものがどう見えているか
function view(cpu, p, it) {
  let v = cpu.seen.get(it.id);
  if (!v) {
    const a = nextRandom(cpu) * Math.PI * 2, d = Math.sqrt(nextRandom(cpu)) * p.guess;
    v = { notice: randRange(cpu, p.notice[0], p.notice[1]), dx: Math.cos(a) * d, dz: Math.sin(a) * d, fear: nextRandom(cpu) < p.fear };
    cpu.seen.set(it.id, v);
  }
  return v;
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play') return null;
  const p = PERSONALITIES[cpu.personality];
  const me = s.runners[slot];
  if (me.stun > 0) return null;

  // じゃまものがもうすぐ自分の上に落ちてくるなら、まずよける(気づいていれば)
  for (const it of s.items) {
    if (it.ground !== null || !isHazard(it.kind) || it.left > 0.7) continue;
    const v = view(cpu, p, it);
    if (!v.fear || RULES.fallTime - it.left < v.notice) continue;
    const dx = me.x - it.x, dz = me.z - it.z, d = Math.hypot(dx, dz);
    if (d < RULES.catchR + 0.3) {
      const away = d > 0.01 ? [dx / d, dz / d] : [1, 0];
      cpu.target = { x: me.x + away[0] * 1.4, z: me.z + away[1] * 1.4 };
      cpu.think = 0.3;
      return clampTarget(cpu.target);
    }
  }

  cpu.think -= 1 / 60;
  if (cpu.think > 0 && cpu.target) return clampTarget(avoid(cpu.target, s, slot));
  cpu.think = randRange(cpu, p.react[0], p.react[1]);

  let best = null, bestScore = 0;
  const consider = (x, z, value, until) => {
    const dist = Math.hypot(x - me.x, z - me.z);
    if (dist > p.reachMax) return; // 遠すぎるものは追わない
    const t = reach(me, x, z);
    if (until !== null && t > until + 0.1) return; // 間にあわない
    let rival = Infinity;
    s.runners.forEach((o, i) => { if (i !== slot && o.stun <= 0) rival = Math.min(rival, reach(o, x, z)); });
    if (rival < 0.18 && t > rival + 0.2) return; // もうだれかが真下で待っている(つっこむと体当たりになる)
    const contest = rival + 0.25 < t ? 0.35 : 1;
    const score = (value * contest) / (0.4 + t);
    if (score > bestScore) { bestScore = score; best = { x, z }; }
  };
  for (const it of s.items) {
    if (isHazard(it.kind)) continue;
    const value = it.kind === 'gold' ? ITEMS.gold.value * p.greed / 2 : 1;
    if (it.ground !== null) { consider(it.x, it.z, value * 0.9, it.ground); continue; }
    const v = view(cpu, p, it);
    if (RULES.fallTime - it.left < v.notice) continue; // まだ気づいていない
    // 見まちがいは、落ちてくるにつれて小さくなる
    const k = Math.min(1, it.left / RULES.fallTime);
    consider(it.x + v.dx * k, it.z + v.dz * k, value, it.left);
  }
  // ゆれている枝の下へ先回り(近いときだけ)
  for (const sh of s.shakes) {
    if (Math.hypot(sh.x - me.x, sh.z - me.z) < 3) consider(sh.x, sh.z, 0.45 * sh.count / 3, null);
  }
  // かごのいっぱいな子に体当たり(気の強い子だけ)
  if (p.bully > 0 && nextRandom(cpu) < p.bully) {
    s.runners.forEach((o, i) => {
      if (i === slot || o.acorns < 3 || o.stun > 0) return;
      consider(o.x + o.vx * 0.3, o.z + o.vz * 0.3, Math.min(RULES.spill, o.acorns) * 0.5, null);
      if (best && best.x === o.x + o.vx * 0.3) best = { ...best, bump: true };
    });
  }
  if (!best) {
    // 何もなければ、広場のまん中寄りでぶらぶら待つ
    best = cpu.target && Math.hypot(cpu.target.x, cpu.target.z) < 2.5 ? cpu.target : { x: randRange(cpu, -2, 2), z: randRange(cpu, -2, 2) };
  }
  cpu.target = best;
  if (cpu.seen.size > 60) cpu.seen.clear();
  return clampTarget(avoid(cpu.target, s, slot));
}

// 進む先にほかの子がいたら、横へよけて走る(体当たりしにいくとき以外)。毎フレーム見る
function avoid(t, s, slot) {
  if (t.bump) return t;
  const me = s.runners[slot];
  let dx = t.x - me.x, dz = t.z - me.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return t;
  dx /= d; dz /= d;
  let ox = 0, oz = 0;
  for (let i = 0; i < s.runners.length; i++) {
    if (i === slot) continue;
    const o = s.runners[i];
    const rx = o.x - me.x, rz = o.z - me.z, along = rx * dx + rz * dz;
    if (along < 0 || along > Math.min(d, 2)) continue; // うしろや、行き先より先の子は気にしない
    const side = rx * -dz + rz * dx; // 進む向きの左右どちらにいるか
    if (Math.abs(side) > 0.9) continue;
    const push = (0.9 - Math.abs(side)) * (side >= 0 ? -1 : 1);
    ox += -dz * push;
    oz += dx * push;
  }
  if (!ox && !oz) return t;
  return { x: me.x + dx * Math.min(d, 1.5) + ox * 1.4, z: me.z + dz * Math.min(d, 1.5) + oz * 1.4 };
}

function clampTarget(t) {
  const d = Math.hypot(t.x, t.z), max = ARENA_R - RULES.bodyR;
  return d <= max ? t : { x: (t.x / d) * max, z: (t.z / d) * max };
}
