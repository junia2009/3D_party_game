// だるまさんがころんだ のステージ「どんぐりの森の広場」。
//
// いまはラフ(配置を決める段階)。形は単純な図形で置いて、
// コース・大木・観客席・森・谷と山の位置関係と、カメラからの見え方を確かめる。
// 作り込みはこの配置が決まってから。
//
// 配置の考え方:
// - 広場はなだらかな丘の上。奥(大木のうしろ)と右側は下り斜面で、谷と川・遠くの山並みが見える。
//   左側と手前は森。
// - 大木はコースの左奥に立ち、太い枝が道の真上まで張り出す。先生はその枝先にとまる。
//   カメラから見て先生のうしろが谷と空になり、シルエットがはっきり出る
//   (幹の真ん前にとまらせると、茶色どうしで埋もれた)。
//
// 座標: コースは -z 方向へ。スタート z = 0、ゴール z = -TRACK。レーン x = laneX(slot)。
// 広場(|x| < 9、-27 < z < 9)の地面は高さ 0。

import * as THREE from 'three';
import { toonMaterial } from '../../runtime/models.js';
import { LANES, TRACK } from './rules.js';
import { buildPath as buildDirtPath, dirtPatch, grassTexture, laneStones, leafLitter, scatterFoliage } from './ground.js';
import { buildForestTrees, buildOak as buildOakTree } from './trees.js';
import { mergeStatic } from '../../runtime/merge.js';

export const laneX = (slot) => (slot - (LANES - 1) / 2) * 1.15;
export const PATH_WIDTH = LANES * 1.15 + 0.9;

// 大木と先生の位置
export const OAK = { x: -6.2, z: -TRACK - 5.0, trunkR: 1.6 };
export const PERCH = new THREE.Vector3(0, 2.6, -TRACK - 1.9); // 先生がとまる枝の上

const mat = (color) => toonMaterial(color);
const SPHERE = new THREE.SphereGeometry(1, 20, 14);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 16);
const smooth = (t) => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

function blobMesh(color, sx, sy, sz) {
  const m = new THREE.Mesh(SPHERE, mat(color));
  m.scale.set(sx, sy, sz);
  return m;
}

// 2点を結ぶ円柱(枝・根)
function limb(material, from, to, r0, r1 = r0) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, dir.length(), 12), material);
  m.position.copy(from).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

// ── 地形 ───────────────────────────────────────────
// 丘の上の広場。奥と右は谷へ下る。左は森がゆるく上る。
export function groundHeight(x, z) {
  const back = smooth((-27 - z) / 30);   // 大木のうしろから下る
  const right = smooth((x - 9) / 32);    // 右側も下る
  const drop = -34 * Math.max(back, right * 0.95);
  const left = x < -10 ? Math.min(5, (-10 - x) * 0.12) : 0;
  // 広場の外だけ、ゆるくうねらせる
  const outside = smooth((Math.abs(x) - 8) / 4) + smooth((-26 - z) / 4) + smooth((z - 8) / 4);
  // 小道ぞい(スタートのうしろへ続く部分)は平らなまま。うねると道が地面に埋もれる
  const alongPath = z > 0 ? smooth((Math.abs(x) - 4) / 3) : 1;
  const wave = Math.min(1, outside) * alongPath * (Math.sin(x * 0.21) * 0.6 + Math.sin(z * 0.17 + 1.3) * 0.5);
  return drop + left + wave;
}

function buildTerrain(g) {
  const size = 420, seg = 120; // 2.6m ごとに1頂点。広場は平らなので、これで足りる
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(30, 0, -90);
  const pos = geo.attributes.position;
  const colors = [];
  const top = new THREE.Color(0x8fcf7a), forest = new THREE.Color(0x5f8f4e), valley = new THREE.Color(0x7aa86a);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = groundHeight(x, z);
    pos.setY(i, y);
    // 広場は明るい草、まわりの森の床は暗め、谷はまた明るく
    const inClearing = 1 - smooth((Math.hypot(x / 13, (z + 10) / 19) - 1) * 3);
    c.copy(forest).lerp(top, inClearing).lerp(valley, smooth(-y / 20));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const m = toonMaterial(0xffffff);
  m.vertexColors = true;
  m.map = grassTexture();
  m.map.repeat.set(size / 6, size / 6); // 6m ごとにくり返す
  g.add(new THREE.Mesh(geo, m));
}

