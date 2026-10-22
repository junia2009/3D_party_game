// 森の湖の いろいろキノコ の 会場(見た目だけ)。
//
// 森に かこまれた 湖。まん中に 7色の 六角の キノコが 花の 形に うかぶ(上の 面に それぞれの もよう)。
// キノコの 下は 白い 柄が 水の 中へ。右奥の 切り株の 島に ホーホー先生(旗を あげる)。
// 岸には あし と 木、水面には 蓮の葉。
//
// 座標: キノコの 上の 面が y = 0。水面は y = WATER_Y。カメラは +z(手前)から。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { foliageClump, makeRand } from '../daruma/trees.js';
import { HEXES, RULES } from './rules.js';

export const WATER_Y = -0.8;
export const SINK_Y = -2.4; // しずみきった ときの キノコの 高さ
export const OWL_AT = new THREE.Vector3(3.4, WATER_Y + 1.0, -6.4); // 右奥(カメラに 入る ところ)

// キノコの 色(上の 面 / もようの 色 / 横)
export const PALETTE = {
  white: { top: '#f4f1ea', mark: '#c9c2d6', side: 0xd8d2c8 },
  red: { top: '#ff5a4e', mark: '#ffe0d6', side: 0xd83a30 },
  yellow: { top: '#ffd23c', mark: '#fff3b0', side: 0xd8a21e },
  green: { top: '#6ccf4a', mark: '#d8f8c0', side: 0x4a9a32 },
  blue: { top: '#4ab8f0', mark: '#d0f0ff', side: 0x2f88c0 },
  purple: { top: '#a06ae0', mark: '#e6d4ff', side: 0x7a48b8 },
  pink: { top: '#ff8fc8', mark: '#ffe0f0', side: 0xd8609e },
};
export const css = (c) => PALETTE[c].top;

