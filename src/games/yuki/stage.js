// 雪山の 雪合戦 の会場「雪山の ふもとの 村」。
//
// 雪に おおわれた 村の 広場。まん中に 線(小さな 雪の 山と 旗の ひも)。左右の 陣地の おくに、チームの 旗と かまくら。
// まわりには 雪を かぶった 小屋と もみの木、うしろに 大きな 雪山。雪が ちらちら ふる(画面がわ)。
// こおりの ゆかは state から 作る。
//
// 座標: 広場の まん中が 原点。左の チームが -x、右が +x。カメラは +z(手前)の 上から。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { makeRand } from '../daruma/trees.js';
import { RULES } from './rules.js';

export const TEAM_COLORS = { L: 0x4a9ae8, R: 0xff8a3d };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 雪の 面: 白に うすい 青の かげと きらきら
const snowTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#f4f8fc';
  g.fillRect(0, 0, w, h);
  const rand = makeRand(3);
  for (let i = 0; i < 70; i++) {
    const x = rand() * w, y = rand() * h, r = 10 + rand() * 30;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(200,215,235,0.35)');
    grd.addColorStop(1, 'rgba(200,215,235,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(255,255,255,${0.6 + rand() * 0.4})`;
    g.fillRect(rand() * w, rand() * h, 1.5, 1.5);
  }
});
snowTex.wrapS = snowTex.wrapT = THREE.RepeatWrapping;
export const snowMat = new THREE.MeshToonMaterial({ map: snowTex, color: 0xdce6f2, gradientMap: toonGradient });

// 雪を かぶった もみの木
function fir(g, x, z, h, rand) {
  const green = toonMaterial(0x2f5a44), white = toonMaterial(0xf4f8fc), trunk = toonMaterial(0x6a4a32);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * h, 0.15 * h, 0.4 * h, 6), trunk);
  t.position.set(x, 0.2 * h, z);
  g.add(t);
  for (let k = 0; k < 3; k++) {
    const r = (0.55 - k * 0.14) * h, hh = 0.45 * h, y = 0.35 * h + k * 0.28 * h;
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, hh, 7), green);
    c.position.set(x, y + hh / 2, z);
    c.rotation.y = rand() * 3;
    g.add(c);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.8, hh * 0.45, 7), white);
    cap.position.set(x, y + hh * 0.78, z);
    cap.rotation.y = c.rotation.y;
    g.add(cap);
  }
}

// 雪を かぶった 小屋(木の かべ・三角屋根・まどの あかり)
function cabin(g, x, z, rotY) {
  const s = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 1.8), toonMaterial(0x8a5a3a));
  wall.position.y = 0.75;
  s.add(wall);
  for (const sz of [-1, 1]) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 1.35), toonMaterial(0x6a3a2a));
    roof.position.set(0, 1.85, sz * 0.48);
    roof.rotation.x = sz * 0.75;
    s.add(roof);
    const snow = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.14, 1.38), toonMaterial(0xf4f8fc));
    snow.position.set(0, 1.95, sz * 0.52);
    snow.rotation.x = sz * 0.75;
    s.add(snow);
  }
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.45), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  win.position.set(0.5, 0.9, 0.91);
  s.add(win);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.9), toonMaterial(0x5a3a22));
  door.position.set(-0.45, 0.45, 0.91);
  s.add(door);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), toonMaterial(0x7a7068));
  chimney.position.set(0.7, 2.2, -0.3);
  s.add(chimney);
  const chimSnow = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.36), toonMaterial(0xf4f8fc));
  chimSnow.position.set(0.7, 2.52, -0.3);
  s.add(chimSnow);
  // のきの つらら
  const ice = new THREE.MeshToonMaterial({ color: 0xbfe6fa, transparent: true, opacity: 0.9, gradientMap: toonGradient });
  for (let i = 0; i < 9; i++) {
    const len = 0.12 + ((i * 7) % 5) * 0.06;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.035, len, 5).rotateX(Math.PI), ice);
    c.position.set(-1.2 + i * 0.3, 1.43 - len / 2, 0.98);
    s.add(c);
  }
  // まどの 下の 雪の つもり
  const sill = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.12), toonMaterial(0xf4f8fc));
  sill.position.set(0.5, 0.65, 0.95);
  s.add(sill);
  s.userData.chimney = new THREE.Vector3(0.7, 2.6, -0.3);
  s.position.set(x, 0, z);
  s.rotation.y = rotY;
  g.add(s);
  return s;
}

