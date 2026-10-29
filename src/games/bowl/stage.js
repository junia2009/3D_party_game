// 森の 倒れ木の どんぐりボウリング の 会場(見た目だけ)。
//
// 森の 大きな 倒れ木を たてに わって、平らな 面に レーンを 5本 ほった。
// レーンは みがいた 木の 板、両がわに みぞ。おくには こけの かべと まつぼっくりの ピン。
// まわりは 木もれびの 森。
//
// 座標: レーン slot の まんなかの 線が 世界の x = laneX(slot)。投げる 線が z = 0、おくへ -z(レーンの y = -z)。
// カメラは 手前(+z)の 上から。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { acornGeometry, foliageClump, makeRand } from '../daruma/trees.js';
import { RULES } from './rules.js';

export const PITCH = 1.9; // レーンと レーンの あいだ
export const laneX = (slot) => (slot - 2) * PITCH;
// レーンの 座標 → 世界
export const toWorld = (slot, x, y, out = new THREE.Vector3()) => out.set(laneX(slot) + x, 0, -y);
const LOG_R = 5.6; // 倒れ木の 半径
const LOG_Z0 = 3.2, LOG_Z1 = -(RULES.laneL + 1.6); // 倒れ木の 手前と おく
const TOP = 0; // レーンの 面の 高さ

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
// みがいた 木の 板(たての すじ)
const laneTex = canvasTex(128, 512, (c, w, h) => {
  c.fillStyle = '#e0b878'; c.fillRect(0, 0, w, h);
  const boards = 6;
  for (let k = 0; k < boards; k++) {
    const x = (k * w) / boards;
    c.fillStyle = k % 2 ? 'rgba(160,100,40,.12)' : 'rgba(255,240,200,.12)';
    c.fillRect(x, 0, w / boards, h);
    c.fillStyle = 'rgba(110,70,30,.35)'; c.fillRect(x, 0, 1.5, h);
    for (let i = 0; i < 14; i++) { c.fillStyle = 'rgba(140,90,40,.18)'; c.fillRect(x + 3 + ((i * 7) % (w / boards - 6)), (i * 97 + k * 31) % h, 1, 30 + (i % 4) * 14); }
  }
  // ねらいの しるし(矢じるし 7つ)
  c.fillStyle = 'rgba(120,60,20,.55)';
  for (let k = 0; k < 7; k++) {
    const x = w * (0.2 + k * 0.1), y = h * 0.72;
    c.beginPath(); c.moveTo(x, y - 10); c.lineTo(x - 5, y + 4); c.lineTo(x + 5, y + 4); c.fill();
  }
});
laneTex.wrapS = laneTex.wrapT = THREE.ClampToEdgeWrapping;
// 木の 皮(倒れ木の まわり)
const barkTex = canvasTex(256, 128, (c, w, h) => {
  c.fillStyle = '#6a4a2e'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    c.strokeStyle = i % 3 ? 'rgba(40,26,14,.5)' : 'rgba(140,100,60,.35)'; c.lineWidth = 2 + (i % 3);
    const x = (i * 37) % w;
    c.beginPath(); c.moveTo(x, 0);
    for (let y = 0; y <= h; y += 16) c.lineTo(x + Math.sin(y * 0.08 + i) * 4, y);
    c.stroke();
  }
  for (let i = 0; i < 30; i++) { c.fillStyle = 'rgba(90,140,60,.35)'; c.beginPath(); c.arc((i * 53) % w, (i * 29) % h, 4 + (i % 5) * 2, 0, 7); c.fill(); }
});
barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;
barkTex.repeat.set(6, 2);
// わった 面の 年輪(手前の 切り口)
const ringTex = canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = '#d8a868'; c.fillRect(0, 0, w, h);
  for (let r = 6; r < 128; r += 7) {
    c.strokeStyle = r % 14 ? 'rgba(150,90,40,.35)' : 'rgba(120,70,30,.5)'; c.lineWidth = 2;
    c.beginPath(); c.arc(128, 128, r + Math.sin(r) * 2, 0, Math.PI * 2); c.stroke();
  }
  c.fillStyle = '#5a3a1e'; c.beginPath(); c.arc(128, 128, 128, 0, Math.PI * 2); c.lineWidth = 10; c.strokeStyle = '#5a3a1e'; c.stroke();
});

