// 花ぬり陣取り の会場「丘の上の まん丸な花畑」。
//
// 森をぬけた丘のてっぺんに、まん丸な花畑(半径 6m の やわらかい土)。まん中に大きなひまわり。
// まわりを木の柵がかこみ、うしろに大きな風車。丘はゆるやかに下って、ふもとは森。遠くに山なみ。
// 観客(リス・ハリネズミ・コマドリ)は柵の外の切り株に。
//
// 座標: 花畑のまん中が原点。カメラは +z(手前)から見る。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { grassTexture } from '../daruma/ground.js';
import { buildForestTrees, foliageClump, makeRand } from '../daruma/trees.js';
import { FIELD_R, SUN_R } from './rules.js';

// 丘の高さ: 花畑のあたりは平ら、そこから外へゆるく下る
export function hillY(x, z) {
  const d = Math.hypot(x, z);
  if (d < FIELD_R + 2.5) return 0;
  const t = d - (FIELD_R + 2.5);
  return -t * t * 0.018 - Math.max(0, t - 12) * 0.25;
}

// 土の絵: やわらかい茶色に、小石と、たがやした すじ
function soilTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#b98a5a';
  g.fillRect(0, 0, 256, 256);
  const rand = makeRand(12);
  for (let i = 0; i < 900; i++) {
    const v = 150 + rand() * 60;
    g.fillStyle = `rgba(${v},${v * 0.72},${v * 0.48},${0.35 + rand() * 0.4})`;
    g.fillRect(rand() * 256, rand() * 256, 1 + rand() * 3, 1 + rand() * 3);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = 'rgba(230,215,190,0.8)';
    g.beginPath();
    g.ellipse(rand() * 256, rand() * 256, 1.5 + rand() * 2, 1 + rand() * 1.5, rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildGround(g) {
  // 丘(草): 花畑のふちから外へ、輪を重ねた円盤を作って hillY で曲げる
  const rings = 48, segs = 96;
  const pos = [], uv = [], col = [], idx = [];
  const c = new THREE.Color();
  for (let r = 0; r <= rings; r++) {
    const rad = FIELD_R - 0.05 + (80 - FIELD_R) * (r / rings) ** 2;
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      pos.push(x, hillY(x, z) - 0.02, z);
      uv.push(x / 3, z / 3);
      const patch = Math.sin(x * 0.3 + Math.sin(z * 0.2) * 2) * Math.sin(z * 0.25 + x * 0.1);
      c.setHSL(0.26 + patch * 0.02, 0.5, 0.42 + patch * 0.04 - Math.min(0.1, rad * 0.002));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < rings; r++) for (let s = 0; s < segs; s++) {
    const a = r * (segs + 1) + s, b = a + segs + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const hill = new THREE.BufferGeometry();
  hill.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hill.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  hill.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  hill.setIndex(idx);
  hill.computeVertexNormals();
  const grass = new THREE.MeshToonMaterial({ map: grassTexture(), vertexColors: true, gradientMap: toonGradient });
  const hm = new THREE.Mesh(hill, grass);
  hm.receiveShadow = true;
  g.add(hm);
  // 花畑の土(少しもり上がった まん丸)
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(FIELD_R, FIELD_R + 0.15, 0.12, 72), new THREE.MeshToonMaterial({ map: soilTexture(), gradientMap: toonGradient }));
  soil.position.y = -0.05;
  soil.receiveShadow = true;
  g.add(soil);
  // 土のふちの、石のかこい
  const rand = makeRand(7);
  const stone = toonMaterial(0xb8b0a0);
  for (let i = 0; i < 80; i++) {
    const a = (i / 80) * Math.PI * 2 + rand() * 0.02;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), stone);
    m.position.set(Math.cos(a) * (FIELD_R + 0.12), 0.02, Math.sin(a) * (FIELD_R + 0.12));
    m.scale.set(1 + rand() * 0.4, 0.55, 0.9);
    m.rotation.y = rand() * 6;
    g.add(m);
  }
}

