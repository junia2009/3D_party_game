// 落ち葉そりレース の会場「紅葉の山道」。
//
// コース(course.js)の曲がり具合を積み上げて、山の斜面をくだる道を作る。
// 道は落ち葉のじゅうたん。両がわのふちは落ち葉の山(こするとめりこんで遅くなるところ)。
// まわりは赤・だいだい・黄の紅葉の木。わかれ道には、しげみと岩の島。
// スタートとゴールに木の門。ゴールのあとは平らな広場で、観客が待っている。
//
// 座標: スタートの道のまん中が原点。進む向きのはじめは -z。右が +x。下り坂なので y は下がっていく。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { foliageClump, makeRand } from '../daruma/trees.js';
import { ISLANDS, LENGTH, MUSHROOMS, curvatureAt, halfWidthAt } from './course.js';

const STEP_S = 0.5; // 道を区切る間隔(m)
const FROM = -40, TO = LENGTH + 60;
const GRADE = 0.17; // 坂のきつさ(1m 進むと何 m 下がるか)

// ── 道の形: 曲がり具合を積み上げる ──────────────────────
const samples = []; // { s, x, y, z, th }
{
  let th = 0, x = 0, z = 0;
  // スタートより手前は、まっすぐうしろへ伸ばす
  for (let s = FROM; s < 0; s += STEP_S) samples.push({ s, x: 0, y: heightAt(s), z: -s, th: 0 });
  for (let s = 0; s <= TO; s += STEP_S) {
    samples.push({ s, x, y: heightAt(s), z, th });
    th += curvatureAt(s) * STEP_S;
    x += Math.sin(th) * STEP_S;
    z -= Math.cos(th) * STEP_S;
  }
}
function heightAt(s) {
  // スタート前とゴールのあとは平ら。あいだは下り坂(まん中が少しきつい)
  const k = Math.min(LENGTH, Math.max(0, s));
  const drop = GRADE * k + Math.sin((k / LENGTH) * Math.PI) * 6;
  return -drop;
}
function sampleAt(s) {
  const f = (Math.min(TO, Math.max(FROM, s)) - FROM) / STEP_S;
  const i = Math.min(samples.length - 2, Math.floor(f));
  const a = samples[i], b = samples[i + 1], t = f - i;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, th: a.th + (b.th - a.th) * t };
}

// 道にそった座標 (s, x) → 世界の位置。h は道の面からの高さ
export function coursePoint(s, x, h = 0, out = new THREE.Vector3()) {
  const p = sampleAt(s);
  return out.set(p.x + Math.cos(p.th) * x, p.y + h, p.z + Math.sin(p.th) * x);
}
// 進む向き(水平)と、その角度(モデルの rotation.y に使う)
export function courseHeading(s) {
  const p = sampleAt(s);
  return { th: p.th, yaw: Math.PI - p.th, slope: Math.atan(GRADE) };
}

