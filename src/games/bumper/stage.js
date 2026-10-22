// 遊園地の バンパーカー の 会場(見た目だけ)。
//
// たそがれの 遊園地の 広場に、少し 高い 丸い リンク。床は チェック柄。
// リンクの ふち(いまの 半径)は 光る 輪。ちぢむと、外の 床の 輪が 暗くなって 沈む。
// まん中の 円盤は うずまきの 矢印が 回る。
// まわりを 輪の 形の 屋根(まん中は あいていて、上から 見える。カメラの いる 手前は あけて、奥半分だけ)。
// 屋根の ふちに 電球と ひらひら。
// 屋根を ささえる しまの 柱。外がわには 観客と、遠くに 観覧車・コースターの かげ(電球つき)。
// リンクの 側面には 電球の 列と ゴムの ふち。床の 上を スポットライトが ゆっくり 回る。
// 手前の 広場には 街灯・きっぷ売り場・風船屋さん・ポップコーンの 屋台。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { RULES } from './rules.js';

export const FLOOR_Y = 0.4; // リンクの 床の 高さ
const ROOF_IN = 8.6, ROOF_OUT = 11.5, ROOF_Y = 4.6;

export const SEATS = [
  { a: -2.6, d: 12.6, kind: 'risu' }, { a: -2.05, d: 13.0, kind: 'harinezumi' }, { a: -1.57, d: 12.8, kind: 'komadori' },
  { a: -1.05, d: 13.0, kind: 'risu' }, { a: -0.5, d: 12.6, kind: 'harinezumi' },
].map((s) => ({ ...s, x: Math.cos(s.a) * s.d, z: Math.sin(s.a) * s.d, y: 0 }));

