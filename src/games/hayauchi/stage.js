// どんぐり早うち の会場「夕焼けの岩場」。
//
// 赤い砂と岩の荒れ地。うしろ(-z)には しまもようの岩山(テーブルのような山)がならび、夕日がしずむ。
// 5人は z = 0 に横一列。前の木の柵の上に、ひとりひとつ ブリキのかん(的)。
// まん中の奥の高い岩の上に、ホーホー先生(旗を持つ)。観客は左右のたるの上。
//
// 座標: 列のまん中が原点。カメラは +z(うしろ)から、列ごしに先生を見る。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { makeRand } from '../daruma/trees.js';

export const SPACING = 1.25; // となりとの間(縦持ちの画面に5人おさまるように)
export const CAN_Z = -6.2; // かんの列
export const RAIL_Y = 1.0; // かんを置く横木の高さ
export const OWL_ROCK = { x: 0, z: -10, top: 2.7 };
export const laneX = (slot, n) => (slot - (n - 1) / 2) * SPACING;

// 観客の席(たる)
export const SEATS = [
  { x: -6.4, z: -1.2, kind: 'risu' }, { x: -6.9, z: -3.4, kind: 'komadori' },
  { x: 6.4, z: -1.4, kind: 'harinezumi' }, { x: 6.9, z: -3.6, kind: 'risu' },
];
export const BARREL_TOP = 0.9;

// 砂の絵: 赤茶の砂に、小石と ひびわれ
function sandTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d9925a';
  g.fillRect(0, 0, 256, 256);
  const rand = makeRand(5);
  for (let i = 0; i < 1400; i++) {
    const v = rand();
    g.fillStyle = v < 0.5 ? `rgba(240,180,120,${0.3 + rand() * 0.3})` : `rgba(170,100,60,${0.25 + rand() * 0.3})`;
    g.fillRect(rand() * 256, rand() * 256, 1 + rand() * 2, 1 + rand() * 2);
  }
  g.strokeStyle = 'rgba(140,80,50,0.35)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 18; i++) {
    let x = rand() * 256, y = rand() * 256;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (rand() - 0.5) * 40; y += (rand() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(40, 40);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildGround(g) {
  const ground = new THREE.Mesh(new THREE.CircleGeometry(260, 48).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: sandTexture(), gradientMap: toonGradient }));
  ground.receiveShadow = true;
  g.add(ground);
  // 立つところ: 少し明るい ふみかためた土の帯と、ひとりずつの立ち位置の丸
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 1.8).rotateX(-Math.PI / 2), toonMaterial(0xe8b07a));
  strip.position.y = 0.01;
  strip.receiveShadow = true;
  g.add(strip);
}

// しまもようの岩山(上が平ら)。下から色の帯を重ねる
function mesa(g, x, z, r, h, rand) {
  const bands = [0xb8583a, 0xd07a4a, 0xa94a32, 0xe0905a, 0xc0603e];
  const n = 3 + Math.floor(rand() * 3);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const bh = h / n;
    const r0 = r * (1 - i * 0.06), r1 = r * (1 - (i + 1) * 0.06);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, bh, 9, 1), toonMaterial(bands[(i + Math.floor(rand() * 5)) % bands.length]));
    m.position.set(x, y + bh / 2, z);
    m.rotation.y = rand() * 6;
    m.scale.z = 0.6 + rand() * 0.4;
    g.add(m);
    y += bh;
  }
  // てっぺんの平らなところ(ふちに でこぼこ)
  const topR = r * (1 - n * 0.06);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(topR * 0.98, topR, 0.4, 9), toonMaterial(0xe9a46c));
  top.position.set(x, y + 0.2, z);
  g.add(top);
  for (let k = 0; k < 5; k++) {
    const a = rand() * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.DodecahedronGeometry(r * (0.12 + rand() * 0.1), 0), toonMaterial(0xd88a56));
    b.position.set(x + Math.cos(a) * topR * 0.7, y + 0.3, z + Math.sin(a) * topR * 0.7 * 0.8);
    b.scale.y = 0.6;
    g.add(b);
  }
  // ふもとの落石
  for (let k = 0; k < 7; k++) {
    const a = rand() * Math.PI * 2, d = r * (1.0 + rand() * 0.35);
    const b = new THREE.Mesh(new THREE.DodecahedronGeometry(r * (0.08 + rand() * 0.14), 0), toonMaterial(rand() < 0.5 ? 0xb8583a : 0xa04a30));
    b.position.set(x + Math.cos(a) * d, r * 0.04, z + Math.sin(a) * d * 0.8);
    b.rotation.set(rand(), rand() * 6, rand());
    g.add(b);
  }
}

