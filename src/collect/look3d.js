// きせかえの 3D(ぼうし・かざりと スカーフの 柄)。
//
// どの 競技でも 見える ように、キャラを 作る ところ(createModel)で つける。
// だれが 何を つけて いるかは setLooks({ キャラの key: look })で きめる(1つの 試合に 同じ キャラは 1人だけ)。
// - ぼうしは 頭の ノード(head)の 子に つける。頭と いっしょに 動く。部品は まとめて 少ない 回数で 描く
// - スカーフの 柄は、プレイヤーの 色の 上に 模様を 描いた 絵(canvas)を スカーフの 素材に はる

import * as THREE from 'three';
import { GEO, blob, shape, solid } from '../model-kit.js';
import { CHARACTERS } from '../characters.js';
import { mergeStatic } from '../runtime/merge.js';
import { toonGradient } from '../runtime/models.js'; // models.js も このファイルを 読む(循環)が、つかうのは 関数の 中だけ

// ── だれが 何を つけて いるか ─────────────────────
let LOOKS = {};
export function setLooks(map) { LOOKS = { ...(map || {}) }; }
export const lookFor = (character) => LOOKS[character] || null;

const R = 0.48; // 頭の 半径(characters.js と 同じ)
// キャラごとの ぼうしの 位置(頭の てっぺんから)。耳や つのが ある 子は すこし ずらす
const FIT = {
  mimi: { y: -0.02, s: 0.96 }, // 長い 耳の あいだ
  kirin: { y: 0.0, s: 0.95 },
  kerosuke: { y: 0.15, s: 1.1, z: -0.06 }, // 平たい 頭(目が 上に 出て いるので すこし 上へ)
  penne: { y: 0, s: 1 },
  // ゲストの とり: 頭が 大きく、回る 点(首)が 頭の 下の ほうに ある
  ray: { y: 0.29, s: 1.2, z: 0.05 },
};

// ── ぼうしの 形 ─────────────────────────────
const HEMI = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 28);
const CONE = new THREE.ConeGeometry(1, 1, 24);
const TORUS = new THREE.TorusGeometry(1, 0.12, 10, 32);
const scaled = (m, x, y = x, z = x) => { m.scale.set(x, y, z); return m; };
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
const rot = (m, x = 0, y = 0, z = 0) => { m.rotation.set(x, y, z); return m; };
const hemi = (c) => shape(HEMI, c, 1.06);
const cyl = (c) => shape(CYL, c, 1.06);

