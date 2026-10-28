// 森の学校の けしごむ大戦 の 会場(見た目だけ)。
//
// どんぐりの 森の 教室。大きな 木の つくえの 上が たたかいの ばしょ。つくえの 天板は 小さな 板の
// ならびで できて いて、せまく なると はしから ぽろぽろ くずれて おちる。
// まわりは 教室の ゆか・黒板・まど(そとは 森)・ほかの つくえ。
//
// 座標: ルールの (x, y) → 世界の (x, DESK_Y, -y)。カメラは 上から。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { RULES, SHAPES } from './rules.js';

export const DESK_Y = 0.9; // 天板の 上の 高さ
const TILE = 0.5; // 天板の 板 1まい
const toWorld = (x, y, out = new THREE.Vector3()) => out.set(x, DESK_Y, -y);
export { toWorld };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const glowTex = canvasTex(64, 64, (g) => {
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
});

// けしごむ: かたちごとに 白っぽい ゴムの からだと、プレイヤーの 色の 紙の スリーブ
const H = 0.5; // けしごむの あつさ
function roundedBox(w, d, h, r) {
  const sh = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  sh.moveTo(x + r, y);
  sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r);
  sh.lineTo(x + w, y + d - r); sh.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  sh.lineTo(x + r, y + d); sh.quadraticCurveTo(x, y + d, x, y + d - r);
  sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(sh, { depth: h - 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.04, 0);
  return g;
}
export function eraserMesh(kind, color) {
  const g = new THREE.Group();
  const rubber = new THREE.MeshToonMaterial({ color: 0xfafaf2, gradientMap: toonGradient });
  const sleeve = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient });
  const sh = SHAPES[kind];
  // ルールの (x, y) → けしごむの 中の (x, -z)
  if (kind === 'kaku' || kind === 'naga') {
    const xs = sh.circles.map((c) => c[0]), ys = sh.circles.map((c) => c[1]), r = sh.circles[0][2];
    const w = Math.max(...xs) - Math.min(...xs) + r * 2, d = Math.max(...ys) - Math.min(...ys) + r * 2;
    g.add(new THREE.Mesh(roundedBox(w, d, H, 0.18), rubber));
    // スリーブ(まん中 6わり)
    const sl = new THREE.Mesh(new THREE.BoxGeometry(w * (kind === 'naga' ? 0.55 : 0.62), H * 0.7, d + 0.04), sleeve);
    sl.position.y = H * 0.48;
    g.add(sl);
  } else if (kind === 'maru') {
    const r = sh.circles[0][2];
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, H, 28), rubber);
    body.position.y = H / 2;
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.02, r + 0.02, H * 0.45, 28, 1, true), sleeve);
    sl.material.side = THREE.DoubleSide;
    sl.position.y = H / 2;
    g.add(body, sl);
  } else {
    // どんぐり: 大きい まる(み)と 小さい まる(ぼうし)
    const [[x0, y0, r0], [x1, y1, r1]] = sh.circles;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0, H, 24), new THREE.MeshToonMaterial({ color: 0xf4e2c0, gradientMap: toonGradient }));
    body.position.set(x0, H / 2, -y0);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r1, r1, H * 1.05, 20), new THREE.MeshToonMaterial({ color: 0x9a6a3a, gradientMap: toonGradient }));
    cap.position.set(x1, H * 0.52, -y1);
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 0.02, r0 + 0.02, H * 0.45, 24, 1, true), sleeve);
    sl.material.side = THREE.DoubleSide;
    sl.position.set(x0, H / 2, -y0);
    g.add(body, cap, sl);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { sleeve };
  return g;
}
export const ERASER_H = H;

// 天板の 木目
const grainTex = canvasTex(128, 128, (c, w, h) => {
  c.fillStyle = '#ecc488'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    c.strokeStyle = `rgba(${130 + (i % 3) * 10},80,40,${0.12 + (i % 4) * 0.04})`;
    c.lineWidth = 1 + (i % 3);
    c.beginPath();
    const y = (i / 26) * h;
    c.moveTo(0, y);
    for (let x = 0; x <= w; x += 16) c.lineTo(x, y + Math.sin(x * 0.05 + i) * 3);
    c.stroke();
  }
});