// ── 落ち葉のじゅうたん(道の面)の絵 ───────────────────────
function leafCarpet() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rand = makeRand(5);
  g.fillStyle = '#c9752e';
  g.fillRect(0, 0, S, S);
  const colors = ['#e0472b', '#f08a24', '#f6b93b', '#c4532a', '#a8432b', '#e8a03a', '#d86a2a', '#b88a3a'];
  for (let i = 0; i < 900; i++) {
    const x = rand() * S, y = rand() * S, r = 7 + rand() * 13, a = rand() * Math.PI * 2;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = colors[Math.floor(rand() * colors.length)];
    g.globalAlpha = 0.75 + rand() * 0.25;
    // もみじ形(5つのとがり)
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? r * 0.45 : r;
      const aa = (k / 10) * Math.PI * 2;
      g.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
    }
    g.closePath();
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// 道の面と、両がわの落ち葉の山(土手)を1枚の帯で作る。横の断面:
//   外 ← 土手の外すそ(地面) ← 土手の上 ← 道のふち ― 道 ― 道のふち → 土手の上 → 外すそ
function buildTrack(g) {
  // 0〜1 が道。外は土手(道の半幅を基準)。いちばん外(±2.6)は、地面の下へもぐる すそ(道が浮いて見えないように)
  const across = [-2.6, -1.9, -0.9, -0.15, 0, 0.25, 0.5, 0.75, 1, 1.15, 1.9, 3.6];
  const lift = (u) => (u < 0 || u > 1 ? 0 : 0); // 道の面は平ら
  const pos = [], uv = [], col = [], idx = [];
  const ROW = across.length;
  const rand = makeRand(9);
  const cRoad = new THREE.Color(0xffffff), cBank = new THREE.Color();
  for (let s = FROM; s <= TO; s += 1) {
    const hw = halfWidthAt(s);
    for (const u of across) {
      // u: 0 → 左のふち、1 → 右のふち。外がわは土手
      let x, h;
      if (u >= 0 && u <= 1) { x = -hw + u * hw * 2; h = lift(u); }
      else {
        const out = u < 0 ? -u : u - 1; // 0〜0.9(それより外は すそ)
        const side = u < 0 ? -1 : 1;
        if (out > 1) {
          x = side * (hw + 2.0);
          h = -2.2;
        } else {
          x = side * (hw + out * 1.8);
          h = Math.sin(Math.min(1, out / 0.45) * Math.PI * 0.5) * 0.55 * (out < 0.45 ? 1 : 1 - (out - 0.45) / 0.45 * 0.9) + (rand() - 0.5) * 0.06;
        }
      }
      const p = coursePoint(s, x, h);
      pos.push(p.x, p.y, p.z);
      uv.push(x / 3, s / 3);
      const bank = u < 0 || u > 1;
      if (bank) cBank.setHSL(0.03 + rand() * 0.07, 0.65, 0.4 + rand() * 0.12);
      const c = bank ? cBank : cRoad;
      col.push(c.r, c.g, c.b);
    }
  }
  const rows = pos.length / 3 / ROW;
  for (let r = 0; r < rows - 1; r++) {
    for (let k = 0; k < ROW - 1; k++) {
      const a = r * ROW + k, b = a + 1, c = a + ROW, d = c + 1;
      idx.push(a, b, c, b, d, c); // 上を向く向きで(逆だと、上から見て消えていた)
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.MeshToonMaterial({ map: leafCarpet(), vertexColors: true, gradientMap: toonGradient });
  const mesh = new THREE.Mesh(geo, m);
  mesh.name = 'track';
  g.add(mesh);
}

// 山肌の高さ。道のすべての点の高さを、距離で重みをつけて混ぜる(重みは距離の3乗に反比例)。
// 近い何点かだけで混ぜると、はなれた2本の道のちょうどまん中で高さが一気に切りかわって、壁になった。
// 道のすぐまわりは、道より少し低く(土手のすそがもぐる。低すぎると道のわきが溝に見える)
const groundPts = samples.filter((_, i) => i % 4 === 0);
function ground(x, z) {
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
  const hw = halfWidthAt(near.s);
  let y = ysum / wsum + Math.max(0, d0 - 12) * 0.07 + Math.sin(x * 0.09) * Math.sin(z * 0.08) * Math.min(3, Math.max(0, d0 - 10) * 0.1);
  y = Math.min(y, near.y - 0.35 + Math.max(0, d0 - hw - 1.8) * 0.45);
  return { y, d0 };
}

// まわりの山の斜面(高さは ground)
function buildTerrain(g) {
  const minX = Math.min(...samples.map((p) => p.x)) - 70, maxX = Math.max(...samples.map((p) => p.x)) + 70;
  const minZ = Math.min(...samples.map((p) => p.z)) - 70, maxZ = Math.max(...samples.map((p) => p.z)) + 70;
  const nx = 150, nz = 200;
  const geo = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const pos = geo.attributes.position;
  const col = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const { y, d0 } = ground(x, z);
    pos.setY(i, y);
    // 色: 落ち葉の絵を、場所ごとに少し暗く・赤く・茶色く。道より落ち着いた色にして、道を目立たせる
    const patch = Math.sin(x * 0.21 + Math.sin(z * 0.13) * 2) * Math.sin(z * 0.17 + x * 0.05);
    c.setHSL(0.02 + patch * 0.03, 0.32 + patch * 0.1, 0.4 + patch * 0.06);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const map = leafCarpet();
  map.repeat.set((maxX - minX) / 7, (maxZ - minZ) / 7);
  const m = new THREE.MeshToonMaterial({ map, vertexColors: true, gradientMap: toonGradient });
  const mesh = new THREE.Mesh(geo, m);
  mesh.name = 'terrain';
  g.add(mesh);
}

// 遠くの山なみ: 紅葉の山を2重にならべる(すその赤・中ほどのだいだい・てっぺんの岩)。
// 霧の届くところより遠いので、霧は切って、空の色(霧の色)を手で半分まぜる(奥の列ほど多く)
function buildMountains(g) {
  const rand = makeRand(99);
  const cx = (Math.min(...samples.map((p) => p.x)) + Math.max(...samples.map((p) => p.x))) / 2;
  const cz = (Math.min(...samples.map((p) => p.z)) + Math.max(...samples.map((p) => p.z))) / 2;
  const geo = new THREE.ConeGeometry(1, 1, 9, 4);
  geo.translate(0, 0.5, 0);
  const p = geo.attributes.position;
  const cols = [];
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i);
    if (t < 0.4) c.setHSL(0.015, 0.6, 0.36);
    else if (t < 0.8) c.setHSL(0.06, 0.7, 0.46);
    else c.setHSL(0.09, 0.45, 0.58);
    cols.push(c.r, c.g, c.b);
    // 少しでこぼこに
    if (t > 0.01 && t < 0.99) {
      const k = 1 + (rand() - 0.5) * 0.25;
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const mats = [0.3, 0.45].map((haze) => {
    const m = toonMaterial(0xffffff);
    m.vertexColors = true;
    m.fog = false;
    m.userData.haze = haze;
    return m;
  });
  const white = new THREE.Color(0xffffff);
  const n = 26;
  const dummy = new THREE.Object3D();
  for (let ring = 0; ring < 2; ring++) {
    const mat = mats[ring];
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.2 + ring * 0.12;
      const r = 430 + ring * 110 + rand() * 40;
      const h = 110 + rand() * 90 + ring * 60;
      dummy.position.set(cx + Math.cos(a) * r, -95, cz + Math.sin(a) * r);
      dummy.scale.set(130 + rand() * 70, h, 130 + rand() * 70);
      dummy.rotation.y = rand() * 6;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.frustumCulled = false;
    mesh.name = 'mountains';
    // 時間帯で霧の色が変わるので、描くたびに合わせる
    mesh.onBeforeRender = (_r, scene) => {
      if (scene.fog) mat.color.copy(white).lerp(scene.fog.color, mat.userData.haze);
    };
    g.add(mesh);
  }
}

// 紅葉の木: 幹 + 葉の塊。色は赤・だいだい・黄・少しだけ緑
function buildTrees(g) {
  const rand = makeRand(77);
  const spots = [];
  for (let s = FROM + 10; s < TO - 10; s += 2.2) {
    for (const side of [-1, 1]) {
      if (rand() < 0.25) continue;
      const hw = halfWidthAt(s);
      // 道のすぐわきの木は、追いかけるカメラが葉の中に入らないように、少し離して低めに
      const off = hw + 4.5 + Math.pow(rand(), 1.5) * 22;
      const p = coursePoint(s, side * off);
      p.y = ground(p.x, p.z).y - 0.2; // 根もとを山肌に合わせる(少しうめる)
      // 道のほかの部分(カーブの向こうがわ)に近すぎるところは置かない
      if (samples.some((q) => Math.abs(q.s - s) > 15 && (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < (halfWidthAt(q.s) + 3) ** 2)) continue;
      spots.push({ p, h: (4 + rand() * 4) * (off < hw + 8 ? 0.75 : 1) });
    }
  }
  const palettes = [[0x9a2a1a, 0xe8452c], [0xb4501a, 0xf39a2a], [0xb88a12, 0xf6cf3e], [0xa8381e, 0xf26b3a], [0x4f7a2a, 0x9cc85a]];
  const variants = palettes.map(([bottom, top]) => foliageClump(rand, { detail: 1, balls: 4, bottom, top }));
  const leafMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient });
  const crowns = variants.map((geo, k) => new THREE.InstancedMesh(geo, leafMat, spots.length));
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.16, 1, 7), toonMaterial(0x5a3a26), spots.length);
  const counts = variants.map(() => 0);
  const dummy = new THREE.Object3D();
  spots.forEach(({ p, h }, i) => {
    dummy.position.set(p.x, p.y + h * 0.3, p.z);
    dummy.rotation.set(0, rand() * 6, 0);
    dummy.scale.set(h * 0.9, h * 0.6, h * 0.9);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    const k = rand() < 0.08 ? 4 : Math.floor(rand() * 4);
    dummy.position.set(p.x, p.y + h * 0.72, p.z);
    dummy.scale.set(h * 0.32, h * 0.3 * (0.85 + rand() * 0.3), h * 0.32);
    dummy.updateMatrix();
    crowns[k].setMatrixAt(counts[k]++, dummy.matrix);
  });
  crowns.forEach((m, k) => { m.count = counts[k]; m.castShadow = true; g.add(m); });
  trunks.castShadow = true;
  g.add(trunks);
}

