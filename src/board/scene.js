// 大会の盤の見た目(空に浮かぶジオラマ)。ステージのデータ(マスの位置・つながり・エリア)から組み立てる。
//
// 大きな浮き島の上に、ぐるっと一周する道。島の四すみが春・夏・秋・冬で、地面の色と木と飾りが変わる。
// マスは季節の葉っぱ(春: 桜の花びら / 夏: 青葉 / 秋: もみじ / 冬: 雪の結晶)。
// マスの種類は、葉の上の丸い札の色と印でわかる。マスとマスのあいだは、小さな飛び石。
// 島のまん中には、大きなどんぐりの木。
//
// 座標: 島のまん中が原点。地面は高さ 0。ステージの x, z をそのまま使う。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../runtime/models.js';
import { mergeStatic } from '../runtime/merge.js';
import { acornGeometry, foliageClump, makeRand } from '../games/daruma/trees.js';
import { grassTexture } from '../games/daruma/ground.js';

const SEASON = {
  spring: { ground: 0xa6dc8c, leaf: 0xf7b6cb, leafEdge: 0xe58aa8, tree: [0xf3a6c4, 0xffd3e2] },
  summer: { ground: 0x72c25a, leaf: 0x5fb24a, leafEdge: 0x3f8a34, tree: [0x2f7a35, 0x8fd060] },
  autumn: { ground: 0xd9a65a, leaf: 0xe8642c, leafEdge: 0xb8401e, tree: [0xb4501a, 0xf39a2a] },
  winter: { ground: 0xeef4fa, leaf: 0xdcecff, leafEdge: 0x9cc2e8, tree: [0x2f5f45, 0xeaf4ff] },
};
// マスの札: 色と印
const BADGE = {
  start: { color: '#fff6e0', mark: 'スタート', ink: '#4a2a12' },
  blue: { color: '#3d8bff', mark: '+' },
  red: { color: '#e8402f', mark: '−' },
  item: { color: '#34c47c', mark: '?' },
  happen: { color: '#9b6bff', mark: '!' },
  duel: { color: '#ff9a2a', mark: 'VS' },
  shop: { color: '#ffc23c', mark: '店', ink: '#4a2a12' },
  slide: { color: '#ff7a3a', mark: '≫' },
};

// 島の形: 道(ステージの x, z)を囲む、少しくずれただ円
function islandShape(st) {
  let rx = 0, rz = 0;
  for (const q of st.squares) { rx = Math.max(rx, Math.abs(q.x)); rz = Math.max(rz, Math.abs(q.z)); }
  return { rx: rx + 5.5, rz: rz + 5.5 };
}
// その場所はどの季節か(いちばん近いマスのエリア)
// 地面の色: 近い6マスの季節の色を、距離で重みをつけて混ぜる(季節の境目がなめらかになる)
const _gc = new THREE.Color();
function groundColor(st, x, z, out) {
  const near = [];
  for (const q of st.squares) {
    const d = (q.x - x) ** 2 + (q.z - z) ** 2;
    if (near.length < 6 || d < near[5].d) {
      near.push({ d, area: q.area });
      near.sort((a, b) => a.d - b.d);
      if (near.length > 6) near.pop();
    }
  }
  let w = 0, r = 0, g = 0, b = 0;
  for (const n of near) {
    const k = 1 / (n.d + 6);
    _gc.setHex(SEASON[n.area].ground);
    r += _gc.r * k; g += _gc.g * k; b += _gc.b * k; w += k;
  }
  return out.setRGB(r / w, g / w, b / w);
}
function areaAt(st, x, z) {
  let best = null, bd = Infinity;
  for (const q of st.squares) {
    const d = (q.x - x) ** 2 + (q.z - z) ** 2;
    if (d < bd) { bd = d; best = q; }
  }
  return best.area;
}

