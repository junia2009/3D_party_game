// 大会(すごろく)のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 5人で盤をまわって、金どんぐりメダルを集める。メダルは盤のどこかにいるホーホー先生から、どんぐり 20 こで買う。
// 盤の形は知らない。ステージのデータ(stages/)を受け取って動く。
//
// 進め方: すごろくは時間ではなく「手番の子の操作」で進む。act(s, 操作) だけが state を書きかえる。
// いま何を待っているかは s.pending にある({ type, slot, ... })。画面と CPU は pending を見て操作を出す。
//   orderRoll  開会式のサイコロ(番の順を決める)       → { type: 'roll' }
//   item       どうぐを使うか                          → { type: 'useItem', index } / { type: 'skipItem' }
//   swapPick   いれかえの相手                          → { type: 'swap', target }
//   roll       サイコロ(dice こ)                       → { type: 'roll' }
//   branch     分かれ道                                → { type: 'branch', to }
//   owl        先生のマスを通る・止まる(メダルを買うか)→ { type: 'buyMedal' } / { type: 'skipMedal' }
//   shop       どうぐ屋                                → { type: 'shopBuy', item } / { type: 'shopSkip' }
//   duelPick   対決の相手                              → { type: 'duelPick', target } / { type: 'duelSkip' }
//   duelGame   対決の競技(画面が遊ばせて、結果を返す)  → { type: 'duelResult', winner }
//   minigame   みんなの競技(画面が遊ばせて、順位を返す)→ { type: 'minigameResult', ranking, picked? }
// duelGame と minigame は、手番の子ではなく「場」が結果を返す(slot は null)。
// 乱数は s.rng だけ。

import { nextRandom, seedFrom } from '../rng.js';
import { STAGES } from './stages/index.js';

export const RULES = {
  startAcorns: 10,
  medalPrice: 20,
  blue: 3,
  red: 3,
  spurtTurns: 3, // のこり何ターンからラストスパート(青・赤が2倍)
  maxItems: 3,
  itemFull: 5, // どうぐがいっぱいのとき、どうぐマスでもらうどんぐり
  minigamePrize: [10, 6, 4, 2, 1],
  duelStake: 10,
  owlFar: 12, // 先生が移るとき、いまの場所からこれ以上はなれたマスへ
  happen: { springBack: 3, summerHit: 10, summerNear: 3, summerRange: 3, winterLoss: 5 },
};
export const TURNS = [5, 10, 15];
export const MINIGAMES = ['daruma', 'catch', 'sled', 'mato', 'tsumi', 'ikada', 'hana', 'hayauchi', 'sumo', 'kakure'];
export const DUEL_GAMES = ['mato', 'catch', 'daruma', 'tsumi', 'hana', 'hayauchi', 'sumo', 'kakure'];

// どうぐ。price はお店の値段(null はお店にない)。weight はどうぐマスで出る重み
export const ITEMS = {
  dice2: { name: 'ふたつサイコロ', price: 5, weight: 35 },
  dice3: { name: 'みっつサイコロ', price: 10, weight: 20 },
  swap: { name: 'いれかえの葉っぱ', price: 10, weight: 15 },
  whistle: { name: '先生の笛', price: 20, weight: 10 },
  bag: { name: 'どんぐり袋', price: null, weight: 20 },
};

// ボーナスメダルの候補。大会のはじめに3つえらんでおき、さいごに発表する
export const BONUSES = {
  minigameWins: '競技の王さま',
  gained: 'ひろい屋さん',
  happen: 'ハプニング王',
  diceSum: '大また',
  duelWins: '対決の名人',
  itemsUsed: '買いもの上手',
};

const rint = (s, n) => Math.floor(nextRandom(s) * n); // 0〜n-1
const stageOf = (s) => STAGES[s.stage];

export function createTournament(players, seed, { stage = 'shiki', turns = 10 } = {}) {
  const st = STAGES[stage];
  if (!st) throw new Error(`ステージがない: ${stage}`);
  const s = {
    rng: seedFrom(`${seed}:taikai`),
    stage,
    turns,
    turn: 1,
    phase: 'order', // order → turn ⇄ (duel) → minigame → … → finished
    order: [],
    cur: 0,
    pending: { type: 'orderRoll', slot: 0 },
    owl: 0,
    move: null, // { left, skipCheck }
    lastGame: null,
    usedItem: false,
    players: players.map(() => ({
      sq: st.start, acorns: RULES.startAcorns, medals: 0, bonusMedals: 0, items: [], orderRoll: 0,
      stats: { minigameWins: 0, gained: 0, happen: 0, diceSum: 0, duelWins: 0, itemsUsed: 0 },
    })),
  };
  // ボーナスの3つ(さいごに発表)
  const keys = Object.keys(BONUSES);
  s.bonus = [];
  while (s.bonus.length < 3) {
    const k = keys.splice(rint(s, keys.length), 1)[0];
    s.bonus.push(k);
  }
  s.owl = st.owlSpots[rint(s, st.owlSpots.length)];
  return s;
}

