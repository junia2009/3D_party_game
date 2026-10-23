# ゲームの全体像

決まったことを書きとめる。迷ったらここに戻る。

## 名前: ドングリンピック

どんぐり + オリンピック。森の動物たちが、空に浮かぶ島に集まって、どんぐりを賭けて競い合う。

- ゲームの中の言葉もこの名前にそろえる: ミニゲーム = **競技**(「第1競技 だるまさんがころんだ」)、
  すごろく = **大会**、優勝 = **金どんぐりメダル**、順位発表 = **表彰台**。
- ほかの案(ワチャモリ!・ソラモリ・モリノワ など)も出したうえで、名前とお宝(どんぐり)と
  ミニゲーム(競技)がひとつにつながる、この名前に決めた。

## 形

- **すごろくモード**と**ミニゲームモード**の2本立て(マリオパーティ型)。
  - 大会(すごろく)の仕様: [TAIKAI.md](TAIKAI.md)
  - すごろくモード: すごろくの合間にミニゲームが入る。
  - ミニゲームモード: ミニゲームだけを続けて遊ぶ。
- どちらのモードも、ミニゲームは同じ作りのものを使う。ミニゲームは「参加者を受け取り、順位を返す」だけにしておき、
  すごろく側は順位をコインなどに換える。

## 人数

- **1部屋 最大5人。** 空いた席は CPU で埋める(ひとりでも5人で遊べる)。
  - 8人も検討したが、スマホの縦画面では一人ひとりが小さくなりすぎるのでやめた。
- **キャラはかぶらない。** 6体から5人が1体ずつ選ぶ。
- **プレイヤーの色は5色**(席の番号で決まる)。キャラの見分けは見た目でつくので、色は補助。

| 席 | 色 | |
| --- | --- | --- |
| P1 | あか | `#ff5a4e` |
| P2 | あお | `#3d8bff` |
| P3 | きいろ | `#ffc23c` |
| P4 | みどり | `#34c47c` |
| P5 | むらさき | `#9b6bff` |

## キャラの能力

- はやさ・ちから・わざ・うん は**性格づけだけ**で、勝敗には関係させない。全員同じ性能。

## 操作

- スマホの片手で足りること(タップ・長押し・スワイプ)。PC ではキー1〜2個で同じことができる。

## オンライン

- 遅延に強い遊びを選ぶ。一瞬のずれで勝敗が決まるもの(ぶつかり合いなど)は避ける。
- ルールの計算はサーバーと画面で同じコードを使う(`src/games/*/rules.js` は THREE にも DOM にも触らない)。

## ミニゲーム

| 名前 | 状態 | 仕様 |
| --- | --- | --- |
| だるまさんがころんだ | 作成中 | [minigames/daruma.md](minigames/daruma.md) |
| どんぐりキャッチ | 作成中 | [minigames/catch.md](minigames/catch.md) |
| 落ち葉そりレース | 作成中 | [minigames/sled.md](minigames/sled.md) |
| まつぼっくり的あて | 作成中 | [minigames/mato.md](minigames/mato.md) |
| どんぐりつみ | 作成中 | [minigames/tsumi.md](minigames/tsumi.md) |
| いかだレース | 作成中 | [minigames/ikada.md](minigames/ikada.md) |
| 花ぬり陣取り | 作成中 | [minigames/hana.md](minigames/hana.md) |
| どんぐり早うち | 作成中 | [minigames/hayauchi.md](minigames/hayauchi.md) |
| 切り株ずもう | 作成中 | [minigames/sumo.md](minigames/sumo.md) |
| おぼえて かくれんぼ | 作成中 | [minigames/kakure.md](minigames/kakure.md) |
| どんぐりマンション だっしゅつ | 作成中 | [minigames/dasshutsu.md](minigames/dasshutsu.md) |
| 川原の つなひき | 作成中 | [minigames/tsuna.md](minigames/tsuna.md) |
| お祭りの 大なわとび | 作成中 | [minigames/nawa.md](minigames/nawa.md) |
| 火山の 落ちものよけ | 作成中 | [minigames/kazan.md](minigames/kazan.md) |
| 雪山の 雪合戦 | 作成中 | [minigames/yuki.md](minigames/yuki.md) |
| 遊園地の バンパーカー | 作成中 | [minigames/bumper.md](minigames/bumper.md) |
| 森の湖の いろいろキノコ | 作成中 | [minigames/kinoko.md](minigames/kinoko.md) |
| 森の図書館の ぱらぱらブック | 作成中 | [minigames/ehon.md](minigames/ehon.md) |
| 空まで まめのきジャンプ | 作成中 | [minigames/mame.md](minigames/mame.md) |
| 夏の浜べの ビーチバレー | 作成中 | [minigames/volley.md](minigames/volley.md) |
| 森の谷まの かみひこうき | 作成中 | [minigames/hikouki.md](minigames/hikouki.md) |
| 夏祭りの ラムネ しゅわしゅわ | 作成中 | [minigames/ramune.md](minigames/ramune.md) |