const canvasTex = (w, h, draw) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// 床: ピンクと むらさきの チェック
function checkerTexture() {
  const t = canvasTex(256, 256, (c, w) => {
    const n = 8;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      c.fillStyle = (i + j) % 2 ? '#ff9ac8' : '#7a5ab8';
      c.fillRect((i * w) / n, (j * w) / n, w / n, w / n);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}
// まん中の 円盤: うずまきの 矢印
function diskTexture() {
  return canvasTex(256, 256, (c, w) => {
    c.fillStyle = '#ffd23c';
    c.beginPath();
    c.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2);
    c.fill();
    c.translate(w / 2, w / 2);
    for (let k = 0; k < 4; k++) {
      c.rotate(Math.PI / 2);
      c.fillStyle = k % 2 ? '#ff6a3a' : '#ff4f9a';
      c.beginPath();
      c.moveTo(18, 0);
      c.quadraticCurveTo(90, -20, 112, -60);
      c.lineTo(122, -30);
      c.quadraticCurveTo(100, 10, 30, 24);
      c.closePath();
      c.fill();
      // 矢じり
      c.beginPath();
      c.moveTo(100, -78);
      c.lineTo(128, -60);
      c.lineTo(104, -40);
      c.closePath();
      c.fill();
    }
    c.fillStyle = '#fff6e0';
    c.beginPath();
    c.arc(0, 0, 18, 0, Math.PI * 2);
    c.fill();
  });
}
function signTexture(text) {
  return canvasTex(512, 112, (x, w, h) => {
    x.fillStyle = '#4a2a12';
    x.beginPath();
    x.roundRect(2, 2, w - 4, h - 4, 30);
    x.fill();
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#ff6fae');
    g.addColorStop(0.5, '#ffb03a');
    g.addColorStop(1, '#5cc0ff');
    x.fillStyle = g;
    x.beginPath();
    x.roundRect(10, 10, w - 20, h - 20, 24);
    x.fill();
    x.font = '400 52px "Dela Gothic One", sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 10;
    x.strokeStyle = '#4a2a12';
    x.strokeText(text, w / 2, 60);
    x.fillStyle = '#fff6e0';
    x.fillText(text, w / 2, 60);
  });
}
const haloTex = canvasTex(64, 64, (x) => {
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
});

// 電球の 列(InstancedMesh + 光の Points)。update(t) で 順に 光が 流れる
function bulbs(parent, pts, { size = 0.08, halo = 0.8, colors = [0xfff2a0, 0xffb8d8, 0xa8e4ff], chase = 6, gap = 3 } = {}) {
  const n = pts.length;
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(size, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
  const dummy = new THREE.Object3D();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  pts.forEach((p, i) => { dummy.position.copy(p); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); pos.set([p.x, p.y, p.z], i * 3); });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const glow = new THREE.Points(geo, new THREE.PointsMaterial({ size: halo, map: haloTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  mesh.frustumCulled = glow.frustumCulled = false;
  parent.add(mesh, glow);
  const base = pts.map((_, i) => new THREE.Color(colors[i % colors.length]));
  const c = new THREE.Color();
  return (t) => {
    for (let i = 0; i < n; i++) {
      const ph = ((t * chase - i) % gap + gap) % gap;
      c.copy(base[i]).multiplyScalar(ph < 1 ? 1 : 0.45);
      mesh.setColorAt(i, c);
      col[i * 3] = c.r * 0.8; col[i * 3 + 1] = c.g * 0.8; col[i * 3 + 2] = c.b * 0.8;
    }
    mesh.instanceColor.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
}

// 位置を 決めて かえす
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

export function buildStage(scene) {
  const g = new THREE.Group();
  const mat = (c) => toonMaterial(c);
  // 広場の 地面(石だたみ っぽい 色)と、遠くの 草
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2), mat(0x8a7aa8));
  ground.receiveShadow = true;
  g.add(ground);
  const plazaTex = canvasTex(512, 512, (c, w) => {
    // 石だたみ: まん中から 輪に ならぶ 石
    c.fillStyle = '#cbb894';
    c.fillRect(0, 0, w, w);
    for (let r = 20; r < w * 0.72; r += 22) {
      const n = Math.max(6, Math.round((r * Math.PI * 2) / 30));
      for (let k = 0; k < n; k++) {
        const a = ((k + (r % 44 ? 0.5 : 0)) / n) * Math.PI * 2;
        c.save();
        c.translate(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r);
        c.rotate(a);
        c.fillStyle = ['#e0d0ae', '#d6c39e', '#e8dabc'][(k + r) % 3];
        c.beginPath();
        c.roundRect(-9, -13, 18, 26, 5);
        c.fill();
        c.restore();
      }
    }
  });
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(ROOF_OUT + 2.5, 48).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: plazaTex, gradientMap: toonGradient }));
  plaza.position.y = 0.01;
  plaza.receiveShadow = true;
  g.add(plaza);
  // 柱(しま)と、輪の 屋根
  // 手前(+z)は カメラが 見下ろすので、屋根も 柱も 置かない
  const back = (a) => Math.sin(a) < 0.3;
  const posts = 10;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2 + Math.PI / posts;
    if (!back(a)) continue;
    const x = Math.cos(a) * (ROOF_IN + 0.6), z = Math.sin(a) * (ROOF_IN + 0.6);
    for (let k = 0; k < 6; k++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, ROOF_Y / 6, 8), mat(k % 2 ? 0xfff6e0 : 0xff4f6a));
      seg.position.set(x, (ROOF_Y / 6) * (k + 0.5), z);
      g.add(seg);
    }
  }
  // 屋根: 内がわが 高い 輪(しまの 色)
  const slices = 20;
  for (let i = 0; i < slices; i++) {
    const a0 = (i / slices) * Math.PI * 2, w = (Math.PI * 2) / slices;
    if (Math.cos(a0 + w / 2) >= 0.3) continue; // LatheGeometry は z = cos(角度)
    const pts = [new THREE.Vector2(ROOF_OUT, ROOF_Y - 0.4), new THREE.Vector2(ROOF_IN, ROOF_Y + 0.6)];
    const geo = new THREE.LatheGeometry(pts, 3, a0, w);
    const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: i % 2 ? 0xfff6e0 : 0xff4f9a, gradientMap: toonGradient, side: THREE.DoubleSide }));
    g.add(m);
  }
  // 屋根の 内がわの ふちの ひらひら(三角)
  const flap = new THREE.ConeGeometry(0.28, 0.5, 3);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    if (!back(a)) continue;
    const m = new THREE.Mesh(flap, mat(i % 2 ? 0xffd23c : 0x5cc0ff));
    m.position.set(Math.cos(a) * ROOF_IN, ROOF_Y + 0.35, Math.sin(a) * ROOF_IN);
    m.rotation.set(Math.PI, -a, 0);
    g.add(m);
  }
  // 看板(奥)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.15), new THREE.MeshToonMaterial({ map: signTexture('バンパーカー'), gradientMap: toonGradient, side: THREE.DoubleSide }));
  sign.position.set(0, ROOF_Y + 1.5, -ROOF_IN - 0.4);
  sign.userData.noMerge = true;
  g.add(sign);
  // リンクの 台(外がわの 側面)と、床の 下の 土台
  const base = new THREE.Mesh(new THREE.CylinderGeometry(RULES.r0 + 0.25, RULES.r0 + 0.4, FLOOR_Y, 48), mat(0x4a3a6a));
  base.position.y = FLOOR_Y / 2 - 0.05;
  g.add(base);
  // リンクの ふちの ゴム(上の ふち)
  const rubber = new THREE.Mesh(new THREE.TorusGeometry(RULES.r0 + 0.3, 0.09, 6, 72).rotateX(Math.PI / 2), mat(0x2e2a3a));
  rubber.position.y = FLOOR_Y - 0.02;
  g.add(rubber);
  // 手前の 広場: 街灯・きっぷ売り場・風船屋さん・ポップコーンの 屋台
  const lampSpots = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    const x = Math.cos(a) * (ROOF_OUT + 1.6), z = Math.sin(a) * (ROOF_OUT + 1.6);
    if (Math.abs(x) < 3 && z > 0) continue; // 正面は あける
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3, 6), mat(0x4a3a6a)), x, 1.5, z));
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff0c0 })), x, 3.1, z));
    lampSpots.push(new THREE.Vector3(x, 3.1, z));
  }
  {
    // きっぷ売り場(右手前)
    const b = new THREE.Group();
    b.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 1.2), mat(0xff8fb8)), 0, 0.9, 0));
    b.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.05), new THREE.MeshBasicMaterial({ color: 0xfff2c0 })), 0, 1.15, 0.62));
    b.add(at(new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.9, 4).rotateY(Math.PI / 4), mat(0x5cc0ff)), 0, 2.25, 0));
    b.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat(0xffd23c)), 0, 2.8, 0));
    b.position.set(9.6, 0, 8.4);
    b.rotation.y = -0.7;
    g.add(b);
    // ポップコーンの 屋台(左手前)
    const p = new THREE.Group();
    p.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.8), mat(0xe8402f)), 0, 0.6, 0));
    p.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.7), new THREE.MeshToonMaterial({ color: 0xfff6e0, gradientMap: toonGradient, transparent: true, opacity: 0.7 })), 0, 1.4, 0));
    for (let k = 0; k < 14; k++) p.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 4), mat(0xfff2b0)), (Math.random() - 0.5) * 0.7, 1.1 + Math.random() * 0.3, (Math.random() - 0.5) * 0.5));
    for (const ox of [-0.5, 0.5]) for (const oz of [-0.3, 0.3]) p.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 5, 10), mat(0x2e2a3a)), ox, 0.16, oz));
    p.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.5, 6), mat(0xffd23c)), 0, 2.05, 0));
    p.position.set(-9.8, 0, 7.8);
    p.rotation.y = 0.6;
    g.add(p);
  }
  // 遠くの コースターの かげ(右奥)
  {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      pts.push(new THREE.Vector3(14 + u * 26, 3 + Math.abs(Math.sin(u * Math.PI * 3)) * 7 * (1 - u * 0.4), -36 - u * 6));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.25, 5), mat(0x6a5a8a)));
    for (let i = 0; i <= 40; i += 3) {
      const p = pts[i];
      g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, p.y, 4), mat(0x6a5a8a)), p.x, p.y / 2, p.z));
    }
  }
  // 遠くの 観覧車の かげ(たそがれの 空に)
  const far = new THREE.Group();
  far.add(new THREE.Mesh(new THREE.TorusGeometry(9, 0.25, 6, 40), mat(0x6a5a8a)));
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9, 4), mat(0x6a5a8a));
    s.rotation.z = (i / 12) * Math.PI;
    far.add(s);
  }
  far.position.set(-18, 12, -42);
  g.add(far);
  mergeStatic(g);
  scene.add(g);

  // 床の 輪(ちぢむと 外から 沈む)。まん中は 円盤
  const floorTex = checkerTexture();
  const floorMat = new THREE.MeshToonMaterial({ map: floorTex, gradientMap: toonGradient });
  const ringEdges = [];
  for (let r = RULES.r0; r > RULES.rMin + 0.01; r -= 0.62) ringEdges.push(r);
  ringEdges.push(RULES.rMin);
  const rings = [];
  for (let i = 0; i < ringEdges.length; i++) {
    const outer = ringEdges[i], inner = ringEdges[i + 1] ?? RULES.diskR;
    const geo = new THREE.RingGeometry(inner, outer, 64, 1).rotateX(-Math.PI / 2);
    // チェックが つながるように、uv を 位置から
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) / 8, p.getZ(k) / 8);
    const m = new THREE.Mesh(geo, floorMat.clone());
    m.position.y = FLOOR_Y;
    m.receiveShadow = true;
    scene.add(m);
    rings.push({ mesh: m, inner, outer, sink: 0 });
  }
  const disk = new THREE.Group();
  const diskTop = new THREE.Mesh(new THREE.CircleGeometry(RULES.diskR, 48).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: diskTexture(), gradientMap: toonGradient }));
  diskTop.position.y = 0.04;
  diskTop.receiveShadow = true;
  disk.add(diskTop);
  disk.add(new THREE.Mesh(new THREE.TorusGeometry(RULES.diskR, 0.06, 6, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff2a0 })));
  disk.position.y = FLOOR_Y;
  scene.add(disk);
  // いまの ふち: 光る 輪
  const edge = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 96).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff6fd0 }));
  edge.position.y = FLOOR_Y + 0.03;
  scene.add(edge);
  const edgeGlow = new THREE.Mesh(new THREE.RingGeometry(0.96, 1.04, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff6fd0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  edgeGlow.position.y = FLOOR_Y + 0.02;
  scene.add(edgeGlow);
  // 遠くの 観覧車は 回る(電球つき)
  const farWheel = new THREE.Group();
  {
    const rim = [];
    for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; rim.push(new THREE.Vector3(Math.cos(a) * 9, Math.sin(a) * 9, 0.3)); }
    farWheel.userData.upd = bulbs(farWheel, rim, { size: 0.18, halo: 2.4, chase: 6, gap: 4 });
    farWheel.position.set(-18, 12, -42);
    scene.add(farWheel);
  }
  // リンクの 側面の 電球と、円盤の ふちの 電球(円盤と いっしょに 回る)
  const sideLights = new THREE.Group();
  {
    const pts = [];
    for (let i = 0; i < 80; i++) { const a = (i / 80) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * (RULES.r0 + 0.34), FLOOR_Y * 0.5, Math.sin(a) * (RULES.r0 + 0.34))); }
    sideLights.userData.upd = bulbs(sideLights, pts, { size: 0.06, halo: 0.6, chase: 10, gap: 5 });
    scene.add(sideLights);
    const dp = [];
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; dp.push(new THREE.Vector3(Math.cos(a) * (RULES.diskR - 0.12), 0.07, Math.sin(a) * (RULES.diskR - 0.12))); }
    disk.userData.upd = bulbs(disk, dp, { size: 0.05, halo: 0.45, colors: [0xfff2a0, 0xff8fd0], chase: 0, gap: 2 });
  }
  const lampGlow = new THREE.Group();
  lampGlow.userData.upd = bulbs(lampGlow, lampSpots, { size: 0.01, halo: 2.6, colors: [0xffe0a0], chase: 0, gap: 1 });
  scene.add(lampGlow);
  // スポットライト: 床の 上を ゆっくり 回る 光の 丸
  const spotTex = canvasTex(128, 128, (x, w) => {
    const gr = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,.55)');
    gr.addColorStop(0.6, 'rgba(255,255,255,.25)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, w, w);
  });
  const spots = [0xfff0a0, 0x8fd8ff, 0xffa0e0].map((c, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: spotTex, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.y = FLOOR_Y + 0.05;
    m.userData.ph = (i / 3) * Math.PI * 2;
    scene.add(m);
    return m;
  });
  // 屋根の 電球
  const lights = new THREE.Group();
  const pts = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    if (Math.sin(a) >= 0.3) continue;
    pts.push(new THREE.Vector3(Math.cos(a) * (ROOF_IN + 0.1), ROOF_Y + 0.55, Math.sin(a) * (ROOF_IN + 0.1)));
  }
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    if (Math.sin(a) >= 0.3) continue;
    pts.push(new THREE.Vector3(Math.cos(a) * ROOF_OUT, ROOF_Y - 0.45, Math.sin(a) * ROOF_OUT));
  }
  const updBulbs = bulbs(lights, pts, { size: 0.09, halo: 0.9, chase: 8 });
  scene.add(lights);

  return {
    group: g,
    disk,
    rings,
    edge,
    edgeGlow,
    spots,
    update(t, s, dt) {
      updBulbs(t);
      farWheel.rotation.z = t * 0.08;
      farWheel.userData.upd(t);
      sideLights.userData.upd(t);
      disk.userData.upd(t);
      lampGlow.userData.upd(t);
      // スポットライト: 輪の 中を 8の字に ゆっくり
      for (const m of spots) {
        if (m.userData.focus) continue;
        const a = t * 0.35 + m.userData.ph;
        const rr = Math.min(s.radius - 1, 3.5 + Math.sin(t * 0.5 + m.userData.ph) * 1.5);
        m.position.x = Math.cos(a) * rr;
        m.position.z = Math.sin(a * 1.3) * rr;
      }
      disk.rotation.y = s.diskAngle; // ルールの 回し方(x = x cos + z sin)と three の y 回転は 同じ 向き
      edge.scale.set(s.radius, 1, s.radius);
      edgeGlow.scale.set(s.radius, 1, s.radius);
      const blink = s.shrinking && s.radius > RULES.rMin + 0.01 ? 0.5 + Math.sin(t * 12) * 0.5 : 1;
      edge.material.color.setHex(blink > 0.5 ? 0xff6fd0 : 0xffffff);
      edgeGlow.material.opacity = 0.35 + blink * 0.35;
      // 外の 輪: ふちが 輪の 中に 入ったら 暗くなって、輪を こえたら 沈む
      for (const r of rings) {
        const dim = s.radius < r.outer - 0.05;
        const gone = s.radius <= r.inner + 0.02;
        r.sink = gone ? Math.min(1, r.sink + dt * 0.8) : 0;
        r.mesh.position.y = FLOOR_Y - r.sink * 0.6;
        r.mesh.material.color.setScalar(dim ? 0.45 : 1);
        r.mesh.visible = r.sink < 1;
      }
    },
  };
}