const HAT = {
  // どんぐりの かさ(しましまの 線と 軸)
  acorn: (c = 0x8a5a32) => {
    const g = new THREE.Group();
    g.add(scaled(hemi(c), 0.36, 0.22, 0.36));
    g.add(rot(at(scaled(shape(TORUS, 0x6e4528, false), 0.33, 0.33, 0.6), 0, 0.03, 0), Math.PI / 2));
    g.add(at(scaled(cyl(0x5a3a1e), 0.035, 0.12, 0.035), 0, 0.27, 0));
    return g;
  },
  leaf: () => {
    const g = new THREE.Group();
    // 頭の てっぺんから 立つ ように(低いと 頭に うまる)
    g.add(rot(at(blob(0x6cbf58, 0.2, 0.04, 0.11), 0.1, 0.2, 0), 0, 0.3, -0.5));
    g.add(rot(at(blob(0x8ad46a, 0.15, 0.035, 0.08), -0.1, 0.16, 0.04), 0, -0.4, 0.5));
    g.add(at(scaled(cyl(0x6a4a2a), 0.025, 0.16, 0.025), 0, 0.1, 0));
    return g;
  },
  flower: () => {
    const g = new THREE.Group();
    const cols = [0xff8aa8, 0xffffff, 0xffd24a, 0xb48aff, 0xff8aa8, 0x8adcff, 0xffffff];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const f = at(blob(cols[i % cols.length], 0.075, 0.05, 0.075), Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3);
      f.add(at(blob(0xffd24a, 0.35, 0.5, 0.35, false), 0, 0.6, 0));
      g.add(f);
      g.add(at(blob(0x6cbf58, 0.06, 0.025, 0.04), Math.cos(a + 0.35) * 0.31, -0.02, Math.sin(a + 0.35) * 0.31));
    }
    return g;
  },
  straw: () => {
    const g = new THREE.Group();
    g.add(scaled(cyl(0xf2d27a), 0.56, 0.03, 0.56));
    g.add(at(scaled(hemi(0xf2d27a), 0.32, 0.26, 0.32), 0, 0.01, 0));
    g.add(at(scaled(cyl(0xe8402f), 0.325, 0.06, 0.325), 0, 0.05, 0));
    return g;
  },
  ribbon: () => {
    const g = new THREE.Group();
    g.add(rot(at(blob(0xff6a9a, 0.16, 0.11, 0.06), -0.15, 0.06, 0.02), 0, 0, 0.35));
    g.add(rot(at(blob(0xff6a9a, 0.16, 0.11, 0.06), 0.15, 0.06, 0.02), 0, 0, -0.35));
    g.add(at(blob(0xe8407a, 0.07, 0.07, 0.07), 0, 0.05, 0.04));
    g.position.set(0.12, 0, 0.06);
    g.rotation.z = -0.3;
    const w = new THREE.Group();
    w.add(g);
    return w;
  },
  knit: () => {
    const g = new THREE.Group();
    g.add(scaled(hemi(0x4a90e2), 0.37, 0.3, 0.37));
    g.add(at(scaled(cyl(0xffffff), 0.375, 0.09, 0.375), 0, 0.02, 0));
    g.add(at(blob(0xffffff, 0.11), 0, 0.33, 0));
    return g;
  },
  cap: () => {
    const g = new THREE.Group();
    g.add(scaled(hemi(0xe8402f), 0.35, 0.24, 0.35));
    g.add(rot(at(blob(0xe8402f, 0.26, 0.025, 0.2), 0, 0.02, 0.3), -0.1));
    g.add(at(blob(0xffffff, 0.04), 0, 0.24, 0));
    return g;
  },
  mushroom: () => {
    const g = new THREE.Group();
    g.add(at(scaled(hemi(0xe8402f), 0.44, 0.3, 0.44), 0, 0, 0));
    g.add(scaled(cyl(0xfff3d2), 0.43, 0.03, 0.43));
    for (const [x, y, z, r] of [[0, 0.29, 0, 0.07], [0.22, 0.2, 0.12, 0.06], [-0.2, 0.2, 0.15, 0.055], [0.05, 0.18, -0.26, 0.06], [-0.24, 0.16, -0.12, 0.05], [0.28, 0.12, -0.12, 0.05]]) g.add(at(blob(0xffffff, r, r * 0.6, r, false), x, y, z));
    return g;
  },
  beret: () => {
    const g = new THREE.Group();
    g.add(rot(at(blob(0x9b4a8a, 0.38, 0.1, 0.36), 0.04, 0.05, 0), 0, 0, -0.18));
    g.add(at(scaled(cyl(0x7a3a6a), 0.025, 0.06, 0.025), 0.02, 0.16, 0));
    return g;
  },
  chef: () => {
    const g = new THREE.Group();
    g.add(at(scaled(cyl(0xffffff), 0.3, 0.2, 0.3), 0, 0.08, 0));
    for (const [x, z] of [[0, 0], [0.16, 0.08], [-0.16, 0.08], [0.08, -0.15], [-0.1, -0.13]]) g.add(at(blob(0xffffff, 0.2, 0.17, 0.2), x, 0.3, z));
    return g;
  },
  pirate: () => {
    const g = new THREE.Group();
    g.add(at(blob(0x2b2b3a, 0.5, 0.2, 0.22), 0, 0.08, 0));
    g.add(at(blob(0x2b2b3a, 0.3, 0.12, 0.3), 0, 0.02, 0));
    g.add(at(blob(0xffffff, 0.06, 0.06, 0.02), 0, 0.12, 0.21));
    g.add(at(scaled(cyl(0xffd24a), 0.5, 0.02, 0.23), 0, 0.2, 0));
    return g;
  },
  tophat: () => {
    const g = new THREE.Group();
    g.add(scaled(cyl(0x2b2b3a), 0.42, 0.03, 0.42));
    g.add(at(scaled(cyl(0x2b2b3a), 0.26, 0.42, 0.26), 0, 0.21, 0));
    g.add(at(scaled(cyl(0xe8402f), 0.265, 0.07, 0.265), 0, 0.07, 0));
    return g;
  },
  wizard: () => {
    const g = new THREE.Group();
    g.add(scaled(cyl(0x5a4aa8), 0.46, 0.03, 0.46));
    const c = at(scaled(shape(CONE, 0x5a4aa8, 1.06), 0.3, 0.62, 0.3), 0, 0.3, 0);
    c.rotation.z = -0.12;
    g.add(c);
    g.add(rot(at(scaled(shape(GEO.star, 0xffd24a, false), 1.6), 0.08, 0.36, 0.22), 0.3, 0.4));
    return g;
  },
  crown: (c = 0xffc83a) => {
    const g = new THREE.Group();
    g.add(at(scaled(shape(new THREE.CylinderGeometry(1, 0.9, 1, 28, 1, true), c, 1.06), 0.27, 0.14, 0.27), 0, 0.07, 0));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(at(scaled(shape(CONE, c, 1.08), 0.07, 0.14, 0.07), Math.cos(a) * 0.25, 0.2, Math.sin(a) * 0.25));
      g.add(at(blob([0xe8402f, 0x4a90e2, 0x7cc35a][i % 3], 0.035), Math.cos(a + 0.5) * 0.27, 0.07, Math.sin(a + 0.5) * 0.27));
    }
    return g;
  },
  halo: () => {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: 0xffe680 });
    m.name = 'halo';
    g.add(rot(at(scaled(new THREE.Mesh(TORUS, m), 0.26), 0, 0.22, 0), Math.PI / 2));
    return g;
  },
  gold: () => {
    const g = HAT.acorn(0xf2b82e);
    g.add(rot(at(scaled(shape(GEO.star, 0xfff3b0, false), 1.4), 0.2, 0.22, 0.18), 0.3, 0.6));
    return g;
  },
};

