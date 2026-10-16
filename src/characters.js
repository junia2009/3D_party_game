// キャラクターの定義と組み立て。
//
// プリミティブ(球・円すい・トーラス)を組み合わせて作り、tools/export-glb.mjs が
// GLTFExporter で models/<key>.glb に書き出す。ゲーム本体は glb を読むだけで、
// このファイルには依存しない。
//
// ── glb の約束ごと(ゲーム側はこの名前で触る) ─────────────────
// ノード
//   rig                 体全体(はねる・つぶれる・かたむく)
//   head                頭
//   arm_L / arm_R       肩(L はキャラ自身の左 = +x。正面は +z)
//   leg_L / leg_R       股関節
//   tail                しっぽ(ないキャラもいる)
//   face_<表情>         表情。使わない表情は scale 0 にしておく
//   stars               目を回したときの星(ふだんは scale 0)
// マテリアル
//   player_color        スカーフ。プレイヤーの色に塗りかえる
//   player_outline      スカーフの輪郭線(player_color を暗くした色)
//   outline             輪郭線(面を裏返した殻。ライトの影響を受けない)
// アニメーション
//   idle / wave / cheer / run / dizzy(どれもループする長さで切ってある)
//
// 骨格は全員同じ。耳・しっぽ・顔の部品だけがちがうので、
// アニメーションを1つ作れば全員に使い回せる。

import * as THREE from 'three';
import {
  GEO, INK, WHITE, anchor, bake, blob, cached, cheekMat, flat, ink, onDir, onSphere, shape, solid,
} from './model-kit.js';
export { lineColor } from './model-kit.js';
import { lineColor } from './model-kit.js';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;

export const PLAYER_COLORS = [
  { key: 'P1', label: 'あか', hex: 0xff5a4e },
  { key: 'P2', label: 'あお', hex: 0x3d8bff },
  { key: 'P3', label: 'きいろ', hex: 0xffc23c },
  { key: 'P4', label: 'みどり', hex: 0x34c47c },
  { key: 'P5', label: 'むらさき', hex: 0x9b6bff },
];

export const EXPRESSIONS = [
  { key: 'normal', label: 'ふつう' },
  { key: 'happy', label: 'にこにこ' },
  { key: 'surprised', label: 'びっくり' },
  { key: 'frustrated', label: 'くやしい' },
];

export const CLIPS = [
  { key: 'idle', label: 'たいき', length: 2.4, face: 'normal' },
  { key: 'wave', label: 'てをふる', length: 1.2, face: 'happy' },
  { key: 'cheer', label: 'よろこぶ', length: 0.8, face: 'happy' },
  { key: 'run', label: 'はしる', length: 0.6, face: 'normal' },
  { key: 'dizzy', label: 'めがまわる', length: 2.0, face: 'frustrated' },
];

const MOUTH = 0x8a2a34;
const TONGUE = 0xff8a95;


// ── 表情 ─────────────────────────────────────────────

export function eyeParts(expr, side, es) {
  const g = new THREE.Group();
  if (expr === 'normal') {
    g.add(ink(0.055 * es, 0.075 * es, 0.02));
    const hl = ink(0.018 * es, 0.018 * es, 0.01, WHITE);
    hl.position.set(0.018 * es, 0.03 * es, 0.016);
    g.add(hl);
  } else if (expr === 'happy') {
    const a = new THREE.Mesh(GEO.arc, flat(INK));
    a.scale.setScalar(es);
    a.position.y = -0.012;
    g.add(a);
  } else if (expr === 'surprised') {
    g.add(ink(0.066 * es, 0.09 * es, 0.02));
    const hl = ink(0.022 * es, 0.022 * es, 0.01, WHITE);
    hl.position.set(0.022 * es, 0.035 * es, 0.018);
    const hl2 = ink(0.01 * es, 0.01 * es, 0.01, WHITE);
    hl2.position.set(-0.02 * es, -0.03 * es, 0.018);
    g.add(hl, hl2);
  } else if (expr === 'frustrated') {
    // > < の形。内側(顔の中心)に向かってとがる
    for (const up of [1, -1]) {
      const b = new THREE.Mesh(GEO.box, flat(INK));
      b.scale.set(0.085 * es, 0.022 * es, 0.015);
      b.position.y = 0.017 * es * up;
      b.rotation.z = 0.38 * side * up;
      g.add(b);
    }
  }
  return g;
}

