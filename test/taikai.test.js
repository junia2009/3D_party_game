import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BONUSES, ITEMS, RULES, act, createTournament, ranking, spurt, stepsTo } from '../src/board/rules.js';
import { PERSONALITIES, cpuAct, createCpu } from '../src/board/cpu.js';
import { STAGES, LIST } from '../src/board/stages/index.js';
import { nextRandom, seedFrom } from '../src/rng.js';

const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
const kinds = Object.keys(PERSONALITIES);
const ST = STAGES.shiki;

// CPU だけで大会を最後まで。競技・対決の結果は、くじで決める
function run(seed, { turns = 10, personalities = PLAYERS.map((_, i) => kinds[(i + seed) % 3]), onEvents } = {}) {
  const s = createTournament(PLAYERS, seed, { turns });
  const cpus = personalities.map((k, i) => createCpu(k, seed, i));
  const fake = { rng: seedFrom(`fake:${seed}`) };
  const events = [];
  let guard = 0;
  while (s.phase !== 'finished') {
    const pend = s.pending;
    let a;
    if (pend.type === 'minigame') {
      const r = PLAYERS.map((_, i) => i);
      for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(nextRandom(fake) * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
      a = { type: 'minigameResult', ranking: r };
    } else if (pend.type === 'duelGame') a = { type: 'duelResult', winner: nextRandom(fake) < 0.5 ? pend.a : pend.b };
    else a = cpuAct(cpus[pend.slot], s, pend.slot);
    const ev = act(s, a);
    events.push(...ev);
    onEvents?.(s, ev);
    if (++guard > 20000) throw new Error('終わらない');
  }
  return { s, events };
}

// 開会式をすませて、席 0 から番がまわる状態(番の順は 0,1,2,3,4)
function ready(seed = 1, turns = 10) {
  const s = createTournament(PLAYERS, seed, { turns });
  s.order = [0, 1, 2, 3, 4];
  s.phase = 'turn';
  s.cur = 0;
  s.pending = { type: 'roll', slot: 0, dice: 1 };
  return s;
}
// 次のサイコロが n になるように、乱数の状態を合わせる(乱数は state の中の数ひとつ)
function forceDice(s, ...ns) {
  for (let k = 0; k < 1e6; k++) {
    const h = { rng: k };
    if (ns.every((n) => 1 + Math.floor(nextRandom(h) * 10) === n)) { s.rng = k; return; }
  }
  throw new Error('見つからない');
}
// slot の子を sq に置いて、n を出して進ませる
function rollFrom(s, slot, sq, n) {
  s.players[slot].sq = sq;
  s.cur = s.order.indexOf(slot);
  s.pending = { type: 'roll', slot, dice: 1 };
  forceDice(s, n);
  return act(s, { slot, type: 'roll' });
}
const owlAway = (s) => { s.owl = ST.owlSpots.find((id) => id > 40); };

test('ステージ: 道がつながっていて、どのマスからも一周できる', () => {
  for (const q of ST.squares) {
    assert.ok(q.next.length >= 1 && q.next.length <= 2);
    for (const n of q.next) assert.ok(ST.squares[n], `${q.id} の先 ${n}`);
    assert.ok(stepsTo(ST, q.id, ST.start) < Infinity, `${q.id} からスタートへもどれる`);
  }
  assert.equal(ST.squares.filter((q) => q.next.length === 2).length, 2, '分かれ道は2か所');
  for (const area of ['spring', 'summer', 'autumn', 'winter']) {
    const qs = ST.squares.filter((q) => q.area === area && !q.path);
    assert.equal(qs.length, 12);
    assert.ok(qs.some((q) => q.kind === 'happen') && qs.some((q) => q.kind === 'duel'), `${area} にハプニングと対決`);
  }
  assert.ok(ST.owlSpots.length >= 15 && ST.owlSpots.every((id) => ST.squares[id].kind === 'blue'));
  assert.ok(LIST.some((x) => x.ready && STAGES[x.key]), 'ステージ選択に遊べるステージがある');
  assert.ok(LIST.some((x) => !x.ready), 'じゅんびちゅうの札もある');
});

test('CPU だけで大会を最後まで回すと、決めたターン数で決着する', () => {
  for (const turns of [5, 10, 15]) {
    for (let seed = 1; seed <= 15; seed++) {
      const { s, events } = run(seed, { turns });
      assert.equal(s.phase, 'finished');
      assert.equal(events.filter((e) => e.type === 'minigame').length, turns, '競技はターンの数だけ');
      assert.equal(events.filter((e) => e.type === 'bonus').length, 3, 'ボーナスメダルは3つ');
      assert.ok(!events.some((e) => e.type === 'invalid'), 'CPU はできない操作を出さない');
      assert.ok(s.players.every((p) => p.acorns >= 0));
      assert.deepEqual(ranking(s), events.at(-1).ranking);
    }
  }
});

test('同じシードなら、同じ大会になる', () => {
  const a = run(9).s, b = run(9).s;
  assert.deepEqual(a.players.map((p) => [p.sq, p.acorns, p.medals]), b.players.map((p) => [p.sq, p.acorns, p.medals]));
});

test('どんぐりとメダルの帳じりが合う(できごとの合計 = 持っている数)', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const acorns = PLAYERS.map(() => RULES.startAcorns), medals = PLAYERS.map(() => 0);
    const { s } = run(seed, {
      onEvents: (_, ev) => {
        for (const e of ev) {
          if (e.type === 'acorns') { acorns[e.slot] += e.delta; assert.equal(acorns[e.slot], e.total); }
          if (e.type === 'medal') medals[e.slot]++;
          if (e.type === 'bonus') for (const i of e.who) medals[i]++;
        }
      },
    });
    assert.deepEqual(s.players.map((p) => p.acorns), acorns);
    assert.deepEqual(s.players.map((p) => p.medals), medals);
  }
});

