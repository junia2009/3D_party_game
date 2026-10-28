// お正月の お寺の だるまおとし の 会場(見た目だけ)。
//
// 雪の 夜の 森の お寺。たたみの 大広間の まんなかに だいと だるま。おくに しょうじ(そとは 雪)、
// よこに かどまつ と もちつきの うす、てんじょうから ちょうちん。
//
// 座標: だるまの だいの まんなかが 原点。たたく 子は 左(-x)、だんは 右(+x)へ とぶ。カメラは +z(手前)から。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';

export const BASE_Y = 0.35; // だいの 上の 高さ
export const BLOCK_H = 0.34; // だん 1つの 高さ
export const BLOCK_R = 0.42;
export const HIT_X = -1.1; // たたく 子が 立つ ところ

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

// だんの いろ(ふつうの だんは じゅんばんに)
const COLORS = [0x3d8bff, 0xffc23c, 0x34c47c, 0x9b6bff, 0xff8a3a, 0x3dc8d8];
const stoneTex = canvasTex(128, 64, (c, w, h) => {
  c.fillStyle = '#8a8a8e'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(${i % 2 ? 60 : 190},${i % 2 ? 60 : 190},${i % 2 ? 66 : 196},.35)`; c.fillRect((i * 37) % w, (i * 23) % h, 3 + (i % 5), 2 + (i % 3)); }
});
const iceTex = canvasTex(128, 64, (c, w, h) => {
  const g = c.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#bfeaff'); g.addColorStop(0.5, '#f4fdff'); g.addColorStop(1, '#a8e0ff');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 4;
  for (let x = 10; x < w; x += 34) { c.beginPath(); c.moveTo(x, 8); c.lineTo(x + 14, h - 8); c.stroke(); }
});
// だん 1つ。kind: normal / hard(石)/ slip(つるつる)
export function blockMesh(kind, i) {
  const geo = new THREE.CylinderGeometry(BLOCK_R, BLOCK_R, BLOCK_H * 0.96, 28);
  let mat;
  if (kind === 'hard') mat = new THREE.MeshToonMaterial({ map: stoneTex, gradientMap: toonGradient });
  else if (kind === 'slip') mat = new THREE.MeshToonMaterial({ map: iceTex, gradientMap: toonGradient, emissive: 0x2a5a7a, emissiveIntensity: 0.4 });
  else mat = toonMaterial(COLORS[i % COLORS.length]);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  // ふちの 白い 線(だるまおとしらしく)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(BLOCK_R, 0.018, 4, 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: kind === 'hard' ? 0x5a5a60 : 0xfff6e0 }));
  rim.position.y = BLOCK_H * 0.46;
  m.add(rim);
  return m;
}
// だるまの あたま(赤い からだに 白い かお、まゆと ひげ)
export function headMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 18), toonMaterial(0xe8302a));
  body.scale.set(1, 1.05, 0.95);
  body.position.y = 0.48;
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.33, 20, 14), toonMaterial(0xfff2e0));
  face.scale.set(1, 0.95, 0.55);
  face.position.set(0, 0.58, 0.32);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), eyeMat);
    eye.position.set(sx * 0.12, 0.64, 0.49);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.03), eyeMat);
    brow.position.set(sx * 0.13, 0.75, 0.47);
    brow.rotation.z = sx * -0.35;
    g.add(eye, brow);
  }
  const beard = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 4, 12, Math.PI), eyeMat);
  beard.position.set(0, 0.47, 0.47);
  beard.rotation.z = Math.PI;
  const gold = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 4, 20, Math.PI), toonMaterial(0xffcf3a));
  gold.position.set(0, 0.3, 0.42);
  gold.rotation.z = Math.PI;
  g.add(body, face, beard, gold);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// こづち(たたく ハンマー)
export function malletMesh() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.9, 8), toonMaterial(0xc89a62));
  handle.position.y = -0.45;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.36, 14).rotateZ(Math.PI / 2), toonMaterial(0x8a5a32));
  head.position.y = -0.9;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.05, 14).rotateZ(Math.PI / 2), toonMaterial(0xd8302a));
  band.position.y = -0.9;
  g.add(handle, head, band);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function buildStage(scene) {
  const group = new THREE.Group();
  // たたみ(いぐさの すじ)
  const tatami = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#c8c27a'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 4) { c.fillStyle = x % 8 ? 'rgba(120,110,40,.12)' : 'rgba(255,250,200,.12)'; c.fillRect(x, 0, 2, h); }
    c.fillStyle = '#3a4a2a'; c.fillRect(0, 0, w, 6); c.fillRect(0, h - 6, w, 6);
  });
  for (let i = -3; i <= 3; i++) for (let j = -2; j <= 2; j++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: tatami, gradientMap: toonGradient }));
    const rot = (i + j) % 2 === 0;
    m.position.set(i * 3.6 + (rot ? 0 : 0), 0, j * 3.6 + (rot ? 0.9 : -0.9));
    if (!rot) m.rotation.y = 0;
    m.receiveShadow = true;
    m.userData.noMerge = true;
    group.add(m);
  }
  // だいと 座ぶとん
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.78, BASE_Y, 24), toonMaterial(0x6a3a22));
  stand.position.y = BASE_Y / 2;
  group.add(stand);
  // おくの かべ: しょうじ(そとは 雪の 夜。ほんのり 明るい)
  const shoji = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#f2ead6'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#7a5030'; c.lineWidth = 5;
    for (let x = 0; x <= w; x += w / 4) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 0; y <= h; y += h / 6) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  });
  for (let i = -3; i <= 3; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.4), new THREE.MeshBasicMaterial({ map: shoji, color: 0xfff0d8 }));
    p.position.set(i * 2.45, 1.9, -5.5);
    p.userData.noMerge = true;
    group.add(p);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(18, 0.4, 0.4), toonMaterial(0x5a3420));
  beam.position.set(0, 3.8, -5.4);
  const sill = beam.clone();
  sill.position.y = 0.1;
  group.add(beam, sill);
  for (const x of [-8.6, 8.6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.4), toonMaterial(0x5a3420));
    post.position.set(x, 3, -5.4);
    group.add(post);
  }
  // かどまつ(竹 3本・松・わら)
  for (const sx of [-1, 1]) {
    const x = sx * 4.6, z = -3.6;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.8, 14), toonMaterial(0xc8a050));
    pot.position.set(x, 0.4, z);
    group.add(pot);
    [[0, 1.9], [-0.18, 1.5], [0.18, 1.25]].forEach(([dx, hh]) => {
      const bamboo = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, hh, 10), toonMaterial(0x5aa84a));
      bamboo.position.set(x + dx, 0.6 + hh / 2, z + (dx ? 0.12 : -0.05));
      const cut = new THREE.Mesh(new THREE.CircleGeometry(0.1, 10).rotateX(-Math.PI / 3), toonMaterial(0xe8f0c0));
      cut.position.set(x + dx, 0.6 + hh, z + (dx ? 0.12 : -0.05));
      group.add(bamboo, cut);
    });
    for (let k = 0; k < 5; k++) {
      const pine = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 6), toonMaterial(0x2f6a3a));
      pine.position.set(x + Math.cos(k * 1.3) * 0.4, 0.9, z + Math.sin(k * 1.3) * 0.3 + 0.2);
      group.add(pine);
    }
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.05, 6, 16).rotateX(Math.PI / 2), toonMaterial(0xe8d8a0));
    rope.position.set(x, 0.5, z);
    group.add(rope);
  }
  // もちつきの うすと きね
  const usu = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.5, 0.8, 16), toonMaterial(0x8a5a32));
  usu.position.set(5.6, 0.4, -1.4);
  const mochi = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), toonMaterial(0xfffdf6));
  mochi.scale.y = 0.45;
  mochi.position.set(5.6, 0.82, -1.4);
  const kine = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), toonMaterial(0xc89a62));
  kine.position.set(6.3, 0.8, -1.1);
  kine.rotation.z = 0.5;
  group.add(usu, mochi, kine);
  // かがみもち(よこの だい)
  const sanbo = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), toonMaterial(0xe8d0a0));
  sanbo.position.set(-5.6, 0.25, -1.6);
  const m1 = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 10), toonMaterial(0xfffdf6));
  m1.scale.y = 0.55; m1.position.set(-5.6, 0.68, -1.6);
  const m2 = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), toonMaterial(0xfffdf6));
  m2.scale.y = 0.55; m2.position.set(-5.6, 0.92, -1.6);
  const mikan = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), toonMaterial(0xff8a1a));
  mikan.position.set(-5.6, 1.1, -1.6);
  group.add(sanbo, m1, m2, mikan);
  mergeStatic(group, (o) => o.userData.noMerge);
  group.traverse((o) => { if (o.name === 'merged') o.castShadow = o.receiveShadow = true; });
  scene.add(group);
  // ちょうちん(あたたかい あかり)
  const lanterns = [];
  for (const x of [-3.2, 3.2]) {
    const l = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }));
    body.scale.y = 1.3;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb860, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(2);
    l.add(body, glow);
    l.position.set(x, 3.4, -2.5);
    scene.add(l);
    lanterns.push(l);
  }
  const lamp = new THREE.PointLight(0xffc880, 14, 14, 1.4);
  lamp.position.set(0, 3.2, 1.2);
  scene.add(lamp);
  // しょうじに うつる 雪の かげ(そとで ふって いる)
  const snow = (() => {
    const n = 80, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 17; pos[i * 3 + 1] = Math.random() * 3.6; pos[i * 3 + 2] = -5.47; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xb8a890, size: 0.08, transparent: true, opacity: 0.5 }));
    scene.add(m);
    return m;
  })();
  function update(t) {
    for (const [k, l] of lanterns.entries()) l.rotation.z = Math.sin(t * 1.1 + k) * 0.05;
    const p = snow.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) - 0.006 * (1 + (i % 3) * 0.4);
      if (y < 0.2) y = 3.6;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(t + i) * 0.002);
    }
    p.needsUpdate = true;
  }
  return { group, update };
}
