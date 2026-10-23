// 夏祭りの ラムネ しゅわしゅわ の 会場(見た目だけ)。
//
// 夏祭りの 夜店。赤白の ひさしの ラムネ屋台、カウンターの 上に 氷水の たらい。うしろに ほかの 屋台(金魚すくい・わたあめ)と
// ちょうちんの ひも。屋台の よこに 高い 竹ざお(高さの 目もり。5 m ごと)。とんだ ふたは 竹ざおに そって 夜空へ。
//
// 座標: カウンターの 前が 原点。5人は x に ならぶ(SEAT_X)。カメラは +z(手前)から。上が +y。

import * as THREE from 'three';
import { toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { makeRand } from '../daruma/trees.js';

// 席 → よこの 位置(自分(席 0)を まん中に)
const ORDER = [2, 1, 3, 0, 4];
export const SEAT_X = (slot) => (ORDER[slot] - 2) * 1.12;
export const COUNTER_Y = 0.95;
export const POLE_X = 3.4; // 高さの 竹ざお

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTex = canvasTex(64, 64, (g) => {
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
});

// ちょうちん(あかりの ぼんやり つき)
function lantern(color = 0xff5a3a) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshBasicMaterial({ color }));
  body.scale.y = 1.25;
  const capMat = toonMaterial(0x2a2a2a);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.07, 10), capMat);
  top.position.y = 0.33;
  const bot = top.clone();
  bot.position.y = -0.33;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(1.6);
  glow.userData.noMerge = true;
  g.add(body, top, bot, glow);
  return g;
}

// 屋台(ひさし・はしら・のれん)
function stall(g, x, z, w, colA, colB, label, rand) {
  const wood = toonMaterial(0x8a5a32);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), wood);
    p.position.set(x + sx * (w / 2 - 0.1), 1.3, z + sz * 0.7);
    g.add(p);
  }
  const n = Math.round(w / 0.5);
  for (let k = 0; k < n; k++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(w / n + 0.01, 0.06, 1.9), toonMaterial(k % 2 ? colA : colB));
    st.position.set(x - w / 2 + (k + 0.5) * (w / n), 2.7, z);
    st.rotation.x = 0.18;
    g.add(st);
  }
  const counter = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, 1.0), toonMaterial(0xc89a62));
  counter.position.set(x, 0.45, z + 0.2);
  g.add(counter);
  // 看板
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, 0.5), new THREE.MeshBasicMaterial({ map: canvasTex(256, 64, (c, cw, ch) => {
    c.fillStyle = '#fff6e0'; c.fillRect(0, 0, cw, ch);
    c.fillStyle = '#c2453a'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, cw / 2, ch / 2 + 2);
  }) }));
  sign.position.set(x, 3.05, z + 0.95);
  sign.userData.noMerge = true;
  g.add(sign);
  void rand;
}

