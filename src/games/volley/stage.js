// 夏の浜べの ビーチバレー の会場「どんぐり海岸」。
//
// 白い 砂浜に ロープの ラインを はった コート。まん中に ネット。おく(-z)は 青い 海と 白い 波うちぎわ。
// 左右には ヤシの木・パラソル・ビーチタオル。おくの 波うちぎわに 見はりやぐら。
// ネットの 柱の 上に 吹き流し(風が ふくと 横へ たなびく)。
//
// 座標: コートの まん中が 原点。左の チームが -x、右が +x。カメラは +z(手前)の 上から。

import * as THREE from 'three';
import { toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { makeRand, taperedTube } from '../daruma/trees.js';
import { RULES } from './rules.js';

export const TEAM_COLORS = { L: 0x3aa0f0, R: 0xff7a4a };
const SEA_Z = -RULES.halfD - 5.5; // 波うちぎわ

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 砂: あたたかい 白に こまかい つぶと 風の もよう
const sandTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#f2dfb4';
  g.fillRect(0, 0, w, h);
  const rand = makeRand(5);
  for (let i = 0; i < 26; i++) {
    const y = rand() * h;
    g.strokeStyle = `rgba(205,170,115,${0.12 + rand() * 0.1})`;
    g.lineWidth = 2 + rand() * 3;
    g.beginPath();
    for (let x = -10; x <= w + 10; x += 8) g.lineTo(x, y + Math.sin(x / 22 + i) * 5);
    g.stroke();
  }
  for (let i = 0; i < 1800; i++) {
    const d = rand();
    g.fillStyle = d < 0.5 ? `rgba(180,140,90,${0.25 + rand() * 0.3})` : `rgba(255,250,235,${0.5 + rand() * 0.5})`;
    g.fillRect(rand() * w, rand() * h, 1.4, 1.4);
  }
});
sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;

// ネットの あみ目
const netTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(30,40,50,0.95)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

// ヤシの木(まがった みき + 大きな 葉)
function palm(g, x, z, h, lean, rand) {
  const pts = [];
  for (let k = 0; k <= 6; k++) {
    const t = k / 6;
    pts.push(new THREE.Vector3(x + Math.sin(lean) * h * 0.35 * t * t, h * t, z + Math.cos(lean) * h * 0.35 * t * t));
  }
  const trunk = new THREE.Mesh(taperedTube(pts, 0.26, 0.16, 8), toonMaterial(0x9a7350));
  g.add(trunk);
  // みきの ふし
  for (let k = 1; k < 9; k++) {
    const p = new THREE.CatmullRomCurve3(pts).getPoint(k / 9);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22 - k * 0.007, 0.04, 5, 10).rotateX(Math.PI / 2), toonMaterial(0x7a5838));
    ring.position.copy(p);
    g.add(ring);
  }
  const top = pts.at(-1);
  const leafMat = toonMaterial(0x3f9a4a), leafMat2 = toonMaterial(0x2f7a3a);
  const n = 7;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rand();
    const leaf = new THREE.Group();
    // 葉: 弓なりに たれる 細長い 板を つなぐ
    const segs = 5;
    for (let j = 0; j < segs; j++) {
      const w = 0.55 * Math.sin(((j + 0.6) / segs) * Math.PI);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, 0.5), k % 2 ? leafMat : leafMat2);
      m.position.set(0, -0.06 * j * j, 0.45 * j + 0.25);
      m.rotation.x = 0.13 * j;
      leaf.add(m);
    }
    leaf.position.copy(top);
    leaf.rotation.set(-0.15, a, 0);
    g.add(leaf);
  }
  // ヤシの実
  for (let k = 0; k < 3; k++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), toonMaterial(0x6a4a2a));
    const a = k * 2.1;
    c.position.set(top.x + Math.cos(a) * 0.18, top.y - 0.18, top.z + Math.sin(a) * 0.18);
    g.add(c);
  }
}

