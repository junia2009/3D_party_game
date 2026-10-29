// オンラインの 部屋(ロビー)の きまり。WebSocket にも Durable Object にも 触らない(テストで そのまま 動かす)。
//
// - 席は 5つ。人が すわり、あいた 席は はじめる ときに CPU で うめる。
// - さいしょに 入った 人が ホスト(あそびを えらんで はじめる)。ホストが ぬけたら 次の 人へ。
// - キャラは 人どうしで かぶらない。
// - あそび: 'game'(競技を 1つずつ)/ 'taikai'(すごろく)。
// - ロビーで ぬけた 人の 席は すぐ あける。あそんで いる とちゅうに 切れた 人は 席を のこす(CPU が かわりに うごく。もどれる)。

import { nextRandom, seedFrom } from '../src/rng.js';

export const SEATS = 5;
export const CODE_LENGTH = 4;
// 人が えらべる キャラ(ゲストも えらべる)。CPU は ゲストを つかわない
export const CHARACTER_KEYS = ['ponta', 'mimi', 'gonzo', 'penne', 'konko', 'kerosuke', 'kirin', 'ray'];
const CPU_KEYS = CHARACTER_KEYS.filter((k) => k !== 'ray');
const NAMES = { ponta: 'ポン太', mimi: 'ミミ', gonzo: 'ゴンゾ', penne: 'ペンネ', konko: 'コンコ', kerosuke: 'ケロスケ', kirin: 'キリコ', ray: 'レイ' };
export const PERSONALITY = ['cautious', 'normal', 'bold'];
export const STAGES = ['shiki', 'yuen'];
export const TURNS = [5, 10, 15];

// あいことばは 数字 4けた(0 から はじまらない)
export function makeRoomCode(rand = Math.random) {
  return String(1000 + Math.floor(rand() * 9000));
}
export function normalizeRoomCode(s) {
  return String(s ?? '').replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
}
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 10);

export class RoomCore {
  constructor({ code, isPublic = false, games = [] }) {
    this.code = code;
    this.isPublic = isPublic;
    this.games = games; // えらべる 競技(サーバーが わたす)
    this.seats = Array(SEATS).fill(null);
    this.host = null; // clientId
    this.phase = 'lobby'; // lobby | playing
    this.settings = { mode: 'game', game: 'random', stage: 'shiki', turns: 10 };
    this.round = 0;
    this.lastActivityAt = Date.now();
  }

  static fromJSON(o) {
    const r = new RoomCore({ code: o.code, isPublic: o.isPublic, games: o.games });
    Object.assign(r, o);
    return r;
  }
  toJSON() {
    const { code, isPublic, games, seats, host, phase, settings, round, lastActivityAt } = this;
    return { code, isPublic, games, seats, host, phase, settings, round, lastActivityAt };
  }

  touch() { this.lastActivityAt = Date.now(); }
  seatOf(clientId) { return this.seats.findIndex((s) => s?.clientId === clientId); }
  humans() { return this.seats.filter(Boolean); }
  isFull() { return this.seats.every(Boolean); }
  isDeserted() { return !this.seats.some((s) => s?.connected); }
  // だれとでも(自動マッチ)の 部屋で、まだ 入れるか
  isOpen() { return this.isPublic && this.phase === 'lobby' && !this.isFull(); }

  join({ clientId, name, character }) {
    if (!clientId) return { error: 'clientId が ありません' };
    this.touch();
    const old = this.seatOf(clientId);
    if (old >= 0) {
      // もどって きた(つなぎなおし)
      Object.assign(this.seats[old], { connected: true, name: cleanName(name) || this.seats[old].name });
      if (!this.host || this.seatOf(this.host) < 0) this.host = clientId;
      return { seat: old, back: true };
    }
    if (this.phase !== 'lobby') return { error: 'いま あそんで いる とちゅうです。おわるまで まってね' };
    const seat = this.seats.findIndex((s) => !s);
    if (seat < 0) return { error: '部屋が いっぱいです' };
    const taken = new Set(this.humans().map((s) => s.character));
    const want = CHARACTER_KEYS.includes(character) && !taken.has(character) ? character : CHARACTER_KEYS.find((k) => !taken.has(k));
    this.seats[seat] = { clientId, name: cleanName(name) || NAMES[want], character: want, connected: true };
    if (!this.host || this.seatOf(this.host) < 0) this.host = clientId;
    return { seat };
  }

