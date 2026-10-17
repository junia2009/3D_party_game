// どんぐりマンション だっしゅつ の会場「大木の どんぐりマンション」。
//
// 大きな木の幹の中が 6 かいだての アパート。手前の かべが ない「ドールハウス」の 切り口で見せる。
// どの階も まっすぐな ろうか(x: -HALL_W〜HALL_W、z: 0〜HALL_D)。奥の かべ(z = 0)に ドアが ならぶ。
// 階の はしには 下の階への かいだん(上の階から おりてくると ここに出る)。1かい(floor 0)は ロビーと 出口。
// てっぺんは 葉っぱの しげみ、まわりは 森。
//
// 座標: 階 f の床が y = f * FLOOR_H。ドアの かべが z = 0、手前(カメラ)が +z。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { grassTexture } from '../daruma/ground.js';
import { barkMaterial, buildForestTrees, foliageClump, makeRand } from '../daruma/trees.js';
import { HALL_D, HALL_W, TOP, arriveSide } from './rules.js';

export const FLOOR_H = 3.0;
export const floorY = (f) => f * FLOOR_H;
const DOOR_W = 0.9, DOOR_H = 1.75;
const TRUNK_R = 6.3;

// 階ごとの かべ紙の色(ちがう階だと すぐ分かるように)
const WALLS = [0xf3e3c3, 0xe9f0d6, 0xf6dcd2, 0xdbe8f2, 0xf3ecc8, 0xe6dcf2];
const DOOR_COLORS = [0xd0583e, 0x3d7fc8, 0x4a9a5a, 0xe0a030, 0x8a5ac0, 0x2fa0a0];

