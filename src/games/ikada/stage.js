// いかだレース の会場「朝もやの森の川」。
//
// 川(course.js)の曲がり具合を積み上げて、森の中を流れる川を作る。水面は流れる模様(画面側で動かす)。
// 急流は白くあわだつ。小さな滝では水面が段になって落ちる。岸は草とこけ、まわりは緑の森。
// 木の根のトンネル(大きな根が川の上にアーチになる)、ゴールはビーバーのダムの水門。
//
// 座標: スタートの川のまん中が原点。進む向きのはじめは -z。右が +x。y は水面の高さ(下っていく)。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { buildForestTrees, foliageClump, makeRand } from '../daruma/trees.js';
import { FALLS, LENGTH, POND_END, ROCKS, TUNNEL, WHIRLS, currentAt, curvatureAt, halfWidthAt, heightAt } from './course.js';

const STEP_S = 0.5;
const FROM = -30, TO = POND_END + 30;

// ── 川の形: 曲がり具合を積み上げる ──────────────────────
const samples = []; // { s, x, y, z, th }
{
  let th = 0, x = 0, z = 0;
  for (let s = FROM; s < 0; s += STEP_S) samples.push({ s, x: 0, y: heightAt(0), z: -s, th: 0 });
  for (let s = 0; s <= TO; s += STEP_S) {
    samples.push({ s, x, y: heightAt(Math.min(s, POND_END)), z, th });
    th += curvatureAt(s) * STEP_S;
    x += Math.sin(th) * STEP_S;
    z -= Math.cos(th) * STEP_S;
  }
}
function sampleAt(s) {
  const f = (Math.min(TO, Math.max(FROM, s)) - FROM) / STEP_S;
  const i = Math.min(samples.length - 2, Math.floor(f));
  const a = samples[i], b = samples[i + 1], t = f - i;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, th: a.th + (b.th - a.th) * t };
}
// 川にそった座標 (s, x) → 世界の位置。h は水面からの高さ
export function coursePoint(s, x, h = 0, out = new THREE.Vector3()) {
  const p = sampleAt(s);
  return out.set(p.x + Math.cos(p.th) * x, p.y + h, p.z + Math.sin(p.th) * x);
}
export function courseHeading(s) {
  const p = sampleAt(s);
  // 水面の傾き(滝では前へ大きく傾く)
  const slope = Math.atan2(sampleAt(s - 0.5).y - sampleAt(s + 0.5).y, 1);
  return { th: p.th, yaw: Math.PI - p.th, slope };
}

