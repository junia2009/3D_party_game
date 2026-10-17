// お祭りの 大なわとび の会場「お祭りの夜の広場」。
//
// 森に かこまれた 広場。奥に 太鼓の やぐら(上で ホーホー先生が 太鼓を たたく)。
// やぐらの てっぺんから まわりの 柱へ ちょうちんの ひもが のびる。左右の 奥に 屋台(わたあめ・やきそば・きんぎょ)。
// まん中で 森の なかま2人が 大なわを 回し、5人が 横に ならんで とぶ。
//
// 座標: 5人の 列の まん中が 原点。なわは x の 向きに はる。カメラは +z(手前)から。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { grassTexture } from '../daruma/ground.js';
import { buildForestTrees, makeRand } from '../daruma/trees.js';

export const TURN_X = 3.1; // 回す子の 立つ ところ(x)
export const AXIS_Y = 1.05; // なわの 回る 軸の 高さ(回す子の 手)
export const YAGURA = { x: 0, z: -5.2, top: 2.3 }; // やぐらの 床の 高さ
export const slotX = (slot, n) => (slot - (n - 1) / 2) * Math.min(1.05, 4.2 / Math.max(1, n - 1)); // となりと 重ならない 間
// 脱落した子が すわって 見る ところ(列の うしろ)
export const benchSpot = (k) => ({ x: (k % 2 ? 1 : -1) * (1.0 + Math.floor(k / 2) * 1.05), z: -3.0 });

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// 紅白の 幕
const stripeTex = (a, b, n = 8) => canvasTex(128, 32, (g, w, h) => {
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect((i * w) / n, 0, w / n + 1, h); }
});

function buildGround(g) {
  const grass = new THREE.Mesh(new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: grassTexture(), color: 0x6f9460, gradientMap: toonGradient }));
  grass.receiveShadow = true;
  g.add(grass);
  // ふみかためた 土の 広場
  const tex = canvasTex(256, 256, (x) => {
    const grd = x.createRadialGradient(128, 128, 30, 128, 128, 128);
    grd.addColorStop(0, 'rgba(180,140,96,1)');
    grd.addColorStop(0.8, 'rgba(164,128,88,0.92)');
    grd.addColorStop(1, 'rgba(164,128,88,0)');
    x.fillStyle = grd;
    x.fillRect(0, 0, 256, 256);
    const rand = makeRand(5);
    for (let i = 0; i < 600; i++) {
      x.fillStyle = `rgba(${120 + rand() * 60},${95 + rand() * 40},${60 + rand() * 30},${0.3 + rand() * 0.3})`;
      const a = rand() * Math.PI * 2, d = rand() * 110;
      x.fillRect(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 2, 2);
    }
  });
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(9, 40).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: tex, transparent: true, gradientMap: toonGradient }));
  dirt.position.set(0, 0.01, -2);
  dirt.receiveShadow = true;
  g.add(dirt);
}

// やぐら: 4本柱の 台、紅白の 幕、手すり、屋根。上に 大太鼓
function buildYagura(g) {
  const wood = toonMaterial(0x8a5a32), dark = toonMaterial(0x5a3a22);
  const { x, z, top } = YAGURA;
  const W = 2.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, top + 2.3, 0.16), wood);
    p.position.set(x + (sx * W) / 2, (top + 2.3) / 2, z + (sz * W) / 2);
    g.add(p);
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.14, W + 0.3), wood);
  floor.position.set(x, top, z);
  g.add(floor);
  // 紅白の 幕(台の下を ぐるり)
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.72, W * 0.72, top - 0.2, 4, 1, true), new THREE.MeshToonMaterial({ map: stripeTex('#e8344a', '#ffffff', 16), gradientMap: toonGradient, side: THREE.DoubleSide }));
  skirt.material.map.wrapS = THREE.RepeatWrapping;
  skirt.rotation.y = Math.PI / 4;
  skirt.position.set(x, (top - 0.2) / 2 + 0.05, z);
  g.add(skirt);
  // 手すり
  for (const [dx, dz, w, d] of [[0, W / 2, W, 0.06], [0, -W / 2, W, 0.06], [W / 2, 0, 0.06, W], [-W / 2, 0, 0.06, W]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), dark);
    r.position.set(x + dx, top + 0.55, z + dz);
    g.add(r);
  }
  // 屋根
  const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 1.0, 0.7, 4), toonMaterial(0x3a2a22));
  roof.rotation.y = Math.PI / 4;
  roof.position.set(x, top + 2.65, z);
  g.add(roof);
  // はしご
  for (const sx of [-0.25, 0.25]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, top + 0.2, 0.06), wood);
    rail.position.set(x + W / 2 + 0.35 + sx, (top + 0.2) / 2, z + 0.3);
    rail.rotation.z = -0.18;
    g.add(rail);
  }
  // 大太鼓(先生の 前)
  const drum = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 18), toonMaterial(0xa8402a));
  body.rotation.x = Math.PI / 2;
  const skin = toonMaterial(0xf2e2c4);
  for (const s of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.4, 18), skin);
    face.position.z = s * 0.252;
    if (s < 0) face.rotation.y = Math.PI;
    drum.add(face);
  }
  drum.add(body);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.3), dark);
  stand.position.y = -0.5;
  drum.add(stand);
  drum.rotation.y = 0.9;
  drum.position.set(x + 0.62, top + 0.62, z + 0.35);
  g.add(drum);
}