// ── 盤のたどり方 ─────────────────────────────────
// 前へ1歩(分かれ道は本道)
const ahead = (st, id) => st.squares[id].next[0];
// うしろへ1歩: 本道のマスの前のマス(近道のマスは近道を逆にたどる)
function prevMap(st) {
  if (st._prev) return st._prev;
  const prev = [];
  for (const q of st.squares) for (const n of q.next) if (prev[n] === undefined || !q.path) prev[n] = q.id;
  Object.defineProperty(st, '_prev', { value: prev }); // データに書きこむが、列挙しない
  return prev;
}
// 前へ進んで何歩で着くか(分かれ道はどちらも見る)。着かなければ Infinity
export function stepsTo(st, from, to) {
  if (from === to) return 0;
  const seen = new Map([[from, 0]]);
  const q = [from];
  while (q.length) {
    const id = q.shift();
    for (const n of st.squares[id].next) {
      if (seen.has(n)) continue;
      seen.set(n, seen.get(id) + 1);
      if (n === to) return seen.get(n);
      q.push(n);
    }
  }
  return Infinity;
}
// 前後どちらでも何歩か(つながりを向きなしで見る)
function near(st, a, b, range) {
  const prev = prevMap(st);
  const seen = new Set([a]);
  let edge = [a];
  for (let d = 0; d < range; d++) {
    const nextEdge = [];
    for (const id of edge) for (const n of [...st.squares[id].next, prev[id]]) {
      if (n === undefined || seen.has(n)) continue;
      seen.add(n);
      nextEdge.push(n);
    }
    edge = nextEdge;
  }
  return seen.has(b);
}

// ── どんぐりの出入り(0 より下にならない。もらった分は数えておく) ──────────
function gain(s, slot, n, ev, why) {
  const p = s.players[slot];
  const before = p.acorns;
  p.acorns = Math.max(0, p.acorns + n);
  const d = p.acorns - before;
  if (d > 0) p.stats.gained += d;
  if (d !== 0 || n !== 0) ev.push({ type: 'acorns', slot, delta: d, why, total: p.acorns });
  return d;
}

export const spurt = (s) => s.turns - s.turn < RULES.spurtTurns;
export const currentSlot = (s) => s.order[s.cur];