// 木の柵: 花畑のまわりに、くいと横木。入り口が4つ(すきま)
function buildFence(g) {
  const wood = toonMaterial(0xc89a62), dark = toonMaterial(0x9a6a3e);
  const R = FIELD_R + 1.4;
  const n = 48;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (i % 12 === 0) continue; // 入り口
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), wood);
    post.position.set(Math.cos(a) * R, 0.4, Math.sin(a) * R);
    post.rotation.y = -a;
    g.add(post);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.14, 4), dark);
    cap.position.set(Math.cos(a) * R, 0.87, Math.sin(a) * R);
    cap.rotation.y = -a + Math.PI / 4;
    g.add(cap);
    if (i % 12 === 11) continue;
    // 横木(となりのくいまで)
    const b = ((i + 1) / n) * Math.PI * 2;
    const mx = (Math.cos(a) + Math.cos(b)) / 2 * R, mz = (Math.sin(a) + Math.sin(b)) / 2 * R;
    const len = 2 * R * Math.sin(Math.PI / n);
    for (const y of [0.3, 0.6]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.05), wood);
      rail.position.set(mx, y, mz);
      rail.rotation.y = -(a + b) / 2 + Math.PI / 2;
      g.add(rail);
    }
  }
}

// 大きな風車(羽根は画面側で回す)
function buildWindmill(g) {
  const x = -4.5, z = -12;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 6, 10), toonMaterial(0xf3e6cf));
  body.position.set(x, hillY(x, z) + 3, z);
  g.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.45, 1.8, 10), toonMaterial(0xc8503c));
  roof.position.set(x, hillY(x, z) + 6.9, z);
  g.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.1), toonMaterial(0x8a5a32));
  door.position.set(x + 0.2, hillY(x, z) + 0.6, z + 1.5);
  g.add(door);
  const win = new THREE.Mesh(new THREE.CircleGeometry(0.28, 12), toonMaterial(0x6fb6e8));
  win.position.set(x + 0.15, hillY(x, z) + 3.8, z + 1.33);
  g.add(win);
  const hub = new THREE.Group();
  hub.position.set(x + 0.2, hillY(x, z) + 5.6, z + 1.35);
  const blade = toonMaterial(0xfff8ec), frame = toonMaterial(0x9a6a3e);
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group();
    arm.rotation.z = (k / 4) * Math.PI * 2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.6, 0.08), frame);
    bar.position.y = 1.8;
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.8, 0.04), blade);
    sail.position.set(0.48, 2.1, 0);
    arm.add(bar, sail);
    hub.add(arm);
  }
  hub.add(new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), frame));
  g.add(hub);
  return hub;
}

// まん中の大きなひまわり(すこし ゆれる)
function buildSunflower(g) {
  const s = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 1.7, 8), toonMaterial(0x4f8f3a));
  stem.position.y = 0.85;
  s.add(stem);
  const leafGeo = new THREE.SphereGeometry(0.38, 10, 6);
  for (const [y, a] of [[0.55, 0], [1.0, 2.4], [1.35, 4.6]]) {
    const leaf = new THREE.Mesh(leafGeo, toonMaterial(0x5fae4a));
    leaf.scale.set(1, 0.12, 0.55);
    leaf.position.set(Math.cos(a) * 0.35, y, Math.sin(a) * 0.35);
    leaf.rotation.y = -a;
    leaf.rotation.z = 0.35;
    s.add(leaf);
  }
  const head = new THREE.Group();
  head.position.set(0, 1.85, 0.1);
  head.scale.setScalar(0.85);
  head.rotation.x = -0.35; // 少し手前(お日さまのほう)を向く
  const petalGeo = new THREE.SphereGeometry(0.24, 8, 6);
  for (let ring = 0; ring < 2; ring++) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + ring * 0.2;
      const p = new THREE.Mesh(petalGeo, toonMaterial(ring ? 0xffc21a : 0xffd84a));
      p.scale.set(0.45, 1, 0.12);
      const r = 0.55 + ring * 0.08;
      p.position.set(Math.sin(a) * r, Math.cos(a) * r, -0.02 - ring * 0.02);
      p.rotation.z = -a;
      head.add(p);
    }
  }
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.14, 24), toonMaterial(0x6a3e1c));
  disc.rotation.x = Math.PI / 2;
  head.add(disc);
  // 種の つぶつぶ
  const seedMat = toonMaterial(0x3e2410);
  for (let k = 0; k < 40; k++) {
    const a = k * 2.399, r = Math.sqrt(k / 40) * 0.4;
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), seedMat);
    d.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.08);
    head.add(d);
  }
  s.add(head);
  s.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  void SUN_R;
  g.add(s);
  return { group: s, head };
}