// ── 水面の絵: 流れのすじ(画面側で offset を動かして流す) ──────────
function waterTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  const rand = makeRand(31);
  // 流れにそった、うすい光のすじ
  for (let i = 0; i < 70; i++) {
    const x = rand() * S, y = rand() * S, len = 20 + rand() * 50;
    g.strokeStyle = `rgba(255,255,255,${0.5 + rand() * 0.5})`;
    g.fillStyle = 'transparent';
    g.lineWidth = 1.5 + rand() * 2.5;
    g.globalCompositeOperation = 'source-over';
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + (rand() - 0.5) * 8, y + len * 0.3, x + (rand() - 0.5) * 8, y + len * 0.6, x + (rand() - 0.5) * 6, y + len);
    g.stroke();
  }
  // 地の色のゆらぎ(白地に、ほんの少し暗いところ)
  for (let i = 0; i < 40; i++) {
    const x = rand() * S, y = rand() * S, r = 10 + rand() * 30;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(200,215,220,0.35)');
    grd.addColorStop(1, 'rgba(200,215,220,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // すじを明るく(白地の上に、少し青白い地を重ねて、すじだけ白く残す)
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // 白いほど すじ。地は少し暗く
    const k = d[i] / 255;
    const v = 0.78 + 0.22 * Math.pow(k, 6);
    d[i] = d[i + 1] = d[i + 2] = v * 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 水面: 川のはば + 少し岸の下まで。急流と滝のまわりは白くあわだつ(頂点の色)
function buildWater(g) {
  const across = [-1.12, -1, -0.7, -0.35, 0, 0.35, 0.7, 1, 1.12];
  const pos = [], uv = [], col = [], idx = [];
  const ROW = across.length;
  const deep = new THREE.Color(0x3f8f8a), mid = new THREE.Color(0x5fb3a6), foam = new THREE.Color(0xf4fbf8);
  const c = new THREE.Color();
  for (let s = FROM; s <= TO; s += 0.5) {
    const hw = halfWidthAt(Math.min(s, POND_END));
    const fast = Math.max(0, (currentAt(s) - 2.2) / 2.6);
    let fall = 0;
    for (const f of FALLS) fall = Math.max(fall, s > f.s ? 1 - Math.min(1, (s - f.s - 0.8) ** 2 / 9) : 0);
    for (const u of across) {
      const p = coursePoint(s, u * hw, 0);
      pos.push(p.x, p.y, p.z);
      uv.push(u * hw / 4, s / 4);
      // まん中ほど深い色。ふちは明るく。急流・滝は白く
      c.copy(deep).lerp(mid, Math.min(1, Math.abs(u) * 0.9));
      c.lerp(foam, Math.min(0.8, fast * 0.4 + fall * 0.6 * (0.6 + 0.4 * Math.abs(Math.sin(s * 3.1 + u * 7)))));
      col.push(c.r, c.g, c.b);
    }
  }
  const rows = pos.length / 3 / ROW;
  for (let r = 0; r < rows - 1; r++) {
    for (let k = 0; k < ROW - 1; k++) {
      const a = r * ROW + k, b = a + 1, cc = a + ROW, d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const map = waterTexture();
  const m = new THREE.MeshToonMaterial({ map, vertexColors: true, gradientMap: toonGradient, transparent: true, opacity: 0.92 });
  const mesh = new THREE.Mesh(geo, m);
  mesh.name = 'water';
  mesh.receiveShadow = true;
  mesh.userData.noMerge = true;
  g.add(mesh);
  return { mesh, map };
}

// 川底(水がうすく透けて見える): 水面の少し下に、こい色の帯
function buildBed(g) {
  const pos = [], idx = [], col = [];
  const across = [-1.1, -0.6, 0, 0.6, 1.1];
  const c = new THREE.Color();
  for (let s = FROM; s <= TO; s += 1) {
    const hw = halfWidthAt(Math.min(s, POND_END));
    for (const u of across) {
      const p = coursePoint(s, u * hw, -0.6 + Math.abs(u) * 0.35);
      pos.push(p.x, p.y, p.z);
      c.setHSL(0.36, 0.35, 0.22 + Math.abs(u) * 0.08);
      col.push(c.r, c.g, c.b);
    }
  }
  const ROW = across.length, rows = pos.length / 3 / ROW;
  for (let r = 0; r < rows - 1; r++) for (let k = 0; k < ROW - 1; k++) { const a = r * ROW + k; idx.push(a, a + 1, a + ROW, a + 1, a + ROW + 1, a + ROW); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient });
  g.add(new THREE.Mesh(geo, m));
}

// 岸と、まわりの森の地面。川のすぐわきは こけの土手、はなれると森の地面
const groundPts = samples.filter((_, i) => i % 4 === 0);
export function ground(x, z) {
  let wsum = 0, ysum = 0, best = Infinity, near = groundPts[0];
  for (const p of groundPts) {
    const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d2 < best) { best = d2; near = p; }
    const q = d2 + 16;
    const w = 1 / (q * Math.sqrt(q));
    wsum += w;
    ysum += p.y * w;
  }
  const d0 = Math.sqrt(best);
  const hw = halfWidthAt(Math.min(near.s, POND_END));
  // 川の中は水面の下、岸から上がって、森は少し高い
  const bank = Math.min(1, Math.max(0, (d0 - hw + 0.3) / 1.4));
  let y = ysum / wsum - 0.8 + bank * 1.5 + Math.max(0, d0 - hw - 2) * 0.05 + Math.sin(x * 0.11) * Math.sin(z * 0.09) * Math.min(2, Math.max(0, d0 - hw - 4) * 0.1);
  return { y, d0, hw, near };
}
function buildTerrain(g) {
  const minX = Math.min(...samples.map((p) => p.x)) - 60, maxX = Math.max(...samples.map((p) => p.x)) + 60;
  const minZ = Math.min(...samples.map((p) => p.z)) - 60, maxZ = Math.max(...samples.map((p) => p.z)) + 60;
  const nx = 170, nz = 200;
  const geo = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const pos = geo.attributes.position;
  const col = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const { y, d0, hw } = ground(x, z);
    pos.setY(i, y);
    const patch = Math.sin(x * 0.23 + Math.sin(z * 0.11) * 2) * Math.sin(z * 0.19 + x * 0.07);
    const edge = d0 - hw;
    if (edge < 0.4) c.setHSL(0.1, 0.25, 0.32); // 水ぎわの ぬれた土
    else if (edge < 2.2) c.setHSL(0.27 + patch * 0.02, 0.45, 0.33 + patch * 0.04); // こけの土手
    else c.setHSL(0.24 + patch * 0.04, 0.42, 0.36 + patch * 0.06); // 森の下草
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient });
  const mesh = new THREE.Mesh(geo, m);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  g.add(mesh);
}