// ── 操作 ──────────────────────────────────────
export function act(s, a) {
  const ev = [];
  const pend = s.pending;
  if (!pend || !a) return [{ type: 'invalid', why: 'なにも待っていない' }];
  const sys = pend.type === 'minigame' || pend.type === 'duelGame';
  if (!sys && a.slot !== pend.slot) return [{ type: 'invalid', why: '手番ではない' }];
  const st = stageOf(s);
  const p = sys ? null : s.players[pend.slot];

  switch (pend.type) {
    case 'orderRoll': {
      if (a.type !== 'roll') break;
      p.orderRoll = 1 + rint(s, 10) + nextRandom(s) * 0.01; // 同じ目は、少しの差でくじ
      ev.push({ type: 'orderRoll', slot: pend.slot, value: Math.floor(p.orderRoll) });
      if (pend.slot + 1 < s.players.length) s.pending = { type: 'orderRoll', slot: pend.slot + 1 };
      else {
        s.order = s.players.map((_, i) => i).sort((x, y) => s.players[y].orderRoll - s.players[x].orderRoll);
        ev.push({ type: 'order', order: [...s.order] });
        s.phase = 'turn';
        ev.push({ type: 'turn', turn: s.turn, spurt: spurt(s) });
        startPlayer(s, ev);
      }
      return ev;
    }
    case 'item': {
      if (a.type === 'skipItem') { s.pending = { type: 'roll', slot: pend.slot, dice: 1 }; return ev; }
      if (a.type !== 'useItem') break;
      const key = p.items[a.index];
      if (!key) break;
      p.items.splice(a.index, 1);
      p.stats.itemsUsed++;
      ev.push({ type: 'useItem', slot: pend.slot, item: key });
      let dice = 1;
      if (key === 'dice2') dice = 2;
      if (key === 'dice3') dice = 3;
      if (key === 'bag') gain(s, pend.slot, 10, ev, 'bag');
      if (key === 'whistle') moveOwl(s, ev, pend.slot);
      if (key === 'swap') { s.pending = { type: 'swapPick', slot: pend.slot }; return ev; }
      s.pending = { type: 'roll', slot: pend.slot, dice };
      return ev;
    }
    case 'swapPick': {
      if (a.type !== 'swap' || a.target === pend.slot || !s.players[a.target]) break;
      const o = s.players[a.target];
      [p.sq, o.sq] = [o.sq, p.sq];
      ev.push({ type: 'swap', slot: pend.slot, target: a.target });
      s.pending = { type: 'roll', slot: pend.slot, dice: 1 };
      return ev;
    }
    case 'roll': {
      if (a.type !== 'roll') break;
      const values = Array.from({ length: pend.dice }, () => 1 + rint(s, 10));
      const total = values.reduce((x, y) => x + y, 0);
      p.stats.diceSum += total;
      ev.push({ type: 'dice', slot: pend.slot, values, total });
      s.move = { left: total, skipCheck: false };
      continueMove(s, ev);
      return ev;
    }
    case 'branch': {
      if (a.type !== 'branch' || !pend.options.includes(a.to)) break;
      stepTo(s, ev, pend.slot, a.to);
      continueMove(s, ev);
      return ev;
    }
    case 'owl': {
      if (a.type === 'buyMedal' && p.acorns >= RULES.medalPrice) {
        gain(s, pend.slot, -RULES.medalPrice, ev, 'medal');
        p.medals++;
        ev.push({ type: 'medal', slot: pend.slot, medals: p.medals });
        moveOwl(s, ev, null);
      } else if (a.type !== 'skipMedal' && a.type !== 'buyMedal') break;
      s.move.skipCheck = true;
      continueMove(s, ev);
      return ev;
    }
    case 'shop': {
      if (a.type === 'shopBuy') {
        const it = ITEMS[a.item];
        if (!it || it.price === null || p.acorns < it.price || p.items.length >= RULES.maxItems) break;
        gain(s, pend.slot, -it.price, ev, 'shop');
        p.items.push(a.item);
        ev.push({ type: 'buyItem', slot: pend.slot, item: a.item });
      } else if (a.type !== 'shopSkip') break;
      s.move.skipCheck = true;
      continueMove(s, ev);
      return ev;
    }
    case 'duelPick': {
      if (a.type === 'duelSkip') { ev.push({ type: 'duelSkip', slot: pend.slot }); endPlayer(s, ev); return ev; }
      if (a.type !== 'duelPick' || a.target === pend.slot || !s.players[a.target]) break;
      const stake = Math.min(RULES.duelStake, p.acorns, s.players[a.target].acorns);
      if (stake <= 0) { ev.push({ type: 'duelSkip', slot: pend.slot, why: 'どんぐりがない' }); endPlayer(s, ev); return ev; }
      const game = DUEL_GAMES[rint(s, DUEL_GAMES.length)];
      s.phase = 'duel';
      s.pending = { type: 'duelGame', slot: null, a: pend.slot, b: a.target, stake, game };
      ev.push({ type: 'duel', a: pend.slot, b: a.target, stake, game });
      return ev;
    }
    case 'duelGame': {
      if (a.type !== 'duelResult' || (a.winner !== pend.a && a.winner !== pend.b)) break;
      const loser = a.winner === pend.a ? pend.b : pend.a;
      const d = -gain(s, loser, -pend.stake, ev, 'duel');
      gain(s, a.winner, d, ev, 'duel');
      s.players[a.winner].stats.duelWins++;
      ev.push({ type: 'duelEnd', winner: a.winner, loser, stake: d });
      s.phase = 'turn';
      endPlayer(s, ev);
      return ev;
    }
    case 'minigame': {
      if (a.type !== 'minigameResult' || !validRanking(s, a.ranking)) break;
      a.ranking.forEach((slot, i) => gain(s, slot, RULES.minigamePrize[i] ?? 0, ev, 'minigame'));
      s.players[a.ranking[0]].stats.minigameWins++;
      if (a.picked) a.picked.forEach((n, slot) => { if (n > 0) gain(s, slot, Math.floor(n), ev, 'picked'); });
      ev.push({ type: 'minigameEnd', game: pend.game, ranking: [...a.ranking] });
      s.turn++;
      if (s.turn > s.turns) finish(s, ev);
      else {
        s.phase = 'turn';
        s.cur = 0;
        ev.push({ type: 'turn', turn: s.turn, spurt: spurt(s) });
        if (s.turns - s.turn + 1 === RULES.spurtTurns) ev.push({ type: 'spurt' });
        startPlayer(s, ev);
      }
      return ev;
    }
  }
  return [{ type: 'invalid', why: `この操作はできない(${pend.type} に ${a.type})` }];
}

