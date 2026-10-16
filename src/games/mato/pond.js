// まつぼっくり的あて の「池の手ざわり」(見た目だけ。ルールの風 s.wind を見て動く)。
//
// - 水面: 細かく分けて、ゆっくりうねらせる。岸は浅い明るい水色、まん中は深い色、
//   向こう岸の近くは森が映ったような緑がかった色。さざなみの絵は風の向きへ流れる
// - ガマとアシ: 風の向きへしなって、ゆれる(シェーダーで動かす)
// - 風の筋: 風が強いと、水面を白い筋が流れる / 木の葉: 風下へ飛んでいく
// - 吹き流し: 手前のつるの綱に結んである。風が強いとぴんと横へ、なぎだと垂れる(風を目で読める)
// - 魚: ときどき池の魚がはねる(飾り)
// 演出なので Math.random を使ってよい。

import * as THREE from 'three';
import { toonMaterial } from '../../runtime/models.js';
import { makeRand } from '../daruma/trees.js';
import { RULES, VINES, VINE_Y } from './rules.js';
import { POND, pondQ } from './stage.js';

function streakTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 16;
  const x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 6, 128, 4);
  return new THREE.CanvasTexture(cv);
}

export function createPond(scene) {
  const uniforms = { uTime: { value: 0 }, uWind: { value: 0 } };

  // ── 水面 ──────────────────────────────────────
  const W = POND.rx * 2.4, D = POND.rz * 2.4, nx = 72, nz = 44;
  const geo = new THREE.PlaneGeometry(W, D, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate(POND.cx, 0, POND.cz);
  const pos = geo.attributes.position;
  const cols = [];
  const shallow = new THREE.Color(0x8ad6e2), deep = new THREE.Color(0x3d97c4), mirror = new THREE.Color(0x4f8f6a), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const q = pondQ(x, z);
    c.copy(deep).lerp(shallow, Math.max(0, Math.min(1, (q - 0.55) / 0.45)));
    // 向こう岸の森が映る(奥ほど、岸に近いほど)
    const back = Math.max(0, Math.min(1, (-z - 12) / 4)) * Math.max(0, Math.min(1, (q - 0.6) / 0.4));
    c.lerp(mirror, back * 0.55);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const base = Float32Array.from(pos.array);
  const waterMat = new THREE.MeshToonMaterial({ vertexColors: true, transparent: true, opacity: 0.9 });
  const water = new THREE.Mesh(geo, waterMat);
  water.name = 'water';
  scene.add(water);
  // さざなみ: 白い線だけの絵を、水面の少し上に重ねて流す
  const ripMat = new THREE.MeshBasicMaterial({ map: lineTexture(), transparent: true, opacity: 0.32, depthWrite: false });
  ripMat.map.repeat.set(9, 5);
  const rip = new THREE.Mesh(new THREE.PlaneGeometry(W, D), ripMat);
  rip.rotation.x = -Math.PI / 2;
  rip.position.set(POND.cx, 0.015, POND.cz);
  scene.add(rip);

  // ── ガマとアシ(風でしなる) ───────────────────────
  const reedGeo = (() => {
    const stem = new THREE.CylinderGeometry(0.018, 0.03, 1, 5, 4);
    stem.translate(0, 0.5, 0);
    const head = new THREE.CapsuleGeometry(0.05, 0.16, 3, 6);
    head.translate(0, 0.9, 0);
    const paint = (g, hex) => {
      const col = new THREE.Color(hex);
      g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: g.attributes.position.count }, () => [col.r, col.g, col.b]).flat(), 3));
      g.deleteAttribute('uv');
      return g;
    };
    const parts = [paint(stem, 0x6f9a46), paint(head, 0x7a4a28)];
    // 1つにまとめる(どちらも index つき)
    const merged = new THREE.BufferGeometry();
    const P = [], C = [], N = [], I = [];
    let off = 0;
    for (const g of parts) {
      P.push(...g.attributes.position.array);
      C.push(...g.attributes.color.array);
      N.push(...g.attributes.normal.array);
      for (const i of g.index.array) I.push(i + off);
      off += g.attributes.position.count;
    }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    merged.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    merged.setIndex(I);
    return merged;
  })();
  const bladeGeo = (() => {
    // アシ: 細い葉(先がとがる)
    const g = new THREE.ConeGeometry(0.035, 1, 4, 3);
    g.translate(0, 0.5, 0);
    const col = new THREE.Color(0x7fae52);
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: g.attributes.position.count }, () => [col.r, col.g, col.b]).flat(), 3));
    return g;
  })();
  const reedMat = new THREE.MeshToonMaterial({ vertexColors: true });
  reedMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec4 base = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float ph = base.x * 0.9 + base.z * 0.6;
        float k = clamp(position.y, 0.0, 1.2);
        float gust = 0.75 + 0.25 * sin(uTime * 2.3 + ph);
        float sway = sin(uTime * 1.8 + ph) * 0.06 + sin(uTime * 4.1 + ph * 1.3) * 0.02 * (0.3 + abs(uWind));
        transformed.x += (uWind * 0.32 * gust + sway) * k * k;
        transformed.y -= abs(uWind) * 0.06 * k * k;
      }`);
  };
  reedMat.customProgramCacheKey = () => 'mato-reed';
  {
    const rand = makeRand(77);
    const stems = [], blades = [];
    for (let i = 0; i < 80; i++) {
      const a = rand() * Math.PI * 2;
      const q = 0.97 + rand() * 0.08;
      const x = POND.cx + Math.cos(a) * POND.rx * q, z = POND.cz + Math.sin(a) * POND.rz * q;
      if (z > -3 && Math.abs(x) < 8) continue; // 桟橋の前はあける
      const n = 3 + Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) {
        const h = 0.9 + rand() * 0.9;
        const spot = { x: x + (rand() - 0.5) * 0.8, z: z + (rand() - 0.5) * 0.8, h };
        (rand() < 0.5 ? stems : blades).push(spot);
      }
    }
    const dummy = new THREE.Object3D();
    for (const [list, g] of [[stems, reedGeo], [blades, bladeGeo]]) {
      const m = new THREE.InstancedMesh(g, reedMat, list.length);
      list.forEach((sp, i) => {
        dummy.position.set(sp.x, -0.1, sp.z);
        dummy.scale.set(1, sp.h, 1);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      });
      m.name = 'reeds';
      scene.add(m);
    }
  }

  // ── 風の筋(水面) ────────────────────────────────
  const streakMat = new THREE.MeshBasicMaterial({ map: streakTexture(), transparent: true, opacity: 0, depthWrite: false });
  const streakGeo = new THREE.PlaneGeometry(4, 0.35);
  streakGeo.rotateX(-Math.PI / 2);
  const streaks = Array.from({ length: 16 }, () => {
    const m = new THREE.Mesh(streakGeo, streakMat);
    m.position.set(POND.cx + (Math.random() - 0.5) * POND.rx * 2, 0.03, POND.cz + (Math.random() - 0.5) * POND.rz * 1.6);
    m.scale.x = 0.6 + Math.random();
    scene.add(m);
    return m;
  });

  // ── 風に飛ぶ木の葉 ───────────────────────────────
  const leafGeo = new THREE.CircleGeometry(0.14, 5);
  leafGeo.scale(1.6, 1, 1);
  const leafMats = [0x7cc35a, 0xb6d65a, 0x5fa44a].map((h) => new THREE.MeshBasicMaterial({ color: h, side: THREE.DoubleSide }));
  const leaves = Array.from({ length: 18 }, (_, i) => {
    const m = new THREE.Mesh(leafGeo, leafMats[i % 3]);
    m.visible = false;
    scene.add(m);
    return { m, live: false, vy: 0, spin: 0, ph: Math.random() * 6 };
  });

  // ── 吹き流し(桟橋の左はし) ─────────────────────────
  const flag = (() => {
    const g = new THREE.Group();
    g.position.set(-1.4, VINE_Y + 0.25, -VINES[0]); // 手前のつるの綱に結んである(画面の上のまん中に見える)
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), toonMaterial(0xffc23c));
    g.add(knot);
    // 布: 紅白のしま。頂点を毎フレーム動かす
    const L = 1.5, H = 0.44, SX = 16, SY = 3;
    const cloth = new THREE.PlaneGeometry(L, H, SX, SY);
    const cc = [];
    const red = new THREE.Color(0xe8402f), white = new THREE.Color(0xfff6e0);
    const cp = cloth.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const u = (cp.getX(i) + L / 2) / L;
      const col = Math.floor(u * 5) % 2 ? white : red;
      cc.push(col.r, col.g, col.b);
    }
    cloth.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    const uv0 = [];
    for (let i = 0; i < cp.count; i++) uv0.push((cp.getX(i) + L / 2) / L, (cp.getY(i) + H / 2) / H);
    const mesh = new THREE.Mesh(cloth, new THREE.MeshToonMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    mesh.position.y = -0.1;
    mesh.castShadow = true;
    g.add(mesh);
    scene.add(g);
    return { mesh, uv0, L, H };
  })();

  // ── はねる魚 ────────────────────────────────────
  const fish = (() => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), toonMaterial(0xff9a4a));
    body.scale.set(1.8, 0.8, 0.6);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 4), toonMaterial(0xff7a2a));
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -0.26;
    g.add(body, tail);
    g.visible = false;
    scene.add(g);
    return { g, t: 0, next: 3 + Math.random() * 4, from: new THREE.Vector3(), dir: 1 };
  })();

  let wind = 0, time = 0;
  return {
    // splashAt: 魚の水しぶきに使う
    update(dt, windNow, splashAt) {
      time += dt;
      wind += (windNow - wind) * Math.min(1, dt * 2);
      const w = wind / RULES.windMax; // -1〜1
      uniforms.uTime.value = time;
      uniforms.uWind.value = w;
      // 水面のうねり
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3], z = base[i * 3 + 2];
        p.array[i * 3 + 1] = Math.sin(x * 0.7 + time * 1.3 + z * 0.3) * 0.025 + Math.sin(z * 0.9 - time * 1.1) * 0.02;
      }
      p.needsUpdate = true;
      ripMat.map.offset.x -= dt * (0.004 + w * 0.05);
      ripMat.map.offset.y += dt * 0.006;
      // 風の筋
      const strong = Math.max(0, Math.abs(w) - 0.25) / 0.75;
      streakMat.opacity += (strong * 0.8 - streakMat.opacity) * Math.min(1, dt * 3);
      for (const s of streaks) {
        s.position.x += w * dt * 6 * (0.7 + s.scale.x * 0.3);
        if (s.position.x > POND.cx + POND.rx * 1.1) s.position.x -= POND.rx * 2.2;
        if (s.position.x < POND.cx - POND.rx * 1.1) s.position.x += POND.rx * 2.2;
        s.visible = streakMat.opacity > 0.02 && pondQ(s.position.x, s.position.z) < 0.92;
      }
      // 木の葉: 風が強いと、風上の森から飛んでくる
      for (const l of leaves) {
        if (!l.live) {
          if (strong > 0.05 && Math.random() < dt * strong * 3) {
            l.live = true;
            l.m.visible = true;
            l.m.position.set(-Math.sign(w) * 16, 1.5 + Math.random() * 4, -3 - Math.random() * 12);
            l.vy = -0.3 - Math.random() * 0.4;
            l.spin = 3 + Math.random() * 5;
          }
          continue;
        }
        l.m.position.x += w * dt * 7 + Math.sin(time * 3 + l.ph) * dt * 0.8;
        l.m.position.y += (l.vy + Math.sin(time * 4 + l.ph) * 0.6) * dt;
        l.m.rotation.x += l.spin * dt;
        l.m.rotation.y += l.spin * 0.7 * dt;
        if (Math.abs(l.m.position.x) > 17 || l.m.position.y < 0) { l.live = false; l.m.visible = false; }
      }
      // 吹き流し: 強さで、垂れる(なぎ)〜ぴんと横へ。風の向きへのびる
      {
        const cp = flag.mesh.geometry.attributes.position;
        const a = (1 - Math.abs(w) ** 0.7) * 1.35; // 0 = 横へ / 1.35 = ほぼ真下
        const dir = w >= 0 ? 1 : -1;
        for (let i = 0; i < cp.count; i++) {
          const u = flag.uv0[i * 2], v = flag.uv0[i * 2 + 1];
          const along = u * flag.L;
          const flap = Math.sin(time * (6 + Math.abs(w) * 8) - u * 7) * 0.07 * u * (0.3 + Math.abs(w));
          const yTop = (v - 0.5) * flag.H;
          cp.setXYZ(i,
            dir * Math.cos(a) * along,
            yTop * (1 - u * 0.25) - Math.sin(a) * along,
            flap);
        }
        cp.needsUpdate = true;
        flag.mesh.geometry.computeVertexNormals();
      }
      // 魚
      fish.next -= dt;
      if (!fish.g.visible && fish.next <= 0) {
        fish.g.visible = true;
        fish.t = 0;
        fish.dir = Math.random() < 0.5 ? 1 : -1;
        fish.from.set(POND.cx + (Math.random() - 0.5) * POND.rx * 1.2, 0, POND.cz + (Math.random() - 0.2) * POND.rz * 1.1);
        if (pondQ(fish.from.x, fish.from.z) > 0.8 || fish.from.z > -3) fish.from.set(3, 0, -9);
        splashAt?.(fish.from.x, fish.from.z, 5);
      }
      if (fish.g.visible) {
        fish.t += dt;
        const k = fish.t / 0.8;
        fish.g.position.set(fish.from.x + fish.dir * k * 1.6, Math.sin(k * Math.PI) * 1.1, fish.from.z);
        fish.g.rotation.set(0, fish.dir > 0 ? 0 : Math.PI, (0.5 - k) * 2.2);
        if (k >= 1) {
          fish.g.visible = false;
          fish.next = 4 + Math.random() * 6;
          splashAt?.(fish.g.position.x, fish.g.position.z, 6);
        }
      }
    },
  };
}

// さざなみの白い線だけ(地は透明)
function lineTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d');
  const rand = makeRand(43);
  x.lineCap = 'round';
  for (let i = 0; i < 80; i++) {
    const px = rand() * S, py = rand() * S, w = 8 + rand() * 24;
    x.strokeStyle = `rgba(255,255,255,${0.6 + rand() * 0.4})`;
    x.lineWidth = 1.5 + rand() * 2;
    x.beginPath();
    x.moveTo(px, py);
    x.quadraticCurveTo(px + w / 2, py - 3, px + w, py);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
