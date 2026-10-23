// 秋の森の わたあめ まき の 会場(見た目だけ)。
//
// 夕やけの 紅葉の 森。大きな 切り株を くりぬいた おやつ屋さんの まえに、5つの 切り株の 台と わたあめ機。
// キャラは 台の うしろに 立って、わりばしを 回す。まわりは 赤・だいだい・黄の 木と、落ち葉の じゅうたん。
//
// 座標: 台の ならびの まん中が 原点。5人は x に ならぶ(SEAT_X)。カメラは +z(手前)から。上が +y。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { foliageClump, makeRand } from '../daruma/trees.js';

// 席 → よこの 位置(自分(席 0)を まん中に)
const ORDER = [2, 1, 3, 0, 4];
export const SEAT_X = (slot) => (ORDER[slot] - 2) * 1.2;
export const TABLE_Y = 0.42; // 台の 高さ(キャラの おなかより 下)
export const TABLE_Z = 0.55; // 台は キャラの 前
// わたあめの 色(ふつうは ピンク。ざらめで ソーダ・レモン・メロン)
export const WOOL_COLORS = [0xffb8d8, 0x9ad8ff, 0xfff08a, 0xb8f0a0];

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

// 切り株(年輪の 上面つき)
const ringTex = canvasTex(128, 128, (c, w, h) => {
  c.fillStyle = '#e8c088'; c.fillRect(0, 0, w, h);
  for (let r = 6; r < 64; r += 5 + (r % 3)) { c.strokeStyle = `rgba(140,90,50,${0.25 + (r % 7) * 0.03})`; c.lineWidth = 1.5; c.beginPath(); c.arc(64, 64, r, 0, 7); c.stroke(); }
});
function stump(r, h, top = true) {
  const g = new THREE.Group();
  const side = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, h, 14), toonMaterial(0x7a4e2e));
  side.position.y = h / 2;
  g.add(side);
  if (top) {
    const lid = new THREE.Mesh(new THREE.CircleGeometry(r * 0.98, 20).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: ringTex, gradientMap: toonGradient }));
    lid.position.y = h + 0.002;
    g.add(lid);
  }
  // 根っこ
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    const root = new THREE.Mesh(new THREE.ConeGeometry(r * 0.28, r * 0.9, 6).rotateZ(Math.PI / 2), toonMaterial(0x6a4024));
    root.position.set(Math.cos(a) * r * 1.1, 0.06, Math.sin(a) * r * 1.1);
    root.rotation.y = -a;
    g.add(root);
  }
  return g;
}

// わたあめ機: 切り株の 台の 上の 金の ボウルと、まん中で 回る ざらめの つぼ
export function woolMachine() {
  const g = new THREE.Group();
  g.add(stump(0.42, TABLE_Y));
  const metal = new THREE.MeshToonMaterial({ color: 0xd8dde4, gradientMap: toonGradient, side: THREE.DoubleSide });
  const pts = [];
  for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(new THREE.Vector2(0.12 + t * 0.24 + Math.sin(t * 3) * 0.02, t * 0.2)); }
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), metal);
  bowl.position.y = TABLE_Y;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.018, 6, 28).rotateX(Math.PI / 2), toonMaterial(0xff8a5a));
  rim.position.y = TABLE_Y + 0.2;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16).rotateX(-Math.PI / 2), metal);
  floor.position.y = TABLE_Y + 0.003;
  // まん中の つぼ(回る)。光って いる
  const head = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.07, 12), toonMaterial(0xff8a5a));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.015, 12), toonMaterial(0xffe0a0));
  lid.position.y = 0.04;
  head.add(pot, lid);
  head.position.y = TABLE_Y + 0.07;
  head.userData.noMerge = true;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb8d8, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(0.45);
  glow.position.y = TABLE_Y + 0.1;
  glow.userData.noMerge = true;
  // ボウルの 中を 回る 糸(ふわふわの すじ)
  const threads = [];
  for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.2 + k * 0.05, 0.006, 3, 24, Math.PI * 1.2).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
    m.position.y = TABLE_Y + 0.08 + k * 0.03;
    m.userData.noMerge = true;
    threads.push(m);
  }
  g.add(bowl, rim, floor, head, glow, ...threads);
  g.userData = { head, glow, threads };
  return g;
}

