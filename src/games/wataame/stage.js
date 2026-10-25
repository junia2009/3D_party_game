// 秋の森の わたあめ まき の 会場(見た目だけ)。
//
// 夕やけの 紅葉の 森。大きな 切り株を くりぬいた おやつ屋さんの まえに、5つの 切り株の 台と わたあめ機。
// キャラは 台の うしろに 立って、わりばしを 回す。まわりは 赤・だいだい・黄の 木と、落ち葉の じゅうたん。
//
// 座標: 台の ならびの まん中が 原点。5人は x に ならぶ(SEAT_X)。カメラは +z(手前)から。上が +y。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { acornGeometry, foliageClump, makeRand } from '../daruma/trees.js';

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
  const metal = new THREE.MeshToonMaterial({ color: 0x9aa4b2, gradientMap: toonGradient, side: THREE.DoubleSide });
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
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.2 + k * 0.05, 0.006, 3, 24, Math.PI * 1.2).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd8ea, transparent: true, opacity: 0.6, depthWrite: false }));
    m.position.y = TABLE_Y + 0.08 + k * 0.03;
    m.userData.noMerge = true;
    threads.push(m);
  }
  // 台の 前の 名札(プレイヤーの 色。game.js が ぬる)
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 16).rotateX(Math.PI / 2), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient }));
  plate.position.set(0, TABLE_Y * 0.55, 0.47);
  plate.userData.noMerge = true;
  const acorn = new THREE.Mesh(acornGeometry(), new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient }));
  acorn.position.set(0, TABLE_Y * 0.55 - 0.02, 0.5);
  acorn.scale.setScalar(0.7);
  g.add(bowl, rim, floor, head, glow, ...threads, plate, acorn);
  g.userData = { head, glow, threads, plate };
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
const WOOL_SRC = WOOL_COLORS.map((c) => new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient, emissive: c, emissiveIntensity: 0.35 }));
export function cottonCandy() {
  const g = new THREE.Group();
  const woolMats = WOOL_SRC.map((m) => m.clone()); // わたあめごとに 素材を もつ(はりで 光らせる ため)
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

// お店の かざり: 光る まるい 窓・ざらめの びんの たな・えんとつ・干し柿・ねだんの こくばん
function buildShopDetails(g, rand) {
  const warm = new THREE.MeshBasicMaterial({ color: 0xffd890 });
  for (const sx of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.36, 20), warm);
    win.position.set(sx * 2.05, 1.95, -1.55);
    win.rotation.y = sx * -0.55;
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 6, 20), toonMaterial(0x5a3a22));
    frame.position.copy(win.position);
    frame.rotation.y = win.rotation.y;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.04, 0.03), toonMaterial(0x5a3a22));
    bar.position.copy(win.position);
    bar.rotation.y = win.rotation.y;
    const bar2 = bar.clone();
    bar2.rotation.z = Math.PI / 2;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb860, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(1.6);
    glow.position.copy(win.position).add(new THREE.Vector3(0, 0, 0.05));
    glow.userData.noMerge = true;
    g.add(win, frame, bar, bar2, glow);
  }
  // うしろの たなと ざらめの びん(ピンク・ソーダ・レモン・メロン)
  const shelfMat = toonMaterial(0x9a6a3a);
  for (const y of [1.35, 1.85]) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 0.4), shelfMat);
    shelf.position.set(0, y, -2.55);
    g.add(shelf);
  }
  const glassMat = new THREE.MeshToonMaterial({ color: 0xe8f4ff, gradientMap: toonGradient, transparent: true, opacity: 0.45 });
  for (let row = 0; row < 2; row++) for (let k = 0; k < 7; k++) {
    const x = -1.45 + k * 0.48;
    const y = (row ? 1.85 : 1.35) + 0.03;
    const col = WOOL_COLORS[(k + row * 2) % 4];
    const sugar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 10), toonMaterial(col));
    sugar.position.set(x, y + 0.09, -2.55);
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 12), glassMat);
    jar.position.set(x, y + 0.15, -2.55);
    jar.userData.noMerge = true;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 12), toonMaterial(0xc85a3a));
    lid.position.set(x, y + 0.32, -2.55);
    g.add(sugar, jar, lid);
  }
  // カウンターの 上: わたあめを さした どんぐりの つぼ
  for (const [x, c] of [[-1.5, 0], [1.5, 1], [-0.7, 2], [0.8, 3]]) {
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), toonMaterial(0xb5702f));
    pot.position.set(x, 1.1, -1.85);
    g.add(pot);
    for (let k = 0; k < 3; k++) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4), toonMaterial(0xf0dcb0));
      const ax = (k - 1) * 0.12;
      st.position.set(x + ax, 1.35, -1.85);
      st.rotation.z = -ax * 1.5;
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 2), new THREE.MeshToonMaterial({ color: WOOL_COLORS[(c + k) % 4], gradientMap: toonGradient, emissive: WOOL_COLORS[(c + k) % 4], emissiveIntensity: 0.3 }));
      ball.position.set(x + ax * 1.8, 1.62 + (k === 1 ? 0.06 : 0), -1.85);
      g.add(st, ball);
    }
  }
  // えんとつ(やねの 上)
  const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 1.0, 10), toonMaterial(0x8a7a6a));
  chim.position.set(1.7, 4.0, -3.9);
  const chimTop = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10), toonMaterial(0x5a4a3a));
  chimTop.position.set(1.7, 4.55, -3.9);
  g.add(chim, chimTop);
  // 干し柿の すだれ(ひさしの はしから ぶらさがる)
  for (const sx of [-1, 1]) for (let j = 0; j < 2; j++) {
    const x = sx * (2.35 + j * 0.25), z = -1.15 - j * 0.15;
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.3, 3), toonMaterial(0x6a5030));
    str.position.set(x, 1.85, z);
    g.add(str);
    for (let k = 0; k < 5; k++) {
      const kaki = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), toonMaterial(0xe86a1a));
      kaki.scale.y = 1.25;
      kaki.position.set(x, 2.4 - k * 0.24, z);
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.04, 4), toonMaterial(0x5a4a20));
      leaf.position.set(x, 2.49 - k * 0.24, z);
      g.add(kaki, leaf);
    }
  }
  // ねだんの こくばん(よこの イーゼル)
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), new THREE.MeshBasicMaterial({ map: canvasTex(160, 128, (c, w, h) => {
    c.fillStyle = '#2f4a3a'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#a8784a'; c.lineWidth = 10; c.strokeRect(0, 0, w, h);
    c.fillStyle = '#fff6e0'; c.textAlign = 'center'; c.font = 'bold 24px sans-serif'; c.fillText('わたあめ', w / 2, 38);
    c.font = 'bold 18px sans-serif'; c.fillText('1本 どんぐり 3こ', w / 2, 70);
    c.fillStyle = '#ffb8d8'; c.fillText('いろ ざらめ +1こ', w / 2, 100);
  }) }));
  board.position.set(3.2, 1.1, -0.2);
  board.rotation.y = -0.45;
  board.userData.noMerge = true;
  const legMat = toonMaterial(0x8a5a32);
  for (const [dx, dz, rz, rx] of [[-0.3, 0.05, 0.12, 0], [0.3, 0.05, -0.12, 0], [0, -0.25, 0, 0.35]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.5, 0.05), legMat);
    leg.position.set(3.2 + dx * Math.cos(0.45), 0.75, -0.2 + dz + dx * Math.sin(0.45) * 0.5);
    leg.rotation.set(rx, -0.45, rz);
    g.add(leg);
  }
  void rand;
}