// ふもとの森と、遠くの山
function buildSurroundings(g) {
  const rand = makeRand(31);
  const spots = [];
  for (let i = 0; i < 160; i++) {
    const a = rand() * Math.PI * 2, d = 16 + rand() * 40;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (z > 6 && Math.abs(x) < 10) continue; // カメラの前はあける
    spots.push({ x, y: hillY(x, z), z, h: 4 + rand() * 5, kind: rand() < 0.35 ? 'pine' : 'broad' });
  }
  buildForestTrees(g, spots);
  // 柵のそとの しげみと花
  const bushMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient });
  const bush = foliageClump(rand, { detail: 1, balls: 3, bottom: 0x2f6b35, top: 0x8fcf5f });
  const bushes = new THREE.InstancedMesh(bush, bushMat, 40);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2, d = FIELD_R + 2.4 + rand() * 6;
    dummy.position.set(Math.cos(a) * d, hillY(Math.cos(a) * d, Math.sin(a) * d) + 0.1, Math.sin(a) * d);
    dummy.scale.setScalar(0.5 + rand() * 0.6);
    dummy.rotation.y = rand() * 6;
    dummy.updateMatrix();
    bushes.setMatrixAt(i, dummy.matrix);
  }
  g.add(bushes);
}

// 正面の入り口から、丘のふもとへ下る土の道
const PATH_W = 1.5;
function buildPath(g) {
  const pos = [], idx = [];
  const z0 = FIELD_R + 0.9, z1 = 42, n = 40;
  for (let i = 0; i <= n; i++) {
    const z = z0 + (z1 - z0) * (i / n);
    const x = Math.sin(z * 0.12) * (z - z0) * 0.12; // ふもとへ向かって ゆるく くねる
    const w = PATH_W * (1 + (z - z0) * 0.01);
    for (const sx of [-1, 1]) pos.push(x + sx * w / 2, hillY(x, z) + 0.02, z);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: 0xc9a06a, gradientMap: toonGradient }));
  m.receiveShadow = true;
  g.add(m);
}
const onPath = (x, z) => z > FIELD_R && Math.abs(x - Math.sin(z * 0.12) * (z - FIELD_R - 0.9) * 0.12) < PATH_W * 0.9;

// 入り口の看板「花ぬり陣取り」
function buildSign(g) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = '#e9c48c';
  x.fillRect(0, 0, 512, 160);
  // 木目
  for (let i = 0; i < 14; i++) {
    x.strokeStyle = `rgba(150,100,50,${0.12 + (i % 3) * 0.05})`;
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, 12 + i * 11);
    x.bezierCurveTo(170, 6 + i * 11, 340, 20 + i * 11, 512, 10 + i * 11);
    x.stroke();
  }
  x.strokeStyle = '#8a5a2e';
  x.lineWidth = 10;
  x.strokeRect(5, 5, 502, 150);
  x.font = '400 74px "Dela Gothic One", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 12;
  x.strokeStyle = '#fff6e4';
  x.strokeText('花ぬり陣取り', 256, 84);
  x.fillStyle = '#c8503c';
  x.fillText('花ぬり陣取り', 256, 84);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 0.08), [
    toonMaterial(0x9a6a3e), toonMaterial(0x9a6a3e), toonMaterial(0x9a6a3e), toonMaterial(0x9a6a3e),
    new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient }), toonMaterial(0xb8864e),
  ]);
  board.position.y = 1.25;
  sign.add(board);
  for (const sx of [-0.8, 0.8]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.1), toonMaterial(0x8a5a2e));
    post.position.set(sx, 0.65, -0.06);
    sign.add(post);
  }
  // 看板の上の小さな花かざり
  const fl = [0xff7a8a, 0xffd24a, 0xffffff, 0x9fd0ff];
  for (let i = 0; i < 7; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), toonMaterial(fl[i % 4]));
    f.position.set(-0.8 + i * 0.27, 1.58, 0);
    f.scale.set(1, 0.7, 1);
    sign.add(f);
  }
  sign.position.set(1.9, 0, FIELD_R + 1.9);
  sign.rotation.y = -0.25;
  g.add(sign);
}

