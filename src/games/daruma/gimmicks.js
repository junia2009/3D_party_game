// しかけの見た目と演出: ぬかるみ・落ち葉の山・拾うどんぐり・落ちてくるどんぐり。
//
// ルール(どこに何があるか、いつ何が起きたか)は rules.js が決める。ここは
// state を読んで置き、rules.step が返したできごと(events)に合わせて動かすだけ。

import * as THREE from 'three';
import { toonGradient, toonMaterial } from '../../runtime/models.js';
import { RULES } from './rules.js';
import { acornGeometry, makeRand } from './trees.js';

const vcToon = () => new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient });

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

// ── ぬかるみ ───────────────────────────────────────
// 縁がでこぼこの、ぬれて光る泥。ふちは少し明るい(乾きかけ)
function mudTexture(rand) {
  const S = 256;
  const [c, g] = canvas(S, S * 2);
  const blob = (scale, fill) => {
    g.fillStyle = fill;
    g.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const r = scale * (0.86 + 0.07 * Math.sin(a * 3 + rand() * 0.2) + 0.05 * Math.sin(a * 5 + 1) + 0.03 * Math.sin(a * 11));
      g.lineTo(S / 2 + Math.cos(a) * r * (S / 2), S + Math.sin(a) * r * S);
    }
    g.closePath();
    g.fill();
  };
  blob(1, '#8a6440'); // 乾きかけのふち
  blob(0.86, '#5a3b22'); // ぬれた泥
  blob(0.62, '#4a2f1a');
  // 水たまりの照り返し
  for (let i = 0; i < 9; i++) {
    const x = S / 2 + (rand() - 0.5) * S * 0.5, y = S + (rand() - 0.5) * S * 1.1;
    g.fillStyle = `rgba(190, 210, 225, ${0.25 + rand() * 0.25})`;
    g.beginPath();
    g.ellipse(x, y, 6 + rand() * 18, 3 + rand() * 6, rand() * 0.6 - 0.3, 0, Math.PI * 2);
    g.fill();
  }
  // 泡と小石
  for (let i = 0; i < 40; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(120, 90, 60, 0.7)' : 'rgba(40, 25, 14, 0.6)';
    g.beginPath();
    g.arc(S / 2 + (rand() - 0.5) * S * 0.75, S + (rand() - 0.5) * S * 1.6, 1 + rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── 落ち葉 ─────────────────────────────────────────
const LEAF_COLORS = [0xd9822b, 0xc9632a, 0xe8a83a, 0xb5482a, 0xa86a2c, 0xd9b04a];
function leafGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.12);
  shape.quadraticCurveTo(0.09, -0.03, 0, 0.12);
  shape.quadraticCurveTo(-0.09, -0.03, 0, -0.12);
  const geo = new THREE.ShapeGeometry(shape, 4);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

// ── きらり(拾えるどんぐりの目印) ─────────────────────────
function sparkleTexture() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,240,1)');
  grad.addColorStop(0.25, 'rgba(255,240,180,0.6)');
  grad.addColorStop(1, 'rgba(255,240,180,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  for (const [w, h] of [[3, 30], [30, 3]]) {
    g.beginPath();
    g.ellipse(32, 32, w, h, 0, 0, Math.PI * 2);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}
