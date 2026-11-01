// 夕ぐれの 森の 広場の おにごっこ のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 5人のうち 1人が 鬼。鬼に タッチされたら 鬼が 交代。時間いっぱい、鬼で なかった 時間が 長い子の 勝ち。
// - 走る: スティックの 向きへ。たおすほど はやい。鬼は ほんの すこし はやい(つかまえられる ように)。
// - ダッシュ: ボタンで ひと走り(dashTime)。つかったあとは しばらく つかえない(cool)。
// - タッチ返しなし: 鬼に なった 子は、いま タッチした 子(前の 鬼)を しばらく タッチ できない。
//   鬼に なった 子は すこしの あいだ 動けない(そのあいだに みんな にげる)。
// - かくれ草むら: 草むらの 中に いるあいだは 見えにくい(画面は うすく、CPU の 鬼は 近くでないと 気づかない)。
// - どんぐりボーナス: ときどき 金の どんぐりが 落ちてくる。ひろうと 点が ふえる(鬼でも ひろえる)。
// - 木・切り株は とおれない。広場の ふちからは 出られない。
//
// 点 = 鬼で なかった 時間(秒) + ひろった どんぐりの ボーナス。
// inputs[slot]: { x, z(スティックの 向き。長さ 0〜1), dash(ボタンを おして いるか) } か null。
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;

export const RULES = {
  readyTime: 3,
  playTime: 60,
  fieldR: 9.5, // 広場の 半径
  bodyR: 0.4,
  speed: 3.3, // にげる 子の はやさ(m/秒)
  oniSpeed: 3.75, // 鬼の はやさ
  accel: 14, // はやさが そろう はやさ
  // ダッシュ
  dashTime: 0.55,
  dashBoost: 1.75, // はやさに かける
  cool: 3.2,
  // タッチ
  tagR: 0.95, // 中心どうしが これより 近いと タッチ
  freeze: 1.1, // 鬼に なった 子が 動けない 秒
  noTagBack: 3, // 前の 鬼を タッチ できない 秒
  // 金の どんぐり
  acornEvery: [5, 8], // 落ちてくる 間かく
  acornMax: 2, // 広場に 同時に ある 数
  acornLife: 12, // ひろわれないと 消える
  acornBonus: 2, // ひろうと ふえる 点(秒ぶん)
  pickR: 0.7,
  hurry: 10, // のこり この 秒で 合図
};

// 広場の もの(きまった ならび)。木・切り株は とおれない。草むらは かくれられる
export const TREES = [
  { x: -4.6, z: -3.2, r: 0.75 }, { x: 4.9, z: -2.4, r: 0.8 }, { x: -1.2, z: 5.6, r: 0.7 },
  { x: 2.6, z: 4.4, r: 0.65 }, { x: -6.3, z: 2.8, r: 0.7 }, { x: 6.4, z: 3.6, r: 0.6 }, { x: 0.8, z: -6.4, r: 0.75 },
];
export const STUMPS = [{ x: 0, z: 0, r: 1.15 }, { x: -2.8, z: -0.6, r: 0.5 }, { x: 3.1, z: 0.9, r: 0.5 }];
export const BUSHES = [
  { x: -6.2, z: -0.4, r: 1.5 }, { x: 6.6, z: 0.2, r: 1.4 }, { x: -3.4, z: -6.4, r: 1.35 },
  { x: 3.9, z: -5.8, r: 1.4 }, { x: 0.2, z: 3.3, r: 1.25 },
];
export const BLOCKS = [...TREES, ...STUMPS];

