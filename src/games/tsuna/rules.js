// 川原の つなひき のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 小川をはさんで 3人対3人で つなを引く。つなの まん中の 目じるしが 自分の陣へ WIN だけ来たら勝ち
// (負けた チームは 小川に ざぶん)。TIME_LIMIT 秒で決まらなければ、目じるしが よっているほうの勝ち。
// - チーム: くじで 左(L)・右(R)へ。3人に たりない チームには、森の なかま(すけっと CPU)が入る。
// - 引く: 連打。タップ 1回ごとに つなを ぐいっ。ただし 1秒に tapCap 回まで(それより速くても 強くならない)。
// - せーのの ふいうち: 先生が ふいに「せーの!」。seenoTime 秒のあいだ、引く力が 2倍。
// - すべる どろ: ときどき 足もとが つるっ。slipTaps 回 すばやく 連打すれば ふんばれる。まにあわないと 少しのあいだ 引けない。
// - うしろから 応援: 負けている チームは 観客の 応援で 少し 力が ふえる(逆転しやすい)。
// 順位: 勝った チームの子を よく引いた順、そのあと 負けた チームの子を よく引いた順。
//
// inputs[slot]: このステップで タップしたか(true / false)。
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, randRange, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;
export const TIMES_OF_DAY = ['morning', 'day', 'evening'];
export const TEAM_SIZE = 3;

export const RULES = {
  readyTime: 3.2, // 「よーい」
  timeLimit: 40,
  win: 1.6, // 目じるしが ここまで来たら勝ち(m)
  tapCap: 9, // 1秒に 数える タップの 上限(はやすぎる 連打は 強くならない)
  tapBurst: 2, // ためておける タップ
  pullTap: 1.0,
  helperPower: 1.0, // すけっとの 力(3人に たりない チームを 少し たすけるくらい)
  helperRate: 5.7, // すけっとの 連打(1秒あたり)
  kick: 0.1, // タップ 1回の 力 あたりの つなの いきおい
  damp: 1.6,
  slide: 0.3, // ずるずる: 目じるしが よるほど、そのまま 引きこまれやすい(1度 動きだすと 止めにくい)
  seenoEvery: [3.5, 7], // 「せーの!」の 間かく(ふいうち)
  seenoFirst: 3,
  seenoWarn: 0.5, // 先生が 羽を あげてから 「せーの!」まで
  seenoTime: 0.9,
  seenoPower: 2,
  slipEvery: [7, 12], // ひとりごとに すべる 間かく
  slipFirst: 5,
  slipTaps: 5, // この回数 連打すれば ふんばれる
  slipSave: 1.4, // この秒のうちに
  slipDown: 1.2, // まにあわなかったら 引けない 時間
  cheerFrom: 0.5, // 目じるしが これより 相手がわへ 行ったら 応援
  cheerMax: 0.2, // 応援で ふえる 力(負けが こむほど。さいだい +20%)
};