function puffTexture() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(235, 215, 180, 0.9)');
  grad.addColorStop(1, 'rgba(235, 215, 180, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createGimmicks(scene, laneX) {
  const root = new THREE.Group();
  root.name = 'gimmicks';
  scene.add(root);
  const acornGeo = acornGeometry();
  const acornMat = vcToon();
  const leafGeo = leafGeometry();
  const leafMat = toonMaterial(0xffffff);
  leafMat.side = THREE.DoubleSide;
  const sparkleMat = new THREE.SpriteMaterial({ map: sparkleTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const puffMat = new THREE.SpriteMaterial({ map: puffTexture(), transparent: true, depthWrite: false });
  const mudDrop = new THREE.SphereGeometry(0.035, 6, 4);
  const mudDropMat = toonMaterial(0x4f331d);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x1a120a, transparent: true, opacity: 0.3, depthWrite: false });
  const shadowGeo = new THREE.CircleGeometry(0.35, 24).rotateX(-Math.PI / 2);
  // 影のまわりの白い輪(土の上だと影だけでは見落とすので、ふちどりで知らせる)
  const ringGeo = new THREE.RingGeometry(0.36, 0.42, 32).rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });

  let st = null; // ゲームごとの状態
  const fx = []; // 動いている演出 { update(dt) → 終わったら true }

  function clear() {
    for (const c of [...root.children]) {
      c.removeFromParent();
      if (c.isInstancedMesh) c.dispose();
    }
    fx.length = 0;
  }

  function addAcorn(slot, a, pop = false) {
    const m = new THREE.Mesh(acornGeo, acornMat);
    m.position.set(laneX(slot), 0.1, -a.x);
    m.rotation.set(0, Math.random() * 6, Math.PI / 2 - 0.25); // 横に寝かせる
    m.scale.setScalar(1.3);
    const spark = new THREE.Sprite(sparkleMat);
    spark.position.set(laneX(slot) + 0.06, 0.24, -a.x);
    spark.scale.setScalar(0);
    root.add(m, spark);
    st.acorns.set(a, { mesh: m, spark, phase: Math.random() * 10 });
    if (pop) {
      let t = 0;
      fx.push({ update(dt) { t += dt; const k = Math.min(1, t / 0.25); m.scale.setScalar(1.3 * (1 + 0.4 * Math.sin(k * Math.PI))); return k >= 1; } });
    }
  }

  function setGame(s) {
    clear();
    st = { s, piles: [], acorns: new Map(), drops: new Map() };
    const rand = makeRand(4242 + (s.rng & 0xffff));
    // ぬかるみ
    s.lanes.forEach((lane, slot) => {
      const len = lane.mud.to - lane.mud.from;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1.05, len + 0.3).rotateX(-Math.PI / 2),
        new THREE.MeshToonMaterial({ map: mudTexture(rand), alphaTest: 0.5, gradientMap: toonGradient }),
      );
      mesh.position.set(laneX(slot), 0.016, -(lane.mud.from + lane.mud.to) / 2);
      root.add(mesh);
    });
    // 落ち葉の山: 1つの InstancedMesh に全部の山の葉を入れる
    const perPile = 150;
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, perPile * s.lanes.length);
    leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    s.lanes.forEach((lane, slot) => {
      const cx = laneX(slot), cz = -(lane.leaves.from + lane.leaves.to) / 2;
      const rz = (lane.leaves.to - lane.leaves.from) / 2 + 0.1, rx = 0.48;
      const pile = { slot, start: slot * perPile, leaves: [], scattered: false };
      for (let i = 0; i < perPile; i++) {
        // こんもりした山: 中ほど高く、上の葉ほど明るい色
        const a = rand() * Math.PI * 2, r = Math.sqrt(rand());
        const x = cx + Math.cos(a) * r * rx, z = cz + Math.sin(a) * r * rz;
        const y = 0.02 + (1 - r * r) * 0.22 * (0.6 + rand() * 0.4);
        const leaf = {
          p: new THREE.Vector3(x, y, z),
          rot: new THREE.Euler((rand() - 0.5) * 0.9, rand() * Math.PI * 2, (rand() - 0.5) * 0.9),
          s: 0.9 + rand() * 0.6,
          v: new THREE.Vector3(),
          spin: new THREE.Vector3(),
          flying: false,
        };
        pile.leaves.push(leaf);
        dummy.position.copy(leaf.p);
        dummy.rotation.copy(leaf.rot);
        dummy.scale.setScalar(leaf.s);
        dummy.updateMatrix();
        leaves.setMatrixAt(pile.start + i, dummy.matrix);
        color.setHex(LEAF_COLORS[Math.floor(rand() * LEAF_COLORS.length)]).multiplyScalar(0.8 + y * 1.2);
        leaves.setColorAt(pile.start + i, color);
      }
      st.piles.push(pile);
    });
    root.add(leaves);
    st.leafMesh = leaves;
    // 拾うどんぐり
    s.lanes.forEach((lane, slot) => lane.acorns.forEach((a) => addAcorn(slot, a)));
  }

  // 落ち葉が散る: 外と上へ飛ばして、くるくる回りながら地面に落ちる
  function scatter(slot) {
    const pile = st.piles[slot];
    if (!pile || pile.scattered) return;
    pile.scattered = true;
    const cx = laneX(slot);
    for (const leaf of pile.leaves) {
      const out = new THREE.Vector3(leaf.p.x - cx, 0, 0).normalize();
      leaf.v.set(out.x * (0.4 + Math.random() * 1.2) + (Math.random() - 0.5) * 0.8, 1.2 + Math.random() * 1.8, (Math.random() - 0.5) * 1.6);
      leaf.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 12);
      leaf.flying = true;
    }
    pile.flyTime = 0;
  }

  function puff(x, z, n = 6, size = 0.35) {
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(puffMat.clone());
      sp.position.set(x + (Math.random() - 0.5) * 0.2, 0.08, z + (Math.random() - 0.5) * 0.2);
      const dir = new THREE.Vector3(Math.random() - 0.5, 0.3 + Math.random() * 0.3, Math.random() - 0.5).normalize();
      root.add(sp);
      let t = 0;
      fx.push({
        update(dt) {
          t += dt;
          const k = t / 0.6;
          sp.position.addScaledVector(dir, dt * 0.9 * (1 - k));
          sp.scale.setScalar(size * (0.4 + k));
          sp.material.opacity = 0.8 * (1 - k);
          if (k >= 1) { sp.removeFromParent(); sp.material.dispose(); return true; }
          return false;
        },
      });
    }
  }

  // 泥はね
  function splash(x, z, strength = 1) {
    for (let i = 0; i < 3 * strength; i++) {
      const d = new THREE.Mesh(mudDrop, mudDropMat);
      d.position.set(x + (Math.random() - 0.5) * 0.3, 0.05, z + (Math.random() - 0.5) * 0.2);
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 1.2, 0.3 + Math.random() * 0.8);
      root.add(d);
      fx.push({
        update(dt) {
          v.y -= 9 * dt;
          d.position.addScaledVector(v, dt);
          if (d.position.y < 0.02) { d.removeFromParent(); return true; }
          return false;
        },
      });
    }
  }

  function onEvent(e, s) {
    if (!st) return;
    if (e.type === 'rustle') {
      scatter(e.slot);
    } else if (e.type === 'pickup') {
      for (const [a, v] of st.acorns) {
        if (!a.taken || v.picked) continue;
        v.picked = true;
        let t = 0;
        const y0 = v.mesh.position.y;
        v.spark.scale.setScalar(0);
        fx.push({
          update(dt) {
            t += dt;
            const k = Math.min(1, t / 0.45);
            v.mesh.position.y = y0 + Math.sin(k * Math.PI * 0.8) * 0.7;
            v.mesh.rotation.y += dt * 14;
            v.mesh.scale.setScalar(1.3 * (1 - k * k));
            if (k >= 1) { v.mesh.removeFromParent(); v.spark.removeFromParent(); return true; }
            return false;
          },
        });
      }
    } else if (e.type === 'dropWarn') {
      const shadow = new THREE.Mesh(shadowGeo, shadowMat.clone());
      shadow.position.set(laneX(e.lane), 0.03, -e.x);
      const ring = new THREE.Mesh(ringGeo, ringMat.clone());
      ring.position.set(laneX(e.lane), 0.032, -e.x);
      const acorn = new THREE.Mesh(acornGeo, acornMat);
      acorn.scale.setScalar(2.4);
      root.add(shadow, ring, acorn);
      const d = s.drops[s.drops.length - 1];
      if (!d) return; // オンラインで できごとが まとめて とどいた ときは もう ない ことも ある
      st.drops.set(d, { shadow, ring, acorn, lane: e.lane, x: e.x, spin: Math.random() * 6 });
    } else if (e.type === 'drop') {
      for (const [d, v] of st.drops) {
        if (d.left > 0) continue;
        v.shadow.removeFromParent();
        v.ring.removeFromParent();
        v.acorn.removeFromParent();
        st.drops.delete(d);
      }
      puff(laneX(e.lane), -e.x, 5, 0.3);
      const fell = s.lanes[e.lane].acorns.find((a) => a.fell && a.x === e.x && !st.acorns.has(a));
      if (fell) addAcorn(e.lane, fell, true);
    } else if (e.type === 'bonk') {
      puff(laneX(e.slot), -e.x, 4, 0.25);
    }
  }

  const dummy = new THREE.Object3D();
  function update(dt, s, time) {
    if (!st) return;
    // 落ちてくるどんぐり: 影が広がり、回りながら落ちる
    for (const [d, v] of st.drops) {
      const k = 1 - Math.max(0, d.left) / RULES.dropWarn;
      v.shadow.scale.setScalar(0.25 + 0.75 * k);
      v.shadow.material.opacity = 0.2 + 0.4 * k;
      v.ring.scale.setScalar(1 + 0.12 * Math.sin(time * 18));
      v.ring.material.opacity = 0.5 + 0.4 * k;
      v.acorn.position.set(laneX(v.lane), 0.15 + (1 - k * k) * 7, -v.x);
      v.acorn.rotation.set(v.spin + time * 9, time * 5, 0);
    }
    // 拾えるどんぐりがときどき、きらっと光る
    for (const v of st.acorns.values()) {
      if (v.picked) continue;
      const p = (time * 0.7 + v.phase) % 2.2;
      const k = p < 0.35 ? Math.sin((p / 0.35) * Math.PI) : 0;
      v.spark.scale.setScalar(0.42 * k);
      v.spark.material.rotation = time * 2;
    }
    // 散った落ち葉
    let dirty = false;
    for (const pile of st.piles) {
      if (!pile.scattered || pile.settled) continue;
      pile.flyTime += dt;
      let flying = 0;
      pile.leaves.forEach((leaf, i) => {
        if (!leaf.flying) return;
        flying++;
        // ひらひら: 落ちる速さに上限、横に揺れる
        leaf.v.y = Math.max(leaf.v.y - 6 * dt, -0.9);
        leaf.v.x *= 1 - dt * 0.8;
        leaf.v.z *= 1 - dt * 0.8;
        leaf.p.addScaledVector(leaf.v, dt);
        leaf.p.x += Math.sin(pile.flyTime * 6 + i) * dt * 0.4;
        leaf.rot.x += leaf.spin.x * dt;
        leaf.rot.y += leaf.spin.y * dt;
        leaf.rot.z += leaf.spin.z * dt;
        if (leaf.p.y <= 0.02 && leaf.v.y < 0) {
          leaf.p.y = 0.018 + Math.random() * 0.01;
          leaf.rot.x = (Math.random() - 0.5) * 0.3;
          leaf.rot.z = (Math.random() - 0.5) * 0.3;
          leaf.flying = false;
        }
        dummy.position.copy(leaf.p);
        dummy.rotation.copy(leaf.rot);
        dummy.scale.setScalar(leaf.s);
        dummy.updateMatrix();
        st.leafMesh.setMatrixAt(pile.start + i, dummy.matrix);
        dirty = true;
      });
      if (flying === 0) pile.settled = true;
    }
    if (dirty) st.leafMesh.instanceMatrix.needsUpdate = true;
    for (let i = fx.length - 1; i >= 0; i--) if (fx[i].update(dt)) fx.splice(i, 1);
  }

  return { setGame, onEvent, update, splash, puff };
}
