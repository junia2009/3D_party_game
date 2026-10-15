// 木: どんぐりの大木と、まわりの森。
//
// 葉は「でこぼこの球を何個か寄せた雲のような塊」で作る。頂点の色で下を暗く・上を明るく
// しておくと、トゥーンの陰と合わさって、ぼてっとしたかたまりに奥行きが出る。
// 森の木は数が多いので InstancedMesh でまとめて描く。

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonGradient, toonMaterial } from '../../runtime/models.js';

export function makeRand(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// なめらかなでこぼこ(いくつかの正弦波の重ね合わせ)
function lumpy(x, y, z, k) {
  return (
    Math.sin(x * 2.1 * k + y * 1.3) * Math.sin(y * 2.7 * k + z * 1.1) * 0.5 +
    Math.sin(z * 3.3 * k + x * 0.7) * 0.3 +
    Math.sin((x + y + z) * 5.1 * k) * 0.15
  );
}

function vertexColorMaterial() {
  return new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient });
}

// ── 葉の塊 ─────────────────────────────────────────
// 色は bottom → top の縦グラデーション(+少しのむら)
function foliageBall(detail, k, rand) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const ox = rand() * 10, oy = rand() * 10, oz = rand() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = 1 + 0.16 * lumpy(x + ox, y + oy, z + oz, k);
    p.setXYZ(i, x * d, y * d * 0.9, z * d);
  }
  return g;
}

export function foliageClump(rand, { detail = 2, balls = 5, bottom = 0x2f6b35, top = 0x8fcf5f } = {}) {
  const parts = [];
  for (let i = 0; i < balls; i++) {
    const b = foliageBall(detail, 1 + rand(), rand);
    const r = i === 0 ? 1 : 0.55 + rand() * 0.3;
    const a = rand() * Math.PI * 2;
    const off = i === 0 ? 0 : 0.6 + rand() * 0.25;
    b.scale(r, r, r);
    b.translate(Math.cos(a) * off, i === 0 ? 0 : (rand() - 0.2) * 0.5, Math.sin(a) * off);
    parts.push(b);
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  g.computeBoundingBox();
  const { min, max } = g.boundingBox;
  const p = g.attributes.position;
  const lo = new THREE.Color(bottom), hi = new THREE.Color(top), c = new THREE.Color();
  const colors = [];
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - min.y) / (max.y - min.y);
    c.copy(lo).lerp(hi, Math.pow(t, 0.8));
    const n = 1 + 0.06 * lumpy(p.getX(i) * 3, p.getY(i) * 3, p.getZ(i) * 3, 1);
    colors.push(c.r * n, c.g * n, c.b * n);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}

// ── 幹(太さにむらのある、根元の広がった円柱) ───────────────
function trunkGeometry({ height, r0, r1, flare = 0.6, twist = 0.4, knobs = 0.08, radial = 24, rings = 20, rand }) {
  const g = new THREE.CylinderGeometry(1, 1, height, radial, rings, true);
  g.translate(0, height / 2, 0);
  const p = g.attributes.position;
  const ph = rand() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = y / height;
    const a = Math.atan2(z, x) + twist * t;
    let r = r0 + (r1 - r0) * t;
    r *= 1 + flare * Math.exp(-t * 9); // 根元が広がる
    r *= 1 + knobs * (Math.sin(a * 5 + ph + t * 3) * 0.6 + Math.sin(a * 3 - t * 7 + ph) * 0.4);
    p.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r);
  }
  g.computeVertexNormals();
  return g;
}

