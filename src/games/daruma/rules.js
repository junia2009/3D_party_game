// だるまさんがころんだ のルール。
//
// THREE にも DOM にも触らない。サーバーと画面で同じものを回す。
// 時間は固定の刻み(STEP)で進める ── 刻みがばらつくと、同じ入力でも
// サーバーと画面で結果がずれる。
//
// 仕様は docs/minigames/daruma.md。

import { nextRandom, randRange } from '../../rng.js';

export const STEP = 1 / 60;
export const TRACK = 20; // スタートからゴールまで(m)
export const MORA = ['だ', 'る', 'ま', 'さ', 'ん', 'が', 'こ', 'ろ', 'ん', 'だ'];

export const RULES = {
  maxSpeed: 1.5,      // m/秒
  accel: 5,           // 0.3秒で最高速
  decel: 10,          // 離してから 0.15秒で止まる(この間に滑る)
  movingSpeed: 0.05,  // これより速いと「動いている」
  readyTime: 2,
  chantMin: 1.6,
  chantMax: 4.5,
  fakeChance: 0.25,   // 数える途中で止まる確率
  fakeMin: 0.6,
  fakeMax: 1.2,
  turnTime: 0.3,      // 首が回るあいだ(判定しない)
  graceTime: 0.2,     // 振り向き終わってからの猶予(反応と通信の遅れ)
  watchMin: 2,
  watchMax: 3,
  backTime: 0.3,
  penalty: 5,         // 見つかったら戻される距離(m)
  stunTime: 1.5,
  timeLimit: 60,      // よーい が終わってからの制限時間
};

// players: [{ id, name, character, cpu }]。並び順が席(レーン)になる。
export function createGame(players, seed) {
  return {
    rng: seed | 0,
    t: 0,
    phase: 'ready', // ready → chant → turn → watch → back → chant … → finished
    phaseTime: 0,
    round: 0,
    chant: null,
    watchLength: 0,
    winner: null,
    runners: players.map((p, slot) => ({
      slot,
      id: p.id,
      x: 0,
      v: 0,
      hold: false,
      stun: 0,
      finishTime: null,
      caught: 0,
    })),
  };
}

function startChant(s) {
  s.phase = 'chant';
  s.phaseTime = 0;
  s.round++;
  const length = randRange(s, RULES.chantMin, RULES.chantMax);
  const fake = nextRandom(s) < RULES.fakeChance;
  s.chant = {
    length,
    elapsed: 0,
    fakeAt: fake ? randRange(s, 0.3, 0.7) : null,
    pause: 0,
    fakeDone: false,
  };
}

function finish(s) {
  s.phase = 'finished';
  s.phaseTime = 0;
  if (s.winner === null) s.winner = ranking(s)[0];
}

// 1刻み進める。holds[slot] = 押しているか。起きたことを配列で返す。
export function step(s, holds) {
  const events = [];
  if (s.phase === 'finished') return events;
  const dt = STEP;
  s.t += dt;
  s.phaseTime += dt;

  const canMove = s.phase !== 'ready';
  for (const r of s.runners) {
    if (r.stun > 0) r.stun = Math.max(0, r.stun - dt);
    r.hold = canMove && r.stun === 0 && r.finishTime === null && !!holds[r.slot];
    r.v = r.hold ? Math.min(RULES.maxSpeed, r.v + RULES.accel * dt) : Math.max(0, r.v - RULES.decel * dt);
    r.x += r.v * dt;
    if (r.x >= TRACK && r.finishTime === null) {
      r.x = TRACK;
      r.v = 0;
      r.finishTime = s.t;
      events.push({ type: 'goal', slot: r.slot });
      if (s.winner === null) s.winner = r.slot;
    }
  }
  if (s.winner !== null) {
    finish(s);
    events.push({ type: 'finished', winner: s.winner });
    return events;
  }

  switch (s.phase) {
    case 'ready':
      if (s.phaseTime >= RULES.readyTime) {
        startChant(s);
        events.push({ type: 'chant', round: s.round });
      }
      break;
    case 'chant': {
      const c = s.chant;
      if (c.pause > 0) {
        c.pause = Math.max(0, c.pause - dt);
        if (c.pause === 0) events.push({ type: 'resume' });
        break;
      }
      c.elapsed += dt;
      if (c.fakeAt !== null && !c.fakeDone && c.elapsed >= c.fakeAt * c.length) {
        c.fakeDone = true;
        c.pause = randRange(s, RULES.fakeMin, RULES.fakeMax);
        events.push({ type: 'fake' });
      } else if (c.elapsed >= c.length) {
        s.phase = 'turn';
        s.phaseTime = 0;
        events.push({ type: 'turn' });
      }
      break;
    }
    case 'turn':
      if (s.phaseTime >= RULES.turnTime) {
        s.phase = 'watch';
        s.phaseTime = 0;
        s.watchLength = randRange(s, RULES.watchMin, RULES.watchMax);
        events.push({ type: 'watch' });
      }
      break;
    case 'watch':
      if (s.phaseTime >= RULES.graceTime) {
        for (const r of s.runners) {
          if (r.stun > 0 || r.finishTime !== null || r.v <= RULES.movingSpeed) continue;
          r.x = Math.max(0, r.x - RULES.penalty);
          r.v = 0;
          r.stun = RULES.stunTime;
          r.caught++;
          events.push({ type: 'caught', slot: r.slot });
        }
      }
      if (s.phaseTime >= s.watchLength) {
        s.phase = 'back';
        s.phaseTime = 0;
        events.push({ type: 'back' });
      }
      break;
    case 'back':
      if (s.phaseTime >= RULES.backTime) {
        startChant(s);
        events.push({ type: 'chant', round: s.round });
      }
      break;
  }

  if (s.t - RULES.readyTime >= RULES.timeLimit) {
    finish(s);
    events.push({ type: 'timeup' }, { type: 'finished', winner: s.winner });
  }
  return events;
}

// 数えた文字数(0〜10)。字幕を光らせるのに使う。
export function chantCount(s) {
  if (s.phase === 'chant') return Math.min(MORA.length, Math.floor((s.chant.elapsed / s.chant.length) * MORA.length));
  if (s.phase === 'turn' || s.phase === 'watch') return MORA.length;
  return 0;
}

// 首の向き(0 = うしろ向き、1 = こっちを見ている)
export function lookAmount(s) {
  if (s.phase === 'turn') return Math.min(1, s.phaseTime / RULES.turnTime);
  if (s.phase === 'watch') return 1;
  if (s.phase === 'back') return Math.max(0, 1 - s.phaseTime / RULES.backTime);
  return 0;
}

// 順位(席の番号の並び)。ゴールした人が先(早い順)、残りは進んだ距離の順。
export function ranking(s) {
  return [...s.runners]
    .sort((a, b) => {
      if (a.finishTime !== null || b.finishTime !== null) {
        if (a.finishTime === null) return 1;
        if (b.finishTime === null) return -1;
        return a.finishTime - b.finishTime || a.slot - b.slot;
      }
      return b.x - a.x || a.slot - b.slot;
    })
    .map((r) => r.slot);
}