  // 切れた。ロビーなら 席を あける。あそんで いる とちゅうなら 席は のこす
  disconnect(clientId) {
    const seat = this.seatOf(clientId);
    if (seat < 0) return { seat: -1 };
    this.touch();
    if (this.phase === 'lobby') this.seats[seat] = null;
    else this.seats[seat].connected = false;
    this.fixHost();
    return { seat };
  }
  // 自分から ぬけた(席を あける。あそんで いる とちゅうは CPU が のこりを やる)
  leave(clientId) {
    const seat = this.seatOf(clientId);
    if (seat < 0) return { seat: -1 };
    if (this.phase === 'lobby') this.seats[seat] = null;
    else this.seats[seat] = { ...this.seats[seat], connected: false, left: true };
    this.fixHost();
    return { seat };
  }
  fixHost() {
    const h = this.seatOf(this.host);
    if (h >= 0 && this.seats[h].connected) return;
    const next = this.seats.find((s) => s?.connected);
    this.host = next ? next.clientId : null;
  }

  setCharacter(clientId, character) {
    const seat = this.seatOf(clientId);
    if (seat < 0) return { error: '席が ありません' };
    if (this.phase !== 'lobby') return { error: 'いまは かえられません' };
    if (!CHARACTER_KEYS.includes(character)) return { error: 'しらない キャラです' };
    if (this.seats.some((s, i) => i !== seat && s?.character === character)) return { error: 'ほかの 子が つかって います' };
    this.seats[seat].character = character;
    this.touch();
    return { ok: true };
  }

  setSettings(clientId, patch = {}) {
    if (clientId !== this.host) return { error: 'ホストだけが きめられます' };
    if (this.phase !== 'lobby') return { error: 'いまは かえられません' };
    const s = { ...this.settings };
    if (patch.mode === 'game' || patch.mode === 'taikai') s.mode = patch.mode;
    if (patch.game === 'random' || this.games.includes(patch.game)) s.game = patch.game;
    if (STAGES.includes(patch.stage)) s.stage = patch.stage;
    if (TURNS.includes(Number(patch.turns))) s.turns = Number(patch.turns);
    this.settings = s;
    this.touch();
    return { ok: true };
  }

  // はじめる: あいた 席を CPU で うめた 顔ぶれと、種を きめる
  start(clientId, now = Date.now()) {
    if (clientId !== this.host) return { error: 'ホストだけが はじめられます' };
    if (this.phase !== 'lobby') return { error: 'もう はじまって います' };
    if (!this.humans().length) return { error: 'だれも いません' };
    this.round++;
    const seed = seedFrom(`${this.code}:${this.round}:${now}`);
    const pick = { rng: seedFrom(`${seed}:lineup`) };
    const free = CPU_KEYS.filter((k) => !this.seats.some((s) => s?.character === k));
    const lineup = this.seats.map((s) => {
      if (s) return { character: s.character, cpu: null, name: s.name, human: true };
      const character = free.splice(Math.floor(nextRandom(pick) * free.length), 1)[0];
      return { character, cpu: PERSONALITY[Math.floor(nextRandom(pick) * PERSONALITY.length)], name: NAMES[character] };
    });
    let game = this.settings.game;
    if (this.settings.mode === 'game' && game === 'random') game = this.games[Math.floor(nextRandom(pick) * this.games.length)];
    this.phase = 'playing';
    this.touch();
    return { lineup, seed, mode: this.settings.mode, game, stage: this.settings.stage, turns: this.settings.turns };
  }

  // あそびが おわった: ロビーへ もどる。切れたままの 人の 席は あける
  finish() {
    this.phase = 'lobby';
    this.seats = this.seats.map((s) => (s && s.connected && !s.left ? s : null));
    this.fixHost();
    this.touch();
  }

  lobbyInfo() {
    return {
      code: this.code,
      isPublic: this.isPublic,
      phase: this.phase,
      settings: this.settings,
      hostSeat: this.seatOf(this.host),
      seats: this.seats.map((s) => (s ? { name: s.name, character: s.character, connected: s.connected } : null)),
    };
  }
}
