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
  if (m.map || m.transparent || m.name.startsWith('player')) return null;
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
  root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.visible) meshes.push(o); });
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
