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
//   bact { action }                       大会: 自分の 手番の 操作
//   bseen { seq }                         大会: その 操作の 演出を 見おわった
//   leave                                 ぬける
//   ping
// メッセージ(サーバー → 画面)
//   joined { seat, code }   lobby { lobby }   start { key, lineup, seed, seat, taikai? }
//   taikai { lineup, seed, stage, turns, seat, seq, s }(大会が はじまった / とちゅうから 入った)
//   bact { seq, action, s }(大会の 操作。みんなの 画面も おなじ act で すすめる)
//   snap { tick, ins, s? }(SNAP_EVERY 刻みごとに、その あいだの 刻みごとの みんなの 入力。FULL_EVERY 刻みごとに 状態 s も)
//   end { result }   error { msg }

import { RoomCore } from './room-core.js';
import { MinigameSession } from '../src/net/session.js';
import { ONLINE_GAMES } from '../src/net/games.js';
import { TaikaiSession } from '../src/net/taikai-session.js';
import { simulate } from '../src/board/simulate.js';

const SNAP_EVERY = 2; // 2刻み(1/30 秒)ごとに 入力を くばる
const FULL_EVERY = 30; // 30刻み(0.5 秒)ごとに 状態も くばる(画面の 計算の ずれを なおす)
const END_WAIT_MS = 600; // 競技が おわってから ロビーへ もどすまで(さいごの 状態を とどける)
const IDLE_SWEEP_MS = 30 * 60 * 1000; // だれも いない 部屋を たたむまで
// 大会の 間合い
const AHEAD = 1; // 大会の 手番を 画面より いくつ 先まで すすめて よいか
const CPU_THINK_MS = 700; // CPU が 手を うつまで(前の 操作を くばってから)
const SEEN_LIMIT_MS = 25000; // 演出を 見おわった しらせが こない 画面は これ以上 またない
const HUMAN_LIMIT_MS = 45000; // 人が 手を きめない ときは CPU が かわりに
const TAIKAI_END_MS = 3000; // おわってから 部屋へ もどすまで

