// 競技の 画面を オンラインで 動かす(game.js から つかう)。THREE にも DOM にも 触らない。
//
// サーバーは 2刻みごとに、その あいだの 刻みごとの みんなの 入力を くばり、0.5 秒ごとに 状態も くばる。
// 画面は その 入力で 自分でも ルールを すすめる(おなじ コードなので おなじ けっかに なる)。
// できごと(音・演出)も 自分の 計算から 出るので、すぐ 出る。状態が とどいたら 上書きして ずれを なおす。
// とどく 間隔の ゆれは すこし ためて ならす。たまりすぎたら まとめて すすめて おいつく。
// 自分の 入力は 1刻みに 1つ、2刻みぶん まとめて 送る。
//
// つかいかた: 競技の 1刻みの 輪で、オンラインの ときは rules.step の かわりに net.step(s, inputs) を よぶ。
//   inputs[me] だけが サーバーへ 送られる(ほかの 席の 入力は サーバーから とどいた ものを つかう)。

const START_BUFFER = 2; // はじめに ためる 刻みの 数(サーバーは 2刻みずつ くばる)
const KEEP_BUFFER = 4; // これより たまって いたら 1刻み よけいに すすめて、すこしずつ おいつく(ためた ぶんだけ おくれる)
const MAX_BUFFER = 10; // これより たまったら まとめて すすめる

// とどいた 状態を いまの 状態へ 上書きする。中の 物(配列・物)は できるだけ おなじ 物の まま 中身だけ かえる。
// 画面の 演出が 状態の 物を 目じるしに して いる(Map の キーに する・つかんで おく)ので、まるごと 入れかえると つながりが きれる。
// 画面も おなじ ルールで すすめて いるので、配列の ならびは サーバーと そろって いる(何番目かで あわせて よい)。
// どの 物にも id が あれば id で あわせる。
const isObj = (v) => v !== null && typeof v === 'object';
export function replaceState(dst, src) {
  if (Array.isArray(src)) {
    const byId = src.length && src.every((x) => isObj(x) && 'id' in x) && dst.every((x) => isObj(x) && 'id' in x);
    if (byId) {
      const old = new Map(dst.map((x) => [x.id, x]));
      const next = src.map((x) => { const o = old.get(x.id); return o && !Array.isArray(o) ? replaceState(o, x) : x; });
      dst.length = 0;
      dst.push(...next);
      return dst;
    }
    for (let i = 0; i < src.length; i++) {
      const a = dst[i], b = src[i];
      dst[i] = isObj(a) && isObj(b) && Array.isArray(a) === Array.isArray(b) ? replaceState(a, b) : b;
    }
    dst.length = src.length;
    return dst;
  }
  for (const k of Object.keys(dst)) if (!(k in src)) delete dst[k];
  for (const k of Object.keys(src)) {
    const a = dst[k], b = src[k];
    dst[k] = isObj(a) && isObj(b) && Array.isArray(a) === Array.isArray(b) ? replaceState(a, b) : b;
  }
  return dst;
}

export function createNetDriver({ client, rules, state, me = client.seat }) {
  const queue = []; // { in, s? } 刻みごと
  let tick = client.started?.tick ?? 0; // 画面が すすめた 刻み
  let acc = 0;
  let started = false;
  let out = [];
  client.h.snap = (m) => {
    const first = m.tick - m.ins.length + 1;
    m.ins.forEach((inputs, k) => {
      const t = first + k;
      if (t <= tick + queue.length) return; // もう ある
      queue.push({ in: inputs, s: t === m.tick ? m.s : undefined });
    });
  };
  function advance() {
    const q = queue.shift();
    tick++;
    const ev = state.phase === 'finished' ? [] : rules.step(state, q.in);
    if (q.s) replaceState(state, q.s); // こたえあわせ
    return ev;
  }
  function step(s, inputs) {
    out.push(inputs?.[me] ?? null);
    if (out.length >= 2) { client.sendInputs(out); out = []; }
    if (!started) { if (queue.length >= START_BUFFER) started = true; else return []; }
    if (!queue.length) return []; // まだ とどかない: まつ
    const ev = advance();
    // すこし たまった: 1刻み よけいに すすめる(目立たない ように すこしずつ)
    if (queue.length > KEEP_BUFFER) ev.push(...advance());
    // おくれすぎ: まとめて すすめて おいつく
    while (queue.length > MAX_BUFFER) ev.push(...advance());
    return ev;
  }

  return {
    me,
    get lag() { return queue.length; },
    step,
    // 刻みの 輪を 自分で もたない 画面むけ: dt ぶん すすめる
    pump(dt, myInput, onEvents) {
      acc += dt;
      let n = 0;
      while (acc >= rules.STEP && n++ < 8) {
        acc -= rules.STEP;
        const ev = step(state, { [me]: myInput() });
        if (ev.length) onEvents(ev);
      }
      if (acc > rules.STEP * 8) acc = 0;
    },
  };
}