export function mouthParts(expr, mw) {
  const g = new THREE.Group();
  if (expr === 'normal') {
    const m = new THREE.Mesh(GEO.smile, flat(INK));
    m.rotation.z = Math.PI;
    m.scale.set(mw, 1, 1);
    m.position.y = 0.02;
    g.add(m);
  } else if (expr === 'happy') {
    const m = new THREE.Mesh(GEO.halfDisc, flat(MOUTH));
    m.position.y = 0.02;
    const t = ink(0.035, 0.016, 0.004, TONGUE);
    t.position.set(0, -0.025, 0.004);
    g.add(m, t);
    g.scale.set(mw, 1, 1);
  } else if (expr === 'surprised') {
    g.add(ink(0.034 * Math.min(mw, 1.4), 0.046, 0.01, MOUTH));
  } else if (expr === 'frustrated') {
    const m = new THREE.Mesh(GEO.smile, flat(INK));
    m.scale.set(0.8 * mw, 0.8, 1);
    m.position.y = -0.02;
    g.add(m);
  }
  return g;
}

// ── キャラクター一覧 ─────────────────────────────────

const R = 0.48; // 頭の半径(全員共通)

// キャラえらびと図鑑に出す子(hidden の子は、まだ出さない)
export const shownCharacters = () => CHARACTERS.filter((c) => !c.hidden);

