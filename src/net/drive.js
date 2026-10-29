// 競技の 画面を オンラインで 動かす(game.js から つかう)。THREE にも DOM にも 触らない。
//
// サーバーは 2刻みごとに 状態(snap)を くばる。画面は それを すこし ためてから(とどく 間隔の ゆれを ならす)
// 1刻みおきに あてはめ、あいだの 1刻みは サーバーが つかった 入力で 自分で 1刻み すすめる(60 コマで なめらかに)。
// すすめた ぶんの できごとは すてる(できごとは サーバーの ものだけ つかう。音や 演出が 2回 出ない)。
// 自分の 入力は 1刻みに 1つ、2刻みぶん まとめて 送る。

const START_BUFFER = 2; // はじめに ためる snap の 数
const MAX_BUFFER = 5; // これより たまったら おいつく(古い ものを とばす)

export function replaceState(dst, src) {
  for (const k of Object.keys(dst)) if (!(k in src)) delete dst[k];
  return Object.assign(dst, src);
}

export function createNetDriver({ client, rules, state }) {
  const snaps = [];
  let inputs = null;
  let acc = 0;
  let slot = 0; // 0 = つぎは snap を あてはめる、1 = 自分で 1刻み
  let started = false;
  let out = [];
  client.h.snap = (m) => snaps.push(m);
  return {
    get lag() { return snaps.length; },
    pump(dt, myInput, onEvents) {
      acc += dt;
      let n = 0;
      while (acc >= rules.STEP && n++ < 8) {
        acc -= rules.STEP;
        out.push(myInput() ?? null);
        if (out.length >= 2) { client.sendInputs(out); out = []; }
        if (!started) { if (snaps.length >= START_BUFFER) started = true; else continue; }
        if (snaps.length > MAX_BUFFER) {
          // おくれすぎ: とばす snap の できごとは のこす
          const drop = snaps.splice(0, snaps.length - START_BUFFER);
          snaps[0] = { ...snaps[0], ev: [...drop.flatMap((m) => m.ev), ...snaps[0].ev] };
          slot = 0;
        }
        if (slot === 0) {
          const m = snaps.shift();
          if (!m) continue; // まだ とどかない: まつ
          replaceState(state, m.s);
          inputs = m.in;
          if (m.ev.length) onEvents(m.ev);
          slot = 1;
        } else {
          if (inputs && state.phase !== 'finished') rules.step(state, inputs);
          slot = 0;
        }
      }
      if (acc > rules.STEP * 8) acc = 0;
    },
  };
}