// わかれ道の島: しげみと岩
function buildIslands(g) {
  const rand = makeRand(88);
  const leafMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient });
  const bushGeo = foliageClump(rand, { detail: 1, balls: 3, bottom: 0x8a3a18, top: 0xe8862a });
  const rockMat = toonMaterial(0x8b8478);
  for (const isl of ISLANDS) {
    const mid = (isl.x0 + isl.x1) / 2, w = (isl.x1 - isl.x0) / 2;
    for (let s = isl.from + 0.5; s < isl.to; s += 1.6) {
      const p = coursePoint(s, mid + (rand() - 0.5) * w * 0.6, 0.3);
      const b = new THREE.Mesh(bushGeo, leafMat);
      b.position.copy(p);
      b.scale.setScalar(w * (0.85 + rand() * 0.3));
      b.rotation.y = rand() * 6;
      b.castShadow = true;
      g.add(b);
    }
    // はじまりと終わりに大きな岩(ここから分かれる、の目じるし)
    for (const s of [isl.from, isl.to]) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), rockMat);
      r.position.copy(coursePoint(s, mid, 0.3));
      r.scale.set(w * 0.9, 0.8, 1.1);
      r.castShadow = true;
      g.add(r);
    }
  }
}

// キノコのジャンプ台: 大きな赤いかさが、道に半分うまっている
function buildMushrooms(g) {
  const cap = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const capMat = toonMaterial(0xe2402f), dotMat = toonMaterial(0xfff4e0), rim = toonMaterial(0xf3e3c3);
  for (const m of MUSHROOMS) {
    const grp = new THREE.Group();
    const c = new THREE.Mesh(cap, capMat);
    c.scale.set(1.05, 0.42, 1.5);
    grp.add(c);
    const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 24), rim);
    band.rotation.x = Math.PI / 2;
    band.scale.set(1.05, 1.5, 1);
    grp.add(band);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.3, r = k === 0 ? 0 : 0.6;
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6), dotMat);
      d.scale.y = 0.4;
      const px = Math.cos(a) * r * 1.05, pz = Math.sin(a) * r * 1.5;
      d.position.set(px, 0.42 * Math.sqrt(Math.max(0, 1 - (px / 1.05) ** 2 - (pz / 1.5) ** 2)) + 0.01, pz);
      grp.add(d);
    }
    grp.position.copy(coursePoint(m.s, m.x));
    grp.rotation.y = courseHeading(m.s).yaw;
    grp.traverse((o) => { o.castShadow = true; });
    g.add(grp);
  }
}

