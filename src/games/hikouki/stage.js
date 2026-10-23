// 森の谷まの かみひこうき の 会場(見た目だけ)。
//
// 森の 深い 谷まを、川に そって ゆるく まがりながら とぶ。両がわは 岩の がけと 大木、がけの 上にも 森。
// ところどころ 岩の アーチが コースを またぎ、横の がけから 滝が おちる。ゴールは 花の アーチ。
// わっか(ツタ・金)・上昇気流(光の 柱と まいあがる 葉)・ゆれる 枝・鳥の むれ は state の コースから 作る。
//
// 座標: rules.js の (s, x, y) を コースの 線(pathAt)で 世界へ うつす。y は そのまま 高さ。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { foliageClump, makeRand } from '../daruma/trees.js';
import { RULES, birdX, branchSpan, branchY } from './rules.js';

// コースの 線: 向き(よこの まがり)を s で きめて、1 m ごとに つみあげる
const PATH_START = -40, PATH_END = RULES.length + 80;
const PATH = (() => {
  const pts = [];
  let x = 0, z = 0;
  for (let s = PATH_START; s <= PATH_END; s++) {
    const a = 0.32 * Math.sin(s / 48) + 0.18 * Math.sin(s / 21 + 1);
    pts.push({ x, z, a });
    x += Math.sin(a);
    z -= Math.cos(a);
  }
  return pts;
})();
const tmp = new THREE.Vector3();
// s の ところの 位置と 向き(forward・right)
export function pathAt(s, out = {}) {
  const f = Math.max(0, Math.min(PATH.length - 2, s - PATH_START));
  const i = Math.floor(f), k = f - i;
  const A = PATH[i], B = PATH[i + 1];
  const a = A.a + (B.a - A.a) * k;
  out.x = A.x + (B.x - A.x) * k;
  out.z = A.z + (B.z - A.z) * k;
  out.fx = Math.sin(a); out.fz = -Math.cos(a);
  out.rx = Math.cos(a); out.rz = Math.sin(a);
  out.a = a;
  return out;
}
// (s, x, y) → 世界
export function toWorld(s, x, y, v = new THREE.Vector3()) {
  const p = pathAt(s, _p);
  return v.set(p.x + p.rx * x, y, p.z + p.rz * x);
}
const _p = {};

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// コースに そった 帯(川・岸)を 作る
function ribbon(x0, x1, y, step = 2, from = PATH_START, to = PATH_END) {
  const pos = [], uv = [], idx = [];
  let n = 0;
  for (let s = from; s <= to; s += step) {
    const p = pathAt(s, {});
    pos.push(p.x + p.rx * x0, y, p.z + p.rz * x0, p.x + p.rx * x1, y, p.z + p.rz * x1);
    uv.push(0, s / 8, 1, s / 8);
    if (n) idx.push((n - 1) * 2, (n - 1) * 2 + 1, n * 2, (n - 1) * 2 + 1, n * 2 + 1, n * 2);
    n++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// がけ: コースに そって 両がわに 岩の かべ(でこぼこ)
function cliff(side, rand) {
  const pos = [], idx = [], col = [];
  const rows = 7;
  let n = 0;
  const c0 = new THREE.Color(0x8a7a66), c1 = new THREE.Color(0xa89a82), c2 = new THREE.Color(0x5f8a4a);
  for (let s = PATH_START; s <= PATH_END; s += 3) {
    const p = pathAt(s, {});
    for (let r = 0; r <= rows; r++) {
      const h = (r / rows) * 22;
      const bulge = Math.sin(s * 0.13 + r * 1.7 + side) * 1.2 + Math.sin(s * 0.05 + side * 3) * 2 + rand() * 0.6;
      const x = side * (RULES.halfW + 4.5 + r * 0.9 + bulge);
      pos.push(p.x + p.rx * x, h - 0.5, p.z + p.rz * x);
      const c = r === rows ? c2 : (r % 2 ? c0 : c1).clone().multiplyScalar(0.9 + rand() * 0.2);
      col.push(c.r, c.g, c.b);
    }
    if (n) for (let r = 0; r < rows; r++) {
      const a = (n - 1) * (rows + 1) + r, b = n * (rows + 1) + r;
      if (side > 0) idx.push(a, b, a + 1, b, b + 1, a + 1);
      else idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    n++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient, flatShading: true, side: THREE.DoubleSide }));
}

export function buildStage(scene) {
  const group = new THREE.Group();
  const rand = makeRand(11);

  // 川(谷の 底)と 岸の 草
  const waterTex = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#3aa0c8';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.25})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 10, 1.5);
    }
  });
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  const river = new THREE.Mesh(ribbon(-4, 4, 0.05), new THREE.MeshBasicMaterial({ map: waterTex, color: 0xcfefff }));
  river.userData.noMerge = true;
  group.add(river);
  for (const side of [-1, 1]) {
    // 左がわは 頂点の ならびが 逆に なるので、x0 < x1 の じゅんで 作る
    const bank = new THREE.Mesh(side > 0 ? ribbon(3.6, RULES.halfW + 6, 0.02) : ribbon(-(RULES.halfW + 6), -3.6, 0.02), toonMaterial(0x6aa84a));
    bank.receiveShadow = true;
    bank.userData.noMerge = true;
    group.add(bank);
    const c = cliff(side, rand);
    c.userData.noMerge = true;
    group.add(c);
  }
  // 岸の 石・草むら・花
  const stoneMat = toonMaterial(0x9a8e7e), bushMat = toonMaterial(0x4a8a3a);
  const flowerCols = [0xff7a9a, 0xffd23c, 0xffffff];
  for (let s = PATH_START; s < PATH_END; s += 2.2) {
    for (const side of [-1, 1]) {
      if (rand() < 0.5) continue;
      const x = side * (4 + rand() * (RULES.halfW + 1));
      const w = toWorld(s + rand() * 2, x, 0, new THREE.Vector3());
      const r = rand();
      const m = r < 0.35 ? new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + rand() * 0.5, 0), stoneMat)
        : r < 0.8 ? new THREE.Mesh(new THREE.IcosahedronGeometry(0.4 + rand() * 0.4, 0), bushMat)
          : new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), toonMaterial(flowerCols[Math.floor(rand() * 3)]));
      m.position.copy(w);
      m.position.y = r < 0.8 ? 0.15 : 0.2;
      m.rotation.y = rand() * 6;
      group.add(m);
    }
  }
  // 大木: がけの 足もとと がけの 上
  const crown = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient });
  const clumps = [0, 1, 2].map((k) => foliageClump(makeRand(30 + k), { detail: 1, balls: 5, bottom: 0x2a5e32, top: 0x8acb5a }));
  const trunkMat = toonMaterial(0x6b4c36);
  for (let s = PATH_START + 10; s < PATH_END; s += 7 + rand() * 6) {
    for (const side of [-1, 1]) {
      const top = rand() < 0.5;
      const x = side * (top ? RULES.halfW + 12 + rand() * 6 : RULES.halfW + 6 + rand() * 2.5);
      const h = top ? 6 + rand() * 5 : 9 + rand() * 6;
      const base = toWorld(s, x, top ? 21.5 : 0, new THREE.Vector3());
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * h / 10, 0.6 * h / 10, h * 0.7, 7), trunkMat);
      t.position.copy(base).add(tmp.set(0, h * 0.35, 0));
      const c = new THREE.Mesh(clumps[Math.floor(rand() * 3)], crown);
      c.scale.setScalar(h * 0.3);
      c.position.copy(base).add(tmp.set(0, h * 0.78, 0));
      c.rotation.y = rand() * 6;
      group.add(t, c);
    }
  }
  // 岩の アーチ(コースを またぐ。高い ところ)
  const archMat = toonMaterial(0x9a8a74), mossMat = toonMaterial(0x5f9a4a);
  for (const s of [70, 165, 250, 335]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-(RULES.halfW + 6), -1, 0), new THREE.Vector3(-(RULES.halfW + 4), 12, 0), new THREE.Vector3(-3, 17.5, 0), new THREE.Vector3(3, 17.5, 0), new THREE.Vector3(RULES.halfW + 4, 12, 0), new THREE.Vector3(RULES.halfW + 6, -1, 0)]);
    const arch = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 1.6, 7), archMat);
    const moss = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 1.62, 7, false), mossMat);
    moss.scale.set(0.98, 1.04, 0.9);
    const g = new THREE.Group();
    g.add(arch, moss);
    const p = pathAt(s, {});
    g.position.set(p.x, 0, p.z);
    g.rotation.y = -p.a;
    group.add(g);
  }
  // 滝(がけから 川へ)
  const fallTex = canvasTex(32, 128, (g, w, h) => {
    g.fillStyle = 'rgba(220,245,255,0.85)';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 6 + Math.random() * 14); }
  });
  fallTex.wrapS = fallTex.wrapT = THREE.RepeatWrapping;
  const falls = [];
  for (const [s, side] of [[120, -1], [290, 1]]) {
    const top = toWorld(s, side * (RULES.halfW + 5.5), 0, new THREE.Vector3());
    const p = pathAt(s, {});
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 21), new THREE.MeshBasicMaterial({ map: fallTex.clone(), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    m.material.map.repeat.set(1, 2);
    m.position.set(top.x, 10.5, top.z);
    m.rotation.y = -p.a + (side < 0 ? Math.PI / 2 : -Math.PI / 2);
    m.userData.noMerge = true;
    group.add(m);
    falls.push(m);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.7 }));
    pool.position.set(top.x, 0.08, top.z);
    pool.userData.noMerge = true;
    group.add(pool);
  }
  // ゴールの 花の アーチ
  {
    const p = pathAt(RULES.length, {});
    const g = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-RULES.halfW - 0.5, 0, 0), new THREE.Vector3(-RULES.halfW + 0.5, 12, 0), new THREE.Vector3(0, 15.5, 0), new THREE.Vector3(RULES.halfW - 0.5, 12, 0), new THREE.Vector3(RULES.halfW + 0.5, 0, 0)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.45, 8), toonMaterial(0x5aa04a)));
    const cols = [0xff6a8a, 0xffd23c, 0xffffff, 0xff9a3a, 0xb48cff];
    for (let k = 0; k < 40; k++) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), toonMaterial(cols[k % 5]));
      f.position.copy(curve.getPoint(k / 39)).add(tmp.set(0, 0, 0.3));
      g.add(f);
    }
    // ゴールの 布
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.3), new THREE.MeshBasicMaterial({ map: canvasTex(256, 56, (c, w, h) => {
      c.fillStyle = '#fff6e0'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#c2453a'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ゴール', w / 2, h / 2 + 2);
    }), side: THREE.DoubleSide }));
    banner.position.set(0, 14.6, 0.1);
    banner.userData.noMerge = true;
    g.add(banner);
    g.position.set(p.x, 0, p.z);
    g.rotation.y = -p.a;
    group.add(g);
  }

  // つり橋(谷の 上の ほう。コースの 上を よこぎる)
  const plankMat = toonMaterial(0xb08858), ropeMat = toonMaterial(0x7a6040);
  for (const s0 of [40, 210, 372]) {
    const p = pathAt(s0, {});
    const g = new THREE.Group();
    const span = (RULES.halfW + 9) * 2, n = 34;
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1) - 0.5;
      const sag = (1 - (2 * u) ** 2) * 1.6;
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 1.4), plankMat);
      plank.position.set(u * span, 19.5 - sag, 0);
      plank.rotation.z = Math.atan(-8 * u * 1.6 / span) * 0.9;
      plank.rotation.y = (rand() - 0.5) * 0.08;
      g.add(plank);
    }
    for (const sz of [-0.75, 0.75]) {
      const pts = [];
      for (let k = 0; k <= 16; k++) { const u = k / 16 - 0.5; pts.push(new THREE.Vector3(u * span, 20.6 - (1 - (2 * u) ** 2) * 1.6, sz)); }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.05, 5), ropeMat));
      // たての つな
      for (let k = 1; k < 16; k += 2) {
        const u = k / 16 - 0.5;
        const v = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 4), ropeMat);
        v.position.set(u * span, 20.05 - (1 - (2 * u) ** 2) * 1.6, sz);
        g.add(v);
      }
    }
    g.position.set(p.x, 0, p.z);
    g.rotation.y = -p.a;
    group.add(g);
  }
  // がけから たれる ツタ
  const vineMat = toonMaterial(0x3f7a34), vineLeaf = toonMaterial(0x6ab84a);
  for (let s0 = PATH_START + 6; s0 < PATH_END; s0 += 5 + rand() * 6) {
    const side = rand() < 0.5 ? -1 : 1;
    const len = 5 + rand() * 8;
    const x = side * (RULES.halfW + 5 + rand() * 1.5);
    const top = toWorld(s0, x, 20.5, new THREE.Vector3());
    const v = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 4), vineMat);
    v.position.copy(top).add(tmp.set(0, -len / 2, 0));
    group.add(v);
    for (let k = 0; k < len / 1.2; k++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 5, 3), vineLeaf);
      l.scale.set(1, 0.5, 0.8);
      l.position.copy(top).add(tmp.set((rand() - 0.5) * 0.4, -k * 1.2 - 0.4, (rand() - 0.5) * 0.4));
      group.add(l);
    }
  }
  // 川の 中の 岩(白い あわ つき)・岸の シダと キノコ
  const rockMat = toonMaterial(0x8a8478), foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
  for (let s0 = PATH_START + 8; s0 < PATH_END; s0 += 9 + rand() * 10) {
    const w = toWorld(s0, (rand() - 0.5) * 6, 0, new THREE.Vector3());
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + rand() * 0.6, 0), rockMat);
    r.position.copy(w).add(tmp.set(0, 0.15, 0));
    r.scale.y = 0.6;
    r.rotation.y = rand() * 6;
    group.add(r);
    const foam = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.15, 14).rotateX(-Math.PI / 2), foamMat);
    foam.position.copy(w).add(tmp.set(0, 0.07, 0));
    foam.scale.setScalar(0.7 + rand() * 0.5);
    group.add(foam);
  }
  const fernMat = toonMaterial(0x4f9a3e), capMat = toonMaterial(0xe8503a), capDot = toonMaterial(0xffffff), stemMat = toonMaterial(0xf4ead8);
  for (let s0 = PATH_START + 4; s0 < PATH_END; s0 += 3 + rand() * 3) {
    const side = rand() < 0.5 ? -1 : 1;
    const base = toWorld(s0, side * (RULES.halfW + 1.5 + rand() * 3.5), 0, new THREE.Vector3());
    if (rand() < 0.6) {
      // シダ: 弓なりの 葉を 放射状に
      for (let k = 0; k < 6; k++) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.1, 4), fernMat);
        const a = (k / 6) * Math.PI * 2;
        f.position.copy(base).add(tmp.set(Math.cos(a) * 0.35, 0.4, Math.sin(a) * 0.35));
        f.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
        group.add(f);
      }
    } else {
      // 赤い キノコ(2〜3本)
      for (let k = 0; k < 2 + Math.floor(rand() * 2); k++) {
        const h = 0.3 + rand() * 0.35;
        const at = base.clone().add(tmp.set((rand() - 0.5) * 0.7, 0, (rand() - 0.5) * 0.7));
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, h, 6), stemMat);
        st.position.copy(at).add(tmp.set(0, h / 2, 0));
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2 + h * 0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
        cap.position.copy(at).add(tmp.set(0, h, 0));
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 3), capDot);
        dot.position.copy(cap.position).add(tmp.set(0.08, 0.12 + h * 0.15, 0.05));
        group.add(st, cap, dot);
      }
    }
  }
  // 谷の むこうの 山(ゴールの おく)
  {
    const end = pathAt(RULES.length + 60, {});
    const hillMat = new THREE.MeshBasicMaterial({ color: 0x7aa0b8, fog: false });
    const hillMat2 = new THREE.MeshBasicMaterial({ color: 0x9ab8c8, fog: false });
    for (let k = 0; k < 7; k++) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(30 + rand() * 30, 40 + rand() * 40, 7), k % 2 ? hillMat : hillMat2);
      const side = (k - 3) * 28 + (rand() - 0.5) * 10;
      m.position.set(end.x + end.fx * (140 + rand() * 60) + end.rx * side, 10, end.z + end.fz * (140 + rand() * 60) + end.rz * side);
      m.userData.noMerge = true;
      group.add(m);
    }
  }

  mergeStatic(group, (o) => o.userData.noMerge);
  group.traverse((o) => { if (o.name === 'merged') o.castShadow = o.receiveShadow = true; });
  scene.add(group);

  // 光の すじ(木もれ日。谷へ ななめに さしこむ)
  const rayTex = canvasTex(64, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(255,248,220,0.5)');
    grd.addColorStop(1, 'rgba(255,248,220,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    const sg = g.createLinearGradient(0, 0, w, 0);
    sg.addColorStop(0, 'rgba(0,0,0,1)'); sg.addColorStop(0.5, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = sg;
    g.fillRect(0, 0, w, h);
  });
  const rayMat = new THREE.MeshBasicMaterial({ map: rayTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const rays = [];
  for (let s0 = 15; s0 < RULES.length + 20; s0 += 22 + rand() * 14) {
    const w = toWorld(s0, (rand() - 0.5) * 10, 9, new THREE.Vector3());
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6 + rand() * 4, 24), rayMat);
    m.position.copy(w);
    m.rotation.set(0, rand() * 3, 0.35);
    m.userData.ph = rand() * 6;
    scene.add(m);
    rays.push(m);
  }
  // 水に うかぶ 葉っぱ(ながれる)
  const floatGeo = new THREE.CircleGeometry(0.22, 6).rotateX(-Math.PI / 2);
  const floaters = [];
  const fcols = [0xe8a030, 0xd8602a, 0x8ac04a];
  for (let k = 0; k < 40; k++) {
    const m = new THREE.Mesh(floatGeo, toonMaterial(fcols[k % 3]));
    m.scale.set(1, 1, 1.6);
    m.userData = { s: PATH_START + rand() * (PATH_END - PATH_START), x: (rand() - 0.5) * 6, sp: 0.8 + rand() * 0.8 };
    scene.add(m);
    floaters.push(m);
  }
  // 空に まう 葉っぱ(カメラの まわり)
  const driftGeo = new THREE.PlaneGeometry(0.18, 0.12);
  const drifts = [];
  for (let k = 0; k < 50; k++) {
    const m = new THREE.Mesh(driftGeo, new THREE.MeshBasicMaterial({ color: fcols[k % 3], side: THREE.DoubleSide }));
    m.userData = { ox: (rand() - 0.5) * 20, oy: rand() * 12, oz: (rand() - 0.5) * 20, sp: 0.6 + rand(), ph: rand() * 6 };
    scene.add(m);
    drifts.push(m);
  }
  const camAt = new THREE.Vector3();
  function update(t, cam) {
    waterTex.offset.y = -t * 0.35;
    rayMat.opacity = 0.32 + Math.sin(t * 0.6) * 0.08;
    for (const m of floaters) {
      const u = m.userData;
      u.s -= u.sp * (1 / 60);
      if (u.s < PATH_START + 2) u.s = PATH_END - 2;
      toWorld(u.s, u.x + Math.sin(t + u.s) * 0.3, 0.09, m.position);
      m.rotation.y = t * 0.4 + u.s;
    }
    if (cam) {
      camAt.copy(cam.position);
      for (const m of drifts) {
        const u = m.userData;
        u.oy -= u.sp * (1 / 60);
        if (u.oy < -6) u.oy += 14;
        m.position.set(camAt.x + u.ox + Math.sin(t * u.sp + u.ph) * 0.8, camAt.y + u.oy, camAt.z + u.oz + Math.cos(t * 0.7 + u.ph) * 0.8);
        m.rotation.set(t * u.sp * 2 + u.ph, t * u.sp + u.ph, 0);
      }
    }
    for (const f of falls) f.material.map.offset.y = t * 1.6;
  }
  return { group, update };
}