// かざりの 雪だるま(村の あちこちに)
function decoSnowman(g, x, z, rotY, scarf) {
  const white = toonMaterial(0xf8fbff);
  const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), white);
  b1.position.set(x, 0.45, z);
  const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), white);
  b2.position.set(x, 1.1, z);
  const sc = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.07, 6, 14).rotateX(Math.PI / 2), toonMaterial(scarf));
  sc.position.set(x, 0.88, z);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.28, 10), toonMaterial(0x3a3a4a));
  hat.position.set(x, 1.48, z);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 6).rotateX(Math.PI / 2), toonMaterial(0xff8a3d));
  nose.position.set(x + Math.sin(rotY) * 0.36, 1.1, z + Math.cos(rotY) * 0.36);
  nose.rotation.y = rotY;
  g.add(b1, b2, sc, hat, nose);
  const black = toonMaterial(0x1a1a1a);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), black);
    e.position.set(x + Math.sin(rotY) * 0.3 + Math.cos(rotY) * s * 0.12, 1.2, z + Math.cos(rotY) * 0.3 - Math.sin(rotY) * s * 0.12);
    g.add(e);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 4), toonMaterial(0x6a4a32));
    arm.position.set(x + Math.cos(rotY) * s * 0.55, 1.0, z - Math.sin(rotY) * s * 0.55);
    arm.rotation.set(0, rotY, s * 1.0);
    g.add(arm);
  }
}

// かまくら(チームの 陣地の おく)
function kamakura(g, x, z, rotY) {
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), snowMat);
  dome.position.set(x, 0, z);
  g.add(dome);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.45, 14, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xffb860 }));
  hole.position.set(x + Math.sin(rotY) * 1.08, 0.02, z + Math.cos(rotY) * 1.08);
  hole.rotation.y = rotY;
  g.add(hole);
}

function teamFlag(g, x, z, color) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), toonMaterial(0x7a5032));
  pole.position.set(x, 1.2, z);
  g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshToonMaterial({ color, side: THREE.DoubleSide, gradientMap: toonGradient }));
  flag.position.set(x + 0.4 * Math.sign(-x), 2.1, z);
  flag.userData.noMerge = true;
  g.add(flag);
  return flag;
}