// 遠くの 山なみ: 紅葉の 山を 2重に(手前は だいだい、おくは むらさき)
function buildMountains(g, rand) {
  for (const [z, h, col, step] of [[-70, 16, 0x8a4a5a, 9], [-48, 11, 0xb8603a, 6]]) {
    const pts = [];
    for (let x = -90; x <= 90; x += step) pts.push([x, h * (0.5 + rand() * 0.6)]);
    const shape = new THREE.Shape();
    shape.moveTo(-90, -2);
    for (const [x, y] of pts) shape.lineTo(x, y);
    shape.lineTo(90, -2);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: col }));
    m.position.z = z;
    m.userData.noMerge = true;
    g.add(m);
  }
}

// 地面の かざり: 落ち葉の 山・どんぐり・きのこの むれ・丸太の ベンチ・とびいし
function buildGroundDetails(g, rand) {
  // 落ち葉の 山(こんもり)
  const leafMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient });
  const pile = foliageClump(rand, { detail: 1, balls: 4, bottom: 0x9a3a1a, top: 0xf0902a });
  for (const [x, z, sc] of [[-3.6, 1.6, 0.55], [3.9, 1.9, 0.5], [-6.2, 0.2, 0.7], [6.8, 1.0, 0.65], [-2.9, -0.9, 0.4], [4.5, -1.3, 0.45]]) {
    const m = new THREE.Mesh(pile, leafMat);
    m.position.set(x, 0.05, z);
    m.scale.set(sc * 0.8, sc * 0.75, sc * 0.8);
    m.rotation.y = rand() * 6;
    m.userData.noMerge = true;
    g.add(m);
  }
  // どんぐり(ちらばる)
  const ac = new THREE.InstancedMesh(acornGeometry(), new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient }), 28);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < ac.count; i++) {
    let x, z;
    do { x = (rand() - 0.5) * 14; z = -1.5 + rand() * 5; } while (Math.abs(x) < 3.2 && z > -0.6 && z < 1.4);
    dummy.position.set(x, 0.07, z);
    dummy.rotation.set(rand() * 0.5 + 1.2, rand() * 6, 0);
    dummy.scale.setScalar(0.6 + rand() * 0.35);
    dummy.updateMatrix();
    ac.setMatrixAt(i, dummy.matrix);
  }
  ac.userData.noMerge = true;
  g.add(ac);
  // きのこの むれ
  for (const [x, z] of [[-3.4, 2.6], [3.3, 2.9], [-5.2, -1.6], [5.4, -0.8]]) {
    for (let k = 0; k < 3; k++) {
      const s = 0.5 + rand() * 0.5;
      const dx = x + (rand() - 0.5) * 0.5, dz = z + (rand() - 0.5) * 0.4;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * s, 0.05 * s, 0.2 * s, 6), toonMaterial(0xf4e8d0));
      stem.position.set(dx, 0.1 * s, dz);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toonMaterial(k % 2 ? 0xd8402f : 0xc88a3a));
      cap.position.set(dx, 0.19 * s, dz);
      g.add(stem, cap);
    }
  }
  // 丸太の ベンチ(よこ)
  for (const sx of [-1, 1]) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.2, 12).rotateZ(Math.PI / 2), toonMaterial(0x7a4e2e));
    log.position.set(sx * 5.0, 0.28, 2.6);
    log.rotation.y = sx * 0.4;
    g.add(log);
    for (const e of [-1, 1]) {
      const end = new THREE.Mesh(new THREE.CircleGeometry(0.27, 14), new THREE.MeshToonMaterial({ map: ringTex, gradientMap: toonGradient }));
      const ax = new THREE.Vector3(1.1 * e, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), sx * 0.4);
      end.position.set(sx * 5.0 + ax.x * 1.005, 0.28, 2.6 + ax.z * 1.005);
      end.rotation.y = sx * 0.4 + e * Math.PI / 2;
      g.add(end);
    }
  }
  // とびいし(手前から お店へ)
  const stoneMat = toonMaterial(0xb8ab98);
  for (let k = 0; k < 7; k++) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.2 + rand() * 0.06, 0.23, 0.05, 9), stoneMat);
    st.position.set(Math.sin(k * 0.9) * 0.4 + (k % 2 ? 0.2 : -0.2), 0.025, 6.2 - k * 0.7);
    if (st.position.z < 1.6) continue;
    g.add(st);
  }
}

