// 森の図書館の ぱらぱらブック の 会場(見た目だけ)。
//
// 木の 図書館の 部屋。大きな 机の 上に、大きな 絵本が ひらいている。
// 手前の ページ(床)の 上で 5人が 走る。奥には 表紙が 立っていて、その 前に 穴の あいた ページが 立つ。
// ページは 紙の 色に 森の 絵と 文字の 行。穴は どんぐり・葉っぱ・星・花・キノコの 形に 切りぬく。
// 床には たおれてくる 穴の 影(穴の ところだけ 明るい)。
// 奥の かべには 本棚、横に 机の ランプ(あたたかい 光)。
//
// 座標: 本の とじめ(ページが たおれる 軸)が x 軸(z = 0)。手前の ページの 面が y = 0。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { makeRand } from '../daruma/trees.js';
import { RULES } from './rules.js';

const PX = 128; // 1m あたりの 絵の 点の 数
const W = RULES.W, D = RULES.D;

// 穴の 形を ctx に かく(中心 cx, cy、大きさ R は 当たりの 半径くらい)
export function shapePath(g, shape, cx, cy, R, rot = 0) {
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.beginPath();
  if (shape === 'acorn') {
    // どんぐり: 丸い 実と、上の ぼうし
    g.ellipse(0, R * 0.12, R * 0.82, R * 0.92, 0, 0, Math.PI * 2);
    g.moveTo(R * 1.02, -R * 0.38);
    g.ellipse(0, -R * 0.38, R * 1.02, R * 0.5, 0, 0, Math.PI, true);
    g.rect(-R * 0.1, -R * 1.08, R * 0.2, R * 0.3);
  } else if (shape === 'leaf') {
    g.moveTo(0, -R * 1.12);
    g.bezierCurveTo(R * 1.15, -R * 0.6, R * 1.0, R * 0.7, 0, R * 1.12);
    g.bezierCurveTo(-R * 1.0, R * 0.7, -R * 1.15, -R * 0.6, 0, -R * 1.12);
  } else if (shape === 'star') {
    for (let k = 0; k <= 10; k++) {
      const a = -Math.PI / 2 + (k / 10) * Math.PI * 2, r = k % 2 ? R * 0.68 : R * 1.15;
      if (k === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r); else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
  } else if (shape === 'flower') {
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k / 5) * Math.PI * 2;
      g.moveTo(Math.cos(a) * R * 0.55 + R * 0.5, Math.sin(a) * R * 0.55);
      g.arc(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, R * 0.5, 0, Math.PI * 2);
    }
    g.moveTo(R * 0.55, 0);
    g.arc(0, 0, R * 0.55, 0, Math.PI * 2);
  } else {
    // キノコ: 半円の かさと 柄
    g.moveTo(-R * 1.1, -R * 0.05);
    g.bezierCurveTo(-R * 1.1, -R * 1.25, R * 1.1, -R * 1.25, R * 1.1, -R * 0.05);
    g.closePath();
    g.roundRect(-R * 0.42, -R * 0.1, R * 0.84, R * 1.05, R * 0.2);
  }
  g.restore();
}

