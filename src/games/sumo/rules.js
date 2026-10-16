// 切り株ずもう のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 湖にうかぶ 大きな切り株の上で、5人が おしあう。落ちたら脱落。最後まで残った子の勝ち。
// - 動く: 行き先を指す(どこでもスティック)。
// - ぶっとばしタックル: ためて(hold)はなすと、向いているほうへ とっしん。ためるほど強い。
//   とっしんのあとは すきだらけ(少しのあいだ 軽くなって、おされやすい)。ためているあいだは ゆっくりしか動けない。
// - くずれる土俵: しばらくすると、切り株が 外がわから かけらごとに くずれて 湖へ落ちる。
//   くずれる前の かけらは ぐらぐら ひびが入る。上に のっていた子は いっしょに落ちる。まん中は くずれない。
// - どんぐりパワー: ときどき金どんぐりが出る。とると しばらく体が大きく重くなる。
// - すべる場所: こけの ところは つるっとすべって 止まれない。
//
// inputs[slot]: { x, z(行き先。null なら止まる), hold(ためボタンを おしているか) } か null。
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, randRange, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;
export const TIMES_OF_DAY = ['morning', 'day', 'evening'];

export const RULES = {
  readyTime: 3,
  timeLimit: 70, // これをこえたら、まん中に近い順
  r0: 5.0, // はじめの土俵の半径
  core: 2.0, // まん中の、くずれない ところの半径
  crumbleAt: 10, // くずれはじめる(はじまってから)
  crumbleEvery: 1.1, // かけらが ひとつずつ くずれる間隔
  crumbleWarn: 1.4, // くずれる前に、ぐらぐら ひびが入っている時間
  edge: 0.1, // 中心が 足場から これだけ出たら落ちる
  maxSpeed: 3.0,
  accel: 13,
  drag: 2.4, // 止まろうとするときの減り(ふつうの地面)
  bodyR: 0.45,
  // タックル
  chargeMin: 0.12, // これより短いと、とっしんしない
  chargeMax: 0.8, // ここで いっぱい
  chargeSpeed: 0.35, // ためているあいだの速さ(maxSpeed にかける)
  dashMin: 4.5,
  dashMax: 8.5,
  dashTime: 0.3,
  recover: 0.55, // とっしんのあと すきだらけ
  // ぶつかる
  bounce: 0.85, // はねかえり(1 より小さいと、ふつうに ぶつかっても あまり とばない)
  knock: 3.2, // とっしんで当てたときの 追加の ふっとび(いちばん強いとき m/秒)
  stunAt: 4.5, // これより強く当てられると、少し ふらふら
  stun: 0.45,
  // どんぐりパワー
  itemEvery: [8, 11],
  itemFirst: 7,
  itemLife: 8,
  pickR: 0.6,
  powerTime: 6,
  powerR: 0.62,
  powerMass: 1.9,
  // こけ
  mossR: 0.95,
  mossAccel: 2.2,
  mossDrag: 0.25,
};

// こけの場所(切り株の上の決まったところ。土俵がちぢむと、外のこけは なくなる)
export const MOSS = [
  { x: 2.4, z: -1.4 }, { x: -2.0, z: 2.2 }, { x: -2.8, z: -1.9 }, { x: 0.8, z: 3.2 },
];

// くずれる 足場: 外から 3 本の輪。それぞれ 扇形の かけらに わかれている
export const BANDS = [
  { outer: 5.0, inner: 4.0, n: 12 },
  { outer: 4.0, inner: 3.0, n: 10 },
  { outer: 3.0, inner: 2.0, n: 8 },
];