export const CHARACTERS = [
  {
    key: 'ponta',
    name: 'ポン太',
    species: 'たぬき',
    main: 0xa47b55,
    sub: 0xf4e2c6,
    dark: 0x4a3426,
    line: 'まかせとけって!',
    role: 'オールラウンダー',
    personality: 'お調子者のリーダー。化けるのは下手。',
    stats: [3, 3, 3, 3],
    marks: ['目のまわりの黒いマスク', 'しましまの太いしっぽ', '頭にのせた葉っぱ'],
    mouthAt: () => onSphere(R, 0, -0.19, 0.05),
    build(P) {
      const { head } = P;
      for (const s of [-1, 1]) {
        const ear = blob(this.dark, 0.12, 0.11, 0.07);
        ear.position.copy(new V3(0.55 * s, 0.78, 0.08).normalize().multiplyScalar(R * 0.93));
        const inEar = blob(this.sub, 0.065, 0.06, 0.03, false);
        inEar.position.z = 0.05 / 0.07;
        inEar.scale.set(0.55, 0.55, 0.4);
        ear.add(inEar);
        head.add(ear);
        // たれ目に見えるよう、外側を下げる
        const mask = blob(this.dark, 0.115, 0.09, 0.03, false);
        mask.rotation.z = -0.3 * s;
        anchor(head, onSphere(R, 0.165 * s, 0.005, -0.006)).add(mask);
      }
      anchor(head, onSphere(R, 0, -0.13, -0.035)).add(blob(this.sub, 0.16, 0.11, 0.1));
      anchor(head, onSphere(R, 0, -0.085, 0.06)).add(blob(this.dark, 0.05, 0.034, 0.03, false));
      // 葉っぱ
      const leaf = new THREE.Group();
      leaf.position.set(0, R - 0.005, 0.06);
      leaf.rotation.set(0.15, 0.6, 0.25);
      leaf.add(blob(0x5cae4a, 0.13, 0.022, 0.075));
      const vein = ink(0.1, 0.006, 0.006, 0x3d7d31);
      vein.position.y = 0.02;
      leaf.add(vein);
      head.add(leaf);
      // しましまのしっぽ
      const tail = new THREE.Group();
      tail.position.set(0, 0.42, -0.28);
      tail.rotation.x = 0.6;
      const L = 0.26;
      const t = blob(this.main, 0.15, 0.15, L);
      t.position.z = -0.18;
      tail.add(t);
      for (const z of [-0.1, -0.27]) {
        const off = z + 0.18;
        const r = 0.15 * Math.sqrt(1 - (off / L) ** 2) + 0.012;
        const band = blob(this.dark, r, r, 0.045, false);
        band.position.z = z;
        tail.add(band);
      }
      P.setTail(tail);
    },
  },
  {
    key: 'mimi',
    name: 'ミミ',
    species: 'うさぎ',
    main: 0xfaf4ef,
    sub: 0xffb9c9,
    dark: 0xd98ca0,
    line: 'よーいドンなら負けないよ!',
    role: 'スピード型',
    personality: 'せっかちで負けず嫌い。走りだすと止まらない。',
    stats: [5, 2, 3, 2],
    marks: ['長い耳(左だけ折れている)', 'まんまるのしっぽ', 'ピンクの鼻'],
    bellyColor: 0xfff1e8,
    mouthAt: () => onSphere(R, 0, -0.16, 0.012),
    build(P) {
      const { head } = P;
      for (const s of [-1, 1]) {
        const ear = new THREE.Group();
        ear.name = s > 0 ? 'ear_L' : 'ear_R';
        ear.position.copy(new V3(0.22 * s, 0.96, -0.05).normalize().multiplyScalar(R * 0.92));
        ear.rotation.z = -0.15 * s;
        ear.add(earSegment(this));
        const top = new THREE.Group();
        top.position.y = 0.25;
        top.add(earSegment(this));
        ear.add(top);
        if (s < 0) {
          // 片耳だけ折れる。ここが見分けの決め手
          top.name = 'ear_flop';
          top.rotation.set(0.3, 0, 1.2);
          P.setFlop(top);
        }
        head.add(ear);
      }
      anchor(head, onSphere(R, 0, -0.085, 0.008)).add(blob(0xff8fa8, 0.045, 0.032, 0.03, false));
      const tail = new THREE.Group();
      tail.position.set(0, 0.42, -0.3);
      tail.add(blob(WHITE, 0.11));
      P.setTail(tail);
    },
  },
  {
    key: 'gonzo',
    name: 'ゴンゾ',
    species: 'くま',
    main: 0x6e4b36,
    sub: 0xe8c49a,
    dark: 0x2e1f17,
    size: 1.12,
    line: 'ぜんぶ、まとめて持ってく',
    role: 'パワー型',
    personality: 'おっとりした力持ち。はちみつのためなら走る。',
    stats: [2, 5, 2, 3],
    marks: ['いちばん大きい体', '丸い耳と大きな鼻', '耳の内側がはちみつ色'],
    mouthAt: () => onSphere(R, 0, -0.215, 0.06),
    build(P) {
      const { head } = P;
      for (const s of [-1, 1]) {
        const ear = blob(this.main, 0.13, 0.13, 0.08);
        ear.position.copy(new V3(0.6 * s, 0.75, 0).normalize().multiplyScalar(R * 0.93));
        // 耳の子なので、寸法は耳の大きさに対する比で書く
        const inEar = blob(this.sub, 0.075 / 0.13, 0.075 / 0.13, 0.03 / 0.08, false);
        inEar.position.z = 0.7;
        ear.add(inEar);
        head.add(ear);
      }
      anchor(head, onSphere(R, 0, -0.14, -0.045)).add(blob(this.sub, 0.19, 0.13, 0.12));
      anchor(head, onSphere(R, 0, -0.085, 0.07)).add(blob(this.dark, 0.075, 0.05, 0.04, false));
      const tail = new THREE.Group();
      tail.position.set(0, 0.4, -0.31);
      tail.add(blob(this.main, 0.08));
      P.setTail(tail);
    },
  },
  {
    key: 'penne',
    name: 'ペンネ',
    species: 'ペンギン',
    main: 0x2e3f63,
    sub: 0xf6f8fb,
    accent: 0xffa62b,
    line: '計算どおり、です',
    role: 'テクニック型',
    personality: 'まじめな理論派。泳ぐときだけ大胆になる。',
    stats: [2, 3, 5, 2],
    marks: ['顔と胸の白いお面', 'オレンジのくちばしと足', '手のかわりの羽', '頭のてっぺんの毛'],
    eyeLift: 0.045,
    mouthAt: null, // くちばしがあるので口は描かない
    foot: 'accent',
    footScale: [1.2, 0.8, 1.25],
    flipper: true,
    belly: [0.3, 0.31, 0.13, 0.56, 0.21],
    build(P) {
      const { head } = P;
      // お面は頭の表面にほぼ沿わせる(厚くすると目が埋もれる)
      anchor(head, onSphere(R, 0, -0.05, -0.04)).add(blob(this.sub, 0.34, 0.28, 0.06, false));
      const beak = shape(new THREE.ConeGeometry(0.055, 0.12, 16), this.accent);
      beak.rotation.x = Math.PI / 2;
      beak.position.z = 0.05;
      anchor(head, onSphere(R, 0, -0.1, 0.04)).add(beak);
      const coneGeo = new THREE.ConeGeometry(0.028, 0.11, 8);
      for (const x of [-0.05, 0, 0.05]) {
        const c = shape(coneGeo, this.main, 1.25);
        c.position.set(x, R + 0.03, 0.04);
        c.rotation.z = -x * 6;
        head.add(c);
      }
    },
  },
  {
    key: 'konko',
    name: 'コンコ',
    species: 'きつね',
    main: 0xf28a3a,
    sub: 0xfff6ea,
    dark: 0x3b2a22,
    line: 'ふふ、運も実力のうち',
    role: 'ラッキー型',
    personality: 'いたずら好きの気まぐれ屋。くじ運だけは本物。',
    stats: [4, 1, 3, 4],
    marks: ['先の黒い三角の耳', '先の白い大きなしっぽ', '横にはねたほっぺの毛'],
    eyeScale: 0.9,
    mouthAt: () => onSphere(R, 0, -0.185, 0.085),
    build(P) {
      const { head } = P;
      const earGeo = new THREE.ConeGeometry(0.12, 0.3, 16);
      const tipGeo = new THREE.ConeGeometry(0.12 * 0.38, 0.3 * 0.38, 16);
      const fluffGeo = new THREE.ConeGeometry(0.085, 0.24, 12);
      for (const s of [-1, 1]) {
        const ear = new THREE.Group();
        ear.position.copy(new V3(0.48 * s, 0.84, 0.02).normalize().multiplyScalar(R * 0.9));
        ear.rotation.z = -0.3 * s;
        const e = shape(earGeo, this.main, 1.08);
        e.position.y = 0.1;
        e.scale.z = 0.55;
        const tip = new THREE.Mesh(tipGeo, solid(this.dark));
        tip.position.y = 0.15 - 0.057;
        tip.scale.set(1.06, 1.02, 1.06);
        e.add(tip);
        const inEar = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 12), solid(this.sub));
        inEar.position.set(0, -0.03, 0.06);
        inEar.scale.z = 0.3;
        e.add(inEar);
        ear.add(e);
        head.add(ear);
        // ほっぺの毛
        const fluff = shape(fluffGeo, this.sub, 1.12);
        fluff.rotation.x = Math.PI / 2; // 先を外へ向ける
        anchor(head, onDir(R, new V3(0.9 * s, -0.4, 0.25), 0.01)).add(fluff);
      }
      anchor(head, onSphere(R, 0, -0.13, -0.05)).add(blob(this.sub, 0.15, 0.1, 0.15));
      anchor(head, onSphere(R, 0, -0.1, 0.1)).add(blob(this.dark, 0.045, 0.032, 0.03, false));
      // しっぽ(先が白い)
      const tail = new THREE.Group();
      tail.position.set(0, 0.42, -0.26);
      tail.rotation.x = 0.9;
      const t = blob(this.main, 0.17, 0.17, 0.3);
      t.position.z = -0.22;
      const tip = blob(this.sub, 0.145, 0.145, 0.13);
      tip.position.z = -0.46;
      tail.add(t, tip);
      P.setTail(tail);
    },
  },
  {
    key: 'kerosuke',
    name: 'ケロスケ',
    species: 'かえる',
    main: 0x7cc35a,
    sub: 0xeaf5b6,
    accent: 0xffcf3a,
    line: 'ジャンプなら王子にまかせたまえ',
    role: 'ジャンプ型',
    personality: '自称・池の王子。王冠はおもちゃ。',
    stats: [3, 2, 4, 3],
    marks: ['頭の上に飛びだした目', '横に広い口', 'おもちゃの王冠', '大きな足'],
    headScale: [1.15, 0.88, 0.95],
    footScale: [1.35, 0.8, 1.3],
    eyeScale: 0.95,
    eyesAt: (s) => ({ p: new V3(0.21 * s, 0.35, 0.312), q: new THREE.Quaternion() }),
    cheeksAt: (s) => onDir(R, new V3(0.34 * s, -0.06, 0.4), -0.08),
    mouthAt: () => ({
      p: new V3(0, -0.11, 0.445),
      q: new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), new V3(0, -0.25, 1).normalize()),
    }),
    mouthWidth: 1.9,
    build(P) {
      const { head } = P;
      for (const s of [-1, 1]) {
        const bulb = blob(this.main, 0.15);
        bulb.position.set(0.21 * s, 0.33, 0.12);
        const white = blob(WHITE, 0.12, 0.12, 0.07);
        white.position.set(0.21 * s, 0.35, 0.24);
        head.add(bulb, white);
      }
      const crown = new THREE.Group();
      crown.position.set(0, 0.42, -0.06);
      crown.rotation.x = -0.15;
      crown.scale.setScalar(1.35);
      const gold = solid(this.accent);
      crown.add(shape(new THREE.CylinderGeometry(0.1, 0.115, 0.075, 12), gold, 1.15));
      const spike = new THREE.ConeGeometry(0.026, 0.07, 8);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        const c = new THREE.Mesh(spike, gold);
        c.position.set(Math.sin(a) * 0.088, 0.07, Math.cos(a) * 0.088);
        crown.add(c);
      }
      const gem = blob(0xff4f6d, 0.026, 0.026, 0.015, false);
      gem.position.set(0, 0, 0.108);
      crown.add(gem);
      head.add(crown);
    },
  },
  // ── ゲスト ──────────────────────────────────────
  // ほかのゲームから来た子。形は もらった glb のまま(src/guests/)。CPU には出てこない
  {
    key: 'ray',
    guest: true,
    faceLift: 0.25, // 頭の回る点(首)から、顔のまんなかまで
    name: 'レイ',
    species: 'とり',
    main: 0x4f8cff,
    sub: 0x253561,
    accent: 0xffc23a,
    line: '何度だって立ち上がる',
    role: '実技(じつぎ)は満点',
    personality: 'クールなつもりで、どこか抜けている。決めポーズは伝説のパイロットのまね。',
    stats: [3, 2, 5, 2],
    marks: ['上と下で青と紺が入れかわる体', '黄色いくちばし', '頭の葉っぱ'],
    // 図鑑に足す欄(ゲストだけ)
    facts: [
      ['ゆめ', '宇宙パイロット(すきなものは ひまわりの種)'],
    ],
  },
];