// 森: 川の両がわに、広葉樹と針葉樹。川のすぐわきは あけて、カメラが葉に入らないように
function buildForest(g) {
  const rand = makeRand(71);
  const spots = [];
  for (let s = FROM + 5; s < TO - 5; s += 2.0) {
    for (const side of [-1, 1]) {
      if (rand() < 0.2) continue;
      const hw = halfWidthAt(Math.min(s, POND_END));
      const off = hw + 4 + Math.pow(rand(), 1.4) * 26;
      const p = coursePoint(s, side * off);
      // 川のほかのところに近すぎない
      if (samples.some((q) => Math.abs(q.s - s) > 12 && (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < (halfWidthAt(Math.min(q.s, POND_END)) + 3.5) ** 2)) continue;
      const gy = ground(p.x, p.z).y;
      spots.push({ x: p.x, y: gy, z: p.z, h: (5 + rand() * 6) * (off < hw + 8 ? 0.8 : 1), kind: rand() < 0.35 ? 'pine' : 'broad' });
    }
  }
  buildForestTrees(g, spots);
}

// 岸の しだ・草むら・石(にぎやかに)
function buildBankDecor(g) {
  const rand = makeRand(17);
  const fernMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient });
  const bush = foliageClump(rand, { detail: 1, balls: 3, bottom: 0x2f6b35, top: 0x7fc05a });
  const stoneGeo = new THREE.DodecahedronGeometry(0.5, 0);
  const n = 220;
  const bushes = new THREE.InstancedMesh(bush, fernMat, n);
  const stones = new THREE.InstancedMesh(stoneGeo, toonMaterial(0x8e9488), n);
  const dummy = new THREE.Object3D();
  let nb = 0, ns = 0;
  for (let i = 0; i < n * 2; i++) {
    const s = FROM + rand() * (TO - FROM);
    const side = rand() < 0.5 ? -1 : 1;
    const hw = halfWidthAt(Math.min(s, POND_END));
    const off = hw + 0.4 + rand() * 3;
    const p = coursePoint(s, side * off);
    if (samples.some((q) => Math.abs(q.s - s) > 10 && (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < (halfWidthAt(Math.min(q.s, POND_END)) + 0.5) ** 2)) continue;
    p.y = ground(p.x, p.z).y;
    dummy.position.copy(p);
    dummy.rotation.set(rand() * 0.4, rand() * 6, rand() * 0.4);
    if (rand() < 0.6 && nb < n) {
      const k = 0.35 + rand() * 0.5;
      dummy.scale.set(k, k * 0.7, k);
      dummy.updateMatrix();
      bushes.setMatrixAt(nb++, dummy.matrix);
    } else if (ns < n) {
      const k = 0.3 + rand() * 0.6;
      dummy.scale.set(k * 1.2, k * 0.7, k);
      dummy.updateMatrix();
      stones.setMatrixAt(ns++, dummy.matrix);
    }
  }
  bushes.count = nb; stones.count = ns;
  bushes.castShadow = stones.castShadow = true;
  g.add(bushes, stones);
}

