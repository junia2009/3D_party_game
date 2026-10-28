// お正月の お寺の だるまおとし のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// みんなで 1つの だるまを じゅんばんに たたく。いちばん 下の だんを ハンマーで たたいて ぬく。
// だるまを くずした 子は アウト。のこりの 子で つみなおして つづけ、さいごの 1人が 勝ち。
// - ためる: おして いる あいだ ハンマーを ひく。つよさは 0→1→0 と いったり きたり する。はなすと たたく。
// - だんの しゅるい: ふつう・かたい(石。つよく たたかないと ぬけない)・すべる(よわくて いい。つよいと うえまで ふっとぶ)。
//   だんごとに「ちょうどいい つよさ」の はばが ある。まんなかに ちかいほど きれいに ぬける。
// - よわすぎ: だんが すこし ずれる だけ(つぎの 子は すこし よわくて いい)。ぐらぐらも すこし。
// - ちょうどいい: だんが ぬけて、だるまが 1だん さがる。まんなかから ずれた ぶん ぐらぐら する。
// - つよすぎ: うえの だんまで ひっぱって 大きく ぐらぐら。
// - ぐらぐら: たたくと たまり、まって いると おさまる。1 を こえたら くずれる。
//   ぐらぐら して いる ときに たたくと よけいに ゆれる。じぶんの ばんには 時間が ある(5 秒)。
//   ぐらぐらが おさまるのを まつか、いそいで たたくか。
// - だんを ぜんぶ ぬくと(あたまだけ)「おみごと!」。つみなおして、つぎから すこし むずかしく なる。
// 順位: さいごまで のこった 子 → アウトが おそかった 順。
//
// inputs[slot]: { hold(おして いる) } または null。じぶんの ばん いがいは みない。
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;

