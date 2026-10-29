# オンライン対戦

はなれた 友だちと、部屋に あつまって 遊ぶ。サーバーは Cloudflare Workers + Durable Objects。

## 入りかた(タイトル → オンライン)

- **部屋を つくる**: あいことば(数字 4けた)が でる。友だちに おしえるか、「リンクを おくる」で LINE などへ。
- **あいことばで 入る**: 4けたを 入れる。
- **だれとでも**: あいて いる「だれとでも の 部屋」に 入る。なければ 新しく つくる(人の 多い 部屋から えらぶ)。
- リンク(`?room=1234`)から ひらくと、タイトルを おしたら その 部屋へ 入る。

## 部屋

- 席は 5つ。さいしょに 入った 人が ホスト(あそびを えらんで はじめる)。ホストが ぬけたら 次の 人へ。
- キャラは 人どうしで かぶらない。あいた 席は はじめる ときに CPU で うめる(性格は くじ)。
- あそび: 競技(1つずつ。おまかせ も できる)/ すごろく(じゅんびちゅう)。
- オンラインで えらべる 競技は `src/net/games.js` の `ONLINE_GAMES` に ある ものだけ。
- 競技が おわると 部屋へ もどる。とちゅうで 切れた 人の 席は のこり、そのあいだ CPU が かわりに 動く。
  おなじ 端末(clientId)で つなぎなおすと もとの 席に もどれる。競技の とちゅうで「メニューへ」は 部屋も ぬける。

## しくみ

```
画面(src/title/online.js, src/net/client.js, src/net/drive.js)
   │  WebSocket(hello / chara / settings / start / in / leave)
   ▼
Worker(server/index.js)── /new /match /room?code=
   ├─ RoomDO(server/room-do.js): あいことば ごとに 1つ。部屋の きまりは server/room-core.js
   │     └─ MinigameSession(src/net/session.js): 競技を 60 刻み/秒で すすめる(ルールは src/games/*/rules.js そのまま)
   └─ MatchDO(server/match-do.js): だれとでも の 部屋の 名簿
```

- **ルールの 計算は サーバーだけ**(権威)。画面は 入力を 送って、とどいた 状態を 映す。
- 入力: 画面は 1刻みに 1つ 入力を つくり、2刻みぶん まとめて 送る。サーバーは 席ごとに ならべて 1刻み 1つずつ つかう。
  まだ とどいて いない ときは「おしっぱなし」だけ くりかえす(投げる・たたく など 1回きりの 入力を 2回 つかわない)。
- 状態: サーバーは 2刻みごとに 状態(snap)と できごとを くばる。画面は すこし ためてから 1刻みおきに あてはめ、
  あいだの 1刻みは サーバーが つかった 入力で 自分で すすめる(60 コマで なめらか)。できごとは サーバーの ものだけ。
- 競技の 画面(`game.js`)は「自分の 席 = `game.me`」で 書く(オンラインでは 0 とは かぎらない)。
  `enter(character, { lineup, onFinish, net: { client, start } })` で オンラインに なる。
  オンラインの あいだは 一時停止しても 時間は とまらない(サーバーが すすめる)。

## 競技を オンライン対応に する

1. `game.js` の 自分の 席を `game.me` に する(`slot === 0`・`[0]`・`indexOf(0)` など)。
2. `startGame` で `tour.net` を 見て、席・種・顔ぶれを サーバーの ものに し、`createNetDriver` を つくる。CPU は 画面では 動かさない。
3. 1フレームの 輪で `game.net.pump(dt, myInput, onEvents)`。
4. `src/net/games.js` の `ONLINE_GAMES` に 足す。

## 開発

```sh
npm run server   # wrangler dev(:8787)。localhost で ひらいた 画面は 自動で ここを 見る
npm run serve    # 静的サイト
```

- 本番の 接続先は `src/net/client.js` の `DEFAULT_SERVER`。
- `main` へ push すると `.github/workflows/server.yml` が テストして デプロイ(リポジトリの Secrets に
  `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` が ある とき)。デプロイ後に `/health` と 部屋を つくれるかを たしかめる。
- 部屋の きまり・競技の 進行は `test/online.test.js`。ブラウザ 2つの 確認は スクラッチパッドの E2E で
  (`addInitScript` で `localStorage['dongurinpic.net']` の clientId を かえる)。
