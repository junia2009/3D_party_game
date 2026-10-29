import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomCore, SEATS, makeRoomCode, normalizeRoomCode } from '../server/room-core.js';
import { MinigameSession } from '../src/net/session.js';
import { MINIGAMES } from '../src/board/rules.js';
import { GAMES } from '../src/board/simulate.js';
import { ONLINE_GAMES } from '../src/net/games.js';

const room = (o = {}) => new RoomCore({ code: '1234', games: MINIGAMES, ...o });

test('あいことばは 数字 4けた', () => {
  for (let i = 0; i < 50; i++) assert.match(makeRoomCode(), /^[1-9]\d{3}$/);
  assert.equal(normalizeRoomCode(' 12-34 '), '1234');
});

test('入った じゅんに すわり、さいしょの 人が ホスト。キャラは かぶらない', () => {
  const r = room();
  assert.equal(r.join({ clientId: 'a', name: 'あ', character: 'mimi' }).seat, 0);
  assert.equal(r.join({ clientId: 'b', name: 'い', character: 'mimi' }).seat, 1);
  assert.equal(r.seats[0].character, 'mimi');
  assert.notEqual(r.seats[1].character, 'mimi', 'おなじ キャラは つかえない');
  assert.equal(r.lobbyInfo().hostSeat, 0);
  assert.ok(r.setCharacter('b', 'mimi').error);
  assert.ok(r.setCharacter('b', 'gonzo').ok);
  // ホストだけが きめられる
  assert.ok(r.setSettings('b', { game: 'bowl' }).error);
  assert.ok(r.setSettings('a', { game: 'bowl' }).ok);
  assert.equal(r.settings.game, 'bowl');
  assert.ok(r.setSettings('a', { game: 'nai' }).ok);
  assert.equal(r.settings.game, 'bowl', 'しらない 競技は うけつけない');
});

test('5人で いっぱい。ホストが ぬけたら つぎの 人が ホスト', () => {
  const r = room();
  for (let i = 0; i < SEATS; i++) r.join({ clientId: `c${i}` });
  assert.ok(r.join({ clientId: 'x' }).error);
  r.disconnect('c0');
  assert.equal(r.seats[0], null, 'ロビーで 切れたら 席を あける');
  assert.equal(r.lobbyInfo().hostSeat, 1);
  assert.equal(r.join({ clientId: 'x' }).seat, 0);
});

test('はじめると あいた 席を CPU で うめる。とちゅうで 切れても 席は のこり、もどれる', () => {
  const r = room();
  r.join({ clientId: 'a', character: 'ponta' });
  r.join({ clientId: 'b', character: 'kirin' });
  assert.ok(r.start('b').error, 'ホストだけ');
  const g = r.start('a');
  assert.equal(g.lineup.length, SEATS);
  assert.equal(g.lineup.filter((l) => l.human).length, 2);
  assert.ok(MINIGAMES.includes(g.game), 'おまかせなら どれかの 競技');
  const chars = g.lineup.map((l) => l.character);
  assert.equal(new Set(chars).size, SEATS, 'キャラが かぶらない');
  assert.ok(!chars.includes('ray') || g.lineup.find((l) => l.character === 'ray').human, 'CPU は ゲストを つかわない');
  assert.ok(r.join({ clientId: 'z' }).error, 'あそんで いる とちゅうは 入れない');
  r.disconnect('b');
  assert.equal(r.seats[1].connected, false);
  assert.equal(r.join({ clientId: 'b' }).seat, 1, 'もどれる');
  r.disconnect('b');
  r.finish();
  assert.equal(r.seats[1], null, 'おわった ときに 切れた ままの 人の 席は あける');
  assert.equal(r.phase, 'lobby');
});

test('だれとでも の 部屋は ロビーで 空きが ある あいだだけ 入れる', () => {
  const r = room({ isPublic: true });
  assert.ok(r.isOpen());
  r.join({ clientId: 'a' });
  r.start('a');
  assert.ok(!r.isOpen());
});

