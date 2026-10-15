// どんぐりキャッチ の会場「大木の根もとの広場」。
//
// 丸い草の広場(半径 ARENA_R)を、小石の輪と切り株の観客席が囲む。
// 広場の奥(-z)にどんぐりの大木。太い枝と茂みが広場の奥の上まで張り出して、そこからどんぐりが降る。
// まわりは森。カメラは手前(+z)の高いところから広場を見下ろす。
//
// 座標: 広場のまん中が原点。地面は高さ 0。

import * as THREE from 'three';
import { toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { ARENA_R } from './rules.js';
import { grassTexture, leafLitter, scatterFoliage } from '../daruma/ground.js';
import { buildForestTrees, buildOak, makeRand } from '../daruma/trees.js';

export const OAK = { x: -1.6, z: -11.5, trunkR: 1.9 };
export const PERCH = new THREE.Vector3(1.8, 4.4, -8.6); // 審判のホーホー先生がとまる枝
// 観客席(切り株)。広場の輪のすぐ外、奥半分に並べる(手前はカメラの視線をあける)
export const SEATS = [
  { x: -6.7, z: -1.5, kind: 'risu' },
  { x: -5.6, z: -4.6, kind: 'harinezumi' },
  { x: -2.6, z: -6.6, kind: 'komadori' },
  { x: 3.4, z: -6.4, kind: 'risu' },
  { x: 5.9, z: -4.2, kind: 'komadori' },
  { x: 6.8, z: -1.0, kind: 'harinezumi' },
];
export const STUMP_TOP = 0.42;

const smooth = (t) => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

function buildGround(g) {
  const size = 240, seg = 96;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const arena = new THREE.Color(0x9ad67e), ring = new THREE.Color(0xc9ae7c), forest = new THREE.Color(0x5f8f4e);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), d = Math.hypot(x, z);
    // 広場の外はゆるくうねって、森へ向かって少し上る
    pos.setY(i, d > ARENA_R + 3 ? Math.min(3, (d - ARENA_R - 3) * 0.06) + Math.sin(x * 0.2) * 0.3 + Math.sin(z * 0.17) * 0.3 : 0);
    // 広場は明るい草、輪のところは踏みかためた土、外は暗い森の床
    c.copy(forest).lerp(arena, 1 - smooth((d - ARENA_R - 2) / 9));
    c.lerp(ring, Math.max(0, 1 - Math.abs(d - ARENA_R - 0.15) / 0.55) * 0.85);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const m = toonMaterial(0xffffff);
  m.vertexColors = true;
  m.map = grassTexture();
  m.map.repeat.set(size / 6, size / 6);
  g.add(Object.assign(new THREE.Mesh(geo, m), { name: 'terrain' }));
}

