// ゲストのキャラ「レイ」。ほかのゲームから来た子なので、形は もらった glb(tools/source/ray.glb)のまま使う。
//
// もとの glb には骨も動きもないので、この大会の約束ごと(README の「glb の約束ごと」)に合わせて組みなおす:
// - ノード: rig / head(頭・目・くちばし・葉っぱ)/ arm_L・arm_R(つばさ)/ tail / face_*(4つの表情)/ stars。
//   脚はない(走るときは ぴょんぴょん はねる)。
// - スカーフ(player_color): プレイヤーの色が分かるように、頭と体のつなぎめに細く巻く。
// - 輪郭線: ほかの子と同じ「面を裏返した殻」。
// - 動き: idle / wave / cheer / run / dizzy を、この形に合わせて作る。
//
// 大きさ: もとの glb は高さ 3.27(葉っぱの先まで)、はば 2.6。まるくて はばが広いので、
// 葉っぱの先が ほかの子の頭の高さくらい(1.75)になるように縮める(頭で合わせると、はばが ほかの子の 1.7 倍になる)。
// これは書き出し(tools/export-glb.mjs)で使う。ゲームは書き出した models/ray.glb を読む。

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, LINE_W, bake, flat, flipped, outline, solid } from '../model-kit.js';

const TAU = Math.PI * 2;
const K = 1.75 / 3.27; // 葉っぱの先(3.27)→ 1.75
const NAVY = 0x253561;
// スカーフ: 頭と体のつなぎめ(もとの大きさで)
const SCARF_Y = 0.78, SCARF_R = 1.0;

// もとの素材(PBR)を、色だけ引きついだ この大会の素材へ(ゲームでトゥーンに差し替わる)
function convert(m) {
  if (m.name === 'eye_highlight') return flat(0xffffff);
  const mat = solid(m.color.getHex());
  return mat;
}
// 輪郭線: 面を裏返した殻を、軸ごとに LINE_W だけ大きく(この部品の大きさに合わせて)
// 裏返した形は、同じ形どうしで使いまわす(表情ごとに目を作るので、使いまわさないと glb が大きくなる)
const FLIPPED = new Map();
function flippedOf(geo) {
  if (!FLIPPED.has(geo)) {
    let g = geo;
    if (!g.index) { g = g.clone(); g.setIndex([...Array(g.attributes.position.count).keys()]); }
    const f = flipped(g);
    f.deleteAttribute('normal'); // 輪郭線は光を受けないので、法線はいらない
    FLIPPED.set(geo, f);
  }
  return FLIPPED.get(geo);
}
function addOutline(mesh, wide = 1) {
  const geo = mesh.geometry;
  geo.computeBoundingBox();
  const half = geo.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const ws = new THREE.Vector3();
  mesh.updateWorldMatrix(true, false);
  mesh.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), ws);
  const o = new THREE.Mesh(flippedOf(geo), outline(mesh.material.color.getHex()));
  o.name = 'outline';
  const w = LINE_W * wide;
  o.scale.set(1 + w / Math.max(1e-3, half.x * Math.abs(ws.x)), 1 + w / Math.max(1e-3, half.y * Math.abs(ws.y)), 1 + w / Math.max(1e-3, half.z * Math.abs(ws.z)));
  mesh.add(o);
}

// もとの形から、この大会で使わないもの(uv。模様の絵はない)を落として、重なった頂点をまとめる
const SLIM = new Map();
function slim(geo) {
  if (!SLIM.has(geo)) {
    let g = geo.clone();
    g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-4);
    SLIM.set(geo, g);
  }
  return SLIM.get(geo);
}
// 左右反転(大きさがマイナス)で置かれた部品は、反転を形のほうに焼きこむ。
// ゲームでは動かない部品を1つにまとめて描くので、反転のまま まとめると面が裏返って見えなくなる
const MIRRORED = new Map();
function mirrored(geo) {
  if (!MIRRORED.has(geo)) {
    const g = geo.clone();
    g.scale(-1, 1, 1);
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    MIRRORED.set(geo, g);
  }
  return MIRRORED.get(geo);
}
// もとの glb の部品を、world の位置・向き・大きさのまま(K 倍して)parent の下へ
function take(src, parent, { line = true, wide = 1 } = {}) {
  let geo = slim(src.geometry);
  const world = new THREE.Matrix4().makeScale(K, K, K).multiply(src.matrixWorld);
  parent.updateWorldMatrix(true, false);
  const local = parent.matrixWorld.clone().invert().multiply(world);
  if (local.determinant() < 0) {
    geo = mirrored(geo);
    local.multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
  }
  const m = new THREE.Mesh(geo, convert(src.material));
  m.name = src.name;
  local.decompose(m.position, m.quaternion, m.scale);
  parent.add(m);
  if (line) addOutline(m, wide);
  return m;
}
const at = (parent, x, y, z, name) => {
  const g = new THREE.Group();
  if (name) g.name = name;
  parent.updateWorldMatrix(true, false);
  g.position.copy(parent.worldToLocal(new THREE.Vector3(x * K, y * K, z * K)));
  parent.add(g);
  return g;
};

