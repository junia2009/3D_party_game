// タイトル画面の「空に浮かぶ小島」。
//
// 島の上は草地。まん中にどんぐりの大木、横に表彰台と万国旗(ドングリンピックの会場)。
// 島の下は地層の見える岩で、根っこが垂れ、ふちの池から小さな滝が流れ落ちる。
// まわりには小さな岩が浮かび、下には雲が流れる。
//
// 飾りの配置は固定のシードで作る(毎回同じ島になる)。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../runtime/models.js';
import { barkMaterial, buildOak, makeRand, taperedTube } from '../games/daruma/trees.js';
import { OAK, PERCH } from '../games/daruma/stage.js';
import { grassTexture, scatterFoliage } from '../games/daruma/ground.js';
import { mergeStatic } from '../runtime/merge.js';

export const ISLAND_R = 5.6;
const POND = { x: 3.3, z: -2.4, r: 0.85 };       // 池(ここから滝が落ちる)
const FALL_ANGLE = Math.atan2(POND.z, POND.x);   // 滝の落ちる向き
export const PODIUM = { x: 2.2, z: 0.6, yaw: -0.5 };

// 島の上の高さ(ふちに向かって少し丸く下がる)
export function islandHeight(x, z) {
  const r = Math.hypot(x, z) / ISLAND_R;
  const bump = Math.sin(x * 0.7) * Math.cos(z * 0.6) * 0.12;
  return r > 1 ? -1 : bump - Math.pow(Math.max(0, r - 0.75) / 0.25, 2) * 0.5;
}

const vcToon = () => new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient });

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

