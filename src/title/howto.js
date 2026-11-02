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
// face(key) は キャラの 顔の 絵(dataURL)か null。sticker() は 顔を シールの ように はる。
// 絵は viewBox 0 -20 320 240(4:3。16:10 の 札では 上下が すこし 切れる)。主役は まん中 0〜200 に おく
// 色の にじみ用の 乱数(演出だけ。ページごとに 同じ 絵に なるよう 固定の たね)
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// 丸い 木(幹 + もこもこの 葉)
const tree = (x, y, k = 1, leaf = '#6cb85a', o = 1, cls = '') => `<g transform="translate(${x} ${y}) scale(${k})" opacity="${o}"><g class="${cls}">
  ${wash('M-4 0 C-3 -10 -3 -18 -2 -24 L2 -24 C3 -18 3 -10 4 0 Z', '#8a5a32', { w: 1.2 })}
  ${wash('M-18 -24 C-26 -34 -18 -50 -6 -46 C-2 -58 16 -56 16 -44 C28 -44 28 -26 16 -22 C8 -16 -10 -16 -18 -24 Z', leaf, { w: 1.3 })}
  <path d="M-10 -38 q6 -6 12 -2" stroke="#fff" stroke-width="2" fill="none" opacity=".35" stroke-linecap="round"/></g></g>`;
// 針葉の 木(とおくの 森)
const pine = (x, y, k = 1, c = '#5a9a5a', o = 0.7) => `<g transform="translate(${x} ${y}) scale(${k})" opacity="${o}">${wash('M0 -40 L12 -14 L6 -14 L16 0 L-16 0 L-6 -14 L-12 -14 Z', c, { w: 1, line: true })}</g>`;
// 草むら・花
const tuft = (x, y, k = 1, c = '#5aa84a') => `<path transform="translate(${x} ${y}) scale(${k})" d="M-6 0 Q-5 -7 -8 -11 Q-2 -6 -1 0 Q0 -9 2 -13 Q3 -5 3 0 Q5 -6 9 -9 Q6 -3 6 0 Z" fill="${c}" stroke="${INK}" stroke-width=".8" stroke-opacity=".5"/>`;
const flower = (x, y, c = '#ff8aa8', k = 1) => `<g transform="translate(${x} ${y}) scale(${k})"><path d="M0 0 v8" stroke="#4f9a3c" stroke-width="1.2"/>${[0, 72, 144, 216, 288].map((a) => `<circle cx="${(Math.cos((a * Math.PI) / 180) * 3).toFixed(1)}" cy="${(Math.sin((a * Math.PI) / 180) * 3).toFixed(1)}" r="2.4" fill="${c}"/>`).join('')}<circle r="1.6" fill="#ffd24a"/></g>`;
// 森の 原っぱ(遠くの 丘 → 森 → 手前の 草)。h は 地面の 高さ
function meadow({ h = 140, seed = 1, far = '#cfe6b0', near = '#a8d880', flowers = true, trees = true } = {}) {
  const r = seeded(seed);
  let s = `<path d="M-10 ${h - 22} Q50 ${h - 44} 110 ${h - 26} T230 ${h - 30} T340 ${h - 26} V240 H-10 Z" fill="${far}" opacity=".85"/>`;
  if (trees) {
    for (const x of [8, 34, 62, 258, 286, 312]) s += pine(x + r() * 8, h - 18 - r() * 10, 0.6 + r() * 0.3, '#7ab070', 0.6);
  }
  s += `<path d="M-10 ${h} Q70 ${h - 16} 160 ${h - 4} T340 ${h - 6} V240 H-10 Z" fill="${near}"/>`;
  s += `<path d="M-10 ${h} Q70 ${h - 16} 160 ${h - 4} T340 ${h - 6}" fill="none" stroke="${INK}" stroke-width="1" opacity=".35"/>`;
  for (let i = 0; i < 14; i++) s += tuft(r() * 320, h + 8 + r() * 70, 0.8 + r() * 0.6, i % 2 ? '#5aa84a' : '#6cbf58');
  if (flowers) for (let i = 0; i < 9; i++) s += flower(r() * 320, h + 12 + r() * 64, ['#ff8aa8', '#fff', '#ffd24a', '#b48aff'][i % 4], 0.8 + r() * 0.4);
  return s;
}
// 光の つぶ(きらきら)
const sparkle = (x, y, k = 1, c = '#fff') => `<path transform="translate(${x} ${y}) scale(${k})" d="M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2 Z" fill="${c}" stroke="#f4b82e" stroke-width=".8"/>`;

