// 川原の つなひき の会場「小川を はさんだ 川原」。
//
// 手前から奥へ 小川が ながれ(x = 0 のまわり)、左右の 草の川原に チームが ならぶ。
// 小川には 平たい石と 水しぶき、川原には 小石と 草花。奥の 大きな岩の上に ホーホー先生(合図の係)。
// まわりは 森。観客は 左右の 奥の 切り株の上。
//
// 座標: 小川の まん中が x = 0。L チームは -x、R チームは +x。カメラは +z(手前)から。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { grassTexture, scatterFoliage } from '../daruma/ground.js';
import { addWind } from '../daruma/atmosphere.js';
import { buildForestTrees, makeRand } from '../daruma/trees.js';

export const STREAM_W = 0.7; // 小川の はばの半分
export const WATER_Y = -0.28;
export const FRONT = 1.25; // いちばん前の子の 小川の まん中からの きょり
export const GAP = 0.68; // チームの子どうしの間
export const HOST = { x: 0, z: -5.6, top: 0.95 };
export const SEATS = [
  { x: -2.6, z: -4.4, kind: 'risu' }, { x: -4.0, z: -3.6, kind: 'komadori' },
  { x: 2.6, z: -4.4, kind: 'harinezumi' }, { x: 4.0, z: -3.6, kind: 'risu' },
];
export const STUMP_TOP = 0.42;
const GRAVEL = 4.6; // 小石の 帯の はし(x)

// 川原の高さ: 小川へ むかって ゆるく 下がる
export function groundY(x) {
  const d = Math.abs(x);
  if (d < STREAM_W) return WATER_Y - 0.3;
  if (d < STREAM_W + 0.4) return (WATER_Y - 0.3) * (1 - (d - STREAM_W) / 0.4);
  return 0;
}

function waterTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#6cc0dc';
  g.fillRect(0, 0, 128, 128);
  const rand = makeRand(6);
  for (let i = 0; i < 40; i++) {
    const x = rand() * 128, y = rand() * 128, l = 10 + rand() * 25;
    g.strokeStyle = `rgba(230,250,255,${0.3 + rand() * 0.4})`;
    g.lineWidth = 1.5 + rand() * 1.5;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 2, y + l / 2, x, y + l); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 12);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 川原の 小石(水ぎわの 帯の 模様)
function gravelTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#cfc4ae';
  g.fillRect(0, 0, 256, 256);
  const rand = makeRand(12);
  const cols = ['#e6dccb', '#b8ad98', '#d8cdb8', '#a89e8a', '#efe7d8', '#c2b49a'];
  for (let i = 0; i < 520; i++) {
    const x = rand() * 256, y = rand() * 256, r = 2 + rand() * 6;
    g.fillStyle = cols[i % cols.length];
    g.beginPath(); g.ellipse(x, y, r, r * (0.6 + rand() * 0.3), rand() * 3, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 水面の きらめき(水より 速く 流す、うすい 層)
function sparkleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rand = makeRand(17);
  g.fillStyle = '#fff';
  for (let i = 0; i < 26; i++) {
    const x = rand() * 128, y = rand() * 128, s = 1.5 + rand() * 2.5;
    g.globalAlpha = 0.5 + rand() * 0.5;
    g.beginPath(); g.moveTo(x, y - s * 2); g.lineTo(x + s, y); g.lineTo(x, y + s * 2); g.lineTo(x - s, y); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1.5, 18);
  return t;
}

// ススキ: 細い葉の束と、先に ふわふわの 穂。風で ゆれる
function susukiGeometry() {
  const pos = [];
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, lean = 0.12 + (i % 3) * 0.08, h = 0.7 + (i % 4) * 0.12, w = 0.025;
    const tx = Math.cos(a) * lean, tz = Math.sin(a) * lean, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    pos.push(px, 0, pz, -px, 0, -pz, tx, h, tz, -px, 0, -pz, px, 0, pz, tx, h, tz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const n = [];
  for (let i = 0; i < pos.length / 3; i++) n.push(0, 1, 0);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  return g;
}
function plumeGeometry() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.4, lean = 0.1 + (i % 2) * 0.1;
    const p = new THREE.ConeGeometry(0.045, 0.32, 5).translate(0, -0.16, 0).rotateX(Math.PI);
    p.rotateZ(Math.cos(a) * 0.5).rotateX(Math.sin(a) * 0.5);
    p.translate(Math.cos(a) * lean * 1.4, 1.05 + (i % 3) * 0.08, Math.sin(a) * lean * 1.4);
    parts.push(p.toNonIndexed());
  }
  const pos = [];
  for (const q of parts) pos.push(...q.attributes.position.array);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function buildGround(g) {
  const grass = new THREE.MeshToonMaterial({ map: grassTexture(), color: 0xa8d080, gradientMap: toonGradient });
  const gravel = new THREE.MeshToonMaterial({ map: gravelTexture(), gradientMap: toonGradient });
  gravel.map.repeat.set(1.2, 30);
  const drop = -(WATER_Y - 0.3);
  for (const sx of [-1, 1]) {
    const bank = new THREE.Mesh(new THREE.PlaneGeometry(60, 80).rotateX(-Math.PI / 2), grass);
    bank.position.set(sx * (30 + GRAVEL), 0, -10);
    bank.receiveShadow = true;
    g.add(bank);
    // 水ぎわの 小石の 帯(つなひきの 足場)。草との さかいは でこぼこ
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(GRAVEL - STREAM_W - 0.4 + 0.3, 80).rotateX(-Math.PI / 2), gravel);
    strip.position.set(sx * ((STREAM_W + 0.4 + GRAVEL + 0.3) / 2), 0.004, -10);
    strip.receiveShadow = true;
    g.add(strip);
    const rand = makeRand(sx > 0 ? 41 : 42);
    for (let z = 8; z > -40; z -= 0.7) {
      const blob = new THREE.Mesh(new THREE.CircleGeometry(0.35 + rand() * 0.35, 9).rotateX(-Math.PI / 2), grass);
      blob.position.set(sx * (GRAVEL + 0.15 + (rand() - 0.5) * 0.4), 0.008, z + rand() * 0.4);
      blob.receiveShadow = true;
      g.add(blob);
    }
    // 小川へ 下る 土手(土の色)
    const slope = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(0.4, drop), 80).rotateX(-Math.PI / 2).rotateZ(sx * Math.atan2(drop, 0.4)), toonMaterial(0x9a7a50));
    slope.position.set(sx * (STREAM_W + 0.2), -drop / 2, -10);
    g.add(slope);
  }
  // 川底
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(STREAM_W * 2 + 0.4, 80).rotateX(-Math.PI / 2), toonMaterial(0x7a6a4a));
  bed.position.set(0, WATER_Y - 0.3, -10);
  g.add(bed);
  const rand = makeRand(9);
  // 水ぎわの 大きめの 石
  const stones = [0xbdb6a8, 0xa8a090, 0xd0c8b8];
  for (let i = 0; i < 46; i++) {
    const sx = rand() < 0.5 ? -1 : 1;
    const z = -rand() * 30 + 6;
    if (Math.abs(z) < 0.9 && i % 2) continue;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1 + rand() * 0.14, 0), toonMaterial(stones[i % 3]));
    m.position.set(sx * (STREAM_W + 0.3 + rand() * 0.3), -0.03, z);
    m.scale.y = 0.6;
    m.rotation.set(rand() * 3, rand() * 3, 0);
    g.add(m);
  }
  // 小川の中の 平たい石と、まわりの 白い あわ
  const foam = new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.75 });
  for (let i = 0; i < 16; i++) {
    const r = 0.18 + rand() * 0.16;
    const x = (rand() - 0.5) * STREAM_W * 1.3, z = -rand() * 26 + 6;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.06, 0.2, 9), toonMaterial(0x9a948a));
    m.position.set(x, WATER_Y - 0.04, z);
    m.scale.z = 0.7;
    m.rotation.y = rand() * 0.5;
    g.add(m);
    const ring = new THREE.Mesh(new THREE.RingGeometry(r + 0.02, r + 0.09, 14).rotateX(-Math.PI / 2), foam);
    ring.position.set(x, WATER_Y + 0.012, z);
    ring.scale.z = 0.75;
    g.add(ring);
    // 下流(手前)へ のびる あわの すじ
    for (const s of [-1, 1]) {
      const wake = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.6).rotateX(-Math.PI / 2), foam);
      wake.position.set(x + s * r * 0.8, WATER_Y + 0.011, z + r * 0.5 + 0.3);
      wake.rotation.y = s * 0.25;
      g.add(wake);
    }
  }
  // 岸に 生える ガマ(水ぎわ)
  const reedMat = toonMaterial(0x6f9a48), headMat = toonMaterial(0x7a5032);
  for (let i = 0; i < 40; i++) {
    const sx = rand() < 0.5 ? -1 : 1;
    const z = -rand() * 26 + 5;
    if (Math.abs(z) < 1.4) continue; // つなの ところは あける
    const h = 0.7 + rand() * 0.5;
    const x = sx * (STREAM_W + 0.05 + rand() * 0.2);
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, h, 4), reedMat);
    reed.position.set(x, WATER_Y + h / 2 - 0.1, z);
    reed.rotation.set((rand() - 0.5) * 0.25, 0, (rand() - 0.5) * 0.25 + sx * 0.1);
    g.add(reed);
    if (rand() < 0.6) {
      const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.16, 3, 6), headMat);
      head.position.set(x + sx * 0.05, WATER_Y + h - 0.1, z);
      g.add(head);
    }
  }
  // 草の株・花・石(森の 川原ぜんたい)
  const free = (x, z) => Math.abs(x) > GRAVEL + 0.1 && !(Math.abs(z) < 1.2 && Math.abs(x) < 4.4) && z < 7;
  scatterFoliage(g, { isFree: free, heightAt: () => 0, pathEdge: () => 0, pathFrom: 0, pathTo: 0 });
  // ススキの むれ(川原の うしろ と 手前の はし)
  const spots = [];
  for (let k = 0; k < 16; k++) {
    const sx = k % 2 ? 1 : -1;
    const cx = sx * (GRAVEL + 0.8 + rand() * 5), cz = 3 - rand() * 16;
    if (Math.abs(cz) < 1.6 && Math.abs(cx) < 5) continue;
    for (let i = 0; i < 6; i++) spots.push([cx + (rand() - 0.5) * 1.4, cz + (rand() - 0.5) * 1.0, 0.7 + rand() * 0.5]);
  }
  const stalkMat = toonMaterial(0x9ab060);
  stalkMat.side = THREE.DoubleSide;
  const plumeMat = toonMaterial(0xf0e2c0);
  addWind(stalkMat, { amount: 0.12, mode: 'tip' });
  addWind(plumeMat, { amount: 0.12, mode: 'tip' });
  const stalks = new THREE.InstancedMesh(susukiGeometry(), stalkMat, spots.length);
  const plumes = new THREE.InstancedMesh(plumeGeometry(), plumeMat, spots.length);
  const dummy = new THREE.Object3D();
  spots.forEach(([x, z, s], i) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, rand() * 6, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    stalks.setMatrixAt(i, dummy.matrix);
    plumes.setMatrixAt(i, dummy.matrix);
  });
  g.add(stalks, plumes);
}