// わたあめ: わりばしの 先の ふわふわ。小さな ふわふわ(puff)を かさねて 大きく する。
// ざらめを 入れると、その 色の ふわふわが つく(しまもように なる)。
const puffGeo = (() => {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = 1 + 0.06 * Math.sin(x * 7 + y * 5) * Math.cos(z * 6 - x * 3);
    p.setXYZ(i, x * d, y * d, z * d);
  }
  g.computeVertexNormals();
  return g;
})();
const woolMats = WOOL_COLORS.map((c) => new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient, emissive: c, emissiveIntensity: 0.35 }));
export function cottonCandy() {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.5, 6), toonMaterial(0xf0dcb0));
  stick.position.y = 0.22; // わたあめから 上へ(手で もつ ところ)
  g.add(stick);
  const wool = new THREE.Group();
  g.add(wool);
  const core = new THREE.Mesh(puffGeo, woolMats[0]); // しんの ふわふわ
  wool.add(core);
  const puffs = [];
  let color = 0;
  // 大きさ(cm)に あわせて ふわふわを ふやす。r は 見た目の 半径(m)
  function setSize(cm) {
    const r = 0.03 + cm * 0.0058;
    const want = Math.min(60, Math.floor(cm / 1.4));
    while (puffs.length < want) {
      const k = puffs.length;
      const m = new THREE.Mesh(puffGeo, woolMats[color]);
      // 黄金角で まわりに ちらす(かたよらない)
      const y = 1 - ((k * 0.618) % 1) * 2;
      const a = k * 2.39996;
      const rr = Math.sqrt(1 - y * y);
      m.userData = { dir: new THREE.Vector3(Math.cos(a) * rr, y * 0.85, Math.sin(a) * rr), s: 0.55 + ((k * 0.37) % 1) * 0.3, born: cm, grow: 0 };
      wool.add(m);
      puffs.push(m);
    }
    while (puffs.length > want) wool.remove(puffs.pop());
    for (const m of puffs) {
      const d = m.userData;
      // 先に できた ふわふわは 内がわへ(あとから まいた 糸に つつまれる)
      const depth = Math.max(0.35, d.born / Math.max(cm, 1));
      m.position.copy(d.dir).multiplyScalar(r * 0.45 * depth);
      m.scale.setScalar(Math.max(0.01, r * (d.s + 0.1) * (0.7 + 0.3 * depth)));
    }
    core.scale.setScalar(r * 0.85);
    g.userData.r = r;
  }
  // ざらめを 入れた → その 色で ふわふわを ふやす
  function setColor(k) { color = k; }
  // ちぎれた → 外がわの ふわふわを ちらす(ちった ものを かえす)
  function tear(cm) {
    const out = [];
    const want = Math.min(60, Math.floor(cm / 1.4));
    while (puffs.length > want) { const m = puffs.pop(); m.updateMatrixWorld(); out.push(m); }
    return out;
  }
  g.userData = { setSize, setColor, tear, wool, stick, r: 0.03 };
  setSize(0);
  return g;
}

// 紅葉の 木(まわりの 森)
function buildTrees(g, rand) {
  const spots = [];
  for (let i = 0; i < 70; i++) {
    const a = -Math.PI * 0.95 + rand() * Math.PI * 0.9;
    const d = 9 + rand() * 26;
    const x = Math.cos(a) * d * 1.3, z = Math.sin(a) * d - 3;
    if (z > 4 && Math.abs(x) < 9) continue;
    spots.push({ x, z, h: 4 + rand() * 5 });
  }
  // よこの 手前にも すこし
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) spots.push({ x: sx * (8 + i * 2.2 + rand()), z: 2 + rand() * 5, h: 4 + rand() * 3 });
  const palettes = [[0x9a2a1a, 0xe8452c], [0xb4501a, 0xf39a2a], [0xb88a12, 0xf6cf3e], [0xa8381e, 0xf26b3a], [0x4f7a2a, 0x9cc85a]];
  const variants = palettes.map(([bottom, top]) => foliageClump(rand, { detail: 1, balls: 4, bottom, top }));
  const leafMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient });
  const crowns = variants.map((geo) => new THREE.InstancedMesh(geo, leafMat, spots.length));
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.16, 1, 7), toonMaterial(0x5a3a26), spots.length);
  const counts = variants.map(() => 0);
  const dummy = new THREE.Object3D();
  spots.forEach(({ x, z, h }, i) => {
    dummy.position.set(x, h * 0.3, z);
    dummy.rotation.set(0, rand() * 6, 0);
    dummy.scale.set(h * 0.9, h * 0.6, h * 0.9);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    const k = rand() < 0.08 ? 4 : Math.floor(rand() * 4);
    dummy.position.set(x, h * 0.72, z);
    dummy.scale.set(h * 0.32, h * 0.3 * (0.85 + rand() * 0.3), h * 0.32);
    dummy.updateMatrix();
    crowns[k].setMatrixAt(counts[k]++, dummy.matrix);
  });
  crowns.forEach((m, k) => { m.count = counts[k]; m.castShadow = true; m.userData.noMerge = true; g.add(m); });
  trunks.castShadow = true;
  trunks.userData.noMerge = true;
  g.add(trunks);
}