// ── 小道 ───────────────────────────────────────────
const PATH_FROM = 16, PATH_TO = -TRACK - 3.5; // スタートのうしろは森の中へ続いていく
let pathEdge = () => PATH_WIDTH / 2;

function buildPath(g) {
  pathEdge = buildDirtPath(g, { width: PATH_WIDTH, from: PATH_FROM, to: PATH_TO, laneXs: Array.from({ length: LANES }, (_, i) => laneX(i)) });
  // 大木の根元とゴールのまわりは土が広く出ている
  dirtPatch(g, { x: -2.6, z: -TRACK - 3, rx: 7.5, rz: 4.2 });
  // レーンの区切り(小石の列)
  laneStones(g, Array.from({ length: LANES + 1 }, (_, i) => (i - LANES / 2) * 1.15), -0.3, -TRACK + 0.2);
  for (const z of [0, -TRACK]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(PATH_WIDTH - 0.4, 0.02, 0.12), mat(0xffffff));
    line.position.set(0, 0.02, z);
    g.add(line);
  }
}

// 草や石を置いてよい場所か(道・大木の根元・観客席・旗の柱を避ける)
function isFree(x, z) {
  if (z < PATH_FROM + 0.5 && z > PATH_TO - 0.5 && Math.abs(x) < pathEdge(z, Math.sign(x) || 1) + 0.05) return false;
  if (Math.hypot(x - OAK.x, z - OAK.z) < 3.4) return false;
  if (Math.hypot((x + 2.4) / 7, (z + TRACK + 2.6) / 3.6) < 1) return false;
  if (SEATS.some((s) => Math.hypot(x - s.x, z - s.z) < 0.7)) return false;
  if (Math.abs(z - 0.3) < 0.3 && Math.abs(Math.abs(x) - (PATH_WIDTH / 2 + 0.2)) < 0.3) return false;
  return groundHeight(x, z) > -4;
}

// ── スタートの旗とゴールのテープ ───────────────────────
function buildGates(g) {
  const half = PATH_WIDTH / 2 + 0.2;
  for (const s of [-1, 1]) {
    const pole = new THREE.Mesh(CYL, mat(0x8a6247));
    pole.scale.set(0.07, 2.4, 0.07);
    pole.position.set(s * half, 1.2, 0.3);
    g.add(pole);
  }
  for (let i = 0; i < 9; i++) {
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 3), mat([0xff5a4e, 0xffc23c, 0x3d8bff][i % 3]));
    flag.rotation.x = Math.PI;
    flag.position.set(-half + (i + 0.5) * ((half * 2) / 9), 2.1, 0.3);
    g.add(flag);
  }
  for (const s of [-1, 1]) {
    const stem = new THREE.Mesh(CYL, mat(0xf4ead8));
    stem.scale.set(0.12, 1.1, 0.12);
    stem.position.set(s * half, 0.55, -TRACK);
    const cap = blobMesh(0xe2483d, 0.35, 0.22, 0.35);
    cap.position.set(s * half, 1.15, -TRACK);
    g.add(stem, cap);
  }
  const tape = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.07, 0.03), mat(0xffffff));
  tape.position.set(0, 1.0, -TRACK);
  g.add(tape);
}

// ── どんぐりの大木 ─────────────────────────────────
function buildOak(g) {
  buildOakTree(g, OAK, PERCH);
  // 根元の落ち葉と、落ちたどんぐりの色の葉
  leafLitter(g, {
    count: 260,
    colors: [0xc98a3a, 0xa86a2c, 0xdcae4e, 0x8f6a3a, 0x7f8f3a],
    place: (rand) => {
      const a = rand() * Math.PI * 2, d = OAK.trunkR * 1.1 + Math.pow(rand(), 0.7) * 5.5;
      return [OAK.x + Math.cos(a) * d, 0, OAK.z + Math.sin(a) * d * 0.8];
    },
  });
}

