// 海の中の 探検の 飾りと しかけ(盤の 見た目。scene.js から よぶ)。
//
// - サンゴ礁: ピンク・だいだい・むらさきの サンゴ、イソギンチャク、ヒトデ。小さな 魚の むれが 泳ぐ
// - 海藻の森: 背の 高い 海藻が ゆらゆら
// - 沈没船: かたむいた 古い 船、マスト、たる、いかり、宝箱
// - 深海: くらい 岩、ふわふわ 光る クラゲ、ちょうちんの 光る チョウチンアンコウ
// - まん中: 大きな シャコ貝(しんじゅ)と サンゴの 木
// - 海流マス: 流れの 帯(矢印が 流れる)。前向き・うしろ向きの 2本を もっていて、流れの 向きで 切りかえる
// - クジラ: 道の 外がわを ゆっくり 泳ぐ。毎ターン つぎの 場所へ。背中に コマを のせて 運ぶ
// - 上から さしこむ 光の すじ
//
// 動くものは userData.anchor を付ける(scene.js が そのまとまりごとに 描く回数を まとめる)。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../runtime/models.js';

const anchor = (g) => { g.userData.anchor = true; return g; };
const mat = (() => {
  const cache = new Map();
  return (hex) => { if (!cache.has(hex)) cache.set(hex, toonMaterial(hex)); return cache.get(hex); };
})();
const glow = (() => {
  const cache = new Map();
  return (hex) => { if (!cache.has(hex)) cache.set(hex, new THREE.MeshBasicMaterial({ color: hex })); return cache.get(hex); };
})();
const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };

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
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,.5)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
});
// 海流の 帯: 白い 矢印(›)が ならぶ。repeat と offset で 流す
function flowTexture() {
  const t = canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = 'rgba(160,240,255,0.55)';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 9;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const x0 of [20, 84]) {
      g.beginPath();
      g.moveTo(x0, 14); g.lineTo(x0 + 22, 32); g.lineTo(x0, 50);
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// 光の すじ: 上が 明るく 下へ 消える
function rayTexture() {
  return canvasTex(32, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(255,255,255,0.7)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 256);
    const side = g.createLinearGradient(0, 0, 32, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)');
    side.addColorStop(0.5, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = side;
    g.fillRect(0, 0, 32, 256);
  });
}

// ── 生きもの ─────────────────────────────────
// 魚: たまご形の 体 + 三角の しっぽ(1つの 形に まとめる)
function fishGeometry() {
  const body = new THREE.SphereGeometry(0.16, 8, 6);
  body.scale(0.6, 0.8, 1.4);
  const tail = new THREE.ConeGeometry(0.13, 0.22, 4);
  tail.rotateX(-Math.PI / 2);
  tail.translate(0, 0, -0.3);
  tail.scale(0.3, 1, 1);
  const g = new THREE.BufferGeometry();
  const parts = [body, tail].map((p) => p.toNonIndexed());
  const pos = [];
  for (const p of parts) pos.push(...p.attributes.position.array);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// クジラ: 青い 大きな 体、白い おなか、しっぽ、ひれ、目、しお(背中の 穴)
function buildWhale() {
  const g = new THREE.Group();
  const blue = mat(0x4a7ac8), belly = mat(0xe8f2ff), dark = mat(0x22345a);
  const body = mesh(new THREE.SphereGeometry(1.4, 24, 16), blue);
  body.scale.set(1.25, 1.0, 2.2);
  const under = mesh(new THREE.SphereGeometry(1.35, 24, 16, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), belly, 0, -0.05, 0.1);
  under.scale.set(1.2, 1.0, 2.1);
  // おなかの しま
  for (let k = 0; k < 4; k++) {
    const s = mesh(new THREE.TorusGeometry(1.05 - k * 0.04, 0.025, 4, 24, Math.PI * 0.5), mat(0xc8d8f0), 0, -0.55, 0.9 - k * 0.45);
    s.rotation.set(Math.PI / 2, 0, Math.PI * 0.75);
    s.scale.set(1.15, 1, 1);
    g.add(s);
  }
  // しっぽ(ふるので anchor の 子に しない。update で 回す)
  const tail = anchor(new THREE.Group());
  tail.position.set(0, 0.1, -2.8);
  const stem = mesh(new THREE.ConeGeometry(0.55, 1.5, 12), blue, 0, 0, -0.5);
  stem.rotation.x = -Math.PI / 2;
  tail.add(stem);
  for (const sx of [-1, 1]) {
    const fl = mesh(new THREE.SphereGeometry(0.55, 12, 8), blue, sx * 0.62, 0, -1.25);
    fl.scale.set(1.3, 0.18, 0.7);
    fl.rotation.y = sx * 0.5;
    tail.add(fl);
  }
  // むなびれ
  const fins = [];
  for (const sx of [-1, 1]) {
    const f = anchor(mesh(new THREE.SphereGeometry(0.5, 12, 8), blue, sx * 1.55, -0.45, 0.8));
    f.scale.set(1.2, 0.16, 0.6);
    f.rotation.set(0, sx * -0.4, sx * -0.5);
    g.add(f);
    fins.push(f);
  }
  // 目と ほっぺ
  for (const sx of [-1, 1]) {
    g.add(mesh(new THREE.SphereGeometry(0.17, 10, 8), dark, sx * 1.42, 0.15, 1.6));
    g.add(mesh(new THREE.SphereGeometry(0.06, 6, 4), glow(0xffffff), sx * 1.53, 0.22, 1.66));
    const ch = mesh(new THREE.SphereGeometry(0.18, 8, 6), mat(0xff9ab8), sx * 1.3, -0.25, 1.85);
    ch.scale.set(0.5, 0.6, 1);
    g.add(ch);
  }
  // 口(にこっ)
  const mouth = mesh(new THREE.TorusGeometry(0.75, 0.04, 4, 24, Math.PI * 0.5), dark, 0, -0.15, 2.4);
  mouth.rotation.set(0.4, 0, Math.PI * 1.25);
  g.add(mouth);
  g.add(body, under, tail);
  // 背中の 平らな ところ(コマが のる)
  const seat = new THREE.Object3D();
  seat.position.set(0, 1.35, 0.3);
  g.add(seat);
  return { g, tail, fins, seat };
}

// クラゲ: 光る かさ + ゆれる 足
function buildJelly(color) {
  const g = new THREE.Group();
  const bell = mesh(new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }));
  g.add(bell);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const t = mesh(new THREE.CylinderGeometry(0.02, 0.01, 0.9, 4), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 }), Math.cos(a) * 0.22, -0.45, Math.sin(a) * 0.22);
    g.add(t);
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(2.0);
  g.add(halo);
  return g;
}

