// 大会のステージ「海の中の 探検」。THREE にも DOM にも触らない(ルールと画面の両方が使う)。
//
// ぐるっと一周する道(40 マス)が、4つのエリアに 10 マスずつ分かれている。明るい 海から 深い 海へ もぐって、また もどる。
// - サンゴ礁: あかるく カラフル。貝の お店(どうぐ屋)
// - 海藻の森: ゆらゆら 緑
// - 沈没船: 青く しずか。宝箱マス
// - 深海: くらくて、光る クラゲや チョウチンアンコウ
// しかけ:
// - 海流マス(current): 止まると 流れに のって 5 マス 運ばれる。流れの 向きは ターンごとに くじ(ふだんは 前、ときどき うしろ)。
// - 宝箱マス(chest): くじで どんぐり(たまに びっくり箱)。
// - クジラ: 盤の まわりを 泳いで いて、毎ターン 前へ 進む。クジラの いる マス(と その 前後)に 止まると、
//   背中に のって 10 マス 先(つぎの エリア)へ。
// スタートは 0(深海と サンゴ礁の さかいめ。海の 上から さしこむ 光の 下)。
//
// マスは配列の番号で指す。next は進める先。x, z は画面用の位置(m)。

const MAIN = [
  // サンゴ礁 0〜9
  'start', 'blue', 'item', 'current', 'blue', 'shop', 'happen', 'blue', 'red', 'duel',
  // 海藻の森 10〜19
  'blue', 'red', 'current', 'blue', 'item', 'happen', 'blue', 'red', 'current', 'blue',
  // 沈没船 20〜29
  'blue', 'chest', 'red', 'blue', 'happen', 'current', 'chest', 'item', 'duel', 'blue',
  // 深海 30〜39
  'red', 'blue', 'current', 'happen', 'item', 'red', 'chest', 'blue', 'duel', 'blue',
];
const AREAS = ['coral', 'kelp', 'wreck', 'deep'];

// 道の形: 角の丸い四角。0 は手前(+z)のまん中。手前 → 右 → 奥 → 左 の順にまわる
const RX = 18.5, RZ = 13.5;
function loopPos(i) {
  const a = Math.PI / 2 - (i / MAIN.length) * Math.PI * 2;
  const c = Math.cos(a), s = Math.sin(a);
  return { x: RX * Math.sign(c) * Math.abs(c) ** 0.55, z: RZ * Math.sign(s) * Math.abs(s) ** 0.55 };
}

const squares = MAIN.map((kind, i) => {
  const p = loopPos(i);
  return { id: i, kind, area: AREAS[Math.floor(i / 10)], next: [(i + 1) % MAIN.length], x: p.x, z: p.z };
});

export const STAGE = {
  key: 'umi',
  name: '海の中の 探検',
  areas: [
    { key: 'coral', name: 'サンゴ礁' },
    { key: 'kelp', name: '海藻の森' },
    { key: 'wreck', name: '沈没船' },
    { key: 'deep', name: '深海' },
  ],
  squares,
  start: 0,
  margin: 7,
  time: 'sea', // 海の中(上が 明るい 水色、下が 深い 青)
  isleShape: 4,
  // 先生(メダル)が立てるマス: 青マス(スタートの すぐ 近くは のぞく)
  owlSpots: squares.filter((q) => q.kind === 'blue' && q.id > 2 && q.id < 38).map((q) => q.id),
  shortcuts: {},
  // 海の しかけ
  sea: {
    current: 5, // 海流で 運ばれる マス
    backFlow: 0.35, // 流れが うしろ向きに なる ターンの わりあい
    whaleStart: 20, // クジラが はじめに いる マス
    whaleSwim: [6, 10], // 毎ターン 前へ 泳ぐ マス
    whaleReach: 1, // クジラの マスから これだけ はなれて いても 乗れる
    whaleRide: 10, // 背中に のって 運ばれる マス
    // 宝箱: w は重み
    chest: [
      { w: 55, acorns: 8 },
      { w: 25, acorns: 15 },
      { w: 20, acorns: -5 }, // びっくり箱
    ],
  },
};
