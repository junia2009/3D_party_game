// あそびかた: 森の 紙芝居。ホーホー先生が 読んで くれる。
//
// 木の 舞台(とびらが ひらく)に 絵の 札を かさねて 入れて おき、「つぎへ」で いまの 札を 横へ ぬく(紙芝居の ぬきかた)。
// 「もどる」は 札を 横から さしこむ。上の しおりで 章へ とぶ。
// 絵は 手描きふうの SVG(水彩の にじみ = 色の かさね + 鉛筆の 線)。重い フィルターは つかわない(スマホで かくつかない ように)。
// キャラは 実物の モデルを 撮った 顔(faces)を シールの ように はる。顔が まだ なければ 色の 丸。

const INK = '#5a3a1e';
const NS = 'http://www.w3.org/2000/svg';

// ── 手描きの 部品 ─────────────────────────────
// 水彩: 塗り + 同じ 色の にじみ(ふちが すこし 濃い) + 鉛筆の 線(すこし ずらして 2回)
const wash = (d, fill, { o = 0.92, line = true, w = 1.6 } = {}) =>
  `<path d="${d}" fill="${fill}" opacity="${o}"/>` +
  `<path d="${d}" fill="none" stroke="${fill}" stroke-width="4" opacity=".45" stroke-linejoin="round"/>` +
  (line ? `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" opacity=".8" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width=".7" opacity=".3" transform="translate(.8 .6)" stroke-linejoin="round"/>` : '');
