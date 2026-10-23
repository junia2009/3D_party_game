// 秋の森の わたあめ まき のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 5人が それぞれ わりばしを ぐるぐる 回して、わたあめを まく。時間ぎれの ときに いちばん 大きい 子の 勝ち。
// - 回す: スマホを 円を かくように 回す(または 画面を 指で ぐるぐる)。回す はやさ(回/秒)が 入力。
// - ちょうどいい はやさ: その あいだで 回すと よく まける。おそいと あまり まけない。
//   わたあめが 大きく なるほど 重く なって、ちょうどいい はやさは だんだん おそく なる。
// - はやすぎると ちぎれる: ちょうどいいより はやいと すこし よけいに まけるが、糸が ぴんと はる(はり)。
//   はりが いっぱいに なると ちぎれて、わたあめが へる(しばらく まけない)。ゆっくりに すると はりは もどる。
// - 色の ざらめ: とちゅうで 3回 チャンス。わが ちぢんで ぴったり かさなった ときに おすと ボーナス(色の しまが つく)。
//   回して いないと つかない。
// 順位: 大きさ → ちぎれた 回数(少ないほう) → 席。
//
// inputs[slot]: { spin(回/秒), zarame(おした しゅんかん) } または null
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { randRange, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;

export const RULES = {
  readyTime: 3.0,
  spinTime: 30, // 回す 時間
  showTime: 3.5, // さいごに みんなの わたあめを 見る
  follow: 6, // わりばしの 回る はやさが 入力に ついていく はやさ
  hi: 2.4, // ちょうどいい はやさの 上(わたあめ 0 cm の とき。回/秒)
  hiDrop: 0.018, // 1 cm ごとに 上が おそく なる
  hiMin: 1.3,
  band: 0.6, // ちょうどいい はばの ひろさ
  minSpin: 0.3, // これより おそいと まけない
  grow: 1.5, // ちょうどいい ときに 1秒で ふえる 大きさ(cm)
  greed: 1.0, // はやすぎる ときの おまけ(いちばん 多くて)
  strain: 2.2, // はやすぎ 1回/秒 あたりの はりの たまりかた(/秒)
  relax: 0.6, // はりの もどりかた(/秒)
  tearLoss: 0.3, // ちぎれると へる わりあい
  stun: 1.0, // ちぎれた あと まけない 秒
  chances: [[6, 10], [14, 18], [22, 26]], // ざらめ チャンスが はじまる ころ(回しはじめから 秒)
  ring: 2.0, // わが ちぢむ 時間(さいごが ぴったり)
  perfect: 0.15, // ぴったり(秒)
  good: 0.35, // まあまあ(秒)
  bonus: { perfect: 4, good: 2 }, // ボーナス(cm)
};

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:wataame`),
    phase: 'ready', // ready → spin → show → finished
    phaseT: RULES.readyTime,
    chances: [],
    winner: null,
  };
  for (const [a, b] of RULES.chances) s.chances.push(Math.round(randRange(s, a, b) * 10) / 10);
  s.units = players.map(() => ({ size: 0, w: 0, strain: 0, stun: 0, tears: 0, layers: [], zarame: [] }));
  return s;
}

// その 大きさの ときの ちょうどいい はやさ [下, 上]
export function bandOf(size) {
  const hi = Math.max(RULES.hiMin, RULES.hi - size * RULES.hiDrop);
  return [hi - RULES.band, hi];
}
// 回す はやさで まける りつ(1 = ちょうどいい)
export function gainOf(w, size) {
  const [lo, hi] = bandOf(size);
  if (w <= RULES.minSpin) return 0;
  if (w < lo) return (w - RULES.minSpin) / (lo - RULES.minSpin);
  if (w <= hi) return 1;
  return 1 + RULES.greed * Math.min(1, w - hi);
}
export const spinLeft = (s) => (s.phase === 'spin' ? Math.max(0, s.phaseT) : 0);
const spinT = (s) => RULES.spinTime - s.phaseT; // 回しはじめから
// いま ひらいて いる ざらめ チャンス(なければ -1)と、わが ぴったりに なるまでの 秒
export function chanceNow(s) {
  if (s.phase !== 'spin') return { i: -1, left: 0 };
  const t = spinT(s);
  for (let i = 0; i < s.chances.length; i++) {
    const left = s.chances[i] + RULES.ring - t;
    if (t >= s.chances[i] && left > -RULES.good) return { i, left };
  }
  return { i: -1, left: 0 };
}

export function step(s, inputs) {
  const ev = [];
  if (s.phase === 'finished') return ev;
  const dt = STEP;
  s.t += dt;
  s.phaseT -= dt;
  if (s.phase === 'ready') {
    if (s.phaseT <= 0) {
      s.phase = 'spin';
      s.phaseT = RULES.spinTime;
      ev.push({ type: 'go' });
    }
    return ev;
  }
  if (s.phase === 'show') {
    if (s.phaseT <= 0) {
      s.phase = 'finished';
      s.winner = ranking(s)[0];
      ev.push({ type: 'finished', winner: s.winner });
    }
    return ev;
  }
  // 回す
  const t = spinT(s);
  // ざらめ チャンスが ひらいた
  for (let i = 0; i < s.chances.length; i++) if (t - dt < s.chances[i] && t >= s.chances[i]) ev.push({ type: 'chance', i });
  const ch = chanceNow(s);
  s.units.forEach((u, slot) => {
    const inp = inputs[slot];
    const spin = Math.max(0, Math.min(5, inp?.spin || 0));
    u.w += (spin - u.w) * Math.min(1, RULES.follow * dt);
    const [, hi] = bandOf(u.size);
    // はり: はやすぎると たまる。ちぎれたら へる
    if (u.w > hi && u.stun <= 0) u.strain += (u.w - hi) * RULES.strain * dt; // ちぎれて いる あいだは はらない
    else u.strain = Math.max(0, u.strain - RULES.relax * dt);
    if (u.stun > 0) u.stun = Math.max(0, u.stun - dt);
    else u.size += RULES.grow * gainOf(u.w, u.size) * dt;
    if (u.strain >= 1) {
      const lost = Math.round(u.size * RULES.tearLoss * 10) / 10;
      u.size = Math.max(0, u.size - lost);
      u.strain = 0;
      u.stun = RULES.stun;
      u.tears++;
      ev.push({ type: 'tear', slot, lost });
    }
    // 色の ざらめ: チャンスごとに 1回だけ おせる
    if (ch.i >= 0 && u.zarame[ch.i] === undefined) {
      let q = null;
      if (inp?.zarame) q = ch.left > RULES.good ? 'early' : Math.abs(ch.left) <= RULES.perfect ? 'perfect' : 'good';
      else if (ch.left <= -RULES.good + dt) q = 'miss';
      if (q) {
        if ((q === 'perfect' || q === 'good') && u.w < RULES.minSpin * 2) q = 'still'; // 回して いないと つかない
        const bonus = RULES.bonus[q] || 0;
        u.size += bonus;
        u.zarame[ch.i] = q;
        if (bonus) u.layers.push({ at: Math.round(u.size * 10) / 10, chance: ch.i });
        ev.push({ type: 'zarame', slot, i: ch.i, q, bonus });
      }
    }
  });
  if (s.phaseT <= 0) {
    for (const u of s.units) u.size = Math.round(u.size * 10) / 10;
    s.phase = 'show';
    s.phaseT = RULES.showTime;
    ev.push({ type: 'show', sizes: s.units.map((u) => u.size) });
  }
  return ev;
}

// 順位: 大きさ → ちぎれた 回数 → 席
export function ranking(s) {
  return s.units.map((_, i) => i).sort((a, b) => {
    const A = s.units[a], B = s.units[b];
    return B.size - A.size || A.tears - B.tears || a - b;
  });
}