// 上流の 小さな 木の橋
function buildBridge(g) {
  const wood = toonMaterial(0xa87848), dark = toonMaterial(0x7a5032);
  const z = -13, n = 11, span = STREAM_W * 2 + 2.2;
  for (let i = 0; i < n; i++) {
    const x = -span / 2 + (i + 0.5) * (span / n);
    const y = 0.12 + Math.cos((x / span) * Math.PI) * 0.35;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(span / n - 0.03, 0.06, 1.1), wood);
    plank.position.set(x, y, z);
    plank.rotation.z = -Math.sin((x / span) * Math.PI) * 0.45;
    g.add(plank);
  }
  for (const sz of [-1, 1]) {
    for (const px of [-1, -0.33, 0.33, 1]) {
      const x = (px * span) / 2.1;
      const y = 0.12 + Math.cos((x / span) * Math.PI) * 0.35;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.5, 6), dark);
      post.position.set(x, y + 0.25, z + sz * 0.5);
      g.add(post);
    }
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const x = -span / 2.1 + (i / 10) * (span / 1.05);
      pts.push(new THREE.Vector3(x, 0.12 + Math.cos((x / span) * Math.PI) * 0.35 + 0.48, z + sz * 0.5));
    }
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.03, 5), wood);
    g.add(rail);
  }
}

