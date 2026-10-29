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
