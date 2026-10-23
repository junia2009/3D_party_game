// 夏祭りの ラムネ しゅわしゅわ の 会場(見た目だけ)。
//
// 夏祭りの 夜店。赤白の ひさしの ラムネ屋台、カウンターの 上に 氷水の たらい。うしろに ほかの 屋台(金魚すくい・わたあめ)と
// ちょうちんの ひも。屋台の よこに 高い 竹ざお(高さの 目もり。5 m ごと)。とんだ ふたは 竹ざおに そって 夜空へ。
//
// 座標: カウンターの 前が 原点。5人は x に ならぶ(SEAT_X)。カメラは +z(手前)から。上が +y。

import * as THREE from 'three';
import { toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { makeRand } from '../daruma/trees.js';

// 席 → よこの 位置(自分(席 0)を まん中に)
const ORDER = [2, 1, 3, 0, 4];
export const SEAT_X = (slot) => (ORDER[slot] - 2) * 1.12;
export const COUNTER_Y = 0.95;
export const POLE_X = 3.4; // 高さの 竹ざお

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTex = canvasTex(64, 64, (g) => {
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
});

// ちょうちん(あかりの ぼんやり つき)
function lantern(color = 0xff5a3a) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshBasicMaterial({ color }));
  body.scale.y = 1.25;
  const capMat = toonMaterial(0x2a2a2a);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.07, 10), capMat);
  top.position.y = 0.33;
  const bot = top.clone();
  bot.position.y = -0.33;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(1.6);
  glow.userData.noMerge = true;
  g.add(body, top, bot, glow);
  return g;
}

// 屋台(ひさし・はしら・のれん)
function stall(g, x, z, w, colA, colB, label, rand) {
  const wood = toonMaterial(0x8a5a32);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), wood);
    p.position.set(x + sx * (w / 2 - 0.1), 1.3, z + sz * 0.7);
    g.add(p);
  }
  const n = Math.round(w / 0.5);
  for (let k = 0; k < n; k++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(w / n + 0.01, 0.06, 1.9), toonMaterial(k % 2 ? colA : colB));
    st.position.set(x - w / 2 + (k + 0.5) * (w / n), 2.7, z);
    st.rotation.x = 0.18;
    g.add(st);
  }
  const counter = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, 1.0), toonMaterial(0xc89a62));
  counter.position.set(x, 0.45, z + 0.2);
  g.add(counter);
  // 看板
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, 0.5), new THREE.MeshBasicMaterial({ map: canvasTex(256, 64, (c, cw, ch) => {
    c.fillStyle = '#fff6e0'; c.fillRect(0, 0, cw, ch);
    c.fillStyle = '#c2453a'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, cw / 2, ch / 2 + 2);
  }) }));
  sign.position.set(x, 3.05, z + 0.95);
  sign.userData.noMerge = true;
  g.add(sign);
  void rand;
}

