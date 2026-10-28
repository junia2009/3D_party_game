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
// 見て いる 子の すわる ところ(だるまの うしろに ならぶ。座ぶとんを しく)
export const SEATS = [[-2.3, -1.0], [-1.25, -2.0], [1.25, -2.0], [2.3, -1.0], [0.4, -3.0]];
const OPEN = 1; // あけて ある しょうじ(そとの 雪の 庭が 見える)

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

// お正月の かざり: しめなわ・かけじく・もちばな・座ぶとん・ひばち。あけた しょうじの むこうに 雪の 庭
function buildDecor(g, scene) {
  // しめなわ(天井の はりに そって たるむ)と 紙しで
  const pts = [];
  for (let k = 0; k <= 16; k++) { const u = k / 16; pts.push(new THREE.Vector3(-7 + u * 14, 3.55 - Math.sin(u * Math.PI) * 0.35, -5.1)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.13, 8), toonMaterial(0xd8c07a));
  g.add(rope);
  const twist = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.135, 4), new THREE.MeshToonMaterial({ color: 0xb89a50, gradientMap: toonGradient, wireframe: true }));
  g.add(twist);
  const shideTex = canvasTex(32, 64, (c, w, h) => {
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(4, 0); c.lineTo(28, 0); c.lineTo(28, 16); c.lineTo(4, 16); c.lineTo(4, 32); c.lineTo(28, 32); c.lineTo(28, 48); c.lineTo(4, 48); c.lineTo(4, 64); c.lineTo(16, 64); c.closePath(); c.fill();
  });
  for (let k = 1; k < 8; k++) {
    const p = curve.getPoint(k / 8);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.5), new THREE.MeshBasicMaterial({ map: shideTex, transparent: true, side: THREE.DoubleSide }));
    sh.position.set(p.x, p.y - 0.36, p.z + 0.05);
    sh.userData.noMerge = true;
    g.add(sh);
  }
  // とこのま(まんなかの しょうじの まえ)に かけじく「ふく」と、もちばなの かびん
  const scroll = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.4), new THREE.MeshBasicMaterial({ map: canvasTex(110, 240, (c, w, h) => {
    c.fillStyle = '#6a8a6a'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f6efd8'; c.fillRect(10, 26, w - 20, h - 52);
    c.fillStyle = '#2a2a2a'; c.font = 'bold 64px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ふく', w / 2, h / 2 - 8);
    c.fillStyle = '#d83a2a'; c.fillRect(w / 2 + 18, h - 70, 14, 14);
    c.fillStyle = '#4a3020'; c.fillRect(0, 0, w, 8); c.fillRect(0, h - 8, w, 8);
  }) }));
  scroll.position.set(-2.45, 2.05, -5.4);
  scroll.userData.noMerge = true;
  g.add(scroll);
  for (const sx of [-1, 1]) {
    const x = -2.45 + sx * 1.05;
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.6, 12), toonMaterial(0x2a4a7a));
    vase.position.set(x, 0.3, -4.8);
    g.add(vase);
    // もちばな: えだに ピンクと 白の おもち
    for (let b = 0; b < 3; b++) {
      const a = (b - 1) * 0.5 + sx * 0.15;
      const len = 1.4 + b * 0.2;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, len, 5), toonMaterial(0x5a3a22));
      br.position.set(x + Math.sin(a) * len / 2, 0.6 + Math.cos(a) * len / 2, -4.8);
      br.rotation.z = -a;
      g.add(br);
      for (let k = 0; k < 6; k++) {
        const t = 0.35 + k * 0.12;
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), toonMaterial(k % 2 ? 0xffb8d0 : 0xfffaf2));
        ball.position.set(x + Math.sin(a) * len * t + (k % 2 ? 0.05 : -0.05), 0.6 + Math.cos(a) * len * t, -4.8);
        g.add(ball);
      }
    }
  }
  // 見て いる 子の 座ぶとん
  for (const [x, z] of SEATS) {
    const zb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.9), toonMaterial(0x8a2a3a));
    zb.position.set(x, 0.05, z);
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), toonMaterial(0xffd24a));
    tuft.position.set(x, 0.11, z);
    g.add(zb, tuft);
  }
  // ひばち(手前の よこ。炭が あかく 光る)と やかん
  const hibachi = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.5, 16), toonMaterial(0x6a7a8a));
  hibachi.position.set(1.7, 0.25, 2.2);
  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.38, 16).rotateX(-Math.PI / 2), toonMaterial(0xc8c0b0));
  ash.position.set(1.7, 0.48, 2.2);
  g.add(hibachi, ash);
  const coals = [];
  for (let k = 0; k < 4; k++) {
    const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07), new THREE.MeshBasicMaterial({ color: 0xff6a2a }));
    c.position.set(1.7 + Math.cos(k * 1.6) * 0.14, 0.52, 2.2 + Math.sin(k * 1.6) * 0.12);
    c.userData.noMerge = true;
    g.add(c);
    coals.push(c);
  }
  const kettle = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), toonMaterial(0x3a3a3e));
  kettle.scale.y = 0.75;
  kettle.position.set(1.85, 0.72, 2.1);
  g.add(kettle);
  const coalGlow = new THREE.PointLight(0xff8a3a, 2.5, 3, 1.6);
  coalGlow.position.set(1.7, 0.8, 2.2);
  scene.add(coalGlow);
  // そとの 雪の 庭(あけた しょうじの むこう)
  const outX = OPEN * 2.45;
  const snowGround = new THREE.Mesh(new THREE.PlaneGeometry(14, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd8e4f4 }));
  snowGround.position.set(outX, 0.05, -11);
  snowGround.userData.noMerge = true;
  const skyBack = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), new THREE.MeshBasicMaterial({ color: 0x1a2a4a }));
  skyBack.position.set(outX, 4, -15.5);
  skyBack.userData.noMerge = true;
  const moon = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0xfff6d0 }));
  moon.position.set(outX + 0.6, 3.5, -15.4);
  moon.userData.noMerge = true;
  g.add(snowGround, skyBack, moon);
  // 石どうろう
  const lanternMat = toonMaterial(0x9a9a9e);
  const parts = [[0.18, 0.22, 0.6, 0.3], [0.32, 0.32, 0.1, 0.65], [0.22, 0.22, 0.32, 0.86], [0.42, 0.1, 0.22, 1.13]];
  for (const [r0, r1, h, y] of parts) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, 6), lanternMat);
    m.position.set(outX - 0.5, y, -8.5);
    g.add(m);
  }
  const snowCap = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toonMaterial(0xf8fbff));
  snowCap.scale.y = 0.35;
  snowCap.position.set(outX - 0.5, 1.24, -8.5);
  const lampLight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.05), new THREE.MeshBasicMaterial({ color: 0xffd890 }));
  lampLight.position.set(outX - 0.5, 0.86, -8.27);
  g.add(snowCap, lampLight);
  // 雪の つもった 松
  for (const [dx, dz, sc] of [[1.6, -10, 1], [-1.8, -12, 1.2], [3.2, -13, 0.9]]) {
    for (let k = 0; k < 3; k++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9 - k * 0.25, 0.9, 8), toonMaterial(0x2a5a3a));
      cone.position.set(outX + dx, (0.7 + k * 0.55) * sc, dz);
      cone.scale.setScalar(sc);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.7 - k * 0.2, 0.35, 8), toonMaterial(0xf4f8ff));
      cap.position.set(outX + dx, (0.95 + k * 0.55) * sc, dz);
      cap.scale.setScalar(sc);
      g.add(cone, cap);
    }
  }
  // そとに ふる 雪
  const n = 120, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = outX + (Math.random() - 0.5) * 6; pos[i * 3 + 1] = Math.random() * 5; pos[i * 3 + 2] = -6 - Math.random() * 8; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const flakes = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07 }));
  scene.add(flakes);
  return { coals, flakes };
}