test('開会式: サイコロの大きい順に番がまわる', () => {
  const s = createTournament(PLAYERS, 3);
  const ev = [];
  for (let i = 0; i < 5; i++) ev.push(...act(s, { slot: i, type: 'roll' }));
  const rolls = ev.filter((e) => e.type === 'orderRoll');
  assert.equal(rolls.length, 5);
  const order = ev.find((e) => e.type === 'order').order;
  for (let i = 1; i < 5; i++) assert.ok(s.players[order[i - 1]].orderRoll >= s.players[order[i]].orderRoll);
  assert.equal(s.pending.slot, order[0]);
});

test('サイコロの目だけ進む。青 +3・赤 -3(0 より下にならない)。ラストスパートは2倍', () => {
  const s = ready();
  owlAway(s);
  let ev = rollFrom(s, 0, 12, 2); // 14 は青
  assert.equal(ev.filter((e) => e.type === 'step').length, 2);
  assert.equal(s.players[0].sq, 14);
  assert.equal(s.players[0].acorns, RULES.startAcorns + 3);
  s.players[1].acorns = 2;
  ev = rollFrom(s, 1, 12, 1); // 13 は赤
  assert.equal(s.players[1].acorns, 0);
  // ラストスパート
  s.turn = s.turns - 1;
  assert.ok(spurt(s));
  s.players[2].acorns = 10;
  rollFrom(s, 2, 12, 2);
  assert.equal(s.players[2].acorns, 16);
});

test('分かれ道: えらんだほうへ進む(春のハス・冬の氷)', () => {
  const s = ready();
  owlAway(s);
  rollFrom(s, 0, 3, 2);
  assert.equal(s.pending.type, 'branch');
  const [main, lily] = s.pending.options;
  assert.equal(main, 4);
  act(s, { slot: 0, type: 'branch', to: lily });
  assert.equal(ST.squares[s.players[0].sq].path, 'lily');
  // 選べないところへは行けない
  rollFrom(s, 1, 38, 3);
  assert.equal(act(s, { slot: 1, type: 'branch', to: 20 })[0].type, 'invalid');
  act(s, { slot: 1, type: 'branch', to: 39 });
  assert.equal(s.players[1].sq, 41);
});

