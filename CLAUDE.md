# CLAUDE.md — 開発作業ガイド

全体像は [README.md](README.md)。

## いちばん大事なこと: ユーザーとのやりとりは必ず日本語

- **返答・質問・進捗の報告・作業中のひとことは、すべて日本語で書く。** 英語は一文も混ぜない。
  ユーザーは英語が読めない。英語で書くと、質問しても答えてもらえず、報告も伝わらない。
- 長い作業の途中や、作業のあとの報告で英語に戻りやすい。送る前に読み返して確かめる。
- 例外はコードの識別子・コマンド・ファイル名だけ。

## 慣習

- **push は常に `main` へ。** 作業ブランチは作らない。
- UI 文言・コードコメント・コミットメッセージは日本語。
- ビルド工程はない。ブラウザは ES Modules を直接読む(Three.js は `vendor/` + importmap)。
  `vendor/` の Three.js と `package.json` の `three` は同じ版にそろえる。

## ミニゲーム

- 1本ごとに `src/games/<名前>/` を作る。`rules.js`(ルール)と `cpu.js`(CPU)は
  **THREE にも DOM にも触らない**。あとでサーバーでも同じものを回すため。
  画面は `game.js` が持ち、state を書きかえるのは `rules.step` だけにする。
- 時間は固定の刻み(`STEP`)で進める。乱数は `src/rng.js` を通す(`Math.random()` は演出だけ)。
- ルールを変えたら `npm test`。新しいルールにはテストを足す。
  CPU どうしで何百回も回すテストが、決着すること・偏りすぎないことを見張っている。
- 仕様は `docs/minigames/<名前>.md`。ルールを変えたら仕様も直す。

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
