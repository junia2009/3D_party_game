// いかだレース の いかだ と かい。
//
// いかだ: 木の皮の丸太5本(長さを少しずつ変える)。切り口は明るい木の色に年輪。
//         前とうしろを なわで ぐるぐるしばる。まん中に葉っぱのざぶとん、前に どんぐりの袋、うしろに自分の色の旗。
// かい:   木の柄に T字のにぎり、まるい水かき。水かきのつけねに自分の色の帯。
// 動かないところは mergeStatic で1つにまとめる(旗だけは ゆらすので別)。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { mergeStatic } from '../../runtime/merge.js';
import { acornGeometry, makeRand } from '../daruma/trees.js';

const vc = () => new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient });

// 年輪の切り口の絵(全部のいかだで使いまわす)
let ringsTex = null;
function ringsTexture() {
  if (ringsTex) return ringsTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#e8c48a';
  g.fillRect(0, 0, 64, 64);
  for (let r = 4; r < 32; r += 4) {
    g.strokeStyle = r % 8 ? 'rgba(160,110,60,0.55)' : 'rgba(140,90,45,0.8)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(32 + Math.sin(r) * 1.2, 32, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = '#7a4a24';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.stroke();
  ringsTex = new THREE.CanvasTexture(c);
  ringsTex.colorSpace = THREE.SRGBColorSpace;
  return ringsTex;
}

// 木の皮の丸太(たてのすじ・こぶ)。z の向きに長い
function logGeometry(len, r, rand, hue) {
  const geo = new THREE.CylinderGeometry(r, r * 1.05, len, 10, 6);
  const p = geo.attributes.position;
  const cols = [];
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    // でこぼこ
    const k = 1 + Math.sin(a * 5 + y * 3) * 0.04 + Math.sin(y * 9 + a) * 0.02;
    p.setX(i, x * k);
    p.setZ(i, z * k);
    const stripe = Math.sin(a * 11 + Math.sin(y * 4) * 1.5) * 0.5 + 0.5;
    c.setHSL(hue, 0.42, 0.26 + stripe * 0.1 + (rand() - 0.5) * 0.03);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  geo.rotateX(Math.PI / 2);
  return geo;
}

export function makeRaft(colorHex, seed = 1) {
  const rand = makeRand(1000 + seed * 7);
  const g = new THREE.Group();
  const body = new THREE.Group(); // まとめるところ
  g.add(body);
  const endMat = new THREE.MeshToonMaterial({ map: ringsTexture(), gradientMap: toonGradient });
  const logs = [];
  for (let i = 0; i < 5; i++) {
    const len = 1.62 + rand() * 0.2;
    const r = 0.145 + rand() * 0.025;
    const x = (i - 2) * 0.29;
    const zo = (rand() - 0.5) * 0.12;
    const m = new THREE.Mesh(logGeometry(len, r, rand, 0.07 + rand() * 0.02), vc());
    m.position.set(x, 0.05, zo);
    body.add(m);
    for (const sd of [-1, 1]) {
      const end = new THREE.Mesh(new THREE.CircleGeometry(r * 0.96, 12), endMat);
      end.position.set(x, 0.05, zo + sd * (len / 2 + 0.002));
      end.rotation.y = sd > 0 ? 0 : Math.PI;
      body.add(end);
    }
    logs.push({ x, r, zo });
  }
  // なわ: 前とうしろ。丸太を1本ずつ ぐるっとまく + 上をわたるなわ
  const ropeMat = toonMaterial(0xd8bf86);
  for (const z of [-0.52, 0.5]) {
    for (const lg of logs) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(lg.r + 0.012, 0.022, 5, 12), ropeMat);
      ring.position.set(lg.x, 0.05, z);
      body.add(ring);
    }
    const over = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.3, 5), ropeMat);
    over.rotation.z = Math.PI / 2;
    over.position.set(0, 0.21, z);
    body.add(over);
    // むすび目
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), ropeMat);
    knot.position.set(0.68, 0.18, z);
    body.add(knot);
  }
  // 葉っぱのざぶとん(すわるところ)
  const leafMat = toonMaterial(0x6fb04f);
  for (let k = 0; k < 3; k++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 6), k === 1 ? toonMaterial(0x8fc85a) : leafMat);
    leaf.scale.set(1, 0.12, 0.62);
    leaf.position.set((k - 1) * 0.1, 0.22, 0.05 + (k - 1) * 0.05);
    leaf.rotation.y = (k - 1) * 0.6;
    body.add(leaf);
  }
  // 前に どんぐりの袋
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), toonMaterial(0xc8a26a));
  bag.scale.set(1, 0.8, 1);
  bag.position.set(-0.35, 0.3, 0.62);
  body.add(bag);
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 4, 10), toonMaterial(0x8a5a32));
  tie.rotation.x = Math.PI / 2;
  tie.position.set(-0.35, 0.42, 0.62);
  body.add(tie);
  const nut = new THREE.Mesh(acornGeometry(), new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient }));
  nut.scale.setScalar(0.5);
  nut.position.set(-0.33, 0.44, 0.6);
  nut.rotation.z = 0.5;
  body.add(nut);
  // 旗の柱
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.35, 6), toonMaterial(0x6b4a30));
  pole.position.set(0.62, 0.78, -0.74); // うしろの すみ(体の大きな子にも ささらないように)
  body.add(pole);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), toonMaterial(0xffd24a));
  tip.position.set(0.62, 1.47, -0.74);
  body.add(tip);
  body.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  mergeStatic(body);
  // 自分の色の三角の旗(ゆらす)
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.48, -0.13);
  shape.lineTo(0, -0.28);
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshToonMaterial({ color: colorHex, gradientMap: toonGradient, side: THREE.DoubleSide }));
  flag.position.set(0.62, 1.42, -0.74);
  flag.castShadow = true;
  g.add(flag);
  return { g, flag };
}

