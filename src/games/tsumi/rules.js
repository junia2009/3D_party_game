// どんぐりつみ のルール。THREE にも DOM にも触らない(あとでサーバーでも同じものを回す)。
//
// 森の大きな切り株の上に、みんなでひとつの山を積む。順番に、上で左右にゆれている「森のもの」をタップで落とす。
// 山をくずした子(または山に乗せそこねた子)は脱落。山は切り株からやりなおし。最後まで残った子の勝ち。
//
// 山は横から見た1列の積み重ねで考える(x = 左右の位置、m)。積んだものはそれぞれ
//   w: はば / h: 高さ / grip: 上の面の乗せやすさ(1 = 平ら。どんぐりのように丸いと小さい)
// を持つ。どの段でも「その上にあるもの全部の重心」が、その段の上の面(x ± w/2 × grip)からはみ出したら、くずれる。
// 山が高くなるほど、投げた回数が多いほど、ゆれは速く大きくなる(いつかはだれかがくずす)。
//
// state を書きかえるのは step() だけ。乱数は state.rng だけ。

import { nextRandom, randRange, seedFrom } from '../../rng.js';

export const STEP = 1 / 60;
export const TIMES_OF_DAY = ['morning', 'day', 'evening'];
export const RULES = {
  readyTime: 3,
  enterTime: 0.7, // 次のものがゆれはじめるまで
  aimLimit: 7, // これだけ待っても落とさなければ、ひとりでに落ちる
  fallTime: 0.55,
  settleTime: 0.8, // 乗ってから、次の番まで
  collapseTime: 2.6, // くずれてから、次の番まで
  base: { w: 2.6, grip: 1 }, // 切り株の上
  forgive: 0.03, // 見た目より少しだけ甘く(ぎりぎりで落ちると、ずるく感じる)
  swingA: [0.9, 0.035, 1.45], // ゆれのはば: はじめ・1段ごとに足す・いちばん大きく
  swingW: [1.7, 0.08, 0.05, 4.2], // ゆれの速さ(角速度): はじめ・1段ごと・1回投げるごと・いちばん速く
  dropMax: 160, // 投げた回数の上限(ここまで来たら、残っている子でおしまい)
};

// 積むもの。weight はくじで出る重み
export const KINDS = {
  acorn: { name: 'どんぐり', w: 0.5, h: 0.55, grip: 0.88, weight: 26 },
  walnut: { name: 'クルミ', w: 0.56, h: 0.5, grip: 0.92, weight: 14 },
  pinecone: { name: 'まつぼっくり', w: 0.56, h: 0.72, grip: 0.82, weight: 14 },
  mushroom: { name: 'キノコ', w: 0.92, h: 0.5, grip: 1.0, weight: 16 },
  leaf: { name: '葉っぱ', w: 1.15, h: 0.12, grip: 1.0, weight: 16 },
  twig: { name: '小枝', w: 1.4, h: 0.16, grip: 1.0, weight: 14 },
};

function pickKind(s) {
  const list = Object.entries(KINDS);
  let r = nextRandom(s) * list.reduce((a, [, k]) => a + k.weight, 0);
  for (const [key, k] of list) if ((r -= k.weight) < 0) return key;
  return list[0][0];
}

export function createGame(players, seed) {
  const s = {
    t: 0,
    rng: seedFrom(`${seed}:tsumi`),
    phase: 'ready', // ready → play → finished
    winner: null,
    order: players.map((_, i) => i),
    alive: players.map(() => true),
    out: [], // 脱落した順
    turn: 0, // order の何番目の番か
    cur: null,
    stage: 'enter', // enter → aim → fall → land | collapse | miss → (次の番)
    stageT: 0,
    piece: null, // いまゆれているもの { kind, x }
    next: null, // その次に来るもの
    swing: { phase: 0, A: 1, w: 1.7 },
    stack: [], // { kind, x, y, w, h, grip }
    drops: 0,
    fallen: null, // くずれたとき、落ちたものの番号(何段めから上)
    runners: players.map(() => ({ placed: 0, best: 0, outAt: null })),
  };
  s.timeOfDay = TIMES_OF_DAY[Math.floor(nextRandom(s) * TIMES_OF_DAY.length)];
  // 番の順はくじ
  for (let i = s.order.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(s) * (i + 1));
    [s.order[i], s.order[j]] = [s.order[j], s.order[i]];
  }
  s.next = pickKind(s);
  return s;
}

// 山のてっぺんの高さ(切り株の上を 0 とする)
export function stackTop(s) {
  const top = s.stack[s.stack.length - 1];
  return top ? top.y + top.h : 0;
}

// いまゆれているものの x(時刻 t のとき)。スタートの位相と、ゆれの速さで決まる
export function swingX(s, t = s.stageT) {
  return s.swing.A * Math.sin(s.swing.phase + s.swing.w * t);
}