// ── 観客席(切り株と根っこ) ───────────────────────────
export const SEATS = [
  { x: -4.6, z: -2.5 }, { x: 4.7, z: -4.0 }, { x: -4.9, z: -8.5 }, { x: 4.9, z: -10.0 },
  { x: -4.4, z: -14.5 }, { x: 4.6, z: -15.5 }, { x: 4.4, z: -20.5 },
];
function buildSeats(g) {
  const kinds = [0xd77a4a, 0x9a7f6a, 0xe1b84a, 0x6f5a52]; // 観客の仮の色(リス・ハリネズミ・コマドリ・モグラ)
  SEATS.forEach((seat, i) => {
    const stump = new THREE.Mesh(CYL, mat(0x9b7250));
    stump.scale.set(0.45, 0.5, 0.45);
    stump.position.set(seat.x, 0.25, seat.z);
    g.add(stump);
    const a = blobMesh(kinds[i % 4], 0.22, 0.3, 0.22);
    a.position.set(seat.x, 0.8, seat.z);
    g.add(a);
  });
}

// ── 森・谷・山 ─────────────────────────────────────
function buildForest(g, rand) {
  const spots = [];
  const add = (x, z, h) => spots.push({ x, y: groundHeight(x, z), z, h, kind: rand() < 0.3 ? 'pine' : 'broad' });
  // 左の森(大木のうしろまで)
  for (let i = 0; i < 170; i++) {
    const x = -8 - rand() * 50;
    const z = 14 - rand() * 60;
    if (x > -11 && z < -17 && z > -33) continue; // 大木のまわりはあける
    add(x, z, 4.5 + rand() * 5);
  }
  // 手前の森(カメラのうしろ)。小道の上はあける
  for (let i = 0; i < 90; i++) {
    const x = -30 + rand() * 60, z = 8 + rand() * 25;
    if (Math.abs(x) < 5) continue;
    add(x, z, 4.5 + rand() * 4);
  }
  // 右の斜面と奥の斜面: まばらに
  for (let i = 0; i < 40; i++) add(9 + rand() * 40, 6 - rand() * 50, 3.5 + rand() * 4);
  for (let i = 0; i < 30; i++) {
    const x = -20 + rand() * 40;
    if (Math.abs(x) < 9) continue; // 先生のうしろはあけておく(シルエットを谷と空に抜く)
    add(x, -30 - rand() * 25, 3.5 + rand() * 4);
  }
  // 谷の木立
  for (let i = 0; i < 200; i++) {
    const x = -60 + rand() * 200;
    const z = -40 - rand() * 110;
    if (groundHeight(x, z) > -20) continue;
    add(x, z, 3 + rand() * 3);
  }
  buildForestTrees(g, spots);
}

function buildRiver(g) {
  // 谷を左奥から右手前へ流れる川
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    pts.push(new THREE.Vector3(-90 + t * 230, 0, -120 + t * 80 + Math.sin(t * 9) * 10));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const width = 4.5;
  const positions = [];
  const idx = [];
  const N = 200;
  for (let i = 0; i <= N; i++) {
    const p = curve.getPoint(i / N);
    const tan = curve.getTangent(i / N);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize().multiplyScalar(width);
    for (const s of [-1, 1]) {
      const x = p.x + side.x * s, z = p.z + side.z * s;
      positions.push(x, Math.min(groundHeight(x, z), groundHeight(p.x, p.z)) + 0.3, z);
    }
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x8ccfe0, side: THREE.DoubleSide })));
}

function buildMountains(g, rand) {
  // 奥と右に連なる山並み(奥ほど空の色に近い)
  const ranges = [
    { r: 150, color: 0x86ab8f, h: [26, 40], n: 12 },
    { r: 190, color: 0x9dbcb6, h: [36, 55], n: 11 },
    { r: 235, color: 0xb6d0d3, h: [45, 70], n: 10 },
  ];
  for (const rg of ranges) {
    for (let i = 0; i < rg.n; i++) {
      // 正面(奥)から右へかけての扇形に並べる
      const a = -Math.PI / 2 - 0.9 + (i + rand() * 0.7) * (2.2 / rg.n);
      const x = Math.cos(a) * rg.r + 20, z = Math.sin(a) * rg.r - 20;
      const w = 30 + rand() * 25, h = rg.h[0] + rand() * (rg.h[1] - rg.h[0]);
      const m = new THREE.Mesh(SPHERE, new THREE.MeshBasicMaterial({ color: rg.color }));
      m.scale.set(w, h, 20);
      m.position.set(x, -40, z);
      m.lookAt(20, -40, -20);
      g.add(m);
    }
  }
}

