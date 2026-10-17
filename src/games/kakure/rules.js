// おぼえて かくれんぼ のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 夜の森の広場。ふせた かごが ならんでいて、リスが そのひとつに かくれる。かごが ぐるぐる いれかわったあと、
// 「リスは どこ?」で みんなが かごをえらぶ(タップ)。あたりは 3 点 + 早いもの順ボーナス(3・2・1)。
// - だんだんむずかしく: 回が進むと かごが ふえて、いれかわりが 多く 速くなる。
// - いたずらキツネ: 3回目から、キツネも べつの かごに かくれる。キツネの かごを えらぶと 1 点へる。
// - まっくら一瞬: 4回目から、いれかわりの とちゅうで ちょうちんが 一瞬 消える(そのあいだも いれかわる)。
// 5 回やって、点のいちばん多い子の勝ち。
//
// かご: id(かごそのもの)と slot(いまの置き場所)。いれかわりは「2つの置き場所の かごを入れかえる」の列。
// inputs[slot]: えらんだ置き場所の番号(0〜)か null。1回に1度だけ。
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;
export const TIMES_OF_DAY = ['night'];

// 回ごとの むずかしさ: かごの数・いれかわりの回数・1回の速さ(秒)・キツネ・まっくら
export const ROUNDS = [
  { n: 3, swaps: 4, dur: 0.55, fox: false, dark: false },
  { n: 4, swaps: 6, dur: 0.5, fox: false, dark: false },
  { n: 4, swaps: 7, dur: 0.44, fox: true, dark: false },
  { n: 5, swaps: 8, dur: 0.4, fox: true, dark: true },
  { n: 5, swaps: 10, dur: 0.36, fox: true, dark: true },
];

