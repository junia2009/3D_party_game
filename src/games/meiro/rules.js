// 森の いせきの どんぐり めいろ のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 5人が いしの めいろを はしりまわって、ちらばる どんぐりを あつめる。60 秒で いちばん 多い 子の 勝ち。
// - めいろ: シードで まいかい ちがう。ます目の 盤(かべ / ゆか)。ところどころ 道が つながって いて、まわりみちが できる。
// - どんぐり 1 点、たからばこ 5 点。とった どんぐりは しばらく すると ほかの ところに また はえる。
// - かべが うごく: いくつかの いしかべが じゅんばんに しずんだり でたり する(でる 1 秒まえから ぐらぐら)。
//   でて きた かべの 上に いた 子は となりの ゆかへ おしだされる。
// - おばけ: めいろを うろつく。ちかくの 子に よって くる。ぶつかると どんぐりを 3こ おとして(まわりに ちらばる)、
//   すこしの あいだ うごけない。そのあと しばらく おばけに ぶつからない。
// - じゃんぷ ゆか: ふむと かべを 1つ とびこえて 2ます さきへ。ちかみち。
// 順位: どんぐりの 数 → 席。
//
// inputs[slot]: { x, y(うごく 向き。-1〜1。y は 下(手前)が +) } または null
// 座標: ます目 1つが 1。(i + 0.5, j + 0.5) が ます (i, j) の まんなか。
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, randRange, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;

export const RULES = {
  readyTime: 3,
  playTime: 60,
  showTime: 2.6,
  size: 17, // めいろの 1辺(ます目。奇数)
  loops: 0.3, // かべを ぬいて まわりみちを つくる わりあい
  speed: 3.4, // はしる はやさ(ます/秒)
  radius: 0.3,
  acorns: 70, // はじめの どんぐりの 数
  regrow: 1.6, // どんぐりが また はえる まで(秒ごとに 1こ)
  chests: 3,
  chestValue: 5,
  chestRegrow: 9, // たからばこが また でる まで
  bigAt: 15, // のこり この 秒で 大きな たからばこが 1こ でる
  bigValue: 10,
  movers: 8, // うごく かべの 数
  moverPeriod: 8, // うごく かべの 1しゅう(秒)。はんぶん でて はんぶん しずむ
  warn: 1.0,
  ghosts: 2,
  ghostSpeed: 2.2,
  ghostLook: 5, // この ますより ちかい 子に よって いく
  drop: 3, // ぶつかると おとす どんぐり
  stun: 1.0,
  safe: 2.5, // ぶつかった あと おばけに ぶつからない 時間
  pads: 6, // じゃんぷ ゆか
  jumpTime: 0.55,
};

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// めいろを つくる(あなほり)。1 = かべ、0 = ゆか
function carve(s) {
  const n = RULES.size;
  const g = Array.from({ length: n }, () => new Array(n).fill(1));
  const stack = [[1, 1]];
  g[1][1] = 0;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const opts = DIRS.filter(([dx, dy]) => { const nx = x + dx * 2, ny = y + dy * 2; return nx > 0 && ny > 0 && nx < n - 1 && ny < n - 1 && g[ny][nx] === 1; });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dy] = opts[Math.floor(nextRandom(s) * opts.length)];
    g[y + dy][x + dx] = 0;
    g[y + dy * 2][x + dx * 2] = 0;
    stack.push([x + dx * 2, y + dy * 2]);
  }
  // まわりみち: あいだの かべを すこし ぬく
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    if (g[y][x] !== 1) continue;
    const h = g[y][x - 1] === 0 && g[y][x + 1] === 0 && g[y - 1][x] === 1 && g[y + 1][x] === 1;
    const v = g[y - 1][x] === 0 && g[y + 1][x] === 0 && g[y][x - 1] === 1 && g[y][x + 1] === 1;
    if ((h || v) && nextRandom(s) < RULES.loops) g[y][x] = 0;
  }
  // まんなかは ひろば(3×3)
  const c = (n - 1) / 2;
  for (let y = c - 1; y <= c + 1; y++) for (let x = c - 1; x <= c + 1; x++) g[y][x] = 0;
  return g;
}

