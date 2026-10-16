// まつぼっくり的あて の会場「森の池のほとり」。
//
// 手前の岸に木の桟橋。5人がならんで、池の向こうをねらう。
// 池にはハスの葉(水面・ガマとアシ・風の見えるもの は pond.js)。池の上には、両がわの大きな木から木へ、つるの綱が2本(手前と奥)張ってあって、
// つるされた的とハチの巣はそこから下がる。向こう岸は草の土手で、切り株の的が顔を出す。まわりは森。
//
// 座標: 桟橋のまん中の、子が立つところが原点。池は -z のほう。水面の高さは 0。

import * as THREE from 'three';
import { toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { grassTexture } from '../daruma/ground.js';
import { buildForestTrees, foliageClump, makeRand } from '../daruma/trees.js';
import { VINES, VINE_Y } from './rules.js';

export const DOCK_Z = 0; // 子が立つ桟橋の線
export const POND = { cx: 0, cz: -8.6, rx: 17, rz: 8.4 }; // 池(だ円)
export const VINE_X = 14; // つるの綱を張る木の位置(左右)

// 池の内がわほど 0 に近い(1 で岸)。だ円を少しくずす
export function pondQ(x, z) {
  const a = Math.atan2(z - POND.cz, x - POND.cx);
  const wob = 1 + Math.sin(a * 3 + 0.7) * 0.05 + Math.sin(a * 5 + 2) * 0.03;
  return Math.hypot((x - POND.cx) / POND.rx, (z - POND.cz) / POND.rz) / wob;
}
// 地面の高さ: 池の中は水の下、岸からは少しずつ上がる(向こう岸は土手)
export function groundY(x, z) {
  const q = pondQ(x, z);
  if (q < 1) return -0.9 * (1 - q) ** 0.6 - 0.05;
  const out = q - 1;
  const back = z < POND.cz ? 1 : 0.35; // 向こう岸は高く
  return Math.min(0.25 + out * 3.2 * back, 0.25 + 4 * back) + Math.sin(x * 0.3) * Math.sin(z * 0.25) * Math.min(1, out * 2) * 0.3;
}

const smooth = (t) => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

function buildGround(g) {
  const size = 200, seg = 140;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -10);
  const pos = geo.attributes.position;
  const cols = [];
  const grass = new THREE.Color(0x8ccf6a), deep = new THREE.Color(0x5f8f4e), sand = new THREE.Color(0xd9c38c), mud = new THREE.Color(0x6e7f55);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const q = pondQ(x, z);
    pos.setY(i, groundY(x, z));
    // 岸の近くは砂、水の中はどろ、はなれると森の暗い草
    c.copy(grass).lerp(deep, smooth((q - 1.6) / 1.2));
    c.lerp(sand, Math.max(0, 1 - Math.abs(q - 1.02) / 0.08) * 0.8);
    if (q < 1) c.copy(mud);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const m = toonMaterial(0xffffff);
  m.vertexColors = true;
  m.map = grassTexture();
  m.map.repeat.set(size / 6, size / 6);
  g.add(Object.assign(new THREE.Mesh(geo, m), { name: 'terrain' }));
}

// 桟橋: 板をならべて、杭で立てる
function buildDock(g) {
  const plank = toonMaterial(0xb07a4a), plank2 = toonMaterial(0x9a6a3e), post = toonMaterial(0x6b4a2e);
  const W = 13, D0 = -1.1, D1 = 1.3, top = 0.42;
  const rand = makeRand(12);
  for (let x = -W / 2; x < W / 2; x += 0.42) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, D1 - D0 + (rand() - 0.5) * 0.12), rand() < 0.5 ? plank : plank2);
    b.position.set(x + 0.21, top, (D0 + D1) / 2 + (rand() - 0.5) * 0.06);
    b.rotation.y = (rand() - 0.5) * 0.02;
    g.add(b);
  }
  for (const x of [-W / 2 + 0.2, -W / 4, 0, W / 4, W / 2 - 0.2]) {
    for (const z of [D0 + 0.12, D1 - 0.12]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.6, 8), post);
      p.position.set(x, top - 0.6, z);
      g.add(p);
    }
  }
  // 手前から岸へ渡る、短い踏み板
  const step = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 1.4), plank);
  step.position.set(0, top - 0.06, D1 + 0.7);
  g.add(step);
}