test('先生: 通りすぎるときにも買える。買うと 20 へって、先生は遠くへ移る', () => {
  const s = ready();
  s.owl = 14;
  s.players[0].acorns = 25;
  rollFrom(s, 0, 12, 5); // 14 を通る
  assert.equal(s.pending.type, 'owl');
  const ev = act(s, { slot: 0, type: 'buyMedal' });
  assert.equal(s.players[0].medals, 1);
  assert.ok(ev.some((e) => e.type === 'owlMove'));
  assert.ok(Math.min(stepsTo(ST, 14, s.owl), stepsTo(ST, s.owl, 14)) >= RULES.owlFar);
  assert.equal(s.players[0].sq, 17, 'そのあと残りを進む');
  // どんぐりが足りないと、聞かれない
  s.owl = 14;
  s.players[1].acorns = 19;
  rollFrom(s, 1, 12, 3);
  assert.notEqual(s.pending.type, 'owl');
  // はじめから先生のマスに立っていても、聞かれない(1歩でも進んでから)
  s.players[2].acorns = 30;
  rollFrom(s, 2, 14, 1);
  assert.notEqual(s.pending.type, 'owl');
});

test('どうぐ: マスでもらう(いっぱいならどんぐり)・お店で買う・使う', () => {
  const s = ready();
  owlAway(s);
  rollFrom(s, 0, 14, 1); // 15 はどうぐ
  assert.equal(s.players[0].items.length, 1);
  s.players[1].items = ['dice2', 'dice2', 'dice2'];
  s.players[1].acorns = 0;
  rollFrom(s, 1, 14, 1);
  assert.equal(s.players[1].acorns, RULES.itemFull);
  // お店(17)
  s.players[2].acorns = 30;
  rollFrom(s, 2, 16, 2); // 17 のお店を通って、18(青)に止まる
  assert.equal(s.pending.type, 'shop');
  assert.equal(act(s, { slot: 2, type: 'shopBuy', item: 'bag' })[0].type, 'invalid', '袋はお店にない');
  act(s, { slot: 2, type: 'shopBuy', item: 'dice3' });
  assert.deepEqual(s.players[2].items, ['dice3']);
  assert.equal(s.players[2].acorns, 30 - ITEMS.dice3.price + 3, '残りを進んで青に止まる');
  // 使う: ふたつサイコロ
  s.cur = 3;
  s.players[3].items = ['dice2'];
  s.players[3].sq = 12;
  s.pending = { type: 'item', slot: 3 };
  act(s, { slot: 3, type: 'useItem', index: 0 });
  assert.equal(s.pending.dice, 2);
  forceDice(s, 4, 5);
  const ev = act(s, { slot: 3, type: 'roll' });
  assert.deepEqual(ev.find((e) => e.type === 'dice').values, [4, 5]);
  // いれかえ
  s.cur = 4;
  s.players[4].items = ['swap'];
  s.players[4].sq = 30;
  s.players[0].sq = 5;
  s.pending = { type: 'item', slot: 4 };
  act(s, { slot: 4, type: 'useItem', index: 0 });
  act(s, { slot: 4, type: 'swap', target: 0 });
  assert.equal(s.players[4].sq, 5);
  assert.equal(s.players[0].sq, 30);
});

test('先生の笛: 先生が自分の少し先へ来る', () => {
  const s = ready();
  s.owl = 44;
  s.players[0].items = ['whistle'];
  s.players[0].sq = 12;
  s.pending = { type: 'item', slot: 0 };
  act(s, { slot: 0, type: 'useItem', index: 0 });
  const d = stepsTo(ST, 12, s.owl);
  assert.ok(d >= 1 && d <= 14, `先生まで ${d} マス`);
  assert.ok(ST.owlSpots.includes(s.owl));
});