// 木の床(板の すじ)
function plankTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c99a62';
  g.fillRect(0, 0, 128, 128);
  const rand = makeRand(2);
  for (let y = 0; y < 128; y += 16) {
    g.fillStyle = `rgba(${150 + rand() * 40},${100 + rand() * 30},${60},0.5)`;
    g.fillRect(0, y, 128, 15);
    g.fillStyle = 'rgba(90,55,30,.5)';
    g.fillRect(0, y + 15, 128, 1);
    g.fillRect(rand() * 128, y, 1, 15);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 1.2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// かべ紙(小さな どんぐり もよう)
function wallTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(160,120,80,.18)';
  for (const [x, y] of [[16, 16], [48, 48]]) {
    g.beginPath(); g.ellipse(x, y + 2, 4, 5, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(x - 5, y - 4, 10, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 3);
  return t;
}

// ドア 1まい(ちょうつがいの じくを中心に 開く)。番号の札つき
export function makeDoor(color, label) {
  const g = new THREE.Group(); // 枠
  const frame = toonMaterial(0x7a5032);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.1, DOOR_H + 0.1, 0.12), frame);
    side.position.set(sx * (DOOR_W / 2 + 0.05), DOOR_H / 2, 0.02);
    g.add(side);
  }
  const top = new THREE.Mesh(new THREE.TorusGeometry(DOOR_W / 2 + 0.05, 0.06, 6, 16, Math.PI), frame);
  top.position.set(0, DOOR_H - DOOR_W / 2 + 0.05, 0.02);
  g.add(top);
  // 中の やみ(開いたとき見える)
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, DOOR_H), new THREE.MeshBasicMaterial({ color: 0x1a120c }));
  dark.position.set(0, DOOR_H / 2, -0.01);
  g.add(dark);
  // 戸(上が まるい板)
  const shape = new THREE.Shape();
  const w = DOOR_W / 2, h = DOOR_H - w;
  shape.moveTo(-w, 0); shape.lineTo(w, 0); shape.lineTo(w, h); shape.absarc(0, h, w, 0, Math.PI, false); shape.lineTo(-w, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false, curveSegments: 10 });
  geo.translate(w, 0, 0); // ちょうつがい(左はし)を じくに
  const leaf = new THREE.Mesh(geo, toonMaterial(color));
  const hinge = new THREE.Group();
  hinge.position.set(-w, 0, 0.0);
  hinge.add(leaf);
  // ノブと 札
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), toonMaterial(0xf2c14a));
  knob.position.set(DOOR_W - 0.13, DOOR_H * 0.48, 0.09);
  hinge.add(knob);
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#fff6e0';
  x.beginPath(); x.arc(32, 32, 28, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#7a5032'; x.lineWidth = 5; x.stroke();
  x.fillStyle = '#5a3a1c'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(label, 32, 34);
  const plate = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
  plate.position.set(w, DOOR_H * 0.78, 0.065);
  hinge.add(plate);
  g.add(hinge);
  g.userData = { hinge, open: 0, want: 0 };
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function buildFloor(g, f, wallTex, plankTex) {
  const y = floorY(f);
  // 床
  const floor = new THREE.Mesh(new THREE.BoxGeometry(HALL_W * 2 + 0.4, 0.25, HALL_D + 0.6), new THREE.MeshToonMaterial({ map: plankTex, gradientMap: toonGradient }));
  floor.position.set(0, y - 0.125, HALL_D / 2 + 0.1);
  floor.receiveShadow = true;
  g.add(floor);
  // 床の ふち(手前の切り口: 木の色)
  const edge = new THREE.Mesh(new THREE.BoxGeometry(HALL_W * 2 + 0.4, 0.3, 0.08), toonMaterial(0x8a5a32));
  edge.position.set(0, y - 0.13, HALL_D + 0.42);
  g.add(edge);
  if (f === TOP + 1) return;
  // 奥の かべ と はばき
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W * 2 + 0.4, FLOOR_H), new THREE.MeshToonMaterial({ map: wallTex, color: WALLS[f % WALLS.length], gradientMap: toonGradient }));
  wall.position.set(0, y + FLOOR_H / 2, -0.06);
  wall.receiveShadow = true;
  g.add(wall);
  const base = new THREE.Mesh(new THREE.BoxGeometry(HALL_W * 2 + 0.4, 0.14, 0.05), toonMaterial(0x9a6a3e));
  base.position.set(0, y + 0.07, -0.03);
  g.add(base);
  // よこの かべ
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.2, FLOOR_H, HALL_D + 0.6), toonMaterial(0xc89a62));
    side.position.set(sx * (HALL_W + 0.1), y + FLOOR_H / 2, HALL_D / 2 + 0.1);
    side.receiveShadow = true;
    g.add(side);
  }
  // 階の札(大きな数字)
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#5a3a1c';
  x.beginPath(); x.roundRect(8, 8, 112, 112, 22); x.fill();
  x.fillStyle = '#fff1d0';
  x.font = '400 60px "Dela Gothic One", sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(f === 0 ? '1F' : `${f + 1}F`, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: tex }));
  sign.position.set(-arriveSide(f) * (HALL_W - 0.5), y + 2.3, -0.03);
  g.add(sign);
  // かいだん(上の階から おりてくる): はしの かべへ むかって のぼる だん
  if (f < TOP) {
    const side = arriveSide(f);
    const stepMat = toonMaterial(0xa8744a);
    for (let k = 0; k < 7; k++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4 * (k + 1), 0.9), stepMat);
      st.position.set(side * (HALL_W - 1.25 + k * 0.19), y + 0.2 * (k + 1), 0.55);
      st.receiveShadow = true;
      g.add(st);
    }
  }
  // ランプ(かべの上)
  for (const lx of [-HALL_W * 0.5, HALL_W * 0.5]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
    lamp.position.set(lx, y + 2.55, 0.08);
    g.add(lamp);
  }
}

// 1かい: ロビーと 大きな出口
function buildLobby(g) {
  const doorway = new THREE.Group();
  const frame = toonMaterial(0x7a5032);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 8, 20, Math.PI), frame);
  arch.position.set(0, 1.5, 0);
  const light = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.4), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
  light.position.set(0, 1.2, -0.02);
  doorway.add(arch, light);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 0.2), frame);
    p.position.set(sx * 0.9, 0.8, 0);
    doorway.add(p);
  }
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#3a8a4a'; x.beginPath(); x.roundRect(4, 4, 248, 88, 18); x.fill();
  x.fillStyle = '#fff'; x.font = '400 54px "Dela Gothic One", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('でぐち', 128, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.52), new THREE.MeshBasicMaterial({ map: tex }));
  sign.position.set(0, 2.65, 0.02);
  doorway.add(sign);
  doorway.position.set(0, 0, -0.04);
  g.add(doorway);
}