export function buildRay(src, playerHex = 0xff5a4e) {
  src.updateMatrixWorld(true);
  const parts = {};
  src.traverse((o) => { if (o.isMesh) parts[o.name] = o; });
  const wpos = (name) => { const v = new THREE.Vector3(); src.getObjectByName(name).getWorldPosition(v); return v; };

  const root = new THREE.Group();
  root.name = 'ray';
  const rig = new THREE.Group();
  rig.name = 'rig';
  root.add(rig);
  root.updateMatrixWorld(true);

  // 体
  take(parts.body_blue, rig);
  take(parts.body_navy, rig);
  // しっぽ(体のうしろの つけねで回す)
  const tail = at(rig, 0.05, 0.52, -0.72, 'tail');
  take(parts.tail_navy, tail);
  take(parts.tail_blue, tail);
  // つばさ: もとの wingL / wingR のつけねで回す。L はキャラの左(+x)
  const arms = [];
  for (const [side, key] of [[1, 'L'], [-1, 'R']]) {
    const p = wpos('wing' + key);
    const arm = at(rig, p.x, p.y, p.z, 'arm_' + key);
    take(parts[`wing${key}_mesh`], arm);
    arms.push({ node: arm, side });
  }

  // スカーフ(プレイヤーの色): 頭と体のつなぎめに細く。結び目は右前に
  const player = new THREE.MeshStandardMaterial({ color: playerHex, roughness: 0.7, metalness: 0 });
  player.name = 'player_color';
  const playerLine = new THREE.MeshBasicMaterial({ color: 0x5a1a14 });
  playerLine.name = 'player_outline';
  const scarfGeo = new THREE.TorusGeometry(SCARF_R * K, 0.08 * K, 10, 40);
  const scarf = new THREE.Mesh(scarfGeo, player);
  scarf.name = 'scarf';
  scarf.rotation.x = Math.PI / 2 - 0.12; // 前を少し下げる
  scarf.position.set(0.0, SCARF_Y * K, 0.1 * K);
  const scarfLine = new THREE.Mesh(flipped(scarfGeo), playerLine);
  scarfLine.name = 'outline';
  scarfLine.scale.setScalar(1.06);
  scarf.add(scarfLine);
  rig.add(scarf);
  const knot = new THREE.Mesh(GEO.sphere, player);
  knot.scale.set(0.11 * K, 0.085 * K, 0.07 * K);
  knot.position.set(-0.45 * K, (SCARF_Y - 0.06) * K, (SCARF_R * 0.88 + 0.12) * K);
  const ribbon = new THREE.Mesh(GEO.sphere, player);
  ribbon.scale.set(0.07 * K, 0.2 * K, 0.04 * K);
  ribbon.position.set(-0.55 * K, (SCARF_Y - 0.26) * K, (SCARF_R * 0.88 + 0.1) * K);
  ribbon.rotation.z = -0.35;
  rig.add(knot, ribbon);

  // 頭(体とのつなぎめで回す)
  const head = at(rig, 0.05, 1.1, 0.05, 'head');
  take(parts.head_navy, head);
  take(parts.head_blue, head);
  take(parts.beak, head);
  // 葉っぱ: つけねで ゆらす(ほかの子の「たれ耳」と同じ flop)
  const lp = wpos('leaf');
  const leaf = at(head, lp.x, lp.y, lp.z, 'flop');
  take(parts.leaf_mesh, leaf, { wide: 0.7 });

  // 表情。目の まんなか(白目のまんなか)を、まばたきの中心にする
  const eyeCenter = (k) => { const b = new THREE.Box3().setFromObject(parts['eye' + k]); return b.getCenter(new THREE.Vector3()); };
  const headCenter = new THREE.Vector3(0.05, 1.56, 0.03);
  const faces = {};
  const eyes = [];
  for (const key of ['normal', 'happy', 'surprised', 'frustrated']) {
    const face = new THREE.Group();
    face.name = 'face_' + key;
    head.add(face);
    faces[key] = face;
    for (const k of ['L', 'R']) {
      const c = eyeCenter(k);
      const side = k === 'L' ? 1 : -1;
      const eye = at(face, c.x, c.y, c.z, key === 'normal' ? 'eye_' + k : undefined);
      if (key === 'normal') eyes.push(eye);
      // 目の向き(頭のまんなかから外へ)と、白目の おもて面までの距離(もとの大きさで)
      const n = c.clone().sub(headCenter).normalize();
      const eb = new THREE.Box3().setFromObject(parts['eye' + k]).getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const front = Math.abs(n.x) * eb.x + Math.abs(n.y) * eb.y + Math.abs(n.z) * eb.z; // おもて面まで
      const fw = eb.x; // 白目の横はばの半分
      if (key === 'happy') {
        // にっこり: 白目のかわりに、紺の ∩
        const arc = new THREE.Mesh(new THREE.TorusGeometry(fw * 0.62 * K, 0.06 * K, 8, 20, Math.PI), flat(0x1c2a52));
        arc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        // 頭の表面(白目のおもて面より少し奥)に貼る
        arc.position.copy(n.clone().multiplyScalar(front * 0.55 * K));
        arc.position.y -= 0.05 * K;
        eye.add(arc);
        continue;
      }
      const white = take(parts['eye' + k], eye, { wide: 0.6 });
      const pupil = take(parts['pupil' + k], eye, { line: false });
      const hi = [take(parts[`eye${k}_highlight`], eye, { line: false }), take(parts[`eye${k}_highlight2`], eye, { line: false })];
      if (key === 'surprised') {
        // びっくり: 白目を少し大きく、黒目を小さく(黒目は白目のおもて面に のせたまま)
        white.scale.multiplyScalar(1.08);
        pupil.scale.multiplyScalar(0.58);
        const out = n.clone().multiplyScalar(0.13 * K); // 小さくした黒目が 白目に しずまないように
        pupil.position.add(out);
        for (const h of hi) { h.position.add(out); h.position.add(n.clone().multiplyScalar(0.02 * K)); }
      }
      if (key === 'frustrated') {
        // くやしい: 上から紺のまぶた(内がわが下がる)。黒目は少し下へ
        const lid = new THREE.Mesh(new THREE.SphereGeometry(fw * 1.06 * K, 20, 10, 0, TAU, 0, Math.PI / 2), solid(NAVY));
        lid.name = 'lid';
        // 半球の平らな面を まぶたのふちに。白目のおもて面に かぶせて、内がわが下がるように かたむける
        lid.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        lid.rotateZ(side * 0.4);
        lid.position.copy(n.clone().multiplyScalar(front * 0.62 * K)).add(new THREE.Vector3(0, 0.03 * K, 0));
        lid.scale.set(1.0, 0.95, 0.5);
        eye.add(lid);
        pupil.position.y -= 0.05 * K;
        for (const h of hi) h.position.y -= 0.05 * K;
      }
    }
    if (key !== 'normal') face.scale.setScalar(0);
  }

  // 目を回したときの星
  const stars = new THREE.Group();
  stars.name = 'stars';
  stars.position.copy(head.worldToLocal(new THREE.Vector3(0.05 * K, 2.72 * K, 0.03 * K)));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    const st = new THREE.Mesh(GEO.star, flat(0xffd23f));
    st.scale.setScalar(1.3);
    st.position.set(Math.cos(a) * 0.4, 0.03 * Math.sin(a * 2), Math.sin(a) * 0.4);
    stars.add(st);
  }
  stars.scale.setScalar(0);
  head.add(stars);

  const P = { rig, head, arms, tail, flop: leaf, eyes, stars };
  const CLIPS = [['idle', 2.4], ['wave', 1.2], ['cheer', 0.8], ['run', 0.6], ['dizzy', 2.0]];
  const clips = CLIPS.map(([name, len]) => bakeClip(P, name, len));
  pose(P, 'idle', 0, true);
  return { root, clips };
}