// x に置いたら、山はどうなるか。{ ok, miss, fallFrom, margin }
//   miss: 山(てっぺん)にかすりもしない / fallFrom: くずれるとき、何段めから上が落ちるか / margin: いちばんきわどい段のよゆう
export function tryPlace(stack, kind, x) {
  const k = KINDS[kind];
  const top = stack[stack.length - 1] || { x: 0, w: RULES.base.w, grip: RULES.base.grip };
  if (Math.abs(x - top.x) > top.w / 2 + k.w / 2 - 0.05) return { ok: false, miss: true, fallFrom: null, margin: -1 };
  const all = [...stack, { x, w: k.w, grip: k.grip }];
  // 下の段から順に: その上にあるもの全部の重心が、その段の上の面からはみ出していないか
  // (重さは、はば × 高さ に比例とする)
  let margin = Infinity, fallFrom = null;
  const base = { x: 0, w: RULES.base.w, grip: RULES.base.grip };
  const mass = all.map((p, i) => {
    const kk = i < stack.length ? KINDS[stack[i].kind] : k;
    return kk.w * kk.h;
  });
  for (let i = 0; i < all.length; i++) {
    // 段 i(0 は切り株)の上に乗っているのは all[i..]
    const sup = i === 0 ? base : all[i - 1];
    let m = 0, mx = 0;
    for (let j = i; j < all.length; j++) { m += mass[j]; mx += mass[j] * all[j].x; }
    const com = mx / m;
    const room = (sup.w / 2) * sup.grip + RULES.forgive - Math.abs(com - sup.x);
    if (room < margin) margin = room;
    if (room < 0 && fallFrom === null) fallFrom = i;
  }
  return { ok: fallFrom === null, miss: false, fallFrom, margin };
}

function aliveCount(s) {
  return s.alive.filter(Boolean).length;
}

function startTurn(s, ev) {
  // 次の生きている子へ
  for (let k = 0; k < s.order.length; k++) {
    const slot = s.order[s.turn % s.order.length];
    s.turn++;
    if (s.alive[slot]) { s.cur = slot; break; }
  }
  s.piece = { kind: s.next };
  s.next = pickKind(s);
  const h = s.stack.length;
  s.swing = {
    phase: randRange(s, 0, Math.PI * 2),
    A: Math.min(RULES.swingA[2], RULES.swingA[0] + RULES.swingA[1] * h),
    w: Math.min(RULES.swingW[3], RULES.swingW[0] + RULES.swingW[1] * h + RULES.swingW[2] * s.drops),
  };
  s.stage = 'enter';
  s.stageT = 0;
  ev.push({ type: 'turn', slot: s.cur, kind: s.piece.kind, next: s.next });
}

function eliminate(s, slot, ev) {
  s.alive[slot] = false;
  s.out.push(slot);
  s.runners[slot].outAt = s.t;
  ev.push({ type: 'out', slot, left: aliveCount(s) });
}

function finish(s, ev) {
  s.phase = 'finished';
  s.winner = ranking(s)[0];
  s.stage = 'done';
  ev.push({ type: 'finished', winner: s.winner });
}

// inputs[slot]: { drop: true } を、落としたいときだけ
export function step(s, inputs) {
  const ev = [];
  const dt = STEP;
  s.t += dt;
  if (s.phase === 'ready') {
    if (s.t >= RULES.readyTime) {
      s.phase = 'play';
      ev.push({ type: 'start' });
      startTurn(s, ev);
    }
    return ev;
  }
  if (s.phase !== 'play') return ev;
  s.stageT += dt;

  switch (s.stage) {
    case 'enter':
      if (s.stageT >= RULES.enterTime) { s.stage = 'aim'; s.stageT = 0; ev.push({ type: 'aim', slot: s.cur }); }
      break;
    case 'aim': {
      const want = inputs[s.cur]?.drop;
      if (want || s.stageT >= RULES.aimLimit) {
        s.piece.x = swingX(s);
        s.drops++;
        s.stage = 'fall';
        s.stageT = 0;
        ev.push({ type: 'drop', slot: s.cur, x: s.piece.x, kind: s.piece.kind, auto: !want });
      }
      break;
    }
    case 'fall':
      if (s.stageT >= RULES.fallTime) {
        const k = KINDS[s.piece.kind];
        const r = tryPlace(s.stack, s.piece.kind, s.piece.x);
        const y = stackTop(s);
        if (r.miss) {
          s.stage = 'miss';
          ev.push({ type: 'miss', slot: s.cur, x: s.piece.x });
          eliminate(s, s.cur, ev);
        } else {
          s.stack.push({ kind: s.piece.kind, x: s.piece.x, y, w: k.w, h: k.h, grip: k.grip });
          if (r.ok) {
            s.stage = 'land';
            const run = s.runners[s.cur];
            run.placed++;
            run.best = Math.max(run.best, s.stack.length);
            ev.push({ type: 'land', slot: s.cur, height: s.stack.length, margin: r.margin });
          } else {
            s.stage = 'collapse';
            s.fallen = r.fallFrom;
            ev.push({ type: 'collapse', slot: s.cur, from: r.fallFrom, height: s.stack.length });
            eliminate(s, s.cur, ev);
          }
        }
        s.stageT = 0;
      }
      break;
    case 'land':
    case 'miss':
    case 'collapse': {
      const wait = s.stage === 'land' ? RULES.settleTime : RULES.collapseTime;
      if (s.stageT >= wait) {
        if (s.stage === 'collapse') { s.stack = []; s.fallen = null; ev.push({ type: 'reset' }); }
        if (aliveCount(s) <= 1 || s.drops >= RULES.dropMax) { finish(s, ev); break; }
        startTurn(s, ev);
      }
      break;
    }
  }
  return ev;
}

// 順位: 残っている子(多く積んだ順)→ あとまで残った順
export function ranking(s) {
  const alive = s.order.filter((i) => s.alive[i]).sort((a, b) => s.runners[b].placed - s.runners[a].placed || s.order.indexOf(a) - s.order.indexOf(b));
  return [...alive, ...[...s.out].reverse()];
}