export const cellOf = (v) => Math.floor(v);
export const isFloor = (s, x, y) => x >= 0 && y >= 0 && x < RULES.size && y < RULES.size && s.grid[y][x] === 0 && !moverUp(s, x, y);
function moverAt(s, x, y) { return s.movers.find((m) => m.x === x && m.y === y); }
// うごく かべが いま でて いるか(t は たたかいが はじまってからの 秒)
export function moverUp(s, x, y) {
  const m = moverAt(s, x, y);
  if (!m) return false;
  return moverPhase(s, m) < 0.5;
}
export function moverPhase(s, m) {
  const t = s.phase === 'play' ? RULES.playTime - s.phaseT : 0;
  return ((t / RULES.moverPeriod + m.off) % 1 + 1) % 1;
}
// もうすぐ でる(ぐらぐら)
export const moverWarn = (s, m) => { const p = moverPhase(s, m); return p > 1 - RULES.warn / RULES.moverPeriod; };

function emptyCells(s) {
  const out = [];
  for (let y = 0; y < RULES.size; y++) for (let x = 0; x < RULES.size; x++) {
    if (s.grid[y][x] !== 0 || moverAt(s, x, y)) continue;
    if (s.items.some((it) => it.x === x && it.y === y)) continue;
    if (s.pads.some((p) => p.x === x && p.y === y)) continue;
    out.push([x, y]);
  }
  return out;
}
function pick(s, list) { return list.splice(Math.floor(nextRandom(s) * list.length), 1)[0]; }

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:meiro`),
    phase: 'ready',
    phaseT: RULES.readyTime,
    items: [], // { x, y, kind: 'acorn' | 'chest' }
    pads: [],
    movers: [],
    ghosts: [],
    regrowT: 0,
    chestT: RULES.chestRegrow,
    winner: null,
  };
  s.grid = carve(s);
  const n = RULES.size;
  // うごく かべ: ゆかに はさまれた かべ(まわりみちに なる ところ)を ゆかに して、うごく かべに する
  const cand = [];
  for (let y = 2; y < n - 2; y++) for (let x = 2; x < n - 2; x++) {
    if (s.grid[y][x] !== 1) continue;
    const h = s.grid[y][x - 1] === 0 && s.grid[y][x + 1] === 0;
    const v = s.grid[y - 1][x] === 0 && s.grid[y + 1][x] === 0;
    if (h !== v) cand.push([x, y]);
  }
  for (let k = 0; k < RULES.movers && cand.length; k++) {
    const [x, y] = pick(s, cand);
    s.grid[y][x] = 0;
    s.movers.push({ x, y, off: randRange(s, 0, 1) });
  }
  // じゃんぷ ゆか: ゆか → かべ 1つ → ゆか の ならび
  const padCand = [];
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    if (s.grid[y][x] !== 0 || moverAt(s, x, y)) continue;
    for (const [dx, dy] of DIRS) {
      const wx = x + dx, wy = y + dy, lx = x + dx * 2, ly = y + dy * 2;
      if (lx <= 0 || ly <= 0 || lx >= n - 1 || ly >= n - 1) continue;
      if (s.grid[wy][wx] === 1 && s.grid[ly][lx] === 0 && !moverAt(s, lx, ly)) padCand.push({ x, y, dx, dy });
    }
  }
  for (let k = 0; k < RULES.pads && padCand.length; k++) {
    const p = pick(s, padCand);
    if (s.pads.some((q) => Math.abs(q.x - p.x) + Math.abs(q.y - p.y) < 3)) { k--; continue; }
    s.pads.push(p);
  }
  // 5人は 四すみと まんなか
  const c = (n - 1) / 2;
  const starts = [[c, c], [1, 1], [n - 2, 1], [1, n - 2], [n - 2, n - 2]];
  s.players = players.map((_, i) => {
    const [x, y] = starts[i % starts.length];
    return { x: x + 0.5, y: y + 0.5, score: 0, stun: 0, safe: 0, jump: null, fx: 0, fy: 1, chests: 0, lost: 0 };
  });
  // どんぐりと たからばこ
  const free = emptyCells(s).filter(([x, y]) => !starts.some(([sx, sy]) => sx === x && sy === y));
  for (let k = 0; k < RULES.acorns && free.length; k++) { const [x, y] = pick(s, free); s.items.push({ x, y, kind: 'acorn' }); }
  for (let k = 0; k < RULES.chests; k++) spawnChest(s);
  // おばけ: まんなかの まわり
  for (let k = 0; k < RULES.ghosts; k++) s.ghosts.push({ x: (k ? n - 2 : 1) + 0.5, y: c + 0.5, tx: null, ty: null });
  return s;
}

function spawnChest(s, big = false) {
  // たからばこは めいろの すみの ほう(ゆき止まり)に でやすい
  // だれかの すぐ ちかくには でない(でた しゅんかんに とられない ように)
  const free = emptyCells(s).filter(([x, y]) => s.players.every((p) => Math.abs(p.x - x - 0.5) + Math.abs(p.y - y - 0.5) > 5));
  const dead = free.filter(([x, y]) => DIRS.filter(([dx, dy]) => s.grid[y + dy]?.[x + dx] === 0).length === 1);
  const list = dead.length ? dead : free;
  if (!list.length) return null;
  const [x, y] = pick(s, list);
  s.items.push({ x, y, kind: 'chest', ...(big ? { big: true } : {}), id: (s.chestId = (s.chestId || 0) + 1), born: s.phase === 'play' ? s.t : s.t + s.phaseT }); // born: でた 時(はじめの ぶんは スタートの 時)
  return s.items[s.items.length - 1];
}

export const chestValue = (it) => (it.big ? RULES.bigValue : RULES.chestValue);
export const timeLeft = (s) => (s.phase === 'play' ? Math.max(0, s.phaseT) : 0);

// まるい からだを かべに あわせて うごかす(かどは すこし すべらせて 道に いれる)
function blocked(s, x, y, r) {
  for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) if (!isFloor(s, cellOf(x + ox), cellOf(y + oy))) return true;
  return false;
}
function move(s, p, vx, vy, dt) {
  const r = RULES.radius;
  const nx = p.x + vx * dt;
  if (!blocked(s, nx, p.y, r)) p.x = nx;
  else if (vx !== 0) {
    // かどで ひっかからない ように、道の まんなかへ すこし よせる
    const cy = cellOf(p.y) + 0.5;
    if (Math.abs(p.y - cy) < 0.45 && isFloor(s, cellOf(p.y) , cellOf(nx + Math.sign(vx) * r))) p.y += Math.sign(cy - p.y) * Math.min(Math.abs(cy - p.y), Math.abs(vx) * dt);
  }
  const ny = p.y + vy * dt;
  if (!blocked(s, p.x, ny, r)) p.y = ny;
  else if (vy !== 0) {
    const cx = cellOf(p.x) + 0.5;
    if (Math.abs(p.x - cx) < 0.45 && isFloor(s, cellOf(ny + Math.sign(vy) * r), cellOf(p.x))) p.x += Math.sign(cx - p.x) * Math.min(Math.abs(cx - p.x), Math.abs(vy) * dt);
  }
}
// でて きた かべに のって いたら、いちばん ちかい ゆかへ
function pushOut(s, p) {
  if (isFloor(s, cellOf(p.x), cellOf(p.y))) return false;
  let best = null, bd = Infinity;
  for (const [dx, dy] of [...DIRS, [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x = cellOf(p.x) + dx, y = cellOf(p.y) + dy;
    if (!isFloor(s, x, y)) continue;
    const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y);
    if (d < bd) { bd = d; best = [x + 0.5, y + 0.5]; }
  }
  if (best) { p.x = best[0]; p.y = best[1]; }
  return true;
}

// おばけ: ちかくの 子へ、いなければ うろうろ(ます目に そって)
function stepGhost(s, g, dt) {
  const gx = cellOf(g.x), gy = cellOf(g.y);
  if (g.tx === null || (Math.abs(g.x - (g.tx + 0.5)) < 0.05 && Math.abs(g.y - (g.ty + 0.5)) < 0.05) || !isFloor(s, g.tx, g.ty)) {
    g.x = gx + 0.5; g.y = gy + 0.5;
    let target = null, td = RULES.ghostLook;
    for (const p of s.players) {
      const d = Math.abs(p.x - g.x) + Math.abs(p.y - g.y);
      if (d < td && p.safe <= 0) { td = d; target = p; }
    }
    const opts = DIRS.filter(([dx, dy]) => isFloor(s, gx + dx, gy + dy));
    let dir;
    if (target && nextRandom(s) < 0.8) {
      dir = opts.sort((a, b) => (Math.abs(gx + a[0] + 0.5 - target.x) + Math.abs(gy + a[1] + 0.5 - target.y)) - (Math.abs(gx + b[0] + 0.5 - target.x) + Math.abs(gy + b[1] + 0.5 - target.y)))[0];
    } else {
      // もどらない ように
      const fwd = opts.filter(([dx, dy]) => !(g.px === gx + dx && g.py === gy + dy));
      const list = fwd.length ? fwd : opts;
      dir = list[Math.floor(nextRandom(s) * list.length)];
    }
    g.px = gx; g.py = gy;
    if (!dir) { g.tx = gx; g.ty = gy; return; }
    g.tx = gx + dir[0]; g.ty = gy + dir[1];
  }
  const dx = g.tx + 0.5 - g.x, dy = g.ty + 0.5 - g.y;
  const d = Math.hypot(dx, dy);
  const st = Math.min(d, RULES.ghostSpeed * dt);
  if (d > 0) { g.x += (dx / d) * st; g.y += (dy / d) * st; }
}

function scatter(s, p, n, ev) {
  // おとした どんぐりは まわりの ゆかに ちらばる
  const near = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = cellOf(p.x) + dx, y = cellOf(p.y) + dy;
    if ((dx || dy) && isFloor(s, x, y) && !s.items.some((it) => it.x === x && it.y === y)) near.push([x, y]);
  }
  const k = Math.min(n, p.score, near.length);
  for (let i = 0; i < k; i++) {
    const [x, y] = pick(s, near);
    s.items.push({ x, y, kind: 'acorn', dropped: true });
    ev.push({ type: 'drop', x, y, fromX: p.x, fromY: p.y });
  }
  p.score -= k;
  p.lost += k;
}

export function step(s, inputs) {
  const ev = [];
  if (s.phase === 'finished') return ev;
  const dt = STEP;
  s.t += dt;
  s.phaseT -= dt;
  if (s.phase === 'ready') {
    if (s.phaseT <= 0) { s.phase = 'play'; s.phaseT = RULES.playTime; ev.push({ type: 'go' }); }
    return ev;
  }
  if (s.phase === 'show') {
    if (s.phaseT <= 0) { s.phase = 'finished'; s.winner = ranking(s)[0]; ev.push({ type: 'finished', winner: s.winner }); }
    return ev;
  }
  // かべの うごき: でた しゅんかんに 上に いた 子を おしだす
  for (const m of s.movers) {
    const up = moverPhase(s, m) < 0.5;
    if (up && !m.up) {
      ev.push({ type: 'rise', x: m.x, y: m.y });
      s.players.forEach((p, slot) => { if (p.jump === null && pushOut(s, p)) ev.push({ type: 'pushed', slot }); });
      // かべに のった どんぐりは となりへ
      for (const it of s.items) if (it.x === m.x && it.y === m.y) { const f = DIRS.map(([dx, dy]) => [m.x + dx, m.y + dy]).find(([x, y]) => isFloor(s, x, y)); if (f) [it.x, it.y] = f; }
    }
    if (!up && m.up) ev.push({ type: 'sink', x: m.x, y: m.y });
    m.up = up;
  }
  s.players.forEach((p, slot) => {
    if (p.safe > 0) p.safe -= dt;
    if (p.jump) {
      // じゃんぷ ちゅう: かべを こえて とぶ
      p.jump.t += dt;
      const k = Math.min(1, p.jump.t / RULES.jumpTime);
      p.x = p.jump.x0 + (p.jump.x1 - p.jump.x0) * k;
      p.y = p.jump.y0 + (p.jump.y1 - p.jump.y0) * k;
      if (k >= 1) { p.jump = null; pushOut(s, p); }
      return;
    }
    if (p.stun > 0) { p.stun -= dt; return; }
    const inp = inputs[slot];
    let vx = inp?.x || 0, vy = inp?.y || 0;
    const m = Math.hypot(vx, vy);
    if (m > 1) { vx /= m; vy /= m; }
    if (m > 0.15) { p.fx = vx; p.fy = vy; }
    move(s, p, vx * RULES.speed, vy * RULES.speed, dt);
    // じゃんぷ ゆか
    const cx = cellOf(p.x), cy = cellOf(p.y);
    const pad = s.pads.find((q) => q.x === cx && q.y === cy);
    if (pad && Math.hypot(p.x - cx - 0.5, p.y - cy - 0.5) < 0.3 && isFloor(s, cx + pad.dx * 2, cy + pad.dy * 2)) {
      p.jump = { t: 0, x0: cx + 0.5, y0: cy + 0.5, x1: cx + pad.dx * 2 + 0.5, y1: cy + pad.dy * 2 + 0.5 };
      ev.push({ type: 'jump', slot, x: cx, y: cy, dx: pad.dx, dy: pad.dy });
      return;
    }
    // ひろう
    for (let i = s.items.length - 1; i >= 0; i--) {
      const it = s.items[i];
      if (Math.hypot(it.x + 0.5 - p.x, it.y + 0.5 - p.y) > 0.55) continue;
      const v = it.kind === 'chest' ? chestValue(it) : 1;
      p.score += v;
      if (it.kind === 'chest') p.chests++;
      s.items.splice(i, 1);
      ev.push({ type: 'get', slot, kind: it.kind, value: v, x: it.x, y: it.y });
    }
  });
  // おばけ
  for (const g of s.ghosts) {
    stepGhost(s, g, dt);
    s.players.forEach((p, slot) => {
      if (p.safe > 0 || p.jump || Math.hypot(p.x - g.x, p.y - g.y) > 0.6) return;
      p.stun = RULES.stun;
      p.safe = RULES.safe;
      ev.push({ type: 'ghost', slot, x: p.x, y: p.y });
      scatter(s, p, RULES.drop, ev);
    });
  }
  // どんぐりが また はえる・たからばこ
  s.regrowT += dt;
  if (s.regrowT >= RULES.regrow) {
    s.regrowT = 0;
    const free = emptyCells(s).filter(([x, y]) => s.players.every((p) => Math.abs(p.x - x - 0.5) + Math.abs(p.y - y - 0.5) > 2));
    if (free.length && s.items.filter((it) => it.kind === 'acorn').length < RULES.acorns) { const [x, y] = pick(s, free); s.items.push({ x, y, kind: 'acorn' }); ev.push({ type: 'grow', x, y }); }
  }
  if (s.items.filter((it) => it.kind === 'chest').length < RULES.chests) {
    s.chestT -= dt;
    if (s.chestT <= 0) { s.chestT = RULES.chestRegrow; spawnChest(s); ev.push({ type: 'chest' }); }
  }
  // さいごの 大きな たからばこ
  if (!s.bigDone && s.phaseT <= RULES.bigAt) {
    s.bigDone = true;
    const it = spawnChest(s, true);
    if (it) ev.push({ type: 'big', x: it.x, y: it.y });
  }
  if (s.phaseT <= 0) {
    s.phase = 'show';
    s.phaseT = RULES.showTime;
    ev.push({ type: 'show' });
  }
  return ev;
}

// 順位: どんぐり → たからばこ → 席
export function ranking(s) {
  return s.players.map((_, i) => i).sort((a, b) => s.players[b].score - s.players[a].score || s.players[b].chests - s.players[a].chests || a - b);
}

// ます (x, y) から となりへ いける ところ(じゃんぷ ゆかも)。CPU の 道さがし用
// じゃんぷ ゆかに のると かならず とぶので、ゆかの ますからは とんだ さきにしか いけない
export function neighbors(s, x, y) {
  const pad = s.pads.find((q) => q.x === x && q.y === y);
  if (pad && isFloor(s, x + pad.dx * 2, y + pad.dy * 2)) return [[x + pad.dx * 2, y + pad.dy * 2, 1.2]];
  const out = [];
  for (const [dx, dy] of DIRS) if (isFloor(s, x + dx, y + dy)) out.push([x + dx, y + dy, 1]);
  return out;
}
