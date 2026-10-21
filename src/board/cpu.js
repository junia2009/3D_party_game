// 大会(すごろく)の CPU。人と同じ操作しか出さない(サイコロの目はえらべない)。
//
// - 分かれ道: 先生に近いほう。同じくらいなら、性格で近道の好みがちがう
// - 先生: 買えるなら買う
// - どうぐ: 先生が近いときにサイコロを足す / 先生が遠くて負けているときに笛 / 先生のすぐ手前にいる子といれかえ
// - お店: 先生のぶん(20)を残して買う
// - 乗り物(遊園地): 先生が すぐ先なら 乗らない。そうでなければ 性格しだい(つよきは よく乗る)
// - 対決: つよきは、どんぐりのいちばん多い子をえらぶ。しんちょうは、よほど得なときだけ
//
// 乱数は CPU ごとに持つ(シードはゲームのシードと席から作る)。

import { nextRandom, seedFrom } from '../rng.js';
import { ITEMS, RULES, ranking, stepsTo } from './rules.js';
import { STAGES } from './stages/index.js';

export const PERSONALITIES = {
  cautious: { label: 'しんちょう', shortcut: 0.3, duel: 0.2, shop: 0.5, ride: 0.45 },
  normal: { label: 'ふつう', shortcut: 0.5, duel: 0.5, shop: 0.7, ride: 0.7 },
  bold: { label: 'つよき', shortcut: 0.8, duel: 0.9, shop: 0.9, ride: 0.95 },
};

export function createCpu(personality, seed, slot) {
  return { personality, rng: seedFrom(`${seed}:taikai-cpu:${slot}`), swapTarget: null };
}

export function cpuAct(cpu, s, slot) {
  const pend = s.pending;
  if (!pend || pend.slot !== slot) return null;
  const P = PERSONALITIES[cpu.personality];
  const st = STAGES[s.stage];
  const me = s.players[slot];
  const toOwl = (sq) => stepsTo(st, sq, s.owl);
  const a = (type, extra = {}) => ({ slot, type, ...extra });

  switch (pend.type) {
    case 'orderRoll':
    case 'roll':
      return a('roll');
    case 'item': {
      const d = toOwl(me.sq);
      const has = (k) => me.items.indexOf(k);
      if (has('bag') >= 0) return a('useItem', { index: has('bag') });
      const rich = me.acorns >= RULES.medalPrice;
      // 先生まで 11〜25 マス: サイコロを足せば届くかもしれない
      if (rich && d > 10 && d <= 25 && has('dice3') >= 0) return a('useItem', { index: has('dice3') });
      if (rich && d > 6 && d <= 18 && has('dice2') >= 0) return a('useItem', { index: has('dice2') });
      // 先生が遠い: 笛で呼ぶ
      if (rich && d > 18 && has('whistle') >= 0) return a('useItem', { index: has('whistle') });
      // 先生のすぐ手前(1〜8 マス)にいる子と、遠い自分を入れかえる
      if (rich && d > 15 && has('swap') >= 0) {
        let best = null;
        s.players.forEach((o, i) => { if (i !== slot && toOwl(o.sq) <= 8 && (best === null || toOwl(o.sq) < toOwl(s.players[best].sq))) best = i; });
        if (best !== null) { cpu.swapTarget = best; return a('useItem', { index: has('swap') }); }
      }
      return a('skipItem');
    }
    case 'swapPick': {
      let t = cpu.swapTarget;
      if (t === null || t === slot) t = s.players.findIndex((_, i) => i !== slot);
      cpu.swapTarget = null;
      return a('swap', { target: t });
    }
    case 'branch': {
      const [main, short] = pend.options;
      const dm = toOwl(main), ds = toOwl(short);
      if (dm !== ds && Math.abs(dm - ds) > 2) return a('branch', { to: dm < ds ? main : short });
      return a('branch', { to: nextRandom(cpu) < P.shortcut ? short : main });
    }
    case 'owl':
      return a(me.acorns >= RULES.medalPrice ? 'buyMedal' : 'skipMedal');
    case 'shop': {
      // 先生のぶんを残して、買えるものを
      const spare = me.acorns - RULES.medalPrice;
      if (nextRandom(cpu) < P.shop) {
        for (const k of ['dice3', 'dice2', 'whistle', 'swap']) {
          if (ITEMS[k].price !== null && ITEMS[k].price <= spare) return a('shopBuy', { item: k });
        }
      }
      return a('shopSkip');
    }
    case 'ride': {
      const d = toOwl(me.sq);
      if (me.acorns >= RULES.medalPrice && d <= 8) return a('rideNo');
      return a(nextRandom(cpu) < P.ride ? 'rideYes' : 'rideNo');
    }
    case 'duelPick': {
      // どんぐりのいちばん多い子(自分より上位の子を少しえらびやすく)
      const order = ranking(s);
      let best = null;
      s.players.forEach((o, i) => {
        if (i === slot || o.acorns <= 0) return;
        const score = o.acorns + (order.indexOf(i) < order.indexOf(slot) ? 5 : 0);
        if (best === null || score > best.score) best = { i, score };
      });
      if (!best || nextRandom(cpu) > P.duel + (best.score >= 25 ? 0.3 : 0)) return a('duelSkip');
      return a('duelPick', { target: best.i });
    }
  }
  return null;
}