// パラソルと タオル
function parasol(g, x, z, color, rand) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 6), toonMaterial(0xf4f4f4));
  const tilt = (rand() - 0.5) * 0.4;
  pole.position.set(x, 1.1, z);
  pole.rotation.z = tilt;
  g.add(pole);
  const n = 8;
  for (let k = 0; k < n; k++) {
    const seg = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.5, 2, 1, true, (k / n) * Math.PI * 2, (Math.PI * 2) / n), toonMaterial(k % 2 ? 0xffffff : color));
    seg.material.side = THREE.DoubleSide;
    seg.position.set(x - Math.sin(tilt) * 1.1, 2.3, z);
    seg.rotation.z = tilt;
    g.add(seg);
  }
  const towel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 1.7), toonMaterial(color));
  towel.position.set(x + 0.8, 0.02, z + 0.3);
  towel.rotation.y = rand() - 0.5;
  g.add(towel);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.025, 0.25), toonMaterial(0xffffff));
  stripe.position.copy(towel.position);
  stripe.rotation.y = towel.rotation.y;
  g.add(stripe);
}

// 見はりやぐら
function tower(g, x, z) {
  const wood = toonMaterial(0xf4f0e8), red = toonMaterial(0xe8544a);
  for (const [dx, dz] of [[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.5], [0.6, 0.5]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.4, 0.14), wood);
    leg.position.set(x + dx, 1.2, z + dz);
    g.add(leg);
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 1.4), wood);
  floor.position.set(x, 2.4, z);
  g.add(floor);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 1.3), red);
  box.position.set(x, 2.8, z - 0.05);
  g.add(box);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.6, 4), red);
  roof.position.set(x, 3.9, z);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  for (const dx of [-0.65, 0.65]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), wood);
    p.position.set(x + dx, 3.4, z + 0.55);
    g.add(p);
  }
  // はしご
  for (let k = 0; k < 6; k++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.08), wood);
    step.position.set(x, 0.3 + k * 0.38, z + 0.95 - k * 0.06);
    g.add(step);
  }
}

// 海の家(しましまの ひさし・のれん・かき氷の のぼり)
function hut(g, x, z, sx) {
  const wood = toonMaterial(0xc89a62), dark = toonMaterial(0x8a5a32);
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 4.6), wood);
  base.position.set(x, 1.2, z);
  g.add(base);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.25, 5.2), dark);
  roof.position.set(x, 2.55, z);
  g.add(roof);
  // ひさし(コートの ほうへ)
  const n = 8;
  for (let k = 0; k < n; k++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 5.0 / n), toonMaterial(k % 2 ? 0xffffff : 0xe8443a));
    st.position.set(x - sx * 2.1, 2.2, z - 2.5 + (k + 0.5) * (5.0 / n));
    st.rotation.z = sx * 0.35;
    g.add(st);
  }
  // カウンターと のれん
  const counter = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 4.2), toonMaterial(0xf4e8d0));
  counter.position.set(x - sx * 1.75, 0.5, z);
  g.add(counter);
  for (let k = 0; k < 4; k++) {
    const nr = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.55, 0.95), toonMaterial(0x2a6ad0));
    nr.position.set(x - sx * 1.63, 2.0, z - 1.5 + k * 1.0);
    g.add(nr);
  }
  // かき氷の のぼり
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6), toonMaterial(0xf4f4f4));
  pole.position.set(x - sx * 2.6, 1.4, z + 2.8);
  g.add(pole);
  const banner = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.6, 0.6), toonMaterial(0xffffff));
  banner.position.set(x - sx * 2.6, 1.8, z + 2.45);
  g.add(banner);
  const wave = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.62), toonMaterial(0x3aa0f0));
  wave.position.set(x - sx * 2.6, 1.25, z + 2.45);
  g.add(wave);
  const ice = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.35), toonMaterial(0xe8443a));
  ice.position.set(x - sx * 2.6, 2.15, z + 2.45);
  g.add(ice);
}