export const RULES = {
  readyTime: 2.5,
  turnTime: 5, // じぶんの ばんの 時間(すぎたら その ときの つよさで たたく)
  afterTime: 1.0, // たたいた あと(とぶ だんを 見る)
  collapseTime: 2.4, // くずれた あと
  clearTime: 1.6, // ぜんぶ ぬいた あと
  showTime: 2.5,
  blocks: 5, // だるまの だんの 数(あたまの 下)
  period: 1.5, // ためる つよさが 0→1→0 と 1おうふく する 秒
  settle: 0.14, // ぐらぐらが 1秒で おさまる ぶん
  // だんの しゅるいごとの ちょうどいい はば [下, 上]
  kinds: {
    normal: { win: [0.38, 0.68] },
    hard: { win: [0.68, 0.93] },
    slip: { win: [0.12, 0.38] },
  },
  mix: { hard: 0.2, slip: 0.2 }, // まざる わりあい
  harder: 0.22, // つみなおす たびに はばが せまく なる わりあい
  wobbleGood: 0.12, // きれいに ぬけた ときの ぐらぐら
  wobbleMiss: 0.55, // はばの はしで ぬけた ときに たす ぐらぐら(まんなかからの ずれの 2じょう)
  wobbleWeak: 0.1, // よわすぎ
  wobbleStrong: 0.75, // つよすぎ(+ こえた ぶん × 2)
};

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:otoshi`),
    phase: 'ready', // ready → aim →(after → aim …)→ collapse / clear → aim … → show → finished
    phaseT: RULES.readyTime,
    round: 0, // つみなおした 回数
    tower: [],
    shift: 0, // いちばん 下の だんの ずれ(0〜1)
    wobble: 0,
    hold: 0, // ためて いる 時間
    charge: 0,
    turn: 0, // いまの ばんの 席
    order: [],
    outs: players.map(() => null),
    knocks: players.map(() => 0),
    last: null, // さいごに たたいた けっか
    winner: null,
  };
  // はじめの じゅんばんは くじ
  const start = Math.floor(nextRandom(s) * players.length);
  s.order = players.map((_, i) => (start + i) % players.length);
  s.turn = s.order[0];
  build(s);
  return s;
}

function build(s) {
  s.tower = [];
  for (let i = 0; i < RULES.blocks; i++) {
    const r = nextRandom(s);
    s.tower.push({ kind: i === 0 ? 'normal' : r < RULES.mix.hard ? 'hard' : r < RULES.mix.hard + RULES.mix.slip ? 'slip' : 'normal' });
  }
  s.shift = 0;
  s.wobble = 0;
}

// いちばん 下の だんの ちょうどいい はば(ずれて いると よわくて いい・つみなおすほど せまい)
export function windowOf(s) {
  const b = s.tower[0];
  if (!b) return [0, 0];
  const [lo, hi] = RULES.kinds[b.kind].win;
  const mid = (lo + hi) / 2, half = ((hi - lo) / 2) * Math.max(0.12, 1 - RULES.harder * s.round);
  const down = 1 - s.shift * 0.45;
  return [(mid - half) * down, (mid + half) * down];
}
// ためた 時間 → つよさ(0→1→0 と いったり きたり)
export const chargeAt = (t) => { const k = (t / RULES.period) % 1; return k < 0.5 ? k * 2 : 2 - k * 2; };
export const alive = (s) => s.order.filter((i) => s.outs[i] === null);
export const timeLeft = (s) => (s.phase === 'aim' ? Math.max(0, s.phaseT) : 0);

function nextTurn(s) {
  const al = s.order.filter((i) => s.outs[i] === null);
  const k = al.indexOf(s.turn);
  s.turn = k < 0 ? al[0] : al[(k + 1) % al.length];
}

function hit(s, ev) {
  const p = s.charge;
  const [lo, hi] = windowOf(s);
  const slot = s.turn;
  const shaky = 1 + s.wobble * 1.5; // ぐらぐら して いる ところを たたくと よけいに ゆれる
  let result;
  if (p < lo) {
    result = 'weak';
    s.shift = Math.min(0.9, s.shift + 0.25 + (p / Math.max(lo, 0.01)) * 0.25);
    s.wobble += RULES.wobbleWeak * shaky;
  } else if (p <= hi) {
    const mid = (lo + hi) / 2, half = (hi - lo) / 2;
    const off = Math.abs(p - mid) / half; // 0 = まんなか
    result = off < 0.35 ? 'perfect' : 'good';
    s.wobble += (RULES.wobbleGood + RULES.wobbleMiss * off * off) * shaky;
    s.tower.shift();
    s.shift = 0;
    s.knocks[slot]++;
  } else {
    result = 'strong';
    s.wobble += (RULES.wobbleStrong + (p - hi) * 3) * shaky;
    s.tower.shift();
    s.shift = 0;
    s.knocks[slot]++;
  }
  s.last = { slot, power: p, result };
  ev.push({ type: 'hit', slot, power: p, result, wobble: s.wobble, lo, hi });
  s.charge = 0;
  s.hold = 0;
  if (s.wobble > 1) {
    s.outs[slot] = s.t;
    s.phase = 'collapse';
    s.phaseT = RULES.collapseTime;
    ev.push({ type: 'collapse', slot });
  } else if (s.tower.length === 0) {
    s.phase = 'clear';
    s.phaseT = RULES.clearTime;
    ev.push({ type: 'clear', slot });
  } else {
    s.phase = 'after';
    s.phaseT = RULES.afterTime;
  }
}

export function step(s, inputs) {
  const ev = [];
  if (s.phase === 'finished') return ev;
  const dt = STEP;
  s.t += dt;
  s.phaseT -= dt;
  if (s.phase !== 'collapse') s.wobble = Math.max(0, s.wobble - RULES.settle * dt);
  switch (s.phase) {
    case 'ready':
      if (s.phaseT <= 0) { s.phase = 'aim'; s.phaseT = RULES.turnTime; ev.push({ type: 'turn', slot: s.turn }); }
      break;
    case 'aim': {
      const hold = !!inputs[s.turn]?.hold;
      if (hold) {
        s.hold += dt;
        s.charge = chargeAt(s.hold);
      } else if (s.hold > 0) {
        hit(s, ev);
        break;
      }
      if (s.phaseT <= 0) {
        // 時間ぎれ: いまの つよさで(ためて いなければ ちょっとだけ)たたく
        if (s.hold === 0) s.charge = 0.15;
        ev.push({ type: 'timeout', slot: s.turn });
        hit(s, ev);
      }
      break;
    }
    case 'after':
      if (s.phaseT <= 0) { nextTurn(s); s.phase = 'aim'; s.phaseT = RULES.turnTime; ev.push({ type: 'turn', slot: s.turn }); }
      break;
    case 'collapse':
    case 'clear':
      if (s.phaseT <= 0) {
        if (alive(s).length <= 1) {
          s.phase = 'show';
          s.phaseT = RULES.showTime;
          ev.push({ type: 'show' });
          break;
        }
        if (s.phase === 'clear') s.round++; // ぜんぶ ぬけたら つぎは すこし むずかしく
        build(s);
        nextTurn(s);
        ev.push({ type: 'build', round: s.round });
        s.phase = 'aim';
        s.phaseT = RULES.turnTime;
        ev.push({ type: 'turn', slot: s.turn });
      }
      break;
    case 'show':
      if (s.phaseT <= 0) {
        s.phase = 'finished';
        s.winner = ranking(s)[0];
        ev.push({ type: 'finished', winner: s.winner });
      }
      break;
  }
  return ev;
}

// 順位: のこった 子 → アウトが おそかった 順 → ぬいた 数 → 席
export function ranking(s) {
  return s.outs.map((_, i) => i).sort((a, b) => {
    const A = s.outs[a], B = s.outs[b];
    if ((A === null) !== (B === null)) return A === null ? -1 : 1;
    if (A !== null && A !== B) return B - A;
    return s.knocks[b] - s.knocks[a] || a - b;
  });
}
