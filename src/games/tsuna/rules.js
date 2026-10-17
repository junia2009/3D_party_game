// 川原の つなひき のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 小川をはさんで 3人対3人で つなを引く。つなの まん中の 目じるしが 自分の陣へ WIN だけ来たら勝ち
// (負けた チームは 小川に ざぶん)。TIME_LIMIT 秒で決まらなければ、目じるしが よっているほうの勝ち。
// - チーム: くじで 左(L)・右(R)へ。3人に たりない チームには、森の なかま(すけっと CPU)が入る。
// - 引く: 「せーの!」の 合図(ビート)に 合わせて タップ。ぴったりほど 強く引ける。でたらめに 連打しても 少しだけ。
// - せーのの ふいうち: ときどき リズムが 速く(または ゆっくり)なる。
// - すべる どろ: ときどき 足もとが つるっ。すぐ タップすれば ふんばれる。まにあわないと 少しのあいだ 引けない。
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
  readyTime: 3.2, // 「よーい」(最初の ビートまで)
  timeLimit: 40,
  win: 1.6, // 目じるしが ここまで来たら勝ち(m)
  beat: 0.85, // ふつうの リズム(秒)
  fast: 0.62,
  slow: 1.15,
  perfect: 0.09, // ぴったり(ビートから ±秒。スマホの おくれも ふくめて ゆるめ)
  good: 0.18,
  pullPerfect: 1.0,
  pullGood: 0.72,
  pullMiss: 0.18, // ずれて タップ(1ビートに 1回目)
  pullSpam: 0.05, // 同じ ビートで 2回目より あとの タップ(3回まで)
  spamMax: 3,
  helperPower: 0.8, // すけっとの 力(3人に たりない チームを 少し たすけるくらい)
  kick: 0.55, // 力の差 1 あたりの つなの いきおい
  damp: 2.0,
  slipEvery: [7, 12], // ひとりごとに すべる 間かく
  slipFirst: 6,
  slipSave: 0.7, // この秒のうちに タップすれば ふんばれる
  slipDown: 1.3, // まにあわなかったら 引けない 時間
  cheerFrom: 0.5, // 目じるしが これより 自分がわに 来たら 応援
  cheerMax: 0.35, // 応援で ふえる 力(負けが こむほど。さいだい +35%)
};

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:tsuna`),
    phase: 'ready', // ready → play → finished
    p: 0, // 目じるしの位置(+ が R がわ)
    v: 0,
    beats: [], // { t, kind: 'normal' | 'fast' | 'slow' }
    nextBeat: 0, // まだ 判定していない いちばん前の ビート
    winner: null, // 勝ったチーム 'L' | 'R'
    teams: { L: [], R: [] }, // 席の番号(すけっとは -1, -2 …)
    members: [], // { id(席 or すけっと), side, helper, kind? }
    runners: players.map((_, slot) => ({ side: slot % 2 ? 'R' : 'L', pull: 0, perfect: 0, good: 0, slips: 0, saves: 0, lastBeat: -1, taps: 0, slip: null, down: 0, nextSlip: 0, lastPull: 0 })),
    helpers: [], // { side, kind, pull, rng 用の 次のタップ時刻, down, slip, nextSlip, lastBeat }
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
      const h = { side, kind: kinds[hk++ % kinds.length], pull: 0, lastBeat: -1, tapAt: null, down: 0, slip: null, nextSlip: 0, lastPull: 0 };
      s.helpers.push(h);
      s.teams[side].push(-s.helpers.length);
    }
  }
  // すべる 時刻(ひとりずつ ずらす)
  for (const u of [...s.runners, ...s.helpers]) u.nextSlip = RULES.readyTime + RULES.slipFirst + randRange(s, 0, 5);
  // ビート: ふつうの リズムを 6〜9 拍、そのあと ときどき 4 拍だけ 速く(か ゆっくり)
  let t = RULES.readyTime, n = 0, run = 6 + Math.floor(nextRandom(s) * 4);
  while (t < RULES.readyTime + RULES.timeLimit + 2) {
    s.beats.push({ t, kind: 'normal' });
    t += RULES.beat;
    if (++n >= run) {
      n = 0;
      run = 6 + Math.floor(nextRandom(s) * 4);
      const kind = nextRandom(s) < 0.65 ? 'fast' : 'slow';
      for (let k = 0; k < 4; k++) {
        s.beats.push({ t, kind });
        t += kind === 'fast' ? RULES.fast : RULES.slow;
      }
    }
  }
  return s;
}

export const playTime = (s) => Math.max(0, s.t - RULES.readyTime);
export const timeLeft = (s) => Math.max(0, RULES.timeLimit - playTime(s));
// いちばん近い ビートの番号
export function nearestBeat(s, t = s.t) {
  let best = 0, bd = Infinity;
  for (let i = Math.max(0, s.nextBeat - 2); i < Math.min(s.beats.length, s.nextBeat + 3); i++) {
    const d = Math.abs(s.beats[i].t - t);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
// 応援の 力の かけ算(負けている チームほど 大きい)
export function cheer(s, side) {
  const toward = side === 'R' ? s.p : -s.p; // 自分がわへ 来ていれば 負けている
  if (toward <= RULES.cheerFrom) return 1;
  return 1 + RULES.cheerMax * Math.min(1, (toward - RULES.cheerFrom) / (RULES.win - RULES.cheerFrom));
}

// タップ 1回の 力。u は runner か helper
function tap(s, u, ev, who) {
  // すべっている: ふんばる
  if (u.slip !== null) {
    u.slip = null;
    if (who >= 0) u.saves++;
    ev.push({ type: 'save', who });
    return;
  }
  if (u.down > 0) return;
  const bi = nearestBeat(s);
  const d = Math.abs(s.beats[bi].t - s.t);
  let pull, grade;
  if (u.lastBeat !== bi) {
    u.lastBeat = bi;
    u.taps = 1;
    if (d <= RULES.perfect) { pull = RULES.pullPerfect; grade = 'perfect'; }
    else if (d <= RULES.good) { pull = RULES.pullGood; grade = 'good'; }
    else { pull = RULES.pullMiss; grade = 'miss'; }
  } else {
    if (++u.taps > RULES.spamMax) return;
    pull = RULES.pullSpam; grade = 'spam';
  }
  if (who < 0) pull *= RULES.helperPower;
  pull *= cheer(s, u.side);
  u.pull += pull;
  if (who >= 0) { if (grade === 'perfect') u.perfect++; else if (grade === 'good') u.good++; }
  s.v += (u.side === 'R' ? 1 : -1) * pull * RULES.kick;
  u.lastPull = s.t;
  ev.push({ type: 'pull', who, side: u.side, grade, pull });
}

// すけっと CPU の タップ(ルールの乱数で決める。ふつうくらいの うでまえ)
function helperInput(s, h) {
  if (h.slip !== null) return s.t - h.slip.at > 0.35 && nextRandom(s) < 0.1;
  const b = s.beats[s.nextBeat];
  if (!b) return false;
  if (h.tapAt === null || h.tapFor !== s.nextBeat) {
    h.tapFor = s.nextBeat;
    // ふつう: ±0.08 くらいずれる。速い・ゆっくりの リズムに 入ったところは もっと ずれる
    const prev = s.beats[s.nextBeat - 1];
    const changed = prev && prev.kind !== b.kind;
    h.tapAt = b.t + (nextRandom(s) + nextRandom(s) + nextRandom(s) - 1.5) * (changed ? 0.2 : 0.12);
  }
  if (s.t >= h.tapAt && h.lastBeat !== s.nextBeat) { h.tapAt = Infinity; return true; }
  return false;
}

export function step(s, inputs) {
  const ev = [];
  if (s.phase === 'finished') return ev;
  const dt = STEP;
  s.t += dt;
  if (s.phase === 'ready' && s.t >= RULES.readyTime - 0.4) {
    s.phase = 'play';
    ev.push({ type: 'start' });
  }
  const play = s.phase === 'play';
  // ビートを すすめる(判定の まどを すぎたら つぎへ)
  while (s.nextBeat < s.beats.length && s.t > s.beats[s.nextBeat].t + RULES.good) {
    s.nextBeat++;
    const b = s.beats[s.nextBeat];
    const prev = s.beats[s.nextBeat - 1];
    if (b && prev && b.kind !== prev.kind) ev.push({ type: 'tempo', kind: b.kind });
  }
  // ビートの瞬間(画面の「よいしょ!」用)
  for (let i = Math.max(0, s.nextBeat - 1); i <= s.nextBeat && i < s.beats.length; i++) {
    const b = s.beats[i];
    if (!b.fired && s.t >= b.t) { b.fired = true; if (play) ev.push({ type: 'beat', i, kind: b.kind }); }
  }

  if (play) {
    const all = [...s.runners.map((u, i) => [u, i]), ...s.helpers.map((u, i) => [u, -1 - i])];
    for (const [u, who] of all) {
      u.down = Math.max(0, u.down - dt);
      // すべる
      if (u.slip === null && u.down <= 0 && s.t >= u.nextSlip) {
        u.slip = { at: s.t };
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
    s.p += s.v * dt;
    s.v *= Math.exp(-RULES.damp * dt);
    if (Math.abs(s.p) >= RULES.win || timeLeft(s) <= 0) {
      s.phase = 'finished';
      s.winner = s.p >= 0 ? 'R' : 'L';
      if (s.p === 0) s.winner = nextRandom(s) < 0.5 ? 'L' : 'R';
      ev.push({ type: 'finished', winner: s.winner, timeUp: Math.abs(s.p) < RULES.win });
    }
  }
  return ev;
}

export function ranking(s) {
  const order = (side) => s.runners.map((r, i) => i).filter((i) => s.runners[i].side === side).sort((a, b) => s.runners[b].pull - s.runners[a].pull || a - b);
  const w = s.winner ?? (s.p >= 0 ? 'R' : 'L');
  return [...order(w), ...order(w === 'R' ? 'L' : 'R')];
}
