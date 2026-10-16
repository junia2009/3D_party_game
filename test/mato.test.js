import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, RULES, STEP, VINES, aimFor, createGame, launch, fly, pass, ranking, step, targetPos, timeLeft } from '../src/games/mato/rules.js';
import { PERSONALITIES, cpuInput, createCpu } from '../src/games/mato/cpu.js';

const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
const kinds = Object.keys(PERSONALITIES);

function run(seed, { personalities = PLAYERS.map((_, i) => kinds[i % kinds.length]), onStep } = {}) {
  const s = createGame(PLAYERS, seed);
  const cpus = personalities.map((k, slot) => createCpu(k, seed, slot));
  const events = [];
  let guard = 0;
  while (s.phase !== 'finished') {
    const ev = step(s, cpus.map((c, slot) => cpuInput(c, s, slot)));
    events.push(...ev);
    onStep?.(s, ev);
    if (++guard > (RULES.readyTime + RULES.timeLimit + 5) / STEP) throw new Error('終わらない');
  }
  return { s, events };
}

// 的が勝手に出てこない、静かな試合(的は自分で置く)
function quiet(seed = 1) {
  const s = createGame(PLAYERS, seed);
  s.t = RULES.readyTime;
  s.phase = 'play';
  s.spawnAt = 1e9;
  s.windAt = 1e9;
  return s;
}
const idle = () => PLAYERS.map(() => null);
const only = (slot, input) => PLAYERS.map((_, i) => (i === slot ? input : null));
// 飛んでいるあいだ、何もしないで進める
function settle(s, sec = 3) {
  const ev = [];
  for (let i = 0; i < sec / STEP && s.phase !== 'finished'; i++) ev.push(...step(s, idle()));
  return ev;
}
function put(s, kind, x, d, y) {
  const tg = { id: s.nextId++, kind, x, d, y, born: s.t, life: 99, ph: 0 };
  s.targets.push(tg);
  return tg;
}

test('CPU どうしで回すと、時間どおりに決着する', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { s, events } = run(seed);
    assert.equal(s.phase, 'finished');
    assert.equal(ranking(s)[0], s.winner);
    assert.ok(Math.abs(s.t - (RULES.readyTime + RULES.timeLimit)) < 0.05, '45 秒で終わる');
    assert.ok(events.some((e) => e.type === 'hit'), '当たることがある');
    assert.ok(events.some((e) => e.type === 'miss'), '外れることもある');
    assert.ok(s.runners[s.winner].score >= 10, `勝った子は点を取っている(${s.runners[s.winner].score})`);
  }
});

test('同じシードなら、同じ試合になる', () => {
  const a = run(7).s, b = run(7).s;
  assert.deepEqual(a.runners.map((r) => [r.score, r.hits, r.throws]), b.runners.map((r) => [r.score, r.hits, r.throws]));
});

test('点数は、当てた的の点・ボーナス・ハチの巣の分と合う', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const sum = PLAYERS.map(() => 0);
    const { s } = run(seed, {
      onStep: (_, ev) => {
        for (const e of ev) {
          if (e.type === 'hit') sum[e.slot] += e.points + e.bonus;
          if (e.type === 'sting') sum[e.slot] = Math.max(0, sum[e.slot] - RULES.hivePenalty);
        }
      },
    });
    assert.deepEqual(s.runners.map((r) => r.score), sum);
  }
});

test('的の出かたは、みんな同じ(自分から見た位置が同じなので公平)', () => {
  // 的は state に1組だけ。だれが当てても、ほかの子の的は消えない
  const s = quiet();
  const tg = put(s, 'pad', 0, 8, 0.45);
  const aim = aimFor(targetPos(tg, s.t));
  step(s, only(0, { throw: aim }));
  const ev = settle(s);
  assert.ok(ev.some((e) => e.type === 'hit' && e.slot === 0));
  assert.ok(s.targets.includes(tg), '的は残っている(ほかの子はまだ当てられる)');
  step(s, only(3, { throw: aim }));
  assert.ok(settle(s).some((e) => e.type === 'hit' && e.slot === 3), 'ほかの子も同じ投げ方で当たる');
  // 同じ子が同じ的に2回当てても、点は1回分
  step(s, only(0, { throw: aim }));
  assert.ok(!settle(s).some((e) => e.type === 'hit' && e.slot === 0));
});