// 岩のアーチ(遠くの目じるし)
function arch(g, x, z, R, t) {
  const bands = [0xb8583a, 0xd07a4a, 0xc0603e];
  bands.forEach((c, i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(R - i * t * 0.02, t * (1 - i * 0.18), 7, 18, Math.PI), toonMaterial(c));
    m.position.set(x, 0, z + i * 0.05);
    m.scale.z = 0.7;
    g.add(m);
  });
  // 足もとの岩
  for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(t * 1.1, t * 1.5, t * 2.2, 8), toonMaterial(0xa94a32));
    b.position.set(x + sx * R, t * 1.1, z);
    g.add(b);
  }
}

// 入り口の看板「どんぐり早うち」
function buildSign(g) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 200;
  const x = c.getContext('2d');
  x.fillStyle = '#c99a62';
  x.fillRect(0, 0, 512, 200);
  for (let i = 0; i < 5; i++) {
    x.fillStyle = i % 2 ? 'rgba(120,70,30,.12)' : 'rgba(255,230,190,.12)';
    x.fillRect(0, i * 40, 512, 38);
    x.fillStyle = 'rgba(90,50,20,.5)';
    x.fillRect(0, i * 40 + 38, 512, 2);
  }
  x.font = '400 72px "Dela Gothic One", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 12;
  x.strokeStyle = '#fff1d8';
  x.strokeText('どんぐり早うち', 256, 104);
  x.fillStyle = '#7a2e1c';
  x.fillText('どんぐり早うち', 256, 104);
  // くぎ
  x.fillStyle = '#4a3020';
  for (const [px, py] of [[18, 18], [494, 18], [18, 182], [494, 182]]) { x.beginPath(); x.arc(px, py, 6, 0, Math.PI * 2); x.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Group();
  const wood = toonMaterial(0x8a5a32);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.62, 0.07), [wood, wood, wood, wood, new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient }), wood]);
  board.position.y = 1.35;
  board.rotation.z = -0.04;
  sign.add(board);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.7, 0.12), toonMaterial(0x6a4426));
  post.position.set(0, 0.85, -0.08);
  sign.add(post);
  sign.position.set(-5.0, 0, 1.2);
  sign.rotation.y = 0.35;
  sign.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.add(sign);
}

// かれた しげみ(小さな まるい やぶ)
function buildShrubs(g, rand) {
  const geo = new THREE.IcosahedronGeometry(0.3, 0);
  const mesh = new THREE.InstancedMesh(geo, toonMaterial(0xffffff), 60);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let n = 0;
  for (let i = 0; i < 200 && n < 60; i++) {
    const x = (rand() - 0.5) * 50, z = -rand() * 40 + 6;
    if (Math.abs(x) < 6 && z > CAN_Z - 1.5) continue; // ならぶところと、まん中はあける
    if (Math.abs(x) < 3 && z > OWL_ROCK.z - 2) continue;
    dummy.position.set(x, 0.12, z);
    dummy.scale.set(0.7 + rand() * 0.8, 0.5 + rand() * 0.4, 0.7 + rand() * 0.8);
    dummy.rotation.y = rand() * 6;
    dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
    mesh.setColorAt(n, col.setHex(rand() < 0.5 ? 0x9a8a4a : 0x7f8a48));
    n++;
  }
  mesh.count = n;
  mesh.receiveShadow = true;
  g.add(mesh);
}

