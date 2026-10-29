// オンラインの 競技 1回ぶんの 進行(サーバーが もつ)。THREE にも DOM にも触らない。
//
// ルールの 計算は サーバーだけが する(権威)。画面は 入力を 送って、とどいた 状態を 映す。
// - 人の 席: 画面から とどいた 入力を じゅんばんに 1刻み 1つずつ つかう(とどく 間隔の ゆれを ならす)。
//   入力が まだ とどいて いない ときは、つづけて おして いる ものだけ くりかえす
//   (1回きりの 入力 ── 投げる・たたく など ── を 2回 つかわない ため)。
// - CPU の 席・つながって いない 人の 席: CPU が うごかす。
//
// players: [{ character, cpu: 性格 | null, name }](席の じゅん)

import { GAMES } from '../board/simulate.js';

const MAX_QUEUE = 8; // これより たまったら 古い ものから すてる(おくれを ためない)
const same = (a, b) => a === b || (a && b && JSON.stringify(a) === JSON.stringify(b));

export class MinigameSession {
  constructor({ key, players, seed }) {
    const g = GAMES[key];
    if (!g) throw new Error(`競技が ない: ${key}`);
    this.key = key;
    this.g = g;
    this.seed = seed;
    this.players = players;
    this.s = g.rules.createGame(players.map((p, i) => ({ id: `p${i}`, character: p.character, name: p.name })), seed);
    // どの 席にも CPU を 用意する(人が ぬけたら かわりに 入る)
    this.cpus = players.map((p, i) => g.createCpu(p.cpu || 'normal', seed, i));
    this.human = players.map((p) => !p.cpu);
    this.online = players.map((p) => !p.cpu);
    this.queues = players.map(() => []);
    this.last = players.map(() => null);
    this.hold = players.map(() => false); // さいごの 入力が つづけて おして いる ものか
    this.used = players.map(() => null); // いまの 刻みで つかった 入力(画面の よそくに わたす)
    this.tick = 0;
  }

  get STEP() { return this.g.rules.STEP; }
  get done() { return this.s.phase === 'finished'; }

  // 人の 入力が とどいた(刻みの じゅんに 1つずつ)
  push(seat, inputs) {
    if (!this.human[seat] || !Array.isArray(inputs)) return;
    const q = this.queues[seat];
    for (const v of inputs.slice(-MAX_QUEUE)) q.push(v ?? null);
    while (q.length > MAX_QUEUE) q.shift();
  }

  setOnline(seat, on) {
    if (!this.human[seat]) return;
    this.online[seat] = on;
    if (!on) { this.queues[seat] = []; this.last[seat] = null; this.hold[seat] = false; }
  }

  inputFor(seat) {
    if (!this.human[seat] || !this.online[seat]) return this.g.input(this.cpus[seat], this.s, seat);
    const q = this.queues[seat];
    if (q.length) {
      const v = q.shift();
      this.hold[seat] = v !== null && same(v, this.last[seat]);
      this.last[seat] = v;
      return v;
    }
    return this.hold[seat] ? this.last[seat] : null;
  }

  // 1刻み すすめる。できごとを かえす
  step() {
    if (this.done) return [];
    const inputs = this.players.map((_, seat) => this.inputFor(seat));
    this.used = inputs;
    this.tick++;
    return this.g.rules.step(this.s, inputs);
  }

  result() {
    return { ranking: this.g.rules.ranking(this.s), picked: this.g.picked(this.s) };
  }
}
