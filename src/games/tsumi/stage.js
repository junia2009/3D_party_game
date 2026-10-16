// どんぐりつみ の会場「森の大きな切り株のうえ」と、積むものの形。
//
// 森の奥の広場に、年輪の見える巨大な切り株(上の面の半径 1.6m、高さ 1.4m)。
// 上には大きな枝が張り出していて、そこからつるが下がり、つるの先で「森のもの」が左右にゆれる。
// まわりには、観客の小さな切り株と、ちょうちん(夜も映える)。森はぐるっと。
//
// 座標: 切り株のまん中の地面が原点。カメラは +z(手前)から見る。ルールの x はそのまま世界の x。
// 切り株の上の面の高さは STUMP_H。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { grassTexture } from '../daruma/ground.js';
import { buildForestTrees, makeRand } from '../daruma/trees.js';

export const STUMP_H = 1.4;
export const STUMP_R = 1.6;
export const BRANCH_Y = 9.5; // つるをつるす枝の高さ
// 観客席(切り株)。うしろ半分に半円で
export const SEATS = [
  { x: -4.6, z: -1.4, kind: 'risu' },
  { x: -3.4, z: -3.6, kind: 'komadori' },
  { x: -1.1, z: -4.6, kind: 'harinezumi' },
  { x: 1.3, z: -4.6, kind: 'risu' },
  { x: 3.5, z: -3.5, kind: 'harinezumi' },
  { x: 4.7, z: -1.3, kind: 'komadori' },
];
// 5人が待つ場所。切り株の左右に、番の順で かわりばんこに(手前はあけて、山が見えるように)
export function waitSpot(i, n) {
  const side = i % 2 === 0 ? -1 : 1;
  const a = side * (1.0 + Math.floor(i / 2) * 0.42);
  return new THREE.Vector3(Math.sin(a) * 3.3, 0, Math.cos(a) * 3.3);
}