// 木箱と荷車の車輪(柵のはしに)
function buildProps(g) {
  const wood = toonMaterial(0xa8744a), dark = toonMaterial(0x6a4426);
  for (const [x, z, s, r] of [[5.2, -5.6, 0.55, 0.3], [5.8, -5.0, 0.45, -0.2], [5.4, -5.3, 0.4, 0.1]]) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), wood);
    box.position.set(x, s / 2 + (s === 0.4 ? 0.55 : 0), z);
    box.rotation.y = r;
    box.castShadow = true;
    g.add(box);
    for (const sx of [-1, 1]) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(s * 1.02, 0.05, s * 1.02), dark);
      slat.position.set(x, box.position.y + sx * s * 0.3, z);
      slat.rotation.y = r;
      g.add(slat);
    }
  }
  const wheel = new THREE.Group();
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 20), dark));
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 10).rotateX(Math.PI / 2), dark));
  for (let k = 0; k < 8; k++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.06, 0.04), wood);
    sp.rotation.z = (k / 8) * Math.PI;
    wheel.add(sp);
  }
  wheel.position.set(-5.4, 0.55, -5.9);
  wheel.rotation.set(-0.25, 0.4, 0);
  wheel.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.add(wheel);
}

function rock(g, x, z, s, rand, color = 0xc06a44) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), toonMaterial(color));
  m.position.set(x, s * 0.45, z);
  m.scale.set(1 + rand() * 0.5, 0.7 + rand() * 0.4, 1 + rand() * 0.3);
  m.rotation.set(rand() * 0.4, rand() * 6, rand() * 0.3);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
}

// サボテン(はしらと うで)
function cactus(g, x, z, h, rand) {
  const mat = toonMaterial(0x4f9a52), dark = toonMaterial(0x3f7f44);
  const c = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, h, 4, 10), mat);
  trunk.position.y = h / 2 + 0.2;
  c.add(trunk);
  for (const side of [-1, 1]) {
    if (rand() < 0.25) continue;
    const ay = h * (0.35 + rand() * 0.3);
    const out = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.35, 4, 8), mat);
    out.rotation.z = Math.PI / 2;
    out.position.set(side * 0.38, ay, 0);
    const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.45 + rand() * 0.4, 4, 8), mat);
    up.position.set(side * 0.58, ay + 0.35, 0);
    c.add(out, up);
  }
  // たてのすじ
  for (let k = 0; k < 4; k++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.03, h * 0.9, 0.03), dark);
    const a = (k / 4) * Math.PI * 2;
    st.position.set(Math.cos(a) * 0.21, h / 2 + 0.2, Math.sin(a) * 0.21);
    c.add(st);
  }
  // てっぺんの花(ひとつだけ)
  if (rand() < 0.6) {
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), toonMaterial(0xff7aa0));
    fl.position.y = h + 0.42;
    c.add(fl);
  }
  c.position.set(x, 0, z);
  c.rotation.y = rand() * 6;
  c.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.add(c);
}

// 的のかんを置く柵(横木2本 + くい)
function buildFence(g, n) {
  const wood = toonMaterial(0xa8744a), dark = toonMaterial(0x7a5032);
  const w = (n - 1) * SPACING + 2.4;
  for (const y of [RAIL_Y - 0.06, 0.5]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.16), wood);
    rail.position.set(0, y, CAN_Z);
    rail.castShadow = rail.receiveShadow = true;
    g.add(rail);
  }
  for (let i = 0; i <= n; i++) {
    const x = -w / 2 + 0.15 + (i / n) * (w - 0.3);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, RAIL_Y + 0.25, 0.16), dark);
    post.position.set(x, (RAIL_Y + 0.25) / 2 - 0.05, CAN_Z - 0.02);
    post.castShadow = true;
    g.add(post);
  }
}