export function buildStage(scene) {
  const group = new THREE.Group();
  const rand = makeRand(17);
  // 地面: 夜の 土の 広場
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 60).rotateX(-Math.PI / 2), toonMaterial(0x5a4a3a));
  ground.receiveShadow = true;
  ground.userData.noMerge = true;
  group.add(ground);
  // ラムネの 屋台(まえ)。赤と 白の ひさし、はば ひろい カウンター
  const wood = toonMaterial(0x9a6a3a);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(7.6, COUNTER_Y, 1.1), wood);
  counter.position.set(0, COUNTER_Y / 2, -0.55);
  group.add(counter);
  const top = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.08, 1.25), toonMaterial(0xc89a62));
  top.position.set(0, COUNTER_Y, -0.55);
  group.add(top);
  // カウンターの 前の 布(水玉)
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 0.8), new THREE.MeshToonMaterial({ map: canvasTex(256, 32, (c, w, h) => {
    c.fillStyle = '#2a6ad0'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 24; i++) { c.beginPath(); c.arc((i + 0.5) * (w / 24), (i % 2 ? 0.3 : 0.7) * h, 4, 0, 7); c.fill(); }
  }) }));
  cloth.position.set(0, 0.45, 0.01);
  group.add(cloth);
  // ひさし(うしろの 柱から 前へ)
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.4, 0.16), wood);
    p.position.set(sx * 3.75, 1.7, -2.4);
    group.add(p);
  }
  for (let k = 0; k < 16; k++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 2.4), toonMaterial(k % 2 ? 0xffffff : 0xe8443a));
    st.position.set(-3.75 + (k + 0.5) * 0.47, 3.35, -1.4);
    st.rotation.x = 0.25;
    group.add(st);
  }
  // のれん「ラムネ」
  const noren = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.7), new THREE.MeshBasicMaterial({ map: canvasTex(256, 80, (c, w, h) => {
    c.fillStyle = '#2a6ad0'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff'; c.font = 'bold 54px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ラムネ', w / 2, h / 2 + 3);
  }), side: THREE.DoubleSide }));
  noren.position.set(0, 2.85, 0.15); // ひさしの しまに かからない ように 手前へ
  noren.userData.noMerge = true;
  group.add(noren);
  // 氷水の たらい(カウンターの はし)と ひえた ラムネ
  for (const sx of [-1, 1]) {
    const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.32, 16, 1, true), toonMaterial(0x8ab0c8));
    tub.material.side = THREE.DoubleSide;
    tub.position.set(sx * 3.35, COUNTER_Y + 0.16, -0.7);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.52, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9ad8ee, transparent: true, opacity: 0.8 }));
    water.position.set(sx * 3.35, COUNTER_Y + 0.27, -0.7);
    water.userData.noMerge = true;
    group.add(tub, water);
    for (let k = 0; k < 6; k++) {
      const ice = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), new THREE.MeshBasicMaterial({ color: 0xe8f8ff }));
      ice.position.set(sx * 3.35 + (rand() - 0.5) * 0.7, COUNTER_Y + 0.3, -0.7 + (rand() - 0.5) * 0.7);
      ice.rotation.set(rand(), rand(), rand());
      group.add(ice);
      const b = ramuneBottle(false);
      b.scale.setScalar(0.8);
      b.position.set(sx * 3.35 + (rand() - 0.5) * 0.6, COUNTER_Y + 0.05, -0.7 + (rand() - 0.5) * 0.6);
      b.rotation.z = (rand() - 0.5) * 0.5;
      group.add(b);
    }
  }
  // うしろの 屋台
  stall(group, -6.5, -6, 3.4, 0xffffff, 0x3aa0f0, 'きんぎょ', rand);
  stall(group, -2.2, -8, 3.2, 0xffffff, 0xff8ab0, 'わたあめ', rand);
  stall(group, 2.4, -7.5, 3.4, 0xffd23a, 0xe8443a, 'やきそば', rand);
  stall(group, 6.6, -6.2, 3.2, 0xffffff, 0x8ad04a, 'かきごおり', rand);
  // 高さの 竹ざお(5 m ごとに 目もり)
  const bamboo = toonMaterial(0x8ab04a), node = toonMaterial(0x6a8a3a);
  for (let y = 0; y < 45; y += 1.5) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 1.45, 8), bamboo);
    seg.position.set(POLE_X, y + 0.75, 1.0);
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.06, 8), node);
    n.position.set(POLE_X, y + 1.5, 1.0);
    group.add(seg, n);
  }
  const marks = [];
  for (let m = 5; m <= 40; m += 5) {
    const t = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 64, (c, w, h) => {
      c.fillStyle = 'rgba(255,246,224,0.95)'; c.beginPath(); c.roundRect(4, 8, w - 8, h - 16, 14); c.fill();
      c.fillStyle = '#7a3a1a'; c.font = 'bold 34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(`${m} m`, w / 2, h / 2 + 2);
    }), depthWrite: false }));
    t.scale.set(1.1, 0.55, 1);
    t.position.set(POLE_X - 0.75, m + 1.6, 1.0);
    scene.add(t);
    marks.push(t);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 8), toonMaterial(0xe8443a));
    band.position.set(POLE_X, m + 1.6, 1.0);
    group.add(band);
  }
  // 盆おどりの やぐら(おくの まん中)。紅白の まく・たいこ・てっぺんから ちょうちんの ひも
  const YZ = -17;
  {
    const wood = toonMaterial(0x7a4a2a);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.2, 0.22), wood);
      leg.position.set(sx * 1.6, 2.1, YZ + sz * 1.6);
      group.add(leg);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.2, 3.8), wood);
    deck.position.set(0, 2.4, YZ);
    group.add(deck);
    // 紅白の まく(下の だん)
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 0.04), toonMaterial(k % 2 ? 0xffffff : 0xe8443a));
      st.position.set(Math.cos(a) * 1.75, 1.6, YZ + Math.sin(a) * 1.75);
      st.rotation.y = -a + Math.PI / 2;
      group.add(st);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.2, 4), toonMaterial(0x5a3a2a));
    roof.position.set(0, 5.4, YZ);
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), wood);
      p.position.set(sx * 1.6, 3.6, YZ + sz * 1.6);
      group.add(p);
    }
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.7, 16).rotateZ(Math.PI / 2), toonMaterial(0xa86a3a));
    drum.position.set(0, 3.0, YZ);
    group.add(drum);
    for (const sx of [-1, 1]) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16).rotateY(sx * Math.PI / 2), toonMaterial(0xf4e8d0));
      face.position.set(sx * 0.36, 3.0, YZ);
      group.add(face);
    }
    // やぐらの てっぺんから 四方へ ちょうちんの ひも
    for (const [ex, ez] of [[-14, -9], [14, -9], [-14, -26], [14, -26], [0, -6]]) {
      const n = 9;
      const from = new THREE.Vector3(0, 5.8, YZ), to = new THREE.Vector3(ex, 3.2, ez);
      const pts = [];
      for (let k = 0; k <= n; k++) { const u = k / n; pts.push(new THREE.Vector3().lerpVectors(from, to, u).add(new THREE.Vector3(0, -Math.sin(u * Math.PI) * 0.8, 0))); }
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.02, 4), toonMaterial(0x2a2a2a)));
      for (let k = 1; k < n; k++) {
        const l = lantern(k % 2 ? 0xff5a3a : 0xffd06a);
        l.scale.setScalar(0.8);
        l.position.copy(pts[k]).add(new THREE.Vector3(0, -0.35, 0));
        group.add(l);
      }
    }
  }
  // 鳥居(左おく)と 石どうろう
  {
    const red = toonMaterial(0xd8402a), black = toonMaterial(0x2a2a2a);
    const tx = -12, tz = -21;
    for (const sx of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 6, 12), red);
      pillar.position.set(tx + sx * 2.2, 3, tz);
      group.add(pillar);
    }
    const kasagi = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.4, 0.6), black);
    kasagi.position.set(tx, 6.2, tz);
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.3, 0.4), red);
    nuki.position.set(tx, 5.2, tz);
    group.add(kasagi, nuki);
    const stoneM = toonMaterial(0x9a948a);
    for (const [x, z] of [[-9.5, -12], [9.5, -12], [-9.5, -3.5], [9.5, -3.5]]) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.6), stoneM);
      base.position.set(x, 0.45, z);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.6, 0.75), stoneM);
      box.position.set(x, 1.2, z);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.5, 4), stoneM);
      top.position.set(x, 1.75, z);
      top.rotation.y = Math.PI / 4;
      const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb060, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
      fire.scale.setScalar(0.8);
      fire.position.set(x, 1.2, z);
      fire.userData.noMerge = true;
      group.add(base, box, top, fire);
    }
  }
  // おくの 森(くらい シルエット)
  {
    const dark = toonMaterial(0x1e2a24), dark2 = toonMaterial(0x24342a);
    for (let k = 0; k < 40; k++) {
      const a = Math.PI * (0.05 + 0.9 * (k / 39));
      const r = 26 + rand() * 8;
      const h = 6 + rand() * 6;
      const c = new THREE.Mesh(new THREE.ConeGeometry(2 + rand() * 1.5, h, 7), k % 2 ? dark : dark2);
      c.position.set(Math.cos(a) * r * -1, h / 2, -Math.sin(a) * r - 4);
      group.add(c);
    }
  }
  // 屋台の 小もの: わたあめの ふくろ・かきごおりの カップ・うちわ
  {
    const bagCols = [0xff9ac8, 0x9ad8ff, 0xffe07a, 0xb8f08a];
    for (let k = 0; k < 6; k++) {
      const bag = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), toonMaterial(bagCols[k % 4]));
      bag.scale.set(1, 1.25, 0.8);
      bag.position.set(-3.5 + k * 0.52, 2.15, -7.1);
      group.add(bag);
    }
    const syrup = [0xe8443a, 0x3aa0f0, 0x8ad04a, 0xffd23a];
    for (let k = 0; k < 5; k++) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.18, 10), toonMaterial(0xffffff));
      cup.position.set(5.6 + k * 0.45, 1.0, -5.8);
      const ice = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), toonMaterial(syrup[k % 4]));
      ice.position.set(5.6 + k * 0.45, 1.09, -5.8);
      group.add(cup, ice);
    }
    // ラムネ屋の カウンターの うちわ
    for (const [x, rot, col] of [[-2.9, 0.4, 0x3aa0f0], [2.9, -0.3, 0xff8ab0]]) {
      const fan = new THREE.Mesh(new THREE.CircleGeometry(0.22, 14), new THREE.MeshToonMaterial({ color: col, side: THREE.DoubleSide }));
      fan.position.set(x, COUNTER_Y + 0.35, -0.25);
      fan.rotation.set(-0.3, 0, rot);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 5), toonMaterial(0xc89a62));
      handle.position.set(x - Math.sin(rot) * -0.2, COUNTER_Y + 0.12, -0.2);
      handle.rotation.z = rot;
      group.add(fan, handle);
    }
  }

  mergeStatic(group, (o) => o.userData.noMerge);
  group.traverse((o) => { if (o.name === 'merged') o.castShadow = o.receiveShadow = true; });
  scene.add(group);

  // 屋台の あかり(あたたかい 色)
  const lamp = new THREE.PointLight(0xffc880, 22, 14, 1.4);
  lamp.position.set(0, 3.0, 1.2);
  scene.add(lamp);
  const lamp2 = new THREE.PointLight(0xff9a6a, 10, 12, 1.6);
  lamp2.position.set(-3, 2.6, 2.4);
  scene.add(lamp2);
  for (const x of [-2.4, 0, 2.4]) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
    bulb.position.set(x, 3.05, -0.4);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd890, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(1.2);
    glow.position.copy(bulb.position);
    scene.add(bulb, glow);
  }
  // ちょうちんの ひも(ゆれる)
  const lanterns = [];
  const cols = [0xff5a3a, 0xffb03a, 0xff5a3a, 0xffffff];
  const ropes = [[-9, 4.4, -3.2, 9, 4.4, -3.2], [-9, 5.6, 3.5, 9, 5.6, 3.5]];
  for (const [x0, y0, z0, x1, y1, z1] of ropes) {
    const n = 12;
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      pts.push(new THREE.Vector3(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u - Math.sin(u * Math.PI) * 0.6, z0 + (z1 - z0) * u));
    }
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.015, 4), toonMaterial(0x2a2a2a)));
    for (let k = 1; k < n; k++) {
      const l = lantern(cols[k % 4]);
      l.position.copy(pts[k]).add(new THREE.Vector3(0, -0.4, 0));
      l.userData.ph = k + z0;
      scene.add(l);
      lanterns.push(l);
    }
  }
  // 夜空の 星
  const stars = (() => {
    const n = 400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 140; pos[i * 3 + 1] = 8 + Math.random() * 70; pos[i * 3 + 2] = -40 - Math.random() * 30; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, fog: false }));
    scene.add(m);
    return m;
  })();
  // 金魚すくいの 水そう(金魚が およぐ)
  const tank = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.8), new THREE.MeshBasicMaterial({ color: 0x5ab8e8, transparent: true, opacity: 0.85 }));
  tank.position.set(-6.5, 0.93, -5.8);
  scene.add(tank);
  const fishes = [];
  for (let k = 0; k < 8; k++) {
    const f = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), toonMaterial(k % 3 ? 0xff6a2a : 0xf4f4f4));
    body.scale.set(1.6, 0.8, 0.9);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 4).rotateZ(Math.PI / 2), toonMaterial(k % 3 ? 0xff8a4a : 0xff6a2a));
    tail.position.x = -0.13;
    f.add(body, tail);
    f.userData = { r: 0.2 + rand() * 0.8, sp: 0.6 + rand() * 0.8, ph: rand() * 6 };
    scene.add(f);
    fishes.push(f);
  }
  // やきそばの ゆげ
  const steam = [];
  for (let k = 0; k < 10; k++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    m.userData = { ph: k / 10 };
    scene.add(m);
    steam.push(m);
  }
  // ホタル(森の ほう)
  const flies = (() => {
    const n = 40, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 40; pos[i * 3 + 1] = 0.5 + Math.random() * 4; pos[i * 3 + 2] = -14 - Math.random() * 14; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTex, color: 0xd8ff7a, size: 0.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(m);
    return m;
  })();
  const flyBase = Float32Array.from(flies.geometry.attributes.position.array);
  // 遠くの 花火(ときどき 夜空に ひらく)
  const farWorks = [];
  let nextWork = 2;
  function farFirework(t) {
    const cols = [0xff6a9a, 0xffd24a, 0x7ad8ff, 0xb48cff, 0x8ad04a];
    const c = cols[Math.floor(Math.random() * cols.length)];
    const at = new THREE.Vector3((Math.random() - 0.5) * 50, 22 + Math.random() * 14, -55);
    const n = 36, pos = new Float32Array(n * 3), dir = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; dir.push([Math.cos(a), Math.sin(a), (Math.random() - 0.5) * 0.3]); pos.set([at.x, at.y, at.z], i * 3); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTex, color: c, size: 1.6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    scene.add(m);
    farWorks.push({ m, at, dir, t0: t });
  }
  function update(t) {
    for (const l of lanterns) l.rotation.z = Math.sin(t * 1.3 + l.userData.ph) * 0.08;
    for (const f of fishes) {
      const u = f.userData;
      const a = t * u.sp + u.ph;
      f.position.set(-6.5 + Math.cos(a) * u.r, 0.97, -5.8 + Math.sin(a) * u.r * 0.3);
      f.rotation.y = -a - Math.PI / 2;
      f.children[1].rotation.y = Math.sin(t * 12 + u.ph) * 0.5;
    }
    for (const m of steam) {
      const k = (t * 0.4 + m.userData.ph) % 1;
      m.position.set(2.4 + Math.sin(k * 6 + m.userData.ph * 9) * 0.4, 1.1 + k * 1.6, -7.2);
      m.scale.setScalar(0.4 + k * 0.8);
      m.material.opacity = Math.sin(k * Math.PI) * 0.35;
    }
    const fp = flies.geometry.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      fp.setX(i, flyBase[i * 3] + Math.sin(t * 0.7 + i) * 0.8);
      fp.setY(i, flyBase[i * 3 + 1] + Math.sin(t * 1.1 + i * 2) * 0.5);
    }
    fp.needsUpdate = true;
    flies.material.opacity = 0.6 + Math.sin(t * 3) * 0.3;
    if (t > nextWork) { nextWork = t + 2.5 + Math.random() * 3; farFirework(t); }
    for (let i = farWorks.length - 1; i >= 0; i--) {
      const w = farWorks[i];
      const k = (t - w.t0) / 1.8;
      const pa = w.m.geometry.attributes.position;
      const r = (1 - (1 - Math.min(1, k)) ** 3) * 6;
      for (let j = 0; j < pa.count; j++) pa.setXYZ(j, w.at.x + w.dir[j][0] * r, w.at.y + w.dir[j][1] * r - k * k * 2, w.at.z + w.dir[j][2] * r);
      pa.needsUpdate = true;
      w.m.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) { scene.remove(w.m); w.m.geometry.dispose(); farWorks.splice(i, 1); }
    }
  }
  return { group, update, marks };
}

