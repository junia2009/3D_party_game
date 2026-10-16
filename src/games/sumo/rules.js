// 切り株ずもう のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 湖にうかぶ 大きな切り株の上で、5人が おしあう。落ちたら脱落。最後まで残った子の勝ち。
// - 動く: 行き先を指す(どこでもスティック)。
// - ぶっとばしタックル: ためて(hold)はなすと、向いているほうへ とっしん。ためるほど強い。
//   とっしんのあとは すきだらけ(少しのあいだ 軽くなって、おされやすい)。ためているあいだは ゆっくりしか動けない。
// - ちぢむ土俵: しばらくすると、切り株のふちが けずれて だんだん小さくなる。
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
  rMin: 2.0, // さいごの半径
  shrinkAt: 10, // ちぢみはじめる(はじまってから)
  shrinkTime: 35, // r0 → rMin にかける時間
  edge: 0.1, // 中心がふちから これだけ出たら落ちる
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

export function startPos(slot, n) {
  const a = -Math.PI / 2 + (slot / n) * Math.PI * 2;
  return { x: Math.cos(a) * 2.6, z: Math.sin(a) * 2.6 + 0.0001 };
}

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:sumo`),
    phase: 'ready', // ready → play → finished
    radius: RULES.r0,
    shrinking: false,
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
  return s;
}

export const playTime = (s) => Math.max(0, s.t - RULES.readyTime);
export const timeLeft = (s) => Math.max(0, RULES.timeLimit - playTime(s));
export const radiusAt = (tPlay) => {
  const k = Math.min(1, Math.max(0, (tPlay - RULES.shrinkAt) / RULES.shrinkTime));
  return RULES.r0 + (RULES.rMin - RULES.r0) * k;
};
export const bodyR = (r) => (r.power > 0 ? RULES.powerR : RULES.bodyR);
const mass = (r) => (r.power > 0 ? RULES.powerMass : 1) * (r.dash > 0 ? 2 : 1) * (r.recover > 0 ? 0.7 : 1);
export const onMoss = (s, x, z) => MOSS.some((m) => Math.hypot(m.x, m.z) + RULES.mossR * 0.3 < s.radius && Math.hypot(x - m.x, z - m.z) < RULES.mossR);
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

  // ── 土俵がちぢむ ──
  if (play) {
    s.radius = radiusAt(tp);
    if (!s.shrinking && tp >= RULES.shrinkAt) {
      s.shrinking = true;
      ev.push({ type: 'shrink' });
    }
  }

  // ── どんぐりパワー ──
  if (play) {
    s.nextItem -= dt;
    if (s.nextItem <= 0) {
      s.nextItem = randRange(s, RULES.itemEvery[0], RULES.itemEvery[1]);
      if (!s.items.length) {
        const a = nextRandom(s) * Math.PI * 2, d = Math.sqrt(nextRandom(s)) * Math.max(0.5, s.radius - 1.0);
        const it = { id: s.nextId++, x: Math.cos(a) * d, z: Math.sin(a) * d, life: RULES.itemLife };
        s.items.push(it);
        ev.push({ type: 'item', ...it });
      }
    }
    for (const it of s.items) {
      it.life -= dt;
      if (it.life <= 0 || Math.hypot(it.x, it.z) > s.radius - 0.2) { it.life = 0; ev.push({ type: 'itemGone', id: it.id }); }
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
      if (Math.hypot(r.x, r.z) <= s.radius + RULES.edge) return;
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