function earSegment(def) {
  const g = new THREE.Group();
  const outer = blob(def.main, 0.08, 0.15, 0.055);
  outer.position.y = 0.12;
  const pink = blob(def.sub, 0.045, 0.11, 0.015, false);
  pink.position.set(0, 0.12, 0.045);
  g.add(outer, pink);
  return g;
}

// ── 組み立て ─────────────────────────────────────────

export function buildCharacter(def, playerHex = PLAYER_COLORS[0].hex) {
  const S = def.size || 1;
  const root = new THREE.Group();
  root.name = def.key;
  const rig = new THREE.Group();
  rig.name = 'rig';
  rig.scale.setScalar(S);
  root.add(rig);

  const player = new THREE.MeshStandardMaterial({ color: playerHex, roughness: 0.7, metalness: 0 });
  player.name = 'player_color';
  const playerLine = new THREE.MeshBasicMaterial({ color: lineColor(playerHex) });
  playerLine.name = 'player_outline';
  player.userData.outline = playerLine;

  const P = {
    def, S, root, rig, arms: [], legs: [], tail: null, flop: null, eyes: [], stars: null,
    setTail(t) { t.name = 'tail'; rig.add(t); this.tail = t; },
    setFlop(f) { this.flop = f; },
  };

  // 脚
  const footColor = def.foot === 'accent' ? def.accent : def.main;
  const fs = def.footScale || [1, 1, 1];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.name = side > 0 ? 'leg_L' : 'leg_R';
    hip.position.set(0.16 * side, 0.3, 0);
    const leg = blob(def.main, 0.1, 0.14, 0.1);
    leg.position.y = -0.1;
    const foot = blob(footColor, 0.12 * fs[0], 0.075 * fs[1], 0.16 * fs[2]);
    foot.position.set(0, -0.3 + 0.075 * fs[1], 0.035 * fs[2]);
    hip.add(leg, foot);
    rig.add(hip);
    P.legs.push({ node: hip, side });
  }

  // 胴とおなか
  const body = blob(def.main, 0.37, 0.35, 0.32);
  body.name = 'body';
  body.position.y = 0.6;
  rig.add(body);
  const [bx, by, bz, bY, bZ] = def.belly || [0.25, 0.26, 0.1, 0.56, 0.25];
  const belly = blob(def.bellyColor ?? def.sub, bx, by, bz, false);
  belly.position.set(0, bY, bZ);
  rig.add(belly);

  // 腕
  for (const side of [-1, 1]) {
    const sh = new THREE.Group();
    sh.name = side > 0 ? 'arm_L' : 'arm_R';
    sh.position.set(0.33 * side, 0.82, 0);
    if (def.flipper) {
      const f = blob(def.main, 0.06, 0.2, 0.11);
      f.position.y = -0.17;
      sh.add(f);
    } else {
      const arm = blob(def.main, 0.085, 0.18, 0.085);
      arm.position.y = -0.15;
      const hand = blob(def.main, 0.095);
      hand.position.y = -0.31;
      sh.add(arm, hand);
    }
    rig.add(sh);
    P.arms.push({ node: sh, side });
  }

  // スカーフ(プレイヤーの色)
  const scarf = shape(GEO.scarf, player, 1.06);
  scarf.name = 'scarf';
  scarf.rotation.x = Math.PI / 2;
  // 頭が大きいので首は見えない。肩にかけるように、頭より下の胴に巻く
  scarf.position.y = 0.8;
  rig.add(scarf);
  const knot = blob(player, 0.085, 0.065, 0.055);
  knot.position.set(0.17, 0.77, 0.27);
  const ribbon = blob(player, 0.055, 0.14, 0.03);
  ribbon.position.set(0.23, 0.64, 0.27);
  ribbon.rotation.z = 0.35;
  rig.add(knot, ribbon);

  // 頭
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.2;
  rig.add(head);
  P.head = head;
  const hs = def.headScale || [1, 1, 1];
  head.add(blob(def.main, R * hs[0], R * hs[1], R * hs[2]));

  def.build.call(def, P);

  // ほっぺ
  for (const s of [-1, 1]) {
    const at = def.cheeksAt ? def.cheeksAt(s) : onSphere(R, 0.28 * s, -0.1, 0.006);
    const c = new THREE.Mesh(GEO.disc, cheekMat());
    c.name = 'cheek';
    anchor(head, at).add(c);
  }

  // 表情(全部入れておき、使わないものは scale 0)
  const es = def.eyeScale || 1;
  const mw = def.mouthWidth || 1;
  for (const { key } of EXPRESSIONS) {
    const face = new THREE.Group();
    face.name = 'face_' + key;
    for (const s of [-1, 1]) {
      const at = def.eyesAt ? def.eyesAt(s) : onSphere(R, 0.16 * s, 0.02, def.eyeLift ?? 0.012);
      const eye = anchor(face, at, key === 'normal' ? (s > 0 ? 'eye_L' : 'eye_R') : undefined);
      eye.add(eyeParts(key, s, es));
      if (key === 'normal') P.eyes.push(eye);
    }
    if (def.mouthAt) anchor(face, def.mouthAt()).add(mouthParts(key, mw));
    if (key !== 'normal') face.scale.setScalar(0);
    head.add(face);
  }

  // 目を回したときの星
  const stars = new THREE.Group();
  stars.name = 'stars';
  stars.position.y = R + 0.18;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    const st = new THREE.Mesh(GEO.star, flat(0xffd23f));
    st.position.set(Math.cos(a) * 0.28, 0.03 * Math.sin(a * 2), Math.sin(a) * 0.28);
    stars.add(st);
  }
  stars.scale.setScalar(0);
  head.add(stars);
  P.stars = stars;

  // 腕の休めの角度
  for (const a of P.arms) a.node.rotation.z = 0.3 * a.side;

  const clips = CLIPS.map((c) => bakeClip(P, c.key, c.length));
  applyPose(P, 'idle', 0, true);
  return { root, clips };
}