test('オンラインで えらべる 競技は ぜんぶ ある 競技', () => {
  for (const k of ONLINE_GAMES) assert.ok(MINIGAMES.includes(k) && GAMES[k], k);
});

test('部屋は 保存して もどせる', () => {
  const r = room();
  r.join({ clientId: 'a', character: 'konko' });
  r.setSettings('a', { mode: 'taikai', stage: 'yuen', turns: 15 });
  const back = RoomCore.fromJSON(JSON.parse(JSON.stringify(r.toJSON())));
  assert.deepEqual(back.lobbyInfo(), r.lobbyInfo());
});

// ── 競技の 進行 ─────────────────────────────────────
const lineup = (humans) => ['ponta', 'mimi', 'gonzo', 'penne', 'konko'].map((character, i) => ({ character, cpu: i < humans ? null : 'normal', name: character }));

test('どの 競技も サーバーの 進行で さいごまで 動く(人の 席は 切れて CPU が かわる)', () => {
  for (const key of MINIGAMES) {
    const ses = new MinigameSession({ key, players: lineup(2), seed: 11 });
    ses.setOnline(0, false);
    ses.setOnline(1, false);
    let n = 0;
    while (!ses.done) { ses.step(); if (++n > 600 / ses.STEP) throw new Error(`${key} が おわらない`); }
    assert.deepEqual([...ses.result().ranking].sort(), [0, 1, 2, 3, 4], key);
  }
});

test('とどいた 入力は 1刻み 1つずつ。1回きりの 入力は くりかえさず、おしっぱなしは くりかえす', () => {
  const ses = new MinigameSession({ key: 'bowl', players: lineup(1), seed: 3 });
  const throwIn = { x: 0, angle: 0, speed: 0.7, spin: 0 };
  ses.push(0, [null, throwIn]);
  assert.equal(ses.inputFor(0), null);
  assert.deepEqual(ses.inputFor(0), throwIn);
  assert.equal(ses.inputFor(0), null, '投げる 入力は 1回きり');
  const stick = { x: 1, y: 0 };
  ses.push(0, [stick, stick]);
  ses.inputFor(0); ses.inputFor(0);
  assert.deepEqual(ses.inputFor(0), stick, 'まだ とどいて いない あいだも おしっぱなしは つづく');
  // たまりすぎた ぶんは すてる
  ses.push(0, Array(30).fill(null));
  assert.ok(ses.queues[0].length <= 8);
});

test('人の 入力で 投げた ボウリングが、ローカルと おなじ 結果に なる(おなじ ルールの 計算)', () => {
  const players = lineup(5);
  const ses = new MinigameSession({ key: 'bowl', players, seed: 9 });
  const g = GAMES.bowl;
  const local = g.rules.createGame(players.map((p, i) => ({ id: `p${i}`, character: p.character })), 9);
  const plan = (s, seat) => (g.rules.canThrow(s, seat) && s.aimLeft < 6 ? { x: 0.1 * (seat - 2), angle: 0.01, speed: 0.6 + seat * 0.05, spin: 0 } : null);
  while (!ses.done) {
    const ins = players.map((_, seat) => plan(ses.s, seat));
    ins.forEach((v, seat) => ses.push(seat, [v]));
    ses.step();
    g.rules.step(local, players.map((_, seat) => plan(local, seat)));
  }
  assert.deepEqual(ses.s.players.map((p) => p.score), local.players.map((p) => p.score));
});

// ── 画面の がわ(src/net/drive.js) ─────────────────────────
import { createNetDriver, replaceState } from '../src/net/drive.js';

test('とどいた 状態は 中の 物を そのままに 中身だけ かえる', () => {
  const a = { list: [{ x: 1 }, { x: 2 }], byId: [{ id: 5, v: 1 }, { id: 6, v: 2 }], gone: 1 };
  const keep = a.list[0], keepId = a.byId[1];
  replaceState(a, { list: [{ x: 9 }], byId: [{ id: 6, v: 3 }], add: 2 });
  assert.equal(a.list[0], keep);
  assert.equal(keep.x, 9);
  assert.equal(a.list.length, 1);
  assert.equal(a.byId[0], keepId, 'id で あわせる');
  assert.equal(keepId.v, 3);
  assert.ok(!('gone' in a) && a.add === 2);
});