// ハスの葉(飾り): 切れこみのある円盤。ところどころに花
function buildLilies(g) {
  const rand = makeRand(55);
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.absarc(0, 0, 1, 0.25, Math.PI * 2 - 0.05, false);
  shape.lineTo(0, 0);
  const geo = new THREE.ShapeGeometry(shape, 18);
  geo.rotateX(-Math.PI / 2);
  const mats = [toonMaterial(0x5fae4a), toonMaterial(0x78c25a), toonMaterial(0x4f9a44)];
  const petal = toonMaterial(0xffb6d2), heart = toonMaterial(0xffe07a);
  for (let i = 0; i < 46; i++) {
    const x = (rand() - 0.5) * POND.rx * 1.8, z = POND.cz + (rand() - 0.5) * POND.rz * 1.8;
    if (pondQ(x, z) > 0.92 || z > -2.5) continue;
    const r = 0.35 + rand() * 0.45;
    const leaf = new THREE.Mesh(geo, mats[i % 3]);
    leaf.scale.set(r, 1, r);
    leaf.rotation.y = rand() * 6;
    leaf.position.set(x, 0.03, z);
    g.add(leaf);
    if (rand() < 0.22) {
      for (let k = 0; k < 6; k++) {
        const p = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 5), petal);
        const a = (k / 6) * Math.PI * 2;
        p.position.set(x + Math.cos(a) * 0.07, 0.12, z + Math.sin(a) * 0.07);
        p.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
        g.add(p);
      }
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), heart);
      h.position.set(x, 0.12, z);
      g.add(h);
    }
  }
}

// つるの綱: 左右の大きな木のあいだに、2本。綱にはところどころ葉っぱ
function buildVines(g) {
  const rand = makeRand(91);
  const vine = toonMaterial(0x6a5a2a), leafMat = toonMaterial(0x6dbb4f);
  const leafGeo = new THREE.SphereGeometry(0.16, 6, 4);
  leafGeo.scale(1, 0.4, 0.7);
  for (const d of VINES) {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const x = -VINE_X + (i / 24) * VINE_X * 2;
      pts.push(new THREE.Vector3(x, VINE_Y + 0.25 + Math.sin(i * 1.3) * 0.03, -d));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.07, 6), vine);
    g.add(tube);
    for (let i = 0; i < 34; i++) {
      const l = new THREE.Mesh(leafGeo, leafMat);
      l.position.set(-VINE_X + rand() * VINE_X * 2, VINE_Y + 0.25, -d + (rand() - 0.5) * 0.15);
      l.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      g.add(l);
    }
  }
  // 綱を張る大きな木(左右に2本ずつ)
  const bark = toonMaterial(0x6b4c36);
  const crown = foliageClump(rand, { detail: 2, balls: 6, bottom: 0x2f6b35, top: 0x8fcf5f });
  const crownMat = new THREE.MeshToonMaterial({ vertexColors: true });
  for (const sx of [-1, 1]) {
    for (const d of VINES) {
      const x = sx * (VINE_X + 0.4);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 8, 10), bark);
      t.position.set(x, groundY(x, -d) + 3.6, -d);
      g.add(t);
      const c = new THREE.Mesh(crown, crownMat);
      c.scale.setScalar(3.4);
      c.position.set(x + sx * 0.5, groundY(x, -d) + 8.2, -d);
      g.add(c);
    }
  }
}

// 向こう岸の、飾りの切り株と岩
function buildFarShore(g) {
  const rand = makeRand(17);
  const bark = toonMaterial(0x8a5a32), ring = toonMaterial(0xe0b77c), rock = toonMaterial(0x9ea39a);
  for (let i = 0; i < 12; i++) {
    const x = (rand() - 0.5) * 30, z = -18 - rand() * 6;
    const y = groundY(x, z);
    if (rand() < 0.5) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.5, 10), bark);
      st.position.set(x, y + 0.2, z);
      const top = new THREE.Mesh(new THREE.CircleGeometry(0.38, 10), ring);
      top.rotation.x = -Math.PI / 2;
      top.position.set(x, y + 0.46, z);
      g.add(st, top);
    } else {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + rand() * 0.4, 0), rock);
      r.position.set(x, y + 0.1, z);
      r.rotation.set(rand() * 3, rand() * 3, 0);
      g.add(r);
    }
  }
}

function buildForest(g) {
  const rand = makeRand(303);
  const spots = [];
  for (let i = 0; i < 260; i++) {
    const x = (rand() - 0.5) * 120, z = -10 + (rand() - 0.5) * 110;
    if (pondQ(x, z) < 1.25) continue;
    if (z > -4 && Math.abs(x) < 10 && z < 14) continue; // 桟橋のうしろ(カメラのまわり)はあける
    if (Math.abs(Math.abs(x) - VINE_X) < 3 && z < -7 && z > -18) continue; // 綱の木のまわり
    spots.push({ x, y: groundY(x, z), z, h: 4.5 + rand() * 4, kind: rand() < 0.3 ? 'pine' : 'broad' });
  }
  buildForestTrees(g, spots);
}

export function buildStage(scene) {
  const g = new THREE.Group();
  buildGround(g);
  buildDock(g);
  buildLilies(g);
  buildVines(g);
  buildFarShore(g);
  buildForest(g);
  mergeStatic(g);
  scene.add(g);
  return { group: g };
}
