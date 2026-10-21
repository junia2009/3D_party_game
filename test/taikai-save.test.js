import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createTournament } from '../src/board/rules.js';
import { cpuAct, createCpu } from '../src/board/cpu.js';
import { clearTaikai, loadTaikai, saveTaikai } from '../src/board/save.js';

// localStorage の かわり
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const PLAYERS = ['ponta', 'mimi', 'gonzo', 'penne', 'konko'].map((c, i) => ({ character: c, cpu: i ? 'normal' : 'normal', name: c }));

// 競技の 結果は 決まった 順位で(画面なしで 進める)
function stepOnce(s, cpus) {
  const pend = s.pending;
  let a;
  if (pend.type === 'minigame') a = { type: 'minigameResult', ranking: [0, 1, 2, 3, 4] };
  else if (pend.type === 'duelGame') a = { type: 'duelResult', winner: pend.a };
  else a = cpuAct(cpus[pend.slot], s, pend.slot);
  return act(s, a);
}

test('大会の とちゅうを 保存して 読みこむと、そのまま つづけた ときと 同じ 結果に なる', () => {
  const seed = 42;
  const make = () => ({ s: createTournament(PLAYERS, seed, { turns: 10 }), cpus: PLAYERS.map((p, i) => createCpu(p.cpu, seed, i)) });
  const a = make();
  let n = 0;
  while (a.s.turn < 5 && a.s.phase !== 'finished') { stepOnce(a.s, a.cpus); assert.ok(++n < 20000); }
  assert.notEqual(a.s.phase, 'finished');
  // ここで 保存して、べつの ところで 読みこむ
  const storage = mem();
  saveTaikai({ picked: 'ponta', seed, players: PLAYERS, s: a.s, cpus: a.cpus }, storage);
  const d = loadTaikai(storage);
  assert.ok(d && d.s.turn === a.s.turn && d.picked === 'ponta');
  const b = { s: d.s, cpus: PLAYERS.map((p, i) => Object.assign(createCpu(p.cpu, seed, i), d.cpus[i])) };
  let guard = 0;
  while (a.s.phase !== 'finished') { stepOnce(a.s, a.cpus); if (b.s.phase !== 'finished') stepOnce(b.s, b.cpus); assert.ok(++guard < 20000); }
  assert.equal(b.s.phase, 'finished');
  assert.deepEqual(b.s.players, a.s.players);
});

test('おわった 大会・こわれた データ・ちがう 版は 読みこまない', () => {
  const storage = mem();
  assert.equal(loadTaikai(storage), null);
  storage.setItem('dongurinpic.taikai', '{こわれた');
  assert.equal(loadTaikai(storage), null);
  const s = createTournament(PLAYERS, 1);
  saveTaikai({ picked: 'ponta', seed: 1, players: PLAYERS, s, cpus: [] }, storage);
  assert.ok(loadTaikai(storage));
  s.phase = 'finished';
  saveTaikai({ picked: 'ponta', seed: 1, players: PLAYERS, s, cpus: [] }, storage);
  assert.equal(loadTaikai(storage), null);
  storage.setItem('dongurinpic.taikai', JSON.stringify({ v: 999, s, players: PLAYERS }));
  assert.equal(loadTaikai(storage), null);
  clearTaikai(storage);
  assert.equal(storage.getItem('dongurinpic.taikai'), null);
});