export const RULES = {
  introTime: 1.5,
  showTime: 2.0, // かくれるところを見せる
  gap: 0.6, // かくれてから いれかわりが はじまるまで
  askTime: 5.0, // えらぶ時間
  revealTime: 2.6, // こたえあわせ
  darkLen: 0.45, // まっくらの長さ
  hit: 3, // あたり
  bonus: [3, 2, 1], // はやいもの順
  foxPenalty: -1,
};

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:kakure`),
    phase: 'intro', // intro → show → shuffle → ask → reveal → (show …) → finished
    phaseT: 0,
    round: -1,
    baskets: [], // { id, slot }
    hider: 0, // リスの かご id
    fox: null, // キツネの かご id
    swaps: [], // { a, b(置き場所), t0(shuffle の何秒目), dur }
    shuffleLen: 0,
    dark: null, // { t0, len }(shuffle の何秒目)
    answers: players.map(() => null), // { slot, t(ask の何秒目), result: 'hit' | 'fox' | 'miss', gain }
    winner: null,
    runners: players.map(() => ({ score: 0, hits: 0, firsts: 0, foxes: 0, time: 0 })),
  };
  s.timeOfDay = TIMES_OF_DAY[0];
  return s;
}

export const roundInfo = (s) => ROUNDS[Math.max(0, s.round)];
// 置き場所 slot に いま ある かご
export const basketAt = (s, slot) => s.baskets.find((b) => b.slot === slot);

function startRound(s, ev) {
  s.round++;
  const R = ROUNDS[s.round];
  s.baskets = Array.from({ length: R.n }, (_, i) => ({ id: i, slot: i }));
  s.hider = Math.floor(nextRandom(s) * R.n);
  s.fox = null;
  if (R.fox) {
    s.fox = Math.floor(nextRandom(s) * (R.n - 1));
    if (s.fox >= s.hider) s.fox++;
  }
  // いれかわり: 同じ組が続かないように。リスの かごが よく動くように 半分は リスの かごを入れる
  s.swaps = [];
  let t = 0, last = '';
  for (let k = 0; k < R.swaps; k++) {
    let a, b;
    for (let tries = 0; tries < 10; tries++) {
      a = Math.floor(nextRandom(s) * R.n);
      b = Math.floor(nextRandom(s) * (R.n - 1));
      if (b >= a) b++;
      if (nextRandom(s) < 0.5) a = -1; // あとで リスの今の置き場所に する
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (key !== last && a !== b) { last = key; break; }
    }
    s.swaps.push({ a, b, t0: t, dur: R.dur });
    t += R.dur + 0.05;
  }
  s.shuffleLen = t;
  // リスの置き場所を追いかけて、a = -1 を うめる(きまった列にしておく)
  let hs = s.hider;
  for (const w of s.swaps) {
    if (w.a === -1) w.a = hs === w.b ? (w.b + 1) % R.n : hs;
    if (w.a === hs) hs = w.b; else if (w.b === hs) hs = w.a;
  }
  s.dark = R.dark ? { t0: (0.3 + nextRandom(s) * 0.4) * s.shuffleLen, len: RULES.darkLen } : null;
  s.answers = s.answers.map(() => null);
  s.phase = 'show';
  s.phaseT = 0;
  ev.push({ type: 'show', round: s.round, n: R.n, hider: s.hider, fox: s.fox });
}

export function step(s, inputs) {
  const ev = [];
  if (s.phase === 'finished') return ev;
  s.t += STEP;
  s.phaseT += STEP;
  if (s.phase === 'intro') {
    if (s.phaseT >= RULES.introTime) startRound(s, ev);
  } else if (s.phase === 'show') {
    if (s.phaseT >= RULES.showTime + RULES.gap) {
      s.phase = 'shuffle';
      s.phaseT = 0;
      s.nextSwap = 0;
      ev.push({ type: 'shuffle' });
    }
  } else if (s.phase === 'shuffle') {
    // いれかわりが おわった ものから、置き場所を入れかえる
    while (s.nextSwap < s.swaps.length && s.phaseT >= s.swaps[s.nextSwap].t0 + s.swaps[s.nextSwap].dur) {
      const w = s.swaps[s.nextSwap++];
      const A = basketAt(s, w.a), B = basketAt(s, w.b);
      A.slot = w.b;
      B.slot = w.a;
      ev.push({ type: 'swapped', a: w.a, b: w.b });
    }
    if (s.dark && !s.dark.on && s.phaseT >= s.dark.t0) { s.dark.on = true; ev.push({ type: 'dark' }); }
    if (s.dark && s.dark.on && !s.dark.off && s.phaseT >= s.dark.t0 + s.dark.len) { s.dark.off = true; ev.push({ type: 'light' }); }
    if (s.nextSwap >= s.swaps.length && s.phaseT >= s.shuffleLen + 0.2) {
      s.phase = 'ask';
      s.phaseT = 0;
      ev.push({ type: 'ask' });
    }
  } else if (s.phase === 'ask') {
    const n = roundInfo(s).n;
    inputs.forEach((pick, slot) => {
      if (pick === null || pick === undefined || s.answers[slot] || pick < 0 || pick >= n) return;
      s.answers[slot] = { slot: pick, t: s.phaseT };
      ev.push({ type: 'pick', slot, at: pick });
    });
    if (s.answers.every((a) => a) || s.phaseT >= RULES.askTime) reveal(s, ev);
  } else if (s.phase === 'reveal') {
    if (s.phaseT >= RULES.revealTime) {
      if (s.round + 1 >= ROUNDS.length) {
        s.phase = 'finished';
        s.winner = ranking(s)[0];
        ev.push({ type: 'finished', winner: s.winner });
      } else startRound(s, ev);
    }
  }
  return ev;
}

function reveal(s, ev) {
  const hiderSlot = s.baskets[s.hider].slot;
  const foxSlot = s.fox !== null ? s.baskets[s.fox].slot : null;
  // あたった子を 早い順に(同じなら 席の順)
  const hits = s.answers.map((a, i) => (a && a.slot === hiderSlot ? i : -1)).filter((i) => i >= 0)
    .sort((p, q) => s.answers[p].t - s.answers[q].t || p - q);
  s.answers.forEach((a, i) => {
    const r = s.runners[i];
    if (!a) return;
    r.time += a.t;
    if (a.slot === hiderSlot) {
      const rank = hits.indexOf(i);
      a.result = 'hit';
      a.gain = RULES.hit + (RULES.bonus[rank] ?? 0);
      r.hits++;
      if (rank === 0) r.firsts++;
    } else if (a.slot === foxSlot) {
      a.result = 'fox';
      a.gain = RULES.foxPenalty;
      r.foxes++;
    } else {
      a.result = 'miss';
      a.gain = 0;
    }
    r.score += a.gain;
  });
  s.phase = 'reveal';
  s.phaseT = 0;
  ev.push({ type: 'reveal', hiderSlot, foxSlot, answers: s.answers.map((a) => (a ? { ...a } : null)) });
}

// 順位: 点の多い順。同じなら あたりの数、それも同じなら こたえるのが 早かった(合計時間の少ない)順
export function ranking(s) {
  return s.runners.map((_, i) => i).sort((a, b) => {
    const A = s.runners[a], B = s.runners[b];
    return B.score - A.score || B.hits - A.hits || A.time - B.time || a - b;
  });
}
