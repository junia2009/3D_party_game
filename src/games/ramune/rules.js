// 夏祭りの ラムネ しゅわしゅわ のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 5人が それぞれ ラムネの びんを ふって、なかの あわを ためる。すきな ときに「ポン!」で ふたを とばす。
// ためた あわが 多いほど 高く とぶ。3回せんで、とんだ 高さの 合計が いちばん 高い 子の 勝ち。
// - ふる: スマホを ふる(加速度)。つかえない ときは 連打。ふる 強さ(0〜1)が「いきおい」に たまり、いきおいが あわに かわる。
//   ふるのを やめても、のこった いきおいの ぶん だけ あわは すこし ふえる(すぐには とまらない)。
// - げんかい: びんごとに ちがう(その回は みんな おなじ)。げんかいの 75% を こえると びんが がたがた ゆれる(合図)。
//   がたがたが はじまる ところも 回ごとに ちがう(げんかいの 62〜82%)。げんかいに ちかづくほど はげしく ゆれる。
//   げんかいを こえると ふきこぼれて その回は 0。
// - こおりが とける: ふって いない あいだ、あわは すこしずつ へって いく。
// - ポン: ボタン(画面を タップ)。時間ぎれで ポンして いなければ、自動で ポン。
// 順位: 合計の 高さ → いちばん 高かった 1回 → 席。
//
// inputs[slot]: { shake(0〜1 いまの ふる 強さ), pop(ポンを おした しゅんかん) } または null
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { randRange, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;

export const RULES = {
  rounds: 3,
  readyTime: 3.0, // さいしょの よーい
  prepTime: 1.6, // 回ごとの「びんを もって!」
  shakeTime: 8.5, // ふる 時間
  showTime: 3.2, // ふたが とんで いく ところを 見る
  gain: 34, // ふる 強さ 1 で 1秒に たまる いきおい
  flow: 4, // いきおいが あわに かわる はやさ(のこりの この ばい / 秒)
  melt: 3.5, // ふって いない ときに へる あわ(/秒)
  limit: [70, 100], // げんかい(あわ)
  rattle: [0.62, 0.82], // がたがたが はじまる ところ(げんかいの わりあい。回ごとに ちがう)
  meter: 0.32, // あわ 1 で とぶ 高さ(m)
};

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:ramune`),
    phase: 'ready', // ready → prep → shake → show →(prep …)→ finished
    round: -1,
    phaseT: RULES.readyTime,
    limits: [],
    rattleAt: [],
    winner: null,
  };
  for (let r = 0; r < RULES.rounds; r++) {
    s.limits.push(Math.round(randRange(s, RULES.limit[0], RULES.limit[1])));
    s.rattleAt.push(randRange(s, RULES.rattle[0], RULES.rattle[1]));
  }
  s.bottles = players.map(() => ({ fizz: 0, push: 0, popped: false, burst: false, height: 0, total: 0, best: 0, heights: [], rattle: false, popAt: null }));
  return s;
}

export const limitOf = (s) => s.limits[Math.max(0, s.round)];
// がたがたの 強さ(0 = まだ、1 = げんかい)
export function rattleK(s, b) {
  const ra = s.rattleAt[Math.max(0, s.round)];
  return Math.max(0, Math.min(1, (b.fizz / limitOf(s) - ra) / (1 - ra)));
}
export const timeLeft = (s) => (s.phase === 'shake' ? Math.max(0, s.phaseT) : 0);

function startRound(s, ev) {
  s.round++;
  s.phase = 'prep';
  s.phaseT = RULES.prepTime;
  for (const b of s.bottles) Object.assign(b, { fizz: 0, push: 0, popped: false, burst: false, height: 0, rattle: false, popAt: null });
  ev.push({ type: 'round', round: s.round });
}

function pop(s, slot, ev, auto = false) {
  const b = s.bottles[slot];
  if (b.popped || b.burst) return;
  b.popped = true;
  b.popAt = s.t;
  b.height = Math.round(b.fizz * RULES.meter * 10) / 10;
  b.total = Math.round((b.total + b.height) * 10) / 10;
  b.best = Math.max(b.best, b.height);
  b.heights.push(b.height);
  ev.push({ type: 'pop', slot, height: b.height, ratio: b.fizz / limitOf(s), auto });
}

export function step(s, inputs) {
  const ev = [];
  if (s.phase === 'finished') return ev;
  const dt = STEP;
  s.t += dt;
  s.phaseT -= dt;
  if (s.phase === 'ready' && s.phaseT <= 0) startRound(s, ev);
  else if (s.phase === 'prep' && s.phaseT <= 0) {
    s.phase = 'shake';
    s.phaseT = RULES.shakeTime;
    ev.push({ type: 'go', round: s.round });
  } else if (s.phase === 'shake') {
    const L = limitOf(s);
    s.bottles.forEach((b, slot) => {
      if (b.popped || b.burst) return;
      const inp = inputs[slot];
      const sh = Math.max(0, Math.min(1, inp?.shake || 0));
      b.push += sh * RULES.gain * dt;
      const flow = b.push * Math.min(1, RULES.flow * dt);
      b.push -= flow;
      b.fizz += flow;
      if (sh < 0.15) b.fizz = Math.max(0, b.fizz - RULES.melt * dt);
      const rattle = b.fizz >= L * s.rattleAt[s.round];
      if (rattle && !b.rattle) ev.push({ type: 'rattle', slot });
      b.rattle = rattle;
      if (b.fizz > L) {
        b.burst = true;
        b.height = 0;
        b.heights.push(0);
        ev.push({ type: 'burst', slot });
        return;
      }
      if (inp?.pop && b.fizz > 0) pop(s, slot, ev);
    });
    // みんな おわったか、時間ぎれ
    if (s.phaseT <= 0 || s.bottles.every((b) => b.popped || b.burst)) {
      s.bottles.forEach((b, slot) => { if (!b.popped && !b.burst) pop(s, slot, ev, true); });
      s.phase = 'show';
      s.phaseT = RULES.showTime;
      ev.push({ type: 'show', round: s.round, heights: s.bottles.map((b) => b.height) });
    }
  } else if (s.phase === 'show' && s.phaseT <= 0) {
    if (s.round + 1 >= RULES.rounds) {
      s.phase = 'finished';
      s.winner = ranking(s)[0];
      ev.push({ type: 'finished', winner: s.winner });
    } else startRound(s, ev);
  }
  return ev;
}

// 順位: 合計 → いちばん 高かった 1回 → 席
export function ranking(s) {
  return s.bottles.map((_, i) => i).sort((a, b) => {
    const A = s.bottles[a], B = s.bottles[b];
    return B.total - A.total || B.best - A.best || a - b;
  });
}