// 落ち葉の じゅうたん(地面に ちらばる もみじ)
function buildLeaves(g, rand) {
  const shape = new THREE.Shape();
  for (let k = 0; k <= 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const r = k % 2 ? 0.45 : 1;
    const x = Math.sin(a) * r, y = Math.cos(a) * r;
    if (k === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient }), 520);
  const dummy = new THREE.Object3D();
  const cols = [0xe8452c, 0xf39a2a, 0xf6cf3e, 0xc8502a, 0xb8782a].map((c) => new THREE.Color(c));
  for (let i = 0; i < mesh.count; i++) {
    const x = (rand() - 0.5) * 30, z = -10 + rand() * 18;
    dummy.position.set(x, 0.012 + rand() * 0.01, z);
    dummy.rotation.set(0, rand() * 6, 0);
    dummy.scale.setScalar(0.08 + rand() * 0.1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, cols[Math.floor(rand() * cols.length)]);
  }
  mesh.receiveShadow = true;
  mesh.userData.noMerge = true;
  g.add(mesh);
}

// おやつ屋さん: 大きな 切り株を くりぬいた お店。どんぐりの ぼうしの やね、「わたあめ」の かんばん
function buildShop(g) {
  const shop = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 3.0, 24, 1, false, Math.PI * 0.15, Math.PI * 0.7), toonMaterial(0x7a4e2e));
  body.material.side = THREE.DoubleSide;
  body.rotation.y = Math.PI;
  body.position.set(0, 1.5, -3.2);
  shop.add(body);
  const roof = new THREE.Mesh(new THREE.SphereGeometry(3.1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), toonMaterial(0x9a6a3a));
  roof.scale.y = 0.45;
  roof.position.set(0, 3.0, -3.2);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 8), toonMaterial(0x6a4024));
  stem.position.set(0, 4.5, -3.2);
  shop.add(roof, stem);
  // やねの ぼうしの もよう(うろこ)
  for (let row = 0; row < 3; row++) for (let k = 0; k < 18 - row * 4; k++) {
    const a = (k / (18 - row * 4)) * Math.PI * 2;
    const r = 2.9 - row * 0.85;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), toonMaterial(row % 2 ? 0xb07a40 : 0x8a5a30));
    b.position.set(Math.cos(a) * r, 3.05 + row * 0.42, -3.2 + Math.sin(a) * r);
    b.scale.y = 0.5;
    shop.add(b);
  }
  // おみせの カウンター(うしろ)と ひさし
  const counter = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.0, 0.7), toonMaterial(0xc89a62));
  counter.position.set(0, 0.5, -1.9);
  shop.add(counter);
  for (let k = 0; k < 10; k++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 1.3), toonMaterial(k % 2 ? 0xfff2dc : 0xf08a3a));
    st.position.set(-2.16 + (k + 0.5) * 0.432, 2.55, -1.75);
    st.rotation.x = 0.32;
    shop.add(st);
  }
  // かんばん
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.66), new THREE.MeshBasicMaterial({ map: canvasTex(256, 72, (c, w, h) => {
    c.fillStyle = '#fff4e0'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#e8743a'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
    c.fillStyle = '#e8507a'; c.font = 'bold 48px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('わたあめ', w / 2, h / 2 + 3);
  }) }));
  sign.position.set(0, 3.05, -1.05);
  sign.userData.noMerge = true;
  shop.add(sign);
  // かざりの わたあめの ふくろ(ならんで ぶらさがる)
  const bagCols = [0xffb8d8, 0x9ad8ff, 0xfff08a, 0xb8f0a0, 0xffb8d8];
  bagCols.forEach((c, k) => {
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient, transparent: true, opacity: 0.92 }));
    bag.scale.set(0.9, 1.25, 0.9);
    bag.position.set(-1.6 + k * 0.8, 2.05, -1.35);
    bag.userData.noMerge = true;
    const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.25, 3), toonMaterial(0x3a2a20));
    tie.position.set(bag.position.x, 2.42, -1.35);
    shop.add(bag, tie);
  });
  g.add(shop);
}

