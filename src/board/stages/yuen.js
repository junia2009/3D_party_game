// 大会のステージ「どんぐり遊園地」。THREE にも DOM にも触らない(ルールと画面の両方が使う)。
//
// ぐるっと一周する道(36 マス)が、4つのエリアに 9 マスずつ分かれている。四季の森より 小さめで、ぶつかりやすい。
// - 入口広場: ゲートと 風船。どうぐ屋(ポップコーンの屋台)
// - コースター: ジェットコースターの 乗り場
// - 観覧車: 観覧車と メリーゴーラウンド。観覧車の 乗り場
// - おばけ屋敷: おばけ屋敷の 入口
// 乗り場(ride)に止まると、どんぐりを はらって 乗るかを えらべる。乗ると 行き先は くじ(rides の outcomes)。
// スタート(入口のゲート)は 0。高い乗り物(コースター・観覧車)は 奥(-z)の 道の外に置いて、盤を かくさない。
//
// マスは配列の番号で指す。next は進める先。x, z は画面用の位置(m)。

const MAIN = [
  // 入口広場 0〜8
  'start', 'blue', 'item', 'blue', 'red', 'shop', 'blue', 'happen', 'duel',
  // コースター 9〜17
  'blue', 'red', 'blue', 'item', 'blue', 'ride', 'happen', 'red', 'blue',
  // 観覧車 18〜26
  'blue', 'item', 'blue', 'ride', 'red', 'blue', 'happen', 'duel', 'blue',
  // おばけ屋敷 27〜35
  'blue', 'red', 'ride', 'blue', 'happen', 'item', 'red', 'duel', 'blue',
];
const AREAS = ['gate', 'coaster', 'wheel', 'ghost'];
// 乗り場のマス → 乗り物
const RIDE_AT = { 14: 'coaster', 21: 'wheel', 29: 'ghost' };

// 道の形: 角の丸い四角。0 は手前(+z)のまん中。手前 → 右 → 奥 → 左 の順にまわる
const RX = 17, RZ = 12.5;
function loopPos(i) {
  const a = Math.PI / 2 - (i / MAIN.length) * Math.PI * 2;
  const c = Math.cos(a), s = Math.sin(a);
  return { x: RX * Math.sign(c) * Math.abs(c) ** 0.55, z: RZ * Math.sign(s) * Math.abs(s) ** 0.55 };
}

const squares = MAIN.map((kind, i) => {
  const p = loopPos(i);
  const sq = { id: i, kind, area: AREAS[Math.floor(i / 9)], next: [(i + 1) % MAIN.length], x: p.x, z: p.z };
  if (RIDE_AT[i]) sq.ride = RIDE_AT[i];
  return sq;
});

export const STAGE = {
  key: 'yuen',
  name: 'どんぐり遊園地',
  areas: [
    { key: 'gate', name: '入口広場' },
    { key: 'coaster', name: 'コースター' },
    { key: 'wheel', name: '観覧車' },
    { key: 'ghost', name: 'おばけ屋敷' },
  ],
  squares,
  start: 0,
  margin: 8, // 島の ふち(道の外に 乗り物を 置くので、四季の森より 広め)
  time: 'dusk', // たそがれ(電球が きれいに 見える)
  isleShape: 4, // 島の形: 角の まるい 四角(2 なら だ円)。四すみにも 乗り物を 置ける
  owlSpots: squares.filter((q) => q.kind === 'blue' && q.id > 2 && q.id < 34).map((q) => q.id),
  shortcuts: {},
  // 乗り物。price: 乗るのに はらう どんぐり。outcomes: 行き先の くじ(w は重み)
  //   owl   … 先生の 1マス 手前(大当たり)
  //   ahead … min〜max マス 先へ
  //   back  … min〜max マス うしろへ
  //   warp  … 盤の どこかへ(本道の マス)
  //   stay  … その場で、どんぐり acorns こ
  rides: {
    coaster: {
      name: 'ジェットコースター', price: 3,
      outcomes: [
        { w: 20, kind: 'owl' },
        { w: 50, kind: 'ahead', min: 8, max: 12 },
        { w: 30, kind: 'back', min: 3, max: 5 },
      ],
    },
    wheel: {
      name: '観覧車', price: 3,
      outcomes: [
        { w: 25, kind: 'owl' },
        { w: 45, kind: 'warp' },
        { w: 30, kind: 'stay', acorns: 6 },
      ],
    },
    ghost: {
      name: 'おばけ屋敷', price: 3,
      outcomes: [
        { w: 15, kind: 'owl' },
        { w: 45, kind: 'ahead', min: 5, max: 9 },
        { w: 40, kind: 'back', min: 6, max: 9 },
      ],
    },
  },
};