// 樹皮の模様(縦のみぞ)。CPU で描く(ground.js と同じ理由)
let barkTex = null;
function barkTexture() {
  if (barkTex) return barkTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d', { willReadFrequently: true });
  const rand = makeRand(77);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 70; i++) {
    let x = rand() * 256;
    g.strokeStyle = `rgba(70, 45, 30, ${0.25 + rand() * 0.3})`;
    g.lineWidth = 2 + rand() * 5;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= 512; y += 16) {
      x += (rand() - 0.5) * 6;
      g.lineTo(x, y);
    }
    g.stroke();
    // 左右にはみ出した分をくり返し側にも
    for (const dx of [-256, 256]) {
      g.save();
      g.translate(dx, 0);
      g.stroke();
      g.restore();
    }
  }
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(255, 240, 220, ${0.1 + rand() * 0.15})`;
    g.fillRect(rand() * 256, rand() * 512, 2 + rand() * 6, 4 + rand() * 14);
  }
  barkTex = new THREE.CanvasTexture(c);
  barkTex.colorSpace = THREE.SRGBColorSpace;
  barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;
  return barkTex;
}

export function barkMaterial(color, repeatX = 2, repeatY = 2) {
  const m = toonMaterial(color);
  m.map = barkTexture().clone();
  m.map.needsUpdate = true;
  m.map.repeat.set(repeatX, repeatY);
  return m;
}

// 曲がった枝や根(先細りの管)
export function taperedTube(points, r0, r1, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(points);
  const segs = Math.max(8, points.length * 6);
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const p = g.attributes.position;
  // TubeGeometry は太さ一定なので、管の中心からの距離を先へ行くほど縮める
  const frames = curve.computeFrenetFrames(segs, false);
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const center = curve.getPointAt(t);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const i = s * (radial + 1) + j;
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).sub(center);
      v.multiplyScalar(r);
      p.setXYZ(i, center.x + v.x, center.y + v.y, center.z + v.z);
    }
  }
  void frames;
  g.computeVertexNormals();
  return g;
}

// ── どんぐり ───────────────────────────────────────
export function acornGeometry() {
  const body = new THREE.SphereGeometry(0.09, 12, 10);
  body.scale(1, 1.25, 1);
  const cap = new THREE.SphereGeometry(0.097, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.translate(0, 0.045, 0);
  const stem = new THREE.CylinderGeometry(0.012, 0.016, 0.06, 6);
  stem.translate(0, 0.13, 0);
  const color = (g, hex) => {
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [c.r, c.g, c.b][i % 3]), 3));
    g.deleteAttribute('uv');
    return g;
  };
  return mergeGeometries([color(body, 0xb5702f), color(cap, 0x6e4a2a), color(stem, 0x5a3c22)]);
}

// ── どんぐりの大木 ─────────────────────────────────
// oak: { x, z, trunkR }、perch: 先生がとまる位置(枝の上面)
export function buildOak(g, oak, perch) {
  const rand = makeRand(101);
  const tree = new THREE.Group();
  tree.name = 'oak';
  const bark = barkMaterial(0x7a5a40, 3, 2);
  const base = new THREE.Vector3(oak.x, 0, oak.z);

  // 幹
  const trunk = new THREE.Mesh(trunkGeometry({ height: 9.5, r0: oak.trunkR, r1: oak.trunkR * 0.62, flare: 0.55, twist: 0.5, knobs: 0.1, rand }), bark);
  trunk.position.copy(base);
  tree.add(trunk);

  // 根: 幹から外へ弧を描いて、地面にもぐる
  const rootMat = barkMaterial(0x7a5a40, 1, 3);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand() * 0.4;
    const len = 2.6 + rand() * 2.4;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const pts = [0, 0.3, 0.6, 1].map((t) => base.clone()
      .addScaledVector(dir, oak.trunkR * 0.8 + t * len)
      .add(new THREE.Vector3(0, (1 - t) * 1.1 * (1 - t) + Math.sin(t * Math.PI) * 0.35 - t * 0.25, 0)));
    tree.add(new THREE.Mesh(taperedTube(pts, 0.42 + rand() * 0.15, 0.06), rootMat));
  }

  // 先生の枝: 幹から上がって、道の上で水平になり、少し先まで伸びる
  const branchPts = [
    new THREE.Vector3(oak.x + 0.6, perch.y - 1.4, oak.z + 0.3),
    new THREE.Vector3(oak.x + 2.2, perch.y - 0.55, oak.z + 1.4),
    new THREE.Vector3(-2.6, perch.y - 0.28, perch.z - 0.5),
    new THREE.Vector3(perch.x, perch.y - 0.2, perch.z),
    new THREE.Vector3(perch.x + 1.3, perch.y - 0.12, perch.z + 0.15),
    new THREE.Vector3(perch.x + 2.2, perch.y + 0.15, perch.z + 0.35),
  ];
  tree.add(new THREE.Mesh(taperedTube(branchPts, 0.5, 0.07, 12), barkMaterial(0x7a5a40, 1, 4)));
  // 枝先の小枝と葉っぱ、どんぐり
  const twigEnd = new THREE.Vector3(perch.x + 2.5, perch.y + 0.8, perch.z + 0.1);
  tree.add(new THREE.Mesh(taperedTube([new THREE.Vector3(perch.x + 1.6, perch.y - 0.1, perch.z + 0.2), new THREE.Vector3(perch.x + 2.0, perch.y + 0.4, perch.z + 0.2), twigEnd], 0.07, 0.025, 6), bark));
  const tipLeaves = new THREE.Mesh(foliageClump(rand, { detail: 2, balls: 3 }), vertexColorMaterial());
  tipLeaves.scale.setScalar(0.45);
  tipLeaves.position.copy(twigEnd).add(new THREE.Vector3(0.1, 0.1, 0));
  tree.add(tipLeaves);

  // 上へ伸びる太い枝
  for (const [dx, dz, h] of [[3.8, 2.2, 10.5], [-3.4, -1.6, 11], [0.8, -3.2, 12], [-1.5, 3, 10]]) {
    const pts = [
      new THREE.Vector3(oak.x, 6.5, oak.z),
      new THREE.Vector3(oak.x + dx * 0.4, 8, oak.z + dz * 0.4),
      new THREE.Vector3(oak.x + dx, h, oak.z + dz),
    ];
    tree.add(new THREE.Mesh(taperedTube(pts, 0.6, 0.18, 10), bark));
  }

  // 樹洞(幹の、道の側に開いた穴)
  const hollowAt = new THREE.Vector3(oak.x + oak.trunkR * 0.95, 3.4, oak.z + oak.trunkR * 0.55);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ color: 0x24170f }));
  hole.scale.set(0.8, 1.15, 1);
  hole.position.copy(hollowAt);
  hole.lookAt(hollowAt.clone().add(new THREE.Vector3(1, 0, 0.6)));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 8, 20), toonMaterial(0x6a4b33));
  rim.scale.set(0.8, 1.15, 0.6);
  rim.position.copy(hollowAt);
  rim.quaternion.copy(hole.quaternion);
  tree.add(hole, rim);

  // 葉の茂み。ゴール前 6m(どんぐりが落ちてくるところ)の上まで張り出す
  const leafMat = vertexColorMaterial();
  const crownGroup = new THREE.Group();
  crownGroup.name = 'oakCrowns'; // 風で揺らすので、ほかの部品とは別にまとめる
  tree.add(crownGroup);
  const crowns = [
    [oak.x, 11.5, oak.z, 4.6], [oak.x - 3.6, 10, oak.z - 1.8, 3.4], [oak.x + 4, 10.8, oak.z + 1.8, 3.6],
    [-1.4, 9.6, perch.z + 2.4, 3.3], [1.6, 9.1, perch.z + 0.2, 2.9], [-0.4, 8.9, perch.z + 5.6, 2.9],
    [-4, 9.2, perch.z + 4.4, 3], [oak.x + 1.2, 13.6, oak.z - 2, 3.2], [oak.x - 1.5, 12.2, oak.z + 3.2, 3],
  ];
  for (const [x, y, z, r] of crowns) {
    const c = new THREE.Mesh(foliageClump(rand, { detail: 3, balls: 6 }), leafMat);
    c.scale.set(r, r * 0.78, r);
    c.position.set(x, y, z);
    c.rotation.y = rand() * Math.PI * 2;
    crownGroup.add(c);
  }

  // 茂みの下にぶら下がるどんぐり
  const acornMat = vertexColorMaterial();
  const hanging = [];
  for (const [x, y, z, r] of crowns.slice(3)) {
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2, d = rand() * r * 0.7;
      hanging.push([x + Math.cos(a) * d, y - r * 0.62 - rand() * 0.25, z + Math.sin(a) * d]);
    }
  }
  const acorns = new THREE.InstancedMesh(acornGeometry(), acornMat, hanging.length);
  const dummy = new THREE.Object3D();
  hanging.forEach(([x, y, z], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(Math.PI + (rand() - 0.5) * 0.5, rand() * 6, (rand() - 0.5) * 0.5);
    dummy.scale.setScalar(1.6);
    dummy.updateMatrix();
    acorns.setMatrixAt(i, dummy.matrix);
  });
  tree.add(acorns);

  // 根元: こけ・キノコ・落ち葉・落ちたどんぐり
  const moss = toonMaterial(0x6f9a3c);
  for (let i = 0; i < 10; i++) {
    const a = rand() * Math.PI * 2, d = oak.trunkR * (1.0 + rand() * 0.5);
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), moss);
    m.scale.set(0.35 + rand() * 0.4, 0.12, 0.3 + rand() * 0.3);
    m.position.set(oak.x + Math.cos(a) * d, 0.25 + rand() * 0.5, oak.z + Math.sin(a) * d);
    m.rotation.y = a;
    tree.add(m);
  }
  const capGeo = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const stemGeo = new THREE.CylinderGeometry(0.4, 0.5, 1, 8);
  const shroomCap = toonMaterial(0xd9573f), shroomCap2 = toonMaterial(0xe8b46a), shroomStem = toonMaterial(0xf3ead7);
  for (let i = 0; i < 9; i++) {
    const a = 0.3 + rand() * 1.4, d = oak.trunkR * 1.25 + rand() * 0.8;
    const s = 0.12 + rand() * 0.14;
    const x = oak.x + Math.cos(a) * d, z = oak.z + Math.sin(a) * d;
    const stem = new THREE.Mesh(stemGeo, shroomStem);
    stem.scale.set(s * 0.5, s * 1.4, s * 0.5);
    stem.position.set(x, s * 0.7, z);
    const cap = new THREE.Mesh(capGeo, i % 3 ? shroomCap : shroomCap2);
    cap.scale.set(s, s * 0.7, s);
    cap.position.set(x, s * 1.35, z);
    tree.add(stem, cap);
  }
  g.add(tree);
  return tree;
}

// ── 森の木(まとめて描く) ─────────────────────────────
// spots: [{ x, y, z, h, kind: 'broad' | 'pine' }]
export function buildForestTrees(g, spots) {
  const rand = makeRand(211);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const broad = spots.filter((s) => s.kind === 'broad');
  const pines = spots.filter((s) => s.kind === 'pine');

  // 広葉樹: 幹 + 葉の塊(3種類の形を使い回す)
  const trunkGeo = trunkGeometry({ height: 1, r0: 0.11, r1: 0.07, flare: 0.5, twist: 0.3, knobs: 0.06, radial: 8, rings: 4, rand });
  const trunks = new THREE.InstancedMesh(trunkGeo, toonMaterial(0x6b4c36), broad.length + pines.length);
  let ti = 0;
  // 葉の形は3種類 × 近い木用(細かい)/ 遠い木用(粗い)。遠くの木まで細かくすると三角形が多すぎる
  const near = (s) => Math.hypot(s.x, (s.z + 10) * 0.8) < 32;
  const crownVariants = [2, 2, 2, 1, 1, 1].map((detail) => foliageClump(rand, { detail, balls: detail === 2 ? 4 + Math.floor(rand() * 3) : 3 + Math.floor(rand() * 2) }));
  const kindOf = (s, i) => (i % 3) + (near(s) ? 0 : 3);
  const crownMeshes = crownVariants.map((geo, k) => Object.assign(new THREE.InstancedMesh(geo, vertexColorMaterial(), broad.filter((s, i) => kindOf(s, i) === k).length), { name: 'crowns' }));
  const counts = [0, 0, 0, 0, 0, 0];
  broad.forEach((s, i) => {
    dummy.position.set(s.x, s.y - 0.2, s.z);
    dummy.rotation.set(0, rand() * 6, 0);
    dummy.scale.set(s.h * 0.9, s.h * 0.55, s.h * 0.9);
    dummy.updateMatrix();
    trunks.setMatrixAt(ti++, dummy.matrix);
    const k = kindOf(s, i);
    dummy.position.set(s.x, s.y + s.h * 0.62, s.z);
    dummy.scale.set(s.h * 0.34, s.h * 0.34 * (0.85 + rand() * 0.3), s.h * 0.34);
    dummy.updateMatrix();
    const m = crownMeshes[k];
    m.setMatrixAt(counts[k], dummy.matrix);
    // 木ごとに少し色を変える(全部同じ緑だと絵に見える)
    const v = 0.85 + rand() * 0.25;
    color.setRGB(v * (1 + (rand() - 0.5) * 0.12), v, v * (0.9 + rand() * 0.15));
    m.setColorAt(counts[k]++, color);
  });

  // 針葉樹: 円すいを3段重ねる
  const tiers = [];
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.ConeGeometry(0.42 - i * 0.1, 0.5, 9, 1);
    cone.translate(0, 0.45 + i * 0.28, 0);
    const p = cone.attributes.position;
    const cols = [];
    for (let j = 0; j < p.count; j++) {
      const t = (p.getY(j) - (0.2 + i * 0.28)) / 0.5;
      const c = new THREE.Color(0x23553a).lerp(new THREE.Color(0x5f9e5a), Math.max(0, Math.min(1, t * 0.8 + i * 0.15)));
      cols.push(c.r, c.g, c.b);
    }
    cone.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    cone.deleteAttribute('uv');
    tiers.push(cone);
  }
  const pineGeo = mergeGeometries(tiers);
  const pineMesh = new THREE.InstancedMesh(pineGeo, vertexColorMaterial(), pines.length);
  pines.forEach((s, i) => {
    dummy.position.set(s.x, s.y - 0.2, s.z);
    dummy.rotation.set(0, rand() * 6, 0);
    dummy.scale.set(s.h * 0.9, s.h * 0.3, s.h * 0.9);
    dummy.updateMatrix();
    trunks.setMatrixAt(ti++, dummy.matrix);
    dummy.scale.set(s.h * 0.75, s.h, s.h * 0.75);
    dummy.updateMatrix();
    pineMesh.setMatrixAt(i, dummy.matrix);
    color.setHSL(0, 0, 0.9 + rand() * 0.2);
    pineMesh.setColorAt(i, color);
  });
  g.add(trunks, pineMesh, ...crownMeshes);
}
