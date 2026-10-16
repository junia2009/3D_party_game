// どんぐり早うち のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 夕焼けの岩場。5人が横にならんで、どんぐり鉄砲をかまえる。ホーホー先生が「どんぐりの旗」をあげたら、
// いちばんに うつ。勝ちぬき: 1回ごとに、いちばん遅かった子(または おてつきした子)が脱落。最後の1人が勝ち。
//
// 1回の流れ: かまえて(ready)→ じっと待つ(wait。長さは毎回ちがう = じらし)→ 合図(go)→ 判定(judge)
// - 合図より前に うつと「おてつき」。待っているあいだには ひっかけ がまじる:
//   - nise(にせの合図): 先生が旗を半分あげて やめる・「どん…ぐりぃ…」と言いかける。
//   - jama(じゃまもの): 転がる草のまり・横切るカラス。気がそれる。
//   - gyaku(逆): 赤い旗「うつな!」。合図そっくりに出るが、うったら おてつき。
// - おてつきした子は、みんな脱落。おてつきがいなければ、いちばん遅い子が脱落。
//   のこっている子が全員おてつきしたときは、だれも脱落せず やりなおし。
// - 合図のあと goLimit 秒たっても うたなかったら、その時間で うったことにする(いちばん遅い)。
//
// inputs[slot]: このステップで うった(true)か。1回につき1発だけ。
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, randRange, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;
export const TIMES_OF_DAY = ['evening'];

