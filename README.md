# 3D_party_game(仮題:ワイワイアニマルズ)

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

プロフィールと見分け方は `src/characters.js` に書いてある。

見張り番などの NPC は `src/npcs.js`(`models/hoho.glb` = ホーホー先生)。

全体の決めごとは [docs/GAME.md](docs/GAME.md)。

## 遊ぶ・見る

```sh
npm run serve   # http://localhost:8000/
```

| ページ | 中身 |
| --- | --- |
| `daruma.html` | ミニゲーム「だるまさんがころんだ」(ひとり + CPU4人)。`?seed=数字` で展開を固定できる |
| `viewer.html` | キャラ図鑑。アニメーション・表情・プレイヤーの色を切り替えて見られる |

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
