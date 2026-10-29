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
- あそび: 競技(1つずつ。おまかせ も できる)/ すごろく(ステージ・ターン数を えらぶ)。
- オンラインで えらべる 競技は `src/net/games.js` の `ONLINE_GAMES` に ある ものだけ。
- 競技が おわると 部屋へ もどる。とちゅうで 切れた 人の 席は のこり、そのあいだ CPU が かわりに 動く。
  おなじ 端末(clientId)で つなぎなおすと もとの 席に もどれる。競技の とちゅうで「メニューへ」は 部屋も ぬける。

## しくみ

```
画面(src/title/online.js, src/net/client.js, src/net/drive.js)
   │  WebSocket(hello / chara / settings / start / in / bact / bseen / leave)
   ▼
Worker(server/index.js)── /new /match /room?code=
   ├─ RoomDO(server/room-do.js): あいことば ごとに 1つ。部屋の きまりは server/room-core.js
   │     ├─ MinigameSession(src/net/session.js): 競技を 60 刻み/秒で すすめる(ルールは src/games/*/rules.js そのまま)
   │     └─ TaikaiSession(src/net/taikai-session.js): すごろくの 手番を すすめる
   └─ MatchDO(server/match-do.js): だれとでも の 部屋の 名簿
```

- **ルールの 計算は サーバーだけ**(権威)。画面は 入力を 送って、とどいた 状態を 映す。
- 入力: 画面は 1刻みに 1つ 入力を つくり、2刻みぶん まとめて 送る。サーバーは 席ごとに ならべて 1刻み 1つずつ つかう。
  まだ とどいて いない ときは「おしっぱなし」だけ くりかえす(投げる・たたく など 1回きりの 入力を 2回 つかわない)。
- 進めかた: サーバーは 2刻みごとに、その あいだの 刻みごとの みんなの 入力を くばり、0.5 秒(30刻み)ごとに 状態も くばる。
  画面は とどいた 入力で 自分でも ルールを すすめる(おなじ コードなので おなじ けっかに なる)。できごと(音・演出)も
  画面の 計算から 出るので すぐ 出る。状態が とどいたら 上書きして ずれ(端末ごとの 計算の こまかい ちがい)を なおす。
  上書きは 中の 物を できるだけ おなじ 物の まま 中身だけ かえる(演出が 状態の 物を 目じるしに して いるため)。
- 競技の 画面(`game.js`)は「自分の 席 = `game.me`」で 書く(オンラインでは 0 とは かぎらない)。
  `enter(character, { lineup, onFinish, net: { client, start } })` で オンラインに なる。
  オンラインの あいだは 一時停止しても 時間は とまらない(サーバーが すすめる)。
- オンラインでは、できごとを 見のがす ことが ある(とちゅうから 入った・おくれて まとめて すすめた)。
  演出は「前の できごとが あった はず」に たよりすぎない(どんぐりつみの「落とす」は、つるの先が なくても 落とせる)。

## すごろく(大会)

- 大会の 進行も サーバー(`src/net/taikai-session.js` の `TaikaiSession`。ルールは `src/board/rules.js` の `act` そのまま)。
  すごろくは 時間でなく「手番の 子の 操作」で すすむので、競技とは べつの しくみ。
- 操作(`act` に わたす もの)には 番号(seq)を つけて、みんなへ `bact { seq, action, s }` で くばる。
  画面も おなじ `act` で すすめて 演出を 出し、そのあと `s` で こたえあわせ する。見おわったら `bseen { seq }`。
- サーバーは つながって いる 人 みんなが 見おわってから 次へ すすむ(見おわらない 人は 25 秒で おいていく)。
  - 人の 手番: その 子の 画面から `bact { action }` が とどくのを まつ(45 秒 きめないと CPU が かわりに)。
  - CPU・切れた 人の 手番: すこし 間を おいて CPU が きめる。
  - みんなの 競技・対決: 部屋が 競技を はじめる(ふつうの 競技と おなじ `start`)。おわったら 順位を 大会へ もどす。
    人の いない 対決は その場で `simulate`。出ない 子は 盤で「…が 対決中…」と まつ。
- 画面は `src/board/game.js` の `driveOnline`。自分の 席は `game.me`(盤の 名前・カードも これで「あなた」を きめる)。
  オンラインの 大会は とちゅうから やりなおす ための 保存を しない(つなぎなおすと サーバーが いまの 状態を くれる)。
- 大会が おわると 3 秒後に 部屋へ もどる。

## 競技を オンライン対応に する

いまは 全部の 競技が オンライン対応(`src/net/games.js` の `ONLINE_GAMES` = 全部)。新しい 競技も はじめから こう 書く:

1. 自分の 席は `game.me`(`slot === 0`・`[0]`・`indexOf(0)` などと 書かない)。ゲームが はじまる 前に よばれる 関数では `game?.me ?? 0`。
2. `startGame` で `tour.net` を 見て、席・種・顔ぶれを サーバーの ものに し(`makePlayers({ …, me })`・`replaceState`)、
   `createNetDriver({ client, rules: { STEP, step }, state, me })` を つくる。
3. 1刻みの 輪で、オンラインなら `step` の かわりに `game.net.step(s, inputs)`。CPU の 入力は オンラインでは よばない。
   輪を もたない 画面は `game.net.pump(dt, myInput, onEvents)`。
4. `enter` で `net` を うけとって `tour` に 入れる。

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