// 木の門(スタート・ゴール)。看板の字は canvas に書く
function sign(text, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#7a4a24';
  g.beginPath();
  g.roundRect(4, 4, 504, 120, 26);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(14, 14, 484, 100, 20);
  g.fill();
  g.font = '400 78px "Dela Gothic One", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 12;
  g.strokeStyle = '#4a2a12';
  g.strokeText(text, 256, 68);
  g.fillStyle = '#fff6e0';
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function buildGate(g, s, text, color) {
  const hw = halfWidthAt(s) + 0.8;
  const wood = toonMaterial(0x8a5a32);
  const grp = new THREE.Group();
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 4.2, 10), wood);
    post.position.set(side * hw, 2.1, 0);
    grp.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.8, 0.3, 0.3), wood);
  beam.position.y = 4.1;
  grp.add(beam);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: sign(text, color), transparent: true }));
  board.position.set(0, 3.45, 0.17);
  board.userData.noMerge = true;
  grp.add(board);
  // 旗のひも
  const colors = [0xff5a4e, 0xffc23c, 0x3d8bff, 0x34c47c, 0x9b6bff];
  for (let i = 0; i < 11; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 3), toonMaterial(colors[i % 5]));
    f.rotation.x = Math.PI;
    f.position.set(-hw + (i + 0.5) * ((hw * 2) / 11), 3.75 - Math.sin(((i + 0.5) / 11) * Math.PI) * 0.25, 0);
    grp.add(f);
  }
  grp.position.copy(coursePoint(s, 0));
  grp.rotation.y = courseHeading(s).yaw;
  grp.traverse((o) => { o.castShadow = true; });
  g.add(grp);
}