export function startPos(slot, n) {
  const a = -Math.PI / 2 + (slot / n) * Math.PI * 2;
  return { x: Math.cos(a) * 2.6, z: Math.sin(a) * 2.6 + 0.0001 };
}

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:sumo`),
    phase: 'ready', // ready → play → finished
    radius: RULES.r0, // いちばん外の、まだ のこっている かけらの ふち
    shrinking: false,
    pieces: [], // { id, band, k, a0, a1, outer, inner, state: 0 のこっている / 1 ぐらぐら / 2 くずれた, t }
    nextCrumble: RULES.crumbleAt,
    winner: null,
    out: [], // 落ちた順
    items: [], // { id, x, z, life }
    nextItem: RULES.itemFirst,
    nextId: 1,
    runners: players.map((_, slot) => {
      const p = startPos(slot, players.length);
      const face = Math.atan2(-p.x, -p.z); // まん中を向く
      return {
        x: p.x, z: p.z, vx: 0, vz: 0, face, alive: true,
        charge: 0, holding: false, dash: 0, recover: 0, stun: 0, power: 0,
        lastHit: null, lastHitT: -9, falls: 0, pushes: 0, dashes: 0, powers: 0,
      };
    }),
  };
  s.timeOfDay = TIMES_OF_DAY[Math.floor(nextRandom(s) * TIMES_OF_DAY.length)];
  // かけら: 輪ごとに 切れめの位置を少しずらす。くずれる順は くじ(外の輪から)
  s.bandOff = BANDS.map(() => nextRandom(s) * Math.PI * 2);
  s.order = [];
  BANDS.forEach((b, bi) => {
    const ids = [];
    for (let k = 0; k < b.n; k++) {
      const w = (Math.PI * 2) / b.n;
      const a0 = s.bandOff[bi] + k * w;
      ids.push(s.pieces.length);
      s.pieces.push({ id: s.pieces.length, band: bi, k, a0, a1: a0 + w, outer: b.outer, inner: b.inner, state: 0, t: 0 });
    }
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(nextRandom(s) * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    s.order.push(...ids);
  });
  return s;
}

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
// (x, z) に 足場があるか
export function solidAt(s, x, z) {
  const d = Math.hypot(x, z);
  if (d > RULES.r0) return false;
  if (d <= RULES.core) return true;
  return pieceAt(s, x, z).state !== 2;
}
// (x, z) が ぐらぐらの かけらの上か
export const shakyAt = (s, x, z) => pieceAt(s, x, z)?.state === 1;

export const playTime = (s) => Math.max(0, s.t - RULES.readyTime);
export const timeLeft = (s) => Math.max(0, RULES.timeLimit - playTime(s));
export const bodyR = (r) => (r.power > 0 ? RULES.powerR : RULES.bodyR);
const mass = (r) => (r.power > 0 ? RULES.powerMass : 1) * (r.dash > 0 ? 2 : 1) * (r.recover > 0 ? 0.7 : 1);
export const mossAlive = (s, m) => solidAt(s, m.x, m.z);
export const onMoss = (s, x, z) => MOSS.some((m) => Math.hypot(x - m.x, z - m.z) < RULES.mossR && mossAlive(s, m) && solidAt(s, x, z));
export const aliveSlots = (s) => s.runners.map((r, i) => (r.alive ? i : -1)).filter((i) => i >= 0);

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
  const tp = playTime(s);

  // ── 土俵が 外から くずれる ──
  if (play) {
    if (tp >= s.nextCrumble && s.order.length) {
      s.nextCrumble += RULES.crumbleEvery;
      const p = s.pieces[s.order.shift()];
      p.state = 1;
      p.t = RULES.crumbleWarn;
      if (!s.shrinking) { s.shrinking = true; ev.push({ type: 'shrink' }); }
      ev.push({ type: 'crack', id: p.id });
    }
    for (const p of s.pieces) {
      if (p.state !== 1) continue;
      p.t -= dt;
      if (p.t <= 0) { p.state = 2; ev.push({ type: 'crumble', id: p.id }); }
    }
    // いちばん外の、まだ のこっている かけらの ふち
    s.radius = RULES.core;
    for (const p of s.pieces) if (p.state !== 2) s.radius = Math.max(s.radius, p.outer);
  }

  // ── どんぐりパワー ──
  if (play) {
    s.nextItem -= dt;
    if (s.nextItem <= 0) {
      s.nextItem = randRange(s, RULES.itemEvery[0], RULES.itemEvery[1]);
      if (!s.items.length) {
        // ぐらぐら・くずれた ところには 出さない
        let x = 0, z = 0;
        for (let k = 0; k < 8; k++) {
          const a = nextRandom(s) * Math.PI * 2, d = Math.sqrt(nextRandom(s)) * Math.max(0.5, s.radius - 0.8);
          x = Math.cos(a) * d; z = Math.sin(a) * d;
          if (solidAt(s, x, z) && !shakyAt(s, x, z)) break;
        }
        const it = { id: s.nextId++, x, z, life: RULES.itemLife };
        s.items.push(it);
        ev.push({ type: 'item', ...it });
      }
    }
    for (const it of s.items) {
      it.life -= dt;
      if (it.life <= 0 || !solidAt(s, it.x, it.z)) { it.life = 0; ev.push({ type: 'itemGone', id: it.id }); }
    }
    s.items = s.items.filter((it) => it.life > 0);
  }

  // ── 動く ──
  s.runners.forEach((r, slot) => {
    if (!r.alive) return;
    const inp = play ? inputs[slot] : null;
    r.dash = Math.max(0, r.dash - dt);
    r.recover = Math.max(0, r.recover - dt);
    r.stun = Math.max(0, r.stun - dt);
    if (r.power > 0) {
      r.power = Math.max(0, r.power - dt);
      if (r.power === 0) ev.push({ type: 'powerEnd', slot });
    }
    const can = play && r.dash <= 0 && r.stun <= 0;
    // ためる / はなして とっしん
    const hold = can && !!inp?.hold;
    if (hold) {
      r.charge = Math.min(RULES.chargeMax, r.charge + dt);
      if (!r.holding) ev.push({ type: 'charge', slot });
    } else if (r.holding && r.charge > 0) {
      if (can && r.charge >= RULES.chargeMin) {
        const k = Math.min(1, (r.charge - RULES.chargeMin) / (RULES.chargeMax - RULES.chargeMin));
        const sp = (RULES.dashMin + (RULES.dashMax - RULES.dashMin) * k) * (r.power > 0 ? 1.15 : 1);
        r.vx = Math.sin(r.face) * sp;
        r.vz = Math.cos(r.face) * sp;
        r.dash = RULES.dashTime;
        r.recover = RULES.dashTime + RULES.recover;
        r.dashes++;
        ev.push({ type: 'dash', slot, power: k });
      }
      r.charge = 0;
    }
    if (!hold) r.charge = 0;
    r.holding = hold;
    // 行きたい速さ
    let wx = 0, wz = 0;
    if (can && inp && inp.x !== undefined && inp.x !== null) {
      const dx = inp.x - r.x, dz = inp.z - r.z, d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const sp = RULES.maxSpeed * Math.min(1, d / 0.5) * (hold ? RULES.chargeSpeed : 1) * (r.recover > 0 ? 0.5 : 1);
        wx = (dx / d) * sp;
        wz = (dz / d) * sp;
        // 向き: ためているあいだも、行き先のほうを向く(とっしんする向きを決められる)
        r.face = Math.atan2(dx, dz);
      }
    }
    if (r.dash <= 0) {
      const moss = onMoss(s, r.x, r.z);
      const accel = moss ? RULES.mossAccel : RULES.accel;
      const want = Math.hypot(wx, wz) > 0.01;
      // ほしい速さへ近づける。止まるときは drag で へる(こけは ほとんど へらない)
      const ax = wx - r.vx, az = wz - r.vz, am = Math.hypot(ax, az);
      const lim = (want ? accel : accel * 0.5 + (moss ? RULES.mossDrag : RULES.drag)) * dt;
      const k = am > lim ? lim / am : 1;
      r.vx += ax * k;
      r.vz += az * k;
    }
    r.x += r.vx * dt;
    r.z += r.vz * dt;
    // 金どんぐり
    if (play) {
      for (const it of s.items) {
        if (Math.hypot(it.x - r.x, it.z - r.z) > RULES.pickR + bodyR(r) * 0.5) continue;
        it.life = 0;
        r.power = RULES.powerTime;
        r.powers++;
        ev.push({ type: 'power', slot, id: it.id });
      }
      s.items = s.items.filter((it) => it.life > 0);
    }
  });

  // ── ぶつかる ──
  const R = s.runners;
  for (let i = 0; i < R.length; i++) {
    for (let j = i + 1; j < R.length; j++) {
      const a = R[i], b = R[j];
      if (!a.alive || !b.alive) continue;
      let dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      const minD = bodyR(a) + bodyR(b);
      if (d >= minD) continue;
      if (d < 1e-6) { dx = 1; dz = 0; d = 1e-6; }
      const nx = dx / d, nz = dz / d;
      const ma = mass(a), mb = mass(b);
      // 重なりを とく(重いほうは あまり動かない)
      const over = minD - d;
      a.x -= nx * over * (mb / (ma + mb)); a.z -= nz * over * (mb / (ma + mb));
      b.x += nx * over * (ma / (ma + mb)); b.z += nz * over * (ma / (ma + mb));
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz; // 近づく速さ
      if (rel <= 0) continue;
      const imp = (RULES.bounce * rel) / (1 / ma + 1 / mb);
      a.vx -= (imp / ma) * nx; a.vz -= (imp / ma) * nz;
      b.vx += (imp / mb) * nx; b.vz += (imp / mb) * nz;
      // とっしんで当てたら、当てられたほうは もっと とぶ
      const byA = a.dash > 0 && !(b.dash > 0 && b.dash > a.dash);
      const byB = b.dash > 0 && !byA;
      const kick = RULES.knock * Math.min(1, rel / RULES.dashMax);
      if (byA) { b.vx += (nx * kick) / mb; b.vz += (nz * kick) / mb; a.dash = 0; }
      if (byB) { a.vx -= (nx * kick) / ma; a.vz -= (nz * kick) / ma; b.dash = 0; }
      if (rel > RULES.stunAt) {
        if (!byA) a.stun = Math.max(a.stun, RULES.stun);
        if (!byB) b.stun = Math.max(b.stun, RULES.stun);
      }
      // だれに おされたか(落ちたときに「○○が おとした」)
      a.lastHit = j; a.lastHitT = s.t;
      b.lastHit = i; b.lastHitT = s.t;
      if (play && rel > 1) ev.push({ type: 'bump', a: i, b: j, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, force: rel, by: byA ? i : byB ? j : null });
    }
  }

  // ── 落ちる ──
  if (play) {
    const fell = [];
    s.runners.forEach((r, slot) => {
      if (!r.alive) return;
      // 中心の すこし内がわ(edge)に 足場があれば だいじょうぶ
      const d = Math.hypot(r.x, r.z) || 1;
      const k = Math.max(0, d - RULES.edge) / d;
      if (solidAt(s, r.x * k, r.z * k)) return;
      r.alive = false;
      const by = r.lastHit !== null && s.t - r.lastHitT < 2 ? r.lastHit : null;
      if (by !== null) s.runners[by].pushes++;
      fell.push(slot);
      ev.push({ type: 'fall', slot, x: r.x, z: r.z, vx: r.vx, vz: r.vz, by });
    });
    // 同時に落ちたら、外へ速く とんでいたほうが先(下の順位)
    fell.sort((p, q) => {
      const P = s.runners[p], Q = s.runners[q];
      const op = (P.vx * P.x + P.vz * P.z) / Math.hypot(P.x, P.z), oq = (Q.vx * Q.x + Q.vz * Q.z) / Math.hypot(Q.x, Q.z);
      return oq - op || q - p;
    });
    s.out.push(...fell);
    const alive = aliveSlots(s);
    if (alive.length <= 1 || timeLeft(s) <= 0) {
      s.phase = 'finished';
      // 全員いっしょに落ちたら、さいごに落ちた組の いちばん上の子
      s.winner = ranking(s)[0];
      ev.push({ type: 'finished', winner: s.winner, timeUp: alive.length > 1 });
    }
  }
  return ev;
}

// 順位: のこっている子(まん中に近い順)、そのあとは 落ちたのが おそい順
export function ranking(s) {
  const alive = aliveSlots(s).sort((a, b) => Math.hypot(s.runners[a].x, s.runners[a].z) - Math.hypot(s.runners[b].x, s.runners[b].z) || a - b);
  return [...alive, ...[...s.out].reverse()];
}