// どんぐりの ランプ(あたたかい あかり)
function acornLamp(color = 0xffc070) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
  body.scale.y = 1.2;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toonMaterial(0x7a5030));
  cap.position.y = 0.06;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(1.3);
  glow.userData.noMerge = true;
  body.userData.noMerge = true;
  g.add(body, cap, glow);
  return g;
}

export function buildStage(scene) {
  const group = new THREE.Group();
  const rand = makeRand(29);
  // 地面: 落ち葉の 森の 広場
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2), toonMaterial(0x8a6238));
  ground.receiveShadow = true;
  ground.userData.noMerge = true;
  group.add(ground);
  buildLeaves(group, rand);
  buildShop(group);
  buildTrees(group, rand);
  // ランプの ひも(屋台の 前を よこぎる)
  const lamps = [];
  const pts = [];
  for (let k = 0; k <= 10; k++) { const u = k / 10; pts.push(new THREE.Vector3(-6 + u * 12, 3.6 - Math.sin(u * Math.PI) * 0.5, -0.6)); }
  const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.015, 4), toonMaterial(0x3a2a20));
  rope.userData.noMerge = true;
  group.add(rope);
  for (let k = 1; k < 10; k++) {
    const l = acornLamp(k % 2 ? 0xffc070 : 0xff9a5a);
    l.position.copy(pts[k]).add(new THREE.Vector3(0, -0.25, 0));
    l.userData.ph = k;
    l.userData.noMerge = true;
    group.add(l);
    lamps.push(l);
  }
  // 5つの わたあめ機
  const machines = [];
  for (let slot = 0; slot < 5; slot++) {
    const m = woolMachine();
    m.position.set(SEAT_X(slot), 0, TABLE_Z);
    m.userData.noMerge = true;
    group.add(m);
    machines.push(m);
  }
  // 大きな かぼちゃ・きのこ・どんぐりの 山(かざり)
  for (const [x, z, s] of [[-5.4, 1.2, 1], [5.6, 0.6, 0.8], [-6.6, -1.4, 0.7]]) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.5 * s, 14, 10), toonMaterial(0xf08a2a));
    p.scale.y = 0.75;
    p.position.set(x, 0.36 * s, z);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.2, 6), toonMaterial(0x5a7a2a));
    st.position.set(x, 0.75 * s, z);
    group.add(p, st);
  }
  for (const [x, z] of [[4.6, 2.2], [-4.4, 2.6], [6.6, -2.0]]) {
    const capM = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toonMaterial(0xd8402f));
    capM.position.set(x, 0.32, z);
    const stemM = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.34, 8), toonMaterial(0xf4e8d0));
    stemM.position.set(x, 0.17, z);
    group.add(capM, stemM);
  }
  mergeStatic(group, (o) => o.userData.noMerge);
  group.traverse((o) => { if (o.name === 'merged') o.castShadow = o.receiveShadow = true; });
  scene.add(group);
  // 屋台の あかり
  const lamp = new THREE.PointLight(0xffc880, 14, 12, 1.4);
  lamp.position.set(0, 3.0, 1.6);
  scene.add(lamp);
  // まう 落ち葉
  const falling = [];
  const leafGeo = new THREE.PlaneGeometry(0.12, 0.12);
  for (let k = 0; k < 26; k++) {
    const m = new THREE.Mesh(leafGeo, new THREE.MeshBasicMaterial({ color: [0xe8452c, 0xf39a2a, 0xf6cf3e][k % 3], side: THREE.DoubleSide }));
    m.userData = { x: (Math.random() - 0.5) * 14, z: -4 + Math.random() * 7, ph: Math.random() * 10, sp: 0.4 + Math.random() * 0.4 };
    scene.add(m);
    falling.push(m);
  }
  function update(t) {
    for (const l of lamps) l.rotation.z = Math.sin(t * 1.2 + l.userData.ph) * 0.08;
    for (const m of falling) {
      const d = m.userData;
      const y = 6 - ((t * d.sp + d.ph) % 6);
      m.position.set(d.x + Math.sin(t * 1.3 + d.ph) * 0.6, y, d.z + Math.cos(t + d.ph) * 0.3);
      m.rotation.set(t * 2 + d.ph, t * 1.5, t + d.ph);
    }
  }
  return { group, update, machines };
}
