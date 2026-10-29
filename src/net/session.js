// オンラインの 競技 1回ぶんの 進行(サーバーが もつ)。THREE にも DOM にも触らない。
//
// ルールの 計算は サーバーだけが する(権威)。画面は 入力を 送って、とどいた 状態を 映す。
// - 人の 席: 画面から とどいた 入力を じゅんばんに 1刻み 1つずつ つかう(とどく 間隔の ゆれを ならす)。
//   入力が まだ とどいて いない ときは、さいごの 入力を くりかえす。ただし 1回きりの 入力 ── 投げる・たたく・とぶ ──
//   は くりかえさない(2回 つかわない ため)。どれが 1回きりかは 競技ごとに PULSE で きめる。
// - CPU の 席・つながって いない 人の 席: CPU が うごかす。
//
// players: [{ character, cpu: 性格 | null, name }](席の じゅん)

import { GAMES } from '../board/simulate.js';

const MAX_QUEUE = 8; // これより たまったら 古い ものから すてる(おくれを ためない)
// 入力が これより たまって いたら、1刻みに 1つずつ「なくても こまらない もの」を すてて へらす。
// 画面と サーバーは おなじ はやさで 刻むので、いちど たまった ぶんは へらさないと ずっと おくれた ままに なる
const KEEP_QUEUE = 2;
const same = (a, b) => a === b || (a && b && JSON.stringify(a) === JSON.stringify(b));

// 競技ごとの 1回きりの 入力。
//   'all'    : 入力 まるごと 1回きり(投げる・えらぶ・たたく)。くりかえさない
//   [名前…]  : その 項目だけ 1回きり。ほかの 項目(スティック・ねらい・おして いるか)は くりかえす
// ひっぱって ねらう(けしごむ)や スティックの ように 毎刻み すこしずつ かわる 入力も、くりかえす 側に 入れる。
// 「まったく おなじ ときだけ くりかえす」に すると、うごかして いる あいだに 入力が とぎれた とき「はなした」ことに なる
export const PULSE = {
  bowl: 'all', kakure: 'all', hayauchi: 'all', tsuna: 'all', mato: 'all', tsumi: 'all', mame: 'all', ikada: 'all',
  daruma: [], nawa: [], sled: [], catch: [], hana: [], ehon: [], hikouki: [], meiro: [], otoshi: [], keshigomu: [],
  bumper: [], sumo: [],
  dasshutsu: ['open'], kazan: ['jump'], kinoko: ['jump'], volley: ['hit'], yuki: ['throw', 'make'], ramune: ['pop'],
  wataame: ['zarame'],
};

// 入力が とどかない 刻みに つかう もの(さいごの 入力から 1回きりの ところを のぞく)
export function repeatInput(pulse, last) {
  if (last === null || last === undefined || pulse === 'all') return null;
  if (typeof last !== 'object') return last;
  const out = { ...last };
  for (const k of pulse) if (k in out) out[k] = typeof out[k] === 'boolean' ? false : null;
  return out;
}

// すてても こまらない 入力か(前の 入力 prev の すぐ あと)。何も して いない・おなじ・
// スティックや ねらいが すこし かわった だけ(1回きりの 入力を ふくまず、おして いるか などの 切りかえも ない)
function droppable(pulse, v, prev) {
  if (v === null || same(v, prev)) return true;
  if (pulse === 'all' || typeof v !== 'object' || !prev || typeof prev !== 'object') return false;
  for (const k of Object.keys(v)) {
    if (pulse.includes(k) ? v[k] : typeof v[k] !== 'number' && v[k] !== null && !same(v[k], prev[k])) return false;
  }
  return true;
}
function dropOne(pulse, q, last) {
  for (let i = 0; i < q.length; i++) {
    if (droppable(pulse, q[i], i ? q[i - 1] : last)) { q.splice(i, 1); return true; }
  }
  return false;
}

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
    this.used = players.map(() => null); // いまの 刻みで つかった 入力(画面の よそくに わたす)
    this.tick = 0;
    this.pulse = PULSE[key] ?? 'all';
  }

  get STEP() { return this.g.rules.STEP; }
  get done() { return this.s.phase === 'finished'; }

  // 人の 入力が とどいた(刻みの じゅんに 1つずつ)
  push(seat, inputs) {
    if (!this.human[seat] || !Array.isArray(inputs)) return;
    const q = this.queues[seat];
    for (const v of inputs.slice(-MAX_QUEUE)) q.push(v ?? null);
    while (q.length > MAX_QUEUE) if (!dropOne(this.pulse, q, this.last[seat])) q.shift();
  }

  setOnline(seat, on) {
    if (!this.human[seat]) return;
    this.online[seat] = on;
    if (!on) { this.queues[seat] = []; this.last[seat] = null; }
  }

  inputFor(seat) {
    if (!this.human[seat] || !this.online[seat]) return this.g.input(this.cpus[seat], this.s, seat);
    const q = this.queues[seat];
    if (q.length > KEEP_QUEUE) dropOne(this.pulse, q, this.last[seat]);
    if (q.length) {
      const v = q.shift();
      this.last[seat] = v;
      return v;
    }
    // まだ とどかない: さいごの 入力を くりかえす(1回きりの ところは のぞく)。くりかえした ものも つぎの「さいご」
    return (this.last[seat] = repeatInput(this.pulse, this.last[seat]));
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