export function buildStage(scene) {
  const group = new THREE.Group();
  const rand = makeRand(17);
  // 地面: 夜の 土の 広場
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 60).rotateX(-Math.PI / 2), toonMaterial(0x5a4a3a));
  ground.receiveShadow = true;
  ground.userData.noMerge = true;
  group.add(ground);
  // ラムネの 屋台(まえ)。赤と 白の ひさし、はば ひろい カウンター
  const wood = toonMaterial(0x9a6a3a);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(7.6, COUNTER_Y, 1.1), wood);
  counter.position.set(0, COUNTER_Y / 2, -0.55);
  group.add(counter);
  const top = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.08, 1.25), toonMaterial(0xc89a62));
  top.position.set(0, COUNTER_Y, -0.55);
  group.add(top);
  // カウンターの 前の 布(水玉)
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 0.8), new THREE.MeshToonMaterial({ map: canvasTex(256, 32, (c, w, h) => {
    c.fillStyle = '#2a6ad0'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 24; i++) { c.beginPath(); c.arc((i + 0.5) * (w / 24), (i % 2 ? 0.3 : 0.7) * h, 4, 0, 7); c.fill(); }
  }) }));
  cloth.position.set(0, 0.45, 0.01);
  group.add(cloth);
  // ひさし(うしろの 柱から 前へ)
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.4, 0.16), wood);
    p.position.set(sx * 3.75, 1.7, -2.4);
    group.add(p);
  }
  for (let k = 0; k < 16; k++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 2.4), toonMaterial(k % 2 ? 0xffffff : 0xe8443a));
    st.position.set(-3.75 + (k + 0.5) * 0.47, 3.35, -1.4);
    st.rotation.x = 0.25;
    group.add(st);
  }
  // のれん「ラムネ」
  const noren = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.7), new THREE.MeshBasicMaterial({ map: canvasTex(256, 80, (c, w, h) => {
    c.fillStyle = '#2a6ad0'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff'; c.font = 'bold 54px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ラムネ', w / 2, h / 2 + 3);
  }), side: THREE.DoubleSide }));
  noren.position.set(0, 3.0, -0.25);
  noren.userData.noMerge = true;
  group.add(noren);
  // 氷水の たらい(カウンターの はし)と ひえた ラムネ
  for (const sx of [-1, 1]) {
    const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.32, 16, 1, true), toonMaterial(0x8ab0c8));
    tub.material.side = THREE.DoubleSide;
    tub.position.set(sx * 3.35, COUNTER_Y + 0.16, -0.7);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.52, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9ad8ee, transparent: true, opacity: 0.8 }));
    water.position.set(sx * 3.35, COUNTER_Y + 0.27, -0.7);
    water.userData.noMerge = true;
    group.add(tub, water);
    for (let k = 0; k < 6; k++) {
      const ice = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), new THREE.MeshBasicMaterial({ color: 0xe8f8ff }));
      ice.position.set(sx * 3.35 + (rand() - 0.5) * 0.7, COUNTER_Y + 0.3, -0.7 + (rand() - 0.5) * 0.7);
      ice.rotation.set(rand(), rand(), rand());
      group.add(ice);
      const b = ramuneBottle(false);
      b.scale.setScalar(0.8);
      b.position.set(sx * 3.35 + (rand() - 0.5) * 0.6, COUNTER_Y + 0.05, -0.7 + (rand() - 0.5) * 0.6);
      b.rotation.z = (rand() - 0.5) * 0.5;
      group.add(b);
    }
  }
  // うしろの 屋台
  stall(group, -6.5, -6, 3.4, 0xffffff, 0x3aa0f0, 'きんぎょ', rand);
  stall(group, -2.2, -8, 3.2, 0xffffff, 0xff8ab0, 'わたあめ', rand);
  stall(group, 2.4, -7.5, 3.4, 0xffd23a, 0xe8443a, 'やきそば', rand);
  stall(group, 6.6, -6.2, 3.2, 0xffffff, 0x8ad04a, 'かきごおり', rand);
  // 高さの 竹ざお(5 m ごとに 目もり)
  const bamboo = toonMaterial(0x8ab04a), node = toonMaterial(0x6a8a3a);
  for (let y = 0; y < 45; y += 1.5) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 1.45, 8), bamboo);
    seg.position.set(POLE_X, y + 0.75, 1.0);
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.06, 8), node);
    n.position.set(POLE_X, y + 1.5, 1.0);
    group.add(seg, n);
  }
  const marks = [];
  for (let m = 5; m <= 40; m += 5) {
    const t = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 64, (c, w, h) => {
      c.fillStyle = 'rgba(255,246,224,0.95)'; c.beginPath(); c.roundRect(4, 8, w - 8, h - 16, 14); c.fill();
      c.fillStyle = '#7a3a1a'; c.font = 'bold 34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(`${m} m`, w / 2, h / 2 + 2);
    }), depthWrite: false }));
    t.scale.set(1.1, 0.55, 1);
    t.position.set(POLE_X - 0.75, m + 1.6, 1.0);
    scene.add(t);
    marks.push(t);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 8), toonMaterial(0xe8443a));
    band.position.set(POLE_X, m + 1.6, 1.0);
    group.add(band);
  }
  mergeStatic(group, (o) => o.userData.noMerge);
  group.traverse((o) => { if (o.name === 'merged') o.castShadow = o.receiveShadow = true; });
  scene.add(group);

  // 屋台の あかり(あたたかい 色)
  const lamp = new THREE.PointLight(0xffc880, 22, 14, 1.4);
  lamp.position.set(0, 3.0, 1.2);
  scene.add(lamp);
  const lamp2 = new THREE.PointLight(0xff9a6a, 10, 12, 1.6);
  lamp2.position.set(-3, 2.6, 2.4);
  scene.add(lamp2);
  for (const x of [-2.4, 0, 2.4]) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
    bulb.position.set(x, 3.05, -0.4);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd890, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(1.2);
    glow.position.copy(bulb.position);
    scene.add(bulb, glow);
  }
  // ちょうちんの ひも(ゆれる)
  const lanterns = [];
  const cols = [0xff5a3a, 0xffb03a, 0xff5a3a, 0xffffff];
  const ropes = [[-9, 4.4, -3.2, 9, 4.4, -3.2], [-9, 5.6, 3.5, 9, 5.6, 3.5]];
  for (const [x0, y0, z0, x1, y1, z1] of ropes) {
    const n = 12;
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      pts.push(new THREE.Vector3(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u - Math.sin(u * Math.PI) * 0.6, z0 + (z1 - z0) * u));
    }
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.015, 4), toonMaterial(0x2a2a2a)));
    for (let k = 1; k < n; k++) {
      const l = lantern(cols[k % 4]);
      l.position.copy(pts[k]).add(new THREE.Vector3(0, -0.4, 0));
      l.userData.ph = k + z0;
      scene.add(l);
      lanterns.push(l);
    }
  }
  // 夜空の 星
  const stars = (() => {
    const n = 400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 140; pos[i * 3 + 1] = 8 + Math.random() * 70; pos[i * 3 + 2] = -40 - Math.random() * 30; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, fog: false }));
    scene.add(m);
    return m;
  })();
  function update(t) {
    for (const l of lanterns) l.rotation.z = Math.sin(t * 1.3 + l.userData.ph) * 0.08;
  }
  return { group, update, marks };
}

// ラムネの びん(あわの 量で 中が かわる)。neck の 上に ふた
export function ramuneBottle(withFoam = true) {
  const g = new THREE.Group();
  const glass = new THREE.MeshToonMaterial({ color: 0x7ad8e8, transparent: true, opacity: 0.55 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.42, 14), glass);
  body.position.y = 0.21;
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.14, 14), glass);
  shoulder.position.y = 0.49;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.12, 12), glass);
  neck.position.y = 0.62;
  // くびれの ビー玉
  const marble = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: 0xd8f4ff }));
  marble.position.y = 0.58;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.08, 12), toonMaterial(0xff6a9a));
  cap.position.y = 0.72;
  g.add(body, shoulder, neck, marble, cap);
  let foam = null, liquid = null;
  if (withFoam) {
    liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.115, 1, 12), new THREE.MeshBasicMaterial({ color: 0xc8f0ff, transparent: true, opacity: 0.75 }));
    foam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.105, 1, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    g.add(liquid, foam);
  }
  g.userData = { cap, foam, liquid };
  return g;
}
