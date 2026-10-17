// おぼえて かくれんぼ の会場「夜の森の広場」。
//
// 森にかこまれた まるい広場。まん中に ふせた かごが ならぶ(かごは 画面側で作って動かす)。
// かごの奥の切り株の上に ホーホー先生。手前に 5人が ならぶ。
// まわりの木から木へ ちょうちんの ひもが わたり、くいの上にも ちょうちん。光るキノコ、ホタル(空気の時間帯 night)。
//
// 座標: かごの列のまん中が原点。カメラは +z(手前)から、5人ごしに かごを見る。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { grassTexture } from '../daruma/ground.js';
import { barkMaterial, buildForestTrees, makeRand } from '../daruma/trees.js';

export const LINE_Z = 3.8; // 5人が ならぶ ところ
export const HOST = { x: 0, z: -2.9, top: 0.55 }; // 先生の切り株
export const SPAN = 4.4; // かごの列の はば(かごの数で間をかえる。縦持ちの画面に おさまるように)
export const slotX = (slot, n) => (slot - (n - 1) / 2) * Math.min(1.5, SPAN / Math.max(1, n - 1));

function buildGround(g) {
  // 広場: 草の大きな円盤 + まん中の ふみかためた土
  const grass = new THREE.Mesh(new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: grassTexture(), color: 0x7fa46a, gradientMap: toonGradient }));
  grass.receiveShadow = true;
  g.add(grass);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(128, 128, 30, 128, 128, 128);
  grd.addColorStop(0, 'rgba(176,138,96,1)');
  grd.addColorStop(0.75, 'rgba(160,126,88,0.9)');
  grd.addColorStop(1, 'rgba(160,126,88,0)');
  x.fillStyle = grd;
  x.fillRect(0, 0, 256, 256);
  const rand = makeRand(3);
  for (let i = 0; i < 500; i++) {
    x.fillStyle = `rgba(${120 + rand() * 60},${95 + rand() * 40},${60 + rand() * 30},${0.3 + rand() * 0.3})`;
    const a = rand() * Math.PI * 2, d = rand() * 100;
    x.fillRect(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(6.5, 48).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: tex, transparent: true, depthWrite: false, gradientMap: toonGradient }));
  dirt.position.set(0, 0.01, 0.4);
  dirt.receiveShadow = true;
  g.add(dirt);
}

// ちょうちん(和紙の色の丸に、木のふたと底)。光る(画面側でゆらす)ので まとめない
const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffc56a });
export const LANTERN_ON = 0xffc56a, LANTERN_OFF = 0x4a3a2a;
function lantern(scale = 1) {
  const l = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), lanternMat);
  body.scale.set(1, 1.2, 1);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.06, 10), toonMaterial(0x3a2a1c));
  cap.position.y = 0.25;
  const bot = cap.clone();
  bot.position.y = -0.25;
  l.add(body, cap, bot);
  l.scale.setScalar(scale);
  l.userData.noMerge = true;
  l.traverse((o) => { o.userData.noMerge = true; });
  return l;
}
export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,220,150,0.9)');
  r.addColorStop(0.4, 'rgba(255,190,100,0.35)');
  r.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function buildLanterns(scene, g) {
  const glow = new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const lights = [];
  const glows = [];
  const add = (x, y, z, s = 1, withGlow = true) => {
    const l = lantern(s);
    l.position.set(x, y, z);
    scene.add(l);
    if (withGlow) {
      const sp = new THREE.Sprite(glow);
      sp.scale.setScalar(1.6 * s);
      sp.position.set(x, y, z);
      scene.add(sp);
      glows.push(sp);
    }
    return l;
  };
  // くいの上の ちょうちん(広場のふち)
  const post = toonMaterial(0x5a4030);
  const posts = [[-5.2, -1.5], [5.2, -1.5], [-4.6, 3.0], [4.6, 3.0], [-2.6, -4.4], [2.6, -4.4]];
  for (const [x, z] of posts) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.8, 6), post);
    p.position.set(x, 0.9, z);
    g.add(p);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), post);
    arm.position.set(x, 1.78, z);
    g.add(arm);
    add(x + 0.2, 1.5, z, 0.9);
  }
  // 木から木へ わたした ちょうちんの ひも(小さな ちょうちんが ゆれる)
  const string = [];
  const lines = [[[-7, 3.2, -6], [0, 2.6, -6.5], [7, 3.2, -6]], [[-8, 3.0, -1], [-4.5, 2.5, -3.8], [-1, 3.0, -7]], [[8, 3.0, -1], [4.5, 2.5, -3.8], [1, 3.0, -7]]];
  const ropeMat = new THREE.LineBasicMaterial({ color: 0x2a2018 });
  for (const pts of lines) {
    const curve = new THREE.QuadraticBezierCurve3(...pts.map((p) => new THREE.Vector3(...p)));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)), ropeMat);
    scene.add(line);
    for (let k = 1; k < 8; k++) {
      const p = curve.getPoint(k / 8);
      const l = add(p.x, p.y - 0.25, p.z, 0.55, k % 2 === 0);
      string.push(l);
    }
  }
  // あたたかい光(数を少なく)
  for (const [x, z] of [[-3.5, 0], [3.5, 0], [0, 4.5]]) {
    const L = new THREE.PointLight(0xffb060, 9, 11, 1.6);
    L.position.set(x, 2.4, z);
    scene.add(L);
    lights.push(L);
  }
  return { lights, glows, string };
}

// 光るキノコ(広場のふちの木の根もと)
function buildMushrooms(g) {
  const rand = makeRand(14);
  const cap = new THREE.MeshBasicMaterial({ color: 0x8af0ff }), stem = toonMaterial(0xd8e8e0);
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, d = 6.6 + rand() * 2;
    if (Math.sin(a) > 0.6) continue;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const s = 0.5 + rand() * 0.8;
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.04 * s, 0.16 * s, 6), stem);
    st.position.set(x, 0.08 * s, z);
    const cp = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), cap);
    cp.position.set(x, 0.15 * s, z);
    g.add(st, cp);
  }
}

// 先生の切り株と、まわりの森
function buildSurroundings(g) {
  const st = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, HOST.top, 12), barkMaterial(0x7a5032, 2, 1));
  st.position.set(HOST.x, HOST.top / 2, HOST.z);
  g.add(st);
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12).rotateX(-Math.PI / 2), toonMaterial(0xd8b07a));
  top.position.set(HOST.x, HOST.top + 0.001, HOST.z);
  g.add(top);
  const rand = makeRand(27);
  const spots = [];
  for (let i = 0; i < 110; i++) {
    const a = rand() * Math.PI * 2, d = 8 + rand() * 26;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (z > 5 && Math.abs(x) < 9) continue; // カメラの前は あける
    spots.push({ x, y: 0, z, h: 5 + rand() * 5, kind: rand() < 0.4 ? 'pine' : 'broad' });
  }
  buildForestTrees(g, spots);
  // 5人の立つところの 丸い石
  const stone = toonMaterial(0x8a8478);
  for (let k = 0; k < 5; k++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.06, 14), stone);
    m.position.set((k - 2) * 1.3, 0.03, LINE_Z);
    g.add(m);
  }
}

export function buildStage(scene) {
  const g = new THREE.Group();
  buildGround(g);
  buildSurroundings(g);
  buildMushrooms(g);
  const lights = buildLanterns(scene, g);
  mergeStatic(g);
  scene.add(g);
  return { group: g, ...lights, lanternMat };
}
