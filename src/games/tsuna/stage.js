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
import { grassTexture } from '../daruma/ground.js';
import { buildForestTrees, makeRand } from '../daruma/trees.js';

export const STREAM_W = 0.7; // 小川の はばの半分
export const WATER_Y = -0.28;
export const FRONT = 1.25; // いちばん前の子の 小川の まん中からの きょり
export const GAP = 0.78; // チームの子どうしの間
export const HOST = { x: 0, z: -5.6, top: 1.3 };
export const SEATS = [
  { x: -2.6, z: -4.4, kind: 'risu' }, { x: -4.0, z: -3.6, kind: 'komadori' },
  { x: 2.6, z: -4.4, kind: 'harinezumi' }, { x: 4.0, z: -3.6, kind: 'risu' },
];
export const STUMP_TOP = 0.42;

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

function buildGround(g) {
  const grass = new THREE.MeshToonMaterial({ map: grassTexture(), color: 0xa8d080, gradientMap: toonGradient });
  for (const sx of [-1, 1]) {
    const bank = new THREE.Mesh(new THREE.PlaneGeometry(60, 80).rotateX(-Math.PI / 2), grass);
    bank.position.set(sx * (30 + STREAM_W + 0.4), 0, -10);
    bank.receiveShadow = true;
    g.add(bank);
    // 小川へ下る 土手(土の色)
    const drop = -(WATER_Y - 0.3);
    const slope = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(0.4, drop), 80).rotateX(-Math.PI / 2).rotateZ(sx * Math.atan2(drop, 0.4)), toonMaterial(0xb08a5a));
    slope.position.set(sx * (STREAM_W + 0.2), -drop / 2, -10);
    g.add(slope);
  }
  // 川底
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(STREAM_W * 2 + 0.4, 80).rotateX(-Math.PI / 2), toonMaterial(0x8a7a5a));
  bed.position.set(0, WATER_Y - 0.3, -10);
  g.add(bed);
  // 小石(川原)と 平たい石(小川の中)
  const rand = makeRand(9);
  const stones = [0xbdb6a8, 0xa8a090, 0xd0c8b8];
  for (let i = 0; i < 120; i++) {
    const sx = rand() < 0.5 ? -1 : 1;
    const x = sx * (STREAM_W + 0.4 + Math.pow(rand(), 1.5) * 3.5), z = -rand() * 26 + 6;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06 + rand() * 0.1, 0), toonMaterial(stones[i % 3]));
    m.position.set(x, 0.02, z);
    m.scale.y = 0.5;
    g.add(m);
  }
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25 + rand() * 0.2, 0.3 + rand() * 0.2, 0.15, 9), toonMaterial(0x9a948a));
    m.position.set((rand() - 0.5) * STREAM_W * 1.6, WATER_Y - 0.02, -rand() * 24 + 4);
    m.scale.z = 0.7;
    m.rotation.y = rand() * 6;
    g.add(m);
  }
  // 草花
  const fl = [0xffffff, 0xffe066, 0xff9ab8, 0xc8a8ff];
  for (let i = 0; i < 70; i++) {
    const sx = rand() < 0.5 ? -1 : 1;
    const x = sx * (STREAM_W + 1 + rand() * 9), z = -rand() * 18 + 2;
    if (Math.abs(z) < 0.9 && Math.abs(x) < 6) continue; // つなの ところは あける
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), toonMaterial(fl[i % 4]));
    f.position.set(x, 0.12, z);
    g.add(f);
  }
}

// 先生の岩と、観客の切り株、まわりの森
function buildSurroundings(g) {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0, 1), toonMaterial(0x9a948a));
  rock.position.set(HOST.x, HOST.top - 0.55, HOST.z);
  rock.scale.set(1.2, 0.8, 1);
  g.add(rock);
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
  mergeStatic(g);
  scene.add(g);
  // 水面(流すので まとめない)
  const water = new THREE.Mesh(new THREE.PlaneGeometry(STREAM_W * 2 + 0.3, 80).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: waterTexture(), gradientMap: toonGradient, transparent: true, opacity: 0.88 }));
  water.position.set(0, WATER_Y, -10);
  water.receiveShadow = true;
  scene.add(water);
  return { group: g, water };
}
