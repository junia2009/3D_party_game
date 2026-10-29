# CLAUDE.md — 開発作業ガイド

全体像は [README.md](README.md)。

## いちばん大事なこと: ユーザーとのやりとりは必ず日本語

- **返答・質問・進捗の報告・作業中のひとことは、すべて日本語で書く。** 英語は一文も混ぜない。
  ユーザーは英語が読めない。英語で書くと、質問しても答えてもらえず、報告も伝わらない。
- 長い作業の途中や、作業のあとの報告で英語に戻りやすい。送る前に読み返して確かめる。
- 例外はコードの識別子・コマンド・ファイル名だけ。

## 作り方: 画面に出るものは全部こだわる

- **「とりあえず置く」をしない。** タイトル・メニュー・結果画面・ステージなど、プレイヤーの目に入るものは
  すべて作品の一部として作り込む。「入口だから」「仮だから」と自分で手を抜く判断をしない。
- 見た目に関わるものは、作る前に方向性(テーマ・構図・雰囲気)の案を出して相談する。
  ラフ → 作り込み → 光や演出 の順に、区切りごとにスクリーンショットを見せる。
- 迷ったら作り込む側に倒す。ただしスマホで重くならないことは必ず確かめる。

## 慣習

- **push は常に `main` へ。** 作業ブランチは作らない。
- **ブラウザの戻るボタンは無いものとして作る**(将来 PWA にするため)。どの画面からも、
  ゲームの中のボタンだけでタイトルへ戻れること。プレイ中は右上の一時停止からメニューを開く。
- UI 文言・コードコメント・コミットメッセージは日本語。
- ビルド工程はない。ブラウザは ES Modules を直接読む(Three.js は `vendor/` + importmap)。
  `vendor/` の Three.js と `package.json` の `three` は同じ版にそろえる。

## PWA(ホーム画面のアプリ・オフライン)

- `manifest.webmanifest` と `sw.js`。一度ひらけば、電波がなくても遊べる(配信するファイルを全部プリキャッシュする)。
- **`src/` `vendor/` `models/` `assets/` `icons/` や `index.html` を変えたら `npm run gen:precache`。**
  一覧と版(中身のハッシュ)を `sw.js` に書く。忘れると `test/sw-precache.test.js` が落ちる。
  版が変わると、ブラウザが sw.js を入れなおして、しまったファイルも取りなおす。
- 取りかたはネットワーク優先。しまったものは、つながらないときだけ使う(古い版で動き続けることはない)。
- アイコンの絵は `tools/make-icons.mjs` の SVG。変えたら `npm run icons` で `icons/` に書き出しなおす。
- オフラインの確認は、スクラッチパッドの E2E で `ctx.setOffline(true)` と CDP の `Network.setCacheDisabled`
  (HTTP キャッシュを切らないと、sw ではなくブラウザのキャッシュで動いているだけかもしれない)。
  E2E で sw を使わないときは `serviceWorkers: 'block'`(古いコードを掴まないように)。

## ミニゲーム

- 1本ごとに `src/games/<名前>/` を作る。`rules.js`(ルール)と `cpu.js`(CPU)は
  **THREE にも DOM にも触らない**。あとでサーバーでも同じものを回すため。
  画面は `game.js` が持ち、state を書きかえるのは `rules.step` だけにする。
- 時間は固定の刻み(`STEP`)で進める。乱数は `src/rng.js` を通す(`Math.random()` は演出だけ)。
- ルールを変えたら `npm test`。新しいルールにはテストを足す。
  CPU どうしで何百回も回すテストが、決着すること・偏りすぎないことを見張っている。
- 仕様は `docs/minigames/<名前>.md`。ルールを変えたら仕様も直す。

## BGM

- `src/music/songs.js` が楽譜(データだけ)、`src/music/player.js` が WebAudio でその場で演奏する。音のファイルは使わない。
  森の木のおもちゃの音(木琴・オカリナ・木のベース・てっきん・ぽこぽこたいこ)でそろえる。
- 曲をきりかえるのは `src/title/title.js` の `musicFor()`。大会の盤はステージの key と同じ名前の曲(ステージのコンセプトに合わせる。ステージを足したら曲も足す)。設定の「おんがく」(ふつう/ちいさめ/けす)は効果音と別。
- 曲を足したら `npm test`(`test/music.test.js` が小節の長さや音の名前を見張る)。
  耳で確かめるときは、スクラッチパッドで OfflineAudioContext に録音して mp3 にし、ユーザーに聞いてもらう。

## キャラクター

- モデルの元は `src/characters.js`。`models/*.glb` は書き出した結果なので、手で編集しない。
  形を変えたら `npm run export:glb` で書き出し直し、glb も一緒にコミットする。
- ノード名・マテリアル名・アニメーション名はゲーム側との約束(README の「glb の約束ごと」)。
  変えるときは README も直す。
- 見た目を変えたら、`viewer.html` をヘッドレス Chromium で撮って目で確かめ、
  スクリーンショットをユーザーに見せる。

## 画面の確認(Playwright)

ヘッドレス Chromium はプリインストール済み。`playwright install` は実行しない。

```js
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'], // WebGL に必須
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
```

`viewer.html` は `window.viewer`(`select` / `setView` / `setClip` / `setExpr` / `setPlayer`)を出している。
確認用のスクリプトはリポジトリに入れず、セッションのスクラッチパッドに置く。
