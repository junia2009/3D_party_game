// 動かない部品を、まとめて少ない回数で描けるようにする。
//
// 3D の重さは「描く回数」で決まることが多い(スマホでは 1 フレーム 100〜150 回くらいまでが目安)。
// キャラもステージも、球や円柱を何十個も組み合わせて作ってあるので、そのままだと描く回数が多すぎる。
//
// - 色だけちがう素材(トゥーン・光の当たらない平らな色)は、色を頂点に焼きこんで1つにまとめる。
// - 模様のある素材・半透明・プレイヤーの色(あとで塗りかえる)は、素材ごとにまとめる。
// - anchors に入っているノード(動く・切り替える部品)ごとに別々にまとめる。
//   その下の部品は、いちばん近い anchor にくっつく。

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonGradient } from './models.js'; // models.js もこのファイルを読む(循環)が、使うのは関数の中だけなので問題ない

const toonVC = () => new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient });
const unlitVC = () => new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });

// 頂点色に焼きこんでよい素材か。'toon' / 'unlit' / null(素材のまま残す)
function bakeKind(m) {
  // 模様・半透明・あとで塗りかえる色・両面表示のものは、素材のまま残す
  // (両面表示を頂点色の素材にまとめると、裏から見たときに消える)
  if (m.map || m.transparent || m.name.startsWith('player') || m.side !== THREE.FrontSide) return null;
  if (m.isMeshToonMaterial || m.isMeshStandardMaterial || m.isMeshLambertMaterial) return 'toon';
  if (m.isMeshBasicMaterial) return 'unlit';
  return null;
}

function prepare(mesh, rel, withColor, withUv) {
  const src = mesh.geometry;
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', src.attributes.position.clone());
  if (src.attributes.normal) geo.setAttribute('normal', src.attributes.normal.clone());
  else {
    geo.computeVertexNormals();
  }
  if (withUv && src.attributes.uv) geo.setAttribute('uv', src.attributes.uv.clone());
  if (src.index) geo.setIndex(src.index.clone());
  if (withColor) {
    const n = geo.attributes.position.count;
    const base = mesh.material.color;
    const srcColor = mesh.material.vertexColors ? src.attributes.color : null;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = srcColor ? srcColor.getX(i) : 1, g = srcColor ? srcColor.getY(i) : 1, b = srcColor ? srcColor.getZ(i) : 1;
      arr[i * 3] = base.r * r;
      arr[i * 3 + 1] = base.g * g;
      arr[i * 3 + 2] = base.b * b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.applyMatrix4(rel);
  return geo;
}

export function mergeStatic(root, isAnchor = () => false) {
  const anchors = new Set([root]);
  root.traverse((o) => { if (o !== root && isAnchor(o)) anchors.add(o); });
  // 大きさ 0 の部品(使わない表情・星)があると位置の計算が壊れる(逆行列が作れない)ので、
  // まとめる間だけ大きさを戻す
  const zero = [];
  root.traverse((o) => {
    if (o.scale.x === 0 || o.scale.y === 0 || o.scale.z === 0) {
      zero.push([o, o.scale.clone()]);
      o.scale.set(1, 1, 1);
    }
  });
  root.updateMatrixWorld(true);
  const anchorOf = (o) => {
    let a = o.parent;
    while (!anchors.has(a)) a = a.parent;
    return a;
  };
  const meshes = [];
  // 面ごとに素材がちがうもの(表彰台の箱など)はまとめない
  // userData.noMerge が付いたもの(揺らす旗など)もまとめない
  root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.visible && !Array.isArray(o.material) && !o.userData.noMerge) meshes.push(o); });
  // メッシュの子(輪郭線など)は、先にいちばん近い anchor へ付けかえる(見た目の位置は変えない)
  for (const mesh of meshes) for (const child of [...mesh.children]) anchorOf(mesh).attach(child);

  const groups = new Map(); // anchor → Map(key → { mats, list })
  for (const mesh of meshes) {
    const a = anchorOf(mesh);
    const kind = bakeKind(mesh.material);
    const key = kind || mesh.material;
    if (!groups.has(a)) groups.set(a, new Map());
    const byKey = groups.get(a);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(mesh);
  }
  const inv = new THREE.Matrix4();
  const rel = new THREE.Matrix4();
  let before = 0, after = 0;
  for (const [a, byKey] of groups) {
    inv.copy(a.matrixWorld).invert();
    for (const [key, list] of byKey) {
      before += list.length;
      const baked = typeof key === 'string';
      if (list.length < 2 && !baked) {
        after += 1;
        continue;
      }
      const geos = list.map((mesh) => prepare(mesh, rel.multiplyMatrices(inv, mesh.matrixWorld), baked, !baked));
      const mat = key === 'toon' ? toonVC() : key === 'unlit' ? unlitVC() : key;
      const merged = new THREE.Mesh(mergeGeometries(geos), mat);
      merged.name = 'merged';
      a.add(merged);
      for (const mesh of list) mesh.removeFromParent();
      after += 1;
    }
  }
  for (const [o, sc] of zero) o.scale.copy(sc);
  root.updateMatrixWorld(true);
  return { before, after };
}