// ── しかけ ─────────────────────────────────────────
function buildGimmicks(g, state) {
  const parts = { leaves: [], acorns: new Map() };
  state.lanes.forEach((lane, slot) => {
    const x = laneX(slot);
    const mud = new THREE.Mesh(new THREE.CircleGeometry(1, 28), mat(0x6b4a2f));
    mud.rotation.x = -Math.PI / 2;
    mud.scale.set(0.52, (lane.mud.to - lane.mud.from) / 2, 1);
    mud.position.set(x, 0.015, -(lane.mud.from + lane.mud.to) / 2);
    g.add(mud);
    const pile = blobMesh(0xd9822b, 0.5, 0.16, (lane.leaves.to - lane.leaves.from) / 2);
    pile.position.set(x, 0.02, -(lane.leaves.from + lane.leaves.to) / 2);
    g.add(pile);
    parts.leaves[slot] = pile;
    for (const a of lane.acorns) addAcorn(g, parts, slot, a);
  });
  return parts;
}
const ACORN_BODY = new THREE.SphereGeometry(0.09, 12, 10);
const ACORN_CAP = new THREE.SphereGeometry(0.095, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
function acornMesh() {
  const a = new THREE.Group();
  const body = new THREE.Mesh(ACORN_BODY, mat(0xb06a2c));
  body.scale.y = 1.25;
  const cap = new THREE.Mesh(ACORN_CAP, mat(0x6e4a2a));
  cap.position.y = 0.05;
  a.add(body, cap);
  return a;
}
function addAcorn(g, parts, slot, a) {
  const m = acornMesh();
  m.position.set(laneX(slot), 0.11, -a.x);
  m.rotation.z = 0.4;
  g.add(m);
  parts.acorns.set(a, m);
}

// ── 組み立て ───────────────────────────────────────
export function buildStage(scene) {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); // 飾りの配置用(毎回同じ森になる)
  const g = new THREE.Group();
  buildTerrain(g);
  buildPath(g);
  buildGates(g);
  buildOak(g);
  buildSeats(g);
  scatterFoliage(g, { isFree, heightAt: groundHeight, pathEdge, pathFrom: PATH_FROM, pathTo: PATH_TO });
  buildForest(g, rand);
  buildRiver(g);
  buildMountains(g, rand);
  mergeStatic(g); // 動かないものはまとめて描く
  scene.add(g);

  let gimmicks = null;
  let gimmickGroup = null;
  const drops = new Map(); // 落ちてくるどんぐり → { shadow, acorn }
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });

  return {
    group: g,
    // ゲームが始まるたびに、しかけを置き直す
    setGame(s) {
      if (gimmickGroup) scene.remove(gimmickGroup);
      gimmickGroup = new THREE.Group();
      scene.add(gimmickGroup);
      gimmicks = buildGimmicks(gimmickGroup, s);
      drops.clear();
    },
    onEvent(e, s) {
      if (!gimmicks) return;
      if (e.type === 'rustle') {
        gimmicks.leaves[e.slot].scale.y = 0.05; // ラフ: 散ったら平らに
      } else if (e.type === 'pickup') {
        for (const [a, m] of gimmicks.acorns) if (a.taken && m.parent) m.removeFromParent();
      } else if (e.type === 'dropWarn') {
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.35, 20), shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(laneX(e.lane), 0.03, -e.x);
        shadow.scale.setScalar(0.2);
        const acorn = acornMesh();
        acorn.scale.setScalar(1.6);
        gimmickGroup.add(shadow, acorn);
        drops.set(s.drops[s.drops.length - 1], { shadow, acorn, x: e.x, lane: e.lane });
      } else if (e.type === 'drop') {
        for (const [d, v] of drops) {
          if (d.left > 0) continue;
          v.shadow.removeFromParent();
          v.acorn.removeFromParent();
          drops.delete(d);
        }
        const lane = s.lanes[e.lane];
        const fell = lane.acorns.find((a) => a.fell && a.x === e.x && !gimmicks.acorns.has(a));
        if (fell) addAcorn(gimmickGroup, gimmicks, e.lane, fell);
      }
    },
    update(dt, s) {
      for (const [d, v] of drops) {
        const k = 1 - Math.max(0, d.left) / 0.8;
        v.shadow.scale.setScalar(0.3 + 0.7 * k);
        v.acorn.position.set(laneX(v.lane), 0.15 + (1 - k * k) * 7, -v.x);
      }
    },
  };
}