// ホーホー先生の岩(だんだんの高い岩)
function buildOwlRock(g) {
  const { x, z, top } = OWL_ROCK;
  const a = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, top * 0.6, 8), toonMaterial(0xb8583a));
  a.position.set(x, top * 0.3, z);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, top * 0.4, 8), toonMaterial(0xd07a4a));
  b.position.set(x, top * 0.8, z);
  b.rotation.y = 0.4;
  for (const m of [a, b]) { m.castShadow = m.receiveShadow = true; g.add(m); }
}

function buildSeats(g) {
  const wood = toonMaterial(0x9a6438), band = toonMaterial(0x5a5a62);
  for (const s of SEATS) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, BARREL_TOP, 14), wood);
    b.position.set(s.x, BARREL_TOP / 2, s.z);
    b.castShadow = true;
    g.add(b);
    for (const y of [0.18, BARREL_TOP - 0.18]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.025, 4, 18).rotateX(Math.PI / 2), band);
      r.position.set(s.x, y, s.z);
      g.add(r);
    }
  }
}

function buildSurroundings(g) {
  const rand = makeRand(19);
  // 遠くの岩山(うしろと左右)
  const spots = [[-38, -70, 12, 22], [-8, -95, 16, 30], [26, -80, 11, 18], [55, -60, 14, 26], [-70, -40, 13, 20], [80, -100, 18, 34], [-60, -120, 20, 40], [12, -150, 22, 44], [70, -20, 10, 16], [-75, 5, 12, 22]];
  for (const [x, z, r, h] of spots) mesa(g, x, z, r, h, rand);
  arch(g, -26, -48, 7, 1.6);
  buildShrubs(g, rand);
  // 岩
  for (let i = 0; i < 50; i++) {
    const a = rand() * Math.PI * 2, d = 9 + rand() * 30;
    const x = Math.cos(a) * d, z = Math.sin(a) * d - 4;
    if (z > 3 && Math.abs(x) < 7) continue; // カメラの前はあける
    rock(g, x, z, 0.3 + rand() * 1.2, rand, rand() < 0.5 ? 0xc06a44 : 0xa95a3a);
  }
  // サボテン
  const cacti = [[-4.6, -8.5, 2.2], [5.2, -9.4, 2.8], [-9, -5, 1.8], [9.6, -6.5, 2.0], [-13, -14, 3.0], [14, -16, 2.6], [-8.4, 2.4, 1.4], [8.8, 2.2, 1.6], [3.2, -14, 2.4]];
  for (const [x, z, h] of cacti) cactus(g, x, z, h, rand);
  // 小さな岩をばらまく
  for (let i = 0; i < 70; i++) {
    const x = (rand() - 0.5) * 30, z = -2 - rand() * 20;
    if (Math.abs(z - CAN_Z) < 1 && Math.abs(x) < 5) continue;
    rock(g, x, z, 0.06 + rand() * 0.12, rand, 0xa8603e);
  }
  // 遠くの かれ木
  const trunk = toonMaterial(0x6a4a34);
  for (const [x, z] of [[-11, -11], [12, -12.5]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 2.6, 6), trunk);
    t.position.set(x, 1.3, z);
    t.rotation.z = 0.1;
    g.add(t);
    for (const [y, a] of [[1.8, 0.8], [2.1, -0.9], [1.4, -0.6]]) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 1.0, 5), trunk);
      br.position.set(x + Math.sin(a) * 0.4, y + 0.3, z);
      br.rotation.z = -a;
      g.add(br);
    }
  }
}

export function buildStage(scene, n = 5) {
  const g = new THREE.Group();
  buildGround(g);
  buildSurroundings(g);
  buildFence(g, n);
  buildOwlRock(g);
  buildSeats(g);
  buildSign(g);
  buildProps(g);
  mergeStatic(g);
  scene.add(g);
  return { group: g };
}