// ゴールのあとの広場: 落ち葉をしきつめた丸い広場。観客の切り株、旗のポールと旗のひも、
// つきあたりの大きな落ち葉の山(止まりきれなくても、ここへぼふっと入る見た目)
function buildGoalArea(g) {
  const center = coursePoint(LENGTH + 16, 0);
  const yaw = courseHeading(LENGTH + 16).yaw;
  const grp = new THREE.Group();
  grp.position.copy(center);
  grp.rotation.y = yaw;
  // 広場の地面(道より 2cm 下。道とかさならない)
  const map = leafCarpet();
  map.repeat.set(5, 5);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(11, 40), new THREE.MeshToonMaterial({ map, color: 0xfff0dd, gradientMap: toonGradient }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  grp.add(floor);
  // ふちどり: 小石の輪
  const stoneGeo = new THREE.DodecahedronGeometry(0.28, 0);
  const stoneMat = toonMaterial(0xa8a39a);
  const rand = makeRand(31);
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2;
    if (Math.abs(Math.sin(a)) < 0.2 && Math.cos(a) < 0) continue; // ゴールから入るところはあける(ローカルの -z がゴールのがわ)
    const st = new THREE.Mesh(stoneGeo, stoneMat);
    st.position.set(Math.sin(a) * 11, 0.05, Math.cos(a) * 11);
    st.rotation.set(rand() * 3, rand() * 3, 0);
    st.scale.setScalar(0.7 + rand() * 0.6);
    grp.add(st);
  }
  // つきあたりの落ち葉の山
  const pileMat = new THREE.MeshToonMaterial({ map: leafCarpet(), color: 0xffe2c2, gradientMap: toonGradient });
  pileMat.map.repeat.set(2, 2);
  for (const [x, z, r, h] of [[0, 9.5, 3.4, 1.7], [-2.6, 8.6, 2.2, 1.2], [2.8, 8.8, 2.4, 1.3], [-0.8, 7.6, 1.5, 0.8], [1.4, 7.4, 1.3, 0.7]]) {
    const pile = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), pileMat);
    pile.scale.set(r, h, r * 0.8);
    pile.position.set(x, -0.05, z);
    grp.add(pile);
  }
  // 旗のポール4本と、そのあいだの旗のひも
  const wood = toonMaterial(0x8a5a32);
  const flagColors = [0xff5a4e, 0xffc23c, 0x3d8bff, 0x34c47c, 0x9b6bff];
  const poles = [[-8.6, -2], [-7, 5.5], [7, 5.5], [8.6, -2]];
  for (const [x, z] of poles) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.6, 8), wood);
    pole.position.set(x, 1.8, z);
    grp.add(pole);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), toonMaterial(0xffc23c));
    ball.position.set(x, 3.65, z);
    grp.add(ball);
  }
  const flagGeo = new THREE.ConeGeometry(0.13, 0.28, 3);
  for (let k = 0; k < poles.length - 1; k++) {
    const [ax, az] = poles[k], [bx, bz] = poles[k + 1];
    const n = Math.round(Math.hypot(bx - ax, bz - az) / 0.55);
    for (let i = 1; i < n; i++) {
      const u = i / n;
      const f = new THREE.Mesh(flagGeo, toonMaterial(flagColors[(i + k) % 5]));
      f.rotation.x = Math.PI;
      f.position.set(ax + (bx - ax) * u, 3.4 - Math.sin(u * Math.PI) * 0.6, az + (bz - az) * u);
      grp.add(f);
    }
  }
  // 観客の切り株
  const stumpGeo = new THREE.CylinderGeometry(0.42, 0.5, 0.42, 12);
  const stumpMat = toonMaterial(0x8a5a32), ringMat = toonMaterial(0xe0b77c);
  const topGeo = new THREE.CircleGeometry(0.4, 12);
  topGeo.rotateX(-Math.PI / 2);
  for (const seat of SEATS) {
    const p = coursePoint(seat.s, seat.x);
    const st = new THREE.Mesh(stumpGeo, stumpMat);
    st.position.set(p.x, p.y + 0.2, p.z);
    g.add(st);
    const top = new THREE.Mesh(topGeo, ringMat);
    top.position.set(p.x, p.y + 0.415, p.z);
    g.add(top);
  }
  g.add(grp);
}

export const SEATS = [
  { s: LENGTH + 12, x: -5.5, kind: 'risu' },
  { s: LENGTH + 15, x: -6.2, kind: 'harinezumi' },
  { s: LENGTH + 18, x: -5.4, kind: 'komadori' },
  { s: LENGTH + 12, x: 5.5, kind: 'komadori' },
  { s: LENGTH + 15, x: 6.2, kind: 'risu' },
  { s: LENGTH + 18, x: 5.4, kind: 'harinezumi' },
];

export function buildStage(scene) {
  const g = new THREE.Group();
  buildTerrain(g);
  buildMountains(g);
  buildTrack(g);
  buildTrees(g);
  buildIslands(g);
  buildMushrooms(g);
  buildGate(g, 0, 'スタート', '#3d8bff');
  buildGate(g, LENGTH, 'ゴール', '#d9443a');
  buildGoalArea(g);
  mergeStatic(g, (o) => o.name === 'track');
  scene.add(g);
  return { group: g };
}
