// glb を組み立てる部品。キャラ(characters.js)と NPC(npcs.js)が共有する。
//
// 素材はふつうの PBR(MeshStandardMaterial)と、ライトの影響を受けない
// MeshBasicMaterial(glTF では KHR_materials_unlit)だけを使う。
// どの glTF ビューアでも同じ色に見えるようにするため。

import * as THREE from 'three';

const V3 = THREE.Vector3;

export const INK = 0x2b1d1c;
export const CHEEK = 0xff8f9f;
export const WHITE = 0xffffff;

// ── 形と素材 ────────────────────────────────────────

// 面を裏返した複製。少し大きくして重ねると、はみ出した裏面が輪郭線になる。
// glTF には「裏面だけ描く」指定がないので、向きそのものを裏返しておく。
export function flipped(geo) {
  const g = geo.clone();
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const t = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = t;
  }
  const n = g.attributes.normal.array;
  for (let i = 0; i < n.length; i++) n[i] = -n[i];
  return g;
}

export const GEO = {
  sphere: new THREE.SphereGeometry(1, 24, 16),
  box: new THREE.BoxGeometry(1, 1, 1),
  arc: new THREE.TorusGeometry(0.05, 0.014, 6, 16, Math.PI),       // ∩(にこにこの目)
  smile: new THREE.TorusGeometry(0.045, 0.012, 6, 16, Math.PI),    // 口
  halfDisc: new THREE.CircleGeometry(0.07, 20, Math.PI, Math.PI),  // あけた口
  disc: new THREE.CircleGeometry(0.06, 20),
  scarf: new THREE.TorusGeometry(0.3, 0.075, 10, 28),
  star: new THREE.OctahedronGeometry(0.055),
};
const INNER = new Map();
export function inner(geo) {
  if (!INNER.has(geo)) INNER.set(geo, flipped(geo));
  return INNER.get(geo);
}

export const LINE_W = 0.022; // 輪郭線の太さ(ワールド単位)

const MATS = new Map();
export function cached(key, make) {
  if (!MATS.has(key)) MATS.set(key, make());
  return MATS.get(key);
}
const hexName = (hex) => hex.toString(16).padStart(6, '0');

export function lineColor(hex) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s * 0.85), Math.max(0.1, hsl.l * 0.34));
  return c;
}

export function solid(hex) {
  return cached('s' + hex, () => {
    const m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8, metalness: 0 });
    m.name = 'col_' + hexName(hex);
    return m;
  });
}
export function flat(hex) {
  return cached('f' + hex, () => {
    const m = new THREE.MeshBasicMaterial({ color: hex });
    m.name = 'flat_' + hexName(hex);
    return m;
  });
}
export function outline(hex) {
  return cached('l' + hex, () => {
    const m = new THREE.MeshBasicMaterial({ color: lineColor(hex) });
    m.name = 'outline';
    return m;
  });
}
export function cheekMat() {
  return cached('cheek', () => {
    const m = new THREE.MeshBasicMaterial({ color: CHEEK, transparent: true, opacity: 0.75 });
    m.name = 'cheek';
    return m;
  });
}

// だ円体。いちばんよく使う部品。
// 輪郭線は軸ごとに LINE_W だけ大きくする(一律に倍率をかけると長い軸だけ太くなる)。
export function blob(color, sx, sy = sx, sz = sx, line = true) {
  const mat = typeof color === 'number' ? solid(color) : color;
  const m = new THREE.Mesh(GEO.sphere, mat);
  m.scale.set(sx, sy, sz);
  if (line) {
    const o = new THREE.Mesh(inner(GEO.sphere), lineFor(mat));
    o.name = 'outline';
    o.scale.set(1 + LINE_W / sx, 1 + LINE_W / sy, 1 + LINE_W / sz);
    m.add(o);
  }
  return m;
}
// だ円体以外の形。輪郭線は一律の倍率で。
export function shape(geo, color, line = 1.1) {
  const mat = typeof color === 'number' ? solid(color) : color;
  const m = new THREE.Mesh(geo, mat);
  if (line) {
    const o = new THREE.Mesh(inner(geo), lineFor(mat));
    o.name = 'outline';
    o.scale.setScalar(line);
    m.add(o);
  }
  return m;
}
export function lineFor(mat) {
  return mat.userData.outline || outline(mat.color.getHex());
}
// ライトの影響を受けない平らな部品(目・口)
export function ink(sx, sy, sz, hex = INK) {
  const m = new THREE.Mesh(GEO.sphere, flat(hex));
  m.scale.set(sx, sy, sz);
  return m;
}

// ── 頭の表面に貼る ────────────────────────────────────

// 半径 R の球の正面側、(x, y) の位置。z は表面に合わせて決まり、
// 向き(+z)は外向きの法線にそろう。lift は表面からの浮かせ量。
export function onSphere(R, x, y, lift = 0) {
  const z = Math.sqrt(Math.max(1e-4, R * R - x * x - y * y));
  return onDir(R, new V3(x, y, z), lift);
}
export function onDir(R, dir, lift = 0) {
  const n = dir.clone().normalize();
  return {
    p: n.clone().multiplyScalar(R + lift),
    q: new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), n),
  };
}
export function anchor(parent, at, name) {
  const g = new THREE.Group();
  if (name) g.name = name;
  g.position.copy(at.p);
  g.quaternion.copy(at.q);
  parent.add(g);
  return g;
}


// ── アニメーションを焼きこむ ─────────────────────────────
// pose(t) がノードを動かす関数。1コマずつ呼んで、nodes の quaternion と、
// extra に挙げた「ノード.属性」(position / scale)をキーフレームにする。
// 最後のコマは t = 0 と同じ姿勢にして、ループのつなぎ目で跳ばないようにする。
export function bake(name, length, nodes, extra, pose, fps = 30) {
  const n = Math.round(length * fps);
  const times = [];
  const rec = new Map();
  const push = (key, arr) => {
    if (!rec.has(key)) rec.set(key, []);
    rec.get(key).push(...arr);
  };
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * length;
    pose(i === n ? 0 : t);
    times.push(t);
    for (const node of nodes) push(node.name + '.quaternion', node.quaternion.toArray());
    for (const [node, prop] of extra) push(node.name + '.' + prop, node[prop].toArray());
  }
  const tracks = [];
  for (const [key, values] of rec) {
    const T = key.endsWith('.quaternion') ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
    tracks.push(new T(key, times, values));
  }
  return new THREE.AnimationClip(name, length, tracks);
}