// 川の中の岩(こけが上に乗っている)
function buildRocks(g) {
  const rand = makeRand(5);
  for (const k of ROCKS) {
    const geo = new THREE.DodecahedronGeometry(1, 1);
    const p = geo.attributes.position;
    const cols = [];
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      v.multiplyScalar(1 + (rand() - 0.5) * 0.18);
      p.setXYZ(i, v.x, v.y, v.z);
      // 上はこけ、下は ぬれた灰色
      if (v.y > 0.45) c.setHSL(0.27, 0.45, 0.4); else c.setHSL(0.1, 0.06, 0.42 + v.y * 0.08);
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient }));
    m.position.copy(coursePoint(k.s, k.x, 0.05));
    m.scale.set(k.r * 1.05, k.r * 0.75, k.r * 1.05);
    m.rotation.y = rand() * 6;
    m.castShadow = true;
    g.add(m);
  }
}

// 木の根のトンネル: 大きな根が川の上にアーチになる。根はでこぼこで、根もとほど太く、両はしは岸の土へもぐる。
// 上の面には こけ(頂点の色)、たれさがる つる、根のわきに ほんのり光る小さなキノコ
function rootGeometry(curve, r0, r1, rand) {
  const tube = new THREE.TubeGeometry(curve, 40, 1, 8, false);
  const p = tube.attributes.position, n = tube.attributes.normal;
  const cols = [];
  const c = new THREE.Color();
  const center = new THREE.Vector3(), v = new THREE.Vector3(), nn = new THREE.Vector3();
  const segs = 40, radial = 8;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, center);
    // 両はし(根もと)が太く、まん中が細い。こぶも少し
    const r = r1 + (r0 - r1) * Math.abs(t * 2 - 1) ** 1.5 + Math.max(0, Math.sin(t * 23 + r0 * 9)) * 0.08;
    for (let k = 0; k <= radial; k++) {
      const idx = i * (radial + 1) + k;
      v.fromBufferAttribute(p, idx).sub(center).normalize();
      nn.fromBufferAttribute(n, idx);
      p.setXYZ(idx, center.x + v.x * r, center.y + v.y * r, center.z + v.z * r);
      // 上を向いているところは こけ、ほかは木の皮(すじ)
      const stripe = Math.sin(t * 90 + k * 1.7) * 0.5 + 0.5;
      if (nn.y > 0.55) c.setHSL(0.27, 0.45, 0.32 + stripe * 0.06);
      else c.setHSL(0.07, 0.38, 0.2 + stripe * 0.08 + (rand() - 0.5) * 0.02);
      cols.push(c.r, c.g, c.b);
    }
  }
  tube.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  tube.computeVertexNormals();
  return tube;
}
function buildTunnel(g) {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient });
  const mossMat = toonMaterial(0x5e9a48);
  const leafMat = toonMaterial(0x6fb04f);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xbff7e8 });
  const capMat = new THREE.MeshBasicMaterial({ color: 0x8fe8d0 });
  const rand = makeRand(23);
  for (let s = TUNNEL.from; s <= TUNNEL.to; s += 2.2 + rand() * 1.4) {
    const hw = halfWidthAt(s) + 1.4;
    const lean = (rand() - 0.5) * 1.6; // 少し前うしろへ ねじれる
    const top = 3.3 + rand() * 0.8;
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const a = t * Math.PI;
      // 両はしは土の下まで(-1.2)。まん中は高く、少しでこぼこ
      const x = -Math.cos(a) * (hw + (t < 0.15 || t > 0.85 ? 0.6 : 0));
      const h = Math.sin(a) * top - 1.2 * (1 - Math.sin(a)) + Math.sin(t * 11 + s) * 0.15;
      pts.push(coursePoint(s + Math.sin(a) * lean + Math.sin(t * 7 + s) * 0.25, x, h));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    g.add(new THREE.Mesh(rootGeometry(curve, 0.62 + rand() * 0.2, 0.26 + rand() * 0.1, rand), mat));
    // 細い わき根(となりへ からまる)
    if (rand() < 0.7) {
      const side = rand() < 0.5 ? -1 : 1;
      const sub = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        sub.push(coursePoint(s + t * 1.6, side * (hw - t * 1.5), Math.sin(t * Math.PI) * 1.4 - 1 + t * 1.6));
      }
      g.add(new THREE.Mesh(rootGeometry(new THREE.CatmullRomCurve3(sub), 0.26, 0.1, rand), mat));
    }
    // たれさがる つる(先に葉っぱ)
    for (let k = 0; k < 4; k++) {
      const t = 0.28 + rand() * 0.44;
      const p = curve.getPointAt(t);
      const len = 0.6 + rand() * 1.3;
      const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, len, 4), mossMat);
      vine.position.set(p.x, p.y - 0.25 - len / 2, p.z);
      g.add(vine);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), leafMat);
      leaf.scale.set(1.4, 0.4, 0.9);
      leaf.position.set(p.x, p.y - 0.25 - len, p.z);
      g.add(leaf);
    }
    // 根もとの光るキノコ
    for (const side of [-1, 1]) {
      if (rand() < 0.4) continue;
      const base = coursePoint(s + (rand() - 0.5), side * (hw - 0.9), 0.2);
      for (let k = 0; k < 3; k++) {
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.16, 5), glowMat);
        const cp = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
        const off = new THREE.Vector3((rand() - 0.5) * 0.4, 0, (rand() - 0.5) * 0.4);
        st.position.copy(base).add(off);
        cp.position.copy(st.position);
        cp.position.y += 0.08;
        g.add(st, cp);
      }
    }
  }
}

