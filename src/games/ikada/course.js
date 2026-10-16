// いかだレース の川。THREE にも DOM にも触らない(ルールと画面の両方が使う)。
//
// そりレースと同じく「川にそった座標」で表す: s = スタートからの道のり(m)、x = 川のまん中からの横のずれ(m、右が +)。
// 川は区間ごとの曲がり具合(curvature: 右曲がりが +、1/半径)で決める。3D の形は画面側が積み上げて作る。
//
// 朝もやの森の川: 静かな池からスタート → 岩のある左カーブ → 急流 → 小さな滝 → うずと流木のゆるやかな所 →
// 木の根のトンネル → 2つめの急流と滝 → 広い所(うず・流木)→ ビーバーのダムの水門がゴール。

export const LENGTH = 270; // スタートからゴール(ダムの水門)まで(m)
export const POND_END = LENGTH + 26; // ゴールのあとの池のおわり(ダムのかべ)

// [ここまでの道のり, 曲がり具合]
const SEGMENTS = [
  [22, 0],
  [62, -1 / 34], // 左カーブ(岩)
  [78, 0],
  [96, 1 / 40], // 急流(右へゆるく)
  [118, 0],
  [150, -1 / 38], // うずと流木
  [188, 1 / 30], // 木の根のトンネル(右カーブ)
  [214, 0], // 急流 2
  [240, -1 / 40], // 広い所
  [LENGTH + 40, 0], // ゴールのあと(ダムの前の池)
];

// 川の流れの速さ(m/秒)。急流のところは速い。[はじめ, おわり, 速さ]
const CURRENTS = [
  [70, 98, 4.6],
  [192, 216, 4.8],
];
export const BASE_CURRENT = 2.2;

// 小さな滝: ここで ざぶーんと落ちる。drop は落ちる高さ(m、見た目)
export const FALLS = [
  { s: 100, drop: 1.4 },
  { s: 219, drop: 1.6 },
];

// 岩: { s, x, r }
export const ROCKS = [
  { s: 32, x: 1.6, r: 0.8 },
  { s: 40, x: -2.0, r: 0.7 },
  { s: 48, x: 0.4, r: 0.75 },
  { s: 57, x: -1.0, r: 0.6 },
  { s: 58, x: 2.6, r: 0.7 },
  { s: 76, x: -1.6, r: 0.6 }, // 急流 1: 左、右 と よける
  { s: 88, x: 1.4, r: 0.65 },
  { s: 160, x: 1.9, r: 0.7 }, // トンネルの中
  { s: 172, x: -1.4, r: 0.7 },
  { s: 199, x: 0.9, r: 0.65 }, // 急流 2: 右、左 と よける
  { s: 210, x: -1.6, r: 0.6 },
  { s: 254, x: 0, r: 0.8 },
];

// 流木: 川を横切るように、ゆっくり左右に流れている。中心の x = x + amp * sin(w * t + ph)、長さ len
export const LOGS = [
  { s: 132, x: 0, len: 2.2, amp: 1.7, w: 0.55, ph: 0 },
  { s: 145, x: 0.5, len: 2.0, amp: 1.6, w: 0.7, ph: 2.1 },
  { s: 246, x: 0, len: 2.4, amp: 2.0, w: 0.5, ph: 1.0 },
];
export const LOG_R = 0.28; // 流木の太さ(半径)

// うず: 近づくと吸いこまれて、ぐるぐる回る。強くこいで抜け出す
export const WHIRLS = [
  { s: 122, x: -1.4, R: 2.4 },
  { s: 232, x: 1.6, R: 2.5 },
];

// 木の根のトンネル(見た目だけ。せまい)
export const TUNNEL = { from: 152, to: 186 };

export function curvatureAt(s) {
  for (const [end, c] of SEGMENTS) if (s < end) return c;
  return 0;
}

export function currentAt(s) {
  // ゴールのあとはダムの前の池: 流れはだんだん止まる
  let u = BASE_CURRENT * (1 - smooth((s - LENGTH - 4) / 14));
  for (const [a, b, v] of CURRENTS) {
    // 急流の入り口・出口は、なめらかに
    const k = Math.min(smooth((s - a) / 6), 1 - smooth((s - b) / 6));
    if (k > 0) u = Math.max(u, BASE_CURRENT + (v - BASE_CURRENT) * k);
  }
  return u;
}

// 川の半分の幅
export function halfWidthAt(s) {
  // [ここから, 半分の幅] を、なめらかにつなぐ
  const W = [[0, 5.0], [18, 4.2], [66, 3.4], [100, 3.4], [108, 4.6], [150, 4.0], [156, 3.3], [184, 3.3], [192, 3.2], [218, 3.4], [226, 4.8], [262, 4.4], [LENGTH, 5.0]];
  for (let i = 0; i < W.length - 1; i++) {
    const [s0, w0] = W[i], [s1, w1] = W[i + 1];
    if (s < s1) return w0 + (w1 - w0) * smooth((s - s0) / (s1 - s0));
  }
  return W[W.length - 1][1];
}

// 川の水面の高さ(見た目用)。ゆるく下っていて、急流は少し急、滝で ざぶんと下がる
export function heightAt(s) {
  let y = -0.015 * s;
  for (const [a, b] of CURRENTS) y -= 0.04 * Math.max(0, Math.min(s, b) - a);
  for (const f of FALLS) y -= f.drop * smooth((s - f.s + 0.4) / 0.8);
  return y;
}

export function smooth(t) {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}

// 流木の、いまの中心の x
export function logX(log, t) {
  return log.x + log.amp * Math.sin(log.w * t + log.ph);
}
