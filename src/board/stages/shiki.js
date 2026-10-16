// 大会のステージ「四季の森」。THREE にも DOM にも触らない(ルールと画面の両方が使う)。
//
// ぐるっと一周する道(48 マス)が、春・夏・秋・冬の4つのエリアに 12 マスずつ分かれている。
// - 春: 池。3 のところで分かれ道。ハスの葉を渡る近道(3マス・ハプニング多め)は 10 で本道にもどる
// - 夏: 森。大木の根もとに、どうぐ屋(17)
// - 秋: 紅葉の山。落ち葉すべり台(26 → 30、31 → 34)。止まると一気にすべっていく
// - 冬: 雪原。38 のところで分かれ道。凍った池をつっきる近道(4マス・つるつる氷)は 45 で本道にもどる。
//   氷のマスで止まると、もう1〜3マスすべる
// スタート(開会式の広場)は 0(冬と春のさかいめ)。
//
// マスは配列の番号で指す。next は進める先(2つあれば分かれ道)。x, z は画面用の位置(m)。

const MAIN = [
  // 春 0〜11
  'start', 'blue', 'red', 'blue', 'blue', 'item', 'happen', 'blue', 'red', 'blue', 'duel', 'blue',
  // 夏 12〜23
  'blue', 'red', 'blue', 'item', 'blue', 'shop', 'blue', 'happen', 'red', 'blue', 'duel', 'blue',
  // 秋 24〜35
  'blue', 'blue', 'slide', 'red', 'blue', 'happen', 'item', 'slide', 'blue', 'red', 'duel', 'blue',
  // 冬 36〜47
  'blue', 'red', 'blue', 'blue', 'happen', 'red', 'item', 'blue', 'blue', 'duel', 'blue', 'red',
];
const AREAS = ['spring', 'summer', 'autumn', 'winter'];
const SLIDES = { 26: 30, 31: 34 };

// 道の形: 角の丸い四角(四隅がそれぞれの季節)。0 は手前(+z)のまん中
const RX = 21, RZ = 16;
function loopPos(i) {
  const a = Math.PI / 2 - (i / MAIN.length) * Math.PI * 2; // 手前から、時計まわり(上から見て)
  const c = Math.cos(a), s = Math.sin(a);
  return { x: RX * Math.sign(c) * Math.abs(c) ** 0.55, z: RZ * Math.sign(s) * Math.abs(s) ** 0.55 };
}

function build() {
  const squares = MAIN.map((kind, i) => {
    const p = loopPos(i);
    const sq = { id: i, kind, area: AREAS[Math.floor(i / 12)], next: [(i + 1) % MAIN.length], x: p.x, z: p.z };
    if (SLIDES[i] !== undefined) sq.slideTo = SLIDES[i];
    return sq;
  });
  // 近道: from から分かれて、to で本道にもどる。内がわ(盤のまん中寄り)を通る
  const shortcut = (from, to, kinds, extra) => {
    const a = squares[from], b = squares[to];
    const ids = kinds.map((kind, k) => {
      const u = (k + 1) / (kinds.length + 1);
      const x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u;
      const pull = Math.sin(u * Math.PI) * 4.5; // まん中へふくらませる
      const len = Math.hypot(x, z) || 1;
      const id = squares.length;
      squares.push({ id, kind, area: a.area, next: [], x: x - (x / len) * pull, z: z - (z / len) * pull, ...extra });
      return id;
    });
    ids.forEach((id, k) => { squares[id].next = [k + 1 < ids.length ? ids[k + 1] : to]; });
    a.next = [a.next[0], ids[0]]; // [本道, 近道]
    return ids;
  };
  const lily = shortcut(3, 10, ['happen', 'blue', 'happen'], { path: 'lily' });
  const ice = shortcut(38, 45, ['blue', 'red', 'item', 'blue'], { path: 'ice', ice: true });
  return { squares, lily, ice };
}

const { squares, lily, ice } = build();

export const STAGE = {
  key: 'shiki',
  name: '四季の森',
  areas: [
    { key: 'spring', name: '春の池' },
    { key: 'summer', name: '夏の森' },
    { key: 'autumn', name: '秋の山' },
    { key: 'winter', name: '冬の雪原' },
  ],
  squares,
  start: 0,
  // 先生(メダル)が立てるマス: 本道の青マス(スタートのすぐ近くと、すべり台の行き先はのぞく)
  owlSpots: squares.filter((q) => q.kind === 'blue' && !q.path && q.id > 2 && q.id < 46 && !Object.values(SLIDES).includes(q.id)).map((q) => q.id),
  shortcuts: { lily, ice },
};