// 先生の岩と、観客の切り株、まわりの森
function buildSurroundings(g) {
  // 小川の まん中の 大岩(先生の 台)。こけと 小さな 石を そえる
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0, 1), toonMaterial(0x9a948a));
  rock.position.set(HOST.x, HOST.top - 0.62, HOST.z);
  rock.scale.set(1.15, 0.72, 0.95);
  g.add(rock);
  const moss = toonMaterial(0x6a9a40);
  for (const [dx, dz, r] of [[-0.5, 0.2, 0.32], [0.45, -0.1, 0.28], [0.1, 0.55, 0.22]]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), moss);
    m.position.set(HOST.x + dx, HOST.top - 0.2 + (dx > 0 ? -0.05 : 0), HOST.z + dz);
    m.scale.y = 0.35;
    g.add(m);
  }
  for (const [dx, dz, r] of [[-0.95, 0.5, 0.3], [1.0, 0.3, 0.24], [0.7, 0.75, 0.16]]) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), toonMaterial(0xa8a090));
    m.position.set(HOST.x + dx, WATER_Y, HOST.z + dz);
    g.add(m);
  }
  for (const s of SEATS) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, STUMP_TOP, 12), toonMaterial(0x9a6a3e));
    st.position.set(s.x, STUMP_TOP / 2, s.z);
    g.add(st);
  }
  const rand = makeRand(33);
  const spots = [];
  for (let i = 0; i < 100; i++) {
    const a = rand() * Math.PI * 2, d = 10 + rand() * 30;
    const x = Math.cos(a) * d, z = Math.sin(a) * d - 6;
    if (z > 2 || Math.abs(x) < STREAM_W + 1.5) continue; // 手前と 小川の上は あける
    spots.push({ x, y: 0, z, h: 5 + rand() * 5, kind: rand() < 0.4 ? 'pine' : 'broad' });
  }
  buildForestTrees(g, spots);
}

export function buildStage(scene) {
  const g = new THREE.Group();
  buildGround(g);
  buildSurroundings(g);
  buildBridge(g);
  mergeStatic(g);
  scene.add(g);
  // 水面(流すので まとめない)
  const water = new THREE.Mesh(new THREE.PlaneGeometry(STREAM_W * 2 + 0.3, 80).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: waterTexture(), gradientMap: toonGradient, transparent: true, opacity: 0.88 }));
  water.position.set(0, WATER_Y, -10);
  water.receiveShadow = true;
  scene.add(water);
  const sparkle = new THREE.Mesh(new THREE.PlaneGeometry(STREAM_W * 2 + 0.3, 80).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: sparkleTexture(), transparent: true, opacity: 0.7, depthWrite: false }));
  sparkle.position.set(0, WATER_Y + 0.006, -10);
  scene.add(sparkle);
  return { group: g, water, sparkle };
}