function validRanking(s, r) {
  return Array.isArray(r) && r.length === s.players.length && new Set(r).size === r.length && r.every((x) => s.players[x]);
}

function startPlayer(s, ev) {
  const slot = currentSlot(s);
  const p = s.players[slot];
  s.move = null;
  ev.push({ type: 'player', slot });
  s.pending = p.items.length ? { type: 'item', slot } : { type: 'roll', slot, dice: 1 };
}

function endPlayer(s, ev) {
  s.move = null;
  s.cur++;
  if (s.cur < s.order.length) { startPlayer(s, ev); return; }
  // みんな動いた → 競技(同じものが続かないように)
  const choices = MINIGAMES.filter((g) => g !== s.lastGame);
  const game = choices[rint(s, choices.length)];
  s.lastGame = game;
  s.phase = 'minigame';
  s.pending = { type: 'minigame', slot: null, game };
  ev.push({ type: 'minigame', game });
}

function stepTo(s, ev, slot, to) {
  s.players[slot].sq = to;
  s.move.left--;
  s.move.skipCheck = false;
  s.move.stepped = true; // 1歩でも進んだら、いまのマスの先生・お店を見る(はじめに立っていたマスでは見ない)
  ev.push({ type: 'step', slot, to, left: s.move.left });
}

// 残りの歩数を進める。分かれ道・先生・お店で止まって、操作を待つ
function continueMove(s, ev) {
  const st = stageOf(s);
  const slot = currentSlot(s);
  const p = s.players[slot];
  for (;;) {
    const here = st.squares[p.sq];
    // いまのマスで、先生・お店(通りすぎるときにも寄れる)
    if (!s.move.skipCheck && s.move.stepped) {
      if (p.sq === s.owl && p.acorns >= RULES.medalPrice) { s.pending = { type: 'owl', slot }; return; }
      if (p.sq === s.owl) ev.push({ type: 'owlPoor', slot });
      if (here.kind === 'shop' && p.items.length < RULES.maxItems && p.acorns >= cheapest()) { s.pending = { type: 'shop', slot }; return; }
    }
    s.move.skipCheck = false;
    if (s.move.left <= 0) break;
    if (here.next.length > 1) { s.pending = { type: 'branch', slot, options: [...here.next] }; return; }
    stepTo(s, ev, slot, here.next[0]);
  }
  land(s, ev, slot);
}
const cheapest = () => Math.min(...Object.values(ITEMS).filter((i) => i.price !== null).map((i) => i.price));

function land(s, ev, slot, chained = false) {
  const st = stageOf(s);
  const p = s.players[slot];
  const q = st.squares[p.sq];
  ev.push({ type: 'land', slot, sq: p.sq, kind: q.kind });
  // 秋のすべり台・冬の氷: すべってから、行き先のマスの効果
  if (!chained && q.slideTo !== undefined) {
    p.sq = q.slideTo;
    ev.push({ type: 'slide', slot, to: p.sq });
    return land(s, ev, slot, true);
  }
  if (!chained && q.ice) {
    const n = 1 + rint(s, 3);
    let to = p.sq;
    for (let i = 0; i < n; i++) to = ahead(st, to);
    p.sq = to;
    ev.push({ type: 'iceSlide', slot, to, n });
    return land(s, ev, slot, true);
  }
  const mul = spurt(s) ? 2 : 1;
  switch (q.kind) {
    case 'blue': gain(s, slot, RULES.blue * mul, ev, 'blue'); break;
    case 'red': gain(s, slot, -RULES.red * mul, ev, 'red'); break;
    case 'item': {
      if (p.items.length >= RULES.maxItems) gain(s, slot, RULES.itemFull, ev, 'itemFull');
      else {
        const item = pickItem(s);
        p.items.push(item);
        ev.push({ type: 'getItem', slot, item });
      }
      break;
    }
    case 'happen': happen(s, ev, slot, q.area); break;
    case 'duel': {
      if (s.players.some((o, i) => i !== slot && o.acorns > 0) && p.acorns > 0) { s.pending = { type: 'duelPick', slot }; return; }
      ev.push({ type: 'duelSkip', slot, why: 'どんぐりがない' });
      break;
    }
  }
  endPlayer(s, ev);
}