test('ねらいの計算(aimFor)どおりに投げると、止まっている的に当たる(遠くても近くても)', () => {
  for (const [x, d, y] of [[0, 6, 0.45], [-3, 10, 2.5], [4, 14, 2.8], [2, 19, 1], [-5, 20, 1]]) {
    const s = quiet();
    put(s, 'stump', x, d, y);
    step(s, only(1, { throw: aimFor({ x, d, y }) }));
    assert.ok(settle(s).some((e) => e.type === 'hit'), `(${x}, ${d}, ${y}) に当たる`);
  }
});

test('ひっぱる強さで遠くへ、向きで左右へ飛ぶ', () => {
  const land = (aim) => {
    const p = launch(aim);
    while (p.y > 0) fly(p, 0);
    return p;
  };
  assert.ok(land({ yaw: 0, power: 1 }).d > land({ yaw: 0, power: 0.3 }).d + 8);
  assert.ok(land({ yaw: 0.4, power: 0.6 }).x > 2, '+ は右');
  assert.ok(land({ yaw: -0.4, power: 0.6 }).x < -2);
  assert.ok(land({ yaw: 0, power: 0 }).d > 3, 'いちばん弱くても、池には届く');
  assert.ok(land({ yaw: 0, power: 1 }).d > 21, 'いちばん強いと、向こう岸まで届く');
});

test('風で横へ流される(遠いほど大きく)。風を入れて計算すれば当たる', () => {
  const near = pass({ yaw: 0, power: 0.2 }, 6, 1.2), far = pass({ yaw: 0, power: 0.9 }, 18, 1.2);
  assert.ok(near.x > 0.1 && far.x > near.x * 2, `流される: 近く ${near.x.toFixed(2)} / 遠く ${far.x.toFixed(2)}`);
  const s = quiet();
  s.wind = s.windTo = 1.2;
  put(s, 'stump', 0, 18, 1);
  step(s, only(0, { throw: aimFor({ x: 0, d: 18, y: 1 }, 0) }));
  assert.ok(!settle(s).some((e) => e.type === 'hit'), '風を入れないと外れる');
  step(s, only(0, { throw: aimFor({ x: 0, d: 18, y: 1 }, 1.2) }));
  assert.ok(settle(s).some((e) => e.type === 'hit'), '風を入れると当たる');
});

test('つづけて当てるとボーナス(3つめから +1、6つめから +2)。外すともどる', () => {
  const s = quiet();
  const bonus = [];
  for (let i = 0; i < 7; i++) {
    const tg = put(s, 'pad', (i % 3) - 1, 7 + i, 0.45);
    step(s, only(0, { throw: aimFor(targetPos(tg, s.t)) }));
    for (const e of settle(s, 2.5)) if (e.type === 'hit') bonus.push(e.bonus);
  }
  assert.deepEqual(bonus, [0, 0, 1, 1, 1, 2, 2]);
  assert.equal(s.runners[0].score, 7 + 7);
  // 池に落とすと、れんぞくは 0 から
  step(s, only(0, { throw: { yaw: 0, power: 0.1 } }));
  assert.ok(settle(s).some((e) => e.type === 'miss' && e.water));
  assert.equal(s.runners[0].combo, 0);
  assert.equal(s.runners[0].best, 7);
});

test('金の的は 5 点。ハチの巣に当てると 3 点へって、少しのあいだ投げられない', () => {
  const s = quiet();
  const gold = put(s, 'gold', 0, 9, 2.4);
  step(s, only(0, { throw: aimFor(targetPos(gold, s.t + 0.9)) }));
  // 金の的は動くので、当たるまで何回か投げる
  for (let k = 0; k < 8 && s.runners[0].hits === 0; k++) {
    settle(s, 1.5);
    if (s.runners[0].hits) break;
    const fl = pass(aimFor(targetPos(gold, s.t)), gold.d);
    step(s, only(0, { throw: aimFor(targetPos(gold, s.t + (fl ? fl.t : 1))) }));
  }
  settle(s, 2);
  assert.equal(s.runners[0].score, KINDS.gold.points);

  const hive = put(s, 'hive', 3, VINES[0], 2.8);
  hive.ph = Math.PI / 2; // ゆれ(sin)が 0 のところで止めて見る
  s.runners[0].combo = 4;
  step(s, only(0, { throw: aimFor(targetPos(hive, s.t + 1)) }));
  const ev = settle(s, 0.2 + 1.5);
  assert.ok(ev.some((e) => e.type === 'sting'));
  assert.equal(s.runners[0].score, KINDS.gold.points - RULES.hivePenalty);
  assert.equal(s.runners[0].combo, 0);
  // 刺されたあとは投げられない
  const before = s.runners[0].throws;
  s.runners[0].stun = RULES.stun;
  step(s, only(0, { throw: { yaw: 0, power: 0.5 } }));
  assert.equal(s.runners[0].throws, before);
  // 点は 0 より下にならない
  s.runners[0].score = 1;
  s.runners[0].stun = 0;
  s.runners[0].reload = 0;
  s.runners[0].hit.delete(hive.id);
  step(s, only(0, { throw: aimFor(targetPos(hive, s.t + 1)) }));
  settle(s, 2);
  assert.equal(s.runners[0].score, 0);
});

