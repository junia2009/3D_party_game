// Durable Object: あいことば ごとに 1つ。部屋の 権威的な 状態を もち、WebSocket で くばる。
// 部屋の きまりは RoomCore(room-core.js)、競技の 進行は MinigameSession(src/net/session.js)に とじて いる。
// ここは「つなぐ・いつ だれに なにを おくるか・刻みを まわす」だけ。
//
// メッセージ(画面 → サーバー)
//   hello { clientId, name, character }   すわる(つなぎなおしも おなじ)
//   chara { character }                   キャラを かえる
//   settings { settings }                 あそびを えらぶ(ホストだけ)
//   start                                 はじめる(ホストだけ)
//   in { v: [入力, …] }                   競技の 入力(1刻み 1つ。たまった ぶんを まとめて)
//   leave                                 ぬける
//   ping
// メッセージ(サーバー → 画面)
//   joined { seat, code }   lobby { lobby }   start { key, lineup, seed, seat }
//   snap { tick, s, ev, in }(競技の 状態。SNAP_EVERY 刻みごと)   end { result }   error { msg }

import { RoomCore } from './room-core.js';
import { MinigameSession } from '../src/net/session.js';
import { ONLINE_GAMES } from '../src/net/games.js';

const SNAP_EVERY = 2; // 2刻み(1/30 秒)ごとに 状態を くばる
const END_WAIT_MS = 600; // 競技が おわってから ロビーへ もどすまで(さいごの 状態を とどける)
const IDLE_SWEEP_MS = 30 * 60 * 1000; // だれも いない 部屋を たたむまで

