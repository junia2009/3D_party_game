// 空まで まめのきジャンプ の 会場(見た目だけ)。
//
// 森の 広場から、5本の まめの木が 空へ のびる(手前から 見て よこに ならぶ)。
// 木は くねくね ねじれた みどりの つる。葉っぱは つるの 左か 右に 生える(ハートの 形)。
// 地面は 草と 花、上へ いくほど 雲が ふえて、高い ところには 星。
//
// 座標: 地面が y = 0。木は x に ならぶ(STALK_X)。葉っぱ i まいめは 高さ i * LEAF_H。カメラは +z(手前)から。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { foliageClump, makeRand } from '../daruma/trees.js';
import { RULES } from './rules.js';

export const LEAF_H = 0.8; // 葉っぱ 1まいの 高さ
export const LEAF_X = 0.6; // 葉っぱの 中心は つるから これだけ よこ
export const GAP = 1.75; // 木と 木の あいだ
// 席 → 何本目か(自分(席 0)を まん中に)
export const COLUMN = [2, 1, 3, 0, 4];
export const stalkX = (slot) => (COLUMN[slot] - 2) * GAP;
const TOP = RULES.leaves * LEAF_H + 4;

// 葉っぱの 形(ハート形。つるの 側が 細い)
function leafGeo() {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.bezierCurveTo(0.15, 0.32, 0.65, 0.36, 0.72, 0.05);
  sh.bezierCurveTo(0.78, -0.22, 0.4, -0.3, 0, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 1, curveSegments: 8 });
  g.rotateX(-Math.PI / 2); // 平らに(+x へ のびる)
  g.scale(1.3, 1, 1.6);
  return g;
}

export function buildStage(scene) {
  const g = new THREE.Group();
  const rand = makeRand(5);
  // 地面: 草の 広場と 花
  const grass = new THREE.Mesh(new THREE.CircleGeometry(60, 40).rotateX(-Math.PI / 2), toonMaterial(0x7ac25a));
  g.add(grass);
  const flowerCols = [0xff6a8a, 0xffd23c, 0xffffff, 0xb48cff];
  for (let i = 0; i < 60; i++) {
    const x = (rand() - 0.5) * 30, z = -6 + rand() * 14;
    if (Math.abs(z) < 1.2 && Math.abs(x) < 4) continue;
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), toonMaterial(flowerCols[i % 4]));
    f.position.set(x, 0.12, z);
    g.add(f);
  }
  // 森(奥)
  const crown = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient });
  const clump = foliageClump(rand, { detail: 1, balls: 4, bottom: 0x2f6a35, top: 0x8fcf5f });
  for (let i = 0; i < 26; i++) {
    const x = (rand() - 0.5) * 40, z = -9 - rand() * 12, h = 3 + rand() * 3;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, h * 0.6, 6), toonMaterial(0x6b4c36));
    t.position.set(x, h * 0.3, z);
    const c = new THREE.Mesh(clump, crown);
    c.scale.setScalar(h * 0.55);
    c.position.set(x, h * 0.75, z);
    g.add(t, c);
  }
  // まめの木: ねじれた つる(2本 からまる)と、根もとの 土の もり
  const vine = toonMaterial(0x4f9a36), vine2 = toonMaterial(0x6ab84a);
  for (let c = 0; c < 5; c++) {
    const x = (c - 2) * GAP;
    for (const [m, ph, r] of [[vine, 0, 0.11], [vine2, Math.PI, 0.08]]) {
      const pts = [];
      for (let y = -0.2; y <= TOP; y += 1.2) pts.push(new THREE.Vector3(x + Math.sin(y * 1.1 + ph + c) * 0.09, y, Math.cos(y * 1.1 + ph + c) * 0.09));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.ceil(TOP / 1.2) * 2, r, 6), m));
    }
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), toonMaterial(0x8a6a42));
    mound.scale.y = 0.4;
    mound.position.set(x, 0, 0);
    g.add(mound);
  }
  mergeStatic(g);
  scene.add(g);

  // 雲(高く なるほど 多い)と 高い 空の 星
  const cloudMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient, transparent: true, opacity: 0.92 });
  const puff = new THREE.SphereGeometry(1, 10, 8);
  const clouds = new THREE.Group();
  for (let i = 0; i < 90; i++) {
    const y = 10 + Math.pow(rand(), 0.8) * TOP;
    const side = rand() < 0.5 ? -1 : 1;
    const x = side * (5 + rand() * 9), z = -4 - rand() * 10;
    const cl = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const p = new THREE.Mesh(puff, cloudMat);
      p.scale.set(1.2 + rand(), 0.7 + rand() * 0.4, 0.9);
      p.position.set((k - 1.5) * 1.1, rand() * 0.4, rand() * 0.3);
      cl.add(p);
    }
    cl.position.set(x, y, z);
    cl.userData.sp = 0.2 + rand() * 0.3;
    clouds.add(cl);
  }
  scene.add(clouds);
  // 高さの めじるし: 25まいごとに 木の 札
  const signs = new THREE.Group();
  for (let n = 25; n < RULES.leaves; n += 25) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#7a4a24';
    x.beginPath();
    x.roundRect(2, 2, 124, 60, 14);
    x.fill();
    x.fillStyle = '#fff6e0';
    x.font = '400 34px "Dela Gothic One", sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(String(n), 64, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    m.position.set(-2.5 * GAP - 0.2, n * LEAF_H, 0.2);
    signs.add(m);
  }
  scene.add(signs);
  return {
    group: g,
    leafGeo: leafGeo(),
    update(t) { for (const cl of clouds.children) cl.position.x += Math.sin(t * 0.1 + cl.position.y) * 0.002 * cl.userData.sp * 10; },
  };
}