// 年輪の絵
function ringTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d');
  x.fillStyle = '#e6c28a';
  x.fillRect(0, 0, S, S);
  const rand = makeRand(5);
  for (let r = 8; r < 128; r += 6 + rand() * 6) {
    x.strokeStyle = `rgba(150,100,55,${0.35 + rand() * 0.3})`;
    x.lineWidth = 1.5 + rand() * 2;
    x.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.1) {
      const rr = r + Math.sin(a * 3 + r) * 1.5;
      const px = S / 2 + Math.cos(a) * rr, py = S / 2 + Math.sin(a) * rr;
      if (a === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.stroke();
  }
  // ひび
  x.strokeStyle = 'rgba(110,70,35,.5)';
  x.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2;
    x.beginPath();
    x.moveTo(S / 2 + Math.cos(a) * 20, S / 2 + Math.sin(a) * 20);
    x.lineTo(S / 2 + Math.cos(a + 0.1) * 110, S / 2 + Math.sin(a + 0.1) * 110);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// 樹皮の絵(縦のすじ)
function barkTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const x = cv.getContext('2d');
  x.fillStyle = '#7a5434';
  x.fillRect(0, 0, 256, 128);
  const rand = makeRand(9);
  for (let i = 0; i < 70; i++) {
    x.strokeStyle = `rgba(${rand() < 0.5 ? '60,38,20' : '150,110,70'},${0.4 + rand() * 0.4})`;
    x.lineWidth = 1 + rand() * 3;
    const px = rand() * 256;
    x.beginPath();
    x.moveTo(px, 0);
    x.bezierCurveTo(px + (rand() - 0.5) * 12, 40, px + (rand() - 0.5) * 12, 90, px + (rand() - 0.5) * 8, 128);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildStage(scene) {
  const g = new THREE.Group();
  const rand = makeRand(31);
  // 地面
  {
    const geo = new THREE.CircleGeometry(80, 64);
    geo.rotateX(-Math.PI / 2);
    const m = toonMaterial(0x7fbe62);
    m.map = grassTexture();
    m.map.repeat.set(26, 26);
    const ground = new THREE.Mesh(geo, m);
    ground.name = 'terrain';
    g.add(ground);
    // 広場: 踏みかためた土の輪
    const dirt = new THREE.Mesh(new THREE.CircleGeometry(6.5, 48).rotateX(-Math.PI / 2), toonMaterial(0xc9ae7c));
    dirt.position.y = 0.01;
    g.add(dirt);
  }
  // 大きな切り株(上の面は年輪、横は樹皮。根が張る)
  {
    const side = toonMaterial(0xffffff);
    side.map = barkTexture();
    side.map.repeat.set(4, 1);
    const top = new THREE.MeshToonMaterial({ map: ringTexture(), gradientMap: toonGradient });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(STUMP_R, STUMP_R * 1.18, STUMP_H, 40, 1), [side, top, side]);
    trunk.position.y = STUMP_H / 2;
    g.add(trunk);
    // 上のふち(樹皮の厚み)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(STUMP_R - 0.03, 0.06, 6, 40), toonMaterial(0x5e3a1c));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = STUMP_H;
    g.add(rim);
    const rootMat = toonMaterial(0x6b4527);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rand() * 0.3;
      const root = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.8, 7), rootMat);
      root.position.set(Math.cos(a) * (STUMP_R + 0.4), 0.25, Math.sin(a) * (STUMP_R + 0.4));
      root.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
      g.add(root);
    }
    // こけと小さなキノコ
    const moss = toonMaterial(0x6aa956), cap = toonMaterial(0xe8402f), stem = toonMaterial(0xfff1d6);
    for (let i = 0; i < 10; i++) {
      const a = rand() * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 5), moss);
      m.scale.set(1.3, 0.5, 1);
      m.position.set(Math.cos(a) * (STUMP_R + 0.12), 0.15 + rand() * 0.6, Math.sin(a) * (STUMP_R + 0.12));
      g.add(m);
    }
    for (let i = 0; i < 5; i++) {
      const a = -0.6 + i * 0.35;
      const s = 0.12 + rand() * 0.08;
      const st = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.35, s * 0.45, s * 1.3, 6), stem);
      st.position.set(Math.cos(a) * (STUMP_R + 0.5), s * 0.65, Math.sin(a) * (STUMP_R + 0.5));
      const c = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), cap);
      c.position.set(st.position.x, s * 1.2, st.position.z);
      g.add(st, c);
    }
  }
  // 上の大きな枝(左の大木から張り出す)
  {
    const bark = toonMaterial(0x6b4c36);
    const tree = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 16, 12), bark);
    tree.position.set(-8.5, 8, -4);
    g.add(tree);
    const pts = [new THREE.Vector3(-8, 9.2, -4), new THREE.Vector3(-4, 10.2, -2), new THREE.Vector3(0, BRANCH_Y + 0.4, 0), new THREE.Vector3(3, BRANCH_Y + 0.9, 0.5)];
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.32, 8), bark));
    const leafMat = toonMaterial(0x4f9a3c), leafMat2 = toonMaterial(0x6dbb4f);
    for (let i = 0; i < 26; i++) {
      const u = rand();
      const p = new THREE.CatmullRomCurve3(pts).getPoint(0.2 + u * 0.8);
      const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + rand() * 0.8, 0), rand() < 0.5 ? leafMat : leafMat2);
      l.position.copy(p).add(new THREE.Vector3((rand() - 0.5) * 2, 0.8 + rand() * 1.2, (rand() - 0.5) * 2 - 0.8));
      g.add(l);
    }
  }
  // 観客席
  const stumpMat = toonMaterial(0x8a5a32), ringMat = toonMaterial(0xe0b77c);
  for (const s of SEATS) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.42, 12), stumpMat);
    st.position.set(s.x, 0.21, s.z);
    const top = new THREE.Mesh(new THREE.CircleGeometry(0.4, 12).rotateX(-Math.PI / 2), ringMat);
    top.position.set(s.x, 0.425, s.z);
    g.add(st, top);
  }
  // ちょうちん: 広場を囲む柱と、柱のあいだのひもに
  const lanterns = [];
  {
    const post = toonMaterial(0x8a5a32);
    const poles = [[-6, -2], [-3.5, -5.6], [3.5, -5.6], [6, -2]];
    for (const [x, z] of poles) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 8), post);
      p.position.set(x, 2, z);
      g.add(p);
    }
    const lampGeo = new THREE.SphereGeometry(0.22, 12, 8);
    lampGeo.scale(1, 1.25, 1);
    const colors = [0xff8a5a, 0xffd23c, 0xff6a8a, 0x9ad0ff];
    for (let k = 0; k < poles.length - 1; k++) {
      const [ax, az] = poles[k], [bx, bz] = poles[k + 1];
      for (let i = 1; i < 5; i++) {
        const u = i / 5;
        const m = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: colors[(i + k) % colors.length] }));
        m.position.set(ax + (bx - ax) * u, 3.7 - Math.sin(u * Math.PI) * 0.6, az + (bz - az) * u);
        m.userData.noMerge = true;
        g.add(m);
        lanterns.push(m);
      }
    }
  }
  // 森
  {
    const spots = [];
    for (let i = 0; i < 220; i++) {
      const a = rand() * Math.PI * 2, r = 9 + rand() * 40;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > 4 && Math.abs(x) < 10) continue; // カメラの前はあける
      spots.push({ x, y: 0, z, h: 4.5 + rand() * 4, kind: rand() < 0.25 ? 'pine' : 'broad' });
    }
    buildForestTrees(g, spots);
  }
  mergeStatic(g);
  scene.add(g);
  return { group: g, lanterns };
}