const unit = (side) => ({ side, pull: 0, taps: 0, seenoTaps: 0, slips: 0, saves: 0, tokens: RULES.tapBurst, slip: null, down: 0, nextSlip: 0, lastPull: -1 });

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:tsuna`),
    phase: 'ready', // ready → play → finished
    p: 0, // 目じるしの位置(+ が R がわ)
    v: 0,
    seeno: { state: 'wait', at: RULES.readyTime + RULES.seenoFirst, n: 0 }, // wait → warn → on → wait
    winner: null, // 勝ったチーム 'L' | 'R'
    teams: { L: [], R: [] }, // 席の番号(すけっとは -1, -2 …)
    runners: players.map(() => unit('L')),
    helpers: [], // unit + { kind, nextTap }
  };
  s.timeOfDay = TIMES_OF_DAY[Math.floor(nextRandom(s) * TIMES_OF_DAY.length)];
  // チーム分けは くじ(席を まぜてから こうごに)
  const order = s.runners.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(s) * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  order.forEach((slot, k) => { s.runners[slot].side = k % 2 ? 'R' : 'L'; s.teams[s.runners[slot].side].push(slot); });
  const kinds = ['risu', 'harinezumi', 'komadori'];
  let hk = 0;
  for (const side of ['L', 'R']) {
    while (s.teams[side].length < TEAM_SIZE) {
      s.helpers.push({ ...unit(side), kind: kinds[hk++ % kinds.length], nextTap: RULES.readyTime });
      s.teams[side].push(-s.helpers.length);
    }
  }
  // すべる 時刻(ひとりずつ ずらす)
  for (const u of [...s.runners, ...s.helpers]) u.nextSlip = RULES.readyTime + RULES.slipFirst + randRange(s, 0, 6);
  return s;
}

export const playTime = (s) => Math.max(0, s.t - RULES.readyTime);
export const timeLeft = (s) => Math.max(0, RULES.timeLimit - playTime(s));
export const seenoOn = (s) => s.seeno.state === 'on';
// 応援の 力の かけ算(負けている チームほど 大きい)
export function cheer(s, side) {
  const toward = side === 'R' ? -s.p : s.p; // 目じるしが 相手がわへ 行っていれば 負けている
  if (toward <= RULES.cheerFrom) return 1;
  return 1 + RULES.cheerMax * Math.min(1, (toward - RULES.cheerFrom) / (RULES.win - RULES.cheerFrom));
}

// タップ 1回。u は runner か helper
function tap(s, u, ev, who) {
  // すべっている: 連打で ふんばる
  if (u.slip !== null) {
    if (++u.slip.taps >= RULES.slipTaps) {
      u.slip = null;
      if (who >= 0) u.saves++;
      ev.push({ type: 'save', who });
    }
    return;
  }
  if (u.down > 0 || u.tokens < 1) return;
  u.tokens -= 1;
  const on = seenoOn(s);
  let pull = RULES.pullTap * (on ? RULES.seenoPower : 1);
  if (who < 0) pull *= RULES.helperPower;
  pull *= cheer(s, u.side);
  u.pull += pull;
  u.taps++;
  if (on) u.seenoTaps++;
  s.v += (u.side === 'R' ? 1 : -1) * pull * RULES.kick;
  u.lastPull = s.t;
  ev.push({ type: 'pull', who, side: u.side, seeno: on, pull });
}

// すけっと CPU の 連打(ルールの乱数で決める。ふつうくらいの うでまえ)
function helperInput(s, h) {
  if (s.t < h.nextTap) return false;
  const rate = RULES.helperRate * (seenoOn(s) ? 1.15 : 1);
  h.nextTap = s.t + (1 / rate) * randRange(s, 0.7, 1.3);
  return true;
}

function updateSeeno(s, ev) {
  const g = s.seeno;
  if (s.t < g.at) return;
  if (g.state === 'wait') {
    g.state = 'warn';
    g.at = s.t + RULES.seenoWarn;
    ev.push({ type: 'seenoWarn' });
  } else if (g.state === 'warn') {
    g.state = 'on';
    g.at = s.t + RULES.seenoTime;
    g.n++;
    ev.push({ type: 'seeno' });
  } else {
    g.state = 'wait';
    g.at = s.t + randRange(s, RULES.seenoEvery[0], RULES.seenoEvery[1]) - RULES.seenoWarn;
    ev.push({ type: 'seenoEnd' });
  }
}

export function step(s, inputs) {
  const ev = [];
  if (s.phase === 'finished') return ev;
  const dt = STEP;
  s.t += dt;
  if (s.phase === 'ready' && s.t >= RULES.readyTime) {
    s.phase = 'play';
    ev.push({ type: 'start' });
  }
  if (s.phase !== 'play') return ev;
  updateSeeno(s, ev);
  const all = [...s.runners.map((u, i) => [u, i]), ...s.helpers.map((u, i) => [u, -1 - i])];
  for (const [u, who] of all) {
    u.down = Math.max(0, u.down - dt);
    u.tokens = Math.min(RULES.tapBurst, u.tokens + RULES.tapCap * dt);
    // すべる
    if (u.slip === null && u.down <= 0 && s.t >= u.nextSlip) {
      u.slip = { at: s.t, taps: 0 };
      u.nextSlip = s.t + randRange(s, RULES.slipEvery[0], RULES.slipEvery[1]);
      if (who >= 0) u.slips++;
      ev.push({ type: 'slip', who });
    }
    if (u.slip !== null && s.t - u.slip.at > RULES.slipSave) {
      u.slip = null;
      u.down = RULES.slipDown;
      ev.push({ type: 'fall', who });
    }
    const pressed = who >= 0 ? !!inputs[who] : helperInput(s, u);
    if (pressed) tap(s, u, ev, who);
  }
  // つなが動く
  s.v += s.p * RULES.slide * dt;
  s.p += s.v * dt;
  s.v *= Math.exp(-RULES.damp * dt);
  if (Math.abs(s.p) >= RULES.win || timeLeft(s) <= 0) {
    s.phase = 'finished';
    s.winner = s.p >= 0 ? 'R' : 'L';
    if (s.p === 0) s.winner = nextRandom(s) < 0.5 ? 'L' : 'R';
    ev.push({ type: 'finished', winner: s.winner, timeUp: Math.abs(s.p) < RULES.win });
  }
  return ev;
}

export function ranking(s) {
  const order = (side) => s.runners.map((r, i) => i).filter((i) => s.runners[i].side === side).sort((a, b) => s.runners[b].pull - s.runners[a].pull || a - b);
  const w = s.winner ?? (s.p >= 0 ? 'R' : 'L');
  return [...order(w), ...order(w === 'R' ? 'L' : 'R')];
}