// ビーチチェア
function chair(g, x, z, sx, color) {
  const frame = toonMaterial(0xf4f4f4);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.6), toonMaterial(color));
  seat.position.set(x, 0.35, z);
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.6), toonMaterial(color));
  back.position.set(x + sx * 0.85, 0.6, z);
  back.rotation.z = -sx * 0.8;
  g.add(back);
  for (const dx of [-0.6, 0.6]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 0.6), frame);
    leg.position.set(x + dx, 0.17, z);
    g.add(leg);
  }
}

export function buildStage(scene) {
  const group = new THREE.Group();
  const rand = makeRand(21);

  // 砂浜
  const sandMat = new THREE.MeshToonMaterial({ map: sandTex, color: 0xffffff });
  sandMat.map.repeat.set(14, 10);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(90, 40).rotateX(-Math.PI / 2), sandMat);
  sand.position.set(0, 0, SEA_Z + 20);
  sand.receiveShadow = true;
  sand.userData.noMerge = true;
  group.add(sand);
  // 波うちぎわへ ゆるく さがる ぬれた 砂
  const wetTex = canvasTex(8, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(150,120,80,0.75)');
    grd.addColorStop(0.55, 'rgba(170,140,95,0.35)');
    grd.addColorStop(1, 'rgba(190,160,110,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(260, 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: wetTex, transparent: true, depthWrite: false }));
  wet.position.set(0, 0.006, SEA_Z + 1.6);
  wet.receiveShadow = true;
  wet.userData.noMerge = true;
  group.add(wet);

  // コートの ライン(青い ロープ)
  const lineMat = toonMaterial(0x2a6ad0);
  const { halfW: W, halfD: D } = RULES;
  for (const sz of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 0.1, 0.04, 0.1), lineMat);
    m.position.set(0, 0.02, sz * D);
    group.add(m);
  }
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, D * 2 + 0.1), lineMat);
    m.position.set(sx * W, 0.02, 0);
    group.add(m);
  }
  // コートの 角の くい
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 6), toonMaterial(0xffffff));
    peg.position.set(sx * W, 0.06, sz * D);
    group.add(peg);
  }

  // ネット: 2本の 柱と あみ、上に 白い 帯
  const postMat = toonMaterial(0xe8e2d4);
  const postZ = D + 0.55;
  const netTop = RULES.netH, netBot = 1.15;
  for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, netTop + 0.5, 10), postMat);
    post.position.set(0, (netTop + 0.5) / 2, sz * postZ);
    post.castShadow = true;
    group.add(post);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), toonMaterial(0xff5a5a));
    cap.position.set(0, netTop + 0.5, sz * postZ);
    group.add(cap);
    // 張り綱
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.3, 4), toonMaterial(0x8a7a60));
    rope.position.set(0, (netTop + 0.3) / 2, sz * (postZ + 0.75));
    rope.rotation.x = sz * 0.6;
    group.add(rope);
  }
  netTex.repeat.set(postZ * 2 / 0.12, (netTop - netBot) / 0.12);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(postZ * 2, netTop - netBot).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  net.position.set(0, (netTop + netBot) / 2, 0);
  net.userData.noMerge = true;
  group.add(net);
  for (const [y, h, c] of [[netTop - 0.04, 0.09, 0xffffff], [netBot, 0.04, 0xffffff]]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, postZ * 2), toonMaterial(c));
    band.position.set(0, y, 0);
    group.add(band);
  }
  // ネットの かげ(地面に まっすぐ)
  const netShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.12, D * 2 + 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xb89a6a, transparent: true, opacity: 0.35 }));
  netShadow.position.set(0, 0.012, 0);
  group.add(netShadow);

  // しんぱんの 台(ネットの よこ・海がわ)。上に フクロウ先生が すわる
  const UZ = -(D + 2.1);
  {
    const wood = toonMaterial(0xf4f0e8), blue = toonMaterial(0x2a6ad0);
    for (const [dx, dz] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.7, 0.09), wood);
      leg.position.set(dx, 0.85, UZ + dz);
      leg.rotation.x = dz * -0.12;
      group.add(leg);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.95), blue);
    seat.position.set(0, 1.7, UZ);
    group.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.6, 0.08), blue);
    back.position.set(0, 2.0, UZ - 0.45);
    group.add(back);
    for (let k = 0; k < 4; k++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.08), wood);
      st.position.set(0, 0.35 + k * 0.36, UZ + 0.5);
      group.add(st);
    }
    // 小さな パラソル
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), wood);
    pole.position.set(0.4, 2.4, UZ - 0.4);
    group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.3, 8), toonMaterial(0xffd23a));
    top.position.set(0.4, 3.15, UZ - 0.4);
    group.add(top);
  }

  // 吹き流し(右の 柱の 上・おく)
  const flag = new THREE.Group();
  flag.position.set(0, netTop + 0.55, -postZ);
  const sock = new THREE.Group();
  const sockCols = [0xff5a5a, 0xffffff, 0xff5a5a, 0xffffff];
  sockCols.forEach((c, k) => {
    const r0 = 0.13 - k * 0.022;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r0 - 0.022, r0, 0.22, 10, 1, true).rotateZ(Math.PI / 2), toonMaterial(c));
    m.material.side = THREE.DoubleSide;
    m.position.x = 0.12 + k * 0.22;
    sock.add(m);
  });
  flag.add(sock);
  flag.userData.noMerge = true;
  group.add(flag);

  // まわりの ヤシ・パラソル
  // カメラは どちらかの はしの うしろに 立つので、コートの 両はし(x の 外)の まん中あたりは あけておく
  // カメラは 手前(+z)の 上から 真横に 見るので、手前の コートの 前は ひくい ものだけ(タオル・貝がら)。
  // 背の 高い ものは 奥(海がわ)と 左右の はしへ
  for (const [x, z, h, lean] of [[-12.5, 8.5, 6.2, 0.6], [13, 9, 5.8, -0.6], [-3, -7.6, 5.0, 2.8], [4.5, -7.9, 5.8, -2.6], [-16, 4, 6.0, 1.3], [26, 3, 6.4, -1.6], [-26, -2, 6.0, 1.6]]) palm(group, x, z, h, lean, rand);
  parasol(group, -10.8, -5.6, 0xffb03a, rand);
  parasol(group, 10.6, -5.9, 0xff6a9a, rand);
  parasol(group, 13.2, -3.4, 0x44c0d8, rand);
  tower(group, -12.5, SEA_Z + 2.2);
  // コートの 両はしの 奥(むこうの はしは カメラから よく 見える): 海の家・ヤシ・ビーチチェア
  for (const sx of [-1, 1]) {
    hut(group, sx * 22, 1.5, sx);
    for (const [x, z, h, lean] of [[16.5, -6.5, 6.4, 0.8], [18.5, 7.5, 5.8, -0.7], [25.5, -4, 6.8, 0.5], [27, 8, 5.6, -1]]) palm(group, sx * x, z, h, sx * lean, rand);
    for (const z of [-3.5, -1.8]) chair(group, sx * 15.5, z, sx, z < -2 ? 0xff6a9a : 0xffd23a);
    parasol(group, sx * 15.8, -5.2, sx < 0 ? 0x44c0d8 : 0xff8a3a, rand);
    parasol(group, sx * 16.5, 4.6, sx < 0 ? 0xffb03a : 0x8ad04a, rand);
  }

  // 砂の こんもり・貝がら・ヒトデ
  const shellCols = [0xffd6c8, 0xfff2e0, 0xffb8a0];
  for (let k = 0; k < 40; k++) {
    let x = (rand() - 0.5) * 40, z = SEA_Z + 1 + rand() * 18;
    if (Math.abs(x) < W + 1.5 && Math.abs(z) < D + 1.5) continue;
    if (rand() < 0.5) {
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), toonMaterial(shellCols[k % 3]));
      sh.scale.set(1, 0.5, 1.2);
      sh.position.set(x, 0, z);
      sh.rotation.y = rand() * 6;
      group.add(sh);
    } else {
      const st = new THREE.Group();
      for (let j = 0; j < 5; j++) {
        const arm = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4).rotateZ(-Math.PI / 2), toonMaterial(0xff8a5a));
        arm.position.set(Math.cos((j / 5) * Math.PI * 2) * 0.09, 0.02, Math.sin((j / 5) * Math.PI * 2) * 0.09);
        arm.rotation.y = -(j / 5) * Math.PI * 2;
        st.add(arm);
      }
      st.position.set(x, 0, z);
      group.add(st);
    }
  }
  mergeStatic(group, (o) => o.userData.noMerge);
  group.traverse((o) => { if (o.name === 'merged') o.castShadow = o.receiveShadow = true; });
  scene.add(group);

  // 海(うごく)。波うちぎわは あさい 水色、沖へ いくほど こい 青
  const seaGeo = new THREE.PlaneGeometry(320, 160, 72, 30).rotateX(-Math.PI / 2);
  {
    const p = seaGeo.attributes.position, cols = new Float32Array(p.count * 3);
    const near = new THREE.Color(0x4fd0e0), mid = new THREE.Color(0x2a9ad8), far = new THREE.Color(0x1a5aa8), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const d = Math.min(1, (80 - p.getZ(i)) / 160); // 0(手前の はし)→ 1(沖)
      if (d < 0.12) c.lerpColors(near, mid, d / 0.12); else c.lerpColors(mid, far, Math.min(1, (d - 0.12) / 0.5));
      cols.set([c.r, c.g, c.b], i * 3);
    }
    seaGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  const sea = new THREE.Mesh(seaGeo, new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.95 }));
  sea.position.set(0, -0.06, SEA_Z - 80);
  scene.add(sea);
  const seaBase = Float32Array.from(seaGeo.attributes.position.array);
  // 浅い ところの 明るい 水
  const shallow = new THREE.Mesh(new THREE.PlaneGeometry(320, 5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8ae8ec, transparent: true, opacity: 0.55, depthWrite: false }));
  shallow.position.set(0, -0.02, SEA_Z - 2);
  scene.add(shallow);
  // 白い 波(ふちが くねくねの あわ。2まいを ずらして よせて かえす)
  const foamTex = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) g.lineTo(x, h * 0.45 + Math.sin(x / 18) * 8 + Math.sin(x / 7) * 3);
    g.lineTo(w, h);
    g.fill();
    for (let i = 0; i < 60; i++) {
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath();
      g.arc(Math.random() * w, h * 0.2 + Math.random() * h * 0.35, 1 + Math.random() * 3, 0, 7);
      g.fill();
    }
  });
  foamTex.wrapS = THREE.RepeatWrapping;
  foamTex.repeat.set(40, 1);
  const foams = [0, 1].map((k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(320, 1.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: foamTex.clone(), transparent: true, depthWrite: false }));
    m.material.map.repeat.set(40 + k * 7, 1);
    m.material.map.needsUpdate = true;
    m.position.set(0, 0.012 + k * 0.004, SEA_Z);
    scene.add(m);
    return m;
  });
  // 海の きらきら(日の光が はねる)
  const glint = (() => {
    const n = 260, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 120; pos[i * 3 + 1] = 0.1; pos[i * 3 + 2] = SEA_Z - 3 - Math.random() * 70; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.9, depthWrite: false }));
    scene.add(m);
    return m;
  })();
  // ブイの ならび(赤と 白の うき)
  const buoys = [];
  for (let k = 0; k < 18; k++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), toonMaterial(k % 2 ? 0xffffff : 0xff4a3a));
    b.position.set(-34 + k * 4, 0, SEA_Z - 14);
    scene.add(b);
    buoys.push(b);
  }
  // 沖の 小島(ヤシ つき)と ヨット
  const isle = new THREE.Group();
  const mound = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), toonMaterial(0x4a9a4a));
  mound.scale.set(1.6, 0.45, 1);
  isle.add(mound);
  const beachRing = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 11, 0.4, 20), toonMaterial(0xf2dfb4));
  beachRing.scale.set(1, 1, 0.65);
  isle.add(beachRing);
  palm(isle, -3, -1, 5.5, 0.6, rand);
  palm(isle, 2.5, 0.5, 4.8, -0.5, rand);
  isle.position.set(-38, -0.1, SEA_Z - 75);
  scene.add(isle);
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.6, 1.0), toonMaterial(0xffffff));
  hull.position.y = 0.3;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.12, 1.05), toonMaterial(0x2a6ad0));
  stripe.position.y = 0.42;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.6, 6), toonMaterial(0xc8a070));
  mast.position.y = 2.2;
  const sailGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.1, 0.8, 0), new THREE.Vector3(0.1, 3.9, 0), new THREE.Vector3(1.6, 0.8, 0)]);
  sailGeo.computeVertexNormals();
  const sail = new THREE.Mesh(sailGeo, new THREE.MeshToonMaterial({ color: 0xfff6e8, side: THREE.DoubleSide }));
  const sail2 = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.1, 0.8, 0), new THREE.Vector3(-0.1, 3.4, 0), new THREE.Vector3(-1.2, 0.8, 0)]), new THREE.MeshToonMaterial({ color: 0xff7a4a, side: THREE.DoubleSide }));
  boat.add(hull, stripe, mast, sail, sail2);
  boat.position.set(20, 0, SEA_Z - 45);
  scene.add(boat);
  // 入道雲(夏の 空の おくに もくもく)。下は すこし 青い かげ、上は まっ白
  const cloudGeo = new THREE.IcosahedronGeometry(1, 3);
  {
    const p = cloudGeo.attributes.position, cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const k = 0.82 + 0.18 * Math.max(0, p.getY(i) * 0.5 + 0.5); cols.set([k * 0.97, k * 0.99, k], i * 3); }
    cloudGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  const cloudMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const crand = makeRand(77);
  const thunder = (x, z, sc) => {
    const g2 = new THREE.Group();
    for (let k = 0; k < 30; k++) {
      const h = crand();
      const r = (8 + crand() * 9) * (1 - h * 0.35);
      const m = new THREE.Mesh(cloudGeo, cloudMat);
      m.scale.set(r, r * 0.85, r);
      m.position.set((crand() - 0.5) * 60 * (1 - h * 0.7), h * 60, (crand() - 0.5) * 16);
      g2.add(m);
    }
    g2.position.set(x, -6, z);
    g2.scale.setScalar(sc);
    scene.add(g2);
  };
  thunder(30, SEA_Z - 300, 1);
  thunder(-110, SEA_Z - 280, 0.7);
  thunder(140, SEA_Z - 260, 0.55);
  // カニ(波うちぎわを よこ歩き)
  const crabs = [0, 1].map((k) => {
    const c = new THREE.Group();
    const red = toonMaterial(0xe8503a);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 6), red);
    body.scale.set(1.3, 0.6, 1);
    body.position.y = 0.1;
    c.add(body);
    for (const sx of [-1, 1]) {
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), red);
      claw.position.set(sx * 0.2, 0.14, 0.12);
      c.add(claw);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
      eye.position.set(sx * 0.06, 0.22, 0.1);
      c.add(eye);
      for (let j = 0; j < 3; j++) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.02), red);
        leg.position.set(sx * 0.2, 0.05, -0.06 + j * 0.06);
        leg.rotation.z = sx * -0.5;
        c.add(leg);
      }
    }
    c.position.set(k ? 12 : -14, 0, SEA_Z + 1.4);
    c.userData = { x0: c.position.x, speed: 0.6 + k * 0.3, phase: k * 2 };
    scene.add(c);
    return c;
  });

  let netWob = 0;
  const shakeNet = () => { netWob = 1; };
  function update(t, wind) {
    netWob = Math.max(0, netWob - 0.025);
    net.position.x = Math.sin(t * 38) * netWob * 0.12;
    net.scale.y = 1 - netWob * 0.06;
    const p = seaGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = seaBase[i * 3], z = seaBase[i * 3 + 2];
      p.setY(i, Math.sin(x * 0.18 + t * 1.4) * 0.12 + Math.sin(z * 0.3 - t * 1.1) * 0.1);
    }
    p.needsUpdate = true;
    const w = Math.sin(t * 0.8);
    foams.forEach((f, k) => {
      const wk = Math.sin(t * 0.8 - k * 1.3);
      f.position.z = SEA_Z - 0.3 + wk * 0.8;
      f.material.opacity = 0.45 + 0.5 * Math.max(0, wk);
      f.material.map.offset.x = t * 0.01 * (k ? -1 : 1);
    });
    shallow.position.z = SEA_Z - 2 + w * 0.6;
    // きらきら: すこしずつ 場所を かえて、ちらちら
    const gp = glint.geometry.attributes.position;
    for (let n = 0; n < 6; n++) {
      const i = Math.floor(Math.random() * gp.count);
      gp.setX(i, (Math.random() - 0.5) * 120);
      gp.setZ(i, SEA_Z - 3 - Math.random() * 70);
    }
    gp.needsUpdate = true;
    glint.material.opacity = 0.6 + Math.sin(t * 9) * 0.25;
    buoys.forEach((b, k) => { b.position.y = Math.sin(t * 1.6 + k * 0.7) * 0.1; b.rotation.z = Math.sin(t * 1.3 + k) * 0.15; });
    boat.position.x = 20 - ((t * 0.6) % 90);
    if (boat.position.x < -70) boat.position.x += 90;
    boat.position.y = Math.sin(t * 1.2) * 0.12;
    boat.rotation.z = Math.sin(t * 1.0) * 0.05;
    for (const c of crabs) {
      const u = c.userData;
      c.position.x = u.x0 + Math.sin(t * 0.25 * u.speed + u.phase) * 4;
      c.position.y = Math.abs(Math.sin(t * 14)) * 0.02;
      c.rotation.y = Math.sin(t * 2 + u.phase) * 0.2;
    }
    // 吹き流し: ふだんは だらりと、風が ふくと 横へ ぴん
    const k = Math.min(1, Math.abs(wind));
    flag.rotation.y = wind >= 0 ? -Math.PI / 2 : Math.PI / 2;
    sock.rotation.z = -1.25 * (1 - k) + Math.sin(t * (3 + k * 9)) * (0.08 + k * 0.08);
    sock.rotation.x = Math.sin(t * 7) * 0.1 * k;
  }

  // 見物の 席(奥・海がわ。カメラから 顔が 見える)
  const seats = [[-3.0, -5.5], [3.0, -5.6], [-5.6, -5.4], [5.6, -5.5], [-8.2, -5.2], [8.2, -5.3]].map(([x, z]) => ({ x, z }));
  for (const st of seats) {
    const towel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.02, 0.8), toonMaterial([0xffd23a, 0x44c0d8, 0xff6a9a, 0x8ad04a][seats.indexOf(st) % 4]));
    towel.position.set(st.x, 0.02, st.z - 0.1);
    towel.receiveShadow = true;
    scene.add(towel);
  }
  return { group, update, shakeNet, flag, seats, umpire: new THREE.Vector3(0, 1.75, UZ) };
}
