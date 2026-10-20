// 雪山の 雪合戦 のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 雪山の ふもとの 村の 広場で、3人 対 3人の 雪合戦。まん中の 線から 先へは 行けない。
// 雪玉を 3回 当てられた子は 雪だるまに なって 脱落。相手を みんな 雪だるまに したら 勝ち。
// - チーム: くじで 左(L)・右(R)へ。3人に たりない チームには、森の なかま(すけっと)が入る(動きは このファイルの helperInput)。
// - なげる: 向いている 向きへ まっすぐ。スティックを 少しだけ たおすと、その場で 向きだけ かえられる。
// - 雪玉づくり: 雪玉は ammoMax こまで。「つくる」ボタンを makeTaps 回 れんだ すると 1こ できる(こおりの 上では できない)。
//   れんだ している あいだは しゃがむので 動けない。
// - 雪の かべ: かくれると 雪玉を ふせげる。wallHP 回 当たると くずれる。
// - こおりの ゆか: つるつる すべる(止まりにくい・曲がりにくい)。こおりの 上では 雪玉を つくれない。
// - 金の 雪玉: ときどき 落ちている。ひろうと つぎの 1こが 金(当たると 2つ ぶん)。
// - timeLimit 秒で 決まらなければ、のこりの 体力の 合計が 多い チームの 勝ち(同じなら 当てた 数)。
// 順位: 勝った チームの子を よく当てた順、そのあと 負けた チームの子を よく当てた順。
//
// inputs[slot]: { x, z(スティック。長さ 1 まで), throw, make(どちらも おした しゅんかん true) } または null
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, randRange, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;
export const TIMES_OF_DAY = ['day', 'evening'];
export const TEAM_SIZE = 3;

export const RULES = {
  readyTime: 3.0,
  timeLimit: 60,
  halfW: 5.0, // 広場の はば(x)の 半分
  halfD: 3.5, // おくゆき(z)の 半分
  midGap: 0.45, // まん中の 線から これだけ はなれる
  speed: 3.1,
  accel: 14,
  iceAccel: 1.6, // こおりの 上では ほとんど 止まれない
  turnOnly: 0.35, // スティックが これより 小さいと 向きだけ かえる
  turnRate: 16,
  bodyR: 0.34,
  hp: 3,
  ammoMax: 3,
  ammoStart: 2,
  makeTaps: 6, // 雪玉 1こに いる れんだ の 回数
  makeHold: 0.28, // 1回 おすと この秒 しゃがむ(動けない)
  throwCd: 0.5,
  ballSpeed: 9,
  ballRange: 9,
  ballR: 0.16,
  stun: 0.6,
  knock: 3,
  wallHP: 4,
  wallW: 0.45, // かべの あつみ(x)
  wallD: 1.3, // かべの はば(z)
  goldFirst: 8,
  goldEvery: [10, 15],
  goldLife: 9,
  pickR: 0.55,
};

// かべ(左右 おなじ 形): 左の チームの ぶん。右は x を うらがえす
export const WALLS_L = [
  { x: -1.5, z: -1.7 },
  { x: -1.8, z: 1.5 },
  { x: -3.5, z: 0 },
];
// こおりの ゆか(まるい)。左の チームの ぶん
export const ICE_L = [
  { x: -2.6, z: -0.2, r: 0.9 },
  { x: -0.9, z: 2.7, r: 0.7 },
];