test('サーバーの 入力で 画面も おなじ ように すすみ、さいごは サーバーと おなじ 状態', () => {
  for (const key of ['meiro', 'keshigomu', 'daruma', 'tsumi']) {
    const players = lineup(2);
    const ses = new MinigameSession({ key, players, seed: 21 });
    const sent = [];
    const client = { seat: 1, h: {}, started: { tick: 0 }, sendInputs: (v) => sent.push(...v) };
    const g = GAMES[key];
    const local = g.rules.createGame(players.map((p, i) => ({ id: `p${i}`, character: p.character, name: p.name })), 21);
    replaceState(local, JSON.parse(JSON.stringify(ses.s)));
    const drv = createNetDriver({ client, rules: g.rules, state: local, me: 1 });
    let pend = [];
    let evLocal = 0, n = 0;
    while (!ses.done || drv.lag) {
      if (!ses.done) {
        ses.step();
        pend.push(JSON.parse(JSON.stringify(ses.used)));
        if (ses.tick % 2 === 0 || ses.done) {
          const full = ses.tick % 30 === 0 || ses.done;
          client.h.snap(JSON.parse(JSON.stringify({ tick: ses.tick, ins: pend, ...(full ? { s: ses.s } : {}) })));
          pend = [];
        }
      }
      evLocal += drv.step(local, { 1: null }).length;
      if (++n > 700 / g.rules.STEP) throw new Error(`${key} が おわらない`);
    }
    assert.equal(local.phase, 'finished', key);
    assert.deepEqual(g.rules.ranking(local), ses.result().ranking, key);
    assert.ok(evLocal > 0, `${key}: 画面でも できごとが 出る`);
    assert.ok(sent.length > 100, '自分の 入力を 送って いる');
  }
});

// ── 大会(すごろく) ────────────────────────────────────
import { TaikaiSession } from '../src/net/taikai-session.js';
import { act } from '../src/board/rules.js';
import { simulate } from '../src/board/simulate.js';

test('大会: サーバーの 進行で さいごまで すすみ、画面も おなじ 操作で おなじ けっかに なる', () => {
  for (const stage of ['shiki', 'yuen']) {
    const players = lineup(2);
    const t = new TaikaiSession({ players, seed: 5, stage, turns: 5 });
    // 画面の がわ: おなじ 操作を act で すすめる
    const screen = JSON.parse(JSON.stringify(t.s));
    let n = 0, games = 0;
    const human = (seat) => {
      // 人の 手番: CPU と おなじ きめかたで(テスト用)
      const p = t.pending;
      assert.equal(t.waitingFor(), seat);
      return t.standIn();
    };
    while (!t.done) {
      if (++n > 5000) throw new Error('おわらない');
      let res;
      const g = t.gameLineup();
      if (g) {
        games++;
        const r = simulate(g.key, g.seats.map((i) => ({ cpu: t.players[i].cpu || 'normal' })), 7 + n);
        res = t.apply(t.resultAction(g.seats, r.ranking, r.picked));
      } else if (t.waitingFor() !== null) res = t.apply(human(t.waitingFor()));
      else res = t.apply(t.autoAction());
      assert.ok(res, `できない 操作: ${JSON.stringify(t.pending)}`);
      act(screen, res.action);
      assert.equal(res.seq, n);
    }
    assert.deepEqual(screen, JSON.parse(JSON.stringify(t.s)), `${stage}: 画面と サーバーが おなじ`);
    assert.ok(games >= 5, '競技が ある');
  }
});

