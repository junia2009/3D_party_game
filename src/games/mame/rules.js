// 空まで まめのきジャンプ のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 5人が それぞれ 自分の まめの木を のぼる。いま 乗っている 葉っぱの 上に、つぎの 葉っぱが 左か 右に 生える。
// 生えた ほうの ボタン(左 / 右)を おすと ぴょんと とびうつって 1まい 上へ。
// まちがえた ほうを おすと すべり落ちて 2まい 下へ、少し 動けない。
// 葉っぱの ならびは みんな 同じ(公平に)。アイテムは なし(反射神経だけの 勝負)。
// 40 秒で どれだけ 高く のぼれたか。同じ 高さなら 先に そこへ 着いた子が 上。
//
// inputs[slot]: { side: 'L' | 'R' | null }(ボタンを おした 瞬間だけ)か null。
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;

export const RULES = {
  readyTime: 3,
  timeLimit: 40,
  leaves: 600, // 葉っぱの 数(じゅうぶん 多く)
  jumpTime: 0.16, // とびうつる 時間(この あいだは おせない)
  fallBack: 2, // まちがえると 下がる まい数
  stunTime: 0.65, // まちがえたあと 動けない
};

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:mame`),
    phase: 'ready', // ready → play → finished
    leaves: [],
    winner: null,
    runners: players.map(() => ({ leaf: 0, jump: 0, stun: 0, reachedAt: 0, falls: 0, best: 0, from: 0 })),
  };
  // 葉っぱの ならび: 左右は くじ(同じ 側が 4まい より 長く つづかない)。0 まいめは 根もと
  let run = 0, prev = null;
  for (let i = 0; i < RULES.leaves; i++) {
    let side = nextRandom(s) < 0.5 ? 'L' : 'R';
    if (side === prev) run++; else run = 1;
    if (run > 4) { side = side === 'L' ? 'R' : 'L'; run = 1; }
    prev = side;
    s.leaves.push({ side });
  }
  return s;
}

export const playTime = (s) => Math.max(0, s.t - RULES.readyTime);
export const timeLeft = (s) => Math.max(0, RULES.timeLimit - playTime(s));
// つぎに おす ほう
export const nextSide = (s, r) => s.leaves[Math.min(RULES.leaves - 1, r.leaf + 1)].side;

export function step(s, inputs) {
  const ev = [];
  if (s.phase === 'finished') return ev;
  const dt = STEP;
  s.t += dt;
  if (s.phase === 'ready' && s.t >= RULES.readyTime) {
    s.phase = 'play';
    ev.push({ type: 'start' });
  }
  const play = s.phase === 'play';
  s.runners.forEach((r, slot) => {
    r.jump = Math.max(0, r.jump - dt);
    r.stun = Math.max(0, r.stun - dt);
    const side = play ? inputs[slot]?.side : null;
    if (!side || r.jump > 0 || r.stun > 0) return;
    const want = nextSide(s, r);
    r.from = r.leaf;
    if (side === want) {
      r.leaf = Math.min(RULES.leaves - 1, r.leaf + 1);
      r.jump = RULES.jumpTime;
      r.best = Math.max(r.best, r.leaf);
      r.reachedAt = s.t;
      ev.push({ type: 'jump', slot, leaf: r.leaf, side });
    } else {
      r.leaf = Math.max(0, r.leaf - RULES.fallBack);
      r.stun = RULES.stunTime;
      r.reachedAt = s.t;
      r.falls++;
      ev.push({ type: 'miss', slot, leaf: r.leaf, side });
    }
  });
  if (play && timeLeft(s) <= 0) {
    s.phase = 'finished';
    s.winner = ranking(s)[0];
    ev.push({ type: 'finished', winner: s.winner });
  }
  return ev;
}

// 順位: いまの 高さ → 先に その 高さへ 着いた順 → 席
export function ranking(s) {
  return s.runners.map((_, i) => i).sort((a, b) => {
    const A = s.runners[a], B = s.runners[b];
    return B.leaf - A.leaf || A.reachedAt - B.reachedAt || a - b;
  });
}