// かい: 両はしに水かきのある カヤックのかい(こうごに こぐのに ぴったり)。まん中を原点に、x の向きに長い。
// 水かきのつけねに自分の色の帯
export function makePaddle(colorHex) {
  const g = new THREE.Group();
  const wood = toonMaterial(0xc89a62);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.7, 7), wood);
  shaft.rotation.z = Math.PI / 2;
  g.add(shaft);
  // まるい水かき(しずくの形を平たく)
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.05);
  sh.bezierCurveTo(0.12, 0.02, 0.12, -0.3, 0, -0.38);
  sh.bezierCurveTo(-0.12, -0.3, -0.12, 0.02, 0, 0.05);
  const bladeGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.022, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1 });
  bladeGeo.translate(0, 0, -0.011);
  const bladeMat = toonMaterial(0xb07a44);
  const bandMat = toonMaterial(colorHex);
  for (const sd of [-1, 1]) {
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.rotation.z = sd * Math.PI / 2; // 先が外を向く
    blade.position.x = sd * 0.83;
    g.add(blade);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.07, 8), bandMat);
    band.rotation.z = Math.PI / 2;
    band.position.x = sd * 0.8;
    g.add(band);
    // にぎるところ(少し太い、こげ茶)
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.16, 7), toonMaterial(0x7a4a24));
    grip.rotation.z = Math.PI / 2;
    grip.position.x = sd * 0.24;
    g.add(grip);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  mergeStatic(g);
  return g;
}
export const PADDLE_TIP = 1.05; // まん中から、水かきの先まで

// 引き波(いかだのうしろに V の字に広がる白い波)の絵
let wakeTex = null;
export function wakeTexture() {
  if (wakeTex) return wakeTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  // 上(いかだのところ)から下へ、V の字に開く2本の白い帯 + まん中のあわ
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      const x = 64 + sd * (8 + t * 54), y = t * 256;
      const grd = g.createRadialGradient(x, y, 0, x, y, 10 + t * 8);
      grd.addColorStop(0, `rgba(255,255,255,${0.55 * (1 - t)})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(x - 20, y - 20, 40, 40);
    }
  }
  const mid = g.createLinearGradient(0, 0, 0, 256);
  mid.addColorStop(0, 'rgba(255,255,255,0.35)');
  mid.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = mid;
  g.fillRect(52, 0, 24, 256);
  wakeTex = new THREE.CanvasTexture(c);
  wakeTex.colorSpace = THREE.SRGBColorSpace;
  return wakeTex;
}