// まつぼっくりの ピン: ろくろの 形 + うろこの もよう
const scaleTex = canvasTex(64, 64, (c, w, h) => {
  c.fillStyle = '#9a6032'; c.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < w; x += 8) {
    c.fillStyle = '#6a3a1a'; c.beginPath(); c.ellipse(x + 4, y + 6, 4, 3, 0, 0, Math.PI); c.fill();
    c.fillStyle = '#c08a4a'; c.fillRect(x + 3, y + 1, 2, 2);
  }
});
scaleTex.wrapS = scaleTex.wrapT = THREE.RepeatWrapping;
scaleTex.repeat.set(3, 3);
const PIN_H = 0.42;
function pinGeometry() {
  const pts = [[0, 0], [0.045, 0.005], [0.062, 0.06], [0.07, 0.13], [0.058, 0.21], [0.034, 0.27], [0.03, 0.3], [0.042, 0.35], [0.036, 0.4], [0, PIN_H]].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 14);
}
const pinGeo = pinGeometry();
const pinMat = new THREE.MeshToonMaterial({ map: scaleTex, gradientMap: toonGradient });
const goldMat = new THREE.MeshToonMaterial({ color: 0xffd24a, emissive: 0x6a4a00, gradientMap: toonGradient, map: scaleTex });
export function pinMesh(gold = false) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(pinGeo, gold ? goldMat : pinMat);
  m.castShadow = true;
  g.add(m);
  // てっぺんの はっぱ
  const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 5), toonMaterial(gold ? 0xfff0a0 : 0x5a8a3a));
  leaf.position.y = PIN_H + 0.02;
  g.add(leaf);
  if (gold) {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd860, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(0.7);
    glow.position.y = 0.22;
    glow.name = 'glow';
    g.add(glow);
  }
  return g;
}
// どんぐりの 玉(ころがる)
const ballGeo = (() => {
  const g = acornGeometry();
  g.computeBoundingSphere();
  const k = RULES.ballR / 0.105;
  g.scale(k, k, k);
  g.translate(0, RULES.ballR, 0);
  return g;
})();
export function ballMesh() {
  const holder = new THREE.Group();
  const spin = new THREE.Group(); // ころがる 回転
  spin.position.y = RULES.ballR;
  const m = new THREE.Mesh(ballGeo, new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient }));
  m.position.y = -RULES.ballR;
  m.castShadow = true;
  spin.add(m);
  holder.add(spin);
  holder.userData.spin = spin;
  return holder;
}
// じゃまもの
export function obstacleMesh(o) {
  if (o.kind === 'stone') {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(o.r, 0), toonMaterial(0x8a8a86));
    m.scale.y = 0.7;
    m.position.y = o.r * 0.45;
    m.castShadow = true;
    return m;
  }
  // 木の こぶ
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(o.r, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), toonMaterial(0x8a5a30));
  m.scale.y = 0.6;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(o.r * 0.6, o.r * 0.12, 5, 14).rotateX(Math.PI / 2), toonMaterial(0x5a3a1e));
  ring.position.y = o.r * 0.42;
  g.add(m, ring);
  g.traverse((x) => { if (x.isMesh) x.castShadow = true; });
  return g;
}

