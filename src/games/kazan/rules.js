// 火山の 落ちものよけ のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 火山の ふもとの まるい 岩場。空から 岩や 火の玉が ふってくる。よけて 最後まで のこった子の 勝ち(勝ちぬき)。
// - 落ちもの: 落ちる ところに 先に 影(予告)が 出る。大きい ものほど 影も 大きい。当たったら 脱落。
//   - rock: ふつうの 岩 / big: 大岩(影が 大きい・予告が 長い) / fire: 火の玉(落ちた あとに しばらく 火が のこる)
// - 転がる 岩(roll): 岩場の はしから はしへ 転がってくる。ジャンプで とびこえられる。
// - だんだん 激しく: ふってくる 間かくが みじかく、大岩が ふえる。
// - 足場が くずれる: crumbleAt 秒から、外がわの かけらが ぐらぐら → くずれる。落ちたら 脱落。
// - おたすけの かさ: ときどき かさが 落ちている。ひろうと shieldTime 秒、1回だけ 当たっても だいじょうぶ。
// - 時間ぎれ(timeLimit)まで のこった子は みんな 上位(まん中に 近い 子ほど 上)。
//
// inputs[slot]: { x, z(スティック。長さ 1 まで), jump(おした しゅんかん true) } または null
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, randRange, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;
export const TIMES_OF_DAY = ['evening'];

export const RULES = {
  readyTime: 3.0,
  timeLimit: 70,
  r0: 5.0, // 岩場の 半径
  core: 2.0, // くずれない まん中
  speed: 3.3,
  accel: 14,
  bodyR: 0.32,
  jumpV: 5.6,
  gravity: 16,
  // 落ちもの
  kinds: {
    rock: { r: 0.6, warn: 1.15 },
    big: { r: 1.25, warn: 1.7 },
    fire: { r: 0.55, warn: 1.0, burn: 2.2 },
  },
  dropEvery: [1.05, 0.32], // はじめ → さいご(intensity 0 → 1)
  rampTime: 50, // この秒で intensity が 1 に
  aimChance: 0.45, // 子を ねらって 落とす わりあい(少し ずらす)
  rollFrom: 12, // 転がる岩が 来はじめる
  rollEvery: [7, 4],
  rollR: 0.4,
  rollSpeed: 4.2,
  rollClear: 0.42, // 足が これより 上なら とびこえられる
  crumbleAt: 18,
  crumbleEvery: 1.6,
  crumbleWarn: 1.5,
  itemEvery: [9, 14],
  itemFirst: 7,
  itemLife: 8,
  shieldTime: 7,
  pickR: 0.6,
};

// くずれる 足場: 外から 2 本の輪。それぞれ 扇形の かけらに わかれている
export const BANDS = [
  { outer: 5.0, inner: 3.6, n: 12 },
  { outer: 3.6, inner: 2.0, n: 9 },
];

