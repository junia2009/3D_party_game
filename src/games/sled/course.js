// 落ち葉そりレース のコース。THREE にも DOM にも触らない(ルールと画面の両方が使う)。
//
// コースは「道にそった座標」で表す: s = スタートからの道のり(m)、x = 道のまん中からの横のずれ(m、右が +)。
// 道は区間ごとの曲がり具合(curvature: 右曲がりが +、1/半径)で決める。3D の形は画面側が
// この曲がり具合を積み上げて作る。
//
// カーブの内側は道のりが短い(半径が小さい)。だから内側を走るほど速く進む(ルールが s を進める量に効く)。
// わかれ道: 右カーブのとちゅうに、しげみの島がある。島の内側(右)はせまい近道、外側(左)は広い遠回り。

export const LENGTH = 320; // スタートからゴールまで(m)

// [ここまでの道のり, 曲がり具合]
const SEGMENTS = [
  [30, 0],
  [80, -1 / 30], // 左カーブ
  [100, 0],
  [165, 1 / 26], // 右カーブ
  [215, 1 / 22], // 右カーブ(わかれ道)
  [240, 0],
  [285, -1 / 28], // 左カーブ
  [LENGTH + 40, 0], // ゴールのあと(止まるところ)
];

// わかれ道のしげみの島(この x のあいだは通れない)
export const ISLANDS = [{ from: 170, to: 210, x0: 0.8, x1: 2.0 }]; // 近道(島の右)の幅は 1.4m

// キノコのジャンプ台
export const MUSHROOMS = [
  { s: 90, x: 0 },
  { s: 192, x: -2.2 }, // わかれ道の遠回りがわ(遠回りでも見せ場がある)
  { s: 228, x: -1.2 },
  { s: 300, x: 1.0 },
];

// どんぐり: 一列に並べる [はじめ, おわり, x]
const ACORN_LINES = [
  [40, 52, -1.8], // 左カーブの内側
  [95, 103, 0], // ジャンプのあと(空中でも拾える)
  [118, 130, 1.6], // 右カーブの内側
  [176, 204, -2.8], // わかれ道の遠回り(近道は速いが、どんぐりはない)
  [250, 262, -1.6], // 左カーブの内側
  [305, 313, 0],
];
export const ACORNS = ACORN_LINES.flatMap(([a, b, x]) => {
  const out = [];
  for (let s = a; s <= b; s += 2) out.push({ s, x });
  return out;
});

export function curvatureAt(s) {
  for (const [end, c] of SEGMENTS) if (s < end) return c;
  return 0;
}

// 道の半分の幅。わかれ道のところだけ広い(島をはさんで二手に分かれる)。なめらかに広がる
export function halfWidthAt(s) {
  const base = 3.2, wide = 4.2;
  const k = Math.min(smooth((s - 160) / 10), 1 - smooth((s - 210) / 10));
  return base + (wide - base) * Math.max(0, k);
}
function smooth(t) {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}

export function islandAt(s) {
  return ISLANDS.find((i) => s >= i.from && s <= i.to) || null;
}
