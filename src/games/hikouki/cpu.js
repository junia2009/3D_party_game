// 森の谷まの かみひこうき の CPU。
//
// 人と同じく「かたむき(x, y)」だけを出す。つぎの わっかへ むかって かたむける。
// - 上昇気流の あとの 高い 金の わっかは、気流の まん中へ よって おこしつづける。
// - 前に じゃまもの(枝・鳥)が あれば、ぶつかりそうな ときに よける(よけそこねる ことも ある)。
// - よこかぜは、うまい 子ほど はやく こらえる。
// 性格: aim(ねらいの ずれ m)・lag(かたむきの おくれ)・avoid(よける 確率)・wind(よこかぜを こらえる うまさ)。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, seedFrom } from '../../rng.js';
import { RULES, birdX, branchSpan, branchY } from './rules.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', aim: 1.3, lag: 0.16, avoid: 0.8, wind: 0.75, gold: 0.6 },
  normal: { label: 'ふつう', aim: 1.45, lag: 0.14, avoid: 0.7, wind: 0.7, gold: 0.75 },
  bold: { label: 'つよき', aim: 1.6, lag: 0.12, avoid: 0.6, wind: 0.6, gold: 0.95 },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:hikouki-cpu:${slot}`), out: { x: 0, y: 0 }, plan: null };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play') return null;
  const p = s.planes[slot];
  const sk = PERSONALITIES[cpu.personality];
  const r = s.rings[p.next];
  // わっかごとに きめる こと(ねらいの ずれ・金を ねらうか・よけるか)
  const id = r ? r.id : -1;
  if (cpu.plan?.id !== id) {
    const rnd = () => nextRandom(cpu);
    cpu.plan = { id, ex: (rnd() - 0.5) * 2 * sk.aim, ey: (rnd() - 0.5) * 2 * sk.aim, gold: rnd() < sk.gold, avoid: rnd() < sk.avoid };
  }
  const plan = cpu.plan;
  let tx = 0, ty = 6, ts = p.s + 10;
  if (r) {
    tx = r.x + plan.ex * (r.gold ? 0.6 : 1);
    ty = r.y + plan.ey * (r.gold ? 0.6 : 1);
    ts = r.s;
    // 高い 金の わっか: その 前の 上昇気流の まん中で おこしつづける(ねらわないなら ふつうの 高さで)
    const lift = s.lifts.find((l) => l.s + l.len + 6 >= p.s && l.s - 12 <= p.s && r.s - (l.s + l.len) < 8);
    if (r.gold && r.y > 10) {
      if (!plan.gold) { ty = 7; }
      else if (lift && p.s < lift.s + lift.len) { tx = lift.x; ty = RULES.yMax; ts = Math.max(p.s + 3, lift.s + lift.len * 0.5); }
    }
  }
  const tArr = Math.max(0.35, (ts - p.s) / Math.max(4, p.v));
  // じゃまもの: 前 10 m いないで ぶつかりそうなら よける
  if (plan.avoid) {
    for (const br of s.branches) {
      const ds = br.s - p.s;
      if (ds <= 0 || ds > 10) continue;
      const tt = ds / p.v;
      const [a, b] = branchSpan(br);
      const xAt = p.x + p.vx * tt;
      const by = branchY(br, s.t + tt);
      if (xAt > a - 0.6 && xAt < b + 0.6 && Math.abs(p.y + p.vy * tt - by) < 1.4) {
        // 枝の ない ほうへ よけるか、上か 下へ
        if (Math.abs(ty - by) > 1.6) continue;
        ty = by + (p.y > by ? 1.8 : -1.8);
      }
    }
    for (const bd of s.birds) {
      const ds = bd.s - p.s;
      if (ds <= 0 || ds > 10) continue;
      const tt = ds / p.v;
      const bx = birdX(bd, s.t + tt);
      if (Math.hypot(p.x + p.vx * tt - bx, p.y - bd.y) < RULES.birdR + 0.8) ty = bd.y + (p.y > bd.y ? 2 : -2);
    }
  }
  // よこ: のこり 時間で とどく 速さ。よこかぜを こらえる
  const wantVx = (tx - p.x) / tArr - s.wind.x * sk.wind;
  let ix = clamp(wantVx / RULES.side, -1, 1);
  // 上下: のぞむ 上下の 速さ → かたむき
  const wantVy = (ty - p.y) / tArr;
  let iy = wantVy > -RULES.sink ? (wantVy + RULES.sink) / (RULES.climb + RULES.sink) : (wantVy + RULES.sink) / RULES.dive;
  iy = clamp(iy, -1, 1);
  // かたむきは すこし おくれて ついてくる(人の 手の ように)
  const k = Math.min(1, (1 / 60) / sk.lag);
  cpu.out.x += (ix - cpu.out.x) * k;
  cpu.out.y += (iy - cpu.out.y) * k;
  return { x: cpu.out.x, y: cpu.out.y };
}
