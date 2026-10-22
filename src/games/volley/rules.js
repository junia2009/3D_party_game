// 夏の浜べの ビーチバレー のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 3人 対 3人。まん中の ネットを はさんで、ボールを 相手の コートに 落としたら 1点。先に 7点 とった チームの 勝ち。
// - チーム: くじで 左(L)・右(R)へ。3人に たりない チームには 森の なかま(すけっと)が 入る(動きは autoInput)。
// - 走る: スティック(どこでもスティック)。自分の コートの 中だけ。
// - うつ: ボールが 落ちてくる ところ(影)の 近くで ボタン。ボールが 手の とどく ところに 来ると 自動で うつ
//   (おしてから すこしの あいだ 待ってくれる)。チームで 3回まで さわれる。
//   1回目 … レシーブ(ネットの 前へ 高く)/ 2回目 … トス(ネットの 近くへ)/ 3回目 … アタック(相手の コートへ)。
//   2回目でも ネットの 近くなら アタックに なる。
// - スパイク: ネットの 近く(spikeX より 内)で アタックすると、ジャンプして 速く 低い スパイク。遠くからは ふんわり。
// - 風: ときどき 海風が ふいて、とんでいる ボールが 横(z)へ 流される。
// - サーブ: 点を とった チームが サーブ。うしろの 子が 自動で うつ。
// - コートの 外に 落ちたら、さいごに さわった チームの 失点。4回 さわっても 失点。
// - timeLimit 秒で 決まらなければ、点が 多い チーム(同じなら つぎの 1点で 決める)。
// 順位: 勝った チームの子を 点を 決めた順、そのあと 負けた チームの子を 点を 決めた順。
//
// inputs[slot]: { x, z(スティック), hit(ボタンを おした しゅんかん) } または null
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, randRange, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;
export const TEAM_SIZE = 3;

export const RULES = {
  readyTime: 3.0,
  timeLimit: 120,
  winScore: 5,
  halfW: 7.0, // コートの よこ(x)の 半分
  halfD: 3.6, // おくゆき(z)の 半分
  netGap: 0.45, // ネットから これだけ はなれる
  netH: 2.1,
  speed: 4.6,
  accel: 16,
  bodyR: 0.36,
  reach: 1.35, // うてる ところ(よこの きょり)
  reachLo: 0.4, // ボールの 高さが この あいだで うてる
  reachHi: 2.6,
  spikeHi: 3.1, // ジャンプして とどく 高さ(スパイク)
  buffer: 0.5, // ボタンを おしてから 待つ 時間
  cool: 0.35, // うった あと
  gravity: 9.8,
  ballR: 0.22,
  // とび方(とぶ 時間 秒)
  // レシーブ・トスは 高く 上げて、ねらった ところで 手の 高さ(passY / tossY)まで 落ちてくる
  passT: 1.9,
  passY: 1.1,
  tossT: 1.6,
  tossY: 1.9,
  lobT: 1.8,
  spikeT: 0.72,
  serveT: 2.0,
  spikeX: 2.6, // ネットから これより 近いと スパイク
  // 風
  windFirst: 14,
  windEvery: [14, 20],
  windTime: 6,
  windAcc: 1.3, // 横(z)に 流す 強さ(m/秒²)
  pointPause: 1.6, // 点が 入ってから つぎの サーブまで
  servePause: 1.0,
};

