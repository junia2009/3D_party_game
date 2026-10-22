// 夏の浜べの ビーチバレー のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 3人 対 3人。まん中の ネットを はさんで、ボールを 相手の コートに 落としたら 1点。先に 5点 とった チームの 勝ち。
// - チーム: くじで 左(L)・右(R)へ。3人に たりない チームには 森の なかま(すけっと)が 入る(動きは autoInput)。
// - 走る: スティック。自分の コートの 中だけ。
// - うつ: ボタンを おした しゅんかんに うつ(手の とどく ところに ボールが あれば)。
//   ボールが「ちょうどいい 高さ」(ふつうは 手の 高さ、スパイクは ジャンプの てっぺん)に 来る しゅんかんに 近いほど 上手に うてる。
//   ぴったり … ナイス(ねらいどおり・スパイクは 速い)/ すこし ずれ … グッド / 大きく ずれ … ミス(ボールが あばれる)
// - チームで 3回まで。1回目 レシーブ(トスを あげる 子へ)/ 2回目 トス(アタックする 子へ。人の 子が いれば その子へ)/
//   3回目 アタック。ネットの 近くで、ボールが 高ければ ジャンプして スパイク、そうでなければ ふんわり かえす。
//   アタックの 行き先は スティックで ねらう(前へ たおすと 奥・うしろへ たおすと 手前・左右は そのまま 左右)。
// - ブロック: ボールが 相手の コートに ある ときに、ネットの 前で ボタン → ジャンプ。
//   相手の ボールが ネットを こえる ときに 手の ところを 通ると はねかえす。
// - 飛びこみ: 手が とどかない ボールでも、近ければ ボタンで 飛びこんで 拾える(うまく いっても グッドまで。あと すこし 動けない)。
// - 風: ときどき 海風が ふいて、とんでいる ボールが 横(z)へ 流される。
// - サーブ: 点を とった チームが サーブ。うしろの 子が 自動で うつ。
// - コートの 外に 落ちたら、さいごに さわった チームの 失点。ネットに かけても、4回 さわっても 失点。
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
  speed: 4.8,
  accel: 18,
  bodyR: 0.36,
  reach: 1.25, // うてる ところ(よこの きょり)
  reachLo: 0.2, // ボールの 高さが この あいだで うてる
  reachHi: 2.5,
  spikeHi: 3.2, // ジャンプして とどく 高さ(スパイク)
  buffer: 0.1, // ボタンを おしてから 待つ 時間(ほんの すこし)
  cool: 0.35, // うった あと
  gravity: 9.8,
  ballR: 0.22,
  // ちょうどいい 高さ と、その しゅんかんからの ずれ(秒)で きまる うまさ
  idealLow: 1.4,
  idealSpike: 2.6,
  perfect: 0.08,
  good: 0.18,
  // とび方(とぶ 時間 秒)。レシーブ・トスは ねらった ところで ちょうどいい 高さまで 落ちてくる
  passT: 1.5,
  tossT: 1.4,
  lobT: 1.6,
  spikeT: { perfect: 0.45, good: 0.6, bad: 0.95 },
  serveT: 2.0,
  spikeX: 2.6, // ネットから これより 近いと スパイク
  // ブロック
  blockJump: 0.6, // ジャンプして いる 時間
  blockX: 1.5, // ネットから これより 近い 子が とべる
  blockW: 0.8, // 手の はば(z)
  blockTop: 3.3,
  // 飛びこみ
  diveReach: 2.2,
  diveHand: 0.75, // 飛びこんで いる ときの 手の とどく ところ
  diveTime: 0.32,
  diveDown: 0.7, // たおれて 動けない
  // 風
  windFirst: 14,
  windEvery: [14, 20],
  windTime: 6,
  windAcc: 1.3, // 横(z)に 流す 強さ(m/秒²)
  pointPause: 1.6, // 点が 入ってから つぎの サーブまで
  servePause: 1.0,
};

