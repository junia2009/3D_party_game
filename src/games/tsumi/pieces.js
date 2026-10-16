// どんぐりつみ の「積むもの」6種の形。
//
// - 見た目と判定がずれないように、できた形を ルールのはば w・高さ h にぴったり合わせる(fit)。
//   下の面が y = 0、まん中が x = z = 0。
// - 部品をたくさん組み合わせて作り、mergeStatic で1つにまとめる(描く回数を1回に)。
//   種類ごとに1つ作っておいて、使うたびに clone する(形と素材は使いまわし)。
// - 返すのは Group(大きさ 1)。ぽよん・ぐらぐらは、この Group の scale / rotation で動かす。

import * as THREE from 'three';
import { toonGradient } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { KINDS } from './rules.js';

const vc = () => new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient });
const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: toonGradient });

// 頂点ごとに色を塗る(fn(x, y, z) → Color)
function paint(geo, fn) {
  const p = geo.attributes.position;
  const cols = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.copy(fn(p.getX(i), p.getY(i), p.getZ(i)));
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}
// 頂点を動かす(fn(v) で v を書きかえる)
function warp(geo, fn) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    fn(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t)));

// できた形を、はば w・高さ h・おくゆき d にぴったり合わせる
function fit(content, w, h, d = w) {
  mergeStatic(content);
  const box = new THREE.Box3().setFromObject(content);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  content.position.set(-center.x, -box.min.y, -center.z);
  const f = new THREE.Group();
  f.scale.set(w / size.x, h / size.y, d / size.z);
  f.add(content);
  const g = new THREE.Group();
  g.add(f);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ── どんぐり: とがった先を下に立つ。上はぼうし(うろこ模様)と、ちょこんと軸 ─────
function acorn() {
  const g = new THREE.Group();
  const body = new THREE.LatheGeometry([
    [0, 0], [0.05, 0.02], [0.15, 0.1], [0.28, 0.26], [0.39, 0.46], [0.45, 0.66], [0.46, 0.84], [0.44, 0.94],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 28);
  // つやのある茶色。たてにうすい筋、先はこげ茶
  paint(body, (x, y, z) => {
    const a = Math.atan2(z, x);
    const stripe = 0.5 + 0.5 * Math.sin(a * 9);
    return mix(0x5a3214, mix(0xa8642c, 0xb87536, stripe * 0.6), y / 0.25);
  });
  g.add(new THREE.Mesh(body, vc()));
  // つやの光(ななめ上に、白っぽい細い帯)
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), toon(0xf3d2a8));
  shine.scale.set(0.5, 2.2, 0.5);
  shine.position.set(-0.24, 0.58, 0.33);
  shine.rotation.z = 0.35;
  g.add(shine);
  // ぼうし: うろこのでこぼこと、市松の色
  const cap = new THREE.LatheGeometry([
    [0.46, 0.86], [0.51, 0.9], [0.52, 0.97], [0.47, 1.05], [0.36, 1.11], [0.2, 1.15], [0.07, 1.17], [0, 1.175],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 32);
  warp(cap, (v) => {
    const a = Math.atan2(v.z, v.x);
    const r = Math.hypot(v.x, v.z);
    const bump = 1 + 0.035 * Math.max(0, Math.sin(a * 14 + v.y * 30)) * Math.min(1, r * 4);
    v.x *= bump; v.z *= bump;
  });
  paint(cap, (x, y, z) => {
    const a = Math.atan2(z, x);
    const cell = (Math.floor((a / Math.PI) * 14 + y * 18) & 1);
    return cell ? new THREE.Color(0x9a7a50) : new THREE.Color(0x7a5a36);
  });
  g.add(new THREE.Mesh(cap, vc()));
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.14, 6), toon(0x5e4024));
  stem.position.set(0.02, 1.22, 0);
  stem.rotation.z = -0.3;
  g.add(stem);
  return fit(g, KINDS.acorn.w, KINDS.acorn.h);
}

// ── クルミ: まるくて しわしわ。まん中に つなぎめ の すじ ───────────────
function walnut() {
  const geo = new THREE.IcosahedronGeometry(0.5, 5);
  const depth = [];
  warp(geo, (v) => {
    const n = v.clone().normalize();
    // しわ: いくつかの波を重ねる
    const w1 = Math.sin(n.y * 8 + Math.sin(n.z * 5) * 1.4);
    const w2 = Math.sin(n.z * 7 + n.y * 3 + Math.sin(n.x * 4) * 1.2);
    let k = 1 + 0.04 * (w1 * 0.6 + w2 * 0.4);
    // つなぎめ(x = 0 の面にそって、もり上がるすじ)
    const seam = Math.exp(-((n.x / 0.06) ** 2));
    k += seam * 0.09;
    // 上のほうが少しとがる
    k += Math.max(0, n.y) ** 4 * 0.06;
    depth.push(seam > 0.5 ? 1.2 : w1 * 0.6 + w2 * 0.4);
    v.copy(n.multiplyScalar(0.5 * k));
  });
  let i = 0;
  paint(geo, () => {
    const d = depth[i++];
    return mix(0xd8ac72, 0x8e6234, (0.4 - d) * 0.8);
  });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, vc()));
  return fit(g, KINDS.walnut.w, KINDS.walnut.h);
}