// うず: 水面に、うずまきの模様(画面側でまわす)
function swirlTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  for (let arm = 0; arm < 3; arm++) {
    g.beginPath();
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      const a = arm * (Math.PI * 2 / 3) + t * Math.PI * 3.2;
      const r = t * S * 0.48;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 7;
    g.stroke();
  }
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.2);
  grd.addColorStop(0, 'rgba(20,60,70,0.7)');
  grd.addColorStop(1, 'rgba(20,60,70,0)');
  g.fillStyle = grd;
  g.fillRect(-S / 2, -S / 2, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function buildWhirls(g) {
  const tex = swirlTexture();
  return WHIRLS.map((w) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(w.R, 32), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(coursePoint(w.s, w.x, 0.03));
    m.userData.noMerge = true;
    g.add(m);
    return m;
  });
}

// 滝: 落ち口の両わきに、こけの岩を積む(水のカーテン・あわ・しぶきは scenery.js)
function buildFalls(g) {
  const rand = makeRand(61);
  for (const f of FALLS) {
    const hw = halfWidthAt(f.s);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const geo = new THREE.DodecahedronGeometry(1, 1);
        const p = geo.attributes.position;
        const cols = [];
        const c = new THREE.Color();
        for (let i = 0; i < p.count; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(p, i).multiplyScalar(1 + (rand() - 0.5) * 0.25);
          p.setXYZ(i, v.x, v.y, v.z);
          if (v.y > 0.4) c.setHSL(0.27, 0.42, 0.38); else c.setHSL(0.1, 0.05, 0.45 + v.y * 0.06);
          cols.push(c.r, c.g, c.b);
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        geo.computeVertexNormals();
        const r = 0.5 + rand() * 0.45;
        const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient }));
        m.position.copy(coursePoint(f.s + (k - 1.5) * 0.7, side * (hw + 0.2 + rand() * 0.6), -f.drop * (k / 3) * 0.8 + 0.1));
        m.scale.set(r * 1.1, r * 0.8, r);
        m.rotation.y = rand() * 6;
        m.castShadow = true;
        g.add(m);
      }
    }
  }
}