// 上から ぶらさがる 枝(画面の 上の すみを ふちどる)
function buildBranches(g, rand) {
  const leafMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient });
  const palettes = [[0x9a2a1a, 0xe8452c], [0xb4501a, 0xf39a2a], [0xb88a12, 0xf6cf3e]];
  for (const [x, y, z, sc, k] of [[-2.7, 5.9, 2.6, 0.9, 0], [-1.6, 6.4, 2.2, 0.7, 2], [2.8, 6.0, 2.8, 0.85, 1], [1.8, 6.5, 2.0, 0.6, 0]]) {
    const geo = foliageClump(rand, { detail: 1, balls: 4, bottom: palettes[k][0], top: palettes[k][1] });
    const m = new THREE.Mesh(geo, leafMat);
    m.position.set(x, y, z);
    m.scale.set(sc * 1.4, sc * 0.7, sc);
    m.userData.noMerge = true;
    g.add(m);
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 3, 6).rotateZ(Math.sign(x) * 1.2), toonMaterial(0x4a3020));
    br.position.set(x + Math.sign(x) * 1.2, y + 0.3, z);
    g.add(br);
  }
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
  buildShopDetails(group, rand);
  buildTrees(group, rand);
  buildMountains(group, rand);
  buildGroundDetails(group, rand);
  buildBranches(group, rand);
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
  // 木もれ日: 右上の 木の あいだから ななめに さす 光の 帯
  const shaftTex = canvasTex(32, 128, (c, w, h) => {
    const grd = c.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(255,220,160,0)'); grd.addColorStop(0.25, 'rgba(255,220,160,0.9)'); grd.addColorStop(1, 'rgba(255,220,160,0)');
    c.fillStyle = grd; c.fillRect(0, 0, w, h);
    const g2 = c.createLinearGradient(0, 0, w, 0);
    g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(0.5, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)');
    c.globalCompositeOperation = 'destination-out'; c.fillStyle = g2; c.fillRect(0, 0, w, h);
  });
  const shafts = [];
  for (let k = 0; k < 5; k++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6 + k * 0.15, 9), new THREE.MeshBasicMaterial({ map: shaftTex, color: 0xffc880, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    m.position.set(-2.6 + k * 1.5, 3.4, -0.9 - (k % 2) * 0.7);
    m.rotation.set(0, 0, -0.5);
    m.userData.ph = k * 1.7;
    scene.add(m);
    shafts.push(m);
  }
  // 光の 中を ただよう ちり
  const motes = (() => {
    const n = 60, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 9; pos[i * 3 + 1] = 0.6 + Math.random() * 4; pos[i * 3 + 2] = -2 + Math.random() * 3.5; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTex, color: 0xffe2a8, size: 0.09, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(m);
    return m;
  })();
  const moteBase = Float32Array.from(motes.geometry.attributes.position.array);
  // えんとつの けむり
  const smoke = [];
  for (let k = 0; k < 8; k++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xe8e0d8, transparent: true, opacity: 0, depthWrite: false }));
    m.userData = { ph: k / 8 };
    scene.add(m);
    smoke.push(m);
  }
  function update(t) {
    for (const l of lamps) l.rotation.z = Math.sin(t * 1.2 + l.userData.ph) * 0.08;
    for (const m of shafts) m.material.opacity = 0.2 + Math.sin(t * 0.5 + m.userData.ph) * 0.08;
    const mp = motes.geometry.attributes.position;
    for (let i = 0; i < mp.count; i++) {
      mp.setX(i, moteBase[i * 3] + Math.sin(t * 0.3 + i) * 0.4);
      mp.setY(i, moteBase[i * 3 + 1] + Math.sin(t * 0.5 + i * 1.7) * 0.3);
    }
    mp.needsUpdate = true;
    for (const m of smoke) {
      const k = (t * 0.25 + m.userData.ph) % 1;
      m.position.set(1.7 + Math.sin(k * 5 + m.userData.ph * 7) * 0.25 + k * 0.6, 4.7 + k * 2.2, -3.9);
      m.scale.setScalar(0.4 + k * 1.1);
      m.material.opacity = Math.sin(k * Math.PI) * 0.4;
    }
    for (const m of falling) {
      const d = m.userData;
      const y = 6 - ((t * d.sp + d.ph) % 6);
      m.position.set(d.x + Math.sin(t * 1.3 + d.ph) * 0.6, y, d.z + Math.cos(t + d.ph) * 0.3);
      m.rotation.set(t * 2 + d.ph, t * 1.5, t + d.ph);
    }
  }
  return { group, update, machines };
}