// 木の幹(うしろ半分)と 根、てっぺんの しげみ、まわりの森と草地
function buildTree(g) {
  const H = floorY(TOP + 1) + 0.3;
  const bark = barkMaterial(0x7a5034, 8, 6);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(TRUNK_R, TRUNK_R + 0.6, H + 1, 40, 1, true, Math.PI / 2, Math.PI), bark);
  trunk.position.set(0, H / 2 - 0.5, 1.2);
  trunk.material.side = THREE.DoubleSide;
  g.add(trunk);
  // 切り口(手前の ふちの 木の色の輪): 階ごとに 床の高さに あるように見える 帯
  const cut = toonMaterial(0xd8a86a);
  for (const sx of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(TRUNK_R - HALL_W - 0.1, H + 1, 0.3), cut);
    band.position.set(sx * (HALL_W + 0.2 + (TRUNK_R - HALL_W - 0.1) / 2), H / 2 - 0.5, 1.2 + 0.2);
    g.add(band);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, H + 1, 0.32), toonMaterial(0x6a4426));
    b2.position.set(sx * (TRUNK_R + 0.15), H / 2 - 0.5, 1.2 + 0.2);
    g.add(b2);
  }
  // 根
  const root = barkMaterial(0x6a4426, 2, 2);
  for (let k = 0; k < 6; k++) {
    const sx = k < 3 ? -1 : 1;
    const r = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 8), root);
    r.position.set(sx * (TRUNK_R + 0.6 + (k % 3) * 0.5), 0.4, -1.5 - (k % 3) * 1.6);
    r.rotation.z = sx * 1.2;
    g.add(r);
  }
  // 屋根: 幹の切り口のふた
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(TRUNK_R + 0.2, TRUNK_R + 0.2, 0.6, 40, 1, false, Math.PI / 2, Math.PI), toonMaterial(0x8a5a32));
  lid.position.set(0, H + 0.3, 1.2);
  g.add(lid);
  // しげみ(てっぺん)
  const rand = makeRand(4);
  const crownMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient });
  for (let k = 0; k < 9; k++) {
    const geo = foliageClump(rand, { detail: 2, balls: 5 });
    const m = new THREE.Mesh(geo, crownMat);
    const a = (k / 9) * Math.PI * 2;
    m.position.set(Math.cos(a) * 5.5, H + 3.6 + rand() * 2, Math.sin(a) * 2.5 - 3);
    m.scale.setScalar(3.8 + rand() * 1.6);
    g.add(m);
  }
  // 草地と森
  const grass = new THREE.Mesh(new THREE.CircleGeometry(80, 40).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: grassTexture(), color: 0x9cc87a, gradientMap: toonGradient }));
  grass.position.y = -0.27;
  grass.receiveShadow = true;
  g.add(grass);
  const spots = [];
  for (let i = 0; i < 90; i++) {
    const a = rand() * Math.PI * 2, d = 11 + rand() * 30;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (z > 3) continue; // 手前は あける
    spots.push({ x, y: -0.25, z, h: 5 + rand() * 6, kind: rand() < 0.4 ? 'pine' : 'broad' });
  }
  buildForestTrees(g, spots);
}

export function buildStage(scene) {
  const g = new THREE.Group();
  const wallTex = wallTexture(), plankTex = plankTexture();
  for (let f = 0; f <= TOP + 1; f++) buildFloor(g, f, wallTex, plankTex);
  buildLobby(g);
  buildTree(g);
  mergeStatic(g);
  scene.add(g);
  return { group: g };
}

export { DOOR_COLORS, DOOR_H, DOOR_W };
