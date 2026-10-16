// 切り株ずもう の会場「湖にうかぶ大きな切り株」。
//
// 森にかこまれた しずかな湖。まん中に、年輪の見える大きな切り株(上の面が土俵)。
// 切り株は 土俵がちぢむと いっしょに細くなる(ふちが けずれて 湖へ落ちる)。
// まわりの水面に 蓮の葉と花、岸には あしと森。観客は岸の丸太の上。
//
// 座標: 切り株のまん中が原点。上の面が y = 0。水面は y = WATER_Y。カメラは +z(手前)から。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { grassTexture } from '../daruma/ground.js';
import { barkMaterial, buildForestTrees, makeRand, taperedTube } from '../daruma/trees.js';
import { MOSS, RULES } from './rules.js';

export const WATER_Y = -0.9;
export const SHORE_R = 15; // 岸の半径
const SHORE_Y = WATER_Y + 0.25;

// 観客の席: 切り株の奥の水面に うかぶ 大きな蓮の葉の上(手前はあけて、カメラから見えるように)
export const PAD_R = 0.75;
export const SEATS = [
  { a: -2.75, d: 7.4, kind: 'risu' }, { a: -2.2, d: 7.8, kind: 'harinezumi' }, { a: -1.57, d: 7.6, kind: 'komadori' },
  { a: -0.95, d: 7.8, kind: 'risu' }, { a: -0.4, d: 7.4, kind: 'harinezumi' },
].map((s) => ({ ...s, x: Math.cos(s.a) * s.d, z: Math.sin(s.a) * s.d, y: WATER_Y + 0.07 }));

// 切り株の上の面: 年輪の絵
function ringTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rand = makeRand(4);
  g.fillStyle = '#e8c48c';
  g.fillRect(0, 0, S, S);
  // 年輪: 少しゆがんだ輪を、こい色・うすい色こうごに
  for (let r = S / 2; r > 4; r -= 7 + rand() * 9) {
    g.strokeStyle = `rgba(150,96,50,${0.25 + rand() * 0.35})`;
    g.lineWidth = 1.5 + rand() * 2.5;
    g.beginPath();
    for (let k = 0; k <= 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      const rr = r * (1 + Math.sin(a * 3 + r * 0.05) * 0.015 + Math.sin(a * 7) * 0.006);
      const x = S / 2 + Math.cos(a) * rr, y = S / 2 + Math.sin(a) * rr;
      if (k) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }
  // ひび(まん中から外へ)
  g.strokeStyle = 'rgba(110,70,36,0.55)';
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2;
    g.lineWidth = 2 + rand() * 2;
    g.beginPath();
    let x = S / 2 + Math.cos(a) * 30, y = S / 2 + Math.sin(a) * 30;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += Math.cos(a + (rand() - 0.5) * 0.6) * 28; y += Math.sin(a + (rand() - 0.5) * 0.6) * 28; g.lineTo(x, y); }
    g.stroke();
  }
  // 土俵の線(白い輪。ちぢんでも見えるように、ふちのすぐ内がわ)
  g.strokeStyle = 'rgba(255,248,230,0.85)';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 14, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 水面: 青に、光のすじ(画面側で ゆっくり流す)
function waterTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#5fb3d6';
  g.fillRect(0, 0, S, S);
  const rand = makeRand(8);
  for (let i = 0; i < 60; i++) {
    const x = rand() * S, y = rand() * S, w = 10 + rand() * 30;
    g.strokeStyle = `rgba(220,245,255,${0.25 + rand() * 0.4})`;
    g.lineWidth = 1.5 + rand() * 2;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + w / 2, y - 3 - rand() * 3, x + w, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 10);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildLake(g) {
  const water = new THREE.Mesh(new THREE.CircleGeometry(SHORE_R + 1, 64).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: waterTexture(), gradientMap: toonGradient, transparent: true, opacity: 0.92 }));
  water.position.y = WATER_Y;
  water.receiveShadow = true;
  water.name = 'water';
  water.userData.noMerge = true;
  g.add(water);
  // 水の底(こい色。水が うすく すけて見える)
  const bed = new THREE.Mesh(new THREE.CircleGeometry(SHORE_R + 1, 48).rotateX(-Math.PI / 2), toonMaterial(0x2f6f86));
  bed.position.y = WATER_Y - 1.2;
  g.add(bed);
  // 岸: 水ぎわの土と、草の丘
  const rand = makeRand(17);
  const pos = [], idx = [], col = [];
  const rings = 20, segs = 80;
  const c = new THREE.Color();
  for (let r = 0; r <= rings; r++) {
    const k = r / rings;
    const rad = SHORE_R - 0.6 + k * k * 70;
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      const h = r === 0 ? WATER_Y - 0.3 : SHORE_Y + Math.min(1, (rad - SHORE_R) / 3) * 0.2 + Math.max(0, rad - SHORE_R - 8) * 0.08 * (1 + Math.sin(a * 3) * 0.4);
      pos.push(x, h, z);
      if (r <= 1) c.setHex(0x9a7a52); else c.setHSL(0.27 + Math.sin(a * 5 + rad * 0.1) * 0.02, 0.45, 0.42 - Math.min(0.08, rad * 0.001));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < rings; r++) for (let s = 0; s < segs; s++) {
    const a = r * (segs + 1) + s, b = a + segs + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const shore = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ map: grassTexture(), vertexColors: true, gradientMap: toonGradient }));
  shore.receiveShadow = true;
  g.add(shore);
  // あし(水ぎわ)
  const reedMat = toonMaterial(0x6f9a48), headMat = toonMaterial(0x7a5032);
  for (let i = 0; i < 90; i++) {
    const a = rand() * Math.PI * 2;
    if (Math.sin(a) > 0.55 && Math.abs(Math.cos(a)) < 0.6) continue; // 手前はあける
    const d = SHORE_R - 0.4 + rand() * 0.8;
    const h = 0.8 + rand() * 0.9;
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, h, 4), reedMat);
    reed.position.set(Math.cos(a) * d, WATER_Y + h / 2, Math.sin(a) * d);
    reed.rotation.set((rand() - 0.5) * 0.25, 0, (rand() - 0.5) * 0.25);
    g.add(reed);
    if (rand() < 0.5) {
      const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.18, 3, 6), headMat);
      head.position.set(reed.position.x, WATER_Y + h + 0.05, reed.position.z);
      g.add(head);
    }
  }
}

// 蓮の葉と花(水面にうかぶ)
function buildLilies(g) {
  const rand = makeRand(23);
  const leaf = toonMaterial(0x4f9a4a), leaf2 = toonMaterial(0x6fb25a);
  const petal = toonMaterial(0xffc4d8), petal2 = toonMaterial(0xffffff), mid = toonMaterial(0xffd84a);
  for (let i = 0; i < 34; i++) {
    const a = rand() * Math.PI * 2, d = RULES.r0 + 1.6 + rand() * (SHORE_R - RULES.r0 - 3);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const r = 0.35 + rand() * 0.45;
    const lf = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 16, 1, false, 0.3, Math.PI * 2 - 0.3), rand() < 0.5 ? leaf : leaf2);
    lf.position.set(x, WATER_Y + 0.02, z);
    lf.rotation.y = rand() * 6;
    g.add(lf);
    if (rand() < 0.3) {
      const fl = new THREE.Group();
      const pm = rand() < 0.5 ? petal : petal2;
      for (let k = 0; k < 8; k++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), pm);
        p.scale.set(0.5, 0.35, 1);
        const pa = (k / 8) * Math.PI * 2;
        p.position.set(Math.cos(pa) * 0.09, 0.08, Math.sin(pa) * 0.09);
        p.rotation.y = -pa;
        p.rotation.x = 0.6;
        fl.add(p);
      }
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mid);
      m.position.y = 0.09;
      fl.add(m);
      fl.position.set(x + r * 0.3, WATER_Y + 0.03, z);
      g.add(fl);
    }
  }
}

// 岸の森と、観客の丸太
function buildShore(g) {
  const rand = makeRand(41);
  const spots = [];
  for (let i = 0; i < 120; i++) {
    const a = rand() * Math.PI * 2, d = SHORE_R + 4 + rand() * 30;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (z > 8 && Math.abs(x) < 12) continue; // カメラのうしろは あける
    const h = SHORE_Y + 0.2 + Math.max(0, d - SHORE_R - 8) * 0.08 * (1 + Math.sin(a * 3) * 0.4);
    spots.push({ x, y: h, z, h: 4 + rand() * 5, kind: rand() < 0.35 ? 'pine' : 'broad' });
  }
  buildForestTrees(g, spots);
  // 手前の岸の 小さな桟橋(カメラの下)
  const plank = toonMaterial(0xb8864e);
  for (let k = 0; k < 6; k++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.32), plank);
    p.position.set(0, SHORE_Y + 0.12, SHORE_R - 0.2 - k * 0.36);
    g.add(p);
  }
}

