# ドングリンピック(3D_party_game)

スマホと PC のブラウザで遊ぶ、オンライン対戦の 3D パーティゲーム。
いまはキャラクターデザインの段階。

## キャラクター

| ファイル | 名前 | 種族 | 得意 |
| --- | --- | --- | --- |
| `models/ponta.glb` | ポン太 | たぬき | オールラウンダー |
| `models/mimi.glb` | ミミ | うさぎ | スピード型 |
| `models/gonzo.glb` | ゴンゾ | くま | パワー型 |
| `models/penne.glb` | ペンネ | ペンギン | テクニック型 |
| `models/konko.glb` | コンコ | きつね | ラッキー型 |
| `models/kerosuke.glb` | ケロスケ | かえる | ジャンプ型 |
| `models/kirin.glb` | キリコ | キリン | 見とおし型 |

プロフィールと見分け方は `src/characters.js` に書いてある。

見張り番などの NPC は `src/npcs.js`(`models/hoho.glb` = ホーホー先生、`risu` `harinezumi` `komadori` `mogura` = だるまさんの観客)。

全体の決めごとは [docs/GAME.md](docs/GAME.md)。

## 遊ぶ・見る

```sh
npm run serve   # http://localhost:8000/
```

公開版: `main` に push すると GitHub Actions(`.github/workflows/pages.yml`)がテストを通してから GitHub Pages に出す。

| ページ | 中身 |
| --- | --- |
| `index.html` | ゲーム本体(タイトル・メニュー・競技まで全部ここ。ページは切り替わらない)。`#menu` でメニューから、`#daruma` で「だるまさんがころんだ」の入口から。競技は `?seed=数字` で展開を固定、`?time=morning/day/evening/night` で時間帯を固定、`?fps` で重さを表示 |
| `daruma.html` | 前の入口。`index.html#daruma` へ送るだけ |
| `manifest.webmanifest` `sw.js` `icons/` | PWA。ホーム画面に置けて、一度ひらけばオフラインでも遊べる(CLAUDE.md の「PWA」) |
| `viewer.html` | 開発用のモデル確認(アニメーション・表情・プレイヤーの色を切り替えて見られる)。遊ぶ人向けの図鑑は `index.html` の中(`#zukan`) |

## アクセス集計(GoatCounter)

何人来て、どれだけ遊ばれたかだけを [GoatCounter](https://www.goatcounter.com/) で数えている(集計画面は `dongurinpic.goatcounter.com`)。
送るのは「ゲームを開いた」と出来事の名前(競技を遊んだ・大会を始めた/最後まで遊んだ・部屋を作った など)だけで、
名前・あいことば・部屋の番号・成績は送らない。Cookie も使わない。しくみと決めごとは `src/analytics.js` の先頭。

## テスト

```sh
npm test        # ミニゲームのルールと CPU(ブラウザ不要)
```

## glb を作り直す

glb は手で作らず、`src/characters.js` から書き出す。形を変えたら書き出し直す。

```sh
npm install         # three(書き出しに使うだけ)
npm run export:glb  # models/*.glb を上書き
```

## ゲスト(ほかのゲームから来た子)

`CHARACTERS` の中で `guest: true` の子。形は もらった glb(`tools/source/`)をそのまま使い、
`src/guests/<key>.js` が この大会の約束ごと(下)に合わせて組みなおす(骨・表情・スカーフ・輪郭線・動き)。
`npm run export:glb` で ほかの子といっしょに `models/<key>.glb` へ書き出す(1体だけなら `npm run export:glb -- ray`)。

- CPU には出てこない。キャラえらびでは「ゲスト」の札、図鑑では「とくべつ出演」。
- 頭の回る点が顔のまんなかにないときは、`faceLift`(顔のまんなかまでの高さ)で顔の絵の位置を合わせる。
- 脚がない子もいる(`leg_L` / `leg_R` はない)。走るときは ぴょんぴょん はねる。

## glb の約束ごと

ゲーム側は次の名前でモデルに触る。

- **ノード**: `rig`(体全体)・`head`・`arm_L` / `arm_R`・`leg_L` / `leg_R`・`tail`(ないキャラもいる)・
  `face_normal` / `face_happy` / `face_surprised` / `face_frustrated`(使わない表情は scale 0)・
  `stars`(目を回したときの星。ふだんは scale 0)。L / R はキャラ自身から見た左右で、正面は +Z。
- **マテリアル**: `player_color`(スカーフ。プレイヤーの色に塗りかえる)・`player_outline`(その輪郭線)・
  `outline`(輪郭線。面を裏返した殻で、ライトの影響を受けない)。
- **アニメーション**: `idle`・`wave`・`cheer`・`run`・`dizzy`。どれもループする長さで切ってある。
  表情はアニメーションに入れていない(ゲーム側で `face_*` を切り替える)。
- 素材はふつうの PBR なので、どの glTF ビューアでも見られる。ゲームではトゥーン調に差し替える
  (`viewer.html` の `toToon` が例)。