const unit = (side, slot, kind = null, human = false) => ({
  side, slot, kind, human, x: 0, z: 0, vx: 0, vz: 0, face: side === 'L' ? Math.PI / 2 : -Math.PI / 2,
  want: 0, cool: 0, jump: 0, block: 0, dive: 0, down: 0, dvx: 0, dvz: 0, points: 0, touches: 0, blocks: 0, nice: 0,
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
    // forUnit: つぎに さわる 予定の 子(レシーブ → トスの 子、トス → アタックの 子)
    ball: { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, state: 'serve', touches: 0, last: null, lastSide: null, kind: 'serve', target: null, forUnit: null, flyT: 0 },
    serving: 'L',
    pause: RULES.servePause,
    wind: { z: 0, until: 0, next: RULES.windFirst },
    winner: null,
    rally: 0,
  };
  // 人が うごかす 子(cpu の しるしが ない 子)には トスが あがりやすい
  s.units = players.map((p, slot) => unit('L', slot, null, !p?.cpu));
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
export const HOME = [[1.6, 0], [4.6, -1.7], [4.6, 1.7]];
function placeTeams(s) {
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    s.teams[side].forEach((i, k) => {
      const u = s.units[i];
      const [hx, hz] = HOME[k];
      Object.assign(u, { x: sx * hx, z: hz, vx: 0, vz: 0, jump: 0, block: 0, dive: 0, down: 0, want: 0, cool: 0 });
      u.face = side === 'L' ? Math.PI / 2 : -Math.PI / 2;
    });
  }
  const server = s.units[s.teams[s.serving][1]];
  server.x = (s.serving === 'L' ? -1 : 1) * (RULES.halfW - 0.4);
  server.z = 0;
  const b = s.ball;
  Object.assign(b, { x: server.x, y: 1.6, z: server.z, vx: 0, vy: 0, vz: 0, state: 'serve', touches: 0, last: s.teams[s.serving][1], lastSide: s.serving, kind: 'serve', target: null, forUnit: null, flyT: 0 });
}