// ── まつぼっくり: うろこを らせんに かさねる。下が太くて、上が細い ────────
function pinecone() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), toon(0x4a2a12));
  core.scale.set(1, 1.7, 1);
  core.position.y = 0.55;
  g.add(core);
  const scaleGeo = paint(new THREE.SphereGeometry(0.16, 8, 6), (x, y, z) => mix(0x6a3e1a, 0xc08a50, (z + 0.16) / 0.32));
  scaleGeo.scale(1, 0.45, 1.1);
  const rows = 9;
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const y = 0.08 + t * 0.95;
    const rad = 0.42 * Math.sin(Math.PI * (0.18 + t * 0.78)) ** 0.7 + 0.05;
    const n = Math.max(5, Math.round(10 - t * 4));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r * 0.55;
      const m = new THREE.Mesh(scaleGeo, vc());
      m.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
      m.lookAt(Math.cos(a) * rad * 3, y - 0.25 + t * 0.2, Math.sin(a) * rad * 3); // 外へ、少し下向きに開く
      m.scale.setScalar(1 - t * 0.45);
      g.add(m);
    }
  }
  // てっぺんは小さく平らに(乗せるところ)
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.08, 8), toon(0x7a4a22));
  top.position.y = 1.1;
  g.add(top);
  // 下に軸
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 6), toon(0x5e3a1c));
  stem.position.y = 0.0;
  g.add(stem);
  return fit(g, KINDS.pinecone.w, KINDS.pinecone.h);
}

// ── キノコ: 赤いかさに白い水玉、かさの裏はひだ、軸にはスカート ──────────────
function mushroom() {
  const g = new THREE.Group();
  const stem = new THREE.LatheGeometry([
    [0, 0], [0.2, 0], [0.22, 0.04], [0.18, 0.2], [0.16, 0.42], [0.15, 0.58], [0, 0.58],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 16);
  paint(stem, (x, y) => mix(0xe9d6b4, 0xfff6e4, y / 0.3));
  g.add(new THREE.Mesh(stem, vc()));
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.25, 0.08, 16, 1, true), new THREE.MeshToonMaterial({ color: 0xfff2dc, gradientMap: toonGradient, side: THREE.DoubleSide }));
  skirt.position.y = 0.4;
  g.add(skirt);
  // かさ(上は少し平ら)
  const capGeo = new THREE.LatheGeometry([
    [0.5, 0.5], [0.52, 0.56], [0.5, 0.66], [0.42, 0.78], [0.28, 0.86], [0.12, 0.89], [0, 0.9],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 32);
  paint(capGeo, (x, y) => mix(0xb8281e, 0xec4a34, (y - 0.5) / 0.3));
  g.add(new THREE.Mesh(capGeo, vc()));
  // かさの裏(ひだ): うすい色の円盤に、放射の すじ
  const under = new THREE.CircleGeometry(0.5, 32);
  under.rotateX(Math.PI / 2);
  under.translate(0, 0.5, 0);
  paint(under, (x, y, z) => {
    const a = Math.atan2(z, x);
    return mix(0xe8cfa6, 0xc9a77a, 0.5 + 0.5 * Math.sin(a * 24));
  });
  g.add(new THREE.Mesh(under, vc()));
  // 白い水玉(かさの面にそって)
  const dots = [[0, 0.95, 0.09], [0.32, 0.2, 0.08], [0.33, 2.3, 0.075], [0.34, 4.3, 0.08], [0.43, 1.2, 0.06], [0.44, 3.3, 0.06], [0.42, 5.4, 0.055], [0.18, 3.1, 0.06]];
  for (const [r, a, s] of dots) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 6), toon(0xfffaf0));
    // かさの高さ(だいたい)
    const y = r < 0.12 ? 0.9 : r < 0.3 ? 0.86 : r < 0.44 ? 0.78 : 0.68;
    d.position.set(Math.cos(a) * r, y - 0.005, Math.sin(a) * r);
    d.scale.y = 0.35;
    d.lookAt(Math.cos(a) * r * 2, y + 0.6, Math.sin(a) * r * 2);
    d.rotateX(Math.PI / 2);
    g.add(d);
  }
  return fit(g, KINDS.mushroom.w, KINDS.mushroom.h);
}