const unit = (side, slot, kind = null) => ({
  side, slot, kind, x: 0, z: 0, vx: 0, vz: 0, face: side === 'L' ? Math.PI / 2 : -Math.PI / 2,
  hp: RULES.hp, ammo: RULES.ammoStart, make: 0, makeT: 0, nextTap: 0, cd: 0, stun: 0, gold: false, alive: true,
  hits: 0, throws: 0, golds: 0,
  // すけっと用
  goalX: 0, goalZ: 0, nextGoal: 0, nextThink: 0, wantThrow: 0,
});

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:yuki`),
    phase: 'ready', // ready → play → finished
    teams: { L: [], R: [] }, // units の 番号
    units: [], // はじめの players.length こが プレイヤー(席の順)、のこりが すけっと
    balls: [], // { id, owner, x, z, dx, dz, left, gold }
    walls: [], // { id, side, x, z, hp }
    ice: [],
    golds: [], // { id, x, z, until }
    nextGold: RULES.goldFirst,
    nextId: 1,
    winner: null,
    out: [], // 雪だるまに なった 順(units の 番号)
  };
  s.timeOfDay = TIMES_OF_DAY[Math.floor(nextRandom(s) * TIMES_OF_DAY.length)];
  s.units = players.map((_, slot) => unit('L', slot));
  // チーム分けは くじ(席を まぜてから こうごに)
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
  // 立ち位置: 自分の 陣地の おくに たてに ならぶ
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    s.teams[side].forEach((i, k) => {
      const u = s.units[i];
      u.x = sx * 4.1;
      u.z = (k - (TEAM_SIZE - 1) / 2) * 2.2;
      u.face = side === 'L' ? Math.PI / 2 : -Math.PI / 2;
      u.goalX = u.x; u.goalZ = u.z;
    });
  }
  for (const w of WALLS_L) for (const sx of [-1, 1]) s.walls.push({ id: s.nextId++, side: sx < 0 ? 'L' : 'R', x: sx < 0 ? w.x : -w.x, z: sx < 0 ? w.z : -w.z, hp: RULES.wallHP });
  for (const c of ICE_L) for (const sx of [-1, 1]) s.ice.push({ x: sx < 0 ? c.x : -c.x, z: sx < 0 ? c.z : -c.z, r: c.r });
  return s;
}

export const playTime = (s) => Math.max(0, s.t - RULES.readyTime);
export const timeLeft = (s) => Math.max(0, RULES.timeLimit - playTime(s));
export const onIce = (s, x, z) => s.ice.some((c) => Math.hypot(x - c.x, z - c.z) < c.r);
export const teamHp = (s, side) => s.teams[side].reduce((a, i) => a + Math.max(0, s.units[i].hp), 0);
export const teamAlive = (s, side) => s.teams[side].filter((i) => s.units[i].alive);
export const facingVec = (u) => ({ x: Math.sin(u.face), z: Math.cos(u.face) });
const inWall = (w, x, z, pad) => Math.abs(x - w.x) < RULES.wallW / 2 + pad && Math.abs(z - w.z) < RULES.wallD / 2 + pad;
// (x, z) から (x2, z2) へ まっすぐ 投げたら かべに 当たるか
export function wallBetween(s, x, z, x2, z2) {
  const n = Math.ceil(Math.hypot(x2 - x, z2 - z) / 0.2);
  for (let k = 1; k < n; k++) {
    const px = x + ((x2 - x) * k) / n, pz = z + ((z2 - z) * k) / n;
    if (s.walls.some((w) => w.hp > 0 && inWall(w, px, pz, RULES.ballR))) return true;
  }
  return false;
}
// 陣地の 中に おさめる
function clampSide(u) {
  const sx = u.side === 'L' ? -1 : 1;
  const ax = Math.min(RULES.halfW - RULES.bodyR, Math.max(RULES.midGap, u.x * sx));
  u.x = ax * sx;
  u.z = Math.min(RULES.halfD - RULES.bodyR, Math.max(-RULES.halfD + RULES.bodyR, u.z));
}

function throwBall(s, i, ev) {
  const u = s.units[i];
  const f = facingVec(u);
  const b = { id: s.nextId++, owner: i, x: u.x + f.x * 0.45, z: u.z + f.z * 0.45, dx: f.x * RULES.ballSpeed, dz: f.z * RULES.ballSpeed, left: RULES.ballRange, gold: u.gold };
  u.ammo--;
  u.cd = RULES.throwCd;
  u.throws++;
  u.gold = false;
  s.balls.push(b);
  ev.push({ type: 'throw', who: i, id: b.id, gold: b.gold });
}

// すけっとの 動き(ルールの 乱数で。ふつうくらいの うでまえ)
function helperInput(s, i) {
  const u = s.units[i];
  const foes = teamAlive(s, u.side === 'L' ? 'R' : 'L').map((j) => s.units[j]);
  if (!foes.length) return null;
  let near = foes[0], nd = Infinity;
  for (const f of foes) { const d = Math.hypot(f.x - u.x, f.z - u.z); if (d < nd) { nd = d; near = f; } }
  const sx = u.side === 'L' ? -1 : 1;
  if (s.t >= u.nextGoal) {
    u.nextGoal = s.t + randRange(s, 1.2, 2.6);
    u.goalX = sx * randRange(s, 1.0, 4.4);
    u.goalZ = randRange(s, -3, 3);
  }
  const want = Math.atan2(near.x - u.x, near.z - u.z) + randRange(s, -0.12, 0.12);
  // 雪玉が なければ しゃがんで れんだ で つくる(1秒に 6回くらい)
  if (u.ammo <= 0 && !onIce(s, u.x, u.z)) {
    let make = false;
    if (s.t >= u.nextTap) { make = true; u.nextTap = s.t + randRange(s, 0.12, 0.22); }
    return { x: Math.sin(want) * 0.2, z: Math.cos(want) * 0.2, throw: false, make };
  }
  if (u.ammo <= 0) return { x: -sx, z: 0, throw: false };
  const dx = u.goalX - u.x, dz = u.goalZ - u.z, d = Math.hypot(dx, dz);
  // ねらう ときは その場で 向きを かえる
  const aim = nd < 8 && u.cd <= 0 && !wallBetween(s, u.x, u.z, near.x, near.z);
  if (aim) {
    const diff = Math.abs(((want - u.face + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    return { x: Math.sin(want) * 0.2, z: Math.cos(want) * 0.2, throw: diff < 0.12 && nextRandom(s) < 0.05 };
  }
  if (d < 0.2) return { x: 0, z: 0, throw: false };
  return { x: dx / d, z: dz / d, throw: false };
}

function hitUnit(s, i, b, ev) {
  const u = s.units[i];
  const dmg = b.gold ? 2 : 1;
  u.hp -= dmg;
  u.stun = RULES.stun;
  const sp = Math.hypot(b.dx, b.dz);
  u.vx = (b.dx / sp) * RULES.knock;
  u.vz = (b.dz / sp) * RULES.knock;
  s.units[b.owner].hits += dmg;
  ev.push({ type: 'hit', who: i, by: b.owner, gold: b.gold, hp: Math.max(0, u.hp), x: b.x, z: b.z });
  if (u.hp <= 0) {
    u.alive = false;
    s.out.push(i);
    ev.push({ type: 'out', who: i, by: b.owner });
  }
}

export function step(s, inputs) {
  const ev = [];
  if (s.phase === 'finished') return ev;
  const dt = STEP;
  s.t += dt;
  if (s.phase === 'ready') {
    if (s.t >= RULES.readyTime) { s.phase = 'play'; ev.push({ type: 'start' }); }
    return ev;
  }
  // ── 金の 雪玉 ──
  const tp = playTime(s);
  if (tp >= s.nextGold) {
    s.nextGold = tp + randRange(s, RULES.goldEvery[0], RULES.goldEvery[1]);
    for (const sx of [-1, 1]) {
      // 左右に 1こずつ(同じ 形の 場所)
      const g = { id: s.nextId++, x: sx * randRange(s, 1.2, 4.2), z: randRange(s, -3, 3), until: s.t + RULES.goldLife };
      if (sx > 0) { const o = s.golds[s.golds.length - 1]; g.x = -o.x; g.z = -o.z; }
      s.golds.push(g);
      ev.push({ type: 'gold', id: g.id, x: g.x, z: g.z });
    }
  }
  s.golds = s.golds.filter((g) => g.until > s.t);
  // ── 子が 動く ──
  for (const [i, u] of s.units.entries()) {
    if (!u.alive) continue;
    const inp = (u.slot >= 0 ? inputs[u.slot] : helperInput(s, i)) || {};
    u.cd = Math.max(0, u.cd - dt);
    u.stun = Math.max(0, u.stun - dt);
    u.makeT = Math.max(0, u.makeT - dt);
    let ix = inp.x || 0, iz = inp.z || 0;
    let m = Math.hypot(ix, iz);
    if (m > 1) { ix /= m; iz /= m; m = 1; }
    const ice = onIce(s, u.x, u.z);
    if (u.stun > 0) { ix = iz = 0; m = 0; }
    // 向き: スティックの 向きへ(小さく たおすと 向きだけ)
    if (m > 0.08) {
      const want = Math.atan2(ix, iz);
      let d = ((want - u.face + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const turn = RULES.turnRate * dt * (ice ? 0.5 : 1);
      u.face += Math.max(-turn, Math.min(turn, d));
    }
    const move = m >= RULES.turnOnly && u.makeT <= 0 ? 1 : 0;
    const tx = ix * RULES.speed * move, tz = iz * RULES.speed * move;
    const a = Math.min(1, (ice ? RULES.iceAccel : RULES.accel) * dt);
    u.vx += (tx - u.vx) * a;
    u.vz += (tz - u.vz) * a;
    u.x += u.vx * dt;
    u.z += u.vz * dt;
    clampSide(u);
    // かべに めりこまない
    for (const w of s.walls) {
      if (w.hp <= 0 || !inWall(w, u.x, u.z, RULES.bodyR)) continue;
      const ox = RULES.wallW / 2 + RULES.bodyR - Math.abs(u.x - w.x), oz = RULES.wallD / 2 + RULES.bodyR - Math.abs(u.z - w.z);
      if (ox < oz) { u.x += Math.sign(u.x - w.x || 1) * ox; u.vx = 0; } else { u.z += Math.sign(u.z - w.z || 1) * oz; u.vz = 0; }
    }
    // 雪玉づくり: 「つくる」を れんだ(雪の 上で)
    if (inp.make && !ice && u.ammo < RULES.ammoMax && u.stun <= 0) {
      u.makeT = RULES.makeHold;
      u.make++;
      ev.push({ type: 'scoop', who: i, make: u.make });
      if (u.make >= RULES.makeTaps) { u.make = 0; u.ammo++; ev.push({ type: 'make', who: i, ammo: u.ammo }); }
    }
    // 金の 雪玉を ひろう
    for (let k = s.golds.length - 1; k >= 0; k--) {
      const g = s.golds[k];
      if (Math.hypot(g.x - u.x, g.z - u.z) < RULES.pickR) {
        s.golds.splice(k, 1);
        u.gold = true;
        u.golds++;
        u.ammo = Math.max(u.ammo, 1);
        ev.push({ type: 'pick', who: i, id: g.id });
      }
    }
    if (inp.throw && u.ammo > 0 && u.cd <= 0 && u.stun <= 0) throwBall(s, i, ev);
  }
  // 子どうしが 押しあう
  const alive = s.units.map((u, i) => i).filter((i) => s.units[i].alive);
  for (let a = 0; a < alive.length; a++) {
    for (let b = a + 1; b < alive.length; b++) {
      const p = s.units[alive[a]], q = s.units[alive[b]];
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), min = RULES.bodyR * 2;
      if (d < min && d > 1e-6) {
        const push = (min - d) / 2;
        p.x -= (dx / d) * push; p.z -= (dz / d) * push;
        q.x += (dx / d) * push; q.z += (dz / d) * push;
        clampSide(p); clampSide(q);
      }
    }
  }
  // ── 雪玉が とぶ ──
  for (let k = s.balls.length - 1; k >= 0; k--) {
    const b = s.balls[k];
    const n = 3; // ぬけないように 3回に わけて すすめる
    let gone = false;
    for (let j = 0; j < n && !gone; j++) {
      b.x += (b.dx * dt) / n;
      b.z += (b.dz * dt) / n;
      b.left -= (RULES.ballSpeed * dt) / n;
      const w = s.walls.find((w) => w.hp > 0 && inWall(w, b.x, b.z, RULES.ballR));
      if (w) {
        w.hp--;
        ev.push({ type: 'wallHit', id: w.id, ball: b.id, x: b.x, z: b.z, hp: w.hp });
        if (w.hp <= 0) ev.push({ type: 'wallBreak', id: w.id });
        gone = true;
        break;
      }
      const owner = s.units[b.owner];
      for (const i of alive) {
        const u = s.units[i];
        if (u.side === owner.side || !u.alive) continue;
        if (Math.hypot(u.x - b.x, u.z - b.z) < RULES.bodyR + RULES.ballR) {
          hitUnit(s, i, b, ev);
          gone = true;
          break;
        }
      }
      if (!gone && (b.left <= 0 || Math.abs(b.x) > RULES.halfW + 1 || Math.abs(b.z) > RULES.halfD + 1)) {
        ev.push({ type: 'miss', ball: b.id, x: b.x, z: b.z });
        gone = true;
      }
    }
    if (gone) s.balls.splice(k, 1);
  }
  // ── 決着 ──
  const l = teamAlive(s, 'L').length, r = teamAlive(s, 'R').length;
  if (!l || !r || timeLeft(s) <= 0) {
    s.phase = 'finished';
    if (!l && r) s.winner = 'R';
    else if (!r && l) s.winner = 'L';
    else {
      const hl = teamHp(s, 'L'), hr = teamHp(s, 'R');
      const sum = (side) => s.teams[side].reduce((a, i) => a + s.units[i].hits, 0);
      s.winner = hl !== hr ? (hl > hr ? 'L' : 'R') : sum('L') !== sum('R') ? (sum('L') > sum('R') ? 'L' : 'R') : nextRandom(s) < 0.5 ? 'L' : 'R';
    }
    ev.push({ type: 'finished', winner: s.winner, timeUp: !!(l && r) });
  }
  return ev;
}

// 順位(席の 番号): 勝った チームの子を よく当てた順、そのあと 負けた チーム
export function ranking(s) {
  const players = s.units.map((u, i) => i).filter((i) => s.units[i].slot >= 0);
  const order = (side) => players.filter((i) => s.units[i].side === side)
    .sort((a, b) => s.units[b].hits - s.units[a].hits || s.units[b].hp - s.units[a].hp || a - b)
    .map((i) => s.units[i].slot);
  const w = s.winner ?? 'L';
  return [...order(w), ...order(w === 'R' ? 'L' : 'R')];
}