export const playTime = (s) => Math.max(0, s.t - RULES.readyTime);
export const timeLeft = (s) => Math.max(0, RULES.timeLimit - playTime(s));
export const sideOf = (x) => (x < 0 ? 'L' : 'R');
export const inCourt = (x, z) => Math.abs(x) <= RULES.halfW && Math.abs(z) <= RULES.halfD;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ボールを (tx, tz) に T 秒で とどける。T 秒 あとの 高さは endY(ふつうは 地面)。風は 入れない
function launch(s, tx, tz, T, kind, endY = RULES.ballR) {
  const b = s.ball;
  b.vx = (tx - b.x) / T;
  b.vz = (tz - b.z) / T;
  b.vy = (endY - b.y + 0.5 * RULES.gravity * T * T) / T;
  b.state = 'fly';
  b.kind = kind;
  b.target = { x: tx, z: tz };
  b.flyT = 0;
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
// ボールが(落ちながら)高さ y に なるまでの 時間。もう 下を 通りすぎて いれば マイナス
export function timeToY(b, y) {
  const g = RULES.gravity;
  if (b.y >= y || b.vy > 0) {
    const disc = b.vy * b.vy + 2 * g * (b.y - y);
    if (disc >= 0) return (b.vy + Math.sqrt(disc)) / g;
  }
  return -(y - b.y) / Math.max(0.5, -b.vy);
}

// (x0, y0) から tx へ T 秒で 地面に 落とすとき、ネット(x = 0)の 上での 高さ
function netClear(x0, y0, tx, T) {
  const g = RULES.gravity;
  const vy = (RULES.ballR - y0 + 0.5 * g * T * T) / T;
  const t = (-x0) / ((tx - x0) / T);
  return y0 + vy * t - 0.5 * g * t * t;
}

// この 子が いま うつと 何に なるか(HUD と CPU も つかう)
// 'pass' | 'toss' | 'spike' | 'lob'
export function shotKind(s, i) {
  const u = s.units[i];
  const b = s.ball;
  const touches = b.lastSide === u.side ? b.touches + 1 : 1;
  const nearNet = Math.abs(u.x) < RULES.spikeX;
  const attack = touches >= 3 || (touches === 2 && nearNet && b.kind !== 'pass');
  if (!attack) return touches === 2 ? 'toss' : 'pass';
  return nearNet ? 'spike' : 'lob';
}
// ちょうどいい 高さ
export const idealY = (kind) => (kind === 'spike' ? RULES.idealSpike : RULES.idealLow);
// うまさ: ずれ(秒)から
export const quality = (dt) => (Math.abs(dt) <= RULES.perfect ? 'perfect' : Math.abs(dt) <= RULES.good ? 'good' : 'bad');

// アタックの 行き先: スティック(ワールドの x, z)から。前(相手の 奥)へ たおすと 奥、手前へ たおすと ネットぎわ
export function aimPoint(u, inp) {
  const ox = u.side === 'L' ? 1 : -1;
  const f = clamp((inp?.x || 0) * ox, -1, 1);
  const l = clamp(inp?.z || 0, -1, 1);
  return { x: ox * (4.0 + f * 2.5), z: l * (RULES.halfD - 0.5) };
}

// トスを あげる 子 / アタックする 子 を えらぶ
function pickSetter(s, i) {
  // パスした 子 いがいで、ネットに いちばん 近い 子。人の 子は なるべく アタックに まわすので、さけられれば さける
  const team = s.teams[s.units[i].side].filter((j) => j !== i);
  const score = (j) => Math.abs(s.units[j].x) + (s.units[j].human ? 3 : 0);
  return team.sort((a, b) => score(a) - score(b))[0];
}
function pickSpiker(s, i) {
  const team = s.teams[s.units[i].side].filter((j) => j !== i);
  const score = (j) => Math.abs(s.units[j].x) * 0.3 + Math.abs(s.units[j].z) * 0.1 - (s.units[j].human ? 5 : 0);
  return team.sort((a, b) => score(a) - score(b))[0];
}

// ボールを うつ
function hit(s, i, inp, ev, { dive = false } = {}) {
  const u = s.units[i];
  const b = s.ball;
  const sx = u.side === 'L' ? -1 : 1;
  const kind = shotKind(s, i);
  let q = quality(timeToY(b, idealY(kind)));
  if (dive && q === 'perfect') q = 'good';
  if (b.lastSide !== u.side) b.touches = 0;
  b.touches++;
  b.last = i;
  b.lastSide = u.side;
  u.touches++;
  if (q === 'perfect') u.nice++;
  u.cool = RULES.cool;
  u.want = 0;
  s.rally++;
  const err = { perfect: 0.2, good: 0.8, bad: 2.0 }[q];
  const rnd = () => (nextRandom(s) * 2 - 1);
  if (kind === 'pass' || kind === 'toss') {
    const toss = kind === 'toss';
    const who = toss ? pickSpiker(s, i) : pickSetter(s, i);
    const o = s.units[who];
    let tx = sx * (toss ? 1.3 : 1.9), tz = clamp(o.z, -2.6, 2.6);
    let T = toss ? RULES.tossT : RULES.passT;
    let endY = toss ? RULES.idealSpike : RULES.idealLow;
    tx += rnd() * err * 0.6;
    tz += rnd() * err;
    if (q === 'bad') {
      T *= 0.75;
      // あばれた ボール: たまに 外や 相手の ほうへ
      if (nextRandom(s) < 0.3) { tx = sx * (nextRandom(s) * 9 - 1.5); tz = rnd() * 5; endY = RULES.ballR; }
    }
    tx = sx * Math.max(0.6, tx * sx);
    if (sx * tx < 0) tx = -tx;
    launch(s, tx, tz, T, kind, endY);
    b.forUnit = endY === RULES.ballR ? null : who;
    ev.push({ type: 'hit', who: i, kind, q, touches: b.touches, dive, to: b.forUnit });
    return;
  }
  // アタック
  const aim = aimPoint(u, inp);
  let tx = aim.x + rnd() * err * 0.5, tz = clamp(aim.z + rnd() * err * 0.7, -RULES.halfD - 1, RULES.halfD + 1);
  let spike = kind === 'spike' && b.y > 1.4;
  let T = spike ? RULES.spikeT[q] : RULES.lobT;
  if (spike) {
    u.jump = Math.max(u.jump, 0.45);
    b.y = Math.max(b.y, 2.3);
    // ネットを こえる ところまで 奥へ。ミスは ときどき ネットに かかる
    const ox = -sx;
    if (q === 'bad' && nextRandom(s) < 0.35) { tx = ox * 0.9; T = 0.5; }
    else {
      // 手前を ねらう ときは 山なりに(おそく)して ネットを こえる。それでも だめなら 奥へ
      for (let k = 0; k < 16 && netClear(b.x, b.y, tx, T) < RULES.netH + 0.12; k++) {
        if (T < 0.95) T += 0.06;
        else if (Math.abs(tx) < RULES.halfW - 0.8) tx += ox * 0.4;
      }
    }
  } else if (q === 'bad') { tx = -sx * (1 + nextRandom(s) * 7); T = 1.3; }
  launch(s, tx, tz, T, spike ? 'spike' : 'lob');
  b.forUnit = null;
  ev.push({ type: 'hit', who: i, kind: b.kind, q, touches: b.touches, dive });
}

function point(s, side, why, ev) {
  s.score[side]++;
  const b = s.ball;
  b.state = 'dead';
  // 決めた 子(相手の ミスなら つかない)
  const by = b.lastSide === side && b.last !== null ? b.last : null;
  if (by !== null) s.units[by].points++;
  ev.push({ type: 'point', side, why, by, x: b.x, z: b.z, score: { ...s.score }, rally: s.rally, kind: b.kind });
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

// いま この 子が ボタンを おしたら 何が おきるか(HUD と CPU が つかう)
// 'hit'(手が とどく)/ 'dive'(飛びこめる)/ 'block'(ネットの 前で とべる)/ null
// 手の とどく はんい。スパイクは 速いので 少し せまい
const reachOf = (b) => (b.kind === 'spike' ? RULES.reach * 0.65 : RULES.reach);
export function canDo(s, i) {
  const u = s.units[i];
  const b = s.ball;
  if (s.phase !== 'play' || b.state !== 'fly' || u.down > 0 || u.dive > 0) return null;
  const mySide = sideOf(b.x) === u.side;
  const outgoing = b.lastSide === u.side && (b.kind === 'spike' || b.kind === 'lob' || b.kind === 'serve' || b.kind === 'block');
  if (!mySide || outgoing) {
    // ボールが 相手がわ(か、相手へ とんで いく): ネットの 前なら ブロック
    if (!mySide && Math.abs(u.x) < RULES.blockX && u.jump <= 0 && b.lastSide !== u.side) return 'block';
    return null;
  }
  if (b.lastSide === u.side && b.last === i) return null; // つづけて 2回は さわれない
  const d = Math.hypot(b.x - u.x, b.z - u.z);
  const top = Math.abs(u.x) < RULES.spikeX ? RULES.spikeHi : RULES.reachHi;
  const reach = reachOf(b);
  if (d < reach && b.y >= RULES.reachLo && b.y <= top) return 'hit';
  // 飛びこみ: 落ちる ところが 手の とどかない ところ(でも 近い)
  const land = landing(s, 0.5);
  const ld = land ? Math.hypot(land.x - u.x, land.z - u.z) : Infinity;
  if (land && b.vy < 0 && land.t < 0.7 && ld > reach * 0.9 && ld < RULES.diveReach && u.jump <= 0) return 'dive';
  return null;
}

// すけっと(と CPU)の 頭: 行き先と、うつ・ブロック・飛びこみ
// skill: { react(見てから うごくまで 秒), err(落ちる ところの 読みの ずれ m), tsd(タイミングの ずれ 秒),
//          block(ブロックに とぶ 確率), aim(あいている ところを ねらう 確率), dive(とどかない ボールに 飛びこむ 確率) }
export function autoInput(s, i, skill, rand) {
  const u = s.units[i];
  const b = s.ball;
  const sx = u.side === 'L' ? -1 : 1;
  const team = s.teams[u.side];
  const k = team.indexOf(i);
  let gx = sx * HOME[k][0], gz = HOME[k][1];
  let hit = false, stick = null;
  // ボールごとに きめる こと(タイミングの ずれ・ブロックするか)
  const id = `${s.rally}:${b.kind}:${b.lastSide}`;
  if (u.plan?.id !== id) {
    const r1 = rand(), r2 = rand(), r3 = rand(), r4 = rand();
    u.plan = {
      id,
      toff: (r1 + r2 - 1) * skill.tsd * 1.6 + 0.02, // まん中に よった ずれ(すこし 早めに)
      ex: (r3 - 0.5) * skill.err, ez: (r4 - 0.5) * skill.err,
      block: rand() < skill.block, smart: rand() < skill.aim, boff: (rand() - 0.5) * 0.3, dive: rand() < skill.dive,
    };
  }
  const p = u.plan;
  if (b.state === 'fly') {
    const kind = shotKind(s, i);
    const land = landing(s, idealY(kind));
    const mine = land && sideOf(land.x) === u.side && !(b.lastSide === u.side && (b.kind === 'spike' || b.kind === 'lob' || b.kind === 'serve'));
    if (mine) {
      // とりに いく 子: 予定の 子(forUnit)、いなければ 落ちる ところに いちばん 近い 子
      let go = b.forUnit !== null && b.lastSide === u.side ? b.forUnit : null;
      if (go === null) {
        let nd = Infinity;
        for (const j of team) {
          if (b.lastSide === u.side && b.last === j) continue;
          const d = Math.hypot(s.units[j].x - land.x, s.units[j].z - land.z);
          if (d < nd) { nd = d; go = j; }
        }
      }
      if (go === i) {
        // スパイクは 見てから うごくまで よけいに かかる
        const sp = b.kind === 'spike' && b.lastSide !== u.side;
        const k2 = Math.min(1, Math.max(0, b.flyT - skill.react - (sp ? 0.3 : 0)) / 0.25);
        const e = (0.3 + 0.7 * Math.min(1, land.t / 0.9)) * (sp ? 2.2 : 1);
        gx = u.x + (land.x + p.ex * e - u.x) * k2;
        gz = u.z + (land.z + p.ez * e - u.z) * k2;
        // スパイクは ネットの 手前から とびこむ ように(ボールより すこし うしろ)
        if (kind === 'spike') gx = u.x + (land.x - sx * 0.3 + p.ex * e - u.x) * k2;
      }
    } else if (sideOf(b.x) !== u.side && k === 0) {
      // 相手の ボール: 前の 子は ネットの 前で、相手の トスの 下へ(ブロックの かまえ)
      gx = sx * 0.8;
      gz = b.kind === 'toss' && b.target ? clamp(b.target.z, -2.8, 2.8) : 0;
    }
    const can = canDo(s, i);
    if (can === 'hit') {
      const t = timeToY(b, idealY(kind));
      if (t <= p.toff || t < -0.05) {
        hit = true;
        if (kind === 'spike' || kind === 'lob') {
          // ねらう: あいている ところ(上手な 子ほど)
          const ox = -sx;
          let best = { x: ox * 4, z: 0 }, bd = -1;
          for (let n = 0; n < 6; n++) {
            const c = { x: ox * (1.5 + rand() * 5), z: (rand() * 2 - 1) * (RULES.halfD - 0.5) };
            const d = Math.min(...s.teams[ox < 0 ? 'L' : 'R'].map((j) => Math.hypot(s.units[j].x - c.x, s.units[j].z - c.z)));
            if (d > bd) { bd = d; best = c; }
            if (!p.smart) break;
          }
          stick = { x: ((Math.abs(best.x) - 4) / 2.5) * ox, z: best.z / (RULES.halfD - 0.5) };
        }
      }
    } else if (can === 'dive') {
      const land2 = landing(s, 0.5);
      if (p.dive && land2 && land2.t < 0.3 && rand() < 0.3) hit = true;
    } else if (can === 'block' && p.block && b.kind === 'toss' && b.lastSide !== u.side) {
      // 相手の トスが スパイクの 高さに 来る すこし 前に とぶ
      const t = timeToY(b, RULES.idealSpike);
      if (t < 0.12 + p.boff && t > -0.3) hit = true;
    }
  }
  const dx = gx - u.x, dz = gz - u.z, d = Math.hypot(dx, dz);
  const m = Math.min(1, d / 0.5);
  const mv = { x: d > 0.05 ? (dx / d) * m : 0, z: d > 0.05 ? (dz / d) * m : 0 };
  return { ...(stick || mv), hit };
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
      b.forUnit = null;
      s.rally = 0;
      ev.push({ type: 'serve', who: b.last, side: s.serving });
    }
  }

  // ── 走る・ボタン ──
  const inps = s.units.map((u, i) => (play ? (u.slot >= 0 ? inputs[u.slot] : autoInput(s, i, HELPER, () => nextRandom(s))) : null));
  s.units.forEach((u, i) => {
    const inp = inps[i];
    u.cool = Math.max(0, u.cool - dt);
    u.jump = Math.max(0, u.jump - dt);
    u.block = Math.max(0, u.block - dt);
    u.down = Math.max(0, u.down - dt);
    u.want = Math.max(0, u.want - dt);
    if (u.dive > 0) {
      u.dive = Math.max(0, u.dive - dt);
      if (u.dive <= 0) u.down = RULES.diveDown;
    }
    if (inp?.hit && u.cool <= 0 && u.down <= 0 && u.dive <= 0 && u.jump <= 0) {
      const can = canDo(s, i);
      if (can === 'block') {
        u.jump = u.block = RULES.blockJump;
        ev.push({ type: 'blockJump', who: i });
      } else if (can === 'dive') {
        const land = landing(s, 0.5);
        const dx = land.x - u.x, dz = land.z - u.z, d = Math.hypot(dx, dz) || 1;
        const v = Math.min(6, d / RULES.diveTime);
        u.dvx = (dx / d) * v;
        u.dvz = (dz / d) * v;
        u.dive = RULES.diveTime;
        u.want = RULES.diveTime + 0.05;
        u.face = Math.atan2(dx, dz);
        ev.push({ type: 'dive', who: i });
      } else {
        u.want = RULES.buffer;
        u.aimInp = inp;
      }
    }
    if (inp && u.want > 0) u.aimInp = inp; // ねらいは さいごに たおした 向き
    let wx = 0, wz = 0;
    const free = u.jump <= 0 && u.down <= 0 && u.dive <= 0;
    if (inp && inp.x != null && b.state !== 'dead' && free) {
      const m = Math.min(1, Math.hypot(inp.x, inp.z));
      if (m > 0.12) {
        const d = Math.hypot(inp.x, inp.z);
        wx = (inp.x / d) * RULES.speed * m;
        wz = (inp.z / d) * RULES.speed * m;
      }
    }
    // サーブを うつ 子は 動かない
    if (b.state === 'serve' && b.last === i) wx = wz = 0;
    if (u.dive > 0) {
      u.vx = u.dvx;
      u.vz = u.dvz;
    } else {
      const k = Math.min(1, ((free ? RULES.accel : RULES.accel * 0.4) * dt) / RULES.speed);
      u.vx += (wx - u.vx) * k;
      u.vz += (wz - u.vz) * k;
    }
    u.x += u.vx * dt;
    u.z += u.vz * dt;
    // 自分の コート(と まわりの 砂浜)の 中だけ
    const sx = u.side === 'L' ? -1 : 1;
    const ax = Math.min(RULES.halfW + 1.2, Math.max(RULES.netGap, u.x * sx));
    u.x = ax * sx;
    u.z = Math.max(-RULES.halfD - 1, Math.min(RULES.halfD + 1, u.z));
    if (Math.hypot(u.vx, u.vz) > 0.3 && u.down <= 0) u.face = Math.atan2(u.vx, u.vz);
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
    b.flyT += dt;
    const px = b.x;
    b.vy -= RULES.gravity * dt;
    if (s.wind.until > s.t) b.vz += s.wind.z * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    if (Math.sign(px) !== Math.sign(b.x) && Math.abs(b.z) < RULES.halfD + 0.6) {
      // ブロック: ネットの 前で とんでいる 子の 手に あたると はねかえる
      const to = sideOf(b.x);
      const blocker = s.teams[to].find((j) => {
        const o = s.units[j];
        return o.block > 0 && Math.abs(o.x) < RULES.blockX + 0.2 && Math.abs(o.z - b.z) < RULES.blockW && b.y < RULES.blockTop && b.y > RULES.netH - 0.3;
      });
      if (blocker !== undefined && b.lastSide !== to) {
        b.x = px;
        b.vx = -b.vx * 0.4;
        b.vz *= 0.3;
        b.vy = Math.min(b.vy, 0) - 1.5;
        b.last = blocker;
        b.lastSide = to;
        b.touches = 0;
        b.kind = 'block';
        b.forUnit = null;
        b.flyT = 0;
        s.units[blocker].blocks++;
        s.rally++;
        ev.push({ type: 'block', who: blocker, x: 0, y: b.y, z: b.z });
      } else if (b.y < RULES.netH) {
        // 低く 通ったら ネットに かかって 失点
        b.x = px;
        ev.push({ type: 'net', x: 0, y: b.y, z: b.z });
        point(s, b.lastSide === 'L' ? 'R' : 'L', 'net', ev);
        return ev;
      }
    }
    // うつ: ボタンを おした 子(待ってくれる あいだ)
    const side = sideOf(b.x);
    for (const i of s.teams[side]) {
      const u = s.units[i];
      if (u.want <= 0 || u.cool > 0 || b.state !== 'fly') continue;
      if (canDo(s, i) !== 'hit' && !(u.dive > 0 && Math.hypot(b.x - u.x, b.z - u.z) < RULES.diveHand && b.y < RULES.reachHi && b.y > 0.15)) continue;
      if (b.lastSide === side && b.touches >= 3 && b.kind !== 'block') { point(s, side === 'L' ? 'R' : 'L', 'touch', ev); return ev; }
      hit(s, i, u.aimInp, ev, { dive: u.dive > 0 || u.down > 0 });
      break;
    }
    // 落ちた
    if (b.state === 'fly' && b.y <= RULES.ballR) {
      b.y = RULES.ballR;
      const inside = inCourt(b.x, b.z);
      const landSide = sideOf(b.x);
      ev.push({ type: 'land', x: b.x, z: b.z, inside, kind: b.kind });
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
export const HELPER = { react: 0.3, err: 0.7, tsd: 0.1, block: 0.35, aim: 0.5, dive: 0.35 };

export function ranking(s) {
  const players = s.units.map((u, i) => i).filter((i) => s.units[i].slot >= 0);
  const order = (side) => players.filter((i) => s.units[i].side === side)
    .sort((a, b) => s.units[b].points - s.units[a].points || s.units[b].nice - s.units[a].nice || s.units[b].touches - s.units[a].touches || a - b)
    .map((i) => s.units[i].slot);
  const w = s.winner ?? (s.score.L >= s.score.R ? 'L' : 'R');
  return [...order(w), ...order(w === 'R' ? 'L' : 'R')];
}