export function startPos(slot, n) {
  const a = -Math.PI / 2 + (slot / n) * Math.PI * 2;
  return { x: Math.cos(a) * 2.4, z: Math.sin(a) * 2.4 + 0.0001 };
}

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:kazan`),
    phase: 'ready', // ready → play → finished
    pieces: [], // { id, band, k, a0, a1, outer, inner, state: 0 / 1 ぐらぐら / 2 くずれた, t }
    order: [],
    nextCrumble: RULES.crumbleAt,
    drops: [], // { id, kind, x, z, r, at(落ちる時刻), warn }
    fires: [], // { id, x, z, r, until }
    rolls: [], // { id, x, z, dx, dz, until }
    items: [], // { id, x, z, until }
    nextDrop: 0.6,
    nextRoll: RULES.rollFrom,
    nextItem: RULES.itemFirst,
    nextId: 1,
    winner: null,
    out: [], // 脱落した順
    runners: players.map((_, slot) => {
      const p = startPos(slot, players.length);
      return { x: p.x, z: p.z, vx: 0, vz: 0, y: 0, vy: 0, face: Math.atan2(-p.x, -p.z), alive: true, shield: 0, jumps: 0, shields: 0, blocked: 0, falling: 0 };
    }),
  };
  s.timeOfDay = TIMES_OF_DAY[0];
  s.bandOff = BANDS.map(() => nextRandom(s) * Math.PI * 2);
  BANDS.forEach((b, bi) => {
    const ids = [];
    const w = (Math.PI * 2) / b.n;
    for (let k = 0; k < b.n; k++) {
      const a0 = s.bandOff[bi] + k * w;
      ids.push(s.pieces.length);
      s.pieces.push({ id: s.pieces.length, band: bi, k, a0, a1: a0 + w, outer: b.outer, inner: b.inner, state: 0, t: 0 });
    }
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(nextRandom(s) * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    // 内がわの 輪は 半分だけ くずれる(まん中に 近い ところが のこるように)
    s.order.push(...(bi === 0 ? ids : ids.slice(0, Math.ceil(ids.length / 2))));
  });
  return s;
}

export const playTime = (s) => Math.max(0, s.t - RULES.readyTime);
export const timeLeft = (s) => Math.max(0, RULES.timeLimit - playTime(s));
export const intensity = (s) => Math.min(1, playTime(s) / RULES.rampTime);
export const aliveSlots = (s) => s.runners.map((r, i) => (r.alive ? i : -1)).filter((i) => i >= 0);

// (x, z) の下の かけら(まん中・外なら null)
export function pieceAt(s, x, z) {
  const d = Math.hypot(x, z);
  if (d <= RULES.core || d > RULES.r0) return null;
  const bi = BANDS.findIndex((b) => d <= b.outer && d > b.inner);
  const b = BANDS[bi];
  const w = (Math.PI * 2) / b.n;
  let a = Math.atan2(z, x) - s.bandOff[bi];
  a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const k = Math.min(b.n - 1, Math.floor(a / w));
  let base = 0;
  for (let i = 0; i < bi; i++) base += BANDS[i].n;
  return s.pieces[base + k];
}
export function solidAt(s, x, z) {
  const d = Math.hypot(x, z);
  if (d > RULES.r0) return false;
  if (d <= RULES.core) return true;
  return pieceAt(s, x, z).state !== 2;
}
export const shakyAt = (s, x, z) => pieceAt(s, x, z)?.state === 1;

// 足場の ある ところを くじで(まん中寄り)
function randomSpot(s) {
  for (let i = 0; i < 20; i++) {
    const a = nextRandom(s) * Math.PI * 2, d = Math.sqrt(nextRandom(s)) * (RULES.r0 - 0.3);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (solidAt(s, x, z)) return { x, z };
  }
  return { x: 0, z: 0 };
}

function spawnDrop(s, ev) {
  const k = intensity(s);
  const roll = nextRandom(s);
  const kind = roll < 0.12 + k * 0.18 ? 'big' : roll < 0.3 + k * 0.15 ? 'fire' : 'rock';
  const def = RULES.kinds[kind];
  let spot;
  const alive = aliveSlots(s);
  if (alive.length && nextRandom(s) < RULES.aimChance) {
    const r = s.runners[alive[Math.floor(nextRandom(s) * alive.length)]];
    spot = { x: r.x + randRange(s, -0.9, 0.9), z: r.z + randRange(s, -0.9, 0.9) };
  } else spot = randomSpot(s);
  const warn = def.warn * (1 - k * 0.2);
  const d = { id: s.nextId++, kind, x: spot.x, z: spot.z, r: def.r, at: s.t + warn, warn };
  s.drops.push(d);
  ev.push({ type: 'drop', id: d.id, kind, x: d.x, z: d.z, r: d.r, warn });
}

function spawnRoll(s, ev) {
  // 岩場の ふちの どこかから、まん中の 近くを 通って 反対がわへ
  const a = nextRandom(s) * Math.PI * 2;
  const off = randRange(s, -2.2, 2.2);
  const dx = -Math.cos(a), dz = -Math.sin(a);
  const sx = Math.cos(a) * (RULES.r0 + 1) - dz * off, sz = Math.sin(a) * (RULES.r0 + 1) + dx * off;
  const speed = RULES.rollSpeed * (1 + intensity(s) * 0.3);
  const ro = { id: s.nextId++, x: sx, z: sz, dx: dx * speed, dz: dz * speed, until: s.t + (2 * (RULES.r0 + 1.5)) / speed };
  s.rolls.push(ro);
  ev.push({ type: 'roll', id: ro.id, x: sx, z: sz, dx: ro.dx, dz: ro.dz });
}

// slot が 当たった(かさが あれば 1回 ふせぐ)
function hit(s, slot, ev, cause) {
  const r = s.runners[slot];
  if (!r.alive) return;
  if (r.shield > 0) {
    r.shield = 0;
    r.blocked++;
    ev.push({ type: 'block', who: slot, cause });
    return;
  }
  eliminate(s, slot, ev, cause);
}
function eliminate(s, slot, ev, cause) {
  const r = s.runners[slot];
  r.alive = false;
  s.out.push(slot);
  ev.push({ type: 'out', who: slot, cause });
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
  const tp = playTime(s);
  const k = intensity(s);
  // ── 落ちもの・転がる岩・かさ を 出す ──
  if (tp >= s.nextDrop) {
    spawnDrop(s, ev);
    s.nextDrop = tp + RULES.dropEvery[0] + (RULES.dropEvery[1] - RULES.dropEvery[0]) * k;
  }
  if (tp >= s.nextRoll) {
    spawnRoll(s, ev);
    s.nextRoll = tp + RULES.rollEvery[0] + (RULES.rollEvery[1] - RULES.rollEvery[0]) * k;
  }
  if (tp >= s.nextItem) {
    const spot = randomSpot(s);
    const it = { id: s.nextId++, x: spot.x, z: spot.z, until: s.t + RULES.itemLife };
    s.items.push(it);
    ev.push({ type: 'item', id: it.id, x: it.x, z: it.z });
    s.nextItem = tp + randRange(s, RULES.itemEvery[0], RULES.itemEvery[1]);
  }
  // ── 足場が くずれる ──
  if (tp >= s.nextCrumble && s.order.length) {
    s.nextCrumble += RULES.crumbleEvery;
    const p = s.pieces[s.order.shift()];
    p.state = 1;
    p.t = RULES.crumbleWarn;
    ev.push({ type: 'shaky', id: p.id });
  }
  for (const p of s.pieces) {
    if (p.state !== 1) continue;
    p.t -= dt;
    if (p.t <= 0) { p.state = 2; ev.push({ type: 'crumble', id: p.id }); }
  }
  // ── 子が 動く ──
  for (const [slot, r] of s.runners.entries()) {
    if (!r.alive) continue;
    r.shield = Math.max(0, r.shield - dt);
    const inp = inputs[slot] || {};
    if (r.falling > 0) continue;
    let ix = inp.x || 0, iz = inp.z || 0;
    const m = Math.hypot(ix, iz);
    if (m > 1) { ix /= m; iz /= m; }
    const tx = ix * RULES.speed, tz = iz * RULES.speed;
    const a = Math.min(1, RULES.accel * dt * (r.y > 0 ? 0.4 : 1));
    r.vx += (tx - r.vx) * a;
    r.vz += (tz - r.vz) * a;
    if (m > 0.1) r.face = Math.atan2(ix, iz);
    r.x += r.vx * dt;
    r.z += r.vz * dt;
    if (inp.jump && r.y <= 0) { r.vy = RULES.jumpV; r.jumps++; ev.push({ type: 'jump', who: slot }); }
    if (r.y > 0 || r.vy > 0) {
      r.vy -= RULES.gravity * dt;
      r.y = Math.max(0, r.y + r.vy * dt);
      if (r.y <= 0) { r.vy = 0; ev.push({ type: 'land', who: slot }); }
    }
  }
  // 子どうしが ぶつかる(押しあう)
  const alive = aliveSlots(s);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = s.runners[alive[i]], b = s.runners[alive[j]];
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = RULES.bodyR * 2;
      if (d < min && d > 1e-6) {
        const push = (min - d) / 2;
        a.x -= (dx / d) * push; a.z -= (dz / d) * push;
        b.x += (dx / d) * push; b.z += (dz / d) * push;
      }
    }
  }
  // 足場が ない ところに 立ったら 落ちる
  for (const slot of alive) {
    const r = s.runners[slot];
    if (r.falling > 0) {
      r.falling -= dt;
      if (r.falling <= 0) eliminate(s, slot, ev, 'fall');
      continue;
    }
    if (r.y <= 0 && !solidAt(s, r.x, r.z)) {
      r.falling = 0.35;
      ev.push({ type: 'falling', who: slot });
    }
  }
  // ── 落ちもの が 落ちる ──
  for (let i = s.drops.length - 1; i >= 0; i--) {
    const d = s.drops[i];
    if (s.t < d.at) continue;
    s.drops.splice(i, 1);
    const hits = aliveSlots(s).filter((slot) => {
      const r = s.runners[slot];
      return r.falling <= 0 && Math.hypot(r.x - d.x, r.z - d.z) < d.r + RULES.bodyR * 0.6 && r.y < 1.5;
    });
    ev.push({ type: 'land_drop', id: d.id, kind: d.kind, x: d.x, z: d.z, r: d.r, hits });
    for (const slot of hits) hit(s, slot, ev, d.kind);
    if (d.kind === 'fire') {
      const f = { id: d.id, x: d.x, z: d.z, r: d.r * 0.9, until: s.t + RULES.kinds.fire.burn };
      s.fires.push(f);
    }
  }
  // 火が のこっている ところに 入ったら 当たり(ジャンプ中は だいじょうぶ)
  s.fires = s.fires.filter((f) => f.until > s.t);
  for (const f of s.fires) {
    for (const slot of aliveSlots(s)) {
      const r = s.runners[slot];
      if (r.y < 0.2 && r.falling <= 0 && Math.hypot(r.x - f.x, r.z - f.z) < f.r + RULES.bodyR * 0.4) hit(s, slot, ev, 'burn');
    }
  }
  // ── 転がる岩 ──
  for (let i = s.rolls.length - 1; i >= 0; i--) {
    const ro = s.rolls[i];
    ro.x += ro.dx * dt;
    ro.z += ro.dz * dt;
    if (s.t >= ro.until) { s.rolls.splice(i, 1); continue; }
    for (const slot of aliveSlots(s)) {
      const r = s.runners[slot];
      if (r.falling > 0 || r.y >= RULES.rollClear) continue;
      if (Math.hypot(r.x - ro.x, r.z - ro.z) < RULES.rollR + RULES.bodyR * 0.6) {
        if (r.shield > 0) {
          // かさで はじく: 岩は くだけて 消える
          s.rolls.splice(i, 1);
          ev.push({ type: 'rollBreak', id: ro.id });
        }
        hit(s, slot, ev, 'roll');
        break;
      }
    }
  }
  // ── かさを ひろう ──
  s.items = s.items.filter((it) => it.until > s.t);
  for (let i = s.items.length - 1; i >= 0; i--) {
    const it = s.items[i];
    const who = aliveSlots(s).find((slot) => {
      const r = s.runners[slot];
      return Math.hypot(r.x - it.x, r.z - it.z) < RULES.pickR && r.falling <= 0;
    });
    if (who === undefined) continue;
    s.items.splice(i, 1);
    s.runners[who].shield = RULES.shieldTime;
    s.runners[who].shields++;
    ev.push({ type: 'pick', who, id: it.id });
  }
  // ── 決着 ──
  const left = aliveSlots(s);
  if (left.length <= (s.runners.length > 1 ? 1 : 0) || timeLeft(s) <= 0) {
    s.phase = 'finished';
    s.winner = ranking(s)[0];
    ev.push({ type: 'finished', winner: s.winner, timeUp: left.length > 1 });
  }
  return ev;
}

// のこった子(まん中に 近い 順)、そのあと 脱落が おそかった順
export function ranking(s) {
  const alive = aliveSlots(s).sort((a, b) => Math.hypot(s.runners[a].x, s.runners[a].z) - Math.hypot(s.runners[b].x, s.runners[b].z) || a - b);
  return [...alive, ...[...s.out].reverse()];
}