// ── 島の上(草地) ───────────────────────────────────
function topGeometry() {
  const rings = 26, segs = 96;
  const pos = [], uv = [], idx = [];
  const push = (x, z) => {
    pos.push(x, islandHeight(x * 0.999, z * 0.999), z);
    uv.push(x / 3, z / 3);
  };
  push(0, 0);
  for (let i = 1; i <= rings; i++) {
    const r = (i / rings) * ISLAND_R;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      push(Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = 1 + (i - 1) * segs + j, b = 1 + (i - 1) * segs + ((j + 1) % segs);
      idx.push(a, b, a + segs, b, b + segs, a + segs);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ── 島の下(岩) ───────────────────────────────────
// 下へすぼまるにんじん形。輪郭をでこぼこにして、地層の縞を色で入れる
function rockGeometry(rand) {
  const depth = 7.8;
  const g = new THREE.CylinderGeometry(1, 1, depth, 64, 26, true);
  g.translate(0, -depth / 2 - 0.42, 0);
  const p = g.attributes.position;
  const bands = [0x9a7552, 0x7d5b3f, 0xb08860, 0x6a4c36, 0x8c6a4a, 0x5e4433];
  const c = new THREE.Color();
  const colors = [];
  const ph = [rand() * 6, rand() * 6, rand() * 6];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const t = Math.min(1, (-y - 0.42) / depth); // 0 = 上、1 = いちばん下
    // 上は島の半径、下へ向かってすぼまる。ところどころ出っ張る
    let r = ISLAND_R * Math.pow(1 - t, 0.75) + 0.25 * (1 - t);
    r *= 1 + 0.1 * Math.sin(a * 5 + ph[0]) * (0.5 + t) + 0.07 * Math.sin(a * 11 + y * 1.3 + ph[1]) + 0.05 * Math.sin(a * 23 - y * 3 + ph[2]);
    if (t > 0.97) r *= 0.3;
    p.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r);
    // 地層: 少し波打つ横縞。下ほど暗い
    const band = Math.floor(((-y) * 1.4 + Math.sin(a * 3 + ph[0]) * 0.35) % bands.length);
    c.setHex(bands[(band + bands.length) % bands.length]).multiplyScalar(1 - t * 0.35);
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

// ── 滝 ─────────────────────────────────────────────
// 縞模様を下へ流し、下へ行くほど細く・薄くして消す
function waterfallMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uTime; varying vec2 vUv;
      float hash(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        float x = vUv.x, y = vUv.y;               // y: 1 = 上、0 = 下
        float lane = floor(x * 9.0);
        float speed = 0.9 + hash(lane) * 0.5;
        float s = fract((1.0 - y) * 3.0 - uTime * speed + hash(lane + 3.0));
        float streak = smoothstep(0.0, 0.25, s) * (1.0 - smoothstep(0.55, 1.0, s));
        vec3 col = mix(vec3(0.55, 0.82, 0.95), vec3(1.0), streak * 0.8);
        float edge = smoothstep(0.0, 0.18, x) * (1.0 - smoothstep(0.82, 1.0, x));
        float fade = smoothstep(0.0, 0.55, y);
        gl_FragColor = vec4(col, min(1.0, 0.75 + streak * 0.35) * edge * fade);
      }`,
  });
}

// ── 表彰台 ──────────────────────────────────────────
export function podiumTexture(n, medal) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#e9c98f';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 14; i++) {
    g.strokeStyle = `rgba(150, 105, 60, ${0.15 + Math.random() * 0.15})`;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 8 + i * 9);
    g.bezierCurveTo(40, 4 + i * 9, 80, 12 + i * 9, 128, 8 + i * 9);
    g.stroke();
  }
  // どんぐりのメダル
  g.fillStyle = medal;
  g.beginPath();
  g.arc(64, 64, 36, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(80, 50, 20, 0.6)';
  g.stroke();
  g.fillStyle = '#4a2e18';
  g.font = '800 46px "Dela Gothic One", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildPodium(g) {
  const podium = new THREE.Group();
  podium.position.set(PODIUM.x, islandHeight(PODIUM.x, PODIUM.z) - 0.05, PODIUM.z);
  podium.rotation.y = PODIUM.yaw;
  const steps = [
    { n: 2, x: -0.95, h: 0.55, medal: '#d9dde3' },
    { n: 1, x: 0, h: 0.85, medal: '#f2c14e' },
    { n: 3, x: 0.95, h: 0.4, medal: '#d08a52' },
  ];
  const side = toonMaterial(0xc99a62);
  for (const s of steps) {
    const front = toonMaterial(0xffffff);
    front.map = podiumTexture(s.n, s.medal);
    // 前の面だけ数字の板、ほかは木の色
    const mats = [side, side, toonMaterial(0xe2bd85), side, front, side];
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.92, s.h, 0.8), mats);
    b.position.set(s.x, s.h / 2, 0);
    podium.add(b);
  }
  g.add(podium);
  // 1位の台の上(ケロスケが立つ)
  const top = new THREE.Vector3(0, 0.85, 0).applyEuler(podium.rotation).add(podium.position);
  return { top };
}

// ── 万国旗 ──────────────────────────────────────────
const FLAG_COLORS = [0xff5a4e, 0xffc23c, 0x3d8bff, 0x34c47c, 0x9b6bff, 0xffffff, 0xff8fb0];
function buildBunting(g, from, to, sag) {
  const flags = [];
  const curve = new THREE.QuadraticBezierCurve3(from, from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, -sag, 0)), to);
  const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.018, 5), toonMaterial(0x6b4a2f));
  g.add(rope);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.2, 0, 0, 0.2, 0, 0, 0, -0.42, 0], 3));
  tri.computeVertexNormals();
  const n = 11;
  for (let i = 1; i < n; i++) {
    const p = curve.getPoint(i / n);
    const m = toonMaterial(FLAG_COLORS[i % FLAG_COLORS.length]);
    m.side = THREE.DoubleSide;
    const f = new THREE.Mesh(tri, m);
    f.position.copy(p);
    const tan = curve.getTangent(i / n);
    f.rotation.y = Math.atan2(-tan.z, tan.x);
    f.userData = { ph: i * 0.9, noMerge: true }; // 風で揺らすので、まとめない
    g.add(f);
    flags.push(f);
  }
  return flags;
}

// ── 小さな浮き岩 ─────────────────────────────────────
function miniIsland(rand, r) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.95, 0.22, 20), toonMaterial(0x86c46f));
  top.position.y = -0.11;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.97, 0.07, 6, 24), toonMaterial(0x6aa956));
  lip.rotation.x = Math.PI / 2;
  lip.position.y = -0.2;
  // 岩はでこぼこに(なめらかな円すいだと作り物に見える)
  const rockGeo = new THREE.ConeGeometry(r * 0.95, r * 2.4, 12, 5);
  const rp = rockGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
    const k = 1 + 0.18 * Math.sin(Math.atan2(z, x) * 4 + y * 3 + r);
    rp.setXYZ(i, x * k, y, z * k);
  }
  rockGeo.computeVertexNormals();
  const rock = new THREE.Mesh(rockGeo, toonMaterial(0x8a6a4c));
  rock.rotation.x = Math.PI;
  rock.position.y = -0.22 - r * 1.2;
  g.add(top, lip, rock);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const drip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2 + rand() * 0.2, 5), toonMaterial(0x6aa956));
    drip.rotation.x = Math.PI;
    drip.position.set(Math.cos(a) * r, -0.32, Math.sin(a) * r);
    g.add(drip);
  }
  // 小さな木か草
  if (rand() < 0.6) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.6, 6), toonMaterial(0x6b4c36));
    trunk.position.y = 0.3;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), toonMaterial(0x5fae55));
    crown.position.y = 0.75;
    g.add(trunk, crown);
  }
  return g;
}

// ── 雲 ─────────────────────────────────────────────
function cloudTexture() {
  const [c, g] = canvas(256, 128);
  const rand = makeRand(17);
  for (let i = 0; i < 20; i++) {
    const x = 40 + rand() * 176, y = 64 + (rand() - 0.5) * 34, r = 18 + rand() * 30;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}

export function buildIsland(scene) {
  const rand = makeRand(808);
  const g = new THREE.Group();
  g.name = 'island';

  // 上の草地
  const grass = toonMaterial(0x9bd785);
  grass.map = grassTexture();
  g.add(Object.assign(new THREE.Mesh(topGeometry(), grass), { name: 'islandTop' }));

  // 下の岩
  const rock = new THREE.Mesh(rockGeometry(rand), vcToon());
  rock.name = 'islandRock';
  g.add(rock);
  // 岩の先から垂れる、とがった岩
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2, d = 0.6 + rand() * 1.6;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.25 + rand() * 0.3, 1.2 + rand() * 1.6, 7), toonMaterial(0x6e5040));
    spike.rotation.x = Math.PI;
    spike.position.set(Math.cos(a) * d, -5.4 - rand() * 1.4 + d * 0.9, Math.sin(a) * d);
    g.add(spike);
  }

  // ふち: 草のへりと、垂れ下がるこけ
  const lip = new THREE.Mesh(new THREE.TorusGeometry(ISLAND_R - 0.05, 0.26, 8, 96), toonMaterial(0x7fbe68));
  lip.rotation.x = Math.PI / 2;
  lip.position.y = -0.47;
  g.add(lip);
  const mossMat = toonMaterial(0x6aa956);
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + rand() * 0.1;
    const len = 0.25 + rand() * 0.55;
    const drip = new THREE.Mesh(new THREE.ConeGeometry(0.12 + rand() * 0.1, len, 6), mossMat);
    drip.rotation.x = Math.PI;
    drip.position.set(Math.cos(a) * (ISLAND_R + 0.12), -0.55 - len / 2, Math.sin(a) * (ISLAND_R + 0.12));
    g.add(drip);
  }
  // 垂れ下がる根っこ
  const rootMat = barkMaterial(0x6b4c36, 1, 3);
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    if (Math.abs(((a - FALL_ANGLE + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.35) continue; // 滝の前はあける
    const r0 = ISLAND_R * (0.85 + rand() * 0.1);
    const len = 2 + rand() * 3;
    const pts = [0, 0.33, 0.66, 1].map((t) => new THREE.Vector3(
      Math.cos(a) * (r0 + 0.3 * Math.sin(t * 3)), -0.6 - t * len, Math.sin(a) * (r0 + 0.3 * Math.sin(t * 3))));
    g.add(new THREE.Mesh(taperedTube(pts, 0.09, 0.015, 6), rootMat));
  }

  // 池と滝
  const pondY = islandHeight(POND.x, POND.z);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7cc7e6 }));
  pond.position.set(POND.x, pondY + 0.03, POND.z);
  const pondRim = new THREE.Mesh(new THREE.TorusGeometry(POND.r, 0.1, 6, 28), toonMaterial(0xb7a98f));
  pondRim.rotation.x = Math.PI / 2;
  pondRim.position.copy(pond.position);
  g.add(pond, pondRim);
  for (let i = 0; i < 3; i++) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12, 0.3, Math.PI * 1.8).rotateX(-Math.PI / 2), toonMaterial(0x4f9a46));
    pad.position.set(POND.x + (rand() - 0.5) * 0.8, pondY + 0.045, POND.z + (rand() - 0.5) * 0.8);
    g.add(pad);
  }
  // 池からふちまでの小川
  const edge = new THREE.Vector3(Math.cos(FALL_ANGLE) * (ISLAND_R + 0.15), -0.45, Math.sin(FALL_ANGLE) * (ISLAND_R + 0.15));
  const stream = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8fd1ea }));
  const mid = new THREE.Vector3(POND.x, pondY, POND.z).lerp(edge, 0.5);
  stream.position.set(mid.x, Math.max(edge.y, pondY) + 0.02, mid.z);
  stream.scale.z = new THREE.Vector3(POND.x, 0, POND.z).distanceTo(new THREE.Vector3(edge.x, 0, edge.z));
  stream.rotation.y = -FALL_ANGLE + Math.PI / 2;
  g.add(stream);
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 9, 1, 12), waterfallMaterial());
  fall.geometry.translate(0, -4.5, 0);
  // 岩の面から少しはなし、下へ行くほど外へ弧を描くように曲げる
  const fp = fall.geometry.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const y = fp.getY(i);
    fp.setZ(i, 0.25 + Math.pow(-y / 9, 1.6) * 1.6);
  }
  fall.position.copy(edge);
  fall.rotation.y = -FALL_ANGLE + Math.PI / 2;
  g.add(fall);

  // どんぐりの大木(だるまさんのものを小さくして、島の奥に置く)
  const oakGroup = new THREE.Group();
  buildOak(oakGroup, OAK, PERCH);
  const scale = 0.42;
  oakGroup.scale.setScalar(scale);
  oakGroup.position.set(-1.4 - OAK.x * scale, 0, -2.2 - OAK.z * scale);
  g.add(oakGroup);
  const perch = PERCH.clone().multiplyScalar(scale).add(oakGroup.position);
  const trunkAt = new THREE.Vector3(-1.4, 0, -2.2);

  // 表彰台と万国旗(大木から、表彰台の横の柱まで)
  const podium = buildPodium(g);
  const poleAt = new THREE.Vector3(PODIUM.x + 1.6, 0, PODIUM.z - 1.2);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 8), toonMaterial(0x8a6247));
  pole.position.set(poleAt.x, islandHeight(poleAt.x, poleAt.z) + 1.6, poleAt.z);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), toonMaterial(0xf2c14e));
  knob.position.copy(pole.position).add(new THREE.Vector3(0, 1.65, 0));
  g.add(pole, knob);
  const flags = buildBunting(g, trunkAt.clone().add(new THREE.Vector3(0.55, 2.9, 0.4)), pole.position.clone().add(new THREE.Vector3(0, 1.45, 0)), 0.7);

  // 草・花・石(島の上だけ)
  const isFree = (x, z) => {
    const r = Math.hypot(x, z);
    if (r > ISLAND_R - 0.35) return false;
    if (Math.hypot(x - trunkAt.x, z - trunkAt.z) < 1.1) return false;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.2) return false;
    if (Math.hypot(x - PODIUM.x, z - PODIUM.z) < 1.6) return false;
    return true;
  };
  scatterFoliage(g, { isFree, heightAt: islandHeight, pathEdge: () => 0, pathFrom: 0, pathTo: 0 });

  // まわりに浮かぶ小さな岩
  const minis = [];
  for (const [a, d, y, r] of [[0.6, 14, 1.8, 0.65], [2.4, 16, -1.8, 0.45], [4.1, 15, 3.2, 0.55], [5.3, 17, -3.0, 0.75]]) {
    const m = miniIsland(rand, r);
    m.userData = { a, d, y, ph: rand() * 6 };
    g.add(m);
    minis.push(m);
  }

  // 島の下を流れる雲
  const cloudTex = cloudTexture();
  const clouds = [];
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.85 }));
    s.scale.set(9 + rand() * 6, 3.5 + rand() * 2, 1);
    s.userData = { a: (i / 10) * Math.PI * 2, d: 7 + rand() * 9, y: -6 - rand() * 6, sp: 0.02 + rand() * 0.03 };
    g.add(s);
    clouds.push(s);
  }

  mergeStatic(g, (o) => o.name === 'oakCrowns' || minis.includes(o) || o === fall || flags.includes(o));
  scene.add(g);

  return {
    group: g,
    perch,
    oakScale: scale,
    podiumTop: podium.top,
    update(dt, t) {
      fall.material.uniforms.uTime.value = t;
      for (const m of minis) {
        const u = m.userData;
        const a = u.a + t * 0.02;
        m.position.set(Math.cos(a) * u.d, u.y + Math.sin(t * 0.6 + u.ph) * 0.25, Math.sin(a) * u.d);
        m.rotation.y = t * 0.1 + u.ph;
      }
      for (const c of clouds) {
        const u = c.userData;
        const a = u.a + t * u.sp;
        c.position.set(Math.cos(a) * u.d, u.y, Math.sin(a) * u.d);
      }
      for (const f of flags) f.rotation.x = Math.sin(t * 3 + f.userData.ph) * 0.35;
    },
  };
}

// キャラの立ち位置と、することの割り当て
// 手前で手をふる・はねる、表彰台の上で王子が喜ぶ、まわりを2人が追いかけっこ
export const ROLES = [
  { key: 'ponta', x: -0.4, z: 2.8, act: 'wave', face: 'happy' },
  { key: 'gonzo', x: -2.7, z: 1.2, act: 'cheer', face: 'happy' },
  { key: 'kerosuke', podium: true, act: 'cheer', face: 'happy' },
  { key: 'penne', x: 0.9, z: 1.9, act: 'wave', face: 'happy' },
  { key: 'mimi', x: 0, z: 0, act: 'chase', lead: true },
  { key: 'konko', x: 0, z: 0, act: 'chase' },
];