export class RoomDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.sockets = new Map(); // WebSocket → clientId
    this.session = null;
    this.timer = null;
    this.pending = []; // まだ くばって いない できごと
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get('room');
      if (saved) {
        this.room = RoomCore.fromJSON(saved);
        // 競技の とちゅうで 部屋が ねむって いたら、ロビーへ もどす(競技の 状態は のこして いない)
        if (this.room.phase === 'playing') this.room.finish();
      }
    });
  }

  save() { return this.ctx.storage.put('room', this.room.toJSON()); }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    const code = url.searchParams.get('code') ?? '0000';
    const isPublic = url.searchParams.get('public') === '1';

    // あいことばの 確保(新しく つくる とき)
    if (url.pathname.endsWith('/claim')) {
      if (this.room) return Response.json({ free: false });
      this.room = new RoomCore({ code, isPublic, games: ONLINE_GAMES });
      await this.save();
      this.ctx.storage.setAlarm(Date.now() + IDLE_SWEEP_MS);
      return Response.json({ free: true, code });
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket が ひつようです', { status: 426 });
    if (!this.room) {
      // あいことばを 手で 入れた: まだ ない 部屋なら ここで つくる
      this.room = new RoomCore({ code, isPublic: false, games: ONLINE_GAMES });
      await this.save();
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.wire(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  wire(ws) {
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return this.send(ws, { t: 'error', msg: 'へんな メッセージです' }); }
      this.onMessage(ws, msg).catch((e) => this.send(ws, { t: 'error', msg: e.message ?? 'サーバーの エラー' }));
    });
    const bye = () => this.onClose(ws);
    ws.addEventListener('close', bye);
    ws.addEventListener('error', bye);
  }

  send(ws, obj) { try { ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch { /* きれて いる */ } }
  broadcast(obj) {
    const text = JSON.stringify(obj);
    for (const ws of this.sockets.keys()) this.send(ws, text);
  }
  broadcastLobby() {
    this.broadcast({ t: 'lobby', lobby: this.room.lobbyInfo() });
    this.syncMatch();
  }
  // だれとでも の 名簿に いまの 空きを しらせる
  syncMatch() {
    if (!this.room.isPublic || !this.env?.MATCH) return;
    const stub = this.env.MATCH.get(this.env.MATCH.idFromName('match'));
    const open = this.room.isOpen() ? 1 : 0;
    this.ctx.waitUntil?.(stub.fetch(`https://match/update?code=${this.room.code}&open=${open}&n=${this.room.humans().length}`).catch(() => {}));
  }

  async onMessage(ws, msg) {
    const room = this.room;
    const clientId = this.sockets.get(ws);
    if (msg.t === 'hello') {
      const res = room.join({ clientId: msg.clientId, name: msg.name, character: msg.character });
      if (res.error) return this.send(ws, { t: 'error', msg: res.error, fatal: true });
      for (const [sock, id] of this.sockets) {
        if (id === msg.clientId && sock !== ws) { this.sockets.delete(sock); try { sock.close(1000, 'べつの 接続に おきかえました'); } catch { /* 済 */ } }
      }
      this.sockets.set(ws, msg.clientId);
      this.send(ws, { t: 'joined', seat: res.seat, code: room.code });
      this.broadcastLobby();
      // 競技の とちゅうに もどって きた: いまの 競技へ 入れる
      if (room.phase === 'playing' && this.session) {
        this.session.setOnline(res.seat, true);
        this.send(ws, this.startMsg(res.seat));
      }
      return this.save();
    }
    if (!clientId) return this.send(ws, { t: 'error', msg: 'まず 部屋に 入ってね' });
    if (msg.t === 'ping') return this.send(ws, { t: 'pong' });
    if (msg.t === 'in') {
      const seat = room.seatOf(clientId);
      if (seat >= 0 && this.session) this.session.push(seat, msg.v);
      return;
    }
    if (msg.t === 'chara') {
      const res = room.setCharacter(clientId, msg.character);
      if (res.error) return this.send(ws, { t: 'error', msg: res.error });
      this.broadcastLobby();
      return this.save();
    }
    if (msg.t === 'settings') {
      const res = room.setSettings(clientId, msg.settings);
      if (res.error) return this.send(ws, { t: 'error', msg: res.error });
      this.broadcastLobby();
      return this.save();
    }
    if (msg.t === 'start') {
      if (room.settings.mode === 'taikai') return this.send(ws, { t: 'error', msg: 'すごろくは じゅんびちゅうです' });
      const res = room.start(clientId);
      if (res.error) return this.send(ws, { t: 'error', msg: res.error });
      this.startGame(res);
      this.broadcastLobby();
      return this.save();
    }
    if (msg.t === 'leave') {
      const { seat } = room.leave(clientId);
      this.sockets.delete(ws);
      if (seat >= 0 && this.session) this.session.setOnline(seat, false);
      try { ws.close(1000, 'ぬけました'); } catch { /* 済 */ }
      this.broadcastLobby();
      return this.save();
    }
    return this.send(ws, { t: 'error', msg: `しらない メッセージ: ${msg.t}` });
  }

  onClose(ws) {
    const clientId = this.sockets.get(ws);
    if (!clientId) return;
    this.sockets.delete(ws);
    const { seat } = this.room.disconnect(clientId);
    if (seat >= 0 && this.session) this.session.setOnline(seat, false);
    this.broadcastLobby();
    this.save();
    if (this.room.isDeserted()) this.ctx.storage.setAlarm(Date.now() + IDLE_SWEEP_MS);
  }

  // ── 競技 ────────────────────────────────────────
  startMsg(seat) {
    const g = this.game;
    return { t: 'start', key: g.key, lineup: g.lineup, seed: g.seed, seat, tick: this.session.tick, s: this.session.s };
  }

  startGame({ game, lineup, seed }) {
    this.game = { key: game, lineup, seed };
    this.session = new MinigameSession({ key: game, players: lineup, seed });
    this.room.seats.forEach((s, i) => { if (s && !s.connected) this.session.setOnline(i, false); });
    for (const [ws, id] of this.sockets) this.send(ws, this.startMsg(this.room.seatOf(id)));
    this.pending = [];
    // 刻みは 時計に あわせて まわす(タイマーが おくれても、そのぶん まとめて すすめる)
    this.clock = Date.now();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.pump(), 15);
  }

  pump() {
    const ses = this.session;
    if (!ses) return;
    const stepMs = ses.STEP * 1000;
    let n = 0;
    while (Date.now() - this.clock >= stepMs && n < 8) {
      this.clock += stepMs;
      n++;
      this.pending.push(...ses.step());
      if (ses.tick % SNAP_EVERY === 0 || ses.done) {
        this.broadcast({ t: 'snap', tick: ses.tick, s: ses.s, ev: this.pending, in: ses.used });
        this.pending = [];
      }
      if (ses.done) { this.endGame(); return; }
    }
    if (n === 8) this.clock = Date.now(); // おくれすぎ: おいつくのを あきらめる
  }

  endGame() {
    clearInterval(this.timer);
    this.timer = null;
    const result = this.session.result();
    this.session = null;
    setTimeout(() => {
      this.broadcast({ t: 'end', result });
      this.room.finish();
      this.broadcastLobby();
      this.save();
    }, END_WAIT_MS);
  }

  async alarm() {
    await this.ready;
    if (!this.room) return;
    if (this.room.isDeserted() && Date.now() - this.room.lastActivityAt >= IDLE_SWEEP_MS - 1000) {
      clearInterval(this.timer);
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }
    this.ctx.storage.setAlarm(Date.now() + IDLE_SWEEP_MS);
  }
}