// 看板(木の板に字)
function sign(text, color = '#7a4a1c') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = '#e8c48a';
  x.fillRect(0, 0, 512, 160);
  x.strokeStyle = '#a0723c';
  x.lineWidth = 10;
  x.strokeRect(5, 5, 502, 150);
  x.fillStyle = color;
  x.font = '900 88px "M PLUS Rounded 1c", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 256, 84);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// スタートの桟橋と門
function buildStart(g) {
  const wood = toonMaterial(0x9a6a3e);
  const hw = halfWidthAt(0);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 5.6, 8), wood);
    post.position.copy(coursePoint(-1, side * (hw + 0.5), 2.1));
    g.add(post);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.6, 0.9, 0.15), new THREE.MeshToonMaterial({ map: sign('スタート'), gradientMap: toonGradient }));
  bar.position.copy(coursePoint(-1, 0, 4.7)); // カメラ(高さ 3.4)より上に
  bar.rotation.y = courseHeading(-1).yaw + Math.PI;
  g.add(bar);
  // うしろの桟橋
  const deck = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 3, 0.2, 5), wood);
  deck.position.copy(coursePoint(-9, 0, 0.1));
  g.add(deck);
}

// ゴール: ビーバーのダム(丸太と枝を積んだかべ)と、水門の門。旗とちょうちん
function buildGoal(g) {
  const hw = halfWidthAt(LENGTH);
  const wood = toonMaterial(0x8a5a32);
  const dark = toonMaterial(0x5e3a1c);
  // 水門の門(ゴールの線)
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 5, 8), wood);
    post.position.copy(coursePoint(LENGTH, side * (hw + 0.4), 1.8));
    g.add(post);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.6, 1.0, 0.18), new THREE.MeshToonMaterial({ map: sign('ゴール', '#c0392b'), gradientMap: toonGradient }));
  bar.position.copy(coursePoint(LENGTH, 0, 3.9));
  bar.rotation.y = courseHeading(LENGTH).yaw + Math.PI;
  g.add(bar);
  // 旗
  const rand = makeRand(3);
  const colors = [0xff5a4e, 0xffd24a, 0x5ab0ff, 0x7bd158, 0xff9ad5];
  for (let i = 0; i < 9; i++) {
    const x = -hw - 0.2 + (i / 8) * (hw * 2 + 0.4);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 3), toonMaterial(colors[i % colors.length]));
    f.position.copy(coursePoint(LENGTH, x, 3.2 - Math.sin((i / 8) * Math.PI) * 0.2));
    f.rotation.z = Math.PI;
    g.add(f);
  }
  // ダムのかべ: 丸太をよこに積む(池のおわり)
  const dhw = halfWidthAt(POND_END) + 2.5;
  for (let row = 0; row < 4; row++) {
    for (let k = -3; k <= 3; k++) {
      const len = 2.4 + rand() * 1.4;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, len, 7), rand() < 0.5 ? wood : dark);
      log.rotation.z = Math.PI / 2;
      log.position.copy(coursePoint(POND_END + row * 0.25, (k / 3) * dhw * 0.85 + (row % 2) * 0.6, -0.2 + row * 0.42));
      log.rotation.y = courseHeading(POND_END).yaw + Math.PI / 2 + (rand() - 0.5) * 0.25;
      g.add(log);
    }
  }
  // 枝のつきさし
  for (let i = 0; i < 26; i++) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.4 + rand(), 5), dark);
    st.position.copy(coursePoint(POND_END + 0.6, (rand() - 0.5) * dhw * 2, 1.4));
    st.rotation.set((rand() - 0.5) * 0.8, 0, (rand() - 0.5) * 0.9);
    g.add(st);
  }
  // 水門: まん中にあいている口から、水が少し流れ落ちる(白い板)
  const gate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 0.2), new THREE.MeshToonMaterial({ color: 0xeaf6f4, gradientMap: toonGradient, transparent: true, opacity: 0.8 }));
  gate.position.copy(coursePoint(POND_END + 0.3, 0, 0.5));
  gate.rotation.y = courseHeading(POND_END).yaw;
  g.add(gate);
}