export const RULES = {
  introTime: 2.0, // はじめの1回の前(会場を見せる)
  readyTime: 1.6, // 「かまえて…」
  wait: [1.8, 4.0], // 合図までの時間(ふつう)
  longWait: [4.8, 6.8], // ときどき、すごく長い(じらし)
  longChance: 0.22,
  goLimit: 1.5, // 合図のあと、これより遅いと「うてなかった」
  judgeTime: 2.8, // 判定を見せる時間
  fakeLife: 0.8, // ひっかけが見えている時間
  fakeGap: 0.45, // ひっかけと合図(ほかのひっかけ)のあいだを、これだけ あける
};

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:hayauchi`),
    phase: 'intro', // intro → ready → wait → go → judge → (ready …) → finished
    phaseT: 0,
    round: 0, // 何回目か(やりなおしも数える)
    redo: 0, // 続けて やりなおしになった回数
    winner: null,
    alive: players.map(() => true),
    out: [], // 脱落した順(席の番号)。同じ回なら、より悪いほうが先
    waitLen: 0,
    fakes: [], // この回のひっかけ { id, kind, at(wait の何秒目), shown }
    fake: null, // いま見えている ひっかけ { id, kind, left }
    goAt: null, // 合図が出た時刻(s.t)
    shots: players.map(() => null), // この回: { t(うった時刻), fault: 'ready' | 'wait' | ひっかけの種類 | null, react(合図からの秒) }
    nextId: 1,
    runners: players.map(() => ({ wins: 0, best: null, faults: 0 })),
    last: null, // さいごの判定 { out: [...], redo, times }
  };
  s.timeOfDay = TIMES_OF_DAY[0];
  return s;
}

export const aliveSlots = (s) => s.alive.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);

// この回の 待ち時間と ひっかけを決める。回が進むほど ひっかけが増える
function planRound(s) {
  s.round++;
  const long = nextRandom(s) < RULES.longChance && s.round > 1;
  s.waitLen = long ? randRange(s, RULES.longWait[0], RULES.longWait[1]) : randRange(s, RULES.wait[0], RULES.wait[1]);
  s.fakes = [];
  // 続けて やりなおしになったら、ひっかけなしの回にする(終わらなくならないように)
  if (s.redo >= 2) return;
  const n = s.round === 1 ? (nextRandom(s) < 0.5 ? 1 : 0) : Math.min(3, 1 + Math.floor(nextRandom(s) * (1 + s.round * 0.5)));
  let gyaku = false;
  for (let k = 0; k < n; k++) {
    let kind;
    const r = nextRandom(s);
    if (s.round === 1) kind = 'jama'; // はじめの回は やさしく
    else if (r < 0.2 && !gyaku) { kind = 'gyaku'; gyaku = true; }
    else kind = r < 0.6 ? 'nise' : 'jama';
    // 置ける時刻: はじめの 0.6 秒と、合図の直前は あける。ほかのひっかけとも はなす
    for (let tries = 0; tries < 8; tries++) {
      const at = randRange(s, 0.6, s.waitLen - RULES.fakeGap);
      if (at < 0.6) break;
      if (s.fakes.some((f) => Math.abs(f.at - at) < RULES.fakeLife + RULES.fakeGap)) continue;
      s.fakes.push({ id: s.nextId++, kind, at, shown: false });
      break;
    }
  }
  s.fakes.sort((a, b) => a.at - b.at);
}

function setPhase(s, phase, ev) {
  s.phase = phase;
  s.phaseT = 0;
  ev.push({ type: phase, round: s.round });
}

export function step(s, inputs) {
  const ev = [];
  if (s.phase === 'finished') return ev;
  const dt = STEP;
  s.t += dt;
  s.phaseT += dt;

  // うつ(1回に1発)
  if (s.phase === 'ready' || s.phase === 'wait' || s.phase === 'go') {
    for (const slot of aliveSlots(s)) {
      if (!inputs[slot] || s.shots[slot]) continue;
      if (s.phase === 'go') {
        const react = s.t - s.goAt;
        s.shots[slot] = { t: s.t, fault: null, react };
        ev.push({ type: 'shot', slot, react });
      } else {
        // 合図より前: おてつき。なにに つられたか(見えている ひっかけ)
        const fault = s.phase === 'ready' ? 'ready' : s.fake ? s.fake.kind : 'wait';
        s.shots[slot] = { t: s.t, fault, react: null };
        s.runners[slot].faults++;
        ev.push({ type: 'fault', slot, kind: fault });
      }
    }
  }

  if (s.phase === 'intro') {
    if (s.phaseT >= RULES.introTime) {
      planRound(s);
      setPhase(s, 'ready', ev);
    }
  } else if (s.phase === 'ready') {
    if (s.phaseT >= RULES.readyTime) setPhase(s, 'wait', ev);
  } else if (s.phase === 'wait') {
    // ひっかけ
    if (s.fake) {
      s.fake.left -= dt;
      if (s.fake.left <= 0) s.fake = null;
    }
    for (const f of s.fakes) {
      if (f.shown || s.phaseT < f.at) continue;
      f.shown = true;
      s.fake = { id: f.id, kind: f.kind, left: RULES.fakeLife };
      ev.push({ type: 'fake', id: f.id, kind: f.kind });
    }
    // みんな おてつきしたら、合図を待たずに判定へ
    const alive = aliveSlots(s);
    if (alive.every((i) => s.shots[i])) judge(s, ev);
    else if (s.phaseT >= s.waitLen) {
      s.fake = null;
      s.goAt = s.t;
      setPhase(s, 'go', ev);
    }
  } else if (s.phase === 'go') {
    const alive = aliveSlots(s);
    if (alive.every((i) => s.shots[i]) || s.phaseT >= RULES.goLimit) {
      // うてなかった子は、goLimit で うったことにする
      for (const i of alive) if (!s.shots[i]) s.shots[i] = { t: s.goAt + RULES.goLimit, fault: null, react: RULES.goLimit, late: true };
      judge(s, ev);
    }
  } else if (s.phase === 'judge') {
    if (s.phaseT >= RULES.judgeTime) {
      if (aliveSlots(s).length <= 1) {
        s.phase = 'finished';
        s.winner = aliveSlots(s)[0];
        ev.push({ type: 'finished', winner: s.winner });
      } else {
        s.shots = s.shots.map(() => null);
        s.goAt = null;
        planRound(s);
        setPhase(s, 'ready', ev);
      }
    }
  }
  return ev;
}

function judge(s, ev) {
  const alive = aliveSlots(s);
  const faulted = alive.filter((i) => s.shots[i]?.fault);
  let out = [];
  let redo = false;
  if (faulted.length === alive.length) {
    redo = true; // みんな おてつき: やりなおし
    s.redo++;
  } else if (faulted.length) {
    // 早く おてつきした子ほど、順位が下
    out = faulted.sort((a, b) => s.shots[a].t - s.shots[b].t);
    s.redo = 0;
  } else {
    // いちばん遅い子。同じ速さなら くじ
    const slowT = Math.max(...alive.map((i) => s.shots[i].react));
    const slow = alive.filter((i) => s.shots[i].react >= slowT - 1e-9);
    out = [slow[Math.floor(nextRandom(s) * slow.length)]];
    s.redo = 0;
  }
  // いちばん速かった子(おてつきでない子のなかで)
  const fair = alive.filter((i) => !s.shots[i]?.fault && !s.shots[i]?.late);
  let fastest = null;
  for (const i of fair) {
    const r = s.shots[i].react;
    if (fastest === null || r < s.shots[fastest].react) fastest = i;
    const run = s.runners[i];
    if (run.best === null || r < run.best) run.best = r;
  }
  if (fastest !== null) s.runners[fastest].wins++;
  for (const i of out) s.alive[i] = false;
  s.out.push(...out);
  s.last = { out, redo, fastest, shots: s.shots.map((x) => (x ? { ...x } : null)) };
  s.fake = null;
  setPhase(s, 'judge', ev);
  ev[ev.length - 1] = { type: 'judge', round: s.round, out, redo, fastest };
}

// 順位: 勝った子、そのあとは 脱落がおそい順
export function ranking(s) {
  const alive = aliveSlots(s);
  return [...alive, ...[...s.out].reverse()];
}
