# CLAUDE.md — 開発作業ガイド

全体像は [README.md](README.md)。

## 慣習

- **push は常に `main` へ。** 作業ブランチは作らない。
- UI 文言・コードコメント・コミットメッセージは日本語。
- ビルド工程はない。ブラウザは ES Modules を直接読む(Three.js は `vendor/` + importmap)。
  `vendor/` の Three.js と `package.json` の `three` は同じ版にそろえる。

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