// 会場
export function buildStage(scene) {
  const group = new THREE.Group();
  const rand = makeRand(17);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140).rotateX(-Math.PI / 2), toonMaterial(0x4f7a34));
  ground.position.y = -1.6;
  ground.receiveShadow = true;
  ground.userData.noMerge = true;
  group.add(ground);
  // 倒れ木(たてに わった 半分の まるた)。平らな 面が レーン
  const len = LOG_Z0 - LOG_Z1;
  const half = new THREE.Mesh(new THREE.CylinderGeometry(LOG_R, LOG_R, len, 28, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), new THREE.MeshToonMaterial({ map: barkTex, gradientMap: toonGradient, side: THREE.DoubleSide }));
  half.position.set(0, TOP - 0.06, (LOG_Z0 + LOG_Z1) / 2);
  half.userData.noMerge = true;
  group.add(half);
  // 平らな 面(レーンと レーンの あいだの 木の 面)
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(LOG_R * 2, len).rotateX(-Math.PI / 2), toonMaterial(0xc89058));
  deck.position.set(0, TOP - 0.05, (LOG_Z0 + LOG_Z1) / 2);
  deck.receiveShadow = true;
  deck.userData.noMerge = true;
  group.add(deck);
  // 手前の 切り口(年輪)
  const cut = new THREE.Mesh(new THREE.CircleGeometry(LOG_R, 28, 0, Math.PI).rotateZ(Math.PI), new THREE.MeshToonMaterial({ map: ringTex, gradientMap: toonGradient }));
  cut.position.set(0, TOP - 0.06, LOG_Z0);
  cut.userData.noMerge = true;
  group.add(cut);
  // レーン・みぞ・しきり
  const laneLen = RULES.laneL + 1.2;
  for (let k = 0; k < 5; k++) {
    const x = laneX(k);
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(RULES.laneW, laneLen).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: laneTex, gradientMap: toonGradient }));
    lane.position.set(x, TOP, -laneLen / 2 + 0.6);
    lane.receiveShadow = true;
    lane.userData.noMerge = true;
    group.add(lane);
    for (const sx of [-1, 1]) {
      const gut = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, laneLen, 10, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), toonMaterial(0x6a4426));
      gut.material.side = THREE.DoubleSide;
      gut.position.set(x + sx * (RULES.laneW / 2 + 0.13), TOP, -laneLen / 2 + 0.6);
      gut.rotation.z = Math.PI;
      group.add(gut);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, laneLen), toonMaterial(0x8a5a30));
      rail.position.set(x + sx * (RULES.laneW / 2 + 0.31), TOP + 0.03, -laneLen / 2 + 0.6);
      group.add(rail);
    }
    // 投げる 線
    const line = new THREE.Mesh(new THREE.PlaneGeometry(RULES.laneW, 0.05).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7a3a1a }));
    line.position.set(x, TOP + 0.004, 0);
    line.userData.noMerge = true;
    group.add(line);
    // おくの こけの かべ(ピンの うしろ)
    const back = new THREE.Mesh(new THREE.BoxGeometry(RULES.laneW + 0.6, 0.7, 0.3), toonMaterial(0x4a6a32));
    back.position.set(x, TOP + 0.3, -(RULES.laneL + 0.9));
    group.add(back);
  }
  // おくの 大きな 根っこの かべ(レーンの おわり)
  const root = new THREE.Mesh(new THREE.BoxGeometry(LOG_R * 2 + 1, 2.2, 1.2), toonMaterial(0x5a3e24));
  root.position.set(0, 0.8, LOG_Z1 - 0.3);
  group.add(root);
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.5 + rand() * 0.4, 8, 6), toonMaterial([0x3f6a2c, 0x4f7a34, 0x5a8a3a][i % 3]));
    m.position.set(-LOG_R + i * 1.25, 1.9 + rand() * 0.3, LOG_Z1 - 0.3);
    m.scale.y = 0.6;
    group.add(m);
  }
  // 森の 木
  const leafMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient });
  const crowns = [0x2f6b35, 0x3a7a3a, 0x4f8a3a].map((bottom, k) => foliageClump(rand, { detail: 1, balls: 4, bottom, top: [0x8fcf5f, 0x9ad86a, 0xb8d860][k] }));
  for (let i = 0; i < 50; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (LOG_R + 2 + rand() * 18), z = 6 - rand() * 34;
    const h = 6 + rand() * 6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, h, 7), toonMaterial(0x6a4a30));
    trunk.position.set(x, h / 2 - 1.6, z);
    const crown = new THREE.Mesh(crowns[i % 3], leafMat);
    crown.position.set(x, h - 1.6, z);
    crown.scale.setScalar(h * 0.4);
    group.add(trunk, crown);
  }
  for (let i = 0; i < 12; i++) {
    const x = (rand() - 0.5) * 24, z = LOG_Z1 - 4 - rand() * 12;
    const h = 7 + rand() * 6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, h, 7), toonMaterial(0x6a4a30));
    trunk.position.set(x, h / 2 - 1.6, z);
    const crown = new THREE.Mesh(crowns[i % 3], leafMat);
    crown.position.set(x, h - 1.6, z);
    crown.scale.setScalar(h * 0.45);
    group.add(trunk, crown);
  }
  mergeStatic(group, (o) => o.userData.noMerge);
  group.traverse((o) => { if (o.name === 'merged') o.castShadow = o.receiveShadow = true; });
  scene.add(group);
  function update() {}
  return { group, update };
}