// 広場の縁: こけの乗った丸い石の輪。ところどころにキノコの群れ、石のあいだに小さな花。
// 遊ぶときの境目なので、輪としてはっきり見えるように石は切らさずに並べる。
// 部品ごとに InstancedMesh でまとめて描く(数が多くても描く回数は増えない)
function buildRing(g) {
  const rand = makeRand(31);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const R = ARENA_R + 0.22;
  const put = (mesh, i, x, y, z, sx, sy, sz, ry = rand() * Math.PI * 2, rx = 0, rz = 0) => {
    dummy.position.set(x, y, z);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(rx, ry, rz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };

  // 石と、その上のこけ
  const nStones = 64;
  const stoneGeo = new THREE.IcosahedronGeometry(1, 1);
  const stones = new THREE.InstancedMesh(stoneGeo, toonMaterial(0xffffff), nStones);
  const moss = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), toonMaterial(0xffffff), nStones);
  let nMoss = 0;
  for (let i = 0; i < nStones; i++) {
    const a = (i / nStones) * Math.PI * 2 + (rand() - 0.5) * 0.04, r = R + (rand() - 0.5) * 0.14;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const w = 0.17 + rand() * 0.09, h = 0.1 + rand() * 0.07;
    put(stones, i, x, h * 0.45, z, w, h, w * (0.8 + rand() * 0.3), rand() * 6, (rand() - 0.5) * 0.3, (rand() - 0.5) * 0.3);
    stones.setColorAt(i, color.setHSL(0.08 + rand() * 0.04, 0.1 + rand() * 0.06, 0.48 + rand() * 0.12));
    if (rand() < 0.7) {
      // 石のてっぺん(高さ h*1.45)に、こけを薄くかぶせる
      put(moss, nMoss, x + (rand() - 0.5) * 0.03, h * 1.12, z + (rand() - 0.5) * 0.03, w * (0.72 + rand() * 0.2), h * 0.42, w * (0.68 + rand() * 0.2));
      moss.setColorAt(nMoss++, color.setHSL(0.25 + rand() * 0.05, 0.5, 0.3 + rand() * 0.08));
    }
  }
  moss.count = nMoss;

  // キノコの群れ: 赤に白い水玉 / 茶色 / クリーム色。2〜3本ずつ、輪の外がわに寄せて
  const groups = 14;
  const stemGeo = new THREE.CylinderGeometry(0.5, 0.65, 1, 10);
  const capGeo = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const dotGeo = new THREE.SphereGeometry(1, 8, 6);
  const maxM = groups * 3;
  const stems = new THREE.InstancedMesh(stemGeo, toonMaterial(0xf3ead7), maxM);
  const caps = new THREE.InstancedMesh(capGeo, toonMaterial(0xffffff), maxM);
  const dots = new THREE.InstancedMesh(dotGeo, toonMaterial(0xfffaf0), maxM * 4);
  const capColors = [0xd9473a, 0xd9473a, 0xb07a44, 0xe8c48a];
  let nm = 0, nd = 0;
  for (let k = 0; k < groups; k++) {
    const a0 = (k / groups) * Math.PI * 2 + rand() * 0.3;
    const kind = Math.floor(rand() * capColors.length);
    const n = 2 + Math.floor(rand() * 2);
    for (let j = 0; j < n; j++) {
      const a = a0 + (j - n / 2) * 0.035, r = R + 0.24 + rand() * 0.18;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const sz = (j === 0 ? 0.13 : 0.08) + rand() * 0.04;
      const tilt = (rand() - 0.5) * 0.3;
      put(stems, nm, x, sz * 0.75, z, sz * 0.35, sz * 1.5, sz * 0.35, 0, tilt, tilt);
      put(caps, nm, x, sz * 1.4, z, sz, sz * 0.75, sz, rand() * 6, tilt, tilt);
      caps.setColorAt(nm, color.setHex(capColors[kind]));
      nm++;
      if (kind < 2) {
        // 赤いかさには白い水玉
        for (let d = 0; d < 4; d++) {
          const da = rand() * Math.PI * 2, dr = sz * (0.3 + rand() * 0.45);
          put(dots, nd++, x + Math.cos(da) * dr, sz * 1.4 + Math.sqrt(Math.max(0, 1 - (dr / sz) ** 2)) * sz * 0.78, z + Math.sin(da) * dr, sz * 0.17, sz * 0.08, sz * 0.17);
        }
      }
    }
  }
  stems.count = caps.count = nm;
  dots.count = nd;

  // 小さな花: 5まいの花びら + まん中。石のあいだと、輪のすぐ外に
  const petal = new THREE.CircleGeometry(1, 5);
  petal.rotateX(-Math.PI / 2);
  const nFlowers = 90;
  const flowers = new THREE.InstancedMesh(petal, new THREE.MeshToonMaterial({ color: 0xffffff, side: THREE.DoubleSide }), nFlowers);
  const centers = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), toonMaterial(0xf2c14e), nFlowers);
  const petalColors = [0xffffff, 0xfff1a8, 0xffc4d6, 0xd9c8ff];
  for (let i = 0; i < nFlowers; i++) {
    const a = rand() * Math.PI * 2, r = R + (rand() < 0.5 ? (rand() - 0.5) * 0.2 : 0.2 + rand() * 0.7);
    const x = Math.cos(a) * r, z = Math.sin(a) * r, s = 0.045 + rand() * 0.03, y = 0.06 + rand() * 0.08;
    put(flowers, i, x, y, z, s, 1, s, rand() * 6, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.4);
    flowers.setColorAt(i, color.setHex(petalColors[Math.floor(rand() * petalColors.length)]));
    put(centers, i, x, y + 0.008, z, s * 0.35, s * 0.25, s * 0.35);
  }
  for (const m of [stones, moss, stems, caps, dots, flowers, centers]) {
    m.castShadow = m !== flowers && m !== dots && m !== centers;
    m.receiveShadow = true;
    g.add(m);
  }
}