// 柵のそとの野の花(白・黄・桃・うす紫)
function buildWildflowers(g) {
  const rand = makeRand(53);
  const petal = new THREE.SphereGeometry(0.05, 6, 4).scale(1, 0.3, 0.6);
  const parts = [];
  for (let k = 0; k < 5; k++) parts.push(petal.clone().translate(0.05, 0.12, 0).rotateY((k / 5) * Math.PI * 2).toNonIndexed());
  parts.push(new THREE.CylinderGeometry(0.008, 0.01, 0.12, 4).translate(0, 0.06, 0).toNonIndexed());
  const pos = [], col = [];
  parts.forEach((p, i) => {
    pos.push(...p.attributes.position.array);
    const c = i < 5 ? [1, 1, 1] : [0.35, 0.6, 0.3];
    for (let v = 0; v < p.attributes.position.count; v++) col.push(...c);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const COUNT = 700;
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient }), COUNT);
  const colors = [0xffffff, 0xfff1a8, 0xffb3c6, 0xd8c4ff, 0xffffff];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let n = 0;
  for (let tries = 0; n < COUNT && tries < COUNT * 4; tries++) {
    // 群れて咲く: いくつかの まとまりのまわりに
    const a = rand() * Math.PI * 2, d = FIELD_R + 1.7 + Math.pow(rand(), 1.6) * 16;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (onPath(x, z)) continue;
    if (Math.abs(d - (FIELD_R + 2.3)) < 0.6 && SEATS.some((st) => Math.hypot(st.x - x, st.z - z) < 0.7)) continue;
    const kind = Math.floor((Math.sin(a * 5) * 0.5 + 0.5) * colors.length) % colors.length;
    dummy.position.set(x, hillY(x, z) - 0.02, z);
    dummy.rotation.set((rand() - 0.5) * 0.3, rand() * 6, (rand() - 0.5) * 0.3);
    dummy.scale.setScalar(0.9 + rand() * 0.6);
    dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
    mesh.setColorAt(n, color.setHex(colors[(kind + (rand() < 0.2 ? 1 : 0)) % colors.length]));
    n++;
  }
  mesh.count = n;
  mesh.receiveShadow = true;
  mesh.userData.noMerge = true;
  g.add(mesh);
}

// 遠くの山なみ(かすんで見える)
function buildMountains(g) {
  const rand = makeRand(77);
  const cols = [0x8fb3a0, 0x7fa592, 0x9cbfb0];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand() * 0.15;
    const d = 150 + rand() * 40;
    const h = 30 + rand() * 35;
    const m = new THREE.Mesh(new THREE.ConeGeometry(h * (1.1 + rand() * 0.5), h, 7), toonMaterial(cols[i % 3]));
    m.position.set(Math.cos(a) * d, -45 + h / 2, Math.sin(a) * d);
    m.rotation.y = rand() * 6;
    g.add(m);
    // 雪のぼうし(高い山だけ)
    if (h > 52) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(h * 0.3, h * 0.24, 7), toonMaterial(0xf4f8fa));
      cap.position.set(m.position.x, -45 + h - h * 0.12 + 0.3, m.position.z);
      cap.rotation.y = m.rotation.y;
      g.add(cap);
    }
  }
}

// 観客の席(柵のそとの切り株)
export const SEATS = [
  { a: -2.2, kind: 'risu' }, { a: -1.6, kind: 'harinezumi' }, { a: -0.9, kind: 'komadori' },
  { a: 0.9 + Math.PI, kind: 'risu' }, { a: 1.5 + Math.PI, kind: 'harinezumi' }, { a: 2.2 + Math.PI, kind: 'komadori' },
].map((s) => ({ ...s, x: Math.cos(s.a) * (FIELD_R + 2.3), z: Math.sin(s.a) * (FIELD_R + 2.3) }));
function buildSeats(g) {
  for (const s of SEATS) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.42, 12), toonMaterial(0x9a6a3e));
    st.position.set(s.x, hillY(s.x, s.z) + 0.2, s.z);
    g.add(st);
  }
}

export function buildStage(scene) {
  const g = new THREE.Group();
  buildGround(g);
  buildFence(g);
  buildSurroundings(g);
  buildSeats(g);
  buildPath(g);
  buildSign(g);
  buildWildflowers(g);
  buildMountains(g);
  const sunflower = buildSunflower(g);
  const windmill = buildWindmill(g);
  mergeStatic(g, (o) => o === sunflower.group || o === sunflower.head || o === windmill);
  scene.add(g);
  return { group: g, sunflower, windmill };
}
