// 大会の盤の演出(見た目だけ。演出なので Math.random を使ってよい)。
//
// - 先生: 金色の光の柱(遠くからでもわかる)と、足もとの金の輪。飛んでいくときは弧をえがいて、羽ばたきながら
// - メダル: 先生からメダルが弧をえがいて、買った子の頭の上へ。きらきら
// - どうぐ: 頭の上に、どうぐの形(サイコロ・葉っぱ・笛・袋)がぽんと出て、くるっと回って消える
// - ハプニング:
//   春の雨 … 雨つぶが降り、春のエリアに水たまりの波紋
//   どんぐりの雨 … どんぐりが空から降ってくる
//   つむじ風 … 葉っぱの竜巻が、子をつつんで巻きあげる
//   雪玉ころころ … 大きな雪玉が、冬のエリアを転がっていく
// どれも play*() でよんで、毎フレーム update(dt) で動かす。

import * as THREE from 'three';
import { toonMaterial } from '../runtime/models.js';
import { acornGeometry } from '../games/daruma/trees.js';

export function createEffects(scene) {
  const live = []; // { update(dt) → まだ続くなら true }
  const add = (fx) => { live.push(fx); return fx; };

  // ── 先生の目印: 金の光の柱と、足もとの輪 ─────────────────
  const beamTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = 32;
    cv.height = 128;
    const x = cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,230,120,0)');
    g.addColorStop(0.6, 'rgba(255,220,90,.55)');
    g.addColorStop(1, 'rgba(255,210,60,.9)');
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 128);
    const side = x.createLinearGradient(0, 0, 32, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)');
    side.addColorStop(0.5, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = side;
    x.fillRect(0, 0, 32, 128);
    return new THREE.CanvasTexture(cv);
  })();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 9, 20, 1, true), new THREE.MeshBasicMaterial({
    map: beamTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  }));
  beam.position.y = 4.5;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.85, depthWrite: false }));
  ring.position.y = 0.26;
  const marker = new THREE.Group();
  marker.add(beam, ring);
  scene.add(marker);
  let markerT = 0;

  // ── 小さな部品 ──────────────────────────────────
  const sparkGeo = new THREE.OctahedronGeometry(0.09, 0);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfff2a0 });
  function sparkle(pos, n = 14, spread = 2.5) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(sparkGeo, sparkMat);
      m.position.copy(pos);
      scene.add(m);
      const v = new THREE.Vector3((Math.random() - 0.5) * spread, 1 + Math.random() * spread, (Math.random() - 0.5) * spread);
      let t = 0;
      add({ update(dt) {
        t += dt;
        v.y -= 4 * dt;
        m.position.addScaledVector(v, dt);
        m.rotation.y += dt * 8;
        m.scale.setScalar(Math.max(0.01, 1 - t / 0.9));
        if (t > 0.9) { scene.remove(m); return false; }
        return true;
      } });
    }
  }

  // ── メダル: 先生から子の頭の上へ ───────────────────────
  const medalGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.08, 24).rotateX(Math.PI / 2);
  const medalMat = new THREE.MeshToonMaterial({ color: 0xffd24a, emissive: 0x6a4a00, emissiveIntensity: 0.4 });
  function giveMedal(from, to) {
    const m = new THREE.Mesh(medalGeo, medalMat);
    scene.add(m);
    const a = from.clone(), b = to.clone().setY(to.y + 2.6);
    let t = 0;
    return new Promise((resolve) => add({ update(dt) {
      t += dt;
      const k = Math.min(1, t / 1.0);
      m.position.lerpVectors(a, b, k);
      m.position.y += Math.sin(k * Math.PI) * 2.5;
      m.rotation.y += dt * 10;
      m.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.6);
      if (k >= 1 && t < 1.0 + dt) { sparkle(b, 18); resolve(); }
      if (t > 1.6) { scene.remove(m); return false; }
      return true;
    } }));
  }

  // ── どうぐの形: 頭の上にぽんと出る ──────────────────────
  const itemShapes = {
    dice2: () => { const g = new THREE.Group(); for (const x of [-0.25, 0.25]) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), toonMaterial(0xfff6e0)); d.position.x = x; d.rotation.set(0.4, 0.5, 0); g.add(d); } return g; },
    dice3: () => { const g = new THREE.Group(); for (const [x, y] of [[-0.3, 0], [0.3, 0], [0, 0.35]]) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), toonMaterial(0xffe9a8)); d.position.set(x, y, 0); d.rotation.set(0.4, 0.5, 0); g.add(d); } return g; },
    swap: () => { const g = new THREE.Group(); for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 6), toonMaterial(0x34c47c)); l.scale.set(1.4, 0.35, 0.8); l.position.x = s * 0.25; l.rotation.z = s * 0.4; g.add(l); } return g; },
    whistle: () => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.36, 12), toonMaterial(0xffc23c)); b.rotation.z = Math.PI / 2; const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.14), toonMaterial(0xffc23c)); t.position.set(0.3, 0.1, 0); g.add(b, t); return g; },
    bag: () => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), toonMaterial(0xc99a5a)); b.scale.set(1, 1.1, 1); const k = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 6, 12), toonMaterial(0x7a4a24)); k.position.y = 0.33; k.rotation.x = Math.PI / 2; g.add(b, k); return g; },
  };
  function showItem(key, pos) {
    const g = (itemShapes[key] || itemShapes.bag)();
    g.position.copy(pos).setY(pos.y + 2.4);
    scene.add(g);
    sparkle(g.position, 8, 1.5);
    let t = 0;
    add({ update(dt) {
      t += dt;
      const pop = t < 0.3 ? 1 + Math.sin((t / 0.3) * Math.PI) * 0.5 : 1;
      g.scale.setScalar(t > 1.6 ? Math.max(0.01, 1 - (t - 1.6) / 0.3) : pop);
      g.rotation.y += dt * 3;
      g.position.y += dt * 0.2;
      if (t > 1.9) { scene.remove(g); return false; }
      return true;
    } });
  }

  // ── 春の雨: 雨つぶと、水たまりの波紋 ───────────────────────
  const dropGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4);
  const dropMat = new THREE.MeshBasicMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.8 });
  const rippleGeo = new THREE.RingGeometry(0.8, 1, 24).rotateX(-Math.PI / 2);
  function rain(center, radius = 9, sec = 2.4) {
    const n = 220;
    const mesh = new THREE.InstancedMesh(dropGeo, dropMat, n);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const ps = Array.from({ length: n }, () => ({ x: center.x + (Math.random() - 0.5) * radius * 2, z: center.z + (Math.random() - 0.5) * radius * 2, y: Math.random() * 10 }));
    const dummy = new THREE.Object3D();
    let t = 0, rip = 0;
    add({ update(dt) {
      t += dt;
      rip -= dt;
      ps.forEach((p, i) => {
        p.y -= dt * 14;
        if (p.y < 0) {
          p.y += 10;
          if (rip <= 0 && t < sec) { rip = 0.05; ripple(p.x, p.z); }
        }
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.setScalar(t > sec ? Math.max(0.01, 1 - (t - sec) / 0.5) : 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (t > sec + 0.5) { scene.remove(mesh); return false; }
      return true;
    } });
  }
  function ripple(x, z) {
    const m = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
    m.position.set(x, 0.3, z);
    scene.add(m);
    let t = 0;
    add({ update(dt) {
      t += dt;
      m.scale.setScalar(0.2 + t * 1.4);
      m.material.opacity = 0.8 * (1 - t / 0.7);
      if (t > 0.7) { scene.remove(m); m.material.dispose(); return false; }
      return true;
    } });
  }

  // ── どんぐりの雨 ────────────────────────────────
  const acornGeo = acornGeometry();
  const acornMat = new THREE.MeshToonMaterial({ vertexColors: true });
  function acornRain(center, radius = 3.5, n = 24) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(acornGeo, acornMat);
      m.scale.setScalar(4);
      const x = center.x + (Math.random() - 0.5) * radius * 2, z = center.z + (Math.random() - 0.5) * radius * 2;
      const delay = Math.random() * 1.2;
      m.position.set(x, 12, z);
      m.visible = false;
      scene.add(m);
      let t = -delay, vy = 0, bounced = false;
      add({ update(dt) {
        t += dt;
        if (t < 0) return true;
        m.visible = true;
        vy -= 22 * dt;
        m.position.y += vy * dt;
        m.rotation.x += dt * 6;
        if (m.position.y < 0.35) {
          m.position.y = 0.35;
          if (!bounced) { vy = 4; bounced = true; } else vy = 0;
        }
        if (t > 2.2) m.scale.setScalar(Math.max(0.01, 4 * (1 - (t - 2.2) / 0.4)));
        if (t > 2.6) { scene.remove(m); return false; }
        return true;
      } });
    }
  }

  // ── つむじ風: 葉っぱの竜巻 ───────────────────────────
  const leafGeo = new THREE.CircleGeometry(0.16, 5);
  const leafMats = [0xe8642c, 0xf6b93b, 0x7cc35a, 0xc4532a].map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  function whirlwind(getPos, sec = 1.8) {
    const leaves = Array.from({ length: 50 }, (_, i) => {
      const m = new THREE.Mesh(leafGeo, leafMats[i % leafMats.length]);
      scene.add(m);
      return { m, a: Math.random() * Math.PI * 2, h: Math.random() * 3.5, r: 0.5 + Math.random() * 0.9 };
    });
    let t = 0;
    add({ update(dt) {
      t += dt;
      const c = getPos();
      for (const l of leaves) {
        l.a += dt * (6 + l.h);
        const r = l.r * (0.6 + l.h * 0.35);
        l.m.position.set(c.x + Math.cos(l.a) * r, c.y + l.h, c.z + Math.sin(l.a) * r);
        l.m.rotation.set(l.a, l.a * 0.7, 0);
        l.m.scale.setScalar(t > sec ? Math.max(0.01, 1 - (t - sec) / 0.4) : Math.min(1, t * 4));
      }
      if (t > sec + 0.4) { for (const l of leaves) scene.remove(l.m); return false; }
      return true;
    } });
  }

  // ── 雪玉ころころ ────────────────────────────────
  const snowMat = toonMaterial(0xf6fbff);
  function snowball(path, sec = 2.2) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 2), snowMat);
    scene.add(m);
    let t = 0;
    const tmp = new THREE.Vector3();
    add({ update(dt) {
      t += dt;
      const k = Math.min(1, t / sec);
      const f = k * (path.length - 1);
      const i = Math.min(path.length - 2, Math.floor(f));
      tmp.lerpVectors(path[i], path[i + 1], f - i);
      m.position.set(tmp.x, 1.2 + Math.abs(Math.sin(t * 9)) * 0.15, tmp.z);
      m.rotation.x += dt * 5;
      m.rotation.z += dt * 2;
      m.scale.setScalar(0.7 + k * 0.6);
      if (Math.random() < dt * 30) sparkle(m.position.clone().setY(0.3), 1, 1.2);
      if (t > sec + 0.3) { scene.remove(m); return false; }
      return true;
    } });
  }

  return {
    // 先生の目印を、先生の足もとへ
    markOwl(pos) { marker.position.set(pos.x, 0, pos.z); },
    giveMedal,
    showItem,
    sparkle,
    rain,
    acornRain,
    whirlwind,
    snowball,
    update(dt) {
      markerT += dt;
      ring.scale.setScalar(1 + Math.sin(markerT * 3) * 0.08);
      beam.material.opacity = 0.75 + Math.sin(markerT * 2) * 0.2;
      for (let i = live.length - 1; i >= 0; i--) if (!live[i].update(dt)) live.splice(i, 1);
    },
  };
}