// 観客の切り株
function buildStumps(g) {
  const rand = makeRand(41);
  const bark = toonMaterial(0x7a5a40), top = toonMaterial(0xd9b98a), ringC = toonMaterial(0xb8935f);
  for (const s of SEATS) {
    const h = STUMP_TOP;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, h, 14), bark);
    body.position.set(s.x, h / 2, s.z);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 14), top);
    face.position.set(s.x, h + 0.005, s.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.015, 4, 20), ringC);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(s.x, h + 0.02, s.z);
    body.rotation.y = rand() * 6;
    g.add(body, face, ring);
  }
}

function buildForest(g) {
  const rand = makeRand(53);
  const spots = [];
  for (let i = 0; i < 260; i++) {
    const a = rand() * Math.PI * 2, d = 13 + Math.pow(rand(), 0.8) * 45;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (z > 6 && Math.abs(x) < 12 + (z - 6) * 0.6) continue; // カメラのうしろと視線はあける
    if (Math.hypot(x - OAK.x, z - OAK.z) < 8) continue; // 大木のまわり
    spots.push({ x, y: d > ARENA_R + 3 ? Math.min(3, (d - ARENA_R - 3) * 0.06) : 0, z, h: 4.5 + rand() * 5, kind: rand() < 0.3 ? 'pine' : 'broad' });
  }
  buildForestTrees(g, spots);
}

// ── 木漏れ日(広場の上に張り出した茂みの影) ─────────────────
// 茂みはカメラ(高さ 9m あたり)より上にあって、直接は見えない。その影だけが、木漏れ日として広場に落ちる。
// 本物の影(太陽の向き)にすると、高い茂みの影は 5〜20m 横へずれて広場に落ちないので、地面に描く。
// 枝がゆれると、その下の影がざわざわゆれる(どこに降るかのしるし)。
// すきまをあけて置く: ぜんぶ覆うと広場が暗くなって、どんぐりの影が見えにくい。
function dappleTexture(seed) {
  const rand = makeRand(seed);
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.filter = 'blur(6px)';
  // 葉のかたまりを、まるい影のなかにたくさん。ふちほど まばら
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2, d = Math.pow(rand(), 0.8) * S * 0.36;
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
    const r = 10 + rand() * 18 * (1 - d / (S * 0.45));
    g.fillStyle = `rgba(20, 50, 20, ${0.35 + rand() * 0.35})`;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.6 + rand() * 0.4), rand() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // 木漏れ日の明るい点(影の中の穴)
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2, d = rand() * S * 0.3;
    g.beginPath();
    g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 4 + rand() * 7, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildCanopy(g) {
  const rand = makeRand(67);
  const textures = [11, 12, 13].map(dappleTexture);
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const spots = [];
  // だいたい 2.8m おきに、少しずらして。ときどき抜く(すきま)
  for (let gx = -2; gx <= 2; gx++) {
    for (let gz = -2; gz <= 2; gz++) {
      const x = gx * 2.8 + (rand() - 0.5) * 1.2 + (gz % 2) * 1.4, z = gz * 2.8 + (rand() - 0.5) * 1.2;
      if (Math.hypot(x, z) > ARENA_R + 1.2 || rand() < 0.3) continue;
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: textures[spots.length % 3], transparent: true, depthWrite: false, opacity: 0.32 }));
      const r = 3.0 + rand() * 1.4;
      m.scale.set(r, 1, r * (0.8 + rand() * 0.3));
      m.rotation.y = rand() * Math.PI * 2;
      m.position.set(x, 0.012, z);
      m.renderOrder = 0;
      m.userData = { x, z, base: m.position.clone(), rot: m.rotation.y, shake: 0, ph: rand() * 6 };
      g.add(m);
      spots.push(m);
    }
  }
  return spots;
}

