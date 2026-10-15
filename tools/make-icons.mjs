// アプリのアイコン(金どんぐりメダル)を書き出す。
//
//   node tools/make-icons.mjs
//
// 絵の元はこのファイルの icon() の SVG。ヘッドレス Chromium(Playwright)で PNG にする。
// - icons/icon.svg        … ブラウザのタブ用(角丸)
// - icons/icon-192.png / icon-512.png … ふつうのアイコン(角丸)
// - icons/maskable-512.png … Android 用。端まで空色で、絵は中央の 8 割に収める(端末が好きな形に切りぬく)
// - icons/apple-touch-icon.png(180)… iPhone 用。四角いまま(iPhone が角を丸める)

import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('../icons/', import.meta.url);

// rounded: 角丸にするか / scale: 絵(メダル)の大きさ
function icon({ rounded = true, scale = 1 } = {}) {
  const s = scale;
  const t = (x, y) => `translate(${256 + (x - 256) * s} ${256 + (y - 256) * s}) scale(${s})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fb2ea"/><stop offset="1" stop-color="#cfe8f4"/></linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset=".55" stop-color="#f2b42e"/><stop offset="1" stop-color="#c97a12"/></linearGradient>
    <linearGradient id="face" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1a8"/><stop offset=".6" stop-color="#ffd24a"/><stop offset="1" stop-color="#eaa526"/></linearGradient>
    <linearGradient id="nut" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4b740"/><stop offset="1" stop-color="#c47816"/></linearGradient>
    <linearGradient id="cap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d48a22"/><stop offset="1" stop-color="#9c5c10"/></linearGradient>
    <clipPath id="frame"><rect width="512" height="512" rx="${rounded ? 104 : 0}"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="512" height="512" fill="url(#sky)"/>
    <!-- 雲 -->
    <g fill="#fff" opacity=".85">
      <ellipse cx="70" cy="440" rx="90" ry="46"/><ellipse cx="150" cy="470" rx="80" ry="40"/>
      <ellipse cx="440" cy="452" rx="100" ry="50"/><ellipse cx="360" cy="486" rx="80" ry="36"/>
    </g>
    <g transform="${t(256, 256)}">
      <g transform="translate(-256 -256)">
        <!-- リボン(メダルのうしろから上へ) -->
        <path d="M84 -200 L232 196 L280 196 L148 -200 Z" fill="#d9443a" stroke="#4a2a12" stroke-width="10" stroke-linejoin="round"/>
        <path d="M428 -200 L280 196 L232 196 L364 -200 Z" fill="#3d8bff" stroke="#4a2a12" stroke-width="10" stroke-linejoin="round"/>
        <path d="M116 -200 L250 160" stroke="#fff" stroke-width="10" opacity=".55"/>
        <path d="M396 -200 L262 160" stroke="#fff" stroke-width="10" opacity=".55"/>
        <!-- メダル -->
        <circle cx="256" cy="300" r="152" fill="#8a5410"/>
        <circle cx="256" cy="292" r="152" fill="url(#rim)" stroke="#4a2a12" stroke-width="10"/>
        <circle cx="256" cy="292" r="116" fill="url(#face)" stroke="#b8731a" stroke-width="6"/>
        <!-- ふちのぎざぎざ -->
        <circle cx="256" cy="292" r="134" fill="none" stroke="#fff3b8" stroke-width="5" stroke-dasharray="4 14" opacity=".8"/>
        <!-- どんぐり(浮きぼり) -->
        <g transform="translate(256 300)">
          <ellipse cx="4" cy="22" rx="60" ry="70" fill="#b8731a" opacity=".45"/>
          <ellipse cx="0" cy="16" rx="58" ry="68" fill="url(#nut)" stroke="#7a4610" stroke-width="7"/>
          <ellipse cx="-22" cy="0" rx="12" ry="30" fill="#fff6c8" opacity=".6"/>
          <path d="M-74 -32 A74 46 0 0 1 74 -32 Q0 -2 -74 -32 Z" fill="url(#cap)" stroke="#7a4610" stroke-width="7" stroke-linejoin="round"/>
          <path d="M-50 -46 l8 10 M-24 -56 l6 12 M4 -60 l2 12 M30 -56 l-4 12 M54 -46 l-8 10" stroke="#f6c560" stroke-width="5" stroke-linecap="round" opacity=".7"/>
          <path d="M0 -76 q6 -22 22 -30" fill="none" stroke="#7a4610" stroke-width="9" stroke-linecap="round"/>
        </g>
        <!-- つや -->
        <path d="M150 230 A120 120 0 0 1 250 172" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" opacity=".7"/>
        <!-- きらり -->
        <g fill="#fff">
          <path d="M392 166 l8 22 22 8 -22 8 -8 22 -8 -22 -22 -8 22 -8 z"/>
          <path d="M120 392 l5 14 14 5 -14 5 -5 14 -5 -14 -14 -5 14 -5 z" opacity=".9"/>
        </g>
      </g>
    </g>
  </g>
</svg>`;
}

const { chromium } = await import('playwright').catch(() => import('/opt/node-tools/node_modules/playwright/index.mjs'));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage();
async function png(svg, size, name) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: new URL(name, OUT).pathname, omitBackground: true });
}
mkdirSync(OUT, { recursive: true });
writeFileSync(new URL('icon.svg', OUT), icon());
await png(icon(), 192, 'icon-192.png');
await png(icon(), 512, 'icon-512.png');
await png(icon({ rounded: false, scale: 0.8 }), 512, 'maskable-512.png');
await png(icon({ rounded: false }), 180, 'apple-touch-icon.png');
await browser.close();
console.log('icons/ に書き出しました');