const ell = (cx, cy, rx, ry) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
const circ = (cx, cy, r) => ell(cx, cy, r, r);
// 文字(絵の 中の 手書きふう)
const txt = (x, y, s, { size = 13, fill = INK, anchor = 'middle', stroke = '', cls = '' } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${fill}" class="${cls}" font-family="Dela Gothic One, sans-serif"${stroke ? ` stroke="${stroke}" stroke-width="4" paint-order="stroke" stroke-linejoin="round"` : ''}>${s}</text>`;
// 空と 地面の 下地
const sky = (top = '#bfe3f2', bot = '#fdf3dc') => `<rect y="-30" width="320" height="260" fill="url(#hwSky)"/><rect y="-30" width="320" height="260" fill="${top}" opacity=".35"/><rect y="120" width="320" height="110" fill="${bot}" opacity=".5"/>`;
const cloud = (x, y, k = 1, cls = 'hw-drift') => `<g transform="translate(${x} ${y}) scale(${k})"><g class="${cls}">${wash('M0 12c-8 0-8-12 2-11c2-8 16-9 18-1c8-3 15 3 11 10c3 6-4 9-9 7c-4 5-17 5-22-5Z', '#ffffff', { o: 0.95, w: 1.2 })}</g></g>`;
const acorn = (x, y, k = 1, cls = '') => `<g transform="translate(${x} ${y}) scale(${k})"><g class="${cls}">${wash(ell(0, 3, 6, 7), '#c27a35', { w: 1.3 })}${wash('M-7 -1a7 5 0 0 1 14 0q-7 4-14 0Z', '#7a4f2c', { w: 1.3 })}<path d="M0 -5v-4" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="-2.5" cy="2" rx="1.4" ry="3" fill="#fff" opacity=".5"/></g></g>`;
// 金の どんぐりメダル
const medal = (x, y, k = 1, cls = '') => `<g transform="translate(${x} ${y}) scale(${k})"><g class="${cls}">
  ${wash('M-9 -30 L-4 -12 L4 -12 L9 -30 Z', '#e8402f', { w: 1.2 })}
  ${wash(circ(0, 0, 15), '#ffd24a', { w: 1.6 })}${wash(circ(0, 0, 11), '#f4b82e', { line: false })}
  <g transform="translate(0 1) scale(1.05)">${acorn(0, 0, 1).replace(/#c27a35/g, '#fff1b8').replace(/#7a4f2c/g, '#d99a1e')}</g>
  <path d="M-8 -8 q3 -4 8 -4" stroke="#fff" stroke-width="2" fill="none" opacity=".7" stroke-linecap="round"/></g></g>`;
// ホーホー先生(絵本の 絵)
const owl = (x, y, k = 1, cls = '') => `<g transform="translate(${x} ${y}) scale(${k})"><g class="${cls}">
  ${wash('M-20 10 C-24 -14 -16 -30 0 -30 C16 -30 24 -14 20 10 C16 26 -16 26 -20 10 Z', '#9a6a3e')}
  ${wash('M-12 6 C-13 -4 -6 -10 0 -10 C6 -10 13 -4 12 6 C10 18 -10 18 -12 6 Z', '#f1dcb2', { w: 1.1 })}
  ${wash('M-18 -26 L-12 -38 L-6 -28 Z', '#9a6a3e', { w: 1.2 })}${wash('M18 -26 L12 -38 L6 -28 Z', '#9a6a3e', { w: 1.2 })}
  ${wash(circ(-8, -18, 7.5), '#fffaf0', { w: 1.2 })}${wash(circ(8, -18, 7.5), '#fffaf0', { w: 1.2 })}
  <g class="hw-blink"><circle cx="-7" cy="-17" r="3.4" fill="${INK}"/><circle cx="9" cy="-17" r="3.4" fill="${INK}"/><circle cx="-6" cy="-18.5" r="1.1" fill="#fff"/><circle cx="10" cy="-18.5" r="1.1" fill="#fff"/></g>
  ${wash('M-3 -11 L3 -11 L0 -6 Z', '#f0a020', { w: 1 })}
  <path d="M-5 2 q2 2 4 0 M1 6 q2 2 4 0 M-4 10 q2 2 4 0" stroke="#b8946a" stroke-width="1.2" fill="none"/>
  ${wash('M-14 -40 h28 l-3 -6 h-22 Z', '#4a3a6a', { w: 1.1 })}${wash('M-6 -46 h12 v-7 h-12 Z', '#4a3a6a', { w: 1.1 })}
  <path d="M6 -50 q8 2 7 9" stroke="#ffd24a" stroke-width="1.6" fill="none"/><circle cx="13" cy="-40" r="2" fill="#ffd24a"/></g></g>`;

// ── 舞台の 絵(1まい = 1 ページ) ─────────────────
// face(key) は キャラの 顔の 絵(dataURL)か null。sticker() は 顔を シールの ように はる
function makeArt(face, isle) {
  const COLORS = { ponta: '#a47b55', mimi: '#f3e8e0', gonzo: '#6e4b36', penne: '#2e3f63', konko: '#f28a3a', kerosuke: '#7cc35a', kirin: '#f9d77c' };
  const sticker = (key, x, y, r = 18, cls = '') => {
    const f = face(key);
    const id = `hwc${Math.random().toString(36).slice(2, 8)}`;
    return `<g class="${cls}" transform="translate(${x} ${y})"><g class="hw-in">
      <circle r="${r + 3.5}" fill="#fff" stroke="${INK}" stroke-width="1.4" opacity=".98"/>
      <clipPath id="${id}"><circle r="${r}"/></clipPath>
      ${f ? `<circle r="${r}" fill="#ffe9c4"/><image href="${f}" x="${-r * 1.2}" y="${-r * 1.15}" width="${r * 2.4}" height="${r * 2.4}" clip-path="url(#${id})"/>` : `<circle r="${r}" fill="${COLORS[key] || '#ccc'}"/>`}
    </g></g>`;
  };
  const finger = (x, y, cls = 'hw-tap') => `<g class="${cls}" transform="translate(${x} ${y})"><g class="hw-in">
    ${wash('M0 0 C-2 -6 -2 -18 0 -26 C1 -31 7 -31 8 -26 L8 -12 C10 -15 16 -14 16 -10 C18 -12 23 -11 23 -7 C25 -8 29 -7 29 -3 L29 8 C29 18 22 26 12 26 C4 26 -2 22 -5 14 L-11 2 C-13 -2 -8 -6 -5 -3 Z', '#ffe1c8', { w: 1.4 })}
    </g></g>`;
  const ripple = (x, y, cls = 'hw-ripple') => `<g transform="translate(${x} ${y})"><circle class="${cls}" r="10" fill="none" stroke="#fff" stroke-width="3"/></g>`;
  const plank = (y, label, ico, i) => `<g class="hw-plank" style="--d:${i * 0.45}s" transform="translate(70 ${y})"><g class="hw-in">
    ${wash('M0 3 Q0 0 4 0 H176 Q180 0 180 4 V24 Q180 28 176 28 H4 Q0 28 0 24 Z', '#c99057', { w: 1.4 })}
    <path d="M10 9 h60 M90 19 h70" stroke="#a06a36" stroke-width="1" opacity=".6"/>
    ${ico}${txt(40, 19, label, { size: 12, fill: '#fff3d2', anchor: 'start', stroke: INK })}</g></g>`;
  const tile = (x, y, fill, label, sub) => `<g transform="translate(${x} ${y})">${wash(ell(0, 0, 24, 13), fill, { w: 1.4 })}${wash(ell(0, -2, 17, 8), '#fff', { o: 0.25, line: false })}${txt(0, 5, label, { size: 12, fill: '#fff', stroke: INK })}${txt(0, 32, sub, { size: 10 })}</g>`;
  const phone = (x, y, inner, k = 1, cls = '') => `<g class="${cls}" transform="translate(${x} ${y}) scale(${k})"><g class="hw-in">${wash('M-30 -52 Q-30 -58 -24 -58 H24 Q30 -58 30 -52 V52 Q30 58 24 58 H-24 Q-30 58 -30 52 Z', '#3a3a4a', { w: 1.5 })}<rect x="-25" y="-50" width="50" height="98" rx="4" fill="#fdf6e6"/>${inner}</g></g>`;
  const islandBase = (cx, cy, rx, ry, top) => wash(`M${cx - rx} ${cy} Q${cx - rx} ${cy + ry * 1.5} ${cx} ${cy + ry * 1.6} Q${cx + rx} ${cy + ry * 1.5} ${cx + rx} ${cy} Z`, '#8a5a32') + wash(ell(cx, cy, rx, ry), top);

  return {
    // 1. ようこそ
    welcome: () => `${sky()}
      <path d="M0 132 Q80 124 160 132 T320 130 V230 H0 Z" fill="#8fcfe6" opacity=".8"/><path d="M0 140 q20 -4 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" class="hw-wave" stroke="#fff" stroke-width="2" fill="none" opacity=".7"/>
      ${cloud(30, 26, 1.1)}${cloud(230, 18, 0.9, 'hw-drift2')}
      ${islandBase(160, 136, 120, 22, '#8ccf5a')}
      ${wash('M150 136 C152 110 148 92 146 80 L170 80 C168 92 166 110 170 136 Z', '#8a5a32')}
      ${wash('M108 84 C96 62 116 34 142 40 C150 20 186 22 192 42 C218 38 232 64 214 84 C206 98 116 98 108 84 Z', '#5aa84a')}
      ${wash('M124 70 C122 58 136 50 146 56', '#7cc35a', { o: 0.6, line: false })}
      ${acorn(132, 74, 0.8, 'hw-swing')}${acorn(190, 70, 0.8, 'hw-swing d2')}${acorn(162, 52, 0.8, 'hw-swing d3')}
      ${owl(232, 112, 0.62, 'hw-sway')}
      ${sticker('ponta', 80, 128, 15, 'hw-hop')}${sticker('mimi', 112, 140, 15, 'hw-hop d2')}${sticker('konko', 200, 142, 15, 'hw-hop d3')}
      ${txt(160, 186, 'どんぐりの 島', { size: 15, fill: '#fff8e6', stroke: INK })}`,
    // 2. メニュー
    menu: () => `${sky('#f6e6c0', '#f6e6c0')}
      ${plank(14, 'すごろく', `<g transform="translate(20 14)">${wash('M-8 -8 h16 v16 h-16 Z', '#fffaf0', { w: 1.2 })}<circle cx="-3" cy="-3" r="2" fill="#d9443a"/><circle cx="3" cy="3" r="2" fill="${INK}"/></g>`, 0)}
      ${plank(48, 'ミニゲーム', `<g transform="translate(20 14)">${acorn(0, 0, 1)}</g>`, 1)}
      ${plank(82, 'オンライン', `<g transform="translate(20 14)">${wash(circ(0, 0, 9), '#7cc7e6', { w: 1.2 })}<path d="M-6 -2 c3 2 5 -1 7 1 s2 4 5 3" stroke="#4f9a3c" stroke-width="2" fill="none"/></g>`, 2)}
      ${plank(116, 'キャラ図鑑', `<g transform="translate(20 14)">${wash('M-9 -6 q4 -2 9 1 v14 q-5 -3 -9 -1 Z', '#fffaf0', { w: 1.1 })}${wash('M9 -6 q-4 -2 -9 1 v14 q5 -3 9 -1 Z', '#ffe7b0', { w: 1.1 })}</g>`, 3)}
      ${plank(150, 'せってい', `<g transform="translate(20 14)">${wash(circ(0, 0, 8), '#c9cfd6', { w: 1.2 })}${wash(circ(0, 0, 3), '#fffaf0', { w: 1 })}</g>`, 4)}
      ${finger(262, 40, 'hw-point')}`,
    // 3. めあて
    goal: () => `${sky('#fff0c8', '#f7e3b2')}
      <g transform="translate(160 78)"><g class="hw-spin">${Array.from({ length: 12 }, (_, i) => `<path d="M0 0 L${(Math.cos((i / 12) * Math.PI * 2) * 140).toFixed(1)} ${(Math.sin((i / 12) * Math.PI * 2) * 140).toFixed(1)} L${(Math.cos(((i + 0.4) / 12) * Math.PI * 2) * 140).toFixed(1)} ${(Math.sin(((i + 0.4) / 12) * Math.PI * 2) * 140).toFixed(1)} Z" fill="#ffd24a" opacity=".22"/>`).join('')}</g></g>
      ${wash('M96 170 h40 v-34 h48 v34 h40 v-22 h-40 M136 170 h-40 v-14 h40', '#c99057', { w: 1.4 })}
      ${wash('M136 136 h48 v34 h-48 Z', '#e0b070')}${wash('M96 150 h40 v20 h-40 Z', '#d6a464')}${wash('M184 156 h40 v14 h-40 Z', '#d6a464')}
      ${txt(160, 160, '1', { size: 16, fill: '#fff', stroke: INK })}${txt(116, 166, '2', { size: 12, fill: '#fff', stroke: INK })}${txt(204, 168, '3', { size: 11, fill: '#fff', stroke: INK })}
      ${sticker('kerosuke', 160, 116, 17, 'hw-hop')}${sticker('gonzo', 116, 132, 13)}${sticker('penne', 204, 138, 12)}
      ${medal(160, 54, 1.25, 'hw-bob')}
      <g class="hw-twinkle">${['M100 40', 'M222 30', 'M236 84', 'M86 92'].map((m) => `<path d="${m} l3 -8 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 Z" fill="#fff" stroke="#f4b82e" stroke-width="1"/>`).join('')}</g>`,
    // 4. サイコロ
    dice: () => `${sky('#d8eef6')}
      ${cloud(40, 20, 0.8)}${cloud(250, 34, 0.7, 'hw-drift2')}
      <g transform="translate(150 92)"><g class="hw-float">
        ${wash('M-34 -18 C-34 -44 34 -44 34 -18 C30 -10 -30 -10 -34 -18 Z', '#7a4f2c')}
        ${wash('M-30 -14 C-30 30 30 30 30 -14 Z', '#e0a052')}
        <path d="M0 -40 v-10" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
        <g class="hw-roll">${[7, 3, 10, 5, 1, 8].map((n, i) => `<text class="n" style="--i:${i}" y="16" font-size="30" text-anchor="middle" fill="#fff" stroke="${INK}" stroke-width="5" paint-order="stroke" font-family="Dela Gothic One, sans-serif">${n}</text>`).join('')}</g>
      </g></g>
      ${txt(150, 154, '1 〜 10', { size: 14, fill: '#fff', stroke: INK })}
      ${ripple(232, 120)}${finger(238, 126)}
      ${sticker('mimi', 60, 150, 16, 'hw-hop')}`,
    // 5. マス
    squares: () => `${sky('#e6f2dc', '#e9dfb8')}
      <path d="M20 100 Q90 80 160 100 T300 100" stroke="#c9a46a" stroke-width="26" fill="none" opacity=".5" stroke-linecap="round"/>
      ${tile(40, 96, '#4a90e2', '+3', '青')}${tile(100, 92, '#e2574a', '−3', '赤')}${tile(160, 100, '#4fae5a', '?', 'どうぐ')}${tile(220, 104, '#9b6bd6', '!', 'ハプニング')}${tile(280, 98, '#f08a2a', 'VS', '対決')}
      ${sticker('konko', 40, 70, 13, 'hw-walk')}
      ${txt(160, 182, 'とまった マスで いろいろ おきる', { size: 11 })}`,
    // 6. 先生と メダル
    teacher: () => `${sky('#fdf0d4', '#efe0b8')}
      ${wash(ell(212, 168, 60, 10), '#c9a46a', { o: 0.5, line: false })}
      ${owl(212, 128, 1.15, 'hw-sway')}
      ${medal(254, 104, 0.8, 'hw-bob')}
      ${sticker('ponta', 64, 132, 20)}
      <g transform="translate(64 112)">${Array.from({ length: 6 }, (_, i) => `<g class="hw-toss" style="--i:${i}"><g class="hw-in">${acorn(0, 0, 0.8)}</g></g>`).join('')}</g>
      ${txt(112, 60, 'どんぐり 20こ', { size: 14, fill: '#fff', stroke: INK })}
      ${txt(212, 192, 'メダル 1つ', { size: 12 })}`,
    // 7. お店と どうぐ
    shop: () => `${sky('#e6f2dc', '#efe0b8')}
      ${wash('M40 70 h240 v100 h-240 Z', '#d6a464')}
      ${wash('M30 70 L50 30 H270 L290 70 Z', '#e8402f')}
      ${Array.from({ length: 6 }, (_, i) => wash(`M${50 + i * 40} 30 L${50 + i * 40 + 20} 30 L${50 + i * 40 + 13} 70 L${50 + i * 40 - 7} 70 Z`, '#fff3d2', { line: false, o: 0.9 })).join('')}
      <path d="M30 70 L50 30 H270 L290 70 Z" fill="none" stroke="${INK}" stroke-width="1.6"/>
      ${wash('M50 120 h220 v8 h-220 Z', '#8a5a32')}
      <g transform="translate(80 104)"><g class="hw-item" style="--i:0">${wash('M-10 -10 h14 v14 h-14 Z', '#fffaf0', { w: 1.2 })}${wash('M-2 -4 h14 v14 h-14 Z', '#fffaf0', { w: 1.2 })}<circle cx="5" cy="3" r="2" fill="${INK}"/></g></g>
      <g transform="translate(132 104)"><g class="hw-item" style="--i:1">${[-9, 0, 9].map((x) => wash(`M${x - 6} -6 h12 v12 h-12 Z`, '#fff3c0', { w: 1.1 })).join('')}</g></g>
      <g transform="translate(186 104)"><g class="hw-item" style="--i:2">${wash('M-12 6 C-12 -10 4 -16 12 -12 C12 0 2 10 -12 6 Z', '#7cc35a', { w: 1.2 })}<path d="M-10 4 L8 -10" stroke="${INK}" stroke-width="1"/></g></g>
      <g transform="translate(238 104)"><g class="hw-item" style="--i:3">${wash('M-12 -4 h18 a6 6 0 0 1 0 10 h-18 Z', '#ffd24a', { w: 1.2 })}<circle cx="-6" cy="1" r="2" fill="${INK}"/></g></g>
      ${txt(80, 146, '5', { size: 11, fill: '#fff', stroke: INK })}${txt(132, 146, '10', { size: 11, fill: '#fff', stroke: INK })}${txt(186, 146, '10', { size: 11, fill: '#fff', stroke: INK })}${txt(238, 146, '20', { size: 11, fill: '#fff', stroke: INK })}
      ${sticker('kirin', 290, 160, 16, 'hw-hop')}`,
    // 8. 競技
    race: () => `${sky('#d8eef6', '#cfe8a8')}
      <path d="M0 150 Q160 120 320 150 V230 H0 Z" fill="#8ccf5a" opacity=".7"/>
      <path d="M-10 168 Q160 136 330 168" stroke="#e8d2a0" stroke-width="22" fill="none" opacity=".9"/>
      ${wash('M268 100 v58', '#8a5a32', { w: 2 })}${wash('M268 100 h28 l-6 9 l6 9 h-28 Z', '#fffaf0', { w: 1.3 })}
      ${sticker('gonzo', 70, 146, 15, 'hw-run')}${sticker('penne', 130, 140, 15, 'hw-run d2')}${sticker('kerosuke', 190, 142, 15, 'hw-run d3')}
      <g class="hw-dust">${[56, 116, 176].map((x) => `<circle cx="${x - 22}" cy="160" r="5" fill="#fff" opacity=".7"/>`).join('')}</g>
      ${acorn(60, 54, 1.1, 'hw-bob')}${acorn(90, 46, 0.9, 'hw-bob d2')}${acorn(120, 56, 1, 'hw-bob d3')}
      ${txt(220, 60, 'じゅんいで どんぐり', { size: 13, fill: '#fff', stroke: INK })}`,
    // 9. ステージの しかけ(島の 絵は ステージえらびと 同じもの。HTML で ならべる)
    stages: () => null,
    // 10. ラストスパートと 表彰
    finale: () => `${sky('#2e3f63', '#4a3a6a')}<rect y="-30" width="320" height="260" fill="#3a2a5a" opacity=".55"/>
      <g class="hw-confetti">${Array.from({ length: 22 }, (_, i) => `<rect class="c" style="--i:${i}" x="${(i * 47) % 320}" y="-30" width="6" height="9" fill="${['#ffd24a', '#e8402f', '#7cc35a', '#4a90e2', '#fff'][i % 5]}"/>`).join('')}</g>
      ${txt(160, 40, 'のこり 3ターン!', { size: 18, fill: '#ffd24a', stroke: INK, cls: 'hw-pulse' })}
      ${txt(160, 64, '青・赤マスが 2ばい', { size: 12, fill: '#fff', stroke: INK })}
      ${medal(110, 120, 0.85, 'hw-bob')}${medal(160, 112, 0.85, 'hw-bob d2')}${medal(210, 120, 0.85, 'hw-bob d3')}
      ${txt(160, 168, 'さいごに ボーナスメダル 3つ', { size: 12, fill: '#fff', stroke: INK })}`,
    // 11. 競技の 前の せつめい
    howto: () => `${sky('#e6f2dc')}
      ${phone(110, 104, `<rect x="-25" y="-50" width="50" height="98" rx="4" fill="#9fd4ea"/><path d="M-25 20 h50 v28 h-50 Z" fill="#8ccf5a"/>${wash('M-20 -18 h40 v30 h-40 Z', '#fffaf0', { w: 1 })}<path d="M-14 -10 h28 M-14 -3 h20 M-14 4 h24" stroke="${INK}" stroke-width="2" opacity=".6"/>`, 1.25, 'hw-tilt')}
      ${txt(222, 90, 'はじまる 前に', { size: 13 })}${txt(222, 112, 'そうさの せつめい', { size: 13 })}
      ${sticker('mimi', 220, 152, 16, 'hw-hop')}`,
    // 12. そうさ いろいろ
    controls: () => `${sky('#fdf0d4', '#efe0b8')}
      ${[['スティック', 0], ['タップ', 1], ['スワイプ', 2], ['ふる・かたむける', 3]].map(([l, i]) => {
        const x = 42 + i * 79;
        const inner = [
          `<circle cx="0" cy="0" r="18" fill="none" stroke="${INK}" stroke-width="1.4" opacity=".5"/><g class="hw-stick"><circle r="8" fill="#ffd24a" stroke="${INK}" stroke-width="1.4"/></g>`,
          `<circle class="hw-ripple" r="8" fill="none" stroke="#4a90e2" stroke-width="3"/><circle r="4" fill="#4a90e2"/>`,
          `<path class="hw-swipe" d="M-16 10 L14 -10" stroke="#e8402f" stroke-width="4" stroke-linecap="round" stroke-dasharray="40"/><path d="M14 -10 l-8 1 m8 -1 l-2 7" stroke="#e8402f" stroke-width="3" stroke-linecap="round"/>`,
          `<g class="hw-shake">${wash('M-9 -16 h18 v32 h-18 Z', '#3a3a4a', { w: 1.2 })}<rect x="-6" y="-12" width="12" height="22" fill="#fdf6e6"/></g>`,
        ][i];
        return `<g transform="translate(${x} 90)">${wash('M-34 -40 h68 v86 h-68 Z', '#fffaf0', { w: 1.3 })}<g transform="translate(0 -6)">${inner}</g>${txt(0, 36, l, { size: i === 3 ? 8.5 : 10 })}</g>`;
      }).join('')}
      ${txt(160, 178, '競技に よって ちがうよ', { size: 12 })}`,
    // 13. ミニゲームだけで あそぶ
    games: () => `${sky('#e6f2dc', '#efe0b8')}
      ${Array.from({ length: 12 }, (_, i) => {
        const x = 50 + (i % 4) * 56, y = 34 + Math.floor(i / 4) * 46;
        const c = ['#4a90e2', '#e2574a', '#4fae5a', '#f08a2a', '#9b6bd6', '#ffc23c'][i % 6];
        return `<g transform="translate(${x} ${y})"><g class="hw-card" style="--i:${i}">${wash('M-22 -16 h44 v34 h-44 Z', '#fffaf0', { w: 1.2 })}${wash('M-18 -12 h36 v18 h-36 Z', c, { line: false, o: 0.8 })}<path d="M-14 12 h22" stroke="${INK}" stroke-width="2" opacity=".5"/></g></g>`;
      }).join('')}
      ${finger(222, 110, 'hw-point')}
      ${txt(160, 186, 'すきな 競技を えらんで あそぶ', { size: 12 })}`,
    // 14. 部屋を つくる
    room: () => `${sky('#d8eef6')}
      ${phone(92, 100, `${txt(0, -26, 'あいことば', { size: 8 })}${wash('M-21 -16 h42 v22 h-42 Z', '#fff3c0', { w: 1 })}${txt(0, 1, '3815', { size: 14, fill: INK })}${wash('M-18 18 h36 v14 h-36 Z', '#4fae5a', { w: 1 })}${txt(0, 28, 'リンク', { size: 7, fill: '#fff' })}`, 1.2)}
      <path class="hw-send" d="M140 96 q40 -30 80 0" stroke="#e8402f" stroke-width="3" fill="none" stroke-dasharray="6 6" stroke-linecap="round"/>
      ${phone(250, 104, `${sticker('konko', 0, -10, 14)}${txt(0, 30, 'とどいた!', { size: 8 })}`, 1)}
      ${sticker('ponta', 40, 160, 14, 'hw-hop')}`,
    // 15. 入る
    join: () => `${sky('#d8eef6')}
      ${phone(90, 100, `${wash('M-21 -40 h42 v18 h-42 Z', '#fff3c0', { w: 1 })}<text x="0" y="-26" font-size="12" text-anchor="middle" fill="${INK}" font-family="Dela Gothic One, sans-serif" class="hw-type">3815</text>
        ${Array.from({ length: 9 }, (_, i) => `<rect x="${-19 + (i % 3) * 13}" y="${-14 + Math.floor(i / 3) * 13}" width="11" height="11" rx="2" fill="#fff" stroke="${INK}" stroke-width=".8"/>`).join('')}`, 1.2)}
      ${finger(100, 96, 'hw-press')}
      ${txt(222, 64, 'あいことばで 入る', { size: 12 })}
      <g transform="translate(222 120)">${wash(circ(0, 0, 26), '#7cc7e6')}<path d="M-18 -6 c8 4 12 -4 18 0 s6 10 14 8 M-14 12 c6 -2 10 4 16 1" fill="none" stroke="#4f9a3c" stroke-width="5" stroke-linecap="round"/></g>
      ${txt(222, 168, 'だれとでも', { size: 12 })}`,
    // 16. 部屋の 中
    seats: () => `${sky('#fdf0d4', '#efe0b8')}
      ${[['ponta', 'あなた'], ['mimi', 'ともだち'], ['gonzo', 'ともだち'], [null, 'CPU'], [null, 'CPU']].map(([k, l], i) => {
        const x = 40 + i * 60;
        return `<g transform="translate(${x} 96)">${wash('M-26 -40 h52 v84 h-52 Z', '#fffaf0', { w: 1.3 })}
          ${k ? sticker(k, 0, -8, 17, i === 0 ? 'hw-hop' : '') : `<g transform="translate(0 -8)">${wash(circ(0, 0, 17), '#c9cfd6', { w: 1.2 })}${txt(0, 5, 'CPU', { size: 10 })}</g>`}
          ${txt(0, 26, l, { size: 9 })}${i < 3 ? txt(0, 39, `${[2, 1, 0][i]}勝`, { size: 9, fill: '#e8402f' }) : ''}
          ${i === 0 ? `<g transform="translate(0 -40)">${wash('M-10 4 L-10 -6 L-5 0 L0 -8 L5 0 L10 -6 L10 4 Z', '#ffd24a', { w: 1.1 })}</g>` : ''}</g>`;
      }).join('')}
      ${txt(160, 168, 'さいしょの 人が えらんで はじめる', { size: 11 })}${txt(160, 186, 'あいた 席は CPU', { size: 11 })}`,
    // 17. さあ あそぼう
    end: () => `${sky('#fff0c8', '#f7e3b2')}
      <g class="hw-confetti">${Array.from({ length: 18 }, (_, i) => `<rect class="c" style="--i:${i}" x="${(i * 53) % 320}" y="-30" width="6" height="9" fill="${['#ffd24a', '#e8402f', '#7cc35a', '#4a90e2'][i % 4]}"/>`).join('')}</g>
      ${owl(160, 92, 1.05, 'hw-sway')}
      ${['ponta', 'mimi', 'gonzo', 'penne', 'konko', 'kerosuke', 'kirin'].map((k, i) => sticker(k, 40 + i * 40, 160 - (i % 2) * 8, 14, `hw-hop d${(i % 3) + 1}`)).join('')}
      ${txt(160, 30, 'さあ、あそぼう!', { size: 20, fill: '#fff', stroke: INK, cls: 'hw-pulse' })}`,
  };
}

// ── ページ ─────────────────────────────────
// art: 絵の 名前。say: 先生の ことば(<b> は 強め)
export const CHAPTERS = [
  { key: 'about', name: 'このゲーム', pages: [
    { art: 'welcome', title: 'ようこそ!', say: 'ここは <b>どんぐりの 島</b>。森の なかまたちと、みんなで あそぶ パーティーゲームじゃよ。わしは ホーホー先生。あそびかたを おしえよう!' },
    { art: 'menu', title: 'メニュー', say: '<b>すごろく</b>は みんなで どんぐりを 集める 大会、<b>ミニゲーム</b>は 競技を 1つ えらんで あそぶ。<b>オンライン</b>は はなれた 友だちと。<b>キャラ図鑑</b>で なかまを 見て、<b>せってい</b>で 音を かえられるぞ。' },
  ] },
  { key: 'taikai', name: 'すごろく', pages: [
    { art: 'goal', title: '大会の めあて', say: '5人で 盤を まわって、<b>金どんぐりメダル</b>を 集める。いちばん 多い 子が 優勝じゃ。おなじ 数なら、どんぐりの 多い 子の 勝ち。' },
    { art: 'dice', title: 'サイコロ', say: '自分の 番が きたら <b>どんぐりサイコロ</b>(1〜10)。くるくる 回る 数字を <b>タップで とめよう</b>。出た 数だけ 進むぞ。' },
    { art: 'squares', title: 'マス', say: '<b>青</b>は どんぐり +3、<b>赤</b>は −3。<b>緑</b>で どうぐが もらえて、<b>むらさき</b>は ハプニング。<b>だいだい</b>は 対決で、だれか 1人と どんぐりを かけて 1対1 の 勝負じゃ。' },
    { art: 'teacher', title: '先生と メダル', say: 'わしの ところへ 来たら、<b>どんぐり 20こ</b>で メダルと こうかん。<b>通りすぎる ときも</b> よれるぞ。メダルを わたしたら、わしは べつの 場所へ とんでいく。' },
    { art: 'shop', title: 'お店と どうぐ', say: 'お店では どうぐが 買える。どうぐは <b>3つまで</b>。サイコロの 前に つかうんじゃ。<b>ふたつサイコロ</b>・<b>みっつサイコロ</b>・<b>いれかえの葉っぱ</b>(だれかと 場所を 入れかえ)・<b>先生の笛</b>(わしを 呼ぶ)。' },
    { art: 'race', title: '競技', say: 'みんなが 1回ずつ 動いたら <b>競技</b>(ミニゲーム)の 時間。<b>じゅんい</b>で どんぐりが もらえるぞ。' },
    { art: 'stages', title: 'ステージの しかけ', say: '<b>四季の森</b>は 近道・すべり台・つるつる氷。<b>どんぐり遊園地</b>は 乗り物で 大移動。<b>海の中の 探検</b>は 海流・宝箱・クジラの せなか。ステージごとに しかけが ちがうぞ。' },
    { art: 'finale', title: 'さいごの もりあがり', say: '<b>のこり 3ターン</b>は ラストスパート。青と 赤の マスが <b>2ばい</b>に なる! さいごに <b>ボーナスメダル</b>が 3つ くばられて、表彰台で 優勝が きまる。' },
  ] },
  { key: 'mini', name: 'ミニゲーム', pages: [
    { art: 'howto', title: 'はじまる 前に', say: '競技は 28しゅるい。どれも <b>はじまる 前に そうさの せつめい</b>が 出るから、あわてなくて だいじょうぶ。' },
    { art: 'controls', title: 'そうさ いろいろ', say: '画面の どこでも 指を おいて 動かす <b>スティック</b>、<b>タップ</b>、<b>スワイプ</b>や はじく、スマホを <b>ふる・かたむける</b>…。競技に よって いろいろじゃ。' },
    { art: 'games', title: 'ミニゲームだけで', say: 'メニューの <b>ミニゲーム</b>から、すきな 競技を えらんで、すきな キャラで あそべるぞ。' },
  ] },
  { key: 'online', name: 'オンライン', pages: [
    { art: 'room', title: '部屋を つくる', say: 'オンラインで <b>部屋を つくる</b>と、4けたの <b>あいことば</b>が 出る。友だちに おしえるか、<b>リンクを おくる</b>で LINE などへ。' },
    { art: 'join', title: '部屋に 入る', say: '友だちは <b>あいことばで 入る</b>。<b>だれとでも</b>なら、あいて いる 部屋を さがして 入れるぞ。' },
    { art: 'seats', title: '部屋の 中', say: '席は 5つ。<b>さいしょに 入った 人</b>が あそびを えらんで はじめる。あいた 席は CPU。名簿には、だれが <b>何回 勝ったか</b>が 出るぞ。' },
    { art: 'end', title: 'さあ、あそぼう!', say: 'これで おしまい。わからなく なったら、メニューの <b>あそびかた</b>で いつでも 見られるぞ。さあ、あそぼう!' },
  ] },
];
export const PAGES = CHAPTERS.flatMap((c, ci) => c.pages.map((p) => ({ ...p, chapter: ci })));

// ── 画面 ───────────────────────────────────
// el: #howto。face(key): キャラの 顔。isle(key): ステージの 島の 絵(SVG 文字列)。
// sfx: { page(), tap() }。onDone(): さいごの「あそぼう」
export function createHowto({ el, face, isle, sfx, onDone }) {
  const win = el.querySelector('.kamiwin');
  const tabs = el.querySelector('.kamitabs');
  const say = el.querySelector('.kamisay p');
  const title = el.querySelector('.kamisay b');
  const dots = el.querySelector('.kamidots');
  const prev = el.querySelector('.kamiprev');
  const next = el.querySelector('.kaminext');
  let at = 0, busy = false, art = makeArt(face, isle);

  // 共有の 下地(空の グラデーション)。札ごとに 同じ id を 書かない ように 1つだけ
  const defs = document.createElementNS(NS, 'svg');
  defs.setAttribute('width', '0');
  defs.setAttribute('height', '0');
  defs.style.position = 'absolute';
  defs.innerHTML = '<defs><linearGradient id="hwSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe9f3"/><stop offset=".6" stop-color="#fdf6e6"/><stop offset="1" stop-color="#f3e3bd"/></linearGradient></defs>';
  el.append(defs);

  tabs.replaceChildren(...CHAPTERS.map((c, ci) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = c.name;
    b.addEventListener('click', () => { const i = PAGES.findIndex((p) => p.chapter === ci); if (i !== at) show(i, i > at ? 1 : -1); });
    return b;
  }));
  dots.replaceChildren(...PAGES.map(() => document.createElement('i')));

  function cardFor(i) {
    const p = PAGES[i];
    const card = document.createElement('div');
    card.className = 'kami';
    card.dataset.i = String(i);
    if (p.art === 'stages') {
      // 島の 絵の id は ステージえらびの 地図と おなじ なので、札の 中だけの 名前に かえる(かくれた 地図の ほうを さして しまわない ように)
      const own = (svg, k) => svg.replace(/id="([^"]+)"/g, `id="$1-hw${k}"`).replace(/url\(#([^)]+)\)/g, `url(#$1-hw${k})`);
      card.innerHTML = `<div class="kamiisles">${['shiki', 'yuen', 'umi'].map((k, j) => `<div class="hw-isle" style="--i:${j}">${own(isle(k), k)}<span>${['四季の森', 'どんぐり遊園地', '海の中の 探検'][j]}</span></div>`).join('')}</div>`;
    } else {
      card.innerHTML = `<svg viewBox="0 -20 320 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${art[p.art]()}</svg>`;
    }
    card.insertAdjacentHTML('beforeend', `<span class="kaminum">${i + 1}</span>`);
    return card;
  }

  function label() {
    const p = PAGES[at];
    title.textContent = p.title;
    say.innerHTML = p.say;
    say.parentElement.classList.remove('talk');
    void say.offsetWidth;
    say.parentElement.classList.add('talk');
    [...tabs.children].forEach((b, ci) => b.classList.toggle('on', ci === p.chapter));
    [...dots.children].forEach((d, i) => { d.classList.toggle('on', i === at); d.classList.toggle('ch', i > 0 && PAGES[i - 1].chapter !== PAGES[i].chapter); });
    prev.disabled = at === 0;
    const last = at === PAGES.length - 1;
    next.querySelector('b').textContent = last ? 'あそぼう!' : 'つぎへ';
    next.classList.toggle('last', last);
  }

  // dir 1: いまの 札を 右へ ぬく(下に 次の 札)。-1: 前の 札を 右から さしこむ
  function show(i, dir) {
    if (busy) return;
    const old = win.querySelector('.kami.now');
    const card = cardFor(i);
    at = i;
    label();
    sfx.page();
    if (!old || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      old?.remove();
      card.classList.add('now');
      win.append(card);
      return;
    }
    busy = true;
    const done = () => { busy = false; };
    if (dir > 0) {
      win.prepend(card);
      card.classList.add('now');
      old.classList.remove('now');
      old.classList.add('pull');
      old.addEventListener('animationend', () => { old.remove(); done(); }, { once: true });
    } else {
      card.classList.add('push', 'now');
      win.append(card);
      old.classList.remove('now');
      card.addEventListener('animationend', () => { old.remove(); card.classList.remove('push'); done(); }, { once: true });
    }
    setTimeout(() => { if (busy) { win.querySelectorAll('.kami:not(.now)').forEach((c) => c.remove()); card.classList.remove('push'); done(); } }, 900);
  }

  prev.addEventListener('click', () => { sfx.tap(); if (at > 0) show(at - 1, -1); });
  next.addEventListener('click', () => {
    sfx.tap();
    if (at < PAGES.length - 1) show(at + 1, 1);
    else onDone();
  });
  // 札を 横に はらっても めくれる
  let sx = null;
  win.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  win.addEventListener('pointerup', (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx;
    sx = null;
    if (dx < -40 && at < PAGES.length - 1) { sfx.tap(); show(at + 1, 1); }
    else if (dx > 40 && at > 0) { sfx.tap(); show(at - 1, -1); }
  });

  return {
    // i ページ目を すぐ 出す(E2E 用)
    jump(i) {
      win.replaceChildren();
      at = i;
      const card = cardFor(at);
      card.classList.add('now');
      win.append(card);
      label();
    },
    // chapter の はじめから(とびらが ひらく)
    open(chapter = 0) {
      win.replaceChildren();
      at = PAGES.findIndex((p) => p.chapter === chapter);
      const card = cardFor(at);
      card.classList.add('now');
      win.append(card);
      label();
      el.classList.remove('opened');
      void el.offsetWidth;
      el.classList.add('opened');
    },
    // 顔の 絵が とどいたら 描きなおす(いまの 札だけ)
    refresh() {
      art = makeArt(face, isle);
      const old = win.querySelector('.kami.now');
      if (!old || busy) return;
      const card = cardFor(at);
      card.classList.add('now', 'quiet');
      old.replaceWith(card);
    },
  };
}