test('秋のすべり台・冬の氷', () => {
  const s = ready();
  owlAway(s);
  rollFrom(s, 0, 25, 1); // 26 はすべり台 → 30
  assert.equal(s.players[0].sq, 30);
  rollFrom(s, 1, 38, 1);
  act(s, { slot: 1, type: 'branch', to: ST.shortcuts.ice[0] });
  const iceAt = ST.shortcuts.ice;
  const sq = s.players[1].sq;
  assert.ok(!iceAt.includes(sq) || sq !== iceAt[0], '氷のマスで止まると、もう少しすべる');
  assert.ok(stepsTo(ST, iceAt[0], sq) >= 1 && stepsTo(ST, iceAt[0], sq) <= 3);
});

test('ハプニング: 春の雨・夏のどんぐりの雨・秋のつむじ風・冬の雪玉', () => {
  let s = ready();
  owlAway(s);
  s.players[1].sq = 8; // 春
  s.players[2].sq = 20; // 夏
  rollFrom(s, 0, 5, 1); // 6 は春のハプニング
  assert.equal(s.players[0].sq, 3, '止まった子は 3マス もどる');
  assert.equal(s.players[1].sq, 8, 'ほかの 春の子は そのまま');
  assert.equal(s.players[2].sq, 20);

  s = ready();
  owlAway(s);
  s.players[1].sq = 21; // 2マスうしろ
  s.players[2].sq = 30; // 遠く
  rollFrom(s, 0, 18, 1); // 19 は夏のハプニング
  assert.equal(s.players[0].acorns, RULES.startAcorns + RULES.happen.summerHit);
  assert.equal(s.players[1].acorns, RULES.startAcorns + RULES.happen.summerNear);
  assert.equal(s.players[2].acorns, RULES.startAcorns);

  s = ready();
  owlAway(s);
  rollFrom(s, 0, 28, 1); // 29 は秋のハプニング
  assert.notEqual(s.players[0].sq, 29);

  s = ready();
  owlAway(s);
  s.players[1].sq = 44; // 冬
  s.players[2].sq = 10; // 春
  rollFrom(s, 0, 39, 1); // 40 は冬のハプニング
  assert.equal(s.players[0].acorns, RULES.startAcorns - RULES.happen.winterLoss);
  assert.equal(s.players[1].acorns, RULES.startAcorns - RULES.happen.winterLoss);
  assert.equal(s.players[2].acorns, RULES.startAcorns);
  assert.equal(s.players[0].stats.happen, 1);
});

test('対決: かけるのは少ないほうに合わせる。勝った子がもらう。どんぐりがなければなし', () => {
  const s = ready();
  owlAway(s);
  s.players[0].acorns = 30;
  s.players[3].acorns = 6;
  rollFrom(s, 0, 9, 1); // 10 は対決
  assert.equal(s.pending.type, 'duelPick');
  assert.equal(act(s, { slot: 0, type: 'duelPick', target: 0 })[0].type, 'invalid', '自分はえらべない');
  act(s, { slot: 0, type: 'duelPick', target: 3 });
  assert.equal(s.pending.type, 'duelGame');
  assert.equal(s.pending.stake, 6);
  act(s, { type: 'duelResult', winner: 0 });
  assert.equal(s.players[0].acorns, 36);
  assert.equal(s.players[3].acorns, 0);
  assert.equal(s.players[0].stats.duelWins, 1);
  assert.equal(s.pending.slot, 1, '次の子の番へ');
  // 相手がみんな 0 なら、対決なし
  s.players.forEach((p, i) => { if (i !== 1) p.acorns = 0; });
  s.players[1].acorns = 10;
  const ev = rollFrom(s, 1, 9, 1);
  assert.ok(ev.some((e) => e.type === 'duelSkip'));
});