test('投げたあとは、少し待たないと次を投げられない。こわれた入力は無視する', () => {
  const s = quiet();
  step(s, only(0, { throw: { yaw: 0, power: 0.5 } }));
  step(s, only(0, { throw: { yaw: 0, power: 0.5 } }));
  assert.equal(s.runners[0].throws, 1);
  for (let i = 0; i < RULES.reload / STEP + 1; i++) step(s, idle());
  step(s, only(0, { throw: { yaw: NaN, power: 0.5 } }));
  step(s, only(0, { throw: { yaw: 0, power: NaN } }));
  step(s, only(0, { throw: { yaw: 1e9, power: 0.5 } }));
  assert.equal(s.runners[0].throws, 1);
  step(s, only(0, { throw: { yaw: 0, power: 0.5 } }));
  assert.equal(s.runners[0].throws, 2);
  // はじまる前・終わったあとは投げられない
  const r = createGame(PLAYERS, 1);
  step(r, only(0, { throw: { yaw: 0, power: 0.5 } }));
  assert.equal(r.runners[0].throws, 0);
});

test('風はときどき変わり、なぎのときもある', () => {
  const { events } = run(3);
  const winds = events.filter((e) => e.type === 'wind');
  assert.ok(winds.length >= 3);
  assert.ok(winds.every((e) => Math.abs(e.to) <= RULES.windMax));
  let calm = 0, strong = 0;
  for (let seed = 1; seed <= 20; seed++) for (const e of run(seed).events) if (e.type === 'wind') (e.to === 0 ? calm++ : Math.abs(e.to) > 0.8 && strong++);
  assert.ok(calm > 5 && strong > 5, `なぎ ${calm} / 強い風 ${strong}`);
});

test('的はいろいろ出る。つるされた的とハチの巣は綱の下に出る', () => {
  const seen = {};
  run(4, {
    onStep: (s) => {
      for (const tg of s.targets) {
        seen[tg.kind] = (seen[tg.kind] || 0) + 1;
        if (tg.kind === 'swing' || tg.kind === 'hive') assert.ok(VINES.includes(tg.d));
        assert.ok(Math.abs(tg.x) <= 5.5);
      }
      assert.ok(timeLeft(s) >= 0);
    },
  });
  for (const k of Object.keys(KINDS)) assert.ok(seen[k] > 0, `${k} が出る`);
});

test('同じ性格どうしなら、どの席も勝てる(かたよりすぎない)', () => {
  const wins = [0, 0, 0, 0, 0];
  const N = 150;
  for (let seed = 1; seed <= N; seed++) wins[run(seed * 7, { personalities: PLAYERS.map(() => 'normal') }).s.winner]++;
  for (const w of wins) assert.ok(w > N * 0.08 && w < N * 0.36, `席ごとの勝ち数 ${wins}`);
});

test('人くらいの反応でも、CPU と互角に戦える', () => {
  PERSONALITIES.human = { label: 'ひと', react: [0.9, 1.3], aimErr: 1.15, windSense: 0.45, lead: 0.4, greed: 1.0, think: [0.55, 0.85] };
  try {
    let rankSum = 0, wins = 0;
    const N = 150;
    for (let seed = 1; seed <= N; seed++) {
      const order = PLAYERS.map((_, i) => (i === 0 ? 'human' : kinds[(i + seed) % 3]));
      const r = ranking(run(seed, { personalities: order }).s);
      rankSum += r.indexOf(0) + 1;
      if (r[0] === 0) wins++;
    }
    assert.ok(rankSum / N <= 3.4, `人の平均順位 ${rankSum / N}`);
    assert.ok(wins / N >= 0.1, `人の勝ち ${wins}/${N}`);
  } finally {
    delete PERSONALITIES.human;
  }
});