export function buildStage(scene) {
  const g = new THREE.Group();
  const rand = makeRand(17);
  // 地面: 雪の 大きな 原っぱ
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160).rotateX(-Math.PI / 2), snowMat);
  snowTex.repeat.set(20, 20);
  ground.receiveShadow = true;
  g.add(ground);
  // 広場の ふち: 雪を つんだ ていぼう
  const bank = toonMaterial(0xcfdcea);
  const W = RULES.halfW + 0.6, D = RULES.halfD + 0.6;
  for (let i = 0; i < 44; i++) {
    const u = i / 44;
    let x, z;
    if (u < 0.25) { x = -W + u * 4 * 2 * W; z = -D; } else if (u < 0.5) { x = W; z = -D + (u - 0.25) * 4 * 2 * D; } else if (u < 0.75) { x = W - (u - 0.5) * 4 * 2 * W; z = D; } else { x = -W; z = D - (u - 0.75) * 4 * 2 * D; }
    if (z > D - 0.1 && Math.abs(x) < W) continue; // 手前は あける(カメラ)
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.45 + rand() * 0.25, 10, 7), bank);
    m.position.set(x, 0, z);
    m.scale.y = 0.55;
    g.add(m);
  }
  // まん中の 線: 小さな 雪の 山と、旗の ひも
  for (let z = -RULES.halfD; z <= RULES.halfD + 0.01; z += 0.55) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), bank);
    m.position.set(0, 0, z);
    m.scale.y = 0.6;
    g.add(m);
  }
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, RULES.halfD * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9ab8d8 }));
  line.position.y = 0.01;
  g.add(line);
  // チームの 旗と かまくら
  const flags = [teamFlag(g, -RULES.halfW - 0.2, -2.8, TEAM_COLORS.L), teamFlag(g, RULES.halfW + 0.2, -2.8, TEAM_COLORS.R)];
  kamakura(g, -RULES.halfW - 1.6, -1.2, Math.PI / 2);
  kamakura(g, RULES.halfW + 1.6, -1.2, -Math.PI / 2);
  // 村: 小屋と もみの木
  const cabins = [cabin(g, -6.5, -7.5, 0.3), cabin(g, 6.8, -7.2, -0.35), cabin(g, 0.5, -9.5, 0)];
  g.updateMatrixWorld(true);
  const chimneys = cabins.map((c) => c.localToWorld(c.userData.chimney.clone()));
  decoSnowman(g, -3.6, -6.2, 0.4, 0xe8344a);
  decoSnowman(g, 3.9, -6.0, -0.3, 0x34c47c);
  decoSnowman(g, -8.6, -2.5, 1.0, 0xffc23c);
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2, d = 9 + rand() * 25;
    const x = Math.cos(a) * d, z = Math.sin(a) * d - 3;
    if (z > 3 && Math.abs(x) < 10) continue; // カメラの 前は あける
    if (Math.abs(x) < 8.5 && z > -6) continue;
    fir(g, x, z, 2 + rand() * 2.5, rand);
  }
  // 大きな 雪山
  const rock = toonMaterial(0x8a96aa), cap = toonMaterial(0xf8fbff);
  for (const [x, z, r, h] of [[-30, -70, 30, 34], [6, -85, 38, 46], [40, -72, 28, 30]]) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), rock);
    m.position.set(x, h / 2 - 1, z);
    g.add(m);
    const c = new THREE.Mesh(new THREE.ConeGeometry(r * 0.45, h * 0.45, 7), cap);
    c.position.set(x, h - h * 0.225 - 1 + 0.2, z);
    g.add(c);
  }
  mergeStatic(g);
  scene.add(g);
  // かまくらの 中の ろうそくの あかり(ぼんやり 光る)
  const glowTex = canvasTex(64, 64, (c) => {
    const grd = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,200,120,0.9)');
    grd.addColorStop(1, 'rgba(255,160,60,0)');
    c.fillStyle = grd;
    c.fillRect(0, 0, 64, 64);
  });
  const glows = [];
  for (const [x, z, rot] of [[-RULES.halfW - 1.6, -1.2, Math.PI / 2], [RULES.halfW + 1.6, -1.2, -Math.PI / 2]]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(x + Math.sin(rot) * 1.0, 0.35, z + Math.cos(rot) * 1.0);
    sp.scale.setScalar(1.4);
    scene.add(sp);
    glows.push(sp);
  }
  for (const c of cabins) {
    // まどの あかりも ぼんやり
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
    sp.position.copy(c.localToWorld(new THREE.Vector3(0.5, 0.9, 1.0)));
    sp.scale.setScalar(1.2);
    scene.add(sp);
    glows.push(sp);
  }
  return { group: g, flags, chimneys, glows };
}

// こおりの ゆか
export function buildIce(c) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(c.r, 28).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: 0xa8dcf4, transparent: true, opacity: 0.85, gradientMap: toonGradient }));
  m.position.set(c.x, 0.012, c.z);
  m.receiveShadow = true;
  const shine = new THREE.Mesh(new THREE.RingGeometry(c.r * 0.35, c.r * 0.5, 20, 1, 0.4, 1.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  shine.position.y = 0.004;
  m.add(shine);
  return m;
}
