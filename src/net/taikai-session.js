// オンラインの 大会(すごろく)の 進行(サーバーが もつ)。THREE にも DOM にも 触らない。
//
// すごろくは 時間ではなく「手番の 子の 操作」で すすむ(src/board/rules.js の act)。
// - 人の 手番: その 子の 画面から 操作が とどくのを まつ(apply)。
// - CPU の 手番・つながって いない 人の 手番: CPU が きめる(auto)。
// - 競技(minigame / duelGame): 部屋が 競技の 進行(session.js)を 回して、順位を もどす(apply に 結果を わたす)。
// 操作は 全部 番号(seq)を つけて 画面へ くばる。画面も おなじ act で すすめる(おなじ けっか)。
//
// players: [{ character, cpu: 性格 | null, name }](席の じゅん)

import { act, createTournament } from '../board/rules.js';
import { cpuAct, createCpu } from '../board/cpu.js';

export class TaikaiSession {
  constructor({ players, seed, stage = 'shiki', turns = 10 }) {
    this.players = players;
    this.seed = seed;
    this.s = createTournament(players.map((p) => ({ character: p.character, cpu: p.cpu, name: p.name })), seed, { stage, turns });
    // どの 席にも CPU を 用意する(人が ぬけたら かわりに 入る)
    this.cpus = players.map((p, i) => createCpu(p.cpu || 'normal', seed, i));
    this.human = players.map((p) => !p.cpu);
    this.online = players.map((p) => !p.cpu);
    this.seq = 0;
  }

  get done() { return this.s.phase === 'finished'; }
  get pending() { return this.s.pending; }
  setOnline(seat, on) { if (this.human[seat]) this.online[seat] = on; }

  // いま 人の 操作を まって いるか(その 席)
  waitingFor() {
    const p = this.s.pending;
    if (!p || p.type === 'minigame' || p.type === 'duelGame') return null;
    return this.human[p.slot] && this.online[p.slot] ? p.slot : null;
  }

  // 操作を すすめる。できない 操作なら null
  apply(action) {
    if (this.done) return null;
    const ev = act(this.s, action);
    if (ev[0]?.type === 'invalid') return null;
    this.seq++;
    return { seq: this.seq, action, ev };
  }

  // CPU(と つながって いない 人)の 手番を うつ
  autoAction() {
    const p = this.s.pending;
    if (!p || p.type === 'minigame' || p.type === 'duelGame') return null;
    if (this.waitingFor() !== null) return null;
    return cpuAct(this.cpus[p.slot], this.s, p.slot);
  }

  // 人が ずっと 決めないとき: CPU が かわりに
  standIn() {
    const p = this.s.pending;
    if (!p || p.type === 'minigame' || p.type === 'duelGame') return null;
    return cpuAct(this.cpus[p.slot], this.s, p.slot);
  }

  // 競技の 顔ぶれ。minigame は 5人(席の じゅん)、duelGame は 2人([a, b])
  gameLineup() {
    const p = this.s.pending;
    if (p?.type === 'minigame') return { key: p.game, seats: this.players.map((_, i) => i) };
    if (p?.type === 'duelGame') return { key: p.game, seats: [p.a, p.b] };
    return null;
  }
  // 競技の 順位(競技の 席の じゅん)を 大会の 操作に する
  resultAction(seats, ranking, picked) {
    const p = this.s.pending;
    if (p.type === 'minigame') return { type: 'minigameResult', ranking: ranking.map((k) => seats[k]), ...(picked ? { picked } : {}) };
    return { type: 'duelResult', winner: seats[ranking[0]] };
  }
}