// 水門の扉: 門の柱から まん中まで、板を組んだ扉が左右に1枚ずつ。いちばんの子が近づくと、下流へ ぎいっと開く
function buildDoors(g) {
  const hw = halfWidthAt(LENGTH);
  const head = courseHeading(LENGTH);
  const plank = toonMaterial(0x9a6a3e), frame = toonMaterial(0x6b4a30);
  return [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.copy(coursePoint(LENGTH, side * (hw + 0.25), 0));
    pivot.rotation.y = head.yaw + Math.PI;
    const door = new THREE.Group();
    const w = hw + 0.2;
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.26, 0.1), plank);
      b.position.set(-side * w / 2, 0.15 + k * 0.29, 0);
      door.add(b);
    }
    const brace = new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, 0.1, 0.12), frame);
    brace.rotation.z = side * 0.55;
    brace.position.set(-side * w / 2, 0.6, 0.04);
    door.add(brace);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), toonMaterial(0xffd24a));
    knob.position.set(-side * (w - 0.15), 0.65, 0.08);
    door.add(knob);
    door.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    pivot.add(door);
    pivot.userData = { side, open: 0 };
    g.add(pivot);
    return pivot;
  });
}

// 観客の席: ゴールのわきの岸(切り株)
export const SEATS = [
  { s: LENGTH - 6, x: -1, kind: 'risu' },
  { s: LENGTH - 3, x: -1, kind: 'harinezumi' },
  { s: LENGTH + 2, x: -1, kind: 'komadori' },
  { s: LENGTH - 5, x: 1, kind: 'harinezumi' },
  { s: LENGTH - 1, x: 1, kind: 'risu' },
  { s: LENGTH + 4, x: 1, kind: 'komadori' },
];
export function seatPoint(seat, out = new THREE.Vector3()) {
  const hw = halfWidthAt(seat.s);
  coursePoint(seat.s, seat.x * (hw + 1.6), 0, out);
  out.y = ground(out.x, out.z).y + 0.4;
  return out;
}
function buildSeats(g) {
  for (const seat of SEATS) {
    const p = seatPoint(seat);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.5, 12), toonMaterial(0x9a6a3e));
    st.position.set(p.x, p.y - 0.2, p.z);
    g.add(st);
  }
}

export function buildStage(scene) {
  const g = new THREE.Group();
  buildTerrain(g);
  buildBed(g);
  buildForest(g);
  buildBankDecor(g);
  buildRocks(g);
  buildTunnel(g);
  buildFalls(g);
  buildStart(g);
  buildGoal(g);
  buildSeats(g);
  mergeStatic(g);
  // 動くもの(水面・うず)は、まとめたあとに足す
  const water = buildWater(g);
  const whirls = buildWhirls(g);
  const doors = buildDoors(g);
  scene.add(g);
  return { group: g, water, whirls, doors };
}