// ── 動くキャラ用: 体全部を1つにまとめ、部品の動きは「骨」で付ける ─────────
// 頭・腕・脚・表情などの動く部品(anchors)を骨に見立てる。各頂点は、いちばん近い
// anchor に 100% くっつく。アニメーションは今までどおり anchor を動かすだけで、
// 描くのは素材ごとに1回ずつになる(1体 20回 → 4〜5回)。
//
// 表情の切り替えは、使わない表情の anchor を大きさ 0 にして消す(visible では消えない)。
export function mergeSkinned(root, isAnchor) {
  const bones = [root];
  root.traverse((o) => { if (o !== root && isAnchor(o)) bones.push(o); });
  const zero = [];
  root.traverse((o) => {
    if (o.scale.x === 0 || o.scale.y === 0 || o.scale.z === 0) {
      zero.push([o, o.scale.clone()]);
      o.scale.set(1, 1, 1);
    }
  });
  root.updateMatrixWorld(true);
  const boneOf = (o) => {
    let a = o.parent;
    while (!bones.includes(a)) a = a.parent;
    return bones.indexOf(a);
  };
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) meshes.push(o); });
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map(); // 素材の種類 → [{ geo, bone }]
  const rel = new THREE.Matrix4();
  for (const mesh of meshes) {
    const kind = bakeKind(mesh.material);
    const key = kind || mesh.material;
    if (!groups.has(key)) groups.set(key, []);
    // 頂点は root から見た位置(= 骨をつけた時点の姿勢)に置く
    const geo = prepare(mesh, rel.multiplyMatrices(rootInv, mesh.matrixWorld), !!kind, !kind);
    const bone = boneOf(mesh);
    const n = geo.attributes.position.count;
    const idx = new Uint16Array(n * 4), w = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      idx[i * 4] = bone;
      w[i * 4] = 1;
    }
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(w, 4));
    groups.get(key).push(geo);
  }
  for (const mesh of meshes) mesh.removeFromParent();
  const skeleton = new THREE.Skeleton(bones.map((b) => b));
  // 骨の逆行列は、いま(大きさを戻した姿勢)の位置で作る
  skeleton.boneInverses = bones.map((b) => new THREE.Matrix4().multiplyMatrices(rootInv, b.matrixWorld).invert());
  const out = [];
  for (const [key, geos] of groups) {
    const mat = key === 'toon' ? toonVC() : key === 'unlit' ? unlitVC() : key;
    const geo = mergeGeometries(geos.map((g) => {
      // mergeGeometries は属性がそろっている必要がある
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'uv', 'skinIndex', 'skinWeight'].includes(name)) g.deleteAttribute(name);
      return g;
    }));
    const sk = new THREE.SkinnedMesh(geo, mat);
    sk.name = 'body';
    sk.frustumCulled = false; // 骨で形が変わるので、最初の形で見えないと判定されないように
    root.add(sk);
    sk.bind(skeleton, new THREE.Matrix4());
    out.push(sk);
  }
  for (const [o, sc] of zero) o.scale.copy(sc);
  root.updateMatrixWorld(true);
  return out;
}