// 紙と 森の 絵(ページごとに すこし ちがう)
function paper(g, w, h, seed) {
  const rand = makeRand(seed);
  g.fillStyle = '#f3e7cc';
  g.fillRect(0, 0, w, h);
  // ふちの 色
  const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(150,100,40,0.25)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  // 文字の 行
  g.fillStyle = 'rgba(110,80,50,0.35)';
  for (let y = 40; y < h - 30; y += 34) {
    if (rand() < 0.35) continue;
    let x = 30 + rand() * 40;
    while (x < w - 60) { const len = 20 + rand() * 60; g.fillRect(x, y, len, 7); x += len + 12; }
  }
  // 森の 絵(木と どんぐり)
  for (let i = 0; i < 6; i++) {
    const x = rand() * w, y = rand() * h, s = 25 + rand() * 35;
    g.fillStyle = ['rgba(90,150,80,0.35)', 'rgba(200,120,60,0.3)', 'rgba(120,90,160,0.25)'][i % 3];
    g.beginPath();
    g.arc(x, y, s, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(110,76,54,0.35)';
    g.fillRect(x - 5, y + s * 0.7, 10, s * 0.9);
  }
}

// 立っている ページの 絵: 紙に 穴を 切りぬく(穴は すけて 見える)
export function pageTexture(holes, page) {
  const cw = Math.round(W * PX), ch = Math.round(D * PX);
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d');
  paper(g, cw, ch, 50 + page);
  // ページ番号
  g.fillStyle = 'rgba(110,80,50,0.6)';
  g.font = '400 34px "Dela Gothic One", sans-serif';
  g.textAlign = 'center';
  g.fillText(String(page + 1), cw / 2, 46);
  // 穴の ふち(こげ茶の 線)→ 切りぬき
  for (const h of holes) {
    const cx = (h.x + W / 2) * PX, cy = (D - h.z) * PX; // 上ほど 手前に たおれる(高さ = z)
    g.lineWidth = 14;
    g.strokeStyle = '#7a5032';
    shapePath(g, h.shape, cx, cy, h.r * PX, h.rot);
    g.stroke();
  }
  g.globalCompositeOperation = 'destination-out';
  for (const h of holes) {
    shapePath(g, h.shape, (h.x + W / 2) * PX, (D - h.z) * PX, h.r * PX, h.rot);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 床に うつる 影: 穴の ところだけ 明るい(ふちは 金の 線)
export function shadowTexture(holes) {
  const cw = Math.round(W * 64), ch = Math.round(D * 64);
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(60,35,15,0.55)';
  g.fillRect(0, 0, cw, ch);
  // たおれると 上下が うらがえるので、形も 上下 さかさまに かく
  const draw = (h) => { g.save(); g.translate((h.x + W / 2) * 64, h.z * 64); g.scale(1, -1); shapePath(g, h.shape, 0, 0, h.r * 64, h.rot); g.restore(); };
  g.globalCompositeOperation = 'destination-out';
  for (const h of holes) { draw(h); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(255,220,120,0.9)';
  g.setLineDash([12, 8]);
  for (const h of holes) { draw(h); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildStage(scene) {
  const g = new THREE.Group();
  const rand = makeRand(12);
  // 部屋: 木の 床と かべ
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), toonMaterial(0x8a5a32));
  floor.position.y = -4.5;
  g.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), toonMaterial(0xc8a070));
  wall.position.set(0, 10, -14);
  g.add(wall);
  // 本棚(奥の かべ)
  const shelfMat = toonMaterial(0x6b4226);
  const bookCols = [0xb8402f, 0x3f6fb0, 0x4f9a46, 0xd8a21e, 0x8a5ab8, 0x2f6a6a, 0xe8784a];
  for (let row = 0; row < 4; row++) {
    const y = -1 + row * 3;
    const board = new THREE.Mesh(new THREE.BoxGeometry(34, 0.25, 1.6), shelfMat);
    board.position.set(0, y, -13.2);
    g.add(board);
    let x = -16.5;
    while (x < 16.5) {
      const w = 0.3 + rand() * 0.35, h = 1.6 + rand() * 1.0;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.2), toonMaterial(bookCols[Math.floor(rand() * bookCols.length)]));
      b.position.set(x + w / 2, y + 0.12 + h / 2, -13.1);
      if (rand() < 0.08) b.rotation.z = 0.25;
      g.add(b);
      x += w + 0.04;
    }
  }
  // 机
  const desk = new THREE.Mesh(new THREE.BoxGeometry(22, 0.8, 14), toonMaterial(0xa06a3a));
  desk.position.set(0, -0.75, 2);
  g.add(desk);
  // 本: 表紙(下)と、手前の ページの あつみ
  const cover = toonMaterial(0x7a2e2a);
  const back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.12, D + 0.4), cover);
  back.position.set(0, -0.3, D / 2);
  g.add(back);
  const stack = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.22, D + 0.05), toonMaterial(0xf0e2c0));
  stack.position.set(0, -0.12, D / 2);
  g.add(stack);
  // 奥に 立つ 表紙(穴の むこうに 見える)
  const standCover = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, D + 0.4, 0.12), cover);
  standCover.position.set(0, D / 2, -0.35);
  g.add(standCover);
  // 穴の むこうは こい 色(穴が よく 見える)
  const standStack = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, D + 0.05, 0.2), toonMaterial(0x4a2e1e));
  standStack.position.set(0, D / 2, -0.2);
  g.add(standStack);
  // せ(とじめ)
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, W + 0.6, 12).rotateZ(Math.PI / 2), cover);
  spine.position.set(0, -0.2, -0.3);
  g.add(spine);
  // 机の ランプ(右奥)と インク・羽ペン(左)
  const lamp = new THREE.Group();
  lamp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.2, 14), toonMaterial(0x6a4a2a)));
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8), toonMaterial(0x6a4a2a));
  arm.position.y = 1.6;
  lamp.add(arm);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 1.2, 16, 1, true), new THREE.MeshToonMaterial({ color: 0xffd9a0, gradientMap: toonGradient, side: THREE.DoubleSide }));
  shade.position.y = 3.4;
  lamp.add(shade);
  lamp.position.set(W / 2 + 2.6, -0.35, -1.2);
  g.add(lamp);
  const ink = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.7, 10), toonMaterial(0x2f4a3a));
  ink.position.set(-W / 2 - 2.0, 0, 0.5);
  const quill = new THREE.Mesh(new THREE.ConeGeometry(0.18, 2.2, 6), toonMaterial(0xf6f0e0));
  quill.position.set(-W / 2 - 1.85, 1.2, 0.4);
  quill.rotation.z = -0.35;
  g.add(ink, quill);
  // つみあげた 本(左奥)
  for (let k = 0; k < 4; k++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.4 - k * 0.15, 0.45, 1.8), toonMaterial(bookCols[(k * 3) % bookCols.length]));
    b.position.set(-W / 2 - 2.4, -0.15 + k * 0.45, -2.6);
    b.rotation.y = (k % 2 ? 0.15 : -0.1);
    g.add(b);
  }
  mergeStatic(g);
  scene.add(g);

  // ランプの あかり(やわらかい 光の まる)
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,220,150,.55)');
    gr.addColorStop(1, 'rgba(255,220,150,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(7);
  glow.position.set(W / 2 + 2.6, 2.6, -1.2);
  scene.add(glow);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
  pool.position.set(W / 2 + 1.2, -0.33, 0.5);
  scene.add(pool);
  // 手前の ページ(床): 紙の 絵
  const floorPage = (() => {
    const c = document.createElement('canvas');
    c.width = Math.round(W * 64);
    c.height = Math.round(D * 64);
    paper(c.getContext('2d'), c.width, c.height, 7);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: t, gradientMap: toonGradient }));
    m.position.set(0, 0, D / 2);
    m.receiveShadow = true;
    return m;
  })();
  scene.add(floorPage);
  return { group: g, floorPage, glow };
}