test('大会: 人の 手番は その 人を まつ。切れたら CPU が うつ。手番で ない 人の 操作は うけつけない', () => {
  const t = new TaikaiSession({ players: lineup(5), seed: 3, turns: 5 });
  assert.equal(t.pending.type, 'orderRoll');
  assert.equal(t.waitingFor(), 0);
  assert.equal(t.autoAction(), null, '人を まって いる あいだ CPU は うたない');
  assert.equal(t.apply({ slot: 1, type: 'roll' }), null, '手番では ない');
  assert.ok(t.apply({ slot: 0, type: 'roll' }));
  t.setOnline(1, false);
  assert.equal(t.waitingFor(), null);
  assert.ok(t.apply(t.autoAction()), '切れた 人の 番は CPU が うつ');
});

test('大会の 対決は 2人の 順位を 大会の 席に もどす', () => {
  const t = new TaikaiSession({ players: lineup(2), seed: 3, turns: 5 });
  t.s.pending = { type: 'duelGame', a: 3, b: 1, game: 'bowl' };
  assert.deepEqual(t.gameLineup(), { key: 'bowl', seats: [3, 1] });
  assert.deepEqual(t.resultAction([3, 1], [1, 0]), { type: 'duelResult', winner: 1 });
  t.s.pending = { type: 'minigame', game: 'meiro' };
  assert.deepEqual(t.resultAction([0, 1, 2, 3, 4], [4, 3, 2, 1, 0]), { type: 'minigameResult', ranking: [4, 3, 2, 1, 0] });
});

// 部屋(Durable Object)を そのまま 動かす。時計は にせもの(mock.timers)で すすめる
import { mock } from 'node:test';
import { RoomDO } from '../server/room-do.js';
import { cpuAct, createCpu } from '../src/board/cpu.js';

test('大会の 部屋: 競技は 1回ずつ はじまり、競技の あとも 手番が すすむ', async () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1_000_000 });
  try {
    const storage = { get: async () => null, put: async () => {}, setAlarm() {}, deleteAll: async () => {} };
    const room = new RoomDO({ blockConcurrencyWhile: (fn) => fn(), storage, waitUntil() {} }, {});
    await room.ready;
    room.room = new RoomCore({ code: '1234', isPublic: false, games: ONLINE_GAMES });
    // 人は 1人(席 0)。操作の 演出は すぐ 見おわり、自分の 番は CPU の 考えで うつ
    const cpu = createCpu('normal', 1, 0);
    let starts = 0;
    let twice = 0; // 大会が すすまない まま、また 競技が はじまった 回数
    let since = true; // 前の 競技の あと、大会が すすんだか
    let lastTurn = 0;
    const ws = {
      close() {},
      send(text) {
        const m = JSON.parse(text);
        if (m.t === 'start') { starts++; if (!since) twice++; since = false; }
        if (m.t !== 'taikai' && m.t !== 'bact') return;
        since = true;
        lastTurn = m.s.turn;
        queueMicrotask(() => {
          room.onMessage(ws, { t: 'bseen', seq: m.seq });
          const p = m.s.pending;
          if (p && p.slot === 0 && p.type !== 'minigame' && p.type !== 'duelGame') room.onMessage(ws, { t: 'bact', action: cpuAct(cpu, m.s, 0) });
        });
      },
    };
    await room.onMessage(ws, { t: 'hello', clientId: 'a', name: 'あ', character: 'ponta' });
    await room.onMessage(ws, { t: 'settings', settings: { mode: 'taikai', turns: 5 } });
    await room.onMessage(ws, { t: 'start' });
    for (let i = 0; i < 40000 && room.taikai && !room.taikai.done; i++) {
      mock.timers.tick(50);
      await new Promise((r) => setImmediate(r));
    }
    assert.ok(room.taikai?.done, `大会が さいごまで すすむ(ターン ${lastTurn})`);
    assert.ok(starts > 0, '競技を あそんだ');
    assert.equal(twice, 0, 'おなじ 競技を 2回 はじめない');
  } finally {
    mock.timers.reset();
  }
});