// ── 葉っぱ: 秋の色(緑・黄・だいだい・赤)。主脈と側脈、少し反って、柄が出る ──────
const LEAF_COLORS = [
  [0x4f9a3c, 0x7cc55a, 0x2f7a2a],
  [0xe2b02a, 0xf4d054, 0xb98418],
  [0xe07a26, 0xf3a24a, 0xb4541a],
  [0xc8402c, 0xe8664a, 0x8e2a1e],
];
function leaf(variant) {
  const [base, light, vein] = LEAF_COLORS[variant];
  const g = new THREE.Group();
  const sh = new THREE.Shape();
  // 先のとがった、ふちが少しぎざぎざの葉(x が長いほう)
  const pts = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0 → 1 で、上のふちを 根もと → 先
    const x = -0.5 + t;
    const wdt = 0.3 * Math.sin(Math.PI * t) ** 0.8 * (1 - t * 0.25) + (i % 4 === 2 ? 0.015 : 0);
    pts.push([x, wdt]);
  }
  sh.moveTo(-0.5, 0);
  for (const [x, y] of pts) sh.lineTo(x, y);
  for (const [x, y] of [...pts].reverse()) sh.lineTo(x, -y);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.015, bevelSegments: 1, curveSegments: 4 });
  geo.rotateX(-Math.PI / 2);
  // ふちが少し上へ反る(まん中は平ら。乗せる面)
  warp(geo, (v) => { v.y += (v.z * v.z) * 0.55 + Math.max(0, v.x - 0.3) * 0.08; });
  paint(geo, (x, y, z) => mix(light, base, Math.abs(z) / 0.25));
  g.add(new THREE.Mesh(geo, vc()));
  // 主脈と側脈
  const veinMat = toon(vein);
  const mid = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.012, 0.018), veinMat);
  mid.position.set(-0.03, 0.06, 0);
  g.add(mid);
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.2 - i * 0.025, 0.01, 0.012), veinMat);
      side.position.set(-0.28 + i * 0.18 + 0.05, 0.06, s * 0.06);
      side.rotation.y = s * 0.7;
      g.add(side);
    }
  }
  // 柄
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.14, 5), veinMat);
  stalk.rotation.z = Math.PI / 2 + 0.25;
  stalk.position.set(-0.56, 0.06, 0);
  g.add(stalk);
  return fit(g, KINDS.leaf.w, KINDS.leaf.h, KINDS.leaf.w * 0.5);
}

// ── 小枝: すこし曲がった枝。木の皮の色、切り口は明るい木の色と年輪。新芽が1つ ──────
function twig() {
  const g = new THREE.Group();
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.7, 0.0, 0), new THREE.Vector3(-0.25, 0.025, 0.04), new THREE.Vector3(0.2, 0.0, -0.03), new THREE.Vector3(0.7, 0.02, 0.02),
  ]);
  const tube = new THREE.TubeGeometry(path, 24, 0.075, 8, false);
  // 皮: すじと、ところどころ明るいところ
  paint(tube, (x, y, z) => mix(0x6e4426, 0x9a6a40, 0.5 + 0.5 * Math.sin(x * 40) * Math.sin(Math.atan2(y, z) * 3)));
  g.add(new THREE.Mesh(tube, vc()));
  // 切り口(両はし)
  for (const [end, dir] of [[path.getPoint(0), path.getTangent(0)], [path.getPoint(1), path.getTangent(1)]]) {
    const cut = new THREE.CircleGeometry(0.075, 12);
    paint(cut, (x, y) => mix(0xf0d2a0, 0xc89a62, Math.abs(Math.sin(Math.hypot(x, y) * 90))));
    const m = new THREE.Mesh(cut, vc());
    m.position.copy(end);
    m.lookAt(end.clone().add(end.x < 0 ? dir.clone().negate() : dir));
    g.add(m);
  }
  // 小さな わき枝 と 新芽(上に出すぎない)
  const sub = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.18, 6), toon(0x7a4c2a));
  sub.position.set(0.32, 0.06, 0.05);
  sub.rotation.set(0.9, 0, -0.9);
  g.add(sub);
  const bud = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), toon(0x7cc55a));
  bud.scale.set(0.8, 1.3, 0.8);
  bud.position.set(0.38, 0.1, 0.13);
  bud.rotation.z = -0.8;
  g.add(bud);
  // こぶ
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), toon(0x5e3a1c));
  knot.scale.set(1, 0.6, 1);
  knot.position.set(-0.3, 0.03, -0.05);
  g.add(knot);
  return fit(g, KINDS.twig.w, KINDS.twig.h, KINDS.twig.h * 1.3);
}

export function pieceMeshes() {
  const templates = {
    acorn: [acorn()],
    walnut: [walnut()],
    pinecone: [pinecone()],
    mushroom: [mushroom()],
    leaf: [0, 1, 2, 3].map((v) => leaf(v)),
    twig: [twig()],
  };
  let n = 0;
  return (kind) => {
    const list = templates[kind];
    const g = list[n++ % list.length].clone();
    // 少しだけ向きを変えて、同じものが並んでも単調にしない(はばは変わらないように、y 軸で ±わずか)
    g.children[0].rotation.y = kind === 'leaf' || kind === 'twig' ? (Math.random() - 0.5) * 0.3 : Math.random() * Math.PI * 2;
    return g;
  };
}
