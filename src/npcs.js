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
import { GEO, INK, WHITE, anchor, bake, blob, cheekMat, flat, ink, onDir, onSphere, shape, solid } from './model-kit.js';
import { eyeParts, mouthParts } from './characters.js';

const TAU = Math.PI * 2;
const V3 = THREE.Vector3;

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

// ── 観客(森の小動物) ───────────────────────────────
// だるまさんがころんだ の観客。切り株や根っこの上で見ている。
// 骨格は全員同じ: rig / head / arm_L / arm_R / tail(ないものもいる)/ face_normal・happy・surprised
// アニメーション:
//   idle   体をゆらす(数えるのに合わせて、ゲームが timeScale を変える)
//   cheer  はねて拍手(ゴールしたとき)
//   gasp   「あっ」とのけぞる(だれかが見つかったとき。1回だけ流す)
//   laugh  けらけら笑う

const CRITTER_FACES = ['normal', 'happy', 'surprised'];

export const CRITTERS = [
  { key: 'risu', label: 'リス', main: 0xc8743a, sub: 0xf6e3c6, dark: 0x7a4422, size: 0.62 },
  { key: 'harinezumi', label: 'ハリネズミ', main: 0x9a7b62, sub: 0xf0dcc0, dark: 0x5b4636, size: 0.55 },
  { key: 'komadori', label: 'コマドリ', main: 0x8a7560, sub: 0xf28a3a, dark: 0x4d3f33, size: 0.5 },
  { key: 'mogura', label: 'モグラ', main: 0x4c4754, sub: 0xff9fb0, dark: 0x2c2832, size: 0.62, inHole: true },
];

