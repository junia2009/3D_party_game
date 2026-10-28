// 森の いせきの どんぐり めいろ の 会場(見た目だけ)。
//
// 森の おくの いしの いせき。こけの はえた いしかべの めいろ。うごく かべは もようの ある いし、
// じゃんぷ ゆかは ひかる 矢じるしの いし。まわりは 大きな はしらと 木と つたの 森。
//
// 座標: ます (i, j) の まんなか = 世界の (i + 0.5 - N/2, 0, j + 0.5 - N/2)。カメラは 手前(+z)の 上から。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { acornGeometry, foliageClump, makeRand } from '../daruma/trees.js';
import { RULES } from './rules.js';

export const WALL_H = 1.0;
const N = RULES.size;
export const toWorld = (x, y, out = new THREE.Vector3()) => out.set(x - N / 2, 0, y - N / 2);

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
// いしの かべ(れんが もよう)
const stoneTex = canvasTex(64, 64, (c, w, h) => {
  c.fillStyle = '#a8a08a'; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(70,64,50,.55)'; c.lineWidth = 2;
  for (let y = 0; y < h; y += 16) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
    for (let x = (y / 16) % 2 ? 16 : 0; x < w; x += 32) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 16); c.stroke(); }
  }
  for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(${i % 2 ? 60 : 200},${i % 2 ? 90 : 190},${i % 2 ? 40 : 160},.25)`; c.fillRect((i * 29) % w, (i * 17) % h, 3, 2); }
});
const floorTex = canvasTex(64, 64, (c, w, h) => {
  c.fillStyle = '#7a8a5a'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#b8b098'; c.fillRect(4, 4, w - 8, h - 8);
  c.strokeStyle = 'rgba(80,70,50,.4)'; c.lineWidth = 2; c.strokeRect(4, 4, w - 8, h - 8);
  for (let i = 0; i < 12; i++) { c.fillStyle = 'rgba(90,120,60,.35)'; c.fillRect((i * 23) % w, (i * 37) % h, 6, 3); }
});
const runeTex = canvasTex(64, 64, (c, w, h) => {
  c.fillStyle = '#5a6a7a'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#8af0ff'; c.lineWidth = 3;
  c.strokeRect(6, 6, w - 12, h - 12);
  c.fillStyle = '#c8fbff';
  c.beginPath(); c.moveTo(w / 2, 10); c.lineTo(w - 14, h / 2); c.lineTo(w / 2 + 8, h / 2); c.lineTo(w / 2 + 8, h - 10); c.lineTo(w / 2 - 8, h - 10); c.lineTo(w / 2 - 8, h / 2); c.lineTo(14, h / 2); c.closePath(); c.fill();
});
const carveTex = canvasTex(64, 64, (c, w, h) => {
  c.fillStyle = '#9a8a6a'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#ffc860'; c.lineWidth = 3;
  c.beginPath(); c.arc(w / 2, h / 2, 18, 0, 7); c.stroke();
  c.beginPath(); c.moveTo(w / 2, 8); c.lineTo(w / 2, h - 8); c.moveTo(8, h / 2); c.lineTo(w - 8, h / 2); c.stroke();
});

// めいろの かたちに あわせて かべ・ゆか・じゃんぷ ゆかを つくる(うごく かべは べつ)
export function buildMaze(scene, s) {
  const g = new THREE.Group();
  const walls = [], floors = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const mover = s.movers.some((m) => m.x === x && m.y === y);
    if (s.grid[y][x] === 1) walls.push([x, y]);
    else floors.push([x, y, mover]);
  }
  const dummy = new THREE.Object3D();
  const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, WALL_H, 1), new THREE.MeshToonMaterial({ map: stoneTex, gradientMap: toonGradient }), walls.length);
  const mossMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.02, 0.08, 1.02), toonMaterial(0x5a8a3a), walls.length);
  const rand = makeRand(5);
  walls.forEach(([x, y], k) => {
    const sc = 0.9 + rand() * 0.2;
    toWorld(x + 0.5, y + 0.5, dummy.position).y = (WALL_H * sc) / 2;
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, sc, 1);
    dummy.updateMatrix();
    wallMesh.setMatrixAt(k, dummy.matrix);
    dummy.position.y = WALL_H * sc + 0.02; // こけは かべの 上に
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mossMesh.setMatrixAt(k, dummy.matrix);
  });
  wallMesh.castShadow = wallMesh.receiveShadow = true;
  g.add(wallMesh, mossMesh);
  const floorMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: floorTex, gradientMap: toonGradient }), floors.length);
  floors.forEach(([x, y], k) => {
    toWorld(x + 0.5, y + 0.5, dummy.position).y = 0.001;
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    floorMesh.setMatrixAt(k, dummy.matrix);
  });
  floorMesh.receiveShadow = true;
  g.add(floorMesh);
  // じゃんぷ ゆか(ひかる 矢じるし)
  const pads = s.pads.map((p) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: runeTex }));
    toWorld(p.x + 0.5, p.y + 0.5, m.position).y = 0.01;
    m.rotation.y = Math.atan2(-p.dx, -p.dy); // 矢じるし(絵では おく向き)を とぶ 向きへ
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x8af0ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(1.3);
    glow.position.copy(m.position).setY(0.2);
    g.add(m, glow);
    return { mesh: m, glow };
  });
  // うごく かべ(しずむ ときは ゆかの 下へ)
  const movers = s.movers.map((mv) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.98, WALL_H, 0.98), new THREE.MeshToonMaterial({ map: carveTex, gradientMap: toonGradient }));
    toWorld(mv.x + 0.5, mv.y + 0.5, m.position);
    m.castShadow = true;
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a3428 }));
    slot.position.copy(m.position).setY(0.003);
    g.add(m, slot);
    return { mesh: m, cur: -WALL_H };
  });
  scene.add(g);
  return { group: g, pads, movers };
}

// どんぐり・たからばこ・おばけ
export function acornMesh() {
  const m = new THREE.Mesh(acornGeometry(), new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient }));
  m.scale.setScalar(1.6);
  m.castShadow = true;
  return m;
}
export function chestMesh() {
  const g = new THREE.Group();
  const wood = toonMaterial(0x9a5a2a), gold = new THREE.MeshToonMaterial({ color: 0xffcf3a, emissive: 0x5a3a00, gradientMap: toonGradient });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.36, 0.42), wood);
  box.position.y = 0.18;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.6, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), wood);
  lid.position.y = 0.36;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.44), gold);
  band.position.y = 0.3;
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.05), gold);
  lock.position.set(0, 0.3, 0.23);
  g.add(box, lid, band, lock);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd860, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(1.4);
  glow.position.y = 0.35;
  g.add(glow);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
export function ghostMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshToonMaterial({ color: 0xe8f0ff, gradientMap: toonGradient, transparent: true, opacity: 0.85, emissive: 0x6a7aa8, emissiveIntensity: 0.4 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), mat);
  head.position.y = 0.6;
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 16, 1, true), mat);
  skirt.position.y = 0.32;
  skirt.rotation.x = Math.PI;
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a2a });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeMat);
    eye.scale.y = 1.4;
    eye.position.set(sx * 0.11, 0.66, 0.29);
    g.add(eye);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 4, 10, Math.PI), eyeMat);
  mouth.position.set(0, 0.52, 0.31);
  mouth.rotation.z = Math.PI;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9ab8ff, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(1.6);
  glow.position.y = 0.5;
  g.add(head, skirt, mouth, glow);
  return g;
}

// まわりの 森と いせき
export function buildStage(scene) {
  const group = new THREE.Group();
  const rand = makeRand(31);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), toonMaterial(0x4a6a32));
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  ground.userData.noMerge = true;
  group.add(ground);
  // めいろの まわりの いしの だん
  const rim = new THREE.Mesh(new THREE.BoxGeometry(N + 1.6, 0.3, N + 1.6), toonMaterial(0x8a8270));
  rim.position.y = -0.14;
  group.add(rim);
  // 大きな はしらと たおれた はしら・いしぞう
  for (const [x, z, h] of [[-N / 2 - 2.5, -N / 2 - 2, 6], [N / 2 + 2.5, -N / 2 - 2, 5], [-N / 2 - 3, N / 2 + 1, 4], [N / 2 + 3, N / 2, 6.5]]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, h, 10), toonMaterial(0xa89a80));
    col.position.set(x, h / 2, z);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 2), toonMaterial(0x9a8c72));
    cap.position.set(x, h + 0.25, z);
    group.add(col, cap);
  }
  const fallen = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 5, 10).rotateZ(Math.PI / 2), toonMaterial(0xa89a80));
  fallen.position.set(-N / 2 - 4, 0.5, 0);
  fallen.rotation.y = 0.5;
  group.add(fallen);
  // おくの 大きな いしの かお(いせきの ぬし)
  const face = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 2), toonMaterial(0x9a9078));
  face.position.set(0, 2.5, -N / 2 - 4);
  group.add(face);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.2), new THREE.MeshBasicMaterial({ color: 0x8af0ff }));
    eye.position.set(sx * 1.1, 3.2, -N / 2 - 2.95);
    eye.userData.noMerge = true;
    group.add(eye);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 0.2), toonMaterial(0x4a4232));
  mouth.position.set(0, 1.6, -N / 2 - 2.95);
  group.add(mouth);
  // 森の 木(まわり)
  const leafMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient });
  const crowns = [0x2f6b35, 0x3a7a3a, 0x4f8a3a].map((bottom, k) => foliageClump(rand, { detail: 1, balls: 4, bottom, top: [0x8fcf5f, 0x9ad86a, 0xb8d860][k] }));
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2, d = N / 2 + 6 + rand() * 18;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (z > N / 2 + 2 && Math.abs(x) < 10) continue; // カメラの 手前は あける
    const h = 5 + rand() * 5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, h, 7), toonMaterial(0x6a4a30));
    trunk.position.set(x, h / 2, z);
    const crown = new THREE.Mesh(crowns[i % 3], leafMat);
    crown.position.set(x, h, z);
    crown.scale.setScalar(h * 0.35);
    group.add(trunk, crown);
  }
  mergeStatic(group, (o) => o.userData.noMerge);
  group.traverse((o) => { if (o.name === 'merged') o.castShadow = o.receiveShadow = true; });
  scene.add(group);
  // すみの たいまつ
  const torches = [];
  for (const [x, z] of [[-N / 2 - 0.4, -N / 2 - 0.4], [N / 2 + 0.4, -N / 2 - 0.4], [-N / 2 - 0.4, N / 2 + 0.4], [N / 2 + 0.4, N / 2 + 0.4]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6), toonMaterial(0x5a3a22));
    pole.position.set(x, 0.8, z);
    const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    fire.position.set(x, 1.75, z);
    fire.scale.setScalar(1.2);
    scene.add(pole, fire);
    torches.push(fire);
  }
  function update(t) {
    for (const [k, f] of torches.entries()) f.scale.setScalar(1.1 + Math.sin(t * 13 + k * 2) * 0.12 + Math.sin(t * 7 + k) * 0.08);
  }
  return { group, update };
}
