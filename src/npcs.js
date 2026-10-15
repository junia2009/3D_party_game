// プレイヤーが選ばないキャラ(ミニゲームの見張り番など)。
//
// ── ホーホー先生(models/hoho.glb) ─────────────────────────
// だるまさんがころんだの見張り番。フクロウなので、体はうしろを向いたまま
// **首だけぐるっと回して振り向く**。首の向き(head の rotation.y)はゲームが
// 直接動かすので、アニメーションには head を入れていない。
//
// ノード: rig / head / wing_L / wing_R / face_normal / face_glare
// アニメーション:
//   idle   息をする
//   chant  数えながら体をゆらす(0.5秒で1拍。ゲームが timeScale で速さを合わせる)
//   flap   羽をばたつかせて跳ねる(だれかを見つけたとき)

import * as THREE from 'three';
import { GEO, INK, WHITE, anchor, bake, blob, cheekMat, flat, ink, onSphere, shape, solid } from './model-kit.js';

const TAU = Math.PI * 2;

export const HOHO = {
  key: 'hoho',
  name: 'ホーホー先生',
  main: 0x8b6f5c,
  sub: 0xf1e3c8,
  wing: 0x765c4a,
  accent: 0xf2a33a,
  iris: 0xffc93c,
  frame: 0x3b3b46,
};

