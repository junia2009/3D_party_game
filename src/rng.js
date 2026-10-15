// シード付きの乱数(mulberry32)。
//
// ゲームの結果に関わる乱数は必ずこれを使う。Math.random() は演出だけ。
// 状態は数値1つなので、ゲームの state にそのまま入れて持ち運べる
// (サーバーと画面で同じ乱数列を再現できる)。

export function nextRandom(holder, key = 'rng') {
  let a = (holder[key] = (holder[key] + 0x6d2b79f5) | 0);
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}

// [min, max) の一様乱数
export function randRange(holder, min, max, key) {
  return min + (max - min) * nextRandom(holder, key);
}

// 文字列や数値からシードを作る
export function seedFrom(value) {
  const s = String(value);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h | 0;
}