function badgeTexture(kind, ice) {
  const b = BADGE[kind] || BADGE.blue;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d');
  x.fillStyle = ice ? '#bfe6ff' : '#4a2a12';
  x.beginPath();
  x.arc(S / 2, S / 2, 62, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = b.color;
  x.beginPath();
  x.arc(S / 2, S / 2, ice ? 52 : 56, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = b.ink || '#fff';
  // + と − は図形で描く(字の形だと、フォントによって線が細い・ななめになる)
  if (kind === 'blue' || kind === 'red') {
    x.strokeStyle = '#4a2a12';
    x.lineWidth = 6;
    const bars = kind === 'blue' ? [[60, 18], [18, 60]] : [[60, 18]];
    const path = (w, h) => { x.beginPath(); x.roundRect(S / 2 - w / 2, S / 2 - h / 2, w, h, 6); };
    for (const [w, h] of bars) { path(w, h); x.stroke(); } // ふちを先に描いてから
    for (const [w, h] of bars) { path(w, h); x.fill(); } // 中を塗る(重なりに線が出ない)
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const long = b.mark.length > 2;
  x.font = `400 ${long ? 26 : b.mark.length > 1 ? 52 : 76}px "Dela Gothic One", sans-serif`;
  x.fillText(b.mark, S / 2, S / 2 + 4);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 季節の葉っぱの形(だいたい直径 2)
function leafShape(area) {
  const sh = new THREE.Shape();
  if (area === 'spring') {
    // 桜の花びら: 先にきれこみ
    sh.moveTo(0, -1);
    sh.bezierCurveTo(0.9, -0.7, 1.05, 0.4, 0.45, 0.95);
    sh.lineTo(0, 0.7);
    sh.lineTo(-0.45, 0.95);
    sh.bezierCurveTo(-1.05, 0.4, -0.9, -0.7, 0, -1);
  } else if (area === 'summer') {
    // 青葉: 先のとがったたまご形
    sh.moveTo(0, -1);
    sh.bezierCurveTo(0.95, -0.55, 0.85, 0.5, 0, 1.05);
    sh.bezierCurveTo(-0.85, 0.5, -0.95, -0.55, 0, -1);
  } else if (area === 'autumn') {
    // もみじ: 7つのとがり
    for (let k = 0; k <= 14; k++) {
      const a = Math.PI / 2 + (k / 14) * Math.PI * 2;
      const r = k % 2 ? 0.48 : 1.0;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (k === 0) sh.moveTo(px, py); else sh.lineTo(px, py);
    }
  } else {
    // 雪の結晶: 6本の腕
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const m = k % 4;
      const r = m === 0 ? 1.0 : m === 2 ? 0.55 : 0.72;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (k === 0) sh.moveTo(px, py); else sh.lineTo(px, py);
    }
  }
  return sh;
}

function signTexture(text, season) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 92;
  const x = cv.getContext('2d');
  x.fillStyle = '#7a4a24';
  x.beginPath();
  x.roundRect(2, 2, 252, 88, 18);
  x.fill();
  x.fillStyle = '#c98f55';
  x.beginPath();
  x.roundRect(9, 9, 238, 74, 13);
  x.fill();
  x.fillStyle = '#' + new THREE.Color(season.leaf).getHexString();
  x.beginPath();
  x.arc(36, 46, 16, 0, Math.PI * 2);
  x.fill();
  x.font = '400 34px "Dela Gothic One", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 7;
  x.strokeStyle = '#4a2a12';
  x.strokeText(text, 146, 48);
  x.fillStyle = '#fff6e0';
  x.fillText(text, 146, 48);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 季節ごとの小物: 春のチューリップ・夏のひまわりとしげみ・秋のキノコと落ち葉の山・冬の雪だるまと雪の山
function buildSeasonProps(g, st, rand, near, isle) {
  const spot = (area, tries = 60) => {
    for (let i = 0; i < tries; i++) {
      const a = rand() * Math.PI * 2, r = 0.2 + rand() * 0.68;
      const x = Math.cos(a) * isle.rx * r, z = Math.sin(a) * isle.rz * r;
      if (near(x, z, 1.9) || Math.hypot(x, z) < 5.5) continue;
      if (areaAt(st, x, z) === area) return [x, z];
    }
    return null;
  };
  const stem = toonMaterial(0x4f8a3a);
  // 春: チューリップの花壇
  const tulips = [0xff6a8a, 0xffd23c, 0xffffff, 0xff9ad0].map((h) => toonMaterial(h));
  for (let k = 0; k < 9; k++) {
    const p = spot('spring');
    if (!p) continue;
    for (let i = 0; i < 7; i++) {
      const x = p[0] + (rand() - 0.5) * 1.4, z = p[1] + (rand() - 0.5) * 1.4;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 4), stem);
      s.position.set(x, 0.22, z);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.65), tulips[(k + i) % tulips.length]);
      f.rotation.x = Math.PI;
      f.position.set(x, 0.52, z);
      g.add(s, f);
    }
  }
  // 夏: ひまわりと、まるいしげみ
  const petal = toonMaterial(0xffc81e), seed = toonMaterial(0x6b3a1a);
  const bush = foliageClump(rand, { detail: 1, balls: 3, bottom: 0x2f7a35, top: 0x7fc25a });
  const bushMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient });
  for (let k = 0; k < 8; k++) {
    const p = spot('summer');
    if (!p) continue;
    for (let i = 0; i < 3; i++) {
      const x = p[0] + (rand() - 0.5) * 1.2, z = p[1] + (rand() - 0.5) * 1.2, h = 0.9 + rand() * 0.5;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, h, 5), stem);
      s.position.set(x, h / 2, z);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 12), petal);
      head.rotation.x = Math.PI / 2.4;
      head.position.set(x, h, z);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.07, 10), seed);
      c.rotation.x = Math.PI / 2.4;
      c.position.set(x, h + 0.01, z + 0.02);
      g.add(s, head, c);
    }
    const b = spot('summer');
    if (b) {
      const m = new THREE.Mesh(bush, bushMat);
      m.scale.setScalar(0.9 + rand() * 0.5);
      m.position.set(b[0], 0.3, b[1]);
      g.add(m);
    }
  }
  // 秋: キノコと、落ち葉の山
  const cap = toonMaterial(0xe8402f), dot = toonMaterial(0xffffff), mstem = toonMaterial(0xfff1d6), pile = toonMaterial(0xe0782e), pile2 = toonMaterial(0xc4532a);
  for (let k = 0; k < 10; k++) {
    const p = spot('autumn');
    if (!p) continue;
    if (k % 2) {
      for (let i = 0; i < 3; i++) {
        const x = p[0] + (rand() - 0.5) * 0.9, z = p[1] + (rand() - 0.5) * 0.9, s = 0.18 + rand() * 0.16;
        const st2 = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.35, s * 0.45, s * 1.3, 6), mstem);
        st2.position.set(x, s * 0.65, z);
        const c = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), cap);
        c.position.set(x, s * 1.2, z);
        const d = new THREE.Mesh(new THREE.SphereGeometry(s * 0.2, 5, 4), dot);
        d.position.set(x + s * 0.45, s * 1.55, z + s * 0.3);
        g.add(st2, c, d);
      }
    } else {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), k % 4 ? pile : pile2);
      m.scale.set(1.1 + rand() * 0.6, 0.45, 0.9 + rand() * 0.5);
      m.position.set(p[0], 0, p[1]);
      g.add(m);
    }
  }
  // 冬: 雪だるまと、雪の山
  const snow = toonMaterial(0xf6fbff), coal = toonMaterial(0x2b2b2b), carrot = toonMaterial(0xff8a2a), scarf = toonMaterial(0xe8402f);
  for (let k = 0; k < 7; k++) {
    const p = spot('winter');
    if (!p) continue;
    if (k < 3) {
      const [x, z] = p;
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), snow);
      body.position.set(x, 0.5, z);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 10), snow);
      head.position.set(x, 1.3, z);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 6), carrot);
      nose.rotation.x = Math.PI / 2;
      nose.position.set(x, 1.3, z + 0.45);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.07, 6, 16), scarf);
      band.rotation.x = Math.PI / 2;
      band.position.set(x, 1.0, z);
      g.add(body, head, nose, band);
      for (const ox of [-0.13, 0.13]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), coal);
        eye.position.set(x + ox, 1.42, z + 0.33);
        g.add(eye);
      }
    } else {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), snow);
      m.scale.set(1.2 + rand() * 0.7, 0.4, 1.0 + rand() * 0.5);
      m.position.set(p[0], 0, p[1]);
      g.add(m);
    }
  }
}