function makeArt(face, isle) {
  const COLORS = { ponta: '#a47b55', mimi: '#f3e8e0', gonzo: '#6e4b36', penne: '#2e3f63', konko: '#f28a3a', kerosuke: '#7cc35a', kirin: '#f9d77c' };
  let uid = 0;
  // キャラの シール: 白い ふち + 影(紙に はった ように)
  const sticker = (key, x, y, r = 18, cls = '') => {
    const f = face(key);
    const id = `hwc${++uid}${Math.random().toString(36).slice(2, 6)}`;
    return `<g class="${cls}" transform="translate(${x} ${y})"><g class="hw-in">
      <ellipse cx="1" cy="${r + 6}" rx="${r * 0.8}" ry="${r * 0.18}" fill="${INK}" opacity=".18"/>
      <circle cx="1.5" cy="2" r="${r + 4}" fill="${INK}" opacity=".18"/>
      <circle r="${r + 4}" fill="#fff" stroke="${INK}" stroke-width="1.4"/>
      <clipPath id="${id}"><circle r="${r}"/></clipPath>
      ${f ? `<circle r="${r}" fill="#ffe9c4"/><image href="${f}" x="${-r * 1.2}" y="${-r * 1.15}" width="${r * 2.4}" height="${r * 2.4}" clip-path="url(#${id})"/>` : `<circle r="${r}" fill="${COLORS[key] || '#ccc'}"/>`}
      <path d="M${-r * 0.7} ${-r * 0.55} a${r} ${r} 0 0 1 ${r * 0.9} ${-r * 0.45}" stroke="#fff" stroke-width="2" fill="none" opacity=".6" stroke-linecap="round"/>
    </g></g>`;
  };
  const finger = (x, y, cls = 'hw-tap', k = 1) => `<g class="${cls}" transform="translate(${x} ${y}) scale(${k})"><g class="hw-in">
    ${wash('M0 0 C-2 -6 -2 -18 0 -26 C1 -31 7 -31 8 -26 L8 -12 C10 -15 16 -14 16 -10 C18 -12 23 -11 23 -7 C25 -8 29 -7 29 -3 L29 8 C29 18 22 26 12 26 C4 26 -2 22 -5 14 L-11 2 C-13 -2 -8 -6 -5 -3 Z', '#ffe1c8', { w: 1.4 })}
    <path d="M1 -24 q3 -3 6 0" stroke="#fff" stroke-width="1.6" fill="none" opacity=".7"/><path d="M14 18 q6 2 10 -4" stroke="#e8b898" stroke-width="1.4" fill="none"/>
    </g></g>`;
  const ripple = (x, y, c = '#fff', cls = 'hw-ripple') => `<g transform="translate(${x} ${y})"><circle class="${cls}" r="10" fill="none" stroke="${c}" stroke-width="3"/></g>`;
  const woodBoard = (w, h, c = '#c99057') => wash(`M0 4 Q0 0 4 0 H${w - 4} Q${w} 0 ${w} 4 V${h - 4} Q${w} ${h} ${w - 4} ${h} H4 Q0 ${h} 0 ${h - 4} Z`, c, { w: 1.4 }) +
    `<path d="M8 ${h * 0.3} h${w * 0.35} M${w * 0.5} ${h * 0.7} h${w * 0.4}" stroke="#a06a36" stroke-width="1" opacity=".6"/><path d="M4 ${h - 3} H${w - 4}" stroke="${INK}" stroke-width="2" opacity=".2"/>`;
  const plank = (y, label, ico, i) => `<g class="hw-plank" style="--d:${i * 0.45}s" transform="translate(84 ${y})"><g class="hw-in">
    ${woodBoard(170, 30)}<circle cx="8" cy="15" r="1.6" fill="${INK}" opacity=".6"/><circle cx="162" cy="15" r="1.6" fill="${INK}" opacity=".6"/>
    ${ico}${txt(42, 20.5, label, { size: 13, fill: '#fff3d2', anchor: 'start', stroke: INK })}</g></g>`;
  // マス(盤の 丸い 石)
  const tile = (x, y, fill, label, sub) => `<g transform="translate(${x} ${y})">
    <ellipse cx="0" cy="7" rx="27" ry="11" fill="${INK}" opacity=".2"/>
    ${wash(`M-27 0 v5 a27 13 0 0 0 54 0 v-5`, '#8a6a4a', { w: 1.2 })}${wash(ell(0, 0, 27, 13), fill, { w: 1.5 })}${wash(ell(-4, -3, 17, 6), '#fff', { o: 0.28, line: false })}
    ${txt(0, 5, label, { size: 14, fill: '#fff', stroke: INK })}
    <g transform="translate(0 30)">${wash('M-26 -9 h52 v16 h-52 Z', '#fffaf0', { w: 1, o: 0.95 })}${txt(0, 3, sub, { size: sub.length > 4 ? 8.5 : 10 })}</g></g>`;
  const phone = (x, y, inner, k = 1, cls = '') => `<g class="${cls}" transform="translate(${x} ${y}) scale(${k})"><g class="hw-in">
    <rect x="-28" y="-54" width="62" height="116" rx="8" fill="${INK}" opacity=".18"/>
    ${wash('M-30 -52 Q-30 -58 -24 -58 H24 Q30 -58 30 -52 V52 Q30 58 24 58 H-24 Q-30 58 -30 52 Z', '#3a3a4a', { w: 1.5 })}<rect x="-25" y="-50" width="50" height="98" rx="4" fill="#fdf6e6"/>
    <rect x="-6" y="-55" width="12" height="2" rx="1" fill="#6a6a7a"/>${inner}
    <path d="M-22 -46 l10 0 l-14 30" stroke="#fff" stroke-width="3" opacity=".25" fill="none"/></g></g>`;
  const islandBase = (cx, cy, rx, ry, top) => wash(`M${cx - rx} ${cy} Q${cx - rx + 10} ${cy + ry * 2.2} ${cx} ${cy + ry * 2.6} Q${cx + rx - 10} ${cy + ry * 2.2} ${cx + rx} ${cy} Z`, '#8a5a32') +
    `<path d="M${cx - rx + 20} ${cy + ry * 0.9} q20 10 40 4 M${cx + 10} ${cy + ry * 1.5} q20 6 40 -6" stroke="${INK}" stroke-width="1" fill="none" opacity=".35"/>` + wash(ell(cx, cy, rx, ry), top);
  const seaBand = (y) => `<path d="M-10 ${y} Q80 ${y - 8} 160 ${y} T340 ${y - 2} V240 H-10 Z" fill="#8fcfe6" opacity=".85"/><path d="M-10 ${y + 18} Q80 ${y + 12} 160 ${y + 20} T340 ${y + 16} V240 H-10 Z" fill="#6ab8d8" opacity=".6"/>
    <g class="hw-wave">${[0, 1, 2].map((k) => `<path d="M${-20 + k * 30} ${y + 10 + k * 14} q10 -4 20 0 t20 0 M${120 + k * 40} ${y + 6 + k * 16} q10 -4 20 0 t20 0 M${240 - k * 20} ${y + 12 + k * 12} q10 -4 20 0 t20 0" stroke="#fff" stroke-width="1.6" fill="none" opacity=".75" stroke-linecap="round"/>`).join('')}</g>`;
  const bird = (x, y, k = 1) => `<path transform="translate(${x} ${y}) scale(${k})" d="M-8 0 q4 -5 8 0 q4 -5 8 0" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
  const stump = (x, y, k = 1) => `<g transform="translate(${x} ${y}) scale(${k})">${wash('M-28 0 C-28 -20 -26 -30 -24 -34 H24 C26 -30 28 -20 28 0 C30 6 -30 6 -28 0 Z', '#9a6a3e')}${wash(ell(0, -34, 24, 7), '#e6c08a', { w: 1.3 })}
    ${wash(ell(0, -34, 15, 4.2), '#d6aa70', { line: false, o: 0.8 })}<path d="M-14 -34 a14 4 0 0 0 28 0 M-7 -34 a7 2 0 0 0 14 0" stroke="#a87a48" stroke-width=".9" fill="none"/>
    <path d="M-16 -24 v18 M4 -26 v22 M18 -20 v14" stroke="${INK}" stroke-width=".9" opacity=".4"/></g>`;

  return {
    // 1. ようこそ: 海に うかぶ どんぐりの 島
    welcome: () => `${sky('#bfe3f2', '#d8f0f8')}
      <circle cx="268" cy="22" r="18" fill="#fff3b0" opacity=".9"/><circle cx="268" cy="22" r="28" fill="#fff3b0" opacity=".3"/>
      ${cloud(24, 18, 1.1)}${cloud(196, 0, 0.8, 'hw-drift2')}${bird(70, 10)}${bird(84, 2, 0.8)}${bird(250, 52, 0.7)}
      ${seaBand(140)}
      ${islandBase(160, 142, 132, 24, '#8ccf5a')}
      ${wash(ell(160, 140, 116, 18), '#a6dc6e', { line: false, o: 0.6 })}
      <path d="M60 146 q30 8 60 2 q30 -6 60 4 q30 8 50 -2" stroke="#e8d2a0" stroke-width="5" fill="none" stroke-dasharray="1 7" stroke-linecap="round" opacity=".9"/>
      ${wash('M150 142 C152 110 148 88 145 74 L175 74 C172 88 168 110 172 142 Z', '#8a5a32')}
      <path d="M156 132 q3 -20 0 -40 M164 136 q2 -24 4 -44" stroke="${INK}" stroke-width="1" fill="none" opacity=".35"/>
      ${wash('M150 96 C140 90 128 92 122 86 M170 92 C182 86 196 90 204 82', '#8a5a32', { w: 2.2 })}
      ${wash('M96 82 C80 58 104 22 136 30 C146 6 190 8 196 32 C228 26 246 58 224 82 C214 100 106 100 96 82 Z', '#5aa84a')}
      ${wash('M112 60 C110 44 128 32 146 40 C150 28 176 28 182 42', '#7cc35a', { o: 0.7, line: false })}
      <path d="M118 52 q8 -8 18 -4 M176 40 q10 -4 16 4" stroke="#fff" stroke-width="2.4" fill="none" opacity=".4" stroke-linecap="round"/>
      ${acorn(126, 70, 0.9, 'hw-swing')}${acorn(196, 66, 0.9, 'hw-swing d2')}${acorn(160, 46, 0.9, 'hw-swing d3')}${acorn(146, 80, 0.8, 'hw-swing d2')}
      ${owl(214, 96, 0.5, 'hw-sway')}
      ${tuft(56, 150)}${tuft(262, 148)}${flower(76, 146, '#ff8aa8')}${flower(246, 144, '#fff')}${flower(232, 152, '#ffd24a')}
      ${sticker('ponta', 82, 138, 16, 'hw-hop')}${sticker('mimi', 116, 150, 16, 'hw-hop d2')}${sticker('konko', 204, 152, 16, 'hw-hop d3')}${sticker('kerosuke', 240, 136, 14, 'hw-hop')}
      <g transform="translate(160 194)">${wash('M-62 -12 h124 l-6 12 l6 12 h-124 l6 -12 Z', '#e8402f', { w: 1.3 })}${txt(0, 5, 'どんぐりの 島', { size: 14, fill: '#fff8e6', stroke: INK })}</g>`,
    // 2. メニュー: 森の 立て札(板が 1まいずつ ゆれる)
    menu: () => `${sky('#d8eef6', '#e6f2dc')}${meadow({ h: 168, seed: 3 })}
      ${tree(30, 170, 1.3, '#5aa84a')}${tree(300, 176, 1.1, '#6cb85a')}
      ${wash('M164 200 V-6', '#8a5a32', { w: 2 })}${wash('M160 200 h8 V-10 h-8 Z', '#8a5a32')}
      ${wash('M150 -14 L164 -24 L178 -14 Z', '#5e3414', { w: 1.2 })}
      ${plank(2, 'すごろく', `<g transform="translate(22 15)">${wash('M-9 -9 h18 v18 h-18 Z', '#fffaf0', { w: 1.2 })}<circle cx="-4" cy="-4" r="2.2" fill="#d9443a"/><circle cx="0" cy="0" r="2.2" fill="${INK}"/><circle cx="4" cy="4" r="2.2" fill="${INK}"/></g>`, 0)}
      ${plank(36, 'ミニゲーム', `<g transform="translate(22 15)">${acorn(0, 0, 1.15)}</g>`, 1)}
      ${plank(70, 'オンライン', `<g transform="translate(22 15)">${wash(circ(0, 0, 10), '#7cc7e6', { w: 1.2 })}<path d="M-7 -2 c3 2 5 -1 8 1 s2 4 6 3 M-6 5 c3 -1 4 2 7 1" stroke="#4f9a3c" stroke-width="2.2" fill="none"/></g>`, 2)}
      ${plank(104, 'キャラ図鑑', `<g transform="translate(22 15)">${wash('M-10 -7 q5 -2 10 1 v15 q-5 -3 -10 -1 Z', '#fffaf0', { w: 1.1 })}${wash('M10 -7 q-5 -2 -10 1 v15 q5 -3 10 -1 Z', '#ffe7b0', { w: 1.1 })}<circle cx="5" cy="-1" r="1.8" fill="#d9443a"/></g>`, 3)}
      ${plank(138, 'あそびかた・せってい', `<g transform="translate(22 15)">${wash(circ(0, 0, 9), '#c9cfd6', { w: 1.2 })}${wash(circ(0, 0, 3.4), '#fffaf0', { w: 1 })}</g>`, 4)}
      ${sticker('ponta', 46, 128, 15, 'hw-hop')}${sticker('kirin', 282, 132, 14, 'hw-hop d3')}
      ${finger(262, 24, 'hw-point')}`,
    // 3. めあて: 表彰台と 金どんぐりメダル
    goal: () => `${sky('#fff0c8', '#f7e3b2')}
      <g transform="translate(160 66)"><g class="hw-spin">${Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2, b = ((i + 0.45) / 14) * Math.PI * 2; return `<path d="M0 0 L${(Math.cos(a) * 200).toFixed(1)} ${(Math.sin(a) * 200).toFixed(1)} L${(Math.cos(b) * 200).toFixed(1)} ${(Math.sin(b) * 200).toFixed(1)} Z" fill="#ffd24a" opacity=".2"/>`; }).join('')}</g></g>
      ${meadow({ h: 176, seed: 5, flowers: true, trees: false })}
      <g transform="translate(0 6)">
      <ellipse cx="160" cy="184" rx="96" ry="9" fill="${INK}" opacity=".16"/>
      ${wash('M128 182 V132 H192 V182 Z', '#e8b868')}${wash('M74 182 V150 H128 V182 Z', '#d6a464')}${wash('M192 182 V160 H246 V182 Z', '#d6a464')}
      <path d="M128 140 H192 M74 157 H128 M192 167 H246" stroke="#fff" stroke-width="2" opacity=".35"/>
      ${txt(160, 166, '1', { size: 22, fill: '#ffd24a', stroke: INK })}${txt(101, 175, '2', { size: 15, fill: '#e6e6f0', stroke: INK })}${txt(219, 178, '3', { size: 13, fill: '#e8a060', stroke: INK })}
      ${sticker('kerosuke', 160, 108, 20, 'hw-hop')}${sticker('gonzo', 101, 128, 16)}${sticker('penne', 219, 140, 15)}</g>
      ${medal(160, 40, 1.45, 'hw-bob')}
      <g class="hw-twinkle">${sparkle(96, 30, 1.2)}${sparkle(226, 20, 1)}${sparkle(244, 74, 0.9)}${sparkle(76, 84, 0.8)}</g>
      ${wash('M110 70 c-14 -4 -22 -16 -22 -28 c8 4 16 10 22 18 M210 70 c14 -4 22 -16 22 -28 c-8 4 -16 10 -22 18', '#7cc35a', { w: 1.1 })}`,
    // 4. サイコロ: 空の 上で くるくる 回る どんぐりサイコロ
    dice: () => `${sky('#cfe9f6', '#e6f2dc')}${meadow({ h: 176, seed: 7 })}
      ${cloud(20, 10, 0.9)}${cloud(250, 26, 0.75, 'hw-drift2')}
      <g transform="translate(150 78)"><g class="hw-float">
        <ellipse cx="0" cy="96" rx="34" ry="6" fill="${INK}" opacity=".12"/>
        <path d="M-58 -10 q-8 -16 4 -28 M58 -10 q8 -16 -4 -28 M-52 22 q-10 4 -14 14 M52 22 q10 4 14 14" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".9"/>
        ${wash('M-46 -20 C-46 -58 46 -58 46 -20 C40 -10 -40 -10 -46 -20 Z', '#7a4f2c')}
        <path d="M-36 -32 l6 -8 M-22 -38 l4 -8 M-6 -42 l2 -8 M10 -42 l-1 -8 M26 -38 l-3 -8 M38 -30 l-5 -7" stroke="#5a3a1e" stroke-width="1.4" opacity=".6"/>
        ${wash('M-40 -16 C-40 42 40 42 40 -16 Z', '#e0a052')}
        <ellipse cx="-22" cy="4" rx="5" ry="14" fill="#fff" opacity=".35"/>
        <path d="M0 -54 v-14" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
        <g class="hw-roll">${[7, 3, 10, 5, 1, 8].map((n, i) => `<text class="n" style="--i:${i}" y="22" font-size="40" text-anchor="middle" fill="#fff" stroke="${INK}" stroke-width="6" paint-order="stroke" font-family="Dela Gothic One, sans-serif">${n}</text>`).join('')}</g>
      </g></g>
      <g transform="translate(150 196)">${wash('M-40 -12 h80 v22 h-80 Z', '#fffaf0', { w: 1.2 })}${txt(0, 5, '1 〜 10', { size: 15, fill: INK })}</g>
      ${ripple(244, 102, '#ffd24a')}${finger(250, 108, 'hw-tap', 1.2)}
      ${txt(262, 168, 'タップ!', { size: 14, fill: '#fff', stroke: INK, cls: 'hw-pulse' })}
      ${sticker('mimi', 52, 150, 18, 'hw-hop')}`,
    // 5. マス: 森の 道に ならぶ 色の 石
    squares: () => `${sky('#d8eef6', '#e6f2dc')}${meadow({ h: 76, seed: 9, flowers: true })}
      <path d="M-10 108 C40 84 80 120 130 102 S220 78 330 104" stroke="#e8d2a0" stroke-width="44" fill="none" stroke-linecap="round"/>
      <path d="M-10 108 C40 84 80 120 130 102 S220 78 330 104" stroke="${INK}" stroke-width="46" fill="none" opacity=".08"/>
      ${tile(36, 98, '#4a90e2', '+3', '青')}${tile(98, 108, '#e2574a', '−3', '赤')}${tile(160, 96, '#4fae5a', '?', 'どうぐ')}${tile(222, 90, '#9b6bd6', '!', 'ハプニング')}${tile(284, 100, '#f08a2a', 'VS', '対決')}
      ${sticker('konko', 36, 66, 15, 'hw-walk')}
      ${tree(18, 40, 0.9)}${tree(304, 44, 0.9, '#5aa84a')}
      <g transform="translate(160 182)">${wash('M-92 -12 h184 v24 h-184 Z', '#fffaf0', { w: 1.2 })}${txt(0, 5, 'とまった マスで いろいろ おきる', { size: 11 })}</g>`,
    // 6. 先生と メダル: 切り株の 上の 先生へ、どんぐりが とんでいく
    teacher: () => `${sky('#fdf0d4', '#efe0b8')}${meadow({ h: 150, seed: 11 })}
      ${tree(284, 152, 1.6, '#5aa84a')}${tree(30, 148, 1.2, '#6cb85a')}
      ${stump(214, 176, 1.25)}
      ${owl(214, 120, 1.15, 'hw-sway')}
      <g transform="translate(252 92)"><g class="hw-bob">${medal(0, 0, 0.9)}</g></g>
      ${sticker('ponta', 64, 140, 22)}
      <g transform="translate(64 116)">${Array.from({ length: 6 }, (_, i) => `<g class="hw-toss" style="--i:${i}"><g class="hw-in">${acorn(0, 0, 0.9)}</g></g>`).join('')}</g>
      <g transform="translate(106 34)">${wash('M-60 -13 h120 v26 h-120 Z', '#fffaf0', { w: 1.2 })}${acorn(-46, 0, 0.8)}${txt(8, 5, 'どんぐり 20こ', { size: 12 })}</g>
      <path d="M148 40 q20 -2 36 14" stroke="${INK}" stroke-width="1.6" fill="none" stroke-dasharray="3 4" marker-end=""/><path d="M184 54 l-7 -1 m7 1 l-1 -7" stroke="${INK}" stroke-width="1.6"/>
      <g transform="translate(214 200)">${wash('M-36 -11 h72 v22 h-72 Z', '#ffd24a', { w: 1.2 })}${txt(0, 5, 'メダル 1つ', { size: 12 })}</g>`,
    // 7. お店と どうぐ: 森の どうぐ屋
    shop: () => `${sky('#d8eef6', '#e6f2dc')}${meadow({ h: 168, seed: 13 })}
      ${tree(18, 170, 1.4)}${tree(304, 168, 1.2, '#5aa84a')}
      <ellipse cx="160" cy="178" rx="128" ry="8" fill="${INK}" opacity=".15"/>
      ${wash('M44 64 h232 v112 h-232 Z', '#d6a464')}
      <path d="M44 96 h232 M44 130 h232" stroke="#b8844c" stroke-width="1" opacity=".6"/>
      ${wash('M30 64 L50 20 H270 L290 64 Z', '#e8402f')}
      ${Array.from({ length: 6 }, (_, i) => wash(`M${52 + i * 38} 20 L${71 + i * 38} 20 L${66 + i * 38} 64 L${45 + i * 38} 64 Z`, '#fff3d2', { line: false, o: 0.92 })).join('')}
      <path d="M30 64 L50 20 H270 L290 64 Z" fill="none" stroke="${INK}" stroke-width="1.6"/>
      <path d="M30 64 ${Array.from({ length: 13 }, (_, i) => `q10 10 20 0`).join(' ')}" fill="#e8402f" stroke="${INK}" stroke-width="1.2"/>
      <g transform="translate(160 8)">${woodBoard(76, 22, '#8a5428').replace(/^/, '<g transform="translate(-38 -11)">') + '</g>'}${txt(0, 5, 'どうぐ屋', { size: 12, fill: '#fff3d2', stroke: INK })}</g>
      ${wash('M54 126 h212 v10 h-212 Z', '#8a5a32')}
      <g transform="translate(86 108)"><g class="hw-item" style="--i:0">${wash('M-13 -12 h16 v16 h-16 Z', '#fffaf0', { w: 1.2 })}${wash('M-3 -5 h16 v16 h-16 Z', '#fffaf0', { w: 1.2 })}<circle cx="5" cy="3" r="2" fill="${INK}"/><circle cx="-5" cy="-4" r="2" fill="#d9443a"/></g></g>
      <g transform="translate(136 108)"><g class="hw-item" style="--i:1">${[-11, 0, 11].map((x, j) => wash(`M${x - 7} ${-7 + (j % 2) * -4} h14 v14 h-14 Z`, '#fff3c0', { w: 1.1 })).join('')}</g></g>
      <g transform="translate(186 108)"><g class="hw-item" style="--i:2">${wash('M-14 8 C-14 -12 6 -18 15 -14 C15 0 3 12 -14 8 Z', '#7cc35a', { w: 1.2 })}<path d="M-12 6 L10 -11 M-4 0 l-2 -6 M2 -5 l-1 -6 M-4 0 l6 1" stroke="${INK}" stroke-width="1"/></g></g>
      <g transform="translate(236 108)"><g class="hw-item" style="--i:3">${wash('M-14 -5 h20 a7 7 0 0 1 0 12 h-20 Z', '#ffd24a', { w: 1.2 })}<circle cx="-7" cy="1" r="2.2" fill="${INK}"/><path d="M14 -2 q6 -4 8 -10 M14 4 q8 0 12 -4" stroke="#f4b82e" stroke-width="1.4" fill="none"/></g></g>
      ${[['ふたつ', 86, 5], ['みっつ', 136, 10], ['いれかえ', 186, 10], ['先生の笛', 236, 20]].map(([n, x, p]) => `<g transform="translate(${x} 152)">${acorn(-12, 0, 0.7)}${txt(4, 5, String(p), { size: 13, fill: '#fff', stroke: INK })}${txt(0, 22, n, { size: 8.5 })}</g>`).join('')}
      ${sticker('kirin', 292, 140, 17, 'hw-hop')}
      <g transform="translate(34 128)">${wash('M-14 -10 h28 v20 h-28 Z', '#fffaf0', { w: 1 })}${txt(0, 4, '3つまで', { size: 7 })}</g>`,
    // 8. 競技: 原っぱの かけっこ
    race: () => `${sky('#cfe9f6', '#cfe8a8')}${meadow({ h: 120, seed: 15 })}
      ${cloud(30, 4, 0.8)}${cloud(220, 14, 0.7, 'hw-drift2')}
      <path d="M-10 176 Q160 132 330 176" stroke="#e8d2a0" stroke-width="40" fill="none"/>
      <path d="M-10 160 Q160 116 330 160 M-10 192 Q160 148 330 192" stroke="#fff" stroke-width="1.4" fill="none" stroke-dasharray="6 6" opacity=".9"/>
      ${wash('M276 82 v86', '#8a5a32', { w: 2.4 })}
      <g class="hw-flag">${wash('M276 82 h34 l-7 11 l7 11 h-34 Z', '#fffaf0', { w: 1.3 })}<path d="M282 86 h6 v6 h-6 Z M294 86 h6 v6 h-6 Z M288 92 h6 v6 h-6 Z M282 98 h6 v6 h-6 Z M294 98 h6 v6 h-6 Z" fill="${INK}" opacity=".85"/></g>
      ${sticker('gonzo', 74, 150, 18, 'hw-run')}${sticker('penne', 142, 138, 18, 'hw-run d2')}${sticker('kerosuke', 214, 142, 18, 'hw-run d3')}
      <g class="hw-dust">${[[48, 166], [116, 154], [188, 158]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="#fff" opacity=".8"/><circle cx="${x - 10}" cy="${y + 4}" r="4" fill="#fff" opacity=".6"/>`).join('')}</g>
      <path d="M40 140 h-18 M34 150 h-20 M108 128 h-18 M182 132 h-18" stroke="${INK}" stroke-width="1.4" opacity=".5" stroke-linecap="round"/>
      <g transform="translate(160 32)">${wash('M-88 -14 h176 v28 h-176 Z', '#fffaf0', { w: 1.2 })}${txt(6, 5, 'じゅんいで どんぐり!', { size: 12 })}${acorn(-74, 0, 0.8, 'hw-bob')}</g>
      ${acorn(214, 104, 1, 'hw-bob d2')}${acorn(232, 96, 0.8, 'hw-bob d3')}${acorn(196, 98, 0.8, 'hw-bob')}`,
    // 9. ステージの しかけ(島の 絵は ステージえらびと 同じもの。HTML で ならべる)
    stages: () => null,
    // 10. ラストスパートと 表彰: 夜の 森と 花火
    finale: () => `${sky('#2e3f63', '#4a3a6a')}<rect y="-30" width="320" height="260" fill="#26304f" opacity=".7"/>
      <g class="hw-twinkle">${Array.from({ length: 14 }, (_, i) => `<circle cx="${(i * 73) % 320}" cy="${-10 + ((i * 37) % 70)}" r="${i % 3 ? 1.2 : 2}" fill="#fff"/>`).join('')}</g>
      ${[[60, 40, '#ffd24a'], [262, 30, '#ff8aa8'], [200, 70, '#8adcff']].map(([x, y, c], i) => `<g transform="translate(${x} ${y})"><g class="hw-fire" style="--i:${i}">${Array.from({ length: 12 }, (_, j) => { const a = (j / 12) * Math.PI * 2; return `<path d="M${(Math.cos(a) * 6).toFixed(1)} ${(Math.sin(a) * 6).toFixed(1)} L${(Math.cos(a) * 22).toFixed(1)} ${(Math.sin(a) * 22).toFixed(1)}" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`; }).join('')}<circle r="3" fill="${c}"/></g></g>`).join('')}
      <path d="M-10 170 Q60 150 120 166 T240 160 T340 168 V240 H-10 Z" fill="#1e2a40"/>
      ${pine(20, 172, 1.1, '#1a2438', 1)}${pine(48, 170, 0.8, '#1a2438', 1)}${pine(290, 170, 1.2, '#1a2438', 1)}${pine(312, 172, 0.8, '#1a2438', 1)}
      <g class="hw-confetti">${Array.from({ length: 24 }, (_, i) => `<rect class="c" style="--i:${i}" x="${(i * 47) % 320}" y="-30" width="6" height="9" fill="${['#ffd24a', '#e8402f', '#7cc35a', '#4a90e2', '#fff'][i % 5]}"/>`).join('')}</g>
      <g transform="translate(160 20)">${wash('M-82 -18 h164 l-8 18 l8 18 h-164 l8 -18 Z', '#e8402f', { w: 1.4 })}${txt(0, 6, 'のこり 3ターン!', { size: 17, fill: '#ffd24a', stroke: INK, cls: 'hw-pulse' })}</g>
      ${txt(160, 62, '青・赤マスが 2ばい!', { size: 13, fill: '#fff', stroke: INK })}
      ${medal(108, 116, 1, 'hw-bob')}${medal(160, 106, 1.1, 'hw-bob d2')}${medal(212, 116, 1, 'hw-bob d3')}
      ${txt(160, 196, 'さいごに ボーナスメダル 3つ', { size: 13, fill: '#ffd24a', stroke: INK })}`,
    // 11. 競技の 前の せつめい: スマホの 中に あそびかたの カード
    howto: () => `${sky('#d8eef6', '#e6f2dc')}${meadow({ h: 170, seed: 17 })}
      ${phone(104, 98, `<rect x="-25" y="-50" width="50" height="98" rx="4" fill="#9fd4ea"/><path d="M-25 18 q25 -8 50 0 v30 h-50 Z" fill="#8ccf5a"/>${tree(-14, 22, 0.35)}${tree(16, 20, 0.3, '#5aa84a')}
        <g class="hw-card" style="--i:2">${wash('M-21 -30 h42 v40 h-42 Z', '#fffaf0', { w: 1 })}${txt(0, -20, 'あそびかた', { size: 6 })}<path d="M-15 -12 h30 M-15 -5 h22 M-15 2 h26" stroke="${INK}" stroke-width="2" opacity=".5"/></g>`, 1.4, 'hw-tilt')}
      <g transform="translate(232 70)">${wash('M-66 -30 h132 v60 h-132 Z', '#fffaf0', { w: 1.3 })}<path d="M-66 -6 l-12 8 l12 4" fill="#fffaf0" stroke="${INK}" stroke-width="1.3"/>${txt(0, -6, 'はじまる 前に', { size: 13 })}${txt(0, 16, 'そうさの せつめい', { size: 13, fill: '#c0501e' })}</g>
      ${sticker('mimi', 230, 150, 20, 'hw-hop')}
      <g class="hw-twinkle">${sparkle(160, 32, 0.9)}${sparkle(282, 128, 0.8)}</g>`,
    // 12. そうさ いろいろ: 4まいの カード
    controls: () => `${sky('#fdf0d4', '#efe0b8')}${meadow({ h: 178, seed: 19, trees: false })}
      ${[['スティック', 0], ['タップ', 1], ['スワイプ', 2], ['ふる・かたむける', 3]].map(([l, i]) => {
        const x = 42 + i * 79;
        const c = ['#7cc35a', '#4a90e2', '#e8402f', '#9b6bd6'][i];
        const inner = [
          `<circle r="22" fill="#fff" stroke="${INK}" stroke-width="1.4" opacity=".7"/><path d="M0 -18 v-4 M0 18 v4 M-18 0 h-4 M18 0 h4" stroke="${INK}" stroke-width="1.4" opacity=".5"/><g class="hw-stick"><circle r="10" fill="#ffd24a" stroke="${INK}" stroke-width="1.6"/><circle cx="-3" cy="-3" r="3" fill="#fff" opacity=".6"/></g>`,
          `<circle class="hw-ripple" r="9" fill="none" stroke="#4a90e2" stroke-width="3"/><circle r="5" fill="#4a90e2"/>${finger(4, 4, 'hw-tap', 0.7)}`,
          `<path class="hw-swipe" d="M-20 14 L16 -12" stroke="#e8402f" stroke-width="5" stroke-linecap="round" stroke-dasharray="46"/><path d="M16 -12 l-10 1 m10 -1 l-2 9" stroke="#e8402f" stroke-width="4" stroke-linecap="round"/>`,
          `<g class="hw-shake">${wash('M-11 -20 h22 v40 h-22 Z', '#3a3a4a', { w: 1.2 })}<rect x="-8" y="-16" width="16" height="30" fill="#fdf6e6"/><circle cx="0" cy="17" r="1.4" fill="#888"/></g><path d="M-22 -10 q-4 10 0 20 M22 -10 q4 10 0 20" stroke="#9b6bd6" stroke-width="2" fill="none" stroke-linecap="round"/>`,
        ][i];
        return `<g transform="translate(${x} 96)"><g class="hw-card" style="--i:${i}">
          <rect x="-33" y="-55" width="70" height="110" rx="6" fill="${INK}" opacity=".15"/>
          ${wash('M-35 -58 h70 v110 h-70 Z', '#fffaf0', { w: 1.4 })}${wash('M-35 -58 h70 v16 h-70 Z', c, { w: 1.4 })}${txt(0, -46, `${i + 1}`, { size: 10, fill: '#fff', stroke: INK })}
          <g transform="translate(0 -6)">${inner}</g>${txt(0, 40, l, { size: i === 3 ? 8 : 10.5 })}</g></g>`;
      }).join('')}
      <g transform="translate(160 194)">${wash('M-72 -12 h144 v24 h-144 Z', '#fffaf0', { w: 1.2 })}${txt(0, 5, '競技に よって ちがうよ', { size: 11 })}</g>`,
    // 13. ミニゲームだけで あそぶ: 競技の カードの 棚
    games: () => `${sky('#d8eef6', '#e6f2dc')}${meadow({ h: 176, seed: 21 })}
      ${woodBoard(250, 150, '#b88a5a').replace(/^/, '<g transform="translate(35 2)">') + '</g>'}
      ${Array.from({ length: 12 }, (_, i) => {
        const x = 70 + (i % 4) * 60, y = 30 + Math.floor(i / 4) * 46;
        const c = ['#4a90e2', '#e2574a', '#4fae5a', '#f08a2a', '#9b6bd6', '#ffc23c'][i % 6];
        const pic = [acorn(0, -2, 0.9), `<circle cy="-2" r="6" fill="#fff"/>`, tuft(0, 4, 1.2, '#fff'), `<path d="M-8 2 l8 -10 l8 10 Z" fill="#fff"/>`, `<circle cx="-4" cy="-2" r="4" fill="#fff"/><circle cx="5" cy="-2" r="4" fill="#fff"/>`, flower(0, -4, '#fff', 1.3)][i % 6];
        return `<g transform="translate(${x} ${y})"><g class="hw-card" style="--i:${i}">${wash('M-25 -18 h50 v38 h-50 Z', '#fffaf0', { w: 1.2 })}${wash('M-21 -14 h42 v22 h-42 Z', c, { line: false, o: 0.85 })}<g transform="translate(0 -3)">${pic}</g><path d="M-16 14 h24" stroke="${INK}" stroke-width="2" opacity=".5"/></g></g>`;
      }).join('')}
      ${finger(236, 120, 'hw-point', 1.1)}
      ${sticker('konko', 30, 160, 16, 'hw-hop')}${sticker('penne', 292, 168, 15, 'hw-hop d2')}
      <g transform="translate(160 194)">${wash('M-86 -12 h172 v24 h-172 Z', '#fffaf0', { w: 1.2 })}${txt(0, 5, 'すきな 競技を えらんで あそぶ', { size: 11 })}</g>`,
    // 14. 部屋を つくる: あいことばを 友だちへ
    room: () => `${sky('#d8eef6', '#e6f2dc')}${meadow({ h: 172, seed: 23 })}
      ${tree(26, 176, 1.2)}${tree(300, 180, 1.1, '#5aa84a')}
      ${phone(92, 96, `${txt(0, -32, 'あいことば', { size: 8 })}${wash('M-21 -24 h42 v24 h-42 Z', '#fff3c0', { w: 1 })}${txt(0, -6, '3815', { size: 15, fill: INK })}${wash('M-19 10 h38 v15 h-38 Z', '#4fae5a', { w: 1 })}${txt(0, 21, 'リンクを おくる', { size: 5.6, fill: '#fff' })}<path d="M-12 34 h24" stroke="${INK}" stroke-width="2" opacity=".3"/>`, 1.3)}
      <path class="hw-send" d="M140 82 q46 -46 92 0" stroke="#e8402f" stroke-width="3" fill="none" stroke-dasharray="6 6" stroke-linecap="round"/>
      <g transform="translate(186 40)"><g class="hw-bob">${wash('M-14 -9 h28 v18 h-28 Z', '#fffaf0', { w: 1.1 })}<path d="M-14 -9 l14 10 l14 -10" stroke="${INK}" stroke-width="1.1" fill="none"/></g></g>
      ${phone(256, 102, `${sticker('konko', 0, -12, 15)}${txt(0, 22, 'とどいた!', { size: 8, fill: '#c0501e' })}`, 1.05)}
      ${sticker('ponta', 36, 128, 16, 'hw-hop')}`,
    // 15. 入る: あいことばを うつ / だれとでも
    join: () => `${sky('#d8eef6', '#e6f2dc')}${meadow({ h: 178, seed: 25 })}
      ${phone(88, 96, `${wash('M-21 -42 h42 v20 h-42 Z', '#fff3c0', { w: 1 })}<text x="0" y="-27" font-size="13" text-anchor="middle" fill="${INK}" font-family="Dela Gothic One, sans-serif" class="hw-type">3815</text>
        ${Array.from({ length: 9 }, (_, i) => `<rect x="${-19 + (i % 3) * 13}" y="${-14 + Math.floor(i / 3) * 13}" width="11" height="11" rx="2" fill="#fff" stroke="${INK}" stroke-width=".8"/><text x="${-13.5 + (i % 3) * 13}" y="${-5.5 + Math.floor(i / 3) * 13}" font-size="6" text-anchor="middle" fill="${INK}" font-family="Dela Gothic One, sans-serif">${i + 1}</text>`).join('')}`, 1.3)}
      ${finger(98, 98, 'hw-press', 1.1)}
      <g transform="translate(230 40)">${wash('M-62 -13 h124 v26 h-124 Z', '#fffaf0', { w: 1.2 })}${txt(0, 5, 'あいことばで 入る', { size: 11.5 })}</g>
      ${txt(230, 76, 'または', { size: 10, fill: '#8a6a4a' })}
      <g transform="translate(230 126)"><g class="hw-spin2">${wash(circ(0, 0, 30), '#7cc7e6')}<path d="M-22 -8 c9 4 14 -4 20 0 s7 12 16 9 M-17 14 c7 -2 12 4 19 1 M4 -24 c4 6 10 6 14 2" fill="none" stroke="#4f9a3c" stroke-width="6" stroke-linecap="round"/></g>
        ${sticker('gonzo', -38, 22, 11)}${sticker('mimi', 38, 20, 11)}${sticker('kirin', 0, -40, 11)}</g>
      <g transform="translate(230 186)">${wash('M-44 -12 h88 v24 h-88 Z', '#ffd24a', { w: 1.2 })}${txt(0, 5, 'だれとでも', { size: 12 })}</g>`,
    // 16. 部屋の 中: 5つの 席
    seats: () => `${sky('#fdf0d4', '#efe0b8')}${meadow({ h: 164, seed: 27, trees: false })}
      <g transform="translate(160 32)">${woodBoard(120, 26, '#8a5428').replace(/^/, '<g transform="translate(-60 -13)">') + '</g>'}${txt(0, 5, 'へや 3815', { size: 12, fill: '#fff3d2', stroke: INK })}</g>
      ${[['ponta', 'あなた'], ['mimi', 'ともだち'], ['gonzo', 'ともだち'], [null, 'CPU'], [null, 'CPU']].map(([k, l], i) => {
        const x = 40 + i * 60;
        return `<g transform="translate(${x} 110)">
          <rect x="-24" y="-40" width="54" height="90" rx="6" fill="${INK}" opacity=".14"/>
          ${wash('M-26 -44 h52 v88 h-52 Z', i === 0 ? '#fff3c0' : '#fffaf0', { w: 1.3 })}
          ${k ? sticker(k, 0, -10, 17, i === 0 ? 'hw-hop' : '') : `<g transform="translate(0 -10)">${wash(circ(0, 0, 18), '#c9cfd6', { w: 1.2 })}<rect x="-9" y="-7" width="18" height="12" rx="3" fill="#fff" stroke="${INK}" stroke-width="1"/><circle cx="-4" cy="-1" r="2" fill="#4a90e2"/><circle cx="4" cy="-1" r="2" fill="#4a90e2"/><path d="M0 -7 v-5" stroke="${INK}" stroke-width="1.2"/><circle cx="0" cy="-13" r="1.8" fill="#e8402f"/></g>`}
          ${txt(0, 22, l, { size: 9 })}${i < 3 ? `<g transform="translate(0 34)">${wash('M-15 -7 h30 v13 h-30 Z', '#ffd24a', { w: 1 })}${txt(0, 3.5, `${[2, 1, 0][i]}勝`, { size: 8.5, fill: '#c0501e' })}</g>` : ''}
          ${i === 0 ? `<g transform="translate(0 -46)">${wash('M-11 5 L-11 -6 L-5.5 0 L0 -9 L5.5 0 L11 -6 L11 5 Z', '#ffd24a', { w: 1.1 })}</g>` : ''}</g>`;
      }).join('')}
      <g transform="translate(160 190)">${wash('M-110 -14 h220 v28 h-220 Z', '#fffaf0', { w: 1.2 })}${txt(0, -1, 'さいしょの 人が えらんで はじめる', { size: 10 })}${txt(0, 11, 'あいた 席は CPU', { size: 9, fill: '#8a6a4a' })}</g>`,
    // 17. さあ あそぼう: みんなで ばんざい
    end: () => `${sky('#fff0c8', '#f7e3b2')}
      <g transform="translate(160 70)"><g class="hw-spin">${Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2, b = ((i + 0.45) / 14) * Math.PI * 2; return `<path d="M0 0 L${(Math.cos(a) * 220).toFixed(1)} ${(Math.sin(a) * 220).toFixed(1)} L${(Math.cos(b) * 220).toFixed(1)} ${(Math.sin(b) * 220).toFixed(1)} Z" fill="#ffd24a" opacity=".18"/>`; }).join('')}</g></g>
      ${meadow({ h: 150, seed: 29 })}
      ${tree(160, 152, 1.9, '#5aa84a')}
      <g class="hw-confetti">${Array.from({ length: 20 }, (_, i) => `<rect class="c" style="--i:${i}" x="${(i * 53) % 320}" y="-30" width="6" height="9" fill="${['#ffd24a', '#e8402f', '#7cc35a', '#4a90e2'][i % 4]}"/>`).join('')}</g>
      ${owl(160, 118, 1.3, 'hw-sway')}
      ${['ponta', 'mimi', 'gonzo', 'penne', 'konko', 'kerosuke', 'kirin'].map((k, i) => sticker(k, 34 + i * 42, 172 - (i % 2) * 10, 16, `hw-hop d${(i % 3) + 1}`)).join('')}
      <g transform="translate(160 24)">${wash('M-92 -20 h184 l-8 20 l8 20 h-184 l8 -20 Z', '#e8402f', { w: 1.4 })}${txt(0, 7, 'さあ、あそぼう!', { size: 19, fill: '#fff', stroke: INK, cls: 'hw-pulse' })}</g>`,
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
      card.innerHTML = `<div class="kamiisles">${['shiki', 'yuen', 'umi'].map((k, j) => `<div class="hw-isle" style="--i:${j}">${own(isle(k), k)}<span>${['四季の森', 'どんぐり遊園地', '海の中の 探検'][j]}</span><i>${['近道・氷', '乗り物', 'クジラ'][j]}</i></div>`).join('')}</div>`;
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
      // 画面が 出てから とびらを ひらく(出る 前に つけると、とびらが はじめから ひらいた まま)
      el.classList.remove('opened');
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('opened')));
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