export function buildStage(scene) {
  const group = new THREE.Group();
  const [W, D] = RULES.desk;
  // ゆか(教室の 板の ま)
  const floorTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#6a7a8a'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#62727f' : '#71818f'; c.fillRect(0, i * 32, w, 31); }
    c.fillStyle = 'rgba(60,30,10,.25)'; for (let i = 0; i < 8; i++) c.fillRect(0, i * 32 + 31, w, 1);
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(8, 8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: floorTex, gradientMap: toonGradient }));
  floor.position.y = -6;
  floor.receiveShadow = true;
  floor.userData.noMerge = true;
  group.add(floor);
  // つくえの あし と わく(天板の 下)
  const legMat = toonMaterial(0x7a4e2e);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), legMat);
    leg.position.set(sx * (W / 2 - 0.6), DESK_Y - 3.3, sz * (D / 2 - 0.6));
    group.add(leg);
  }
  // 天板の まわりの こい ふち(わくだけ。中は 板が くずれると あなに なる)
  const rimMat = toonMaterial(0x6a4024);
  for (const [w, d, x, z] of [[W + 0.5, 0.25, 0, D / 2 + 0.125], [W + 0.5, 0.25, 0, -D / 2 - 0.125], [0.25, D, W / 2 + 0.125, 0], [0.25, D, -W / 2 - 0.125, 0]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.46, d), rimMat);
    r.position.set(x, DESK_Y - 0.2, z);
    group.add(r);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W - 1.2, 0.5, D - 1.2), toonMaterial(0x8a5a32));
  frame.position.y = DESK_Y - 0.6;
  group.add(frame);
  // まわりの 教室(黒板・まど・ほかの つくえ)
  const board = new THREE.Mesh(new THREE.BoxGeometry(18, 6, 0.3), toonMaterial(0x2f5a3e));
  board.position.set(0, 2, -16);
  const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(18.8, 6.8, 0.2), toonMaterial(0x8a5a32));
  boardFrame.position.set(0, 2, -16.2);
  const chalk = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = 'rgba(0,0,0,0)'; c.clearRect(0, 0, w, h);
    c.fillStyle = '#f4f4e8'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('けしごむ たいかい', w / 2, h / 2);
  }), transparent: true }));
  chalk.position.set(0, 2.6, -15.8);
  chalk.userData.noMerge = true;
  group.add(board, boardFrame, chalk);
  for (const [x, z] of [[-14, -6], [14, -6], [-14, 8], [14, 8], [0, 14]]) {
    const top = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 4), toonMaterial(0xc89a62));
    top.position.set(x, DESK_Y - 1.4, z);
    group.add(top);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 0.3), legMat);
      leg.position.set(x + sx * 2.6, DESK_Y - 4, z + sz * 1.6);
      group.add(leg);
    }
  }
  // まど(そとは 森の みどり)
  for (const z of [-9, -2, 5]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), new THREE.MeshBasicMaterial({ color: 0x9fd28a }));
    win.position.set(-19.8, 2, z);
    win.rotation.y = Math.PI / 2;
    const wf = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.6, 6.6), toonMaterial(0xf2e6d0));
    wf.position.set(-20, 2, z);
    group.add(wf, win);
  }
  mergeStatic(group, (o) => o.userData.noMerge);
  group.traverse((o) => { if (o.name === 'merged') o.castShadow = o.receiveShadow = true; });
  scene.add(group);

  // 天板: 小さな 板の ならび(せまく なると はしから くずれて おちる)
  const nx = Math.round(W / TILE), nz = Math.round(D / TILE);
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE * 0.98, 0.4, TILE * 0.98), new THREE.MeshToonMaterial({ map: grainTex, gradientMap: toonGradient }), nx * nz);
  tiles.receiveShadow = true;
  const tileInfo = [];
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = -W / 2 + (i + 0.5) * TILE, y = -D / 2 + (j + 0.5) * TILE;
    const k = tileInfo.length;
    tileInfo.push({ x, y, fall: -1, spin: (Math.random() - 0.5) * 6, warn: 0 });
    dummy.position.set(x, DESK_Y - 0.2, -y);
    dummy.updateMatrix();
    tiles.setMatrixAt(k, dummy.matrix);
    col.setHex(((i + j) % 2) ? 0xffffff : 0xf2e6d6);
    tiles.setColorAt(k, col);
  }
  scene.add(tiles);
  // ふちの 線(いまの つくえの はし。くずれる まえに 赤く 光る)
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), new THREE.LineBasicMaterial({ color: 0xff6a3a, transparent: true, opacity: 0 }));
  edge.position.y = DESK_Y + 0.01;
  scene.add(edge);

  // 天板を いまの 大きさに あわせる(はみ出た 板は くずれて おちる)。もうすぐ くずれる 板は 赤っぽく
  const BASE = new THREE.Color(0xffffff), WARN = new THREE.Color(0xff8a6a);
  function updateDesk(half, nextHalf, dt, t) {
    let dropped = 0;
    tileInfo.forEach((d, k) => {
      const outside = Math.abs(d.x) > half[0] || Math.abs(d.y) > half[1];
      if (outside && d.fall < 0) { d.fall = 0; dropped++; }
      const soon = !outside && (Math.abs(d.x) > nextHalf[0] || Math.abs(d.y) > nextHalf[1]);
      if (d.fall >= 0) {
        d.fall += dt;
        if (d.fall > 3) return;
        const f = d.fall;
        dummy.position.set(d.x, DESK_Y - 0.2 - f * f * 6, -d.y);
        dummy.rotation.set(f * d.spin, 0, f * d.spin * 0.6);
        dummy.scale.setScalar(f > 2.5 ? Math.max(0.01, 1 - (f - 2.5) * 2) : 1);
        dummy.updateMatrix();
        tiles.setMatrixAt(k, dummy.matrix);
      } else if (soon !== d.warn) {
        d.warn = soon;
      }
      if (d.fall < 0) {
        const blink = d.warn ? 0.5 + 0.5 * Math.sin(t * 10) : 0;
        col.copy(BASE).lerp(WARN, blink * 0.8);
        tiles.setColorAt(k, col);
      }
    });
    tiles.instanceMatrix.needsUpdate = true;
    tiles.instanceColor.needsUpdate = true;
    edge.scale.set(half[0] * 2, 1, half[1] * 2);
    edge.material.opacity = half[0] < W / 2 - 0.01 ? 0.5 + Math.sin(t * 6) * 0.3 : 0;
    return dropped;
  }
  function reset() {
    tileInfo.forEach((d, k) => {
      d.fall = -1; d.warn = false;
      dummy.position.set(d.x, DESK_Y - 0.2, -d.y);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      tiles.setMatrixAt(k, dummy.matrix);
    });
    tiles.instanceMatrix.needsUpdate = true;
  }
  function update() {}
  return { group, update, updateDesk, reset };
}