export function buildOwl(d = HOHO) {
  const root = new THREE.Group();
  root.name = d.key;
  const rig = new THREE.Group();
  rig.name = 'rig';
  root.add(rig);

  // 足
  for (const s of [-1, 1]) {
    const foot = blob(d.accent, 0.14, 0.06, 0.18);
    foot.position.set(0.22 * s, 0.06, 0.12);
    rig.add(foot);
  }

  // 胴(たまご形)とおなか
  rig.add(Object.assign(blob(d.main, 0.62, 0.72, 0.56), { name: 'body' }));
  rig.children.at(-1).position.y = 0.78;
  const belly = blob(d.sub, 0.44, 0.5, 0.2, false);
  belly.position.set(0, 0.72, 0.4);
  rig.add(belly);
  // おなかの羽のもよう(小さな ∨)
  for (const [x, y] of [[-0.16, 0.86], [0.16, 0.86], [0, 0.72], [-0.2, 0.6], [0.2, 0.6], [0, 0.48]]) {
    const k = 1 - (x / 0.44) ** 2 - ((y - 0.72) / 0.5) ** 2;
    const z = 0.4 + 0.2 * Math.sqrt(Math.max(0, k)) + 0.004;
    const v = new THREE.Mesh(GEO.smile, flat(0xc9b08f));
    v.rotation.z = Math.PI;
    v.scale.set(1.1, 0.9, 1);
    v.position.set(x, y, z);
    rig.add(v);
  }

  // 羽
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.name = s > 0 ? 'wing_L' : 'wing_R';
    w.position.set(0.56 * s, 1.12, -0.02);
    const f = blob(d.wing, 0.13, 0.42, 0.32);
    f.position.y = -0.3;
    w.add(f);
    w.rotation.z = 0.08 * s;
    rig.add(w);
    wings.push({ node: w, side: s });
  }

  // 頭
  const R = 0.48;
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.62;
  rig.add(head);
  head.add(blob(d.main, 0.52, 0.46, R));
  // 耳の羽(角のように立つ)
  const tuftGeo = new THREE.ConeGeometry(0.09, 0.26, 12);
  for (const s of [-1, 1]) {
    const t = shape(tuftGeo, d.main, 1.12);
    t.position.set(0.3 * s, 0.42, -0.02);
    t.rotation.z = -0.45 * s;
    head.add(t);
  }
  // 顔のお皿(ハート形に見えるよう2枚重ね)
  for (const s of [-1, 1]) {
    anchor(head, onSphere(R, 0.17 * s, 0.0, -0.035)).add(blob(d.sub, 0.24, 0.26, 0.07, false));
  }
  // くちばし(下向き)
  const beak = shape(new THREE.ConeGeometry(0.06, 0.15, 14), d.accent, 1.12);
  beak.rotation.x = 2.3;
  beak.position.z = 0.05;
  anchor(head, onSphere(R, 0, -0.12, 0.0)).add(beak);
  // ほっぺ
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(GEO.disc, cheekMat());
    anchor(head, onSphere(R, 0.33 * s, -0.16, 0.01)).add(c);
  }
  // めがね(先生なので)
  const ring = new THREE.TorusGeometry(0.12, 0.016, 8, 28);
  for (const s of [-1, 1]) {
    const g = anchor(head, onSphere(R, 0.18 * s, 0.03, 0.06));
    g.add(new THREE.Mesh(ring, solid(d.frame)));
  }
  const bridge = new THREE.Mesh(GEO.box, solid(d.frame));
  bridge.scale.set(0.12, 0.018, 0.018);
  bridge.position.set(0, 0.06, R + 0.04);
  head.add(bridge);

  // 表情: ふつう(まんまるの目)/ にらむ(振り向いたとき)
  for (const key of ['normal', 'glare']) {
    const face = new THREE.Group();
    face.name = 'face_' + key;
    for (const s of [-1, 1]) {
      const eye = anchor(face, onSphere(R, 0.18 * s, 0.03, 0.03));
      eye.add(ink(0.095, 0.095, 0.02, d.iris));
      const pupil = ink(key === 'normal' ? 0.055 : 0.034, key === 'normal' ? 0.055 : 0.05, 0.02);
      pupil.position.z = 0.008;
      const hl = ink(0.018, 0.018, 0.01, WHITE);
      hl.position.set(0.022, 0.024, 0.02);
      eye.add(pupil, hl);
      if (key === 'glare') {
        // 内側が下がった太いまゆ
        const brow = new THREE.Mesh(GEO.box, flat(INK));
        brow.scale.set(0.15, 0.03, 0.02);
        brow.position.set(0, 0.13, 0.03);
        brow.rotation.z = 0.35 * s;
        eye.add(brow);
      }
    }
    if (key !== 'normal') face.scale.setScalar(0);
    head.add(face);
  }

  const pose = (clip, t) => {
    let y = 0, sx = 1, sy = 1, roll = 0;
    const wz = [0.08, 0.08];
    if (clip === 'idle') {
      const b = Math.sin((TAU * t) / 1.2);
      sy = 1 + 0.015 * b;
      sx = 1 - 0.01 * b;
    } else if (clip === 'chant') {
      const b = Math.sin((TAU * t) / 0.5);
      roll = 0.07 * b;
      sy = 1 + 0.025 * Math.abs(b);
      wz[0] = wz[1] = 0.08 + 0.1 * Math.abs(b);
    } else if (clip === 'flap') {
      const f = Math.sin((TAU * t) / 0.3);
      wz[0] = wz[1] = 0.6 + 0.5 * f;
      y = 0.12 * Math.abs(Math.sin((TAU * t) / 0.6));
      sy = 1 + 0.03 * f;
    }
    rig.position.set(0, y, 0);
    rig.rotation.set(0, 0, roll);
    rig.scale.set(sx, sy, sx);
    wings.forEach((w, i) => w.node.rotation.set(0, 0, wz[i] * w.side));
  };
  const nodes = [rig, ...wings.map((w) => w.node)];
  const extra = [[rig, 'position'], [rig, 'scale']];
  const clips = [
    bake('idle', 2.4, nodes, extra, (t) => pose('idle', t)),
    bake('chant', 0.5, nodes, extra, (t) => pose('chant', t)),
    bake('flap', 0.6, nodes, extra, (t) => pose('flap', t)),
  ];
  pose('idle', 0);
  root.scale.setScalar(1.25); // プレイヤーより大きく
  return { root, clips };
}

export const NPCS = [{ key: HOHO.key, label: `${HOHO.name}(フクロウ)`, build: buildOwl }];
