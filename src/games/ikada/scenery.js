// いかだレース の「朝もやの森の川」の空気と飾り。stage.js が作った川に足す。
//
// - 朝もや: 川の上を ゆっくりただよう霧(カメラに近いものは うすく)
// - 木漏れ日: 森のすき間から ななめに差しこむ光の筋
// - 川面のきらめき: 水面の上で ちかちか光る点(流れといっしょに動く)
// - 岸の草花: ガマ・白や黄色の小さな花・しだ
// - 滝: 落ち口から流れ落ちる水のカーテン(すじが下へ流れる)、下の白いあわの輪、ただよう しぶき
//
// どれも時間で動くので、update(dt, camera) を毎フレーム呼ぶ。

import * as THREE from 'three';
import { toonGradient } from '../../runtime/models.js';
import { makeRand } from '../daruma/trees.js';
import { FALLS, POND_END, TUNNEL, currentAt, halfWidthAt } from './course.js';
import { coursePoint, courseHeading, ground } from './stage.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
// やわらかい霧のかたまり(横長)
function mistTexture() {
  const [c, g] = canvas(256, 128);
  const rand = makeRand(41);
  // 絵のふちで切れないように、まん中に寄せる(切れると四角いふちが見える)
  for (let i = 0; i < 26; i++) {
    const r = 16 + rand() * 24;
    const x = 20 + r + rand() * (216 - r * 2), y = 64 + (rand() - 0.5) * (60 - r * 2) * 0.5;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// 光の筋(上が明るく、下へ消える。左右のふちもぼかす)
function rayTexture() {
  const [c, g] = canvas(64, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.12, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 256);
  const side = g.createLinearGradient(0, 0, 64, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.5, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = side;
  g.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// 滝の水: 下へ流れる白いすじ
function curtainTexture() {
  const [c, g] = canvas(128, 256);
  g.fillStyle = 'rgb(170,215,215)';
  g.fillRect(0, 0, 128, 256);
  const rand = makeRand(9);
  for (let i = 0; i < 60; i++) {
    const x = rand() * 128, w = 1 + rand() * 4, y = rand() * 256, len = 40 + rand() * 120;
    g.fillStyle = `rgba(255,255,255,${0.4 + rand() * 0.6})`;
    g.fillRect(x, y, w, len);
    g.fillRect(x, y - 256, w, len); // つなぎめが切れないように
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function ringTexture() {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.8, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildScenery(scene) {
  const rand = makeRand(123);
  const group = new THREE.Group();
  scene.add(group);
  const updaters = [];

  // ── 朝もや ──────────────────────────────────────────
  {
    const tex = mistTexture();
    const mists = [];
    for (let s = -10; s < POND_END + 10; s += 4.5) {
      const hw = halfWidthAt(Math.min(s, POND_END));
      for (let k = 0; k < 2; k++) {
        const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: 0xf6f2ea }));
        // 川のまん中より、岸ぞいに多く(前が見えにくくならないように)
        const side = rand() < 0.5 ? -1 : 1;
        const x = side * (hw * (0.3 + rand() * 0.9) + rand() * 2.5);
        const base = coursePoint(s + rand() * 4, x, 0.4 + rand() * 1.2);
        m.position.copy(base);
        const w = 7 + rand() * 7;
        m.scale.set(w, w * 0.32, 1);
        m.userData = { base, phase: rand() * 6, speed: 0.15 + rand() * 0.2, alpha: 0.16 + rand() * 0.16 };
        group.add(m);
        mists.push(m);
      }
    }
    updaters.push((dt, camera, t) => {
      for (const m of mists) {
        const u = m.userData;
        m.position.x = u.base.x + Math.sin(t * u.speed + u.phase) * 1.2;
        m.position.y = u.base.y + Math.sin(t * u.speed * 0.7 + u.phase) * 0.15;
        // カメラに近いと目の前が白くなるので、近いものほど うすく
        const d = m.position.distanceTo(camera.position);
        m.material.opacity = u.alpha * Math.min(1, Math.max(0, (d - 3) / 6));
      }
    });
  }

  // ── 木漏れ日 ────────────────────────────────────────
  {
    const mat = new THREE.MeshBasicMaterial({ map: rayTexture(), color: 0xfff0c8, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const parts = [];
    for (let s = 6; s < POND_END; s += 9 + rand() * 7) {
      if (s > TUNNEL.from - 4 && s < TUNNEL.to + 2) continue; // トンネルの中は暗く
      const hw = halfWidthAt(s);
      // 岸の木の下から、川のほうへ差しこむ
      const side = rand() < 0.5 ? -1 : 1;
      const x = side * (hw - 0.5 + rand() * 2.5);
      const p = coursePoint(s, x, 0);
      const w = 0.9 + rand() * 1.2, h = 5.5 + rand() * 1.5; // 上は木の葉の下で止める(空へ突き出すと光の柱に見える)
      for (const turn of [0, Math.PI / 2]) {
        const g = new THREE.PlaneGeometry(w, h);
        g.translate(0, -h / 2, 0);
        g.rotateZ(-side * 0.4); // 朝の低い日ざし: 岸の上から川へ、ななめに
        g.rotateY(turn + courseHeading(s).yaw + 0.6);
        g.translate(p.x, p.y + h * 0.9, p.z);
        parts.push(g);
      }
    }
    const merged = new THREE.Mesh(mergeAll(parts), mat);
    merged.renderOrder = 3;
    group.add(merged);
    updaters.push((dt, camera, t) => { mat.opacity = 0.28 + Math.sin(t * 0.6) * 0.06; });
  }

  // ── 川面のきらめき ───────────────────────────────────
  {
    const pos = [], phase = [], flow = [];
    for (let s = -8; s < POND_END + 8; s += 0.55) {
      const hw = halfWidthAt(Math.min(s, POND_END));
      for (let k = 0; k < 2; k++) {
        const x = (rand() * 2 - 1) * (hw - 0.3);
        const p = coursePoint(s + rand() * 0.5, x, 0.04);
        pos.push(p.x, p.y, p.z);
        phase.push(rand() * Math.PI * 2);
        flow.push(currentAt(s));
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('phase', new THREE.Float32BufferAttribute(phase, 1));
    geo.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, scale: { value: 1 } },
      vertexShader: `
        attribute float phase; attribute float flow;
        uniform float time; uniform float scale;
        varying float vA;
        void main() {
          // ときどき ちかっと光る(速い流れほど よく光る)
          float tw = sin(time * (2.0 + flow * 0.6) + phase * 3.0) * 0.5 + 0.5;
          tw = pow(tw, 10.0);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = -mv.z;
          vA = tw * clamp((60.0 - d) / 30.0, 0.0, 1.0);
          gl_PointSize = scale * (2.0 + tw * 7.0) * clamp(12.0 / d, 0.35, 1.6);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          // 十字にのびる星の形
          float star = max(0.0, 1.0 - (abs(p.x) * 6.0 + abs(p.y))) + max(0.0, 1.0 - (abs(p.y) * 6.0 + abs(p.x)));
          float core = max(0.0, 1.0 - length(p) * 3.0);
          float a = clamp(star * 0.8 + core, 0.0, 1.0) * vA;
          gl_FragColor = vec4(1.0, 0.98, 0.9, a);
        }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    group.add(pts);
    updaters.push((dt, camera, t) => { mat.uniforms.time.value = t; mat.uniforms.scale.value = Math.min(2, window.devicePixelRatio || 1); });
  }

  // ── 岸の草花: ガマ・小さな花・しだ ──────────────────────────
  {
    const stalkGeo = new THREE.CylinderGeometry(0.018, 0.025, 1, 4);
    stalkGeo.translate(0, 0.5, 0);
    const headGeo = new THREE.CapsuleGeometry(0.06, 0.22, 3, 6);
    const flowerGeo = new THREE.IcosahedronGeometry(0.07, 0);
    const fernGeo = (() => {
      // しだ: 放射状に のびる葉(細長い板を少し反らせる)
      const parts = [];
      for (let i = 0; i < 7; i++) {
        const g = new THREE.PlaneGeometry(0.14, 0.75, 1, 4);
        const p = g.attributes.position;
        for (let k = 0; k < p.count; k++) { const y = p.getY(k) + 0.375; p.setY(k, y); p.setZ(k, -y * y * 0.6); p.setX(k, p.getX(k) * (1 - y * 0.9)); }
        g.rotateX(-0.5);
        g.rotateY((i / 7) * Math.PI * 2);
        parts.push(g);
      }
      return mergeAll(parts);
    })();
    const leafMat = new THREE.MeshToonMaterial({ color: 0x4f9a3c, gradientMap: toonGradient, side: THREE.DoubleSide });
    const N = 900;
    const stalks = new THREE.InstancedMesh(stalkGeo, new THREE.MeshToonMaterial({ color: 0x6f9a3e, gradientMap: toonGradient }), N);
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshToonMaterial({ color: 0x7a4a24, gradientMap: toonGradient }), N);
    const flowers = new THREE.InstancedMesh(flowerGeo, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient }), N);
    const ferns = new THREE.InstancedMesh(fernGeo, leafMat, N);
    const dummy = new THREE.Object3D();
    const FLOWER = [0xffffff, 0xfff2a0, 0xffc4dc, 0xd8c8ff, 0xffffff].map((c) => new THREE.Color(c));
    let ns = 0, nh = 0, nf = 0, nfe = 0;
    for (let i = 0; i < 1400; i++) {
      const s = -15 + rand() * (POND_END + 25);
      const side = rand() < 0.5 ? -1 : 1;
      const hw = halfWidthAt(Math.min(s, POND_END));
      const kind = rand();
      // ガマは水ぎわ(少し水の中)、花としだは岸の上
      const off = kind < 0.35 ? hw - 0.25 + rand() * 0.7 : hw + 0.5 + rand() * 3.5;
      const p = coursePoint(s, side * off);
      const gy = ground(p.x, p.z).y;
      if (kind < 0.35) {
        // ガマの群れ(3〜4本)
        for (let k = 0; k < 3 + (rand() < 0.5 ? 1 : 0) && ns < N; k++) {
          const h = 0.9 + rand() * 0.7;
          dummy.position.set(p.x + (rand() - 0.5) * 0.4, Math.max(gy, p.y - 0.3), p.z + (rand() - 0.5) * 0.4);
          dummy.rotation.set((rand() - 0.5) * 0.25, 0, (rand() - 0.5) * 0.25);
          dummy.scale.set(1, h, 1);
          dummy.updateMatrix();
          stalks.setMatrixAt(ns++, dummy.matrix);
          dummy.position.y += h * 0.82;
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          if (nh < N) heads.setMatrixAt(nh++, dummy.matrix);
        }
      } else if (kind < 0.75) {
        // 小さな花の群れ
        for (let k = 0; k < 5 && nf < N; k++) {
          dummy.position.set(p.x + (rand() - 0.5) * 0.8, gy + 0.12 + rand() * 0.1, p.z + (rand() - 0.5) * 0.8);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(0.7 + rand() * 0.6);
          dummy.updateMatrix();
          flowers.setMatrixAt(nf, dummy.matrix);
          flowers.setColorAt(nf++, FLOWER[Math.floor(rand() * FLOWER.length)]);
        }
      } else if (nfe < N) {
        dummy.position.set(p.x, gy, p.z);
        dummy.rotation.set(0, rand() * 6, 0);
        dummy.scale.setScalar(0.8 + rand() * 0.8);
        dummy.updateMatrix();
        ferns.setMatrixAt(nfe++, dummy.matrix);
      }
    }
    stalks.count = ns; heads.count = nh; flowers.count = nf; ferns.count = nfe;
    if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
    group.add(stalks, heads, flowers, ferns);
  }

  // ── 滝: 水のカーテン・あわの輪・しぶき ─────────────────────
  {
    const tex = curtainTexture();
    const curtainMat = new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
    const ringMat = new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, color: 0xffffff });
    const mistTex = mistTexture();
    const rings = [], puffs = [];
    for (const f of FALLS) {
      const hw = halfWidthAt(f.s) + 0.15;
      // カーテン: 落ち口(少し前へ はり出す)から、下の水面まで。横は川のはばいっぱい
      const cols = 16, rows = 8;
      const pos = [], uv = [], idx = [];
      for (let j = 0; j <= rows; j++) {
        const v = j / rows; // 0 = 上、1 = 下
        for (let i = 0; i <= cols; i++) {
          const u = i / cols;
          const x = (u * 2 - 1) * hw;
          // 上で前へ はり出して、放物線で落ちる
          const p = coursePoint(f.s - 0.35 + Math.sqrt(v) * 0.9, x, 0.06 - v * v * f.drop * 1.02);
          pos.push(p.x, p.y, p.z);
          uv.push(u * hw / 1.5, v);
        }
      }
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i; idx.push(a, a + cols + 1, a + 1, a + 1, a + cols + 1, a + cols + 2); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      group.add(new THREE.Mesh(geo, curtainMat));
      // あわの輪(落ちたところで広がりつづける)
      for (let k = 0; k < 3; k++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2.2, 2.4), ringMat.clone());
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = -courseHeading(f.s).th;
        m.position.copy(coursePoint(f.s + 0.9, 0, 0.05));
        m.userData.k = k / 3;
        group.add(m);
        rings.push(m);
      }
      // しぶきの霧
      for (let k = 0; k < 5; k++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: 0.5 }));
        const base = coursePoint(f.s + 0.8 + rand(), (rand() - 0.5) * hw * 1.6, 0.4 + rand() * 0.5);
        sp.position.copy(base);
        sp.scale.set(3.5, 1.6, 1);
        sp.userData = { base, phase: rand() * 6 };
        group.add(sp);
        puffs.push(sp);
      }
    }
    updaters.push((dt, camera, t) => {
      tex.offset.y = (tex.offset.y + dt * 1.6) % 1; // すじが下へ流れる
      for (const m of rings) {
        const k = (t * 0.6 + m.userData.k) % 1;
        m.scale.set(0.6 + k * 0.6, 0.6 + k * 0.8, 1);
        m.material.opacity = 0.75 * (1 - k);
      }
      for (const p of puffs) {
        const u = p.userData;
        p.position.y = u.base.y + Math.sin(t * 1.3 + u.phase) * 0.2;
        p.material.opacity = 0.35 + Math.sin(t * 2 + u.phase) * 0.12;
      }
    });
  }

  let time = 0;
  return {
    group,
    update(dt, camera) {
      time += dt;
      for (const f of updaters) f(dt, camera, time);
    },
  };
}

// いくつかの形を1つに(位置・法線・uv だけ)
function mergeAll(geos) {
  let n = 0;
  for (const g of geos) n += (g.index ? g.index.count : g.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
