// 森の いせきの どんぐり めいろ の CPU。
//
// 人と同じく「うごく 向き」だけを出す。見て いるのは めいろ(かべ・うごく かべ・じゃんぷ ゆか)と どんぐり・たからばこ・おばけ。
// - ときどき(think 秒ごと)みちを さがしなおす: いまの ますから めいろを たどって、
//   「ねうち ÷ きょり」が いちばん よい どんぐりか たからばこを ねらう。おばけの ちかくは とおりたくない(fear)。
// - ねらいが きまったら みちの つぎの ますの まんなかへ むかう。手は すこし ぶれる。
// - ときどき まよう(stray: ちかくの てきとうな ところを ねらう)。
// - たからばこは でた しゅんかんには きづかない(人と おなじ)。ちかく(道のりで sight ます いない)に くるか、
//   でてから notice 秒 たってから(音や まわりの ようすで)きづく。
// 性格: think・fear・chest(たからばこを どれだけ ほしがるか)・stray・wobble・notice。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, seedFrom } from '../../rng.js';
import { RULES, cellOf, neighbors } from './rules.js';

const SIGHT = 6; // これより ちかい たからばこには すぐ きづく(道のりの ます)

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', think: 0.45, fear: 6, chest: 1.0, stray: 0.12, wobble: 0.25, notice: [3, 6] },
  normal: { label: 'ふつう', think: 0.4, fear: 3, chest: 1.3, stray: 0.1, wobble: 0.22, notice: [2.5, 5] },
  bold: { label: 'つよき', think: 0.35, fear: 1, chest: 1.8, stray: 0.1, wobble: 0.2, notice: [2, 4.5] },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:meiro-cpu:${slot}`), path: null, next: 0, noticeAt: {} };
}

// めいろを たどる(きょりの 近い ほうから)。おばけの ちかくは 遠まわりに かぞえる
function search(s, sx, sy, fear) {
  const n = RULES.size;
  const dist = new Float32Array(n * n).fill(Infinity);
  const prev = new Int32Array(n * n).fill(-1);
  const open = [[0, sx, sy]];
  dist[sy * n + sx] = 0;
  const near = (x, y) => s.ghosts.some((g) => Math.abs(cellOf(g.x) - x) + Math.abs(cellOf(g.y) - y) <= 1);
  while (open.length) {
    // ちいさな 盤なので、いちばん ちかい ものを さがすだけで じゅうぶん
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [d, x, y] = open.splice(bi, 1)[0];
    if (d > dist[y * n + x]) continue;
    for (const [nx, ny, c] of neighbors(s, x, y)) {
      const nd = d + c + (near(nx, ny) ? fear : 0);
      if (nd < dist[ny * n + nx]) { dist[ny * n + nx] = nd; prev[ny * n + nx] = y * n + x; open.push([nd, nx, ny]); }
    }
  }
  return { dist, prev };
}

function plan(cpu, s, slot) {
  const sk = PERSONALITIES[cpu.personality];
  const p = s.players[slot];
  const n = RULES.size;
  const sx = cellOf(p.x), sy = cellOf(p.y);
  const { dist, prev } = search(s, sx, sy, sk.fear);
  let best = null, bs = -Infinity;
  const stray = nextRandom(cpu) < sk.stray;
  for (const it of s.items) {
    const d = dist[it.y * n + it.x];
    if (!isFinite(d)) continue;
    if (it.kind === 'chest') {
      // まだ きづいて いない たからばこは ねらわない
      if (cpu.noticeAt[it.id] === undefined) cpu.noticeAt[it.id] = it.born + sk.notice[0] + nextRandom(cpu) * (sk.notice[1] - sk.notice[0]);
      if (d > SIGHT && s.t < cpu.noticeAt[it.id]) continue;
    }
    // ほかの 子の ほうが ずっと ちかい ものは あとまわし
    const rival = s.players.some((q, i) => i !== slot && Math.abs(cellOf(q.x) - it.x) + Math.abs(cellOf(q.y) - it.y) < d * 0.5);
    const v = (it.kind === 'chest' ? RULES.chestValue * sk.chest : 1) / (d + 1) * (rival ? 0.5 : 1) * (stray ? nextRandom(cpu) : 1);
    if (v > bs) { bs = v; best = it; }
  }
  if (!best) return null;
  // みちを もどって ならべる
  const path = [];
  let k = best.y * n + best.x;
  while (k !== -1 && k !== sy * n + sx) { path.unshift([k % n, Math.floor(k / n)]); k = prev[k]; }
  return path;
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play') return null;
  const sk = PERSONALITIES[cpu.personality];
  const p = s.players[slot];
  if (p.jump || p.stun > 0) return { x: 0, y: 0 };
  if (s.t >= cpu.next || !cpu.path || !cpu.path.length) {
    cpu.path = plan(cpu, s, slot);
    cpu.next = s.t + sk.think * (0.7 + nextRandom(cpu) * 0.6);
  }
  if (!cpu.path || !cpu.path.length) return { x: 0, y: 0 };
  // ついた ますは とばす
  while (cpu.path.length && cellOf(p.x) === cpu.path[0][0] && cellOf(p.y) === cpu.path[0][1] && Math.hypot(p.x - cpu.path[0][0] - 0.5, p.y - cpu.path[0][1] - 0.5) < 0.25) cpu.path.shift();
  if (!cpu.path.length) return { x: 0, y: 0 };
  const [tx, ty] = cpu.path[0];
  let dx = tx + 0.5 - p.x, dy = ty + 0.5 - p.y;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d; dy /= d;
  const w = (nextRandom(cpu) - 0.5) * sk.wobble;
  return { x: dx - dy * w, y: dy + dx * w };
}