// 標準の 素材(MeshStandard)を トゥーンへ(createModel と そろえる)
const TOON = new Map();
function toonify(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material.isMeshStandardMaterial) return;
    const hex = o.material.color.getHex();
    if (!TOON.has(hex)) {
      const m = new THREE.MeshToonMaterial({ color: hex, gradientMap: toonGradient });
      m.name = o.material.name;
      TOON.set(hex, m);
    }
    o.material = TOON.get(hex);
  });
}

export function buildHat(key) {
  const make = HAT[key];
  if (!make) return null;
  const g = make();
  toonify(g);
  const wrap = new THREE.Group();
  wrap.add(g);
  mergeStatic(wrap);
  wrap.name = 'look_hat';
  return wrap;
}

// ── スカーフの 柄 ─────────────────────────────
// 横(u)は 首の まわり、たて(v)は 布の 太さ。プレイヤーの 色を 下に ぬって、模様を 上に
const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;
const PATTERN = {
  stripe: (g, w, h) => { g.fillStyle = '#ffffff'; for (let x = -h; x < w; x += 28) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 12, h); g.lineTo(x + 12 + h, 0); g.lineTo(x + h, 0); g.fill(); } },
  dots: (g, w, h) => { g.fillStyle = '#ffffff'; for (let x = 8; x < w; x += 22) for (let y = 8 + ((x / 22) % 2) * 10; y < h; y += 20) { g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill(); } },
  check: (g, w, h) => { g.fillStyle = 'rgba(255,255,255,.45)'; for (let x = 0; x < w; x += 24) g.fillRect(x, 0, 10, h); for (let y = 0; y < h; y += 24) g.fillRect(0, y, w, 10); },
  wave: (g, w, h) => { g.strokeStyle = '#ffffff'; g.lineWidth = 4; for (let y = 12; y < h; y += 20) { g.beginPath(); for (let x = 0; x <= w; x += 4) g.lineTo(x, y + Math.sin(x / 8) * 4); g.stroke(); } },
  heart: (g, w, h) => { g.fillStyle = '#ffffff'; for (let x = 12; x < w; x += 26) for (let y = 12; y < h; y += 26) { g.beginPath(); g.moveTo(x, y + 6); g.bezierCurveTo(x - 9, y - 2, x - 4, y - 9, x, y - 3); g.bezierCurveTo(x + 4, y - 9, x + 9, y - 2, x, y + 6); g.fill(); } },
  star: (g, w, h) => {
    g.fillStyle = '#ffe680';
    for (let x = 12; x < w; x += 26) for (let y = 12 + (x % 52 ? 0 : 10); y < h; y += 26) {
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 2.6 : 6.5; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      g.fill();
    }
  },
  flowers: (g, w, h) => {
    for (let x = 12; x < w; x += 28) for (let y = 12 + (x % 56 ? 0 : 12); y < h; y += 28) {
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * 4.5, y + Math.sin(a) * 4.5, 3.4, 0, 7); g.fill(); }
      g.fillStyle = '#ffd24a';
      g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill();
    }
  },
  rainbow: (g, w, h) => { for (let i = 0; i < 7; i++) { g.fillStyle = ['#ff5a4e', '#ff9a3c', '#ffd23c', '#5cc86a', '#4aa8f0', '#5a6ae0', '#a86ae0'][i]; g.fillRect(0, (h / 7) * i, w, h / 7 + 1); } },
};
// 絵は 柄と 色ごとに 1まいだけ 作って つかいまわす(色を ぬりかえる たびに 作らない)
const TEX = new Map();
export function scarfTexture(pattern, hex) {
  const draw = PATTERN[pattern];
  if (!draw) return null;
  const id = `${pattern}:${hex}`;
  if (TEX.has(id)) return TEX.get(id);
  const c = Object.assign(document.createElement('canvas'), { width: 256, height: 64 });
  const g = c.getContext('2d');
  g.fillStyle = css(hex);
  g.fillRect(0, 0, 256, 64);
  draw(g, 256, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  TEX.set(id, t);
  return t;
}

// ── モデルに つける / はずす ───────────────────────
// look: { hat, scarf }。null の ところは はずす
export function applyLook(model, look, key) {
  const head = model.node('head');
  head?.getObjectByName('look_hat')?.removeFromParent();
  if (look?.hat && head) {
    const hat = buildHat(look.hat);
    if (hat) {
      const def = CHARACTERS.find((c) => c.key === key) || {};
      const hs = def.headScale || [1, 1, 1];
      const fit = FIT[key] || {};
      hat.position.set(fit.x || 0, R * hs[1] * 0.78 + (fit.y || 0), fit.z || 0);
      hat.scale.setScalar(1.12 * (fit.s || 1) * Math.max(hs[0], hs[2]));
      hat.rotation.x = -0.12; // すこし うしろへ かぶる
      head.add(hat);
    }
  }
  model.scarfPattern = look?.scarf || null;
  model.setPlayerColor(model.playerHex);
}