// 上の 面の もよう(色ごとに ちがう): しま・水玉・ななめじま・小さな 水玉・大きな 水玉・水玉と 輪・ジグザグ
function topTexture(color) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const p = PALETTE[color];
  g.fillStyle = p.top;
  g.fillRect(0, 0, S, S);
  g.fillStyle = p.mark;
  g.strokeStyle = p.mark;
  const dot = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  if (color === 'white') {
    for (let i = -S; i < S * 2; i += 44) { g.save(); g.translate(i, 0); g.rotate(-0.5); g.fillRect(0, -S, 20, S * 3); g.restore(); }
  } else if (color === 'red') {
    for (const [x, y, r] of [[128, 128, 34], [60, 70, 20], [196, 70, 20], [60, 186, 20], [196, 186, 20], [128, 30, 14], [128, 226, 14]]) dot(x, y, r);
  } else if (color === 'yellow') {
    for (let i = 0; i < S; i += 40) g.fillRect(i, 0, 20, S);
  } else if (color === 'green') {
    for (let y = 30; y < S; y += 50) for (let x = (y / 50) % 2 ? 30 : 55; x < S; x += 50) dot(x, y, 13);
  } else if (color === 'blue') {
    dot(128, 128, 58);
  } else if (color === 'purple') {
    dot(128, 128, 48);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; dot(128 + Math.cos(a) * 98, 128 + Math.sin(a) * 98, 14); }
  } else if (color === 'pink') {
    g.lineWidth = 14;
    g.lineJoin = 'round';
    for (let y = 20; y < S + 40; y += 46) {
      g.beginPath();
      for (let x = -20, k = 0; x < S + 40; x += 32, k++) g.lineTo(x, y + (k % 2 ? 18 : -18));
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function waterTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#4fa8d0';
  g.fillRect(0, 0, S, S);
  const rand = makeRand(8);
  for (let i = 0; i < 70; i++) {
    const x = rand() * S, y = rand() * S, w = 10 + rand() * 30;
    g.strokeStyle = `rgba(220,245,255,${0.25 + rand() * 0.4})`;
    g.lineWidth = 1.5 + rand() * 2;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + w / 2, y - 3 - rand() * 3, x + w, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(14, 14);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 六角(とがった かどが ±z)の 形
function hexShape(r) {
  const sh = new THREE.Shape();
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 2 + (k / 6) * Math.PI * 2; // 形は xy、あとで y → -z
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (k === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  sh.closePath();
  return sh;
}

export function buildMushrooms(scene) {
  const r = RULES.hexR - RULES.gap - 0.08;
  const capGeo = new THREE.ExtrudeGeometry(hexShape(r), { depth: 0.32, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.12, bevelSegments: 3 });
  capGeo.rotateX(-Math.PI / 2); // 押しだしは +y へ
  capGeo.translate(0, -0.46, 0); // 上の 面が y = 0
  // 上の 面の uv: 六角の はばに 合わせる
  const pos = capGeo.attributes.position, uv = capGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (r * 2.4) + 0.5, -pos.getZ(i) / (r * 2.4) + 0.5);
  const skirtGeo = new THREE.SphereGeometry(1, 6, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  skirtGeo.rotateY(Math.PI / 6);
  const stemGeo = new THREE.CylinderGeometry(0.42, 0.55, 3.2, 10);
  const stemMat = toonMaterial(0xf6ecd8);
  return HEXES.map((h) => {
    const g = new THREE.Group();
    const top = new THREE.MeshToonMaterial({ map: topTexture(h.color), gradientMap: toonGradient });
    const side = toonMaterial(PALETTE[h.color].side);
    const cap = new THREE.Mesh(capGeo, [top, side]);
    cap.castShadow = cap.receiveShadow = true;
    const skirt = new THREE.Mesh(skirtGeo, side);
    skirt.scale.set(r * 0.95, 0.5, r * 0.95);
    skirt.position.y = -0.44;
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = -2.0;
    g.add(cap, skirt, stem);
    g.position.set(h.x, 0, h.z);
    g.userData.hex = h;
    g.userData.top = top;
    scene.add(g);
    return g;
  });
}

export function buildStage(scene) {
  const g = new THREE.Group();
  const rand = makeRand(31);
  // 水面と 水の底
  const water = new THREE.Mesh(new THREE.CircleGeometry(60, 64).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: waterTexture(), gradientMap: toonGradient, transparent: true, opacity: 0.9 }));
  water.position.y = WATER_Y;
  water.receiveShadow = true;
  water.userData.noMerge = true;
  g.add(water);
  const bed = new THREE.Mesh(new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2), toonMaterial(0x2a6a80));
  bed.position.y = WATER_Y - 1.6;
  g.add(bed);
  // 岸(遠くの 丘)と 木
  const SHORE = 15;
  const shore = new THREE.Mesh(new THREE.RingGeometry(SHORE, 70, 64, 4).rotateX(-Math.PI / 2), toonMaterial(0x6aa956));
  shore.position.y = WATER_Y + 0.2;
  g.add(shore);
  const bank = new THREE.Mesh(new THREE.CylinderGeometry(SHORE + 0.2, SHORE + 0.8, 0.5, 64, 1, true), new THREE.MeshToonMaterial({ color: 0x9a7a52, gradientMap: toonGradient, side: THREE.DoubleSide }));
  bank.position.y = WATER_Y;
  g.add(bank);
  const crown = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient });
  const clump = foliageClump(rand, { detail: 1, balls: 4, bottom: 0x2f6a35, top: 0x8fcf5f });
  const trunk = toonMaterial(0x6b4c36);
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    if (Math.sin(a) > 0.35) continue; // 手前は あける
    const d = SHORE + 1.5 + rand() * 12;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, h = 3 + rand() * 3;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, h * 0.6, 6), trunk);
    t.position.set(x, WATER_Y + h * 0.3, z);
    const c = new THREE.Mesh(clump, crown);
    c.scale.setScalar(h * 0.5);
    c.position.set(x, WATER_Y + h * 0.7, z);
    g.add(t, c);
  }
  // あし
  const reed = toonMaterial(0x6f9a48), head = toonMaterial(0x7a5032);
  for (let i = 0; i < 80; i++) {
    const a = rand() * Math.PI * 2;
    if (Math.sin(a) > 0.5 && Math.abs(Math.cos(a)) < 0.6) continue;
    const d = SHORE - 0.5 - rand() * 1.5, h = 0.8 + rand() * 0.9;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, h, 4), reed);
    m.position.set(Math.cos(a) * d, WATER_Y + h / 2, Math.sin(a) * d);
    m.rotation.z = (rand() - 0.5) * 0.3;
    g.add(m);
    if (i % 2) {
      const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 5), head);
      hd.position.set(m.position.x, WATER_Y + h, m.position.z);
      g.add(hd);
    }
  }
  // 蓮の葉
  const pad = toonMaterial(0x4f9a46), flower = toonMaterial(0xffb8d8);
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, d = 7 + rand() * 7;
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.4 + rand() * 0.4, 14, 0.3, Math.PI * 1.8).rotateX(-Math.PI / 2), pad);
    m.position.set(Math.cos(a) * d, WATER_Y + 0.02, Math.sin(a) * d);
    m.rotation.y = rand() * 6;
    g.add(m);
    if (i % 5 === 0) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.25, 6), flower);
      f.position.set(m.position.x + 0.1, WATER_Y + 0.14, m.position.z);
      g.add(f);
    }
  }
  // 先生の 切り株の 島
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 2.4, 14), toonMaterial(0x8a5a32));
  stump.position.set(OWL_AT.x, OWL_AT.y - 1.2, OWL_AT.z);
  const ring = new THREE.Mesh(new THREE.CircleGeometry(1.1, 14).rotateX(-Math.PI / 2), toonMaterial(0xe8c48c));
  ring.position.set(OWL_AT.x, OWL_AT.y + 0.01, OWL_AT.z);
  g.add(stump, ring);
  mergeStatic(g);
  scene.add(g);
  return { group: g, water };
}

// 先生の 旗: ポールと 旗(色は あとで かえる)
export function buildFlag() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.8, 6), toonMaterial(0x8a5a32));
  pole.position.y = 0.9;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6, 6, 1), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient, side: THREE.DoubleSide }));
  cloth.geometry.translate(0.45, 0, 0);
  cloth.position.y = 1.5;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), toonMaterial(0xffd23c));
  knob.position.y = 1.82;
  g.add(pole, cloth, knob);
  return { g, cloth };
}
