// ステージの地面まわり: 土の小道・草地の模様・草の株・花・石。
//
// 模様は画像ファイルを持たず、canvas に描いて作る(配信物を増やさないため)。
// 草や石のように数が多いものは InstancedMesh でまとめて1回で描く
// (1個ずつ Mesh にすると、スマホで描画の呼び出しが多すぎて重くなる)。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';

// 飾りの配置用の乱数(毎回同じ景色になるよう、シード固定)
function makeRand(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// 模様を描く canvas。willReadFrequently を付けて CPU で描かせる。
// 付けないと Chrome は描画を GPU 側にまとめて回し、細かい点を何万個も打つと
// そこで詰まる(その間 WebGL の描画も待たされ、起動直後に固まって見えた)。
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

// ── 土の小道 ───────────────────────────────────────
// 縁はでこぼこにして、外は透明(草地が見える)。踏まれて固まったレーンの中央は少し明るく。
const PATH_MARGIN = 0.9; // 道の外側に、縁のでこぼこを描くための余白(m)

function pathTexture(widthM, lengthM, laneXs, rand) {
  const pxPerM = 64;
  const W = Math.round((widthM + PATH_MARGIN * 2) * pxPerM);
  const H = Math.round(lengthM * pxPerM);
  const [c, g] = canvas(W, H);
  const mx = (m) => (m + widthM / 2 + PATH_MARGIN) * pxPerM; // 横位置(m)→ px
  // 縁の形: ゆるい波 + 細かいぎざぎざ
  const edge = (y, side) => {
    const t = y / pxPerM;
    return widthM / 2 + 0.12 * Math.sin(t * 0.9 + side * 2) + 0.07 * Math.sin(t * 2.7 + side) + 0.04 * Math.sin(t * 7.3 + side * 5);
  };
  g.fillStyle = '#c9a77a';
  g.beginPath();
  for (let y = 0; y <= H; y += 4) g.lineTo(mx(-edge(y, -1)), y);
  for (let y = H; y >= 0; y -= 4) g.lineTo(mx(edge(y, 1)), y);
  g.closePath();
  g.fill();
  g.save();
  g.clip();
  // 土のむら(大きめのしみ)
  for (let i = 0; i < 900; i++) {
    const x = rand() * W, y = rand() * H, r = 10 + rand() * 50;
    const dark = rand() < 0.5;
    g.fillStyle = dark ? `rgba(120, 84, 50, ${0.05 + rand() * 0.07})` : `rgba(240, 214, 170, ${0.05 + rand() * 0.08})`;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.5 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // 踏み固められたレーンの中央(明るくなめらか)
  for (const lx of laneXs) {
    const grad = g.createLinearGradient(mx(lx - 0.35), 0, mx(lx + 0.35), 0);
    grad.addColorStop(0, 'rgba(236, 210, 165, 0)');
    grad.addColorStop(0.5, 'rgba(236, 210, 165, 0.35)');
    grad.addColorStop(1, 'rgba(236, 210, 165, 0)');
    g.fillStyle = grad;
    g.fillRect(mx(lx - 0.35), 0, 0.7 * pxPerM, H);
  }
  // 細かい砂粒
  for (let i = 0; i < 26000; i++) {
    const x = rand() * W, y = rand() * H;
    const v = rand();
    g.fillStyle = v < 0.5 ? `rgba(110, 78, 48, ${0.15 + rand() * 0.25})` : `rgba(250, 232, 200, ${0.2 + rand() * 0.3})`;
    g.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2);
  }
  // 小さな石ころ(影つき)
  for (let i = 0; i < 700; i++) {
    const x = rand() * W, y = rand() * H, r = 1.5 + rand() * 3.5;
    g.fillStyle = 'rgba(90, 64, 40, 0.35)';
    g.beginPath();
    g.ellipse(x + 1, y + 1.5, r, r * 0.8, 0, 0, Math.PI * 2);
    g.fill();
    const tone = 180 + rand() * 50;
    g.fillStyle = `rgb(${tone}, ${tone - 12}, ${tone - 30})`;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.8, rand(), 0, Math.PI * 2);
    g.fill();
  }
  // 縁の内側を少し暗く(草との境目に落ちる影)
  g.restore();
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(110, 80, 50, 0.25)';
  for (const side of [-1, 1]) {
    g.beginPath();
    for (let y = 0; y <= H; y += 4) g.lineTo(mx(side * (edge(y, side) - 0.03)), y);
    g.stroke();
  }
  // 両端は草地へ溶けこませる(四角く切れて見えないように)。縁のぎざぎざは alphaTest が拾う
  g.globalCompositeOperation = 'destination-out';
  for (const [y0, y1] of [[0, 3 * pxPerM], [H, H - 1.5 * pxPerM]]) {
    for (let i = 0; i < 400; i++) {
      const t = rand() ** 0.6; // 端に近いほど多く欠ける
      const y = y0 + (y1 - y0) * (1 - t);
      g.fillStyle = 'rgba(0,0,0,1)';
      g.beginPath();
      g.arc(rand() * W, y, 8 + rand() * 26 * t, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, widthM: widthM + PATH_MARGIN * 2, edge: (zM, side) => edge(zM * pxPerM, side) };
}

export function buildPath(g, { width, from, to, laneXs }) {
  const rand = makeRand(11);
  const length = from - to;
  const { tex, widthM, edge } = pathTexture(width, length, laneXs, rand);
  const m = new THREE.MeshToonMaterial({ map: tex, transparent: true, alphaTest: 0.5, gradientMap: toonGradient });
  const path = new THREE.Mesh(new THREE.PlaneGeometry(widthM, length), m);
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.012, (from + to) / 2);
  g.add(path);
  // 縁の形を返す(草の株を縁ぞいに並べるのに使う)。z はワールド座標
  return (z, side) => edge(from - z, side);
}

// ── 草地の模様 ─────────────────────────────────────
// 地形の頂点色に掛け合わせる、明るさのむら。くり返して貼る。
export function grassTexture() {
  const rand = makeRand(5);
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  // くり返しの継ぎ目が出ないよう、はみ出した分は反対側にも描く
  const blot = (x, y, r, style) => {
    g.fillStyle = style;
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) {
      g.beginPath();
      g.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      g.fill();
    }
  };
  for (let i = 0; i < 70; i++) blot(rand() * 256, rand() * 256, 14 + rand() * 30, `rgba(200, 220, 170, ${0.12 + rand() * 0.12})`);
  for (let i = 0; i < 50; i++) blot(rand() * 256, rand() * 256, 10 + rand() * 24, `rgba(255, 255, 230, ${0.15 + rand() * 0.15})`);
  // 草の葉の細い線
  for (let i = 0; i < 2600; i++) {
    const x = rand() * 256, y = rand() * 256, len = 2 + rand() * 5;
    g.strokeStyle = rand() < 0.5 ? `rgba(120, 160, 90, ${0.25 + rand() * 0.25})` : `rgba(255, 255, 220, ${0.25 + rand() * 0.3})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 2, y - len);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ── 草の株・花・石(InstancedMesh) ──────────────────────

// 草の株: 細い葉を5枚、少しずつ向きと傾きを変えて束ねる
function tuftGeometry() {
  const blades = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + i * 0.7;
    const h = 0.75 + (i % 3) * 0.15;
    const lean = 0.25 + (i % 2) * 0.15;
    const b = new THREE.BufferGeometry();
    const w = 0.07;
    // 根元2点・先1点の三角形。先は外へ倒す
    const tipX = Math.cos(a) * lean, tipZ = Math.sin(a) * lean;
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    b.setAttribute('position', new THREE.Float32BufferAttribute([
      px, 0, pz, -px, 0, -pz, tipX, h, tipZ,
      -px, 0, -pz, px, 0, pz, tipX, h, tipZ, // 裏面
    ], 3));
    blades.push(b);
  }
  const merged = mergeGeometries(blades);
  merged.computeVertexNormals();
  // 葉は上向きの法線にして、トゥーンの光が地面と同じように当たるようにする
  const n = merged.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return merged;
}

function mergeGeometries(list) {
  const pos = [];
  for (const g of list) pos.push(...g.attributes.position.array);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return out;
}

function flowerGeometry() {
  // 5枚の花びら(平たい円)と、まん中
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const p = new THREE.CircleGeometry(0.045, 8);
    p.rotateX(-Math.PI / 2);
    p.translate(Math.cos(a) * 0.045, 0, Math.sin(a) * 0.045);
    parts.push(p.toNonIndexed());
  }
  const merged = mergeGeometries(parts);
  const n = [];
  for (let i = 0; i < merged.attributes.position.count; i++) n.push(0, 1, 0);
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  return merged;
}

export function scatterFoliage(g, { isFree, heightAt, pathEdge, pathFrom, pathTo }) {
  const rand = makeRand(23);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // 草の株
  const tuftMat = toonMaterial(0xffffff);
  tuftMat.side = THREE.DoubleSide;
  const tuftGeo = tuftGeometry();
  const tufts = [];
  // 広場とそのまわり
  for (let i = 0; i < 9000 && tufts.length < 5200; i++) {
    const x = (rand() - 0.5) * 34, z = 10 - rand() * 46;
    if (!isFree(x, z)) continue;
    tufts.push([x, z, 0.16 + rand() * 0.2]);
  }
  // 道の縁ぞい(縁のでこぼこに沿って、少し道にかぶせる)
  for (let z = pathFrom; z > pathTo; z -= 0.22) {
    for (const side of [-1, 1]) {
      if (rand() < 0.25) continue;
      const x = side * (pathEdge(z, side) + 0.05 + rand() * 0.25);
      tufts.push([x, z + (rand() - 0.5) * 0.2, 0.18 + rand() * 0.22]);
    }
  }
  const tuftMesh = new THREE.InstancedMesh(tuftGeo, tuftMat, tufts.length);
  tufts.forEach(([x, z, s], i) => {
    dummy.position.set(x, heightAt(x, z), z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(s, s * (0.8 + rand() * 0.6), s);
    dummy.updateMatrix();
    tuftMesh.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.26 + rand() * 0.06, 0.45 + rand() * 0.15, 0.36 + rand() * 0.14);
    tuftMesh.setColorAt(i, color);
  });
  tuftMesh.name = 'grassTufts';
  g.add(tuftMesh);

  // 花(白・黄・うすもも・うすむらさき)。ところどころに群れて咲く
  const flowerColors = [0xffffff, 0xfff1a8, 0xffc7d6, 0xd9c6ff];
  const flowers = [];
  for (let k = 0; k < 40; k++) {
    const cx = (rand() - 0.5) * 30, cz = 8 - rand() * 40;
    const col = flowerColors[Math.floor(rand() * flowerColors.length)];
    for (let i = 0; i < 12; i++) {
      const x = cx + (rand() - 0.5) * 2.2, z = cz + (rand() - 0.5) * 2.2;
      if (isFree(x, z)) flowers.push([x, z, col]);
    }
  }
  const flowerMesh = new THREE.InstancedMesh(flowerGeometry(), toonMaterial(0xffffff), flowers.length);
  const centerMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 6, 4), toonMaterial(0xf2b630), flowers.length);
  flowers.forEach(([x, z, col], i) => {
    const y = heightAt(x, z) + 0.12 + rand() * 0.06;
    dummy.position.set(x, y, z);
    dummy.rotation.set((rand() - 0.5) * 0.4, rand() * Math.PI, (rand() - 0.5) * 0.4);
    dummy.scale.setScalar(0.8 + rand() * 0.5);
    dummy.updateMatrix();
    flowerMesh.setMatrixAt(i, dummy.matrix);
    flowerMesh.setColorAt(i, color.setHex(col));
    dummy.position.y += 0.01;
    dummy.updateMatrix();
    centerMesh.setMatrixAt(i, dummy.matrix);
  });
  g.add(flowerMesh, centerMesh);

  // 石(広場のふち・道の縁)
  const stones = [];
  for (let i = 0; i < 260; i++) {
    const x = (rand() - 0.5) * 36, z = 9 - rand() * 46;
    if (isFree(x, z)) stones.push([x, z, 0.08 + rand() * 0.22]);
  }
  for (let z = pathFrom; z > pathTo; z -= 1.1) {
    if (rand() < 0.5) continue;
    const side = rand() < 0.5 ? -1 : 1;
    stones.push([side * (pathEdge(z, side) + 0.1), z, 0.06 + rand() * 0.1]);
  }
  const stoneMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), toonMaterial(0xffffff), stones.length);
  stones.forEach(([x, z, s], i) => {
    dummy.position.set(x, heightAt(x, z) + s * 0.25, z);
    dummy.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    dummy.scale.set(s * (1 + rand() * 0.5), s * 0.6, s);
    dummy.updateMatrix();
    stoneMesh.setMatrixAt(i, dummy.matrix);
    const t = 0.62 + rand() * 0.18;
    stoneMesh.setColorAt(i, color.setRGB(t, t * 0.97, t * 0.9));
  });
  g.add(stoneMesh);
}

// ── レーンの区切り(小石の列) ──────────────────────────
export function laneStones(g, laneEdges, from, to) {
  const rand = makeRand(31);
  const items = [];
  for (const x of laneEdges) {
    for (let z = from; z > to; z -= 0.34 + rand() * 0.12) items.push([x + (rand() - 0.5) * 0.06, z]);
  }
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), toonMaterial(0xffffff), items.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  items.forEach(([x, z], i) => {
    const s = 0.04 + rand() * 0.03;
    dummy.position.set(x, 0.02, z);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(s * (1 + rand() * 0.4), s * 0.55, s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    // 白すぎると点線に見えるので、乾いた川原の石くらいの色に
    const t = 0.7 + rand() * 0.14;
    mesh.setColorAt(i, color.setRGB(t, t * 0.95, t * 0.88));
  });
  g.add(mesh);
}

// ── 土の出た地面(大木の根元など) ──────────────────────
// 縁がでこぼこの楕円。外側は透明
export function dirtPatch(g, { x, z, rx, rz, seed = 3 }) {
  const rand = makeRand(seed);
  const S = 512;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#bf9c70';
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const r = 0.86 + 0.06 * Math.sin(a * 3 + 1) + 0.04 * Math.sin(a * 7) + 0.03 * Math.sin(a * 13 + 2);
    ctx.lineTo(S / 2 + Math.cos(a) * r * S / 2, S / 2 + Math.sin(a) * r * S / 2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = rand() < 0.5 ? `rgba(120, 84, 50, ${0.06 + rand() * 0.08})` : `rgba(240, 214, 170, ${0.06 + rand() * 0.08})`;
    ctx.beginPath();
    ctx.ellipse(rand() * S, rand() * S, 8 + rand() * 40, 6 + rand() * 25, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rand() < 0.5 ? `rgba(110, 78, 48, ${0.15 + rand() * 0.25})` : `rgba(250, 232, 200, ${0.2 + rand() * 0.3})`;
    ctx.fillRect(rand() * S, rand() * S, 1 + rand() * 2, 1 + rand() * 2);
  }
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshToonMaterial({ map: tex, transparent: true, alphaTest: 0.5, gradientMap: toonGradient });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.009, z);
  g.add(mesh);
}

// ── 落ち葉(地面に散らばる) ────────────────────────────
export function leafLitter(g, { count, place, colors, seed = 9 }) {
  const rand = makeRand(seed);
  // 葉っぱ1枚: 先のとがった平たい形
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.1);
  shape.quadraticCurveTo(0.07, -0.02, 0, 0.1);
  shape.quadraticCurveTo(-0.07, -0.02, 0, -0.1);
  const geo = new THREE.ShapeGeometry(shape, 4);
  geo.rotateX(-Math.PI / 2);
  const mat = toonMaterial(0xffffff);
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const [x, y, z] = place(rand);
    dummy.position.set(x, y + 0.015 + rand() * 0.01, z);
    dummy.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.5);
    dummy.scale.setScalar(0.8 + rand() * 0.9);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.setHex(colors[Math.floor(rand() * colors.length)]));
  }
  g.add(mesh);
  return mesh;
}