// 切り株(土俵)。大きさは画面側で s.radius に合わせて変える
function buildStump() {
  const stump = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: ringTexture(), gradientMap: toonGradient }));
  top.receiveShadow = true;
  const H = -WATER_Y + 1.6; // 水の下まで
  const side = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.06, H, 48, 1, true), barkMaterial(0x8a5a3a, 6, 1));
  side.position.y = -H / 2;
  side.receiveShadow = true;
  // ふちの皮(少し もりあがった輪)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 64).rotateX(Math.PI / 2), toonMaterial(0x6a4426));
  rim.position.y = -0.01;
  stump.add(top, side, rim);
  // 根: 切り株のすそから 水の中へ のびる(土俵といっしょに細くなる)
  const rootMat = barkMaterial(0x7a4e32, 1, 2);
  const rand = makeRand(61);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rand() * 0.3;
    const pts = [
      new THREE.Vector3(Math.cos(a) * 0.96, -0.25, Math.sin(a) * 0.96),
      new THREE.Vector3(Math.cos(a) * 1.12, WATER_Y + 0.25, Math.sin(a) * 1.12),
      new THREE.Vector3(Math.cos(a + 0.05) * 1.3, WATER_Y - 0.15, Math.sin(a + 0.05) * 1.3),
      new THREE.Vector3(Math.cos(a + 0.1) * 1.38, WATER_Y - 0.3, Math.sin(a + 0.1) * 1.38),
    ];
    const root = new THREE.Mesh(taperedTube(pts, 0.08 + rand() * 0.03, 0.025, 7), rootMat);
    stump.add(root);
  }
  // 水ぎわの あわ(画面側で ゆらす)
  const foam = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.16, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
  foam.position.y = WATER_Y + 0.02;
  foam.renderOrder = 2;
  stump.add(foam);
  // こけ(すべる場所)。ちぢむと外のものは見えなくなる(画面側で)
  const mossTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const rand = makeRand(9);
    // こい地の上に、明るい ふさを重ねる。外ほど まばらに
    for (let i = 0; i < 420; i++) {
      const a = rand() * Math.PI * 2, d = Math.pow(rand(), 0.7) * 60;
      const dark = rand() < 0.45;
      const g = dark ? 95 + rand() * 30 : 140 + rand() * 50;
      x.fillStyle = `rgba(${dark ? 50 + rand() * 20 : 90 + rand() * 40},${g},${dark ? 40 : 50 + rand() * 20},${(0.6 + rand() * 0.4) * (1 - d / 75)})`;
      x.beginPath();
      x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + rand() * 5, 0, Math.PI * 2);
      x.fill();
    }
    // しめった つや(白い点)
    for (let i = 0; i < 30; i++) {
      x.fillStyle = 'rgba(230,255,220,0.5)';
      x.fillRect(30 + rand() * 68, 30 + rand() * 68, 2, 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const mosses = MOSS.map((m) => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(RULES.mossR * 1.05, 24).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: mossTex, transparent: true, depthWrite: false, gradientMap: toonGradient }));
    mesh.position.set(m.x, 0.01, m.z);
    mesh.renderOrder = 1;
    mesh.receiveShadow = true;
    return mesh;
  });
  return { stump, top, side, rim, mosses, foam };
}

// 観客の乗る 大きな蓮の葉(ぷかぷか動かすので、まとめない)
function buildPads(scene) {
  const mat = toonMaterial(0x5aa04e), vein = toonMaterial(0x4a8a40);
  return SEATS.map((s) => {
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(PAD_R, PAD_R, 0.05, 24, 1, false, 0.25, Math.PI * 2 - 0.25), mat);
    g.add(pad);
    for (let k = 0; k < 6; k++) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(PAD_R * 0.9, 0.012, 0.025), vein);
      v.position.y = 0.03;
      v.rotation.y = (k / 6) * Math.PI * 2 + 0.6;
      v.position.x = Math.cos(-v.rotation.y) * PAD_R * 0.45;
      v.position.z = Math.sin(-v.rotation.y) * PAD_R * 0.45;
      g.add(v);
    }
    g.position.set(s.x, WATER_Y + 0.02, s.z);
    g.rotation.y = s.a;
    g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    scene.add(g);
    return g;
  });
}

export function buildStage(scene) {
  const g = new THREE.Group();
  buildLake(g);
  buildLilies(g);
  buildShore(g);
  mergeStatic(g, (o) => o.name === 'water');
  scene.add(g);
  const s = buildStump();
  scene.add(s.stump);
  for (const m of s.mosses) scene.add(m);
  const pads = buildPads(scene);
  return { group: g, water: g.getObjectByName('water'), pads, ...s };
}
