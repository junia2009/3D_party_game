// 大会の盤の演出(見た目だけ。演出なので Math.random を使ってよい)。
//
// - 先生: 金色の光の柱(遠くからでもわかる)と、足もとの金の輪。飛んでいくときは弧をえがいて、羽ばたきながら
// - メダル: 先生からメダルが弧をえがいて、買った子の頭の上へ。きらきら
// - どうぐ: 頭の上に、どうぐの形(サイコロ・葉っぱ・笛・袋)がぽんと出て、くるっと回って消える
// - ハプニング(5秒くらいの 大きな 演出):
//   春の雨 … 頭の上に 雨雲が もくもく、雷と 大雨、足もとに 水たまり。そのあと 波が 押しながす(surge)
//   どんぐりの雨 … どんぐりが どさどさ。さいごに 大きな 金の どんぐりが 頭に ゴツン(goldAcorn)
//   つむじ風 … 落ち葉の 竜巻(じょうご形の 風の 渦と 葉っぱ)が 子を つつんで 巻きあげる
//   雪玉ころころ … ころがるほど 大きくなる 雪玉が 冬の エリアを かけぬけ、雪けむりを 上げる
// どれも play*() でよんで、毎フレーム update(dt) で動かす。

import * as THREE from 'three';
import { toonMaterial } from '../runtime/models.js';
import { acornGeometry } from '../games/daruma/trees.js';
import { podiumTexture } from '../title/island.js';

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
  // 雨雲: 頭の上に もくもく ふくらんで、雷を 光らせ、真下に 大雨を ふらせる。足もとに 水たまりが ひろがる
  const cloudMat = new THREE.MeshToonMaterial({ color: 0x6a7488, transparent: true, opacity: 0.95 });
  const puddleMat = new THREE.MeshBasicMaterial({ color: 0x5aa8d8, transparent: true, opacity: 0.7, depthWrite: false });
  function stormCloud(pos, sec = 3.4, onBolt) {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + Math.random() * 0.5, 1), cloudMat);
      const a = (i / 9) * Math.PI * 2;
      b.position.set(Math.cos(a) * (0.6 + Math.random() * 0.7), Math.random() * 0.4, Math.sin(a) * (0.5 + Math.random() * 0.5));
      g.add(b);
    }
    g.position.set(pos.x, 5.2, pos.z);
    g.scale.setScalar(0.01);
    scene.add(g);
    const flash = new THREE.PointLight(0xdfe8ff, 0, 18);
    flash.position.set(pos.x, 4, pos.z);
    scene.add(flash);
    const bolt = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xfff6a0 }));
    scene.add(bolt);
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), puddleMat.clone());
    puddle.position.set(pos.x, 0.32, pos.z);
    puddle.scale.setScalar(0.01);
    scene.add(puddle);
    const n = 160;
    const drops = new THREE.InstancedMesh(dropGeo, dropMat, n);
    drops.frustumCulled = false;
    scene.add(drops);
    const ps = Array.from({ length: n }, () => ({ x: pos.x + (Math.random() - 0.5) * 3.2, z: pos.z + (Math.random() - 0.5) * 2.6, y: Math.random() * 5 }));
    const dummy = new THREE.Object3D();
    let t = 0, nextBolt = 0.9, rip = 0;
    add({ update(dt) {
      t += dt;
      const grow = Math.min(1, t / 0.6), fade = t > sec ? Math.max(0, 1 - (t - sec) / 0.6) : 1;
      g.scale.setScalar((0.3 + grow * 0.9) * (0.5 + fade * 0.5) + Math.sin(t * 3) * 0.03);
      g.rotation.y += dt * 0.3;
      cloudMat.opacity = 0.95 * fade;
      // 雨: 雲が ふくらんでから
      const raining = t > 0.5 && t < sec;
      rip -= dt;
      ps.forEach((p, i) => {
        p.y -= dt * 16;
        if (p.y < 0.3) { p.y += 4.8; if (raining && rip <= 0) { rip = 0.06; ripple(p.x, p.z); } }
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.setScalar(raining ? 1 : 0.001);
        dummy.updateMatrix();
        drops.setMatrixAt(i, dummy.matrix);
      });
      drops.instanceMatrix.needsUpdate = true;
      puddle.scale.setScalar(Math.max(0.01, Math.min(1, (t - 0.6) / 2) * 2.2 * fade));
      // 雷: ぎざぎざの 光の すじと、ぴかっ
      nextBolt -= dt;
      if (nextBolt <= 0 && t < sec - 0.5) {
        nextBolt = 1.1 + Math.random() * 0.6;
        const pts = [];
        let x = pos.x + (Math.random() - 0.5) * 0.8, z = pos.z + (Math.random() - 0.5) * 0.6;
        for (let k = 0; k <= 6; k++) { pts.push(new THREE.Vector3(x, 5 - k * 0.75, z)); x += (Math.random() - 0.5) * 0.7; z += (Math.random() - 0.5) * 0.4; }
        bolt.geometry.dispose();
        bolt.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), 24, 0.06, 4);
        bolt.userData.t = 0.18;
        flash.intensity = 60;
        onBolt?.();
      }
      if (bolt.userData.t > 0) { bolt.userData.t -= dt; bolt.visible = Math.floor(bolt.userData.t * 40) % 2 === 0; } else bolt.visible = false;
      flash.intensity *= Math.exp(-dt * 12);
      if (t > sec + 0.6) {
        scene.remove(g, flash, bolt, puddle, drops);
        bolt.geometry.dispose();
        puddle.material.dispose();
        return false;
      }
      return true;
    } });
  }
  // 波: 子の うしろから 前へ ざぶーんと 押しよせる 水の かべ(dir の 向きへ すすむ)
  const waveMat = new THREE.MeshToonMaterial({ color: 0x6ac0ec, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  function surge(getPos, dir, sec = 1.4) {
    const g = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3.2, 20, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2), waveMat);
    const crest = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.16, 6, 20, Math.PI).rotateY(Math.PI / 2), foamMat);
    g.add(wall, crest);
    scene.add(g);
    let t = 0;
    add({ update(dt) {
      t += dt;
      const p = getPos();
      const k = Math.min(1, t / sec);
      g.position.set(p.x - dir.x * 0.6, 0.2, p.z - dir.z * 0.6);
      g.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
      g.scale.set(1, Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.8 + 0.05, 1);
      waveMat.opacity = 0.85 * (1 - Math.max(0, k - 0.7) / 0.3);
      if (Math.random() < dt * 25) sparkle(new THREE.Vector3(p.x, 1.2, p.z), 1, 1.6);
      if (t > sec) { scene.remove(g); return false; }
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

  // 大きな 金の どんぐり: 空から まっすぐ 落ちて 頭に ゴツン、はねて 消える
  const goldAcornMat = new THREE.MeshToonMaterial({ color: 0xffd24a, emissive: 0x6a4a00, emissiveIntensity: 0.35 });
  function goldAcorn(getPos, onHit) {
    const m = new THREE.Mesh(acornGeo, goldAcornMat);
    m.scale.setScalar(11);
    scene.add(m);
    let t = 0, y = 14, vy = 0, hit = false, vx = 0;
    add({ update(dt) {
      t += dt;
      const p = getPos();
      vy -= 26 * dt;
      y += vy * dt;
      if (!hit && y < p.y + 2.1) {
        hit = true;
        vy = 7;
        vx = 2.5;
        sparkle(new THREE.Vector3(p.x, p.y + 2.2, p.z), 26, 4);
        onHit?.();
      }
      m.position.set(p.x + (hit ? vx * (t - 0) * 0.15 : 0), y, p.z);
      m.rotation.z += dt * (hit ? 10 : 2);
      if (hit) m.scale.setScalar(Math.max(0.01, m.scale.x - dt * 6));
      if (t > 3 || (hit && m.scale.x < 0.1)) { scene.remove(m); return false; }
      return true;
    } });
  }

  // ── つむじ風: 葉っぱの竜巻 ───────────────────────────
  const leafGeo = new THREE.CircleGeometry(0.16, 5);
  const leafMats = [0xe8642c, 0xf6b93b, 0x7cc35a, 0xc4532a].map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  const funnelMat = new THREE.MeshBasicMaterial({ color: 0xf2dcb0, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  function whirlwind(getPos, sec = 1.8) {
    // じょうご形の 風の 渦(3まい かさねて 回す)
    const funnels = [0, 1, 2].map((k) => {
      const pts = [];
      for (let j = 0; j <= 8; j++) pts.push(new THREE.Vector2(0.3 + (j / 8) ** 1.6 * (1.8 + k * 0.3), (j / 8) * 5.5));
      const f = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), funnelMat);
      scene.add(f);
      return f;
    });
    const leaves = Array.from({ length: 120 }, (_, i) => {
      const m = new THREE.Mesh(leafGeo, leafMats[i % leafMats.length]);
      scene.add(m);
      return { m, a: Math.random() * Math.PI * 2, h: Math.random() * 5.5, r: 0.5 + Math.random() * 0.9 };
    });
    let t = 0;
    add({ update(dt) {
      t += dt;
      const c = getPos();
      const grow = Math.min(1, t / 0.7), fade = t > sec ? Math.max(0.01, 1 - (t - sec) / 0.4) : 1;
      funnels.forEach((f, k) => {
        f.position.set(c.x, 0, c.z);
        f.rotation.y += dt * (5 + k * 2);
        f.scale.set(grow * fade, grow, grow * fade);
      });
      funnelMat.opacity = 0.32 * fade;
      for (const l of leaves) {
        l.a += dt * (6 + l.h);
        const r = l.r * (0.6 + l.h * 0.35);
        l.m.position.set(c.x + Math.cos(l.a) * r, l.h, c.z + Math.sin(l.a) * r);
        l.m.rotation.set(l.a, l.a * 0.7, 0);
        l.m.scale.setScalar(t > sec ? Math.max(0.01, 1 - (t - sec) / 0.4) : Math.min(1, t * 4));
      }
      if (t > sec + 0.4) { for (const l of leaves) scene.remove(l.m); for (const f of funnels) { scene.remove(f); f.geometry.dispose(); } return false; }
      return true;
    } });
  }

  // ── 雪玉ころころ ────────────────────────────────
  const snowMat = toonMaterial(0xf6fbff);
  const sprayMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
  function snowball(path, sec = 2.2, onRoll) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 2), snowMat);
    m.castShadow = true;
    scene.add(m);
    let t = 0;
    const tmp = new THREE.Vector3();
    add({ update(dt) {
      t += dt;
      const k = Math.min(1, t / sec);
      const f = k * (path.length - 1);
      const i = Math.min(path.length - 2, Math.floor(f));
      tmp.lerpVectors(path[i], path[i + 1], f - i);
      const sc = 0.6 + k * 1.2; // ころがるほど 大きく
      m.scale.setScalar(sc);
      m.position.set(tmp.x, 1.2 * sc + Math.abs(Math.sin(t * 9)) * 0.15, tmp.z);
      m.rotation.x += dt * 5;
      m.rotation.z += dt * 2;
      onRoll?.(m.position, 1.2 * sc);
      // 雪けむり
      for (let j = 0; j < 2; j++) {
        const s = new THREE.Mesh(sparkGeo, sprayMat);
        s.scale.setScalar(2 + Math.random() * 2);
        s.position.set(tmp.x + (Math.random() - 0.5) * sc * 2, 0.4, tmp.z + (Math.random() - 0.5) * sc * 2);
        scene.add(s);
        const v = new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3);
        let u = 0;
        add({ update(d2) { u += d2; v.y -= 9 * d2; s.position.addScaledVector(v, d2); s.scale.multiplyScalar(1 - d2 * 1.5); if (u > 0.7) { scene.remove(s); return false; } return true; } });
      }
      if (t > sec + 0.3) { scene.remove(m); return false; }
      return true;
    } });
  }

  // ── 表彰台(タイトルの島と同じ、木の段の台。ふだんは地面の下) ─────────────
  const podium = (() => {
    const g = new THREE.Group();
    const steps = [
      { n: 2, x: -1.25, h: 0.75, medal: '#d9dde3' },
      { n: 1, x: 0, h: 1.15, medal: '#f2c14e' },
      { n: 3, x: 1.25, h: 0.55, medal: '#d08a52' },
    ];
    const side = toonMaterial(0xc99a62), topMat = toonMaterial(0xe2bd85);
    for (const s of steps) {
      const front = toonMaterial(0xffffff);
      front.map = podiumTexture(s.n, s.medal);
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, s.h, 1.05), [side, side, topMat, side, front, side]);
      b.position.set(s.x, s.h / 2, 0);
      g.add(b);
    }
    g.visible = false;
    scene.add(g);
    return { g, tops: { 1: new THREE.Vector3(0, 1.15, 0), 2: new THREE.Vector3(-1.25, 0.75, 0), 3: new THREE.Vector3(1.25, 0.55, 0) }, t: 0, rise: false };
  })();
  function raisePodium(at) {
    podium.g.position.copy(at);
    podium.baseY = at.y;
    podium.g.visible = true;
    podium.rise = true;
    podium.t = 0;
    sparkle(at.clone().setY(0.5), 20, 3);
  }
  // 台の上の位置(世界の座標)
  const podiumTop = (rank) => podium.tops[rank].clone().add(podium.g.position).setY(podium.tops[rank].y + (podium.baseY ?? 0));

  // ── 紙吹雪 ────────────────────────────────────
  const confettiGeo = new THREE.PlaneGeometry(0.16, 0.1);
  const confettiMats = [0xff5a4e, 0xffd23c, 0x3d8bff, 0x34c47c, 0x9b6bff, 0xff8ad8].map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  function confetti(at, n = 120) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(confettiGeo, confettiMats[i % confettiMats.length]);
      m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 2, 4 + Math.random() * 2, (Math.random() - 0.5) * 2));
      scene.add(m);
      const v = new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6);
      const spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      let t = 0;
      add({ update(dt) {
        t += dt;
        v.y -= 3 * dt;
        v.multiplyScalar(Math.exp(-dt * 1.2));
        m.position.addScaledVector(v, dt);
        m.position.x += Math.sin(t * 5 + i) * dt * 0.8;
        m.rotation.x += spin.x * dt;
        m.rotation.y += spin.y * dt;
        if (t > 5) { scene.remove(m); return false; }
        return true;
      } });
    }
  }

  return {
    // 先生の目印を、先生の足もとへ
    markOwl(pos) { marker.position.set(pos.x, 0, pos.z); },
    giveMedal,
    showItem,
    sparkle,
    rain,
    stormCloud,
    surge,
    acornRain,
    goldAcorn,
    whirlwind,
    snowball,
    raisePodium,
    podiumTop,
    confetti,
    hidePodium() { podium.g.visible = false; },
    update(dt) {
      if (podium.rise) {
        podium.t += dt;
        const k = Math.min(1, podium.t / 0.9);
        podium.g.position.y = podium.baseY - 1.4 * (1 - k) ** 3;
        if (k >= 1) podium.rise = false;
      }
      markerT += dt;
      ring.scale.setScalar(1 + Math.sin(markerT * 3) * 0.08);
      beam.material.opacity = 0.75 + Math.sin(markerT * 2) * 0.2;
      for (let i = live.length - 1; i >= 0; i--) if (!live[i].update(dt)) live.splice(i, 1);
    },
  };
}