// spot: にげる 子の 立ち位置の 番号(0〜n-2。くじで きめる。場所に よって にげやすさが ちがう ので 席の じゅんに しない)
export function startPos(spot, n, isOni) {
  // 鬼は まん中の 切り株の 前、ほかの 子は まわりに
  if (isOni) return { x: 0, z: 2 };
  const a = Math.PI * 0.75 + (spot / (n - 1)) * Math.PI * 1.5;
  return { x: Math.sin(a) * 6.6, z: Math.cos(a) * 6.6 };
}

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:oni`),
    phase: 'ready', // ready → play → finished
    oni: 0,
    hurried: false,
    acorns: [], // { id, x, z, t }
    nextAcorn: 0,
    acornId: 0,
    winner: null,
    runners: [],
  };
  s.oni = Math.floor(nextRandom(s) * players.length);
  const spots = players.map((_, i) => i).filter((i) => i !== s.oni);
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(nextRandom(s) * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  s.runners = players.map((_, slot) => {
    const p = startPos(spots.indexOf(slot), players.length, slot === s.oni);
    return {
      x: p.x, z: p.z, vx: 0, vz: 0, h: Math.atan2(-p.x, -p.z),
      score: 0, bonus: 0, caught: 0, tags: 0, picks: 0,
      dash: 0, cool: 0, held: false, freeze: 0, noTag: null, noTagT: 0, hidden: false,
    };
  });
  s.nextAcorn = RULES.acornEvery[0] + nextRandom(s) * (RULES.acornEvery[1] - RULES.acornEvery[0]);
  return s;
}

export const playTime = (s) => Math.max(0, s.t - RULES.readyTime);
export const timeLeft = (s) => Math.max(0, RULES.playTime - playTime(s));
export const inBush = (x, z) => BUSHES.some((b) => (x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r);
// 点(表示用。鬼で なかった 時間 + ボーナス)
export const points = (r) => r.score + r.bonus;

// 木・切り株・ふちから おしだす
function pushOut(r) {
  for (const b of BLOCKS) {
    const dx = r.x - b.x, dz = r.z - b.z, d = Math.hypot(dx, dz), min = b.r + RULES.bodyR;
    if (d < min) {
      const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
      r.x = b.x + nx * min; r.z = b.z + nz * min;
      const vn = r.vx * nx + r.vz * nz;
      if (vn < 0) { r.vx -= vn * nx; r.vz -= vn * nz; }
    }
  }
  const d = Math.hypot(r.x, r.z), max = RULES.fieldR - RULES.bodyR;
  if (d > max) {
    const nx = r.x / d, nz = r.z / d;
    r.x = nx * max; r.z = nz * max;
    const vn = r.vx * nx + r.vz * nz;
    if (vn > 0) { r.vx -= vn * nx; r.vz -= vn * nz; }
  }
}

// どんぐりが 落ちる 場所(木・切り株・草むらの 外、だれからも すこし はなれた ところ)
function acornSpot(s) {
  for (let k = 0; k < 30; k++) {
    const a = nextRandom(s) * Math.PI * 2, rr = 1.6 + Math.sqrt(nextRandom(s)) * (RULES.fieldR - 2.6);
    const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
    if (BLOCKS.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + 0.8)) continue;
    if (inBush(x, z)) continue;
    if (s.runners.some((r) => Math.hypot(x - r.x, z - r.z) < 2.2)) continue;
    return { x, z };
  }
  return null;
}

export function step(s, inputs) {
  const ev = [];
  if (s.phase === 'finished') return ev;
  const dt = STEP;
  s.t += dt;
  if (s.phase === 'ready' && s.t >= RULES.readyTime) {
    s.phase = 'play';
    ev.push({ type: 'start', oni: s.oni });
  }
  const play = s.phase === 'play';
  const tp = playTime(s);

  // ── 走る ──
  s.runners.forEach((r, slot) => {
    const inp = play ? inputs[slot] : null;
    const oni = slot === s.oni;
    r.dash = Math.max(0, r.dash - dt);
    r.cool = Math.max(0, r.cool - dt);
    r.freeze = Math.max(0, r.freeze - dt);
    if (r.noTagT > 0) { r.noTagT = Math.max(0, r.noTagT - dt); if (r.noTagT === 0) r.noTag = null; }
    const can = play && r.freeze <= 0;
    // ダッシュ: おした 瞬間
    const press = !!inp?.dash;
    if (can && press && !r.held && r.cool <= 0 && r.dash <= 0) {
      r.dash = RULES.dashTime;
      r.cool = RULES.cool;
      ev.push({ type: 'dash', slot });
    }
    r.held = press;
    let tx = 0, tz = 0;
    if (can && inp && inp.x != null) {
      const m = Math.min(1, Math.hypot(inp.x, inp.z));
      if (m > 0.12) {
        const top = (oni ? RULES.oniSpeed : RULES.speed) * (r.dash > 0 ? RULES.dashBoost : 1) * m;
        tx = (inp.x / Math.hypot(inp.x, inp.z)) * top;
        tz = (inp.z / Math.hypot(inp.x, inp.z)) * top;
        r.h = Math.atan2(inp.x, inp.z);
      }
    }
    const k = Math.min(1, RULES.accel * dt);
    r.vx += (tx - r.vx) * k;
    r.vz += (tz - r.vz) * k;
    r.x += r.vx * dt;
    r.z += r.vz * dt;
    pushOut(r);
    // かくれ草むら
    const hid = inBush(r.x, r.z);
    if (hid !== r.hidden) { r.hidden = hid; if (play) ev.push({ type: hid ? 'hide' : 'unhide', slot }); }
  });

  // ── ぶつかる(にげる 子どうしは かるく おしあう) ──
  const R = s.runners;
  for (let i = 0; i < R.length; i++) {
    for (let j = i + 1; j < R.length; j++) {
      if (i === s.oni || j === s.oni) continue;
      const a = R[i], b = R[j];
      let dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      const min = RULES.bodyR * 2;
      if (d >= min) continue;
      if (d < 1e-6) { dx = 1; dz = 0; d = 1e-6; }
      const o = (min - d) / 2;
      a.x -= (dx / d) * o; a.z -= (dz / d) * o;
      b.x += (dx / d) * o; b.z += (dz / d) * o;
    }
  }

  if (play) {
    // ── 点: 鬼で ない 子は 時間が たまる ──
    R.forEach((r, slot) => { if (slot !== s.oni) r.score += dt; });

    // ── タッチ ──
    const o = R[s.oni];
    if (o.freeze <= 0) {
      let best = -1, bd = Infinity;
      R.forEach((r, slot) => {
        if (slot === s.oni || slot === o.noTag) return;
        const d = Math.hypot(r.x - o.x, r.z - o.z);
        if (d < RULES.tagR && d < bd) { bd = d; best = slot; }
      });
      if (best >= 0) {
        const from = s.oni, r = R[best];
        o.tags++;
        r.caught++;
        r.freeze = RULES.freeze;
        r.dash = 0;
        r.noTag = from;
        r.noTagT = RULES.noTagBack;
        o.noTag = null;
        o.noTagT = 0;
        // 前の 鬼は すこし はじかれる(すぐ 横に いない ように)
        const dx = o.x - r.x, dz = o.z - r.z, d = Math.hypot(dx, dz) || 1;
        o.vx += (dx / d) * 2.5; o.vz += (dz / d) * 2.5;
        s.oni = best;
        ev.push({ type: 'tag', from, to: best, x: (o.x + r.x) / 2, z: (o.z + r.z) / 2 });
      }
    }

    // ── 金の どんぐり ──
    s.acorns = s.acorns.filter((a) => {
      if (s.t - a.t < RULES.acornLife) return true;
      ev.push({ type: 'acornGone', id: a.id });
      return false;
    });
    if (tp >= s.nextAcorn && tp < RULES.playTime - 3) {
      s.nextAcorn = tp + RULES.acornEvery[0] + nextRandom(s) * (RULES.acornEvery[1] - RULES.acornEvery[0]);
      const p = s.acorns.length < RULES.acornMax ? acornSpot(s) : null;
      if (p) {
        const a = { id: ++s.acornId, x: p.x, z: p.z, t: s.t };
        s.acorns.push(a);
        ev.push({ type: 'acorn', id: a.id, x: a.x, z: a.z });
      }
    }
    for (const a of [...s.acorns]) {
      let who = -1, bd = RULES.pickR;
      R.forEach((r, slot) => {
        const d = Math.hypot(r.x - a.x, r.z - a.z);
        if (d < bd) { bd = d; who = slot; }
      });
      if (who >= 0) {
        R[who].bonus += RULES.acornBonus;
        R[who].picks++;
        s.acorns.splice(s.acorns.indexOf(a), 1);
        ev.push({ type: 'pick', id: a.id, slot: who, x: a.x, z: a.z });
      }
    }

    if (!s.hurried && timeLeft(s) <= RULES.hurry) { s.hurried = true; ev.push({ type: 'hurry' }); }
    if (timeLeft(s) <= 0) {
      s.phase = 'finished';
      s.winner = ranking(s)[0];
      ev.push({ type: 'finished', winner: s.winner, oni: s.oni });
    }
  }
  return ev;
}

// 順位: 点が 多い順(同じなら つかまった 回数が 少ない順、さいごは 席)
export function ranking(s) {
  return s.runners.map((_, i) => i).sort((a, b) => {
    const A = s.runners[a], B = s.runners[b];
    return points(B) - points(A) || A.caught - B.caught || a - b;
  });
}