// ラムネの びん(あわの 量で 中が かわる)。neck の 上に ふた
export function ramuneBottle(withFoam = true) {
  const g = new THREE.Group();
  const glass = new THREE.MeshToonMaterial({ color: 0x7ad8e8, transparent: true, opacity: 0.55 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.42, 14), glass);
  body.position.y = 0.21;
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.14, 14), glass);
  shoulder.position.y = 0.49;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.12, 12), glass);
  neck.position.y = 0.62;
  // くびれの ビー玉
  const marble = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: 0xd8f4ff }));
  marble.position.y = 0.58;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.08, 12), toonMaterial(0xff6a9a));
  cap.position.y = 0.72;
  g.add(body, shoulder, neck, marble, cap);
  let foam = null, liquid = null;
  if (withFoam) {
    liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.115, 1, 12), new THREE.MeshBasicMaterial({ color: 0xc8f0ff, transparent: true, opacity: 0.75 }));
    foam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.105, 1, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    g.add(liquid, foam);
  }
  // 中を のぼる あわの つぶ(アップの ときに よく 見える)
  const bubbles = [];
  if (withFoam) {
    const bm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    for (let k = 0; k < 14; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.012 + Math.random() * 0.012, 6, 4), bm);
      b.userData = { a: Math.random() * 6.28, r: Math.random() * 0.08, y: Math.random() * 0.42, sp: 0.6 + Math.random() * 0.8 };
      g.add(b);
      bubbles.push(b);
    }
  }
  g.userData = { cap, foam, liquid, bubbles };
  return g;
}