function pickItem(s) {
  const list = Object.entries(ITEMS);
  let r = nextRandom(s) * list.reduce((a, [, it]) => a + it.weight, 0);
  for (const [k, it] of list) if ((r -= it.weight) < 0) return k;
  return list[0][0];
}

function happen(s, ev, slot, area) {
  const st = stageOf(s);
  const H = RULES.happen;
  s.players[slot].stats.happen++;
  ev.push({ type: 'happen', slot, area });
  if (area === 'spring') {
    // 春の雨: 春にいる子はみんな 3 マスもどる
    const prev = prevMap(st);
    s.players.forEach((o, i) => {
      if (st.squares[o.sq].area !== 'spring') return;
      for (let k = 0; k < H.springBack; k++) o.sq = prev[o.sq];
      ev.push({ type: 'pushBack', slot: i, to: o.sq });
    });
  } else if (area === 'summer') {
    // どんぐりの雨: 止まった子 +10、まわり(前後3マス)の子 +3
    gain(s, slot, H.summerHit, ev, 'happen');
    s.players.forEach((o, i) => { if (i !== slot && near(st, s.players[slot].sq, o.sq, H.summerRange)) gain(s, i, H.summerNear, ev, 'happen'); });
  } else if (area === 'autumn') {
    // つむじ風: 盤のどこかへ(本道のマス。先生のマスはのぞく)
    const spots = st.squares.filter((q) => !q.path && q.id !== s.owl && q.id !== s.players[slot].sq);
    s.players[slot].sq = spots[rint(s, spots.length)].id;
    ev.push({ type: 'blown', slot, to: s.players[slot].sq });
  } else if (area === 'winter') {
    // 雪玉ころころ: 冬にいる子はみんな -5
    s.players.forEach((o, i) => { if (st.squares[o.sq].area === 'winter') gain(s, i, -H.winterLoss, ev, 'happen'); });
  }
}

// 先生が移る。who がいれば(笛)その子の 1〜10 マス先へ。いなければ(メダルを売った)遠くのマスへ
function moveOwl(s, ev, who) {
  const st = stageOf(s);
  let to;
  if (who !== null) {
    const n = 1 + rint(s, 10);
    to = s.players[who].sq;
    for (let i = 0; i < n; i++) to = ahead(st, to);
    // 立てないマス(すべり台・近道など)なら、その先の立てるマスへ
    for (let i = 0; i < st.squares.length && !st.owlSpots.includes(to); i++) to = ahead(st, to);
  } else {
    const far = st.owlSpots.filter((id) => id !== s.owl && Math.min(stepsTo(st, s.owl, id), stepsTo(st, id, s.owl)) >= RULES.owlFar);
    const list = far.length ? far : st.owlSpots.filter((id) => id !== s.owl);
    to = list[rint(s, list.length)];
  }
  s.owl = to;
  ev.push({ type: 'owlMove', to });
}

function finish(s, ev) {
  // ボーナスメダル: その数がいちばん多い子(同じならみんな)。0 ならなし
  for (const key of s.bonus) {
    const best = Math.max(...s.players.map((p) => p.stats[key]));
    const who = best > 0 ? s.players.map((p, i) => (p.stats[key] === best ? i : -1)).filter((i) => i >= 0) : [];
    for (const i of who) { s.players[i].medals++; s.players[i].bonusMedals++; }
    ev.push({ type: 'bonus', key, name: BONUSES[key], who, value: best });
  }
  s.phase = 'finished';
  s.pending = null;
  ev.push({ type: 'finished', ranking: ranking(s) });
}

// 順位: メダル → どんぐり → 番の順
export function ranking(s) {
  return s.players.map((_, i) => i).sort((a, b) => {
    const A = s.players[a], B = s.players[b];
    return B.medals - A.medals || B.acorns - A.acorns || s.order.indexOf(a) - s.order.indexOf(b);
  });
}
