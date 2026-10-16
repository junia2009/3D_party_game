// どんぐりつみ の CPU。人と同じく「いつタップするか」だけを出す。
//
// 1. 番が来たら、少し見てから(react)、山がいちばん安定する x(よゆうがいちばん大きいところ)をさがす。
//    ただし、さがし方は性格でちがう(しんちょうは よく見る、つよきは だいたいで)。
// 2. ゆれているものが、その x を通るときを読んで、タップする。人と同じくらいタイミングがずれる(err 秒)。
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, randRange, seedFrom } from '../../rng.js';
import { KINDS, swingX, tryPlace } from './rules.js';

export const PERSONALITIES = {
  // react: 見はじめるまで(秒)/ err: タップのずれ(秒、標準偏差くらい)/ aim: ねらいの細かさ(0〜1)/ wait: 何回ゆれを見送ってもよいか
  cautious: { label: 'しんちょう', react: [0.6, 0.9], err: 0.06, aim: 0.95, wait: 2 },
  normal: { label: 'ふつう', react: [0.45, 0.75], err: 0.07, aim: 0.8, wait: 1 },
  bold: { label: 'つよき', react: [0.3, 0.55], err: 0.08, aim: 0.6, wait: 0 },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:tsumi-cpu:${slot}`), plan: null, turn: -1 };
}

function gauss(cpu) {
  return (nextRandom(cpu) + nextRandom(cpu) + nextRandom(cpu) - 1.5) / 0.5;
}

// いちばん安定する x(よゆう margin がいちばん大きい)。aim が小さいと、だいたいで決める
function bestX(s, kind, aim, cpu) {
  let best = 0, bestM = -Infinity;
  const top = s.stack[s.stack.length - 1];
  const cx = top ? top.x : 0;
  for (let dx = -1.2; dx <= 1.2; dx += 0.04) {
    const r = tryPlace(s.stack, kind, cx + dx);
    if (r.miss) continue;
    if (r.margin > bestM) { bestM = r.margin; best = cx + dx; }
  }
  // 雑なねらい: ちょうどいい所から少しずれる
  return best + gauss(cpu) * (1 - aim) * 0.12 * KINDS[kind].w;
}

export function cpuInput(cpu, s, slot) {
  if (s.phase !== 'play' || s.cur !== slot || s.stage !== 'aim') return null;
  const p = PERSONALITIES[cpu.personality];
  if (cpu.turn !== s.turn) {
    cpu.turn = s.turn;
    const target = bestX(s, s.piece.kind, p.aim, cpu);
    // ゆれが target を通るとき(react のあと、何回めかに通るとき)を、先まで見て決める
    const from = randRange(cpu, p.react[0], p.react[1]);
    const passes = [];
    let prev = swingX(s, from);
    for (let t = from + 1 / 60; t < 6.5 && passes.length < 4; t += 1 / 60) {
      const x = swingX(s, t);
      if ((prev - target) * (x - target) <= 0) passes.push(t);
      prev = x;
    }
    // ゆれのはばの外なら、いちばん近づくとき(はし)をねらう
    let at = passes.length ? passes[Math.min(passes.length - 1, Math.floor(nextRandom(cpu) * (p.wait + 1)))] : from + Math.PI / (2 * s.swing.w);
    at += gauss(cpu) * p.err;
    cpu.plan = Math.max(from, at);
  }
  return s.stageT >= cpu.plan ? { drop: true } : null;
}