// 屋台: 台・柱・しま模様の 屋根・のれんの 看板
function buildStall(g, x, z, rotY, name, col) {
  const s = new THREE.Group();
  const wood = toonMaterial(0x9a6a3e);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.85, 0.8), wood);
  counter.position.y = 0.425;
  s.add(counter);
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 0.82), toonMaterial(0xffffff));
  cloth.position.y = 0.7;
  s.add(cloth);
  for (const sx of [-0.95, 0.95]) for (const sz of [-0.35, 0.35]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.0, 6), wood);
    p.position.set(sx, 1.0, sz);
    s.add(p);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 1.2), new THREE.MeshToonMaterial({ map: stripeTex(col, '#ffffff', 10), gradientMap: toonGradient }));
  roof.position.set(0, 2.05, 0.1);
  roof.rotation.x = 0.18;
  s.add(roof);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.42), new THREE.MeshBasicMaterial({ map: canvasTex(256, 68, (c, w, h) => {
    c.fillStyle = '#fff6e0'; c.fillRect(0, 0, w, h);
    c.strokeStyle = col; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
    c.fillStyle = col; c.font = 'bold 44px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(name, w / 2, h / 2 + 2);
  }) }));
  sign.position.set(0, 1.72, 0.42);
  s.add(sign);
  // 台の上の 品物(色の ついた 玉)
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), toonMaterial([0xffb0c8, 0xfff0f4, 0xff8a5a, 0x8ad0ff, 0xffd23c][i]));
    m.position.set(-0.7 + i * 0.35, 0.95, 0.1);
    s.add(m);
  }
  s.position.set(x, 0, z);
  s.rotation.y = rotY;
  g.add(s);
}

export function buildStage(scene) {
  const g = new THREE.Group();
  buildGround(g);
  buildYagura(g);
  buildStall(g, -5.6, -4.2, 0.5, 'わたあめ', '#e8508a');
  buildStall(g, 5.6, -4.2, -0.5, 'やきそば', '#e8742a');
  buildStall(g, -7.4, -0.8, 1.1, 'きんぎょ', '#3a8ae8');
  // ちょうちん: やぐらの てっぺんから まわりの 柱へ
  const lanterns = [];
  const post = toonMaterial(0x6a4a2a);
  const poles = [[-7, 1.5], [-6.5, -7], [6.5, -7], [7, 1.5], [0, -11]];
  const lampGeo = new THREE.SphereGeometry(0.2, 12, 8);
  lampGeo.scale(1, 1.3, 1);
  const capGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8);
  const colors = [0xff5a3a, 0xfff2d8, 0xff5a3a, 0xffd23c];
  const ropeMat = new THREE.MeshBasicMaterial({ color: 0x2a1e18 });
  const topP = new THREE.Vector3(YAGURA.x, YAGURA.top + 2.95, YAGURA.z);
  for (const [px, pz] of poles) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.2, 8), post);
    p.position.set(px, 2.1, pz);
    g.add(p);
    const end = new THREE.Vector3(px, 4.1, pz);
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      pts.push(new THREE.Vector3().lerpVectors(topP, end, u).add(new THREE.Vector3(0, -Math.sin(u * Math.PI) * 0.7, 0)));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.012, 4), ropeMat));
    for (let i = 1; i < 7; i++) {
      const u = i / 7;
      const at = new THREE.Vector3().lerpVectors(topP, end, u).add(new THREE.Vector3(0, -Math.sin(u * Math.PI) * 0.7 - 0.28, 0));
      const m = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length] }));
      m.position.copy(at);
      m.userData.noMerge = true;
      g.add(m);
      lanterns.push(m);
      for (const dy of [-0.27, 0.27]) {
        const c = new THREE.Mesh(capGeo, toonMaterial(0x2a1e18));
        c.position.set(at.x, at.y + dy, at.z);
        g.add(c);
      }
    }
  }
  // 森
  const rand = makeRand(19);
  const spots = [];
  for (let i = 0; i < 200; i++) {
    const a = rand() * Math.PI * 2, r = 11 + rand() * 40;
    const x = Math.cos(a) * r, z = Math.sin(a) * r - 3;
    if (z > 3 && Math.abs(x) < 12) continue; // カメラの 前は あける
    spots.push({ x, y: 0, z, h: 5 + rand() * 4, kind: rand() < 0.3 ? 'pine' : 'broad' });
  }
  buildForestTrees(g, spots);
  mergeStatic(g);
  scene.add(g);
  // ちょうちんの あかり(あたたかい 光を 2つだけ)
  const lights = [];
  for (const [x, z] of [[-3, -3], [3, -3]]) {
    const l = new THREE.PointLight(0xffa860, 6, 14, 1.6);
    l.position.set(x, 3.4, z);
    scene.add(l);
    lights.push(l);
  }
  return { group: g, lanterns, lights };
}