// 季節ごとに舞うもの(演出なので Math.random): 春は桜の花びら、夏はチョウ、秋は落ち葉、冬は雪
function createDrifters(scene, st, isle) {
  const kinds = {
    spring: { color: 0xffc3d6, geo: new THREE.CircleGeometry(0.09, 5), fall: 0.5, sway: 1.2, n: 40 },
    summer: { color: 0xffe14a, geo: new THREE.PlaneGeometry(0.22, 0.14), fall: -0.05, sway: 2.2, n: 14 },
    autumn: { color: 0xe8642c, geo: new THREE.CircleGeometry(0.12, 5), fall: 0.7, sway: 1.4, n: 40 },
    winter: { color: 0xffffff, geo: new THREE.SphereGeometry(0.06, 5, 4), fall: 0.6, sway: 0.5, n: 60 },
  };
  const all = [];
  for (const [area, k] of Object.entries(kinds)) {
    const mesh = new THREE.InstancedMesh(k.geo, new THREE.MeshBasicMaterial({ color: k.color, side: THREE.DoubleSide }), k.n);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const ps = [];
    for (let i = 0; i < k.n; i++) {
      let x = 0, z = 0;
      for (let t = 0; t < 40; t++) {
        x = (Math.random() - 0.5) * isle.rx * 1.7;
        z = (Math.random() - 0.5) * isle.rz * 1.7;
        if (areaAt(st, x, z) === area) break;
      }
      ps.push({ x, z, y: Math.random() * 6, ph: Math.random() * 6, x0: x, z0: z });
    }
    all.push({ mesh, k, ps });
  }
  const dummy = new THREE.Object3D();
  let t = 0;
  return (dt) => {
    t += dt;
    for (const { mesh, k, ps } of all) {
      ps.forEach((p, i) => {
        p.y -= k.fall * dt;
        if (k.fall < 0) p.y = 1.2 + Math.sin(t * 1.3 + p.ph) * 0.6; // チョウはふわふわ
        if (p.y < 0) p.y = 5 + Math.random() * 2;
        const x = p.x0 + Math.sin(t * 0.7 + p.ph) * k.sway, z = p.z0 + Math.cos(t * 0.5 + p.ph) * k.sway * 0.6;
        dummy.position.set(x, p.y, z);
        dummy.rotation.set(t * 2 + p.ph, t * 1.3 + p.ph, k.fall < 0 ? Math.sin(t * 18 + p.ph) * 0.8 : 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
}

export function buildBoardScene(scene, st) {
  const g = new THREE.Group();
  const rand = makeRand(2024);
  const isle = islandShape(st);

  // ── 島の上: 季節ごとの地面の色 ─────────────────────
  {
    const rings = 30, segs = 120;
    const pos = [], col = [], uv = [], idx = [];
    const c = new THREE.Color();
    const push = (x, z) => {
      const r = Math.hypot(x / isle.rx, z / isle.rz);
      const y = r > 0.85 ? -(((r - 0.85) / 0.15) ** 2) * 0.6 : Math.sin(x * 0.3) * Math.cos(z * 0.25) * 0.08;
      pos.push(x, y, z);
      uv.push(x / 4, z / 4);
      groundColor(st, x, z, c);
      // ところどころ明るく・暗く
      const n = Math.sin(x * 0.7 + z * 0.3) * Math.sin(z * 0.6 - x * 0.2);
      c.offsetHSL(0, 0, n * 0.04);
      col.push(c.r, c.g, c.b);
    };
    push(0, 0);
    for (let i = 1; i <= rings; i++) {
      const k = i / rings;
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        push(Math.cos(a) * isle.rx * k, Math.sin(a) * isle.rz * k);
      }
    }
    for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
    for (let i = 1; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = 1 + (i - 1) * segs + j, b = 1 + (i - 1) * segs + ((j + 1) % segs);
        idx.push(a, b, a + segs, b, b + segs, a + segs);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient, map: grassTexture() });
    m.map.repeat.set(1, 1);
    const top = new THREE.Mesh(geo, m);
    top.name = 'islandTop';
    top.receiveShadow = true;
    g.add(top);
  }
  // ── 島の下: 岩(下へ細くなる)と、垂れるこけ ────────────
  {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector2(Math.max(0.01, (1 - t ** 1.6) * 1.0 + Math.sin(t * 9) * 0.03), -0.55 - t * 14));
    }
    const geo = new THREE.LatheGeometry(pts, 48);
    geo.scale(isle.rx, 1, isle.rz);
    const p = geo.attributes.position;
    const cols = [];
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      p.setX(i, p.getX(i) * (1 + (rand() - 0.5) * 0.08));
      p.setZ(i, p.getZ(i) * (1 + (rand() - 0.5) * 0.08));
      c.setHex(0x8a6a50).offsetHSL(0, 0, (p.getY(i) / 14) * 0.12 + (rand() - 0.5) * 0.04);
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient })));
    const moss = toonMaterial(0x6aa956), snow = toonMaterial(0xf2f8ff), leafy = toonMaterial(0xd27a32);
    for (let i = 0; i < 80; i++) {
      const a = (i / 80) * Math.PI * 2 + rand() * 0.05;
      const x = Math.cos(a) * isle.rx, z = Math.sin(a) * isle.rz;
      const area = areaAt(st, x * 0.8, z * 0.8);
      const len = 0.4 + rand() * 1.0;
      const drip = new THREE.Mesh(new THREE.ConeGeometry(0.25 + rand() * 0.2, len, 6), area === 'winter' ? snow : area === 'autumn' ? leafy : moss);
      drip.rotation.x = Math.PI;
      drip.position.set(x * 1.0, -0.6 - len / 2, z * 1.0);
      g.add(drip);
    }
  }

  // ── 道: マスとマスのあいだの飛び石 ─────────────────
  {
    const stone = new THREE.CylinderGeometry(0.22, 0.26, 0.08, 8);
    const spots = [];
    for (const q of st.squares) {
      for (const n of q.next) {
        const b = st.squares[n];
        const d = Math.hypot(b.x - q.x, b.z - q.z);
        const k = Math.max(1, Math.round((d - 1.6) / 0.55));
        for (let i = 1; i <= k; i++) {
          const u = 0.5 + ((i - (k + 1) / 2) / (k + 1)) * ((d - 1.4) / d);
          spots.push([q.x + (b.x - q.x) * u, q.z + (b.z - q.z) * u, q.area]);
        }
      }
    }
    const mesh = new THREE.InstancedMesh(stone, toonMaterial(0xffffff), spots.length);
    const dummy = new THREE.Object3D();
    const c = new THREE.Color();
    spots.forEach(([x, z, area], i) => {
      dummy.position.set(x, 0.05, z);
      dummy.rotation.y = rand() * 3;
      dummy.scale.setScalar(0.8 + rand() * 0.3);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      c.setHex(area === 'winter' ? 0xb8c8d8 : area === 'autumn' ? 0xc29a6a : 0xd8cbb0);
      mesh.setColorAt(i, c);
    });
    mesh.receiveShadow = true;
    g.add(mesh);
  }

  // ── マス: 季節の葉っぱ + 種類の札 ─────────────────
  const leafGeos = {}, leafMats = {};
  for (const area of Object.keys(SEASON)) {
    const geo = new THREE.ExtrudeGeometry(leafShape(area), { depth: 0.1, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.04, bevelSegments: 1, curveSegments: 10 });
    geo.rotateX(-Math.PI / 2);
    geo.scale(1.0, 1, 1.0);
    leafGeos[area] = geo;
    leafMats[area] = toonMaterial(SEASON[area].leaf);
  }
  const badgeGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.07, 28);
  const badgeRim = toonMaterial(0x4a2a12);
  const badgeFace = new THREE.CircleGeometry(0.5, 28).rotateX(-Math.PI / 2); // 絵の上が奥(-z)。手前から読める
  const badgeMats = {};
  const badgeMat = (kind, ice) => {
    const key = kind + (ice ? ':ice' : '');
    badgeMats[key] ??= new THREE.MeshToonMaterial({ map: badgeTexture(kind, ice), gradientMap: toonGradient });
    return badgeMats[key];
  };
  const tops = []; // マスの上面の高さ
  for (const q of st.squares) {
    const leaf = new THREE.Mesh(leafGeos[q.area], leafMats[q.area]);
    leaf.position.set(q.x, 0.06, q.z);
    // 葉の先を、次のマスのほうへ向ける
    const n = st.squares[q.next[0]];
    leaf.rotation.y = Math.atan2(n.x - q.x, n.z - q.z) + Math.PI;
    leaf.receiveShadow = true;
    g.add(leaf);
    // 札: こげ茶のふち(円柱)に、絵を貼った平らな円をのせる(円柱のふたに貼ると、絵が回ってしまう)
    const rim = new THREE.Mesh(badgeGeo, badgeRim);
    rim.position.set(q.x, 0.18, q.z);
    const face = new THREE.Mesh(badgeFace, badgeMat(q.kind, q.ice));
    face.position.set(q.x, 0.222, q.z);
    face.userData.noMerge = true;
    g.add(rim, face);
    tops[q.id] = 0.24;
  }

  // ── 季節の飾り ────────────────────────────────
  const near = (x, z, r) => st.squares.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < r * r);
  // 木: 島のふちと、道の内がわ
  const crownMats = {};
  const trunkMat = toonMaterial(0x6b4c36);
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 7);
  trunkGeo.translate(0, 0.5, 0);
  const clumps = {};
  for (const [area, s] of Object.entries(SEASON)) {
    clumps[area] = foliageClump(rand, { detail: 1, balls: 4, bottom: s.tree[0], top: s.tree[1] });
    crownMats[area] = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient });
  }
  const pine = (() => {
    const cones = [];
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.ConeGeometry(0.9 - i * 0.22, 1.1, 8);
      cone.translate(0, 1.0 + i * 0.6, 0);
      cones.push(cone);
    }
    return cones;
  })();
  const pineMat = toonMaterial(0x2f6a4a), snowCap = toonMaterial(0xf6fbff);
  let placed = 0;
  for (let i = 0; i < 400 && placed < 70; i++) {
    const a = rand() * Math.PI * 2, r = 0.25 + rand() * 0.6;
    const x = Math.cos(a) * isle.rx * r, z = Math.sin(a) * isle.rz * r;
    if (near(x, z, 2.4)) continue;
    if (Math.hypot(x, z) < 6.5) continue; // まん中は大木のため
    const area = areaAt(st, x, z);
    const h = 2.4 + rand() * 1.8;
    if (area === 'winter') {
      for (let k = 0; k < 3; k++) {
        const m = new THREE.Mesh(pine[k], k === 2 ? snowCap : pineMat);
        m.scale.setScalar(h / 3);
        m.position.set(x, 0, z);
        g.add(m);
      }
      const t = new THREE.Mesh(trunkGeo, trunkMat);
      t.scale.set(1, 0.6, 1);
      t.position.set(x, 0, z);
      g.add(t);
    } else {
      const t = new THREE.Mesh(trunkGeo, trunkMat);
      t.scale.set(1, h * 0.55, 1);
      t.position.set(x, 0, z);
      const c = new THREE.Mesh(clumps[area], crownMats[area]);
      c.scale.setScalar(h * 0.42);
      c.position.set(x, h * 0.62, z);
      g.add(t, c);
    }
    placed++;
  }
  // 春: 池(ハスの近道の下) / 冬: 凍った池(氷の近道の下)
  const pondUnder = (ids, color, opacity) => {
    const qs = ids.map((id) => st.squares[id]);
    const cx = qs.reduce((s, q) => s + q.x, 0) / qs.length, cz = qs.reduce((s, q) => s + q.z, 0) / qs.length;
    const w = Math.max(...qs.map((q) => Math.abs(q.x - cx))) + 2.2, d = Math.max(...qs.map((q) => Math.abs(q.z - cz))) + 2.2;
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshToonMaterial({ color, transparent: opacity < 1, opacity, gradientMap: toonGradient }));
    m.rotation.x = -Math.PI / 2;
    m.scale.set(w, d, 1);
    m.position.set(cx, 0.03, cz);
    g.add(m);
    return { cx, cz, w, d };
  };
  if (st.shortcuts?.lily) {
    const p = pondUnder(st.shortcuts.lily, 0x6cc3e0, 0.95);
    for (let i = 0; i < 6; i++) {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.35, 12, 0.3, Math.PI * 1.8).rotateX(-Math.PI / 2), toonMaterial(0x4f9a46));
      pad.position.set(p.cx + (rand() - 0.5) * p.w * 1.4, 0.05, p.cz + (rand() - 0.5) * p.d * 1.4);
      g.add(pad);
    }
  }
  if (st.shortcuts?.ice) pondUnder(st.shortcuts.ice, 0xcfeeff, 1);
  // 秋: すべり台(落ち葉の帯)
  const chute = toonMaterial(0xe0782e);
  for (const q of st.squares) {
    if (q.slideTo === undefined) continue;
    const b = st.squares[q.slideTo];
    const pts = [0, 0.5, 1].map((t) => new THREE.Vector3(q.x + (b.x - q.x) * t, 0.12 + Math.sin(t * Math.PI) * 0.8, q.z + (b.z - q.z) * t));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.35, 6), chute));
  }
  // 夏: どうぐ屋(しま模様の屋根の屋台)
  for (const q of st.squares) {
    if (q.kind !== 'shop') continue;
    const len = Math.hypot(q.x, q.z) || 1;
    const sx = q.x + (q.x / len) * 2.4, sz = q.z + (q.z / len) * 2.4;
    const stall = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.9), toonMaterial(0xb07a4a));
    counter.position.y = 0.45;
    stall.add(counter);
    for (const ox of [-0.8, 0.8]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2, 6), toonMaterial(0x8a5a32));
      post.position.set(ox, 1, 0.35);
      stall.add(post);
    }
    for (let k = 0; k < 6; k++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 1.3), toonMaterial(k % 2 ? 0xfff6e0 : 0xe8402f));
      stripe.position.set(-0.85 + k * 0.34, 2.05, 0.1);
      stripe.rotation.x = 0.25;
      stall.add(stripe);
    }
    stall.position.set(sx, 0, sz);
    stall.rotation.y = Math.atan2(q.x - sx, q.z - sz);
    g.add(stall);
  }
  // まん中: どんぐりの大木(全体を見るときに盤をかくさないよう、低めに)。どんぐりがぶら下がる
  {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.3, 4.5, 12), toonMaterial(0x6b4c36));
    trunk.position.y = 2.25;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const root = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.6, 6), toonMaterial(0x6b4c36));
      root.position.set(Math.cos(a) * 1.3, 0.3, Math.sin(a) * 1.3);
      root.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      g.add(root);
    }
    const big = foliageClump(rand, { detail: 2, balls: 6, bottom: 0x2f6b35, top: 0x8fcf5f });
    const crown = new THREE.Mesh(big, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient }));
    crown.scale.set(4.6, 3.6, 4.6);
    crown.position.y = 6.2;
    g.add(crown);
    const acorn = acornGeometry();
    const acornMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient });
    for (let i = 0; i < 12; i++) {
      const a = rand() * Math.PI * 2, r = 2.2 + rand() * 1.6;
      const m = new THREE.Mesh(acorn, acornMat);
      m.scale.setScalar(3.2);
      m.position.set(Math.cos(a) * r, 4.4 + rand() * 0.8, Math.sin(a) * r);
      g.add(m);
    }
  }

  // エリアの看板: 各季節の入口に、木の看板
  const areaNames = Object.fromEntries((st.areas || []).map((a) => [a.key, a.name]));
  for (const area of Object.keys(SEASON)) {
    const first = st.squares.find((q) => q.area === area && !q.path);
    if (!first || !areaNames[area]) continue;
    const len = Math.hypot(first.x, first.z) || 1;
    const x = first.x + (first.x / len) * 2.4, z = first.z + (first.z / len) * 2.4;
    const sign = new THREE.Group();
    for (const ox of [-0.75, 0.75]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.8, 6), toonMaterial(0x8a5a32));
      post.position.set(ox, 0.9, 0);
      sign.add(post);
    }
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.75), new THREE.MeshToonMaterial({ map: signTexture(areaNames[area], SEASON[area]), gradientMap: toonGradient, side: THREE.DoubleSide }));
    board.position.y = 1.45;
    board.userData.noMerge = true;
    sign.add(board);
    sign.position.set(x, 0, z);
    sign.rotation.y = 0; // 字はいつも手前(カメラのほう)へ向ける
    g.add(sign);
  }

  // 季節の飾り
  buildSeasonProps(g, st, rand, near, isle);

  mergeStatic(g);
  scene.add(g);
  const drift = createDrifters(scene, st, isle);
  g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });

  return {
    group: g,
    // マスの上の、コマが立つところ
    squarePos(id, out = new THREE.Vector3()) {
      const q = st.squares[id];
      return out.set(q.x, tops[id] ?? 0.24, q.z);
    },
    isle,
    update: drift,
  };
}