// チョウチンアンコウ: 大きな 口と、頭の 上の 光る ちょうちん
function buildAngler() {
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.8, 14, 10), mat(0x3a3050));
  body.scale.set(1, 0.85, 1.1);
  g.add(body);
  const jaw = mesh(new THREE.SphereGeometry(0.6, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0x2a2238), 0, -0.1, 0.45);
  jaw.scale.set(1.1, 0.7, 0.8);
  g.add(jaw);
  for (let k = 0; k < 6; k++) {
    const tooth = mesh(new THREE.ConeGeometry(0.05, 0.16, 4), glow(0xf6f0e0), -0.4 + k * 0.16, -0.12, 0.98);
    tooth.rotation.x = Math.PI;
    g.add(tooth);
  }
  for (const sx of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), glow(0xfff6a0), sx * 0.35, 0.35, 0.75));
  const rod = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 4), mat(0x3a3050), 0, 1.0, 0.4);
  rod.rotation.x = 0.6;
  g.add(rod);
  const lure = mesh(new THREE.SphereGeometry(0.16, 10, 8), glow(0xfff6a0), 0, 1.35, 0.85);
  g.add(lure);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff09a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(2.4);
  halo.position.copy(lure.position);
  g.add(halo);
  for (const sx of [-1, 1]) {
    const fin = mesh(new THREE.ConeGeometry(0.25, 0.5, 4), mat(0x4a4068), sx * 0.75, 0, -0.2);
    fin.rotation.z = sx * 1.2;
    g.add(fin);
  }
  const tail = mesh(new THREE.ConeGeometry(0.35, 0.6, 4), mat(0x4a4068), 0, 0, -1.1);
  tail.rotation.x = -Math.PI / 2;
  g.add(tail);
  return { g, halo };
}

// 沈没船: かたむいた 船体・やぶれた 帆の マスト・たる・いかり
function buildShip(g, x, z, rot) {
  const ship = new THREE.Group();
  const wood = mat(0x7a5a3a), dark = mat(0x4a3420), green = mat(0x5a7a4a);
  const hull = mesh(new THREE.BoxGeometry(3.2, 1.4, 6.5), wood, 0, 0.6, 0);
  ship.add(hull);
  const bow = mesh(new THREE.ConeGeometry(1.6, 2.4, 4), wood, 0, 0.6, 4.4);
  bow.rotation.set(Math.PI / 2, Math.PI / 4, 0);
  bow.scale.set(1, 1, 0.62);
  ship.add(bow);
  ship.add(mesh(new THREE.BoxGeometry(3.3, 0.18, 6.6), dark, 0, 1.35, 0));
  // 板の すじ
  for (let k = 0; k < 4; k++) ship.add(mesh(new THREE.BoxGeometry(3.25, 0.05, 6.55), dark, 0, 0.1 + k * 0.32, 0));
  // 窓(まるい)
  for (const zz of [-1.8, 0, 1.8]) for (const sx of [-1, 1]) ship.add(mesh(new THREE.CircleGeometry(0.22, 12), mat(0x1a2a3a), sx * 1.61, 0.75, zz).rotateY(sx * Math.PI / 2));
  // マスト(折れて ななめ)と 帆
  const mast = mesh(new THREE.CylinderGeometry(0.13, 0.16, 4.2, 8), wood, 0, 3.2, 0.5);
  mast.rotation.z = 0.35;
  ship.add(mast);
  const sail = mesh(new THREE.PlaneGeometry(2.2, 1.6), new THREE.MeshToonMaterial({ color: 0xe8dcc0, gradientMap: toonGradient, side: THREE.DoubleSide }), -0.5, 3.6, 0.55);
  sail.rotation.z = 0.35;
  ship.add(sail);
  // こけ・海藻
  for (let k = 0; k < 7; k++) {
    const m = mesh(new THREE.SphereGeometry(0.3, 6, 4), green, (k % 2 ? 1 : -1) * 1.5, 0.2 + (k % 3) * 0.3, -2.8 + k * 0.9);
    m.scale.set(0.5, 1, 1);
    ship.add(m);
  }
  ship.position.set(x, 0, z);
  ship.rotation.set(0, rot, 0.28);
  g.add(ship);
  // たると いかり(船の そば)
  const barrel = new THREE.CylinderGeometry(0.35, 0.35, 0.8, 10);
  for (const [dx, dz, lay] of [[2.6, 1.5, true], [3.0, -0.6, false], [-2.6, -2.2, true]]) {
    const b = mesh(barrel, mat(0x9a6a3a), x + dx, lay ? 0.35 : 0.4, z + dz);
    if (lay) b.rotation.z = Math.PI / 2;
    g.add(b);
    for (const oy of [-0.25, 0.25]) {
      const band = mesh(new THREE.TorusGeometry(0.36, 0.03, 4, 16), mat(0x5a5a62), b.position.x + (lay ? oy : 0), b.position.y + (lay ? 0 : oy), b.position.z);
      band.rotation.set(lay ? 0 : Math.PI / 2, lay ? Math.PI / 2 : 0, 0);
      g.add(band);
    }
  }
  const anc = new THREE.Group();
  anc.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), mat(0x5a5a62), 0, 0.8, 0));
  anc.add(mesh(new THREE.TorusGeometry(0.15, 0.05, 6, 12), mat(0x5a5a62), 0, 1.7, 0));
  const arc = mesh(new THREE.TorusGeometry(0.6, 0.07, 6, 16, Math.PI), mat(0x5a5a62), 0, 0.45, 0);
  arc.rotation.z = Math.PI;
  anc.add(arc);
  anc.position.set(x - 2.4, 0, z + 2.6);
  anc.rotation.set(0.3, 0.5, 0.5);
  g.add(anc);
}