export class RoomDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.sockets = new Map(); // WebSocket → clientId
    this.session = null;
    this.timer = null;
    this.pending = []; // まだ くばって いない 刻みごとの 入力
    this.taikai = null; // 大会の 進行(TaikaiSession)
    this.tk = null; // 大会の 間合い { seen, lastAt, timer }
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
      // とちゅうに もどって きた: いまの 大会・競技へ 入れる
      if (room.phase === 'playing' && this.taikai) {
        this.taikai.setOnline(res.seat, true);
        this.send(ws, this.taikaiMsg(res.seat));
      }
      if (room.phase === 'playing' && this.session) {
        const gs = this.gameSeat(res.seat);
        if (gs >= 0) { this.session.setOnline(gs, true); this.send(ws, this.startMsg(gs)); }
      }
      return this.save();
    }
    if (!clientId) return this.send(ws, { t: 'error', msg: 'まず 部屋に 入ってね' });
    if (msg.t === 'ping') return this.send(ws, { t: 'pong' });
    if (msg.t === 'in') {
      const seat = room.seatOf(clientId);
      const gs = seat >= 0 ? this.gameSeat(seat) : -1;
      if (gs >= 0 && this.session) this.session.push(gs, msg.v);
      return;
    }
    if (msg.t === 'bact') {
      const seat = room.seatOf(clientId);
      const tk = this.taikai;
      if (!tk || seat < 0 || tk.waitingFor() !== seat) return this.send(ws, { t: 'error', msg: 'いまは あなたの 番では ないよ' });
      const res = tk.apply({ ...msg.action, slot: seat });
      if (!res) return this.send(ws, { t: 'error', msg: 'その 操作は できないよ' });
      this.broadcastAct(res);
      return;
    }
    if (msg.t === 'bseen') {
      const seat = room.seatOf(clientId);
      if (seat >= 0 && this.tk) this.tk.seen[seat] = Math.max(this.tk.seen[seat] ?? 0, Number(msg.seq) || 0);
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
      const res = room.start(clientId);
      if (res.error) return this.send(ws, { t: 'error', msg: res.error });
      if (res.mode === 'taikai') this.startTaikai(res);
      else this.startGame(res);
      this.broadcastLobby();
      return this.save();
    }
    if (msg.t === 'leave') {
      const { seat } = room.leave(clientId);
      this.sockets.delete(ws);
      this.goneSeat(seat);
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
    this.goneSeat(seat);
    this.broadcastLobby();
    this.save();
    if (this.room.isDeserted()) this.ctx.storage.setAlarm(Date.now() + IDLE_SWEEP_MS);
  }

  // 人が いなく なった: 競技と 大会では CPU が かわりに
  goneSeat(seat) {
    if (seat < 0) return;
    const gs = this.gameSeat(seat);
    if (gs >= 0 && this.session) this.session.setOnline(gs, false);
    this.taikai?.setOnline(seat, false);
  }

  // ── 競技 ────────────────────────────────────────
  // 部屋の 席 → 競技の 席(大会の 対決は 2人だけ。出ない 子は -1)
  gameSeat(seat) {
    if (!this.game) return -1;
    return this.game.seats ? this.game.seats.indexOf(seat) : seat;
  }
  startMsg(gameSeat) {
    const g = this.game;
    return { t: 'start', key: g.key, lineup: g.lineup, seed: g.seed, seat: gameSeat, tick: this.session.tick, s: this.session.s, taikai: !!g.onDone };
  }

  // seats: 大会の 対決なら 出る 2人の 部屋の 席。onDone: 大会の 競技なら おわった ときに 順位を わたす
  startGame({ game, lineup, seed }, { seats = null, onDone = null } = {}) {
    this.game = { key: game, lineup, seed, seats, onDone };
    this.session = new MinigameSession({ key: game, players: lineup, seed });
    this.room.seats.forEach((s, i) => {
      const gs = this.gameSeat(i);
      if (gs >= 0 && (!s || !s.connected)) this.session.setOnline(gs, false);
    });
    for (const [ws, id] of this.sockets) {
      const gs = this.gameSeat(this.room.seatOf(id));
      if (gs >= 0) this.send(ws, this.startMsg(gs));
    }
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
      ses.step();
      this.pending.push(ses.used);
      if (ses.tick % SNAP_EVERY === 0 || ses.done) {
        const full = ses.tick % FULL_EVERY === 0 || ses.done;
        this.broadcast(full ? { t: 'snap', tick: ses.tick, ins: this.pending, s: ses.s } : { t: 'snap', tick: ses.tick, ins: this.pending });
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
    const onDone = this.game.onDone;
    if (onDone) {
      // 大会の 競技: 順位を 大会へ もどす(部屋は 大会の まま)
      setTimeout(() => { this.broadcast({ t: 'end', result }); this.game = null; onDone(result); }, END_WAIT_MS);
      return;
    }
    setTimeout(() => {
      this.broadcast({ t: 'end', result });
      this.room.finish({ winner: result.ranking[0] });
      this.broadcastLobby();
      this.save();
    }, END_WAIT_MS);
  }

  // ── 大会(すごろく) ──────────────────────────────────
  taikaiMsg(seat) {
    const t = this.taikai;
    return { t: 'taikai', lineup: t.players, seed: t.seed, stage: t.s.stage, turns: t.s.turns, seat, seq: t.seq, s: t.s };
  }

  startTaikai({ lineup, seed, stage, turns }) {
    this.taikai = new TaikaiSession({ players: lineup, seed, stage, turns });
    this.room.seats.forEach((s, i) => { if (s && !s.connected) this.taikai.setOnline(i, false); });
    for (const [ws, id] of this.sockets) this.send(ws, this.taikaiMsg(this.room.seatOf(id)));
    const now = Date.now();
    clearInterval(this.tk?.timer);
    this.tk = { seen: {}, lastAt: now + 4000, waitAt: now + 4000, timer: setInterval(() => this.pumpTaikai(), 200) }; // はじめは 会場へ 入る 時間を まつ
  }

  broadcastAct(res) {
    const now = Date.now();
    this.tk.lastAt = now;
    this.tk.waitAt = now;
    this.broadcast({ t: 'bact', seq: res.seq, action: res.action, s: this.taikai.s });
    if (this.taikai.done) {
      clearInterval(this.tk.timer);
      setTimeout(() => {
        this.taikai = null;
        this.tk = null;
        this.room.finish();
        this.broadcastLobby();
        this.save();
      }, TAIKAI_END_MS);
    }
  }

  // みんなが 演出を 見おわったか(つながって いる 人だけ)。ahead: その 数だけ 先へ いって よい
  allSeen(ahead = 0) {
    const t = this.taikai;
    return this.room.seats.every((s, i) => !s || !s.connected || !t.human[i] || (this.tk.seen[i] ?? 0) >= t.seq - ahead);
  }

  pumpTaikai() {
    const t = this.taikai;
    // 競技の とちゅう・競技の 順位を もどす まで(this.game が のこって いる あいだ)は まつ。
    // session は 競技が おわった ときに 消えるが、順位を 大会へ もどすのは すこし あと(END_WAIT_MS)。
    // その すきまに 次へ すすむと、おなじ 競技を もう一度 はじめて しまう
    if (!t || t.done || this.session || this.game) return;
    const now = Date.now();
    if (now < this.tk.lastAt) return;
    const pend = t.pending;
    const g = t.gameLineup();
    // 手番は 1つ 先まで きめて くばって よい(画面は 演出の あいだに うけとって おき、おわったら すぐ 次へ。
    // 往復の 待ちが 手番ごとに はさまらない)。競技は みんなが 盤を 見おわってから
    if (!this.allSeen(g ? 0 : AHEAD) && now - this.tk.lastAt < SEEN_LIMIT_MS) return;
    // 競技・対決: 競技の 進行を まわして、順位を 大会へ
    if (g) {
      const lineup = g.seats.map((i) => t.players[i]);
      const seed = t.seed + t.s.turn * 31 + t.seq;
      const live = g.seats.some((i) => t.human[i] && t.online[i]);
      if (!live) {
        // 人が いない 対決は すぐ 決める
        const r = simulate(g.key, lineup.map((l) => ({ cpu: l.cpu || 'normal' })), seed);
        const res = t.apply(t.resultAction(g.seats, r.ranking, r.picked));
        if (res) this.broadcastAct(res);
        return;
      }
      this.startGame({ game: g.key, lineup, seed }, {
        seats: pend.type === 'duelGame' ? g.seats : null,
        onDone: (result) => {
          const res = t.apply(t.resultAction(g.seats, result.ranking, result.picked));
          if (res) this.broadcastAct(res);
        },
      });
      return;
    }
    // 人の 手番: まつ(ずっと きめない ときは CPU が かわりに)
    const who = t.waitingFor();
    if (who !== null) {
      // その 子の 画面が まだ 演出中: 待ち時間は 見おわってから かぞえる(画面が 止まって いても いつかは かぞえはじめる)
      if ((this.tk.seen[who] ?? 0) < t.seq && now - this.tk.lastAt < SEEN_LIMIT_MS) this.tk.waitAt = now;
      if (now - this.tk.waitAt < HUMAN_LIMIT_MS) return;
      const res = t.apply(t.standIn());
      if (res) this.broadcastAct(res);
      return;
    }
    // CPU の 手番
    if (now - this.tk.lastAt < CPU_THINK_MS) return;
    const res = t.apply(t.autoAction());
    if (res) this.broadcastAct(res);
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