// ── state の コースから 作る もの(わっか・上昇気流・枝・鳥) ───────────────
// まるい 光の つぶ
const dotTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();
export function buildCourse(scene, s) {
  const g = new THREE.Group();
  scene.add(g);
  const vineMat = toonMaterial(0x3f8a3a), leafMat = toonMaterial(0x7ac25a);
  const goldMat = new THREE.MeshToonMaterial({ color: 0xffcf3a, emissive: 0x6a4a00, gradientMap: toonGradient });
  const rings = s.rings.map((r) => {
    const R = r.gold ? RULES.goldR : RULES.ringR;
    const m = new THREE.Group();
    const torus = new THREE.Mesh(new THREE.TorusGeometry(R, r.gold ? 0.16 : 0.13, 8, 32), r.gold ? goldMat : vineMat);
    m.add(torus);
    // ツタの 葉っぱ
    for (let k = 0; k < (r.gold ? 0 : 10); k++) {
      const a = (k / 10) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 4), leafMat);
      leaf.scale.set(1, 0.45, 0.7);
      leaf.position.set(Math.cos(a) * R, Math.sin(a) * R, 0.1);
      leaf.rotation.z = a;
      m.add(leaf);
    }
    if (r.gold) {
      // 金の わっかは きらきらの わ を もう ひとつ
      const halo = new THREE.Mesh(new THREE.TorusGeometry(R + 0.25, 0.04, 6, 32), new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.8 }));
      m.add(halo);
    }
    const p = pathAt(r.s, {});
    toWorld(r.s, r.x, r.y, m.position);
    m.rotation.y = -p.a;
    g.add(m);
    return { r, m, torus, done: false, t: 0 };
  });
  // 上昇気流: 光の 柱(すけて いる)と まいあがる 葉
  const lifts = s.lifts.map((l) => {
    const m = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(RULES.liftR, RULES.liftR, RULES.yMax, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xbaffd0, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    col.position.y = RULES.yMax / 2;
    m.add(col);
    const n = 40, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, rr = Math.random() * RULES.liftR; pos.set([Math.cos(a) * rr, Math.random() * RULES.yMax, Math.sin(a) * rr], i * 3); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTex, color: 0xeaffd0, size: 0.16, transparent: true, opacity: 0.9, depthWrite: false }));
    m.add(pts);
    // 柱の 長さ(s の はんい)ぶん、いくつか ならべる
    const group2 = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const c = m.clone();
      toWorld(l.s + (l.len * (k + 0.5)) / 3, l.x, 0, c.position);
      group2.add(c);
    }
    g.add(group2);
    return { l, group: group2 };
  });
  // ゆれる 枝: がけから のびる
  const barkMat = toonMaterial(0x7a5634), twigLeaf = toonMaterial(0x5aa04a);
  const branches = s.branches.map((br) => {
    const [a, b] = branchSpan(br);
    const len = b - a;
    const m = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.32, len, 7).rotateZ(Math.PI / 2), barkMat);
    m.add(stick);
    for (let k = 0; k < 6; k++) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), twigLeaf);
      leaf.position.set((k / 5 - 0.5) * len * 0.9, 0.3 * Math.sin(k * 2), 0.2 * Math.cos(k * 3));
      m.add(leaf);
    }
    const p = pathAt(br.s, {});
    m.rotation.y = -p.a;
    g.add(m);
    return { br, m, mid: (a + b) / 2 };
  });
  // 鳥の むれ
  const birdMat = toonMaterial(0x4a4a5a), beakMat = toonMaterial(0xffb030);
  const birds = s.birds.map((bd) => {
    const m = new THREE.Group();
    const wings = [];
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), birdMat);
      body.scale.set(1, 0.8, 1.4);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 5).rotateX(Math.PI / 2), beakMat);
      beak.position.z = 0.35;
      const wl = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.22), birdMat);
      wl.position.x = -0.3;
      const wr = wl.clone();
      wr.position.x = 0.3;
      b.add(body, beak, wl, wr);
      b.position.set((k % 2 ? 0.6 : -0.6) * (k > 1 ? 1 : 0.5), (k % 3) * 0.35 - 0.3, (k - 1.5) * 0.4);
      m.add(b);
      wings.push([wl, wr]);
    }
    const p = pathAt(bd.s, {});
    m.rotation.y = -p.a;
    g.add(m);
    return { bd, m, wings };
  });

  function update(st, time) {
    for (const r of rings) {
      // くぐられた わっかは ぱっと ひろがって きえる(自分が くぐった ものだけ)
      if (r.done) {
        r.t += 1 / 60;
        r.m.scale.setScalar(1 + r.t * 2);
        r.m.visible = r.t < 0.35;
      } else r.torus.rotation.z = time * (r.r.gold ? 1.5 : 0.2);
    }
    for (const b of branches) {
      const y = branchY(b.br, st.t);
      toWorld(b.br.s, b.mid, y, b.m.position);
      b.m.rotation.z = Math.sin(st.t * b.br.w + b.br.ph) * 0.06;
    }
    for (const b of birds) {
      toWorld(b.bd.s, birdX(b.bd, st.t), b.bd.y, b.m.position);
      // 進む 向きへ からだを むける
      const dir = Math.cos(st.t * b.bd.w + b.bd.ph);
      b.m.children.forEach((c) => { c.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2; });
      for (const [wl, wr] of b.wings) { wl.rotation.z = Math.sin(time * 18) * 0.7; wr.rotation.z = -wl.rotation.z; }
    }
    for (const l of lifts) {
      for (const c of l.group.children) {
        const pts = c.children[1];
        const pa = pts.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          let y = pa.getY(i) + (1 / 60) * 4.5;
          if (y > RULES.yMax) y -= RULES.yMax;
          pa.setY(i, y);
        }
        pa.needsUpdate = true;
        c.rotation.y = time * 0.8;
        c.children[0].material.opacity = 0.14 + Math.sin(time * 3) * 0.05;
      }
    }
  }
  return { group: g, rings, update, dispose() { scene.remove(g); } };
}