export function buildStage(scene) {
  const group = new THREE.Group();
  // たたみ(いぐさの すじ)
  const tatami = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#c8c27a'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 4) { c.fillStyle = x % 8 ? 'rgba(120,110,40,.12)' : 'rgba(255,250,200,.12)'; c.fillRect(x, 0, 2, h); }
    c.fillStyle = '#3a4a2a'; c.fillRect(0, 0, w, 6); c.fillRect(0, h - 6, w, 6);
  });
  // たたみ(れんがの ように 半分ずつ ずらして しきつめる)
  const tatamiMat = new THREE.MeshToonMaterial({ map: tatami, gradientMap: toonGradient });
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 6; j++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8).rotateX(-Math.PI / 2), tatamiMat);
    m.position.set(i * 3.6 + (j % 2 ? 1.8 : 0), 0, j * 1.8 - 0.9);
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
    // あけた ところは となりに かさねて ずらす
    p.position.set(i === OPEN ? (i + 0.55) * 2.45 : i * 2.45, 1.9, i === OPEN ? -5.42 : -5.5);
    p.userData.noMerge = true;
    group.add(p);
  }
  const plaster = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.4), toonMaterial(0xe8dcc0));
  plaster.position.set(0, 6.0, -5.55);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(18, 14).rotateX(Math.PI / 2), toonMaterial(0x8a6a48));
  ceiling.position.set(0, 8.2, 1.4);
  group.add(plaster, ceiling);
  for (let k = -4; k <= 4; k++) {
    const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 14), toonMaterial(0x5a3420));
    rafter.position.set(k * 2, 8.05, 1.4);
    group.add(rafter);
  }
  for (const y of [5.6, 7.6]) {
    const nage = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 0.3), toonMaterial(0x5a3420));
    nage.position.set(0, y, -5.45);
    group.add(nage);
  }
  // 上の かべの らんま(すかしぼりの まど。月あかりが すける)
  for (const x of [-4.9, 0, 4.9]) {
    const ranma = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.2), new THREE.MeshBasicMaterial({ map: canvasTex(180, 60, (c, w, h) => {
      c.fillStyle = '#3a2a1a'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#c8d8f0';
      for (let k = 0; k < 7; k++) { c.beginPath(); c.ellipse(14 + k * 25, h / 2, 9, 18, 0, 0, 7); c.fill(); }
    }) }));
    ranma.position.set(x, 4.6, -5.5);
    ranma.userData.noMerge = true;
    group.add(ranma);
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
  const decor = buildDecor(group, scene);
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
    for (const [k, c] of decor.coals.entries()) c.material.color.setHSL(0.04, 1, 0.45 + Math.sin(t * 3 + k * 2) * 0.1);
    const fp = decor.flakes.geometry.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      let y = fp.getY(i) - 0.012 * (1 + (i % 3) * 0.3);
      if (y < 0) y = 5;
      fp.setY(i, y);
    }
    fp.needsUpdate = true;
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