// ── 動き ───────────────────────────────────────────
// つばさは「腕」。脚がないので、走るときは ぴょんぴょん はねて前へ(つばさを ぱたぱた)。
function pose(P, clip, t, rest = false) {
  let y = 0, sx = 1, sy = 1, lean = 0, roll = 0, hx = 0, hz = 0;
  let armZ = [0.15, 0.15], armX = [0, 0];
  let tailY = 0, tailX = 0, flop = 0, blink = 1, stars = 0, starRot = 0;
  if (!rest) {
    switch (clip) {
      case 'idle': {
        const b = Math.sin((TAU * t) / 1.2);
        sy = 1 + 0.025 * b;
        sx = 1 - 0.015 * b;
        hz = 0.05 * Math.sin((TAU * t) / 2.4);
        armZ = [0.15 + 0.08 * b, 0.15 + 0.08 * b];
        tailY = 0.25 * b;
        flop = 0.15 * b;
        blink = t > 1.56 && t < 1.7 ? 0.1 : 1;
        break;
      }
      case 'wave': {
        // 右のつばさを上げて ふる
        const w = Math.sin((TAU * t) / 0.6);
        armZ = [0.15, 1.55 + 0.3 * w];
        hz = -0.1;
        sy = 1 + 0.015 * w;
        tailY = 0.4 * w;
        flop = 0.25 * w;
        break;
      }
      case 'cheer': {
        const p = t / 0.8;
        let air = 0;
        if (p < 0.7) {
          const q = p / 0.7;
          air = 4 * q * (1 - q);
          y = 0.4 * air;
          sy = 1 + 0.08 * Math.sin(Math.PI * q);
          sx = 1 - 0.04 * Math.sin(Math.PI * q);
        } else {
          const s = Math.sin((Math.PI * (p - 0.7)) / 0.3);
          sy = 1 - 0.18 * s;
          sx = 1 + 0.1 * s;
        }
        const a = 1.45 + 0.35 * Math.sin((TAU * t) / 0.2); // つばさを上げて ぱたぱた(上げすぎると頭にかくれる)
        armZ = [a, a];
        tailY = 0.5 * Math.sin((TAU * t) / 0.4);
        flop = 0.45 * air;
        break;
      }
      case 'run': {
        // ぴょん、ぴょん(1周で2回はねる)。はねる前に ちぢみ、着地で つぶれる
        const p = ((t / 0.6) * 2) % 1;
        const air = p < 0.75 ? Math.sin((Math.PI * p) / 0.75) : 0;
        const squash = p >= 0.75 ? Math.sin((Math.PI * (p - 0.75)) / 0.25) : 0;
        y = 0.22 * air;
        sy = 1 + 0.06 * air - 0.12 * squash;
        sx = 1 - 0.03 * air + 0.07 * squash;
        lean = 0.18;
        hx = -0.1;
        const f = Math.sin(TAU * p);
        armZ = [0.6 + 0.6 * f, 0.6 + 0.6 * f];
        tailX = -0.25 * air;
        tailY = 0.2 * Math.sin((TAU * t) / 0.6);
        flop = 0.35 * air;
        break;
      }
      case 'dizzy': {
        const w = Math.PI * t;
        roll = 0.12 * Math.sin(w);
        hz = 0.2 * Math.sin(w + 0.8);
        hx = 0.08 * Math.cos(w);
        armZ = [0.5 + 0.2 * Math.sin(w * 2), 0.5 - 0.2 * Math.sin(w * 2)];
        flop = 0.3 * Math.sin(w * 2);
        stars = 1;
        starRot = (TAU * t) / 2;
        break;
      }
    }
  }
  const { rig, head } = P;
  rig.position.set(0, y, 0);
  rig.rotation.set(lean, 0, roll);
  rig.scale.set(sx, sy, sx);
  head.rotation.set(hx, 0, hz);
  P.arms.forEach((a, i) => a.node.rotation.set(armX[i], 0, armZ[i] * a.side));
  P.tail.rotation.set(tailX, tailY, 0);
  P.flop.userData.base ??= P.flop.rotation.clone();
  const b = P.flop.userData.base;
  P.flop.rotation.set(b.x, b.y, b.z + flop);
  for (const e of P.eyes) e.scale.set(1, blink, 1);
  P.stars.scale.setScalar(stars);
  P.stars.rotation.y = starRot;
}

function bakeClip(P, clip, length) {
  const nodes = [P.rig, P.head, ...P.arms.map((a) => a.node), P.stars, P.tail, P.flop];
  const extra = [[P.rig, 'position'], [P.rig, 'scale'], [P.stars, 'scale'], ...P.eyes.map((e) => [e, 'scale'])];
  return bake(clip, length, nodes, extra, (t) => pose(P, clip, t));
}