export function buildCritter(d) {
  const root = new THREE.Group();
  root.name = d.key;
  const rig = new THREE.Group();
  rig.name = 'rig';
  root.add(rig);
  const bird = d.key === 'komadori';
  const Rh = bird ? 0.27 : 0.3;

  // 胴
  const bodyY = bird ? 0.42 : 0.45;
  rig.add(Object.assign(blob(d.main, bird ? 0.36 : 0.32, bird ? 0.36 : 0.34, bird ? 0.34 : 0.3), { name: 'body' }));
  rig.children.at(-1).position.y = bodyY;
  const belly = blob(d.sub, bird ? 0.26 : 0.2, bird ? 0.26 : 0.22, 0.1, false);
  belly.position.set(0, bodyY - 0.04, bird ? 0.27 : 0.23);
  rig.add(belly);
  // 足
  for (const s of [-1, 1]) {
    const f = bird ? shape(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 6), 0xd9a441, 1.3) : blob(d.key === 'mogura' ? d.sub : d.main, 0.09, 0.05, 0.12);
    f.position.set(0.12 * s, bird ? 0.07 : 0.05, 0.04);
    rig.add(f);
  }

  // 腕(鳥は羽)
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    a.name = s > 0 ? 'arm_L' : 'arm_R';
    a.position.set((bird ? 0.32 : 0.26) * s, bodyY + 0.12, 0.02);
    let part;
    if (bird) {
      part = blob(d.dark, 0.08, 0.2, 0.17);
      part.position.y = -0.1;
    } else if (d.key === 'mogura') {
      part = blob(d.sub, 0.1, 0.1, 0.05); // 大きな桃色の手
      part.position.y = -0.14;
    } else {
      part = blob(d.main, 0.06, 0.12, 0.06);
      part.position.y = -0.1;
    }
    a.add(part);
    rig.add(a);
    arms.push({ node: a, side: s });
  }

  // 頭
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = bird ? 0.86 : 0.98;
  rig.add(head);
  head.add(blob(d.main, Rh * (d.key === 'mogura' ? 1.08 : 1), Rh * 0.95, Rh));
  let eyeLift = 0.01, eyeScale = 0.6, eyeY = 0.03, mouthY = -0.11;

  if (d.key === 'risu') {
    for (const s of [-1, 1]) {
      const ear = shape(new THREE.ConeGeometry(0.07, 0.16, 10), d.main, 1.12);
      ear.position.copy(new V3(0.5 * s, 0.85, 0).normalize().multiplyScalar(Rh * 0.95));
      ear.rotation.z = -0.3 * s;
      const tuft = shape(new THREE.ConeGeometry(0.03, 0.08, 6), d.dark, 1);
      tuft.position.y = 0.1;
      ear.add(tuft);
      head.add(ear);
    }
    anchor(head, onSphere(Rh, 0, -0.08, -0.02)).add(blob(d.sub, 0.12, 0.08, 0.07));
    anchor(head, onSphere(Rh, 0, -0.05, 0.045)).add(blob(d.dark, 0.03, 0.022, 0.02, false));
    mouthY = -0.13;
  } else if (d.key === 'harinezumi') {
    // 明るい顔と、とがった鼻
    anchor(head, onSphere(Rh, 0, -0.03, -0.03)).add(blob(d.sub, 0.24, 0.2, 0.08, false));
    const snout = shape(new THREE.ConeGeometry(0.07, 0.16, 10), d.sub, 1.12);
    snout.rotation.x = Math.PI / 2;
    snout.position.z = 0.06;
    anchor(head, onSphere(Rh, 0, -0.08, 0.0)).add(snout);
    const nose = blob(INK, 0.03, 0.025, 0.025, false);
    anchor(head, onSphere(Rh, 0, -0.08, 0.14)).add(nose);
    for (const s of [-1, 1]) {
      const ear = blob(d.main, 0.05, 0.05, 0.03);
      ear.position.copy(new V3(0.6 * s, 0.7, 0.1).normalize().multiplyScalar(Rh * 0.98));
      head.add(ear);
    }
    mouthY = -0.17;
    eyeLift = 0.06; // 明るい顔の上に出す
  } else if (d.key === 'komadori') {
    const beak = shape(new THREE.ConeGeometry(0.035, 0.1, 8), 0xd9a441, 1.12);
    beak.rotation.x = Math.PI / 2;
    beak.position.z = 0.04;
    anchor(head, onSphere(Rh, 0, -0.05, 0.0)).add(beak);
    // 胸の橙色は顔の下まで続く
    anchor(head, onSphere(Rh, 0, -0.16, -0.03)).add(blob(d.sub, 0.17, 0.12, 0.07, false));
    mouthY = null;
  } else if (d.key === 'mogura') {
    anchor(head, onSphere(Rh, 0, -0.06, 0.02)).add(blob(d.sub, 0.08, 0.065, 0.07)); // 大きな鼻
    // 黄色いヘルメットとランプ
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(Rh * 1.06, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.1), solid(0xf4c430));
    helmet.position.y = 0.03;
    const brim = shape(new THREE.CylinderGeometry(Rh * 1.12, Rh * 1.12, 0.025, 20), 0xe0a91c, 1.04);
    brim.position.y = 0.04;
    const lamp = shape(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 12), 0xfff3b0, 1.15);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, Rh * 0.72, Rh * 0.72);
    head.add(helmet, brim, lamp);
    eyeScale = 0.45;
    eyeY = 0.0;
    mouthY = -0.14;
  }
  // ほっぺ
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(GEO.disc, cheekMat());
    c.scale.setScalar(0.6);
    anchor(head, onSphere(Rh, 0.17 * s, -0.07, 0.005)).add(c);
  }
  // 表情
  for (const key of CRITTER_FACES) {
    const face = new THREE.Group();
    face.name = 'face_' + key;
    for (const s of [-1, 1]) {
      anchor(face, onSphere(Rh, 0.1 * s, eyeY, eyeLift)).add(eyeParts(key, s, eyeScale));
    }
    if (mouthY !== null) {
      const m = mouthParts(key, 0.7);
      m.scale.multiplyScalar(0.7);
      anchor(face, onSphere(Rh, 0, mouthY, 0.01)).add(m);
    }
    if (key !== 'normal') face.scale.setScalar(0);
    head.add(face);
  }

  // 背中のとげ(ハリネズミ)
  if (d.key === 'harinezumi') {
    // 頭のてっぺんから背中・わき腹まで、外向きにびっしり生やす。正面から見ても縁からとげがのぞく
    const spike = new THREE.ConeGeometry(0.05, 0.26, 6);
    spike.translate(0, 0.13, 0); // 根元を原点に(真ん中を原点にすると半分が体に埋まる)
    // 背中を覆う、とげの生えた暗い毛皮
    const coat = blob(d.dark, 0.33, 0.35, 0.29);
    coat.position.set(0, bodyY + 0.03, -0.06);
    const hood = blob(d.dark, Rh * 1.02, Rh * 0.98, Rh * 0.9);
    hood.position.set(0, head.position.y + 0.02, -0.07);
    rig.add(coat, hood);
    let seed = 99;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // 書き出すたびに形が変わらないよう固定
    const spots = [[new V3(0, bodyY + 0.03, -0.03), 0.3, 80], [new V3(0, head.position.y, -0.03), Rh * 0.95, 44]];
    for (const [center, radius, n] of spots) {
      for (let i = 0; i < n; i++) {
        const dir = new V3(rnd() * 2 - 1, rnd() * 1.6 - 0.45, rnd() * 2 - 1.35).normalize();
        if (dir.z > 0.25) continue; // 顔とおなかにはない
        const c = shape(spike, d.dark, 1.1);
        c.position.copy(center).addScaledVector(dir, radius * 0.85);
        c.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir.clone().add(new V3(0, 0.25, -0.35)).normalize());
        rig.add(c);
      }
    }
  }

  // しっぽ
  let tail = null;
  if (d.key === 'risu') {
    // 大きく巻いたしっぽ: 背中に沿って立ち上がり、頭の上で前へくるりと巻く
    tail = new THREE.Group();
    tail.name = 'tail';
    tail.position.set(0, 0.22, -0.28);
    const curve = new THREE.CatmullRomCurve3([
      new V3(0, 0, 0), new V3(0, 0.25, -0.2), new V3(0, 0.62, -0.3), new V3(0, 0.95, -0.22),
      new V3(0, 1.1, 0.0), new V3(0, 1.02, 0.14), new V3(0, 0.9, 0.08),
    ]);
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const r = 0.12 + Math.sin(Math.PI * Math.min(1, t * 1.2)) * 0.1;
      const b = blob(t > 0.85 ? d.sub : d.main, r * 1.25, r, r);
      b.position.copy(curve.getPoint(t));
      tail.add(b);
    }
    rig.add(tail);
  } else if (d.key === 'komadori') {
    tail = new THREE.Group();
    tail.name = 'tail';
    tail.position.set(0, 0.3, -0.3);
    const f = blob(d.dark, 0.1, 0.03, 0.17);
    f.position.set(0, 0.04, -0.1);
    f.rotation.x = -0.5;
    tail.add(f);
    rig.add(tail);
  }

  const baseY = d.inHole ? -0.42 : 0; // モグラは穴から上半身だけ出す
  const pose = (clip, t) => {
    let y = 0, roll = 0, pitch = 0, sy = 1, sx = 1, hx = 0, hz = 0, tailY = 0;
    let armZ = 0.35, armX = 0;
    if (clip === 'idle') {
      const b = Math.sin((TAU * t) / 1.2);
      sy = 1 + 0.025 * b;
      sx = 1 - 0.012 * b;
      roll = 0.06 * Math.sin((TAU * t) / 2.4);
      hz = -roll * 0.6;
      armZ = 0.35 + 0.06 * b;
      tailY = 0.2 * Math.sin((TAU * t) / 2.4);
      if (d.inHole) y = 0.03 * b;
    } else if (clip === 'cheer') {
      const q = t / 0.6;
      y = (d.inHole ? 0.25 : 0.16) * Math.sin(Math.PI * q);
      const land = Math.max(0, Math.cos(Math.PI * q * 2)) * (q < 0.25 || q > 0.75 ? 1 : 0);
      sy = 1 - 0.08 * land;
      sx = 1 + 0.05 * land;
      armZ = 2.4 + 0.35 * Math.sin(TAU * q * 2); // 頭の上で手をたたく
      tailY = 0.4 * Math.sin(TAU * q);
    } else if (clip === 'gasp') {
      const k = t < 0.12 ? t / 0.12 : t < 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) / 0.4);
      pitch = -0.32 * k;
      armZ = 0.35 + 1.5 * k;
      armX = -0.4 * k;
      y = (d.inHole ? -0.35 : 0.04) * k; // モグラは穴に引っこむ
      sy = 1 + 0.05 * k;
    } else if (clip === 'laugh') {
      const w = Math.sin((TAU * t) / 0.25);
      roll = 0.09 * w;
      hx = -0.22;
      hz = 0.1 * w;
      armZ = 0.8;
      armX = -0.6;
      sy = 1 + 0.03 * Math.abs(w);
    }
    rig.position.set(0, baseY + y, 0);
    rig.rotation.set(pitch, 0, roll);
    rig.scale.set(sx, sy, sx);
    head.rotation.set(hx, 0, hz);
    for (const a of arms) a.node.rotation.set(armX, 0, armZ * a.side);
    if (tail) tail.rotation.set(0, tailY, 0);
  };
  const nodes = [rig, head, ...arms.map((a) => a.node)];
  if (tail) nodes.push(tail);
  const extra = [[rig, 'position'], [rig, 'scale']];
  const clips = [
    bake('idle', 2.4, nodes, extra, (t) => pose('idle', t)),
    bake('cheer', 0.6, nodes, extra, (t) => pose('cheer', t)),
    bake('gasp', 0.9, nodes, extra, (t) => pose('gasp', t)),
    bake('laugh', 0.5, nodes, extra, (t) => pose('laugh', t)),
  ];
  pose('idle', 0);
  root.scale.setScalar(d.size / 0.62);
  return { root, clips };
}

export const NPCS = [
  { key: HOHO.key, label: `${HOHO.name}(フクロウ)`, build: buildOwl },
  ...CRITTERS.map((d) => ({ key: d.key, label: `観客の${d.label}`, build: () => buildCritter(d) })),
];