// 宝箱(しかけの マスの そばと 船の そば)
function chestMesh() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), mat(0x9a5a2a), 0, 0.25, 0));
  // ふた: うしろの ちょうつがいで ひらく(anchor。ひらく とき 回す)
  const lid = anchor(new THREE.Group());
  lid.position.set(0, 0.5, -0.3);
  const lidM = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10, 1, false, 0, Math.PI), mat(0xb06a32), 0, 0, 0.3);
  lidM.rotation.z = Math.PI / 2;
  lid.add(lidM);
  g.add(lid);
  g.userData.lid = lid;
  g.add(mesh(new THREE.BoxGeometry(0.94, 0.08, 0.64), mat(0xffc83a), 0, 0.48, 0));
  g.add(mesh(new THREE.BoxGeometry(0.14, 0.18, 0.05), mat(0xffc83a), 0, 0.42, 0.31));
  // のぞく 金の どんぐり
  for (const [dx, dz] of [[-0.2, 0.1], [0.15, -0.05], [0.3, 0.12]]) g.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), glow(0xffd24a), dx, 0.62, dz));
  return g;
}

export function buildSea(g, st, rand, { near, isle }) {
  const blocks = []; // 木を 置かない 場所(このステージは 木を 置かないが、飾りどうしの かさなりよけ)
  const updaters = [];
  const areaOf = (x, z) => {
    let best = null, bd = Infinity;
    for (const q of st.squares) { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; best = q; } }
    return best.area;
  };
  const spot = (area, minD = 1.8, tries = 80) => {
    for (let i = 0; i < tries; i++) {
      const a = rand() * Math.PI * 2, r = 0.15 + rand() * 0.8;
      const x = Math.cos(a) * isle.rx * r, z = Math.sin(a) * isle.rz * r;
      if (near(x, z, minD) || Math.hypot(x, z) < 4.5) continue;
      if (near(x, z - 2.5, 1.8)) continue; // 道の すぐ 手前(カメラ がわ)は あける
      if (blocks.some((b) => Math.hypot(b.x - x, b.z - z) < b.r)) continue;
      if (areaOf(x, z) === area) return [x, z];
    }
    return null;
  };
  const block = (x, z, r) => blocks.push({ x, z, r });

  // ── サンゴ礁 ──
  const coralCols = [0xff7aa8, 0xff9a4a, 0xb48cff, 0xffd23c, 0xff5a6a];
  for (let k = 0; k < 16; k++) {
    const p = spot('coral');
    if (!p) continue;
    const [x, z] = p;
    const c = coralCols[k % coralCols.length];
    if (k % 3 === 0) {
      // のうみそ サンゴ(まるい)
      const m = mesh(new THREE.SphereGeometry(0.6 + rand() * 0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(c), x, 0, z);
      g.add(m);
    } else if (k % 3 === 1) {
      // えだ サンゴ
      for (let b = 0; b < 6; b++) {
        const h = 0.6 + rand() * 0.9;
        const br = mesh(new THREE.CylinderGeometry(0.05, 0.1, h, 5), mat(c), x + (rand() - 0.5) * 0.6, h / 2, z + (rand() - 0.5) * 0.6);
        br.rotation.set((rand() - 0.5) * 0.7, 0, (rand() - 0.5) * 0.7);
        g.add(br);
        g.add(mesh(new THREE.SphereGeometry(0.09, 6, 4), mat(c), br.position.x + Math.sin(br.rotation.z) * -h / 2, h, br.position.z + Math.sin(br.rotation.x) * h / 2));
      }
    } else {
      // イソギンチャク(ゆらゆら の 足)
      const an = anchor(new THREE.Group());
      an.position.set(x, 0, z);
      an.add(mesh(new THREE.CylinderGeometry(0.28, 0.35, 0.4, 10), mat(0xff9aa8), 0, 0.2, 0));
      for (let t = 0; t < 10; t++) {
        const a = (t / 10) * Math.PI * 2;
        const arm = mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 4), mat(c), Math.cos(a) * 0.2, 0.6, Math.sin(a) * 0.2);
        arm.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
        an.add(arm);
      }
      g.add(an);
      const ph = rand() * 6;
      updaters.push((t) => { an.rotation.set(Math.sin(t * 1.3 + ph) * 0.12, 0, Math.cos(t * 1.1 + ph) * 0.12); an.scale.y = 1 + Math.sin(t * 2 + ph) * 0.06; });
    }
    block(x, z, 1.2);
  }
  // ヒトデ
  const starGeo = (() => {
    const sh = new THREE.Shape();
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 0.12 : 0.32;
      if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    return geo;
  })();
  for (let k = 0; k < 10; k++) {
    const p = spot(['coral', 'kelp', 'wreck'][k % 3], 1.3);
    if (!p) continue;
    const s = mesh(starGeo, mat([0xff7a3a, 0xffd23c, 0xff5a8a][k % 3]), p[0], 0.05, p[1]);
    s.rotation.y = rand() * 3;
    g.add(s);
  }

  // ── 海藻の森: 背の 高い 海藻(ゆらゆら)──
  const KELP = 46;
  const kelpGeo = (() => {
    const geo = new THREE.PlaneGeometry(0.35, 1, 1, 8);
    geo.translate(0, 0.5, 0);
    // 先へ いくほど 細く、ゆるく ねじる
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setX(i, p.getX(i) * (1 - y * 0.5) + Math.sin(y * 4) * 0.08);
    }
    geo.computeVertexNormals();
    return geo;
  })();
  const kelpMat = new THREE.MeshToonMaterial({ color: 0x4f9a3a, gradientMap: toonGradient, side: THREE.DoubleSide });
  const kelp = new THREE.InstancedMesh(kelpGeo, kelpMat, KELP);
  kelp.frustumCulled = false;
  const kelps = [];
  for (let k = 0; k < KELP; k++) {
    const p = spot('kelp', 1.4, 40) || spot('kelp', 1.0, 40);
    if (!p) { kelps.push(null); continue; }
    kelps.push({ x: p[0], z: p[1], h: 2.5 + rand() * 3.5, ph: rand() * 6, rot: rand() * 3 });
    kelp.setColorAt(k, new THREE.Color([0x4f9a3a, 0x6ab04a, 0x3f8a46, 0x8ab04a][k % 4]));
  }
  g.add(kelp);
  const dmy = new THREE.Object3D();
  updaters.push((t) => {
    kelps.forEach((k, i) => {
      if (!k) { dmy.scale.setScalar(0.0001); dmy.updateMatrix(); kelp.setMatrixAt(i, dmy.matrix); return; }
      dmy.position.set(k.x, 0, k.z);
      dmy.rotation.set(Math.sin(t * 0.9 + k.ph) * 0.12, k.rot, Math.sin(t * 0.7 + k.ph) * 0.15);
      dmy.scale.set(1, k.h, 1);
      dmy.updateMatrix();
      kelp.setMatrixAt(i, dmy.matrix);
    });
    kelp.instanceMatrix.needsUpdate = true;
  });

  // ── 沈没船 ──
  {
    const qs = st.squares.filter((q) => q.area === 'wreck');
    const mid = qs[Math.floor(qs.length / 2)];
    const len = Math.hypot(mid.x, mid.z) || 1;
    const x = mid.x + (mid.x / len) * 5.2, z = mid.z + (mid.z / len) * 5.2;
    buildShip(g, x, z, Math.atan2(mid.x, mid.z) + Math.PI / 2);
    block(x, z, 5);
  }
  // 宝箱マスの そばに 宝箱
  const chests = {};
  for (const q of st.squares) {
    if (q.kind !== 'chest') continue;
    const len = Math.hypot(q.x, q.z) || 1;
    const c = chestMesh();
    c.position.set(q.x - (q.x / len) * 1.5, 0, q.z - (q.z / len) * 1.5);
    c.rotation.y = Math.atan2(q.x - c.position.x, q.z - c.position.z);
    g.add(c);
    chests[q.id] = c;
  }

  // ── 深海: 岩・クラゲ・チョウチンアンコウ ──
  for (let k = 0; k < 9; k++) {
    const p = spot('deep', 2);
    if (!p) continue;
    const r = mesh(new THREE.DodecahedronGeometry(0.6 + rand() * 0.8, 0), mat(0x3a3a5a), p[0], 0.2, p[1]);
    r.rotation.set(rand(), rand(), rand());
    g.add(r);
    block(p[0], p[1], 1.3);
    // 光る チューブワーム
    if (k % 2) for (let t = 0; t < 4; t++) {
      const h = 0.4 + rand() * 0.5;
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, h, 5), mat(0xf0e8e0), p[0] + 0.7 + t * 0.15, h / 2, p[1] + (rand() - 0.5) * 0.4));
      g.add(mesh(new THREE.SphereGeometry(0.08, 6, 4), glow(0xff5a7a), p[0] + 0.7 + t * 0.15, h, p[1] + (rand() - 0.5) * 0.1));
    }
  }
  const jellies = [];
  for (let k = 0; k < 6; k++) {
    const p = spot('deep', 1.2) || spot('wreck', 1.2);
    if (!p) continue;
    const j = anchor(buildJelly([0xb48cff, 0x7ad8ff, 0xff8fd0][k % 3]));
    j.position.set(p[0], 2.5, p[1]);
    g.add(j);
    jellies.push({ j, x: p[0], z: p[1], ph: rand() * 6 });
  }
  updaters.push((t) => {
    for (const q of jellies) {
      const k = Math.sin(t * 1.6 + q.ph);
      q.j.position.set(q.x + Math.sin(t * 0.3 + q.ph) * 0.6, 2.4 + Math.sin(t * 0.8 + q.ph) * 0.6, q.z + Math.cos(t * 0.25 + q.ph) * 0.6);
      q.j.scale.set(1 + k * 0.1, 1 - k * 0.12, 1 + k * 0.1);
    }
  });
  let angler = null;
  {
    const p = spot('deep', 2.4);
    if (p) {
      const a = buildAngler();
      angler = anchor(a.g);
      angler.position.set(p[0], 1.4, p[1]);
      angler.rotation.y = Math.atan2(-p[0], -p[1]);
      g.add(angler);
      block(p[0], p[1], 1.8);
      updaters.push((t) => { angler.position.y = 1.4 + Math.sin(t * 0.9) * 0.25; a.halo.material.opacity = 0.6 + Math.sin(t * 3) * 0.25; });
    }
  }

  // ── まん中: 大きな シャコ貝(しんじゅ)と サンゴの 木 ──
  {
    const clam = new THREE.Group();
    const shell = new THREE.SphereGeometry(1.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const lower = mesh(shell, mat(0xe8d0f0), 0, 0.2, 0);
    lower.rotation.x = Math.PI;
    lower.scale.set(1, 0.5, 1);
    const upper = mesh(shell, mat(0xd8b8f0), 0, 0.3, -0.6);
    upper.rotation.x = -0.9;
    upper.scale.set(1, 0.55, 1);
    // ふちの ぎざぎざ
    for (let k = 0; k < 10; k++) {
      const a = Math.PI + (k / 9) * Math.PI;
      clam.add(mesh(new THREE.ConeGeometry(0.18, 0.3, 4), mat(0xc8a0e8), Math.cos(a) * 1.55, 0.3, Math.sin(a) * -1.55 * 0.2 + 0.1));
    }
    const pearl = mesh(new THREE.SphereGeometry(0.45, 20, 14), new THREE.MeshToonMaterial({ color: 0xfff6ff, emissive: 0x6a5a7a, gradientMap: toonGradient }), 0, 0.55, 0.2);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0ff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(2.2);
    halo.position.copy(pearl.position);
    clam.add(lower, upper, pearl, halo);
    clam.position.set(0, 0, 0.8);
    g.add(clam);
    // サンゴの 木(島の まん中、シャコ貝の うしろ)
    const tree = new THREE.Group();
    const trunkM = mat(0xff8aa8);
    const branch = (x, y, z, len, rx, rz, r, depth) => {
      const b = mesh(new THREE.CylinderGeometry(r * 0.6, r, len, 6), trunkM);
      b.position.set(x, y + len / 2, z);
      b.rotation.set(rx, 0, rz);
      tree.add(b);
      const tx = x - Math.sin(rz) * len, ty = y + Math.cos(rz) * Math.cos(rx) * len, tz = z + Math.sin(rx) * len;
      if (depth <= 0) { tree.add(mesh(new THREE.SphereGeometry(r * 1.6, 8, 6), mat(0xffc0d0), tx, ty, tz)); return; }
      for (const [drx, drz] of [[0.4, 0.5], [-0.5, -0.4], [0.1, -0.7]]) branch(tx, ty, tz, len * 0.7, rx + drx, rz + drz, r * 0.7, depth - 1);
    };
    branch(0, 0, 0, 2.2, 0, 0, 0.35, 2);
    tree.position.set(0, 0, -2.2);
    g.add(tree);
  }

  // ── 海流の 帯(前向き・うしろ向き)──
  const flowTex = flowTexture();
  const flowMatF = new THREE.MeshBasicMaterial({ map: flowTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const flows = [];
  const prevOf = (id) => st.squares.find((q) => q.next.includes(id)).id;
  for (const q of st.squares) {
    if (q.kind !== 'current') continue;
    for (const dir of [1, -1]) {
      const pts = [];
      let id = q.id;
      pts.push(new THREE.Vector3(q.x, 0.45, q.z));
      for (let k = 0; k < st.sea.current; k++) {
        id = dir > 0 ? st.squares[id].next[0] : prevOf(id);
        const b = st.squares[id];
        pts.push(new THREE.Vector3(b.x, 0.45 + Math.sin(((k + 1) / st.sea.current) * Math.PI) * 0.9, b.z));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      // 平たい 帯: 曲線に そって 横はばを もつ
      const N = 60, W = 0.42;
      const pos = [], uv = [], idx = [];
      const tan = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3();
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        curve.getPointAt(u, p);
        curve.getTangentAt(u, tan);
        side.crossVectors(up, tan).normalize().multiplyScalar(W);
        pos.push(p.x - side.x, p.y, p.z - side.z, p.x + side.x, p.y, p.z + side.z);
        const len = curve.getLength();
        uv.push((u * len) / 1.2, 0, (u * len) / 1.2, 1);
        if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const m = new THREE.Mesh(geo, flowMatF);
      m.visible = dir > 0;
      m.renderOrder = 3;
      m.userData.noMerge = true;
      g.add(m);
      flows.push({ m, dir, sq: q.id });
    }
  }

  // ── 上から さしこむ 光の すじ ──
  const rayMat = new THREE.MeshBasicMaterial({ map: rayTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, color: 0xbff4ff, opacity: 0.35, fog: false });
  const rays = new THREE.Group();
  for (let k = 0; k < 9; k++) {
    const x = (rand() - 0.5) * isle.rx * 1.6, z = (rand() - 0.7) * isle.rz * 1.4;
    for (const turn of [0, Math.PI / 2]) {
      const r = mesh(new THREE.PlaneGeometry(1.2 + rand() * 1.5, 22), rayMat, x, 11, z);
      r.rotation.set(0, turn + k, 0.18);
      r.userData.noMerge = true;
      rays.add(r);
    }
  }
  g.add(rays);

  // ── 小さな 魚の むれ(サンゴ礁と 海藻の森を ぐるぐる)──
  const FISH = 36;
  const fish = new THREE.InstancedMesh(fishGeometry(), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient }), FISH);
  fish.frustumCulled = false;
  const schools = [];
  for (let k = 0; k < 4; k++) {
    const p = spot(['coral', 'kelp', 'coral', 'wreck'][k], 0.5) || [0, 0];
    schools.push({ x: p[0], z: p[1], r: 2 + rand() * 2, y: 1.6 + rand() * 1.5, sp: (rand() < 0.5 ? -1 : 1) * (0.4 + rand() * 0.3), color: [0xffa83a, 0x5cc0ff, 0xffd23c, 0xff7aa8][k] });
  }
  for (let i = 0; i < FISH; i++) fish.setColorAt(i, new THREE.Color(schools[i % 4].color));
  g.add(fish);
  updaters.push((t) => {
    for (let i = 0; i < FISH; i++) {
      const s = schools[i % 4], k = Math.floor(i / 4);
      const a = t * s.sp + k * 0.35;
      const x = s.x + Math.cos(a) * (s.r + (k % 3) * 0.3), z = s.z + Math.sin(a) * (s.r + (k % 3) * 0.3);
      dmy.position.set(x, s.y + Math.sin(t * 2 + k) * 0.15 + (k % 2) * 0.3, z);
      // 進む 向き(円の 接線)へ 頭を 向ける
      const tx = -Math.sin(a) * Math.sign(s.sp), tz = Math.cos(a) * Math.sign(s.sp);
      dmy.rotation.y = Math.atan2(tx, tz);
      dmy.scale.setScalar(1);
      dmy.updateMatrix();
      fish.setMatrixAt(i, dmy.matrix);
    }
    fish.instanceMatrix.needsUpdate = true;
  });

  // ── 砂の 上の ゆらめく 光(コースティクス)。2まいを ちがう 向きに ずらして かさねる ──
  const causticTex = canvasTex(256, 256, (c, w) => {
    c.clearRect(0, 0, w, w);
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 3;
    const rnd = (() => { let x = 11; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
    // 網の目: ゆがんだ 円を たくさん
    for (let i = 0; i < 46; i++) {
      const cx = rnd() * w, cy = rnd() * w, r = 10 + rnd() * 22;
      for (const ox of [-w, 0, w]) for (const oy of [-w, 0, w]) {
        c.beginPath();
        for (let k = 0; k <= 12; k++) {
          const a = (k / 12) * Math.PI * 2, rr = r * (0.8 + 0.3 * Math.sin(a * 3 + i));
          const px = cx + ox + Math.cos(a) * rr, py = cy + oy + Math.sin(a) * rr;
          if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
        }
        c.stroke();
      }
    }
  });
  causticTex.wrapS = causticTex.wrapT = THREE.RepeatWrapping;
  const caustics = [];
  for (const [rep, op] of [[5, 0.16], [3.4, 0.12]]) {
    const t = causticTex.clone();
    t.needsUpdate = true;
    t.repeat.set(rep, rep * (isle.rz / isle.rx));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(isle.rx * 2, isle.rz * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: t, color: 0xdffaff, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.y = 0.035;
    m.renderOrder = 1;
    m.userData.noMerge = true;
    g.add(m);
    caustics.push(t);
  }

  // ── ウミガメと マンタ(盤の 上を ゆっくり 大きく 回る)──
  const turtle = anchor(new THREE.Group());
  {
    const shell = mesh(new THREE.SphereGeometry(0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x5a8a4a));
    shell.scale.set(1, 0.55, 1.2);
    const plates = mesh(new THREE.SphereGeometry(0.75, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x7aa85a), 0, 0.03, 0);
    plates.scale.set(1, 0.55, 1.2);
    const belly = mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 16), mat(0xe8d8a0), 0, -0.02, 0);
    belly.scale.set(1, 1, 1.18);
    const head = mesh(new THREE.SphereGeometry(0.32, 12, 8), mat(0x8ab878), 0, 0.12, 1.25);
    for (const sx of [-1, 1]) turtle.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), mat(0x1a2a1a), sx * 0.16, 0.24, 1.48));
    turtle.add(shell, plates, belly, head);
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const f = mesh(new THREE.SphereGeometry(0.35, 8, 6), mat(0x8ab878), sx * 0.95, 0, sz * 0.7);
      f.scale.set(1.3, 0.15, sz > 0 ? 0.6 : 0.4);
      turtle.add(f);
    }
    g.add(turtle);
  }
  const manta = anchor(new THREE.Group());
  {
    const body = new THREE.Shape();
    body.moveTo(0, 1.2);
    body.quadraticCurveTo(1.0, 0.6, 2.4, -0.1);
    body.quadraticCurveTo(1.0, -0.2, 0, -0.9);
    body.quadraticCurveTo(-1.0, -0.2, -2.4, -0.1);
    body.quadraticCurveTo(-1.0, 0.6, 0, 1.2);
    const geo = new THREE.ExtrudeGeometry(body, { depth: 0.2, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.1, bevelSegments: 2 });
    geo.rotateX(-Math.PI / 2);
    manta.add(mesh(geo, mat(0x4a5a8a)));
    const tail = mesh(new THREE.CylinderGeometry(0.03, 0.01, 2.0, 4), mat(0x34466a), 0, 0.1, -1.8);
    tail.rotation.x = Math.PI / 2;
    manta.add(tail);
    for (const sx of [-1, 1]) manta.add(mesh(new THREE.SphereGeometry(0.07, 6, 4), mat(0xe8f0ff), sx * 0.35, 0.28, 0.85));
    g.add(manta);
  }
  updaters.push((t) => {
    const a = t * 0.12;
    turtle.position.set(Math.cos(a) * isle.rx * 0.55, 5.2 + Math.sin(t * 0.7) * 0.3, Math.sin(a) * isle.rz * 0.55);
    turtle.rotation.set(0, Math.atan2(-Math.sin(a), Math.cos(a)), Math.sin(t * 1.2) * 0.08);
    const b = -t * 0.09 + 2;
    // マンタは 島の 外がわを 大きく 回る(盤を かくさない)
    manta.position.set(Math.cos(b) * isle.rx * 1.55, 6 + Math.sin(t * 0.5) * 0.6, Math.sin(b) * isle.rz * 1.6);
    manta.rotation.set(0, Math.atan2(Math.sin(b), -Math.cos(b)), Math.sin(t * 1.4) * 0.18);
  });

  // ── 深海の ふきだし口: あわの 柱 ──
  const vents = [];
  for (let k = 0; k < 3; k++) {
    const p = spot(k < 2 ? 'deep' : 'wreck', 1.6);
    if (!p) continue;
    const cone = mesh(new THREE.ConeGeometry(0.55, 0.9, 7, 1, true), mat(0x4a4058), p[0], 0.45, p[1]);
    g.add(cone);
    g.add(mesh(new THREE.CircleGeometry(0.26, 10).rotateX(-Math.PI / 2), glow(0xff8a5a), p[0], 0.88, p[1]));
    vents.push({ x: p[0], z: p[1] });
    block(p[0], p[1], 1.2);
  }
  const BUB = 60;
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xeafcff, transparent: true, opacity: 0.55, depthWrite: false }), BUB);
  bubbles.frustumCulled = false;
  g.add(bubbles);
  const bub = Array.from({ length: BUB }, (_, i) => ({ v: i % Math.max(1, vents.length), y: (i / BUB) * 7, ph: i * 1.7, s: 0.6 + (i % 5) * 0.2 }));
  // しかけの あわ(海流で 流される コマの うしろ・クジラの しお)
  const burst = [];
  updaters.push((t, dt) => {
    bub.forEach((b, i) => {
      const v = vents[b.v];
      if (!v) { dmy.scale.setScalar(0.0001); dmy.updateMatrix(); bubbles.setMatrixAt(i, dmy.matrix); return; }
      b.y += dt * (1.2 + b.s * 0.5);
      if (b.y > 7) b.y = 0.9;
      dmy.position.set(v.x + Math.sin(t * 2 + b.ph) * 0.15 * b.y * 0.3, b.y, v.z + Math.cos(t * 1.7 + b.ph) * 0.15 * b.y * 0.3);
      dmy.rotation.set(0, 0, 0);
      dmy.scale.setScalar(b.s * (0.7 + b.y * 0.06));
      dmy.updateMatrix();
      bubbles.setMatrixAt(i, dmy.matrix);
    });
    bubbles.instanceMatrix.needsUpdate = true;
    for (let i = burst.length - 1; i >= 0; i--) {
      const b = burst[i];
      b.t += dt;
      b.m.position.addScaledVector(b.vel, dt);
      b.vel.multiplyScalar(Math.exp(-dt * 1.5));
      b.vel.y += dt * 2.5;
      b.m.material.opacity = 0.7 * (1 - b.t / b.life);
      if (b.t >= b.life) { g.remove(b.m); b.m.material.dispose(); burst.splice(i, 1); }
    }
  });
  const bubbleGeo = new THREE.SphereGeometry(0.1, 8, 6);
  // あわを ぶわっと(pos から vel の 向きへ)
  function bubbleBurst(pos, n = 14, spread = 1.5, up = 2) {
    for (let k = 0; k < n; k++) {
      const m = mesh(bubbleGeo, new THREE.MeshBasicMaterial({ color: 0xeafcff, transparent: true, opacity: 0.7, depthWrite: false }), pos.x, pos.y, pos.z);
      m.scale.setScalar(0.6 + Math.random() * 1.2);
      m.userData.noMerge = true;
      g.add(m);
      burst.push({ m, t: 0, life: 1.2 + Math.random() * 0.8, vel: new THREE.Vector3((Math.random() - 0.5) * spread * 2, up * (0.5 + Math.random()), (Math.random() - 0.5) * spread * 2) });
    }
  }

  // ── しかけの 演出 ──
  const acts = []; // { t, dur, step(k), end() }
  const play = (dur, step, end) => new Promise((resolve) => acts.push({ t: 0, dur, step, end: () => { end?.(); resolve(); } }));
  // ふぐ: ぷくーっと ふくらんで、とげが 出て、しぼむ
  function fugu(pos) {
    const f = new THREE.Group();
    const body = mesh(new THREE.SphereGeometry(0.4, 16, 12), mat(0xf2d88a));
    const belly = mesh(new THREE.SphereGeometry(0.38, 12, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), mat(0xfff6e0), 0, -0.02, 0.02);
    f.add(body, belly);
    for (const sx of [-1, 1]) {
      f.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(0x1a1a2a), sx * 0.18, 0.12, 0.33));
      const fin = mesh(new THREE.SphereGeometry(0.1, 6, 4), mat(0xe8b86a), sx * 0.42, 0, 0);
      fin.scale.set(0.3, 1, 1.4);
      f.add(fin);
    }
    f.add(mesh(new THREE.TorusGeometry(0.06, 0.02, 4, 10), mat(0x8a3a2a), 0, -0.05, 0.38));
    const spikes = [];
    for (let k = 0; k < 26; k++) {
      const v = new THREE.Vector3().randomDirection();
      const sp = mesh(new THREE.ConeGeometry(0.035, 0.16, 4), mat(0xc89a5a), v.x * 0.4, v.y * 0.4, v.z * 0.4);
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      sp.scale.setScalar(0.01);
      f.add(sp);
      spikes.push(sp);
    }
    f.position.copy(pos).add(new THREE.Vector3(0.9, 1.6, 0.6));
    g.add(f);
    return play(2.2, (k) => {
      const inflate = k < 0.25 ? k / 0.25 * 0.2 : k < 0.6 ? 0.2 + ((k - 0.25) / 0.35) * 1.6 : k < 0.85 ? 1.8 : 1.8 - ((k - 0.85) / 0.15) * 1.6;
      f.scale.setScalar(0.6 + inflate);
      for (const sp of spikes) sp.scale.setScalar(k > 0.45 && k < 0.9 ? 1.4 : 0.01);
      f.rotation.y = Math.sin(k * 20) * 0.2;
      if (k > 0.55 && k < 0.6 && !f.userData.burst) { f.userData.burst = true; bubbleBurst(f.position, 18, 2.2, 1); }
    }, () => g.remove(f));
  }
  // クラゲの いなずま: 光る クラゲが 上に あらわれて、深海の 子へ ビリビリ
  const boltMat = new THREE.LineBasicMaterial({ color: 0xbff4ff, transparent: true });
  function jellyZap(targets) {
    const j = buildJelly(0xb48cff);
    const c = targets.length ? targets.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / targets.length) : new THREE.Vector3();
    j.position.set(c.x, 4.5, c.z);
    j.scale.setScalar(1.8);
    g.add(j);
    const lines = targets.map(() => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 8), 3));
      const l = new THREE.Line(geo, boltMat);
      g.add(l);
      return l;
    });
    // しびれる 子の まわりの 光
    const sparks = targets.map((b) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xbff4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.position.copy(b).add(new THREE.Vector3(0, 1, 0));
      sp.scale.setScalar(2.6);
      g.add(sp);
      return sp;
    });
    return play(2.0, (k) => {
      j.position.y = 4.5 + Math.sin(k * 12) * 0.15;
      const on = k > 0.25 && Math.floor(k * 30) % 2 === 0;
      boltMat.opacity = on ? 1 : 0;
      for (const sp of sparks) sp.material.opacity = on ? 0.9 : 0.2 * (k > 0.25 ? 1 : 0);
      lines.forEach((l, i) => {
        const a = j.position, b = targets[i];
        const p = l.geometry.attributes.position;
        for (let n = 0; n < 8; n++) {
          const u = n / 7;
          p.setXYZ(n, a.x + (b.x - a.x) * u + (n && n < 7 ? (Math.random() - 0.5) * 0.5 : 0), a.y - 0.5 + (b.y + 0.8 - a.y + 0.5) * u, a.z + (b.z - a.z) * u + (n && n < 7 ? (Math.random() - 0.5) * 0.5 : 0));
        }
        p.needsUpdate = true;
      });
    }, () => { g.remove(j); for (const l of lines) { g.remove(l); l.geometry.dispose(); } for (const sp of sparks) g.remove(sp); });
  }
  // ラッコ: あおむけに 浮いて、おなかの 上で 貝を こんこん
  function otter(pos) {
    const o = new THREE.Group();
    const body = mesh(new THREE.SphereGeometry(0.45, 14, 10), mat(0x8a5a3a));
    body.scale.set(0.8, 0.6, 1.4);
    const face = mesh(new THREE.SphereGeometry(0.3, 12, 8), mat(0xd8c0a0), 0, 0.12, 0.6);
    for (const sx of [-1, 1]) o.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), mat(0x1a1a1a), sx * 0.11, 0.3, 0.72));
    const shell = mesh(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xf2d8e8), 0, 0.32, 0.1);
    const stone = mesh(new THREE.SphereGeometry(0.1, 6, 4), mat(0x8a8a9a), 0, 0.5, 0.2);
    o.add(body, face, shell, stone);
    o.position.copy(pos).add(new THREE.Vector3(0, 2.2, 0));
    g.add(o);
    return play(2.0, (k) => {
      o.position.y = pos.y + 2.2 + Math.sin(k * 8) * 0.1;
      stone.position.y = 0.42 + Math.abs(Math.sin(k * 18)) * 0.25;
      if (k > 0.8 && !o.userData.open) { o.userData.open = true; shell.scale.y = 0.4; bubbleBurst(o.position, 10, 1, 1.5); }
    }, () => g.remove(o));
  }
  // 宝箱を ひらく(ふたが ぱかっ。中から 光)
  function openChest(id) {
    const c = chests[id];
    if (!c) return Promise.resolve();
    const lid = c.userData.lid;
    const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd24a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    light.position.copy(c.position).add(new THREE.Vector3(0, 0.8, 0));
    light.scale.setScalar(2.5);
    g.add(light);
    return play(1.6, (k) => {
      lid.rotation.x = -Math.min(1, k * 3) * 1.9 * (k > 0.85 ? (1 - (k - 0.85) / 0.15) : 1);
      light.material.opacity = Math.sin(Math.min(1, k * 1.2) * Math.PI) * 0.9;
    }, () => { g.remove(light); lid.rotation.x = 0; });
  }
  updaters.push((t, dt) => {
    for (let i = acts.length - 1; i >= 0; i--) {
      const a = acts[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.step(k);
      if (k >= 1) { acts.splice(i, 1); a.end(); }
    }
  });

  // ── ラストスパート: 海が 光る(光る プランクトン)。魚の むれは 虹色で はやく ──
  const PL = 220;
  const plGeo = new THREE.BufferGeometry();
  const plPos = new Float32Array(PL * 3);
  const plHome = [];
  for (let i = 0; i < PL; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand());
    plHome.push([Math.cos(a) * isle.rx * r * 1.05, 0.5 + rand() * 6, Math.sin(a) * isle.rz * r * 1.05, rand() * 6]);
  }
  plGeo.setAttribute('position', new THREE.BufferAttribute(plPos, 3));
  const plMat = new THREE.PointsMaterial({ map: glowTex, color: 0xb8fff0, size: 0.95, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const plankton = new THREE.Points(plGeo, plMat);
  plankton.frustumCulled = false;
  g.add(plankton);
  let spurt = 0, spurtOn = false;
  const rainbow = [0xff6a8a, 0xffb03a, 0xffe14a, 0x6ad86a, 0x5cc0ff, 0xb48cff];
  updaters.push((t, dt) => {
    spurt += ((spurtOn ? 1 : 0) - spurt) * Math.min(1, dt * 1.5);
    plMat.opacity = spurt * (0.75 + Math.sin(t * 2) * 0.2);
    plankton.visible = spurt > 0.01;
    if (plankton.visible) {
      for (let i = 0; i < PL; i++) {
        const h = plHome[i];
        plPos[i * 3] = h[0] + Math.sin(t * 0.5 + h[3]) * 0.6;
        plPos[i * 3 + 1] = h[1] + Math.sin(t * 0.8 + h[3] * 2) * 0.4;
        plPos[i * 3 + 2] = h[2] + Math.cos(t * 0.4 + h[3]) * 0.6;
      }
      plGeo.attributes.position.needsUpdate = true;
    }
  });
  function setSpurt(on) {
    spurtOn = on;
    for (const sc of schools) sc.sp = Math.sign(sc.sp) * (on ? 1.1 : 0.5);
    for (let i = 0; i < FISH; i++) fish.setColorAt(i, new THREE.Color(on ? rainbow[i % rainbow.length] : schools[i % 4].color));
    fish.instanceColor.needsUpdate = true;
  }

  // ── クジラ ──
  const W = buildWhale();
  const whale = anchor(W.g);
  whale.scale.setScalar(0.9);
  g.add(whale);
  // 島の まわりの 道の 外がわ(マスの 外へ 3.2m、高さ 3.6m)を 泳ぐ
  const whalePos = (id, out = new THREE.Vector3()) => {
    const q = st.squares[id];
    const len = Math.hypot(q.x, q.z) || 1;
    return out.set(q.x + (q.x / len) * 3.4, 3.6, q.z + (q.z / len) * 3.4);
  };
  const W0 = { sq: st.sea.whaleStart, swim: null, t: 0 };
  whalePos(W0.sq, whale.position);

  let time = 0;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  return {
    blocked: (x, z, r) => blocks.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + r),
    whale,
    whaleSeat: W.seat,
    whalePos,
    // クジラを マス id へ 泳がせる(道に そって。dur 秒)。snap なら すぐ
    swimTo(id, dur = 2.5, snap = false) {
      if (snap || W0.sq === id) { W0.sq = id; W0.swim = null; whalePos(id, whale.position); return Promise.resolve(); }
      const path = [W0.sq];
      let k = W0.sq;
      for (let i = 0; i < st.squares.length && k !== id; i++) { k = st.squares[k].next[0]; path.push(k); }
      W0.sq = id;
      return new Promise((resolve) => { W0.swim = { path, t: 0, dur, resolve }; });
    },
    bubbleBurst,
    setSpurt,
    // 決着: 島の あちこちから あわが ぶわっ
    celebrate() { for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; bubbleBurst(new THREE.Vector3(Math.cos(a) * isle.rx * 0.6, 0.5, Math.sin(a) * isle.rz * 0.6), 16, 1, 4); } },
    fugu,
    jellyZap,
    otter,
    openChest,
    // クジラの しお(背中から あわが ぶわっと)
    spout() { const p = new THREE.Vector3(); W.seat.getWorldPosition(p); p.y += 0.6; bubbleBurst(p, 24, 0.6, 4.5); },
    setFlow(dir) {
      for (const f of flows) f.m.visible = f.dir === dir;
    },
    update(dt) {
      time += dt;
      for (const u of updaters) u(time, dt);
      caustics[0].offset.set(time * 0.012, time * 0.007);
      caustics[1].offset.set(-time * 0.009, time * 0.011);
      flowTex.offset.x -= dt * 0.9;
      // クジラ: 泳ぐ(しっぽを ふって、ひれを ぱたぱた)
      W.tail.rotation.x = Math.sin(time * 2.4) * 0.25;
      for (const [i, f] of W.fins.entries()) f.rotation.z = (i ? -1 : 1) * (-0.5 + Math.sin(time * 2) * 0.2);
      if (W0.swim) {
        const s = W0.swim;
        s.t = Math.min(1, s.t + dt / s.dur);
        const e = s.t < 0.5 ? 2 * s.t * s.t : 1 - (-2 * s.t + 2) ** 2 / 2;
        const f = e * (s.path.length - 1), i = Math.min(s.path.length - 2, Math.floor(f));
        whalePos(s.path[i], tmp);
        whalePos(s.path[i + 1], tmp2);
        const prev = whale.position.clone();
        whale.position.lerpVectors(tmp, tmp2, f - i);
        const dx = whale.position.x - prev.x, dz = whale.position.z - prev.z;
        if (dx * dx + dz * dz > 1e-6) whale.rotation.y = Math.atan2(dx, dz);
        if (s.t >= 1) { W0.swim = null; s.resolve(); }
      } else {
        // その場で ゆったり 円を えがく
        whalePos(W0.sq, tmp);
        const a = time * 0.35;
        whale.position.set(tmp.x + Math.cos(a) * 0.8, 3.6 + Math.sin(time * 0.9) * 0.25, tmp.z + Math.sin(a) * 0.8);
        whale.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
      }
      whale.rotation.z = Math.sin(time * 0.9) * 0.05;
      // 光の すじは ゆっくり ゆれる
      rays.children.forEach((r, i) => { r.material.opacity = 0.3 + Math.sin(time * 0.6 + i) * 0.08; });
    },
  };
}