// ── アニメーション ───────────────────────────────────
// 1コマずつ姿勢を計算して、キーフレームに焼きこむ。
// 周期は clip の長さで割り切れるようにしてあるので、つなぎ目で跳ばない。

function applyPose(P, clip, t, rest = false) {
  let y = 0, sx = 1, sy = 1, lean = 0, roll = 0, hx = 0, hz = 0;
  let armZ = [0.3, 0.3], armX = [0, 0], legX = [0, 0];
  let tailY = 0, flop = 0, blink = 1, stars = 0, starRot = 0;
  if (!rest) {
    switch (clip) {
      case 'idle': {
        const b = Math.sin((TAU * t) / 1.2);
        sy = 1 + 0.02 * b;
        sx = 1 - 0.012 * b;
        hz = 0.06 * Math.sin((TAU * t) / 2.4);
        armZ = [0.3 + 0.05 * b, 0.3 + 0.05 * b];
        tailY = 0.3 * b;
        flop = 0.12 * b;
        blink = t > 1.56 && t < 1.7 ? 0.12 : 1;
        break;
      }
      case 'wave': {
        const w = Math.sin((TAU * t) / 0.6);
        armZ = [0.3, 2.7 + 0.25 * w];
        armX = [0, -0.15];
        hz = -0.1;
        sy = 1 + 0.015 * w;
        tailY = 0.4 * w;
        flop = 0.2 * w;
        break;
      }
      case 'cheer': {
        const p = t / 0.8;
        let air = 0;
        if (p < 0.7) {
          const q = p / 0.7;
          air = 4 * q * (1 - q);
          y = 0.42 * air;
          sy = 1 + 0.07 * Math.sin(Math.PI * q);
          sx = 1 - 0.035 * Math.sin(Math.PI * q);
        } else {
          const s = Math.sin((Math.PI * (p - 0.7)) / 0.3);
          sy = 1 - 0.16 * s;
          sx = 1 + 0.1 * s;
        }
        const a = 2.75 + 0.2 * Math.sin((TAU * t) / 0.4);
        armZ = [a, a];
        legX = [-0.35 * air, 0.35 * air];
        tailY = 0.5 * Math.sin((TAU * t) / 0.4);
        flop = 0.4 * air;
        break;
      }
      case 'run': {
        const f = (TAU * t) / 0.6;
        const s = Math.sin(f);
        legX = [0.85 * s, -0.85 * s];
        armX = [-0.9 * s, 0.9 * s];
        armZ = [0.25, 0.25];
        y = 0.05 * Math.abs(s);
        lean = 0.2;
        hx = -0.12;
        tailY = 0.45 * Math.sin(2 * f);
        flop = 0.3 * Math.sin(2 * f);
        break;
      }
      case 'dizzy': {
        const w = Math.PI * t;
        roll = 0.1 * Math.sin(w);
        hz = 0.22 * Math.sin(w + 0.8);
        hx = 0.08 * Math.cos(w);
        armZ = [0.12 + 0.08 * Math.sin(w), 0.12 - 0.08 * Math.sin(w)];
        legX = [0.1 * Math.sin(w), -0.1 * Math.sin(w)];
        stars = 1;
        starRot = (TAU * t) / 2;
        break;
      }
    }
  }
  const { S, rig, head } = P;
  rig.position.set(0, y * S, 0);
  rig.rotation.set(lean, 0, roll);
  rig.scale.set(S * sx, S * sy, S * sx);
  head.rotation.set(hx, 0, hz);
  P.arms.forEach((a, i) => a.node.rotation.set(armX[i], 0, armZ[i] * a.side));
  P.legs.forEach((l, i) => l.node.rotation.set(legX[i], 0, 0));
  if (P.tail) {
    P.tail.userData.baseX ??= P.tail.rotation.x;
    P.tail.rotation.set(P.tail.userData.baseX, tailY, 0);
  }
  if (P.flop) {
    P.flop.userData.base ??= P.flop.rotation.clone();
    const b = P.flop.userData.base;
    P.flop.rotation.set(b.x, b.y, b.z + flop);
  }
  for (const e of P.eyes) e.scale.set(1, blink, 1);
  P.stars.scale.setScalar(stars);
  P.stars.rotation.y = starRot;
}

function bakeClip(P, clip, length) {
  const nodes = [P.rig, P.head, ...P.arms.map((a) => a.node), ...P.legs.map((l) => l.node), P.stars];
  if (P.tail) nodes.push(P.tail);
  if (P.flop) nodes.push(P.flop);
  const extra = [[P.rig, 'position'], [P.rig, 'scale'], [P.stars, 'scale'], ...P.eyes.map((e) => [e, 'scale'])];
  return bake(clip, length, nodes, extra, (t) => applyPose(P, clip, t));
}
