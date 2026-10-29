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
const capTex = canvasTex(64, 64, (c, w, h) => {
  c.fillStyle = '#e2dccb'; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(90,80,60,.5)'; c.lineWidth = 2; c.strokeRect(3, 3, w - 6, h - 6);
  c.beginPath(); c.moveTo(10, 40); c.lineTo(24, 30); c.lineTo(30, 44); c.stroke(); // ひび
  for (let i = 0; i < 20; i++) { c.fillStyle = 'rgba(80,70,50,.2)'; c.fillRect((i * 31) % w, (i * 19) % h, 4, 3); }
});
const vineTex = canvasTex(64, 64, (c, w, h) => {
  c.clearRect(0, 0, w, h);
  for (let k = 0; k < 4; k++) {
    const x0 = 8 + k * 15;
    c.strokeStyle = '#3a6a2a'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x0, 0);
    const len = 30 + ((k * 13) % 30);
    for (let y = 0; y < len; y += 4) c.lineTo(x0 + Math.sin(y * 0.3 + k) * 3, y);
    c.stroke();
    c.fillStyle = k % 2 ? '#5a9a3a' : '#6aaa4a';
    for (let y = 4; y < len; y += 7) { c.beginPath(); c.ellipse(x0 + Math.sin(y * 0.3 + k) * 3 + (y % 14 ? 4 : -4), y, 4, 2.5, 0.5, 0, 7); c.fill(); }
  }
});
const floorTex = canvasTex(64, 64, (c, w, h) => {
  c.fillStyle = '#4a5a32'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#6e6c66'; c.fillRect(4, 4, w - 8, h - 8); // ゆかは はいいろの いし(どんぐりの ちゃいろが 目だつ ように)
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
  // 上の いしの ふた(すこし はみだす)と、まだらの こけ
  const capMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.04, 0.1, 1.04), new THREE.MeshToonMaterial({ map: capTex, gradientMap: toonGradient }), walls.length);
  const mossGeo = new THREE.SphereGeometry(0.5, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const mossMesh = new THREE.InstancedMesh(mossGeo, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient }), walls.length * 2);
  const rand = makeRand(5);
  const col = new THREE.Color();
  let mi = 0;
  const tops = [];
  walls.forEach(([x, y], k) => {
    const sc = 0.9 + rand() * 0.2;
    toWorld(x + 0.5, y + 0.5, dummy.position).y = (WALL_H * sc) / 2;
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, sc, 1);
    dummy.updateMatrix();
    wallMesh.setMatrixAt(k, dummy.matrix);
    const top = WALL_H * sc;
    tops.push(top);
    dummy.position.y = top + 0.04;
    dummy.scale.set(1, 1, 1);
    dummy.rotation.y = (Math.floor(rand() * 4) * Math.PI) / 2;
    dummy.updateMatrix();
    capMesh.setMatrixAt(k, dummy.matrix);
    // こけは ところどころ(すみに よせて、大きさも ばらばら)
    for (let j = 0; j < 2; j++) {
      if (rand() > 0.45) continue;
      toWorld(x + 0.2 + rand() * 0.6, y + 0.2 + rand() * 0.6, dummy.position).y = top + 0.08;
      const r = 0.25 + rand() * 0.35;
      dummy.scale.set(r, r * 0.35, r * (0.7 + rand() * 0.5));
      dummy.rotation.set(0, rand() * 6, 0);
      dummy.updateMatrix();
      mossMesh.setMatrixAt(mi, dummy.matrix);
      mossMesh.setColorAt(mi, col.setHex([0x5a8a3a, 0x6a9a42, 0x4a7a32][mi % 3]));
      mi++;
    }
  });
  mossMesh.count = mi;
  wallMesh.castShadow = wallMesh.receiveShadow = true;
  capMesh.castShadow = capMesh.receiveShadow = true;
  g.add(wallMesh, capMesh, mossMesh);
  // つた: ゆかに めんした かべの 手前がわに たれる
  const vineMat = new THREE.MeshToonMaterial({ map: vineTex, gradientMap: toonGradient, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  const vineSpots = walls.filter(([x, y]) => s.grid[y + 1]?.[x] === 0 && rand() < 0.22);
  const vines = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.7, 0.8), vineMat, vineSpots.length);
  vineSpots.forEach(([x, y], k) => {
    toWorld(x + 0.3 + rand() * 0.4, y + 1.01, dummy.position).y = 0.62;
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0.8 + rand() * 0.5, 0.8 + rand() * 0.4, 1);
    dummy.updateMatrix();
    vines.setMatrixAt(k, dummy.matrix);
  });
  g.add(vines);
  // ゆかの すきまの 草と 小さな きのこ
  const tufts = floors.filter(() => rand() < 0.35);
  const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.22, 4), toonMaterial(0x6a9a3a), tufts.length * 3);
  let gi = 0;
  for (const [x, y] of tufts) {
    const cx = x + (rand() < 0.5 ? 0.1 : 0.9), cy = y + 0.15 + rand() * 0.7;
    for (let j = 0; j < 3; j++) {
      toWorld(cx + (rand() - 0.5) * 0.12, cy + (rand() - 0.5) * 0.12, dummy.position).y = 0.1;
      dummy.rotation.set((rand() - 0.5) * 0.6, 0, (rand() - 0.5) * 0.6);
      dummy.scale.setScalar(0.8 + rand() * 0.6);
      dummy.updateMatrix();
      grass.setMatrixAt(gi++, dummy.matrix);
    }
  }
  g.add(grass);
  for (const [x, y] of floors.filter(() => rand() < 0.05)) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), toonMaterial(rand() < 0.5 ? 0xe8503a : 0xe8b04a));
    toWorld(x + 0.88, y + 0.12, cap.position).y = 0.1;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.1, 6), toonMaterial(0xf4e8d0));
    stem.position.copy(cap.position).setY(0.05);
    g.add(cap, stem);
  }
  // かべの 上の たいまつ(すみと まわりの かべに いくつか)
  const torches = [];
  walls.forEach(([x, y], k) => {
    const edge = x === 0 || y === 0 || x === N - 1 || y === N - 1;
    if (!edge || (x + y) % 4 !== 0 || y === N - 1) return;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.5, 6), toonMaterial(0x5a3a22));
    toWorld(x + 0.5, y + 0.5, pole.position).y = tops[k] + 0.3;
    const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    fire.position.copy(pole.position).setY(tops[k] + 0.62);
    fire.scale.setScalar(0.7);
    g.add(pole, fire);
    torches.push(fire);
  });
  // ホタル(めいろの 上を ふわふわ)
  const fly = (() => {
    const n = 50, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * N; pos[i * 3 + 1] = 0.6 + Math.random() * 2; pos[i * 3 + 2] = (Math.random() - 0.5) * N; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTex, color: 0xd8ff7a, size: 0.35, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  })();
  const flyBase = Float32Array.from(fly.geometry.attributes.position.array);
  g.add(fly);
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
    return { mesh: m, glow, x: p.x, y: p.y, flash: 0 };
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
  function update(t) {
    for (const [k, f] of torches.entries()) f.scale.setScalar(0.65 + Math.sin(t * 13 + k * 2) * 0.08 + Math.sin(t * 7 + k) * 0.05);
    const fp = fly.geometry.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      fp.setX(i, flyBase[i * 3] + Math.sin(t * 0.5 + i) * 0.6);
      fp.setY(i, flyBase[i * 3 + 1] + Math.sin(t * 0.9 + i * 2) * 0.3);
      fp.setZ(i, flyBase[i * 3 + 2] + Math.cos(t * 0.4 + i) * 0.6);
    }
    fp.needsUpdate = true;
    fly.material.opacity = 0.6 + Math.sin(t * 2.5) * 0.3;
  }
  return { group: g, pads, movers, update };
}

// どんぐり・たからばこ・おばけ
export function acornMesh() {
  const m = new THREE.Mesh(acornGeometry(), new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient, emissive: 0x3a2008, emissiveIntensity: 0.6 }));
  m.scale.setScalar(1.6);
  m.castShadow = true;
  return m;
}
export function chestMesh() {
  const g = new THREE.Group();
  const wood = toonMaterial(0x9a5a2a), gold = new THREE.MeshToonMaterial({ color: 0xffcf3a, emissive: 0x5a3a00, gradientMap: toonGradient });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.36, 0.42), wood);
  box.position.y = 0.18;
  // ふたは うしろの ふちを じくに ひらく
  const lid = new THREE.Group();
  lid.name = 'lid';
  lid.position.set(0, 0.36, -0.21);
  const lidTop = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.6, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), wood);
  lidTop.position.z = 0.21;
  lid.add(lidTop);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.44), gold);
  band.position.y = 0.18;
  const lidBand = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), gold);
  lidBand.position.z = 0.21;
  lid.add(lidBand);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.05), gold);
  lock.position.set(0, 0.3, 0.23);
  g.add(box, lid, band, lock);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd860, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(1.4);
  glow.position.y = 0.35;
  glow.name = 'glow';
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