test('競技: 順位でどんぐり。順位がおかしい結果は受けつけない。次のターンへ', () => {
  const s = ready(1, 5);
  s.cur = 4;
  owlAway(s);
  rollFrom(s, 4, 12, 2);
  assert.equal(s.pending.type, 'minigame');
  assert.equal(act(s, { type: 'minigameResult', ranking: [0, 0, 1, 2, 3] })[0].type, 'invalid');
  const before = s.players.map((p) => p.acorns);
  act(s, { type: 'minigameResult', ranking: [3, 1, 0, 4, 2], picked: [0, 0, 2, 0, 0] });
  const got = s.players.map((p, i) => p.acorns - before[i]);
  assert.deepEqual(got, [4, 6, 1 + 2, 10, 2]);
  assert.equal(s.players[3].stats.minigameWins, 1);
  assert.equal(s.turn, 2);
  assert.equal(s.pending.slot, s.order[0]);
});

test('ボーナスメダル: いちばんの子に(同じならみんな)。0 ならなし', () => {
  const s = ready(1, 1);
  s.bonus = ['minigameWins', 'duelWins', 'happen'];
  s.players[0].stats.minigameWins = 2;
  s.players[2].stats.minigameWins = 2;
  s.players[4].stats.happen = 1;
  s.cur = 4;
  owlAway(s);
  rollFrom(s, 4, 12, 2);
  const ev = act(s, { type: 'minigameResult', ranking: [1, 0, 2, 3, 4] });
  const b = ev.filter((e) => e.type === 'bonus');
  assert.deepEqual(b.map((e) => e.who), [[0, 2], [], [4]]);
  assert.equal(s.phase, 'finished');
  assert.deepEqual(s.players.map((p) => p.bonusMedals), [1, 0, 1, 0, 1]);
  assert.ok(Object.keys(BONUSES).length >= 6);
});

test('手番でない子の操作・待っていない操作は受けつけない', () => {
  const s = ready();
  assert.equal(act(s, { slot: 2, type: 'roll' })[0].type, 'invalid');
  assert.equal(act(s, { slot: 0, type: 'buyMedal' })[0].type, 'invalid');
  assert.equal(act(s, { type: 'minigameResult', ranking: [0, 1, 2, 3, 4] })[0].type, 'invalid');
});

test('どの性格の CPU も優勝できる(かたよりすぎない)', () => {
  const wins = { cautious: 0, normal: 0, bold: 0 };
  const N = 120;
  for (let seed = 1; seed <= N; seed++) {
    const personalities = PLAYERS.map((_, i) => kinds[(i + seed) % 3]);
    const { s } = run(seed, { personalities });
    wins[personalities[ranking(s)[0]]]++;
  }
  for (const k of kinds) assert.ok(wins[k] > N * 0.15, `優勝の数 ${JSON.stringify(wins)}`);
});

test('競技を画面なしで回せる(CPU どうしの対決・5人の競技)', async () => {
  const { simulate, GAMES } = await import('../src/board/simulate.js');
  const { DUEL_GAMES, MINIGAMES } = await import('../src/board/rules.js');
  for (const key of MINIGAMES) {
    assert.ok(GAMES[key], `${key} を回せる`);
    const r = simulate(key, PLAYERS.map((_, i) => ({ cpu: kinds[i % 3] })), 3);
    assert.deepEqual([...r.ranking].sort(), [0, 1, 2, 3, 4]);
  }
  for (const key of DUEL_GAMES) {
    const r = simulate(key, [{ cpu: 'normal' }, { cpu: 'bold' }], 5);
    assert.deepEqual([...r.ranking].sort(), [0, 1], `${key} は 2 人でも決着する`);
  }
  assert.equal(simulate('daruma', [{ cpu: 'normal' }, { cpu: 'normal' }], 2).picked.length, 2, 'だるまさんは拾ったどんぐりも返す');
});