const unit = (side, slot, kind = null) => ({
  side, slot, kind, x: 0, z: 0, vx: 0, vz: 0, face: side === 'L' ? Math.PI / 2 : -Math.PI / 2,
  want: 0, cool: 0, jump: 0, points: 0, touches: 0, homeZ: 0,
});

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:volley`),
    phase: 'ready', // ready → play → finished
    teams: { L: [], R: [] },
    units: [],
    score: { L: 0, R: 0 },
    // ボール: state … 'serve'(サーブ まち)/ 'fly'(とんでいる)/ 'dead'(点が 入った あと)
    ball: { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, state: 'serve', side: 'L', touches: 0, last: null, lastSide: null, kind: 'serve', target: null },
    serving: 'L',
    pause: RULES.servePause,
    wind: { z: 0, until: 0, next: RULES.windFirst },
    winner: null,
    rally: 0,
  };
  s.units = players.map((_, slot) => unit('L', slot));
  const order = s.units.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(s) * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  order.forEach((i, k) => { s.units[i].side = k % 2 ? 'R' : 'L'; s.teams[s.units[i].side].push(i); });
  const kinds = ['risu', 'harinezumi', 'komadori'];
  let hk = 0;
  for (const side of ['L', 'R']) {
    while (s.teams[side].length < TEAM_SIZE) {
      s.units.push(unit(side, -1, kinds[hk++ % kinds.length]));
      s.teams[side].push(s.units.length - 1);
    }
  }
  s.serving = nextRandom(s) < 0.5 ? 'L' : 'R';
  placeTeams(s);
  return s;
}

// 立ち位置: 前に 1人・うしろに 2人(サーブの ときは うしろの 1人が サーバー)
const HOME = [[2.2, 0], [5.2, -1.8], [5.2, 1.8]];
function placeTeams(s) {
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    s.teams[side].forEach((i, k) => {
      const u = s.units[i];
      const [hx, hz] = HOME[k];
      u.x = sx * hx; u.z = hz; u.homeZ = hz; u.vx = u.vz = 0;
      u.face = side === 'L' ? Math.PI / 2 : -Math.PI / 2;
    });
  }
  const server = s.units[s.teams[s.serving][1]];
  server.x = (s.serving === 'L' ? -1 : 1) * (RULES.halfW - 0.4);
  server.z = 0;
  const b = s.ball;
  Object.assign(b, { x: server.x, y: 1.6, z: server.z, vx: 0, vy: 0, vz: 0, state: 'serve', side: s.serving, touches: 0, last: s.teams[s.serving][1], lastSide: s.serving, kind: 'serve', target: null });
}

export const playTime = (s) => Math.max(0, s.t - RULES.readyTime);
export const timeLeft = (s) => Math.max(0, RULES.timeLimit - playTime(s));
const sideOf = (x) => (x < 0 ? 'L' : 'R');
export const inCourt = (x, z) => Math.abs(x) <= RULES.halfW && Math.abs(z) <= RULES.halfD;

// ボールを (tx, tz) に T 秒で 落とす(風は 入れない)
// (endY: T 秒 あとの 高さ。ふつうは 地面)
function launch(s, tx, tz, T, kind, endY = RULES.ballR) {
  const b = s.ball;
  b.vx = (tx - b.x) / T;
  b.vz = (tz - b.z) / T;
  b.vy = (endY - b.y + 0.5 * RULES.gravity * T * T) / T;
  b.state = 'fly';
  b.kind = kind;
  b.target = { x: tx, z: tz };
}
// とんでいる ボールが 高さ y まで 落ちる ところ(風も 入れる)。なければ null
export function landing(s, y = RULES.ballR) {
  const b = s.ball;
  if (b.state !== 'fly') return null;
  const g = RULES.gravity;
  const disc = b.vy * b.vy + 2 * g * (b.y - y);
  if (disc < 0) return null;
  const t = (b.vy + Math.sqrt(disc)) / g;
  const w = s.wind.until > s.t ? s.wind.z : 0;
  return { x: b.x + b.vx * t, z: b.z + b.vz * t + 0.5 * w * t * t, t };
}

// (x0, y0) から tx へ T 秒で 落とすとき、ネット(x = 0)の 上での 高さ
function netClear(x0, y0, tx, T) {
  const g = RULES.gravity;
  const vy = (RULES.ballR - y0 + 0.5 * g * T * T) / T;
  const t = (-x0) / ((tx - x0) / T);
  return y0 + vy * t - 0.5 * g * t * t;
}

// ボールを うつ(だれが・何回目かで とび方が かわる)
function hit(s, i, ev) {
  const u = s.units[i];
  const b = s.ball;
  const sx = u.side === 'L' ? -1 : 1;
  if (b.lastSide !== u.side) b.touches = 0;
  b.touches++;
  b.last = i;
  b.lastSide = u.side;
  u.touches++;
  u.cool = RULES.cool;
  u.want = 0;
  s.rally++;
  const nearNet = Math.abs(u.x) < RULES.spikeX;
  // 2回目は ふつう トス(レシーブ → トス → アタック)。サーブや アタックを 1回で かえされた ボールが ネットぎわに 来たときだけ 2回目でも たたく
  const attack = b.touches >= 3 || (b.touches === 2 && nearNet && b.kind !== 'pass');
  if (!attack) {
    // レシーブ: ネットの 前へ 高く / トス: ネットの 近くへ(味方が アタックできる ところ)
    const toss = b.touches === 2;
    const tx = sx * (toss ? 1.4 : 2.0 + nextRandom(s) * 0.6);
    const tz = (nextRandom(s) - 0.5) * (toss ? 2.4 : 2.2);
    launch(s, tx, tz, toss ? RULES.tossT : RULES.passT, toss ? 'toss' : 'pass', toss ? RULES.tossY : RULES.passY);
    ev.push({ type: 'hit', who: i, kind: b.kind, touches: b.touches });
    return;
  }
  // アタック: 相手の コートの あいている ところ を ねらう(だれも いない ところほど)
  const ox = -sx;
  let spike = nearNet && b.y > 1.2;
  const y0 = spike ? Math.max(b.y, 2.7) : b.y;
  const T = spike ? RULES.spikeT : RULES.lobT;
  let best = null, bestD = -1;
  for (let k = 0; k < 8; k++) {
    const tx = ox * (1.2 + nextRandom(s) * (RULES.halfW - 1.7));
    const tz = (nextRandom(s) * 2 - 1) * (RULES.halfD - 0.5);
    if (spike && netClear(b.x, y0, tx, T) < RULES.netH + 0.15) continue;
    const d = Math.min(...s.teams[ox < 0 ? 'L' : 'R'].map((j) => Math.hypot(s.units[j].x - tx, s.units[j].z - tz)));
    if (d > bestD) { bestD = d; best = { tx, tz }; }
  }
  // とどく ところが なければ ふんわり 奥へ
  if (!best) { spike = false; best = { tx: ox * (RULES.halfW - 1.5), tz: (nextRandom(s) * 2 - 1) * 2 }; }
  if (spike) { u.jump = 0.45; b.y = y0; }
  launch(s, best.tx, best.tz, spike ? RULES.spikeT : RULES.lobT, spike ? 'spike' : 'lob');
  ev.push({ type: 'hit', who: i, kind: b.kind, touches: b.touches });
}

function point(s, side, why, ev) {
  s.score[side]++;
  const b = s.ball;
  b.state = 'dead';
  // 決めた 子(相手の ミスなら つかない)
  const by = b.lastSide === side && b.last !== null ? b.last : null;
  if (by !== null) s.units[by].points++;
  ev.push({ type: 'point', side, why, by, x: b.x, z: b.z, score: { ...s.score }, rally: s.rally });
  s.rally = 0;
  s.serving = side;
  s.pause = RULES.pointPause;
  const lead = Math.abs(s.score.L - s.score.R);
  if (s.score[side] >= RULES.winScore || (timeLeft(s) <= 0 && lead > 0)) {
    s.phase = 'finished';
    s.winner = s.score.L > s.score.R ? 'L' : 'R';
    ev.push({ type: 'finished', winner: s.winner, score: { ...s.score }, timeUp: s.score[s.winner] < RULES.winScore });
  }
}

// すけっと(と CPU)の 頭: 行き先と、うつか
// skill: { react(秒), err(ずれ m), press(うてる ところに 来たら おす 確率/秒) }
export function autoInput(s, i, skill, rand) {
  const u = s.units[i];
  const b = s.ball;
  const sx = u.side === 'L' ? -1 : 1;
  const team = s.teams[u.side];
  const k = team.indexOf(i);
  let gx = sx * HOME[k][0], gz = HOME[k][1];
  if (b.state === 'fly') {
    const land = landing(s, 1.0);
    const mine = land && sideOf(land.x) === u.side;
    if (mine) {
      // 落ちる ところに いちばん 近い 子が 取りに いく(ほかの 子は もどる)
      let near = null, nd = Infinity;
      for (const j of team) {
        const o = s.units[j];
        if (b.lastSide === u.side && b.last === j) continue; // つづけて さわれない 子は 行かない
        const d = Math.hypot(o.x - land.x, o.z - land.z);
        if (d < nd) { nd = d; near = j; }
      }
      if (near === i) {
        // 見てから うごくまで 少し かかる(ずれも ある)
        const seen = Math.max(0, b.flyT - skill.react);
        const k2 = Math.min(1, seen / 0.3);
        u.aim = u.aim || { ex: (rand() - 0.5) * skill.err, ez: (rand() - 0.5) * skill.err, id: s.rally };
        if (u.aim.id !== s.rally) u.aim = { ex: (rand() - 0.5) * skill.err, ez: (rand() - 0.5) * skill.err, id: s.rally };
        // 読みの ずれは、ボールが 近づくほど 小さくなる(さいごまで 少し のこる)
        const e = 0.35 + 0.65 * Math.min(1, land.t / 0.9);
        gx = u.x + (land.x + u.aim.ex * e - u.x) * k2;
        gz = u.z + (land.z + u.aim.ez * e - u.z) * k2;
      }
    } else if (b.lastSide === u.side) {
      // 相手の ほうへ 行った: 立ち位置へ(前の 子は ネットの 前)
    }
  }
  const dx = gx - u.x, dz = gz - u.z, d = Math.hypot(dx, dz);
  const m = Math.min(1, d / 0.6);
  // もうすぐ 手の とどく ところに 来そうなら おす(待ってくれる あいだに 来る)
  const reachable = b.state === 'fly' && b.lastSide !== null && Math.hypot(b.x - u.x, b.z - u.z) < RULES.reach * 1.5 && b.vy < 0 && b.y < RULES.reachHi + 1.2 && b.y > RULES.reachLo && sideOf(b.x) === u.side;
  const press = reachable && rand() < skill.press * STEP;
  return { x: d > 0.05 ? (dx / d) * m : 0, z: d > 0.05 ? (dz / d) * m : 0, hit: press };
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
  const play = s.phase === 'play';
  const b = s.ball;

  // ── 風 ──
  if (play) {
    const tp = playTime(s);
    if (tp >= s.wind.next) {
      s.wind.z = (nextRandom(s) < 0.5 ? -1 : 1) * RULES.windAcc;
      s.wind.until = s.t + RULES.windTime;
      s.wind.next = tp + RULES.windTime + randRange(s, RULES.windEvery[0], RULES.windEvery[1]);
      ev.push({ type: 'wind', z: s.wind.z, time: RULES.windTime });
    }
    if (s.wind.z && s.t >= s.wind.until) { s.wind.z = 0; ev.push({ type: 'windEnd' }); }
  }

  // ── サーブ・点の あと ──
  if (play && b.state !== 'fly') {
    s.pause -= dt;
    if (b.state === 'dead' && s.pause <= 0) {
      placeTeams(s);
      s.pause = RULES.servePause;
      ev.push({ type: 'serveReady', side: s.serving });
    } else if (b.state === 'serve' && s.pause <= 0) {
      const ox = s.serving === 'L' ? 1 : -1;
      const tx = ox * (2.5 + nextRandom(s) * 3.5), tz = (nextRandom(s) * 2 - 1) * (RULES.halfD - 0.8);
      b.y = 2.2;
      launch(s, tx, tz, RULES.serveT, 'serve');
      b.touches = 0;
      b.flyT = 0;
      s.rally = 0;
      ev.push({ type: 'serve', who: b.last, side: s.serving });
    }
  }

  // ── 走る・うつ ──
  s.units.forEach((u, i) => {
    const inp = play ? (u.slot >= 0 ? inputs[u.slot] : autoInput(s, i, HELPER, () => nextRandom(s))) : null;
    u.cool = Math.max(0, u.cool - dt);
    u.jump = Math.max(0, u.jump - dt);
    u.want = Math.max(0, u.want - dt);
    if (inp?.hit && u.cool <= 0) u.want = RULES.buffer;
    let wx = 0, wz = 0;
    if (inp && inp.x != null && b.state !== 'dead') {
      const m = Math.min(1, Math.hypot(inp.x, inp.z));
      if (m > 0.12) {
        const d = Math.hypot(inp.x, inp.z);
        wx = (inp.x / d) * RULES.speed * m;
        wz = (inp.z / d) * RULES.speed * m;
      }
    }
    // サーブを うつ 子は 動かない
    if (b.state === 'serve' && b.last === i) wx = wz = 0;
    const k = Math.min(1, (RULES.accel * dt) / RULES.speed);
    u.vx += (wx - u.vx) * k;
    u.vz += (wz - u.vz) * k;
    u.x += u.vx * dt;
    u.z += u.vz * dt;
    // 自分の コート(と まわりの 砂浜)の 中だけ
    const sx = u.side === 'L' ? -1 : 1;
    const lo = RULES.netGap, hi = RULES.halfW + 1.2;
    const ax = Math.min(hi, Math.max(lo, u.x * sx));
    u.x = ax * sx;
    u.z = Math.max(-RULES.halfD - 1, Math.min(RULES.halfD + 1, u.z));
    if (Math.hypot(u.vx, u.vz) > 0.3) u.face = Math.atan2(u.vx, u.vz);
  });
  // おしあう
  for (let i = 0; i < s.units.length; i++) for (let j = i + 1; j < s.units.length; j++) {
    const a = s.units[i], c = s.units[j];
    if (a.side !== c.side) continue;
    let dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz);
    if (d >= RULES.bodyR * 2) continue;
    if (d < 1e-6) { dx = 1; dz = 0; d = 1e-6; }
    const o = (RULES.bodyR * 2 - d) / 2;
    a.x -= (dx / d) * o; a.z -= (dz / d) * o;
    c.x += (dx / d) * o; c.z += (dz / d) * o;
  }

  // ── ボール ──
  if (play && b.state === 'fly') {
    b.flyT = (b.flyT || 0) + dt;
    const px = b.x;
    b.vy -= RULES.gravity * dt;
    if (s.wind.until > s.t) b.vz += s.wind.z * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    // ネット: 低く 通ったら ネットに かかって 失点
    if (Math.sign(px) !== Math.sign(b.x) && b.y < RULES.netH && Math.abs(b.z) < RULES.halfD + 0.3) {
      b.x = px;
      ev.push({ type: 'net', x: 0, y: b.y, z: b.z });
      point(s, b.lastSide === 'L' ? 'R' : 'L', 'net', ev);
      return ev;
    }
    // うつ: ボタンを おしてある 子の 手の とどく ところに 来たら(ボールの 来た ほうの チーム)
    // アタックした ボールが ネットを こえる 前に 味方が また さわる ことは しない(相手へ とんでいく ボール)
    const outgoing = b.lastSide === sideOf(b.x) && (b.kind === 'spike' || b.kind === 'lob' || b.kind === 'serve');
    if ((b.vy < 0 || b.kind === 'serve') && !outgoing) {
      const side = sideOf(b.x);
      let hitter = null, hd = Infinity;
      for (const i of s.teams[side]) {
        const u = s.units[i];
        if (u.want <= 0 || u.cool > 0) continue;
        if (b.lastSide === side && b.last === i) continue; // つづけて 2回は さわれない
        const d = Math.hypot(b.x - u.x, b.z - u.z);
        const top = Math.abs(u.x) < RULES.spikeX ? RULES.spikeHi : RULES.reachHi;
        if (d < RULES.reach && b.y >= RULES.reachLo && b.y <= top && b.vy < 0 && d < hd) { hd = d; hitter = i; }
      }
      if (hitter !== null) {
        if (b.lastSide === side && b.touches >= 3) { point(s, side === 'L' ? 'R' : 'L', 'touch', ev); return ev; }
        hit(s, hitter, ev);
        b.flyT = 0;
      }
    }
    // 落ちた
    if (b.state === 'fly' && b.y <= RULES.ballR) {
      b.y = RULES.ballR;
      const inside = inCourt(b.x, b.z);
      const landSide = sideOf(b.x);
      ev.push({ type: 'land', x: b.x, z: b.z, inside });
      if (inside) point(s, landSide === 'L' ? 'R' : 'L', 'land', ev);
      else point(s, b.lastSide === 'L' ? 'R' : 'L', 'out', ev);
    }
  }
  // 時間ぎれ(同点なら つぎの 1点で)
  if (play && s.phase === 'play' && timeLeft(s) <= 0 && s.score.L !== s.score.R && b.state !== 'fly') {
    s.phase = 'finished';
    s.winner = s.score.L > s.score.R ? 'L' : 'R';
    ev.push({ type: 'finished', winner: s.winner, score: { ...s.score }, timeUp: true });
  }
  return ev;
}

// すけっとの うでまえ
export const HELPER = { react: 0.32, err: 0.8, press: 18 };

export function ranking(s) {
  const players = s.units.map((u, i) => i).filter((i) => s.units[i].slot >= 0);
  const order = (side) => players.filter((i) => s.units[i].side === side)
    .sort((a, b) => s.units[b].points - s.units[a].points || s.units[b].touches - s.units[a].touches || a - b)
    .map((i) => s.units[i].slot);
  const w = s.winner ?? (s.score.L >= s.score.R ? 'L' : 'R');
  return [...order(w), ...order(w === 'R' ? 'L' : 'R')];
}