const isFree = (x, z) => {
  const d = Math.hypot(x, z);
  if (d < ARENA_R + 0.6) return false; // 広場の中は走るので、草の株を置かない
  if (Math.hypot(x - OAK.x, z - OAK.z) < OAK.trunkR + 0.8) return false;
  if (SEATS.some((s) => Math.hypot(x - s.x, z - s.z) < 0.7)) return false;
  return d < 24;
};

export function buildStage(scene) {
  const g = new THREE.Group();
  buildGround(g);
  buildRing(g);
  buildStumps(g);
  const oak = buildOak(g, OAK, PERCH);
  leafLitter(g, {
    count: 320,
    colors: [0xc98a3a, 0xa86a2c, 0xdcae4e, 0x8f6a3a, 0x7f8f3a],
    // 広場の中には置かない(落ちてくるどんぐりと見まちがえないように)。輪の外と大木の根もとだけ
    place: (rand) => {
      if (rand() < 0.5) {
        const a = rand() * Math.PI * 2, d = OAK.trunkR + 0.4 + Math.pow(rand(), 0.7) * 4.5;
        return [OAK.x + Math.cos(a) * d, 0, OAK.z + Math.sin(a) * d];
      }
      const a = rand() * Math.PI * 2, d = ARENA_R + 0.6 + Math.pow(rand(), 1.4) * 5;
      return [Math.cos(a) * d, 0, Math.sin(a) * d];
    },
  });
  scatterFoliage(g, { isFree, heightAt: () => 0, pathEdge: () => 0, pathFrom: 0, pathTo: 0 });
  buildForest(g);
  const canopy = buildCanopy(g);
  const crowns = oak.getObjectByName('oakCrowns');
  mergeStatic(g, (o) => o.name === 'oakCrowns' || canopy.includes(o));
  scene.add(g);
  let time = 0;
  return {
    group: g,
    crowns,
    // (x, z) の上の茂みをゆらす。地面の木漏れ日もいっしょにゆれる
    shakeAt(x, z) {
      let best = null, bd = Infinity;
      for (const c of canopy) {
        const d = Math.hypot(c.userData.x - x, c.userData.z - z);
        if (d < bd) { bd = d; best = c; }
      }
      if (best) best.userData.shake = 1;
    },
    // 全部の茂みを、少なくとも level までゆらす(どんぐりの雨のあいだ)
    shakeAll(level) {
      for (const c of canopy) c.userData.shake = Math.max(c.userData.shake, level * (0.7 + 0.3 * Math.sin(time * 3 + c.userData.ph)));
    },
    update(dt) {
      time += dt;
      for (const c of canopy) {
        const u = c.userData;
        // ふだんは風でゆっくり、ゆらされたときは大きく細かく
        u.shake = Math.max(0, u.shake - dt * 0.9);
        const k = u.shake * u.shake;
        c.position.set(
          u.base.x + Math.sin(time * 0.7 + u.ph) * 0.06 + Math.sin(time * 23 + u.ph) * 0.3 * k,
          u.base.y,
          u.base.z + Math.cos(time * 0.6 + u.ph) * 0.05 + Math.sin(time * 19 + u.ph * 2) * 0.25 * k,
        );
        c.rotation.y = u.rot + Math.sin(time * 17 + u.ph) * 0.15 * k;
        c.material.opacity = 0.32 + 0.12 * k; // ゆれているあいだは少し濃く
      }
    },
  };
}
