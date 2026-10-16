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
import { foliageClump, makeRand } from '../games/daruma/trees.js';
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
      c.setHex(SEASON[areaAt(st, x, z)].ground);
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
    geo.scale(0.85, 1, 0.85);
    leafGeos[area] = geo;
    leafMats[area] = toonMaterial(SEASON[area].leaf);
  }
  const badgeGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.06, 24);
  const badgeMats = {};
  const badgeMat = (kind, ice) => {
    const key = kind + (ice ? ':ice' : '');
    badgeMats[key] ??= [toonMaterial(0x4a2a12), new THREE.MeshToonMaterial({ map: badgeTexture(kind, ice), gradientMap: toonGradient }), toonMaterial(0x4a2a12)];
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
    const badge = new THREE.Mesh(badgeGeo, badgeMat(q.kind, q.ice));
    badge.position.set(q.x, 0.2, q.z);
    badge.rotation.y = Math.PI; // 字を手前(+z)へ
    g.add(badge);
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
  // まん中: 大きなどんぐりの木
  {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.6, 7, 12), toonMaterial(0x6b4c36));
    trunk.position.y = 3.5;
    g.add(trunk);
    const big = foliageClump(rand, { detail: 2, balls: 6, bottom: 0x2f6b35, top: 0x8fcf5f });
    const crown = new THREE.Mesh(big, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient }));
    crown.scale.setScalar(6.5);
    crown.position.y = 8.5;
    g.add(crown);
  }

  mergeStatic(g);
  scene.add(g);
  g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });

  return {
    group: g,
    // マスの上の、コマが立つところ
    squarePos(id, out = new THREE.Vector3()) {
      const q = st.squares[id];
      return out.set(q.x, tops[id] ?? 0.24, q.z);
    },
    isle,
  };
}
