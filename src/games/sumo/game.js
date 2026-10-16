// 切り株ずもう の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
// タイトルと同じページで動く(ほかの競技と同じ作り)。
//
// 動かし方: どこでもスティック(画面のどこかに指をおいて ずらす)で歩く。
// 右下の「ためる」ボタンを おしているあいだ ためて、はなすと とっしん。パソコンは 矢印キー / WASD と スペース。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonMaterial } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { MOSS, RULES, STEP, aliveSlots, bodyR, createGame, mossAlive, ranking, step } from './rules.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { SEATS, WATER_Y, buildPieces, buildStage, shakyMat } from './stage.js';
import { createAtmosphere, windify } from '../daruma/atmosphere.js';
import { acornGeometry } from '../daruma/trees.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);

export async function createSumo({ renderer, settings, getAudio, onExit }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 700);
  const atmosphere = createAtmosphere(scene, renderer, camera, { course: false });
  atmosphere.sun.shadow.normalBias = 0.05;
  const stage = buildStage(scene);
  windify(stage.group);

  // ── 音 ──────────────────────────────────────────
  let audio = null;
  const unlockAudio = () => { audio = settings.sound ? getAudio() : null; };
  function voice({ type = 'sine', pts, len, gain = 0.1, at = 0, vib = 0, vibRate = 12 }) {
    if (!audio || gain <= 0) return;
    const t = audio.currentTime + at;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(pts[0][1], t);
    for (const [dt, f] of pts.slice(1)) o.frequency.exponentialRampToValueAtTime(f, t + dt);
    if (vib) {
      const l = audio.createOscillator(), lg = audio.createGain();
      l.frequency.value = vibRate;
      lg.gain.value = vib;
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + len);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + len + 0.02);
  }
  function noise({ len, gain, freq, type = 'bandpass', q = 1, at = 0, attack = 0.01 }) {
    if (!audio || gain <= 0) return;
    const t = audio.currentTime + at;
    const buf = audio.createBuffer(1, Math.ceil(audio.sampleRate * len), audio.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = audio.createBufferSource();
    src.buffer = buf;
    const f = audio.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq[0], t);
    f.frequency.exponentialRampToValueAtTime(freq[1], t + len);
    const g = audio.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(audio.destination);
    src.start(t);
  }
  const sfx = {
    // ドン: ぶつかる(強いほど 低く大きく)
    don(force, vol = 1) {
      const k = Math.min(1, force / 8);
      voice({ type: 'triangle', pts: [[0, 220 - k * 100], [0.12, 70]], len: 0.18, gain: (0.08 + k * 0.12) * vol });
      noise({ len: 0.12, gain: (0.05 + k * 0.1) * vol, freq: [1200, 300], type: 'lowpass' });
    },
    // ギュウ…: ためる(高さは画面側で上げていく)
    charge() { voice({ type: 'triangle', pts: [[0, 200], [0.8, 520]], len: 0.8, gain: 0.04, vib: 8, vibRate: 20 }); },
    // ビュン: とっしん
    dash(power, vol = 1) { noise({ len: 0.3, gain: (0.08 + power * 0.1) * vol, freq: [800, 3000], q: 0.8 }); },
    // ザブーン: 湖へ
    splash(vol = 1) {
      noise({ len: 0.9, gain: 0.25 * vol, freq: [1500, 300], type: 'lowpass', q: 0.6, attack: 0.005 });
      voice({ pts: [[0, 500], [0.25, 120]], len: 0.3, gain: 0.08 * vol });
    },
    // キラーン: 金どんぐり
    kiran(vol = 1) { [1318, 1760, 2093, 2637].forEach((f, i) => voice({ pts: [[0, f]], len: 0.35, gain: 0.06 * vol, at: i * 0.06 })); },
    // ポン: 出てくる
    pon() { voice({ pts: [[0, 520], [0.06, 880]], len: 0.12, gain: 0.07 }); },
    // ゴゴゴ: 土俵が くずれる
    rumble(vol = 1) { noise({ len: 1.2, gain: 0.15 * vol, freq: [200, 80], type: 'lowpass', attack: 0.2 }); },
    // ミシミシ: ひびが入る
    crack(vol = 1) { for (let i = 0; i < 4; i++) noise({ len: 0.05, gain: 0.12 * vol, freq: [2500 + Math.random() * 1500, 1200], q: 3, at: i * 0.07 + Math.random() * 0.03 }); },
    // ポチャ: ふちの木くずが落ちる
    plop(vol = 1) { voice({ pts: [[0, 900], [0.06, 400]], len: 0.08, gain: 0.04 * vol }); },
  };
  function volFor(x, z) {
    const me = game.state.runners[0];
    return Math.max(0.15, 1 - Math.hypot(x - me.x, z - me.z) / 9);
  }

  // ── 読みこみ: 観客 ───────────────────────────────
  await preload([...CHARACTERS.map((c) => c.key), ...new Set(SEATS.map((s) => s.kind))]);
  const audience = await Promise.all(SEATS.map(async (seat) => {
    const m = await createModel(seat.kind);
    m.root.position.set(seat.x, seat.y, seat.z);
    m.root.rotation.y = Math.atan2(-seat.x, -seat.z);
    m.play('idle');
    m.actions.idle.time = Math.random() * 2;
    m.setFace('normal');
    scene.add(m.root);
    return { seat, model: m, until: 0 };
  }));
  atmosphere.setupShadows([stage.group, stage.stump], [stage.group, stage.stump]);
  atmosphere.setupShadows([], audience.map((a) => a.model.root));

  // ── かげ・きらきら・しぶき ───────────────────────────
  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(40,30,20,0.5)');
    r.addColorStop(0.7, 'rgba(40,30,20,0.3)');
    r.addColorStop(1, 'rgba(40,30,20,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const makeShadow = (size) => {
    const m = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    m.position.y = 0.02;
    m.scale.setScalar(size);
    m.renderOrder = 1;
    return m;
  };
  const sparkleTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.translate(32, 32);
    g.fillStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 9 : 30, a = (i / 8) * Math.PI * 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    return new THREE.CanvasTexture(c);
  })();
  const fx = [];
  function sparkle(pos, color = 0xffffff, n = 5, size = 0.35) {
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTex, color, transparent: true, depthWrite: false }));
      sp.position.copy(pos);
      sp.scale.setScalar(size);
      scene.add(sp);
      const a = Math.random() * Math.PI * 2;
      fx.push({ obj: sp, t: 0, life: 0.5, vel: new THREE.Vector3(Math.cos(a) * 2, 1.4 + Math.random(), Math.sin(a) * 2), size, kind: 'sparkle' });
    }
  }
  const dropGeo = new THREE.SphereGeometry(0.05, 6, 4);
  const dropMat = new THREE.MeshBasicMaterial({ color: 0xd8f2ff });
  // しぶき: 水つぶと、ひろがる波の輪
  function splashAt(x, z, size = 1) {
    for (let i = 0; i < 30 * size; i++) {
      const m = new THREE.Mesh(dropGeo, dropMat);
      m.position.set(x, WATER_Y + 0.1, z);
      m.scale.setScalar(0.7 + Math.random() * size);
      scene.add(m);
      const a = Math.random() * Math.PI * 2, sp = (0.5 + Math.random() * 1.5) * size;
      fx.push({ obj: m, t: 0, life: 1.2, vel: new THREE.Vector3(Math.cos(a) * sp, (3 + Math.random() * 3) * Math.sqrt(size), Math.sin(a) * sp), kind: 'drop' });
    }
    for (let k = 0; k < 2; k++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
      ring.position.set(x, WATER_Y + 0.03, z);
      scene.add(ring);
      fx.push({ obj: ring, t: -k * 0.25, life: 1.3, kind: 'wave', r: 1.6 * size });
    }
  }
  const puffGeo = new THREE.IcosahedronGeometry(0.13, 1);
  function puff(x, z, n = 3, y = 0.1) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xf2e2c4, transparent: true, opacity: 0.8 }));
      m.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 0.5, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6), kind: 'puff' });
    }
  }
  const tmpS = new THREE.Vector3();
  function suck(v, color) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTex, color, transparent: true, depthWrite: false }));
    const a = Math.random() * Math.PI * 2, d = 0.9 + Math.random() * 0.5;
    const p = v.holder.position;
    const from = new THREE.Vector3(p.x + Math.cos(a) * d, 0.2 + Math.random() * 1.3, p.z + Math.sin(a) * d);
    sp.position.copy(from);
    scene.add(sp);
    fx.push({ obj: sp, t: 0, life: 0.32, kind: 'suck', from, to: v, size: 0.16 });
  }
  const streakGeo = new THREE.PlaneGeometry(0.05, 0.9);
  streakGeo.rotateX(-Math.PI / 2); // ながい向きが z
  function streak(x, z, face, sc) {
    for (let k = 0; k < 2; k++) {
      const m = new THREE.Mesh(streakGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
      const side = (Math.random() - 0.5) * 0.9 * sc;
      m.position.set(x + Math.cos(face) * side, 0.3 + Math.random() * 1.0 * sc, z - Math.sin(face) * side);
      m.rotation.y = face;
      m.rotation.z = Math.PI / 2; // たてに立てる
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 0.25, kind: 'streak' });
    }
  }
  // 「ドン!」の しょうげき(星形が ぱっと広がる)
  function impact(x, y, z, force) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTex, color: 0xfff2a0, transparent: true, depthWrite: false }));
    sp.position.set(x, y, z);
    scene.add(sp);
    fx.push({ obj: sp, t: 0, life: 0.25, kind: 'burst', size: 0.4 + Math.min(1.2, force / 6) });
  }
  // ふちから落ちる 木くず
  const chipGeo = new THREE.BoxGeometry(0.22, 0.12, 0.16);
  const chipMat = toonMaterial(0x8a5a3a);
  function crumb(x, z) {
    const d = Math.hypot(x, z) || 1;
    const m = new THREE.Mesh(chipGeo, chipMat);
    m.position.set(x, 0.05, z);
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 1.4, vel: new THREE.Vector3((x / d) * 1.2 + (Math.random() - 0.5), 1.2 + Math.random(), (z / d) * 1.2 + (Math.random() - 0.5)), spin: new THREE.Vector3(5, 3, 4), kind: 'crumb' });
  }
  const pieceMeshes = [];
  const H_SINK = 4;
  const confettiGeo = new THREE.PlaneGeometry(0.12, 0.07);
  function confetti(x, z) {
    const colors = [...PLAYER_COLORS.map((c) => c.hex), 0xffd24a, 0xffffff];
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true }));
      m.position.set(x + (Math.random() - 0.5) * 3, 3.5 + Math.random() * 2.5, z + (Math.random() - 0.5) * 3);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 3 + Math.random() * 1.5, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, -(0.7 + Math.random() * 0.6), (Math.random() - 0.5) * 0.6), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), kind: 'confetti' });
    }
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      if (f.t < 0) { f.obj.visible = false; continue; }
      f.obj.visible = true;
      const k = f.t / f.life;
      if (f.kind === 'sparkle') {
        f.vel.y -= dt * 4;
        f.obj.position.addScaledVector(f.vel, dt);
        f.obj.material.opacity = 1 - k;
        f.obj.scale.setScalar(f.size * (1 - k * 0.6));
      } else if (f.kind === 'drop') {
        f.vel.y -= dt * 12;
        f.obj.position.addScaledVector(f.vel, dt);
        if (f.obj.position.y < WATER_Y) f.t = f.life;
      } else if (f.kind === 'wave') {
        f.obj.scale.setScalar(0.3 + f.r * k);
        f.obj.material.opacity = 0.8 * (1 - k);
      } else if (f.kind === 'puff') {
        f.obj.position.addScaledVector(f.vel, dt);
        f.obj.scale.setScalar(1 + k * 1.5);
        f.obj.material.opacity = 0.8 * (1 - k);
      } else if (f.kind === 'suck') {
        // 体のまんなかへ すいこまれる
        const tp = f.to.holder.position;
        f.obj.position.lerpVectors(f.from, tmpS.set(tp.x, 0.7 * f.to.scale, tp.z), k * k);
        f.obj.material.opacity = Math.min(1, k * 3);
        f.obj.scale.setScalar(f.size * (1 - k * 0.6));
      } else if (f.kind === 'streak') {
        f.obj.material.opacity = 0.7 * (1 - k);
        f.obj.scale.set(1, 1, 1 + k);
      } else if (f.kind === 'burst') {
        f.obj.scale.setScalar(f.size * (0.5 + k * 1.2));
        f.obj.material.opacity = 1 - k;
      } else if (f.kind === 'crumb') {
        f.vel.y -= dt * 9;
        f.obj.position.addScaledVector(f.vel, dt);
        f.obj.rotation.x += f.spin.x * dt;
        f.obj.rotation.z += f.spin.z * dt;
        if (f.obj.position.y < WATER_Y) { if (!f.splashed) { f.splashed = true; splashAt(f.obj.position.x, f.obj.position.z, 0.25); } f.t = f.life; }
      } else if (f.kind === 'confetti') {
        f.obj.position.addScaledVector(f.vel, dt);
        f.obj.rotation.x += f.spin.x * dt;
        f.obj.rotation.y += f.spin.y * dt;
        f.obj.material.opacity = Math.min(1, (1 - k) * 3);
        if (f.obj.position.y < 0.02) { f.obj.position.y = 0.02; f.vel.set(0, 0, 0); f.spin.set(0, 0, 0); }
      }
      if (k >= 1) {
        scene.remove(f.obj);
        if (f.kind !== 'drop' && f.kind !== 'crumb') f.obj.material.dispose();
        fx.splice(i, 1);
      }
    }
  }

  // ── 湖のいきもの: 観客の蓮の葉が ぷかぷか、トンボ、ときどき はねる魚、水ぎわの あわ ──────
  const dragonflies = [0x4fa8e8, 0xe8604f, 0x6fcf6a].map((c, i) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.012, 0.32, 5).rotateX(Math.PI / 2), toonMaterial(c));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), toonMaterial(c));
    head.position.z = 0.17;
    g.add(body, head);
    const wingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    const wings = [];
    for (const z of [0.06, -0.01]) for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.05).rotateX(-Math.PI / 2), wingMat);
      w.position.set(sx * 0.13, 0.01, z);
      g.add(w);
      wings.push({ w, sx });
    }
    g.userData = { wings, ph: i * 2.1, r: 6 + i * 1.6, h: 1.2 + i * 0.5, sp: 0.35 + i * 0.08 };
    scene.add(g);
    return g;
  });
  const fish = (() => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), toonMaterial(0xf0904a));
    body.scale.set(0.6, 0.7, 1.4);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 4), toonMaterial(0xe8703a));
    tail.rotation.x = Math.PI / 2;
    tail.position.z = -0.28;
    g.add(body, tail);
    g.visible = false;
    scene.add(g);
    return { g, t: -1, next: 4, x: 0, z: 0, a: 0 };
  })();
  function updateLake(dt) {
    // 観客の蓮の葉
    stage.pads.forEach((pad, k) => {
      const y = WATER_Y + 0.02 + Math.sin(time * 1.3 + k * 1.7) * 0.03;
      pad.position.y = y;
      pad.rotation.z = Math.sin(time * 1.1 + k) * 0.03;
      audience[k].model.root.position.y = y + 0.05;
    });
    // あわ
    stage.foam.material.opacity = 0.45 + Math.sin(time * 2.2) * 0.15;
    stage.foam.scale.setScalar((game ? game.state.radius : RULES.r0) * (1 + Math.sin(time * 1.6) * 0.01));
    // トンボ: 湖の上を 8の字に
    for (const d of dragonflies) {
      const u = d.userData, t = time * u.sp + u.ph;
      const x = Math.sin(t) * u.r, z = Math.sin(t * 2) * u.r * 0.35 - 2;
      const nx = Math.sin(t + 0.01) * u.r, nz = Math.sin((t + 0.01) * 2) * u.r * 0.35 - 2;
      d.position.set(x, u.h + Math.sin(time * 3 + u.ph) * 0.15, z);
      d.rotation.y = Math.atan2(nx - x, nz - z);
      for (const w of u.wings) w.w.rotation.z = w.sx * Math.sin(time * 70) * 0.5;
    }
    // 魚: ときどき ぴょんと はねる
    fish.next -= dt;
    if (fish.t < 0 && fish.next <= 0) {
      fish.t = 0;
      fish.next = 5 + Math.random() * 6;
      const a = -Math.PI * Math.random(), d = 7 + Math.random() * 5;
      fish.x = Math.cos(a) * d; fish.z = Math.sin(a) * d; fish.a = Math.random() * 6;
      fish.g.visible = true;
      splashAt(fish.x, fish.z, 0.3);
    }
    if (fish.t >= 0) {
      fish.t += dt;
      const k = fish.t / 0.8;
      const dx = Math.sin(fish.a), dz = Math.cos(fish.a);
      fish.g.position.set(fish.x + dx * k * 1.2, WATER_Y + Math.sin(k * Math.PI) * 1.1, fish.z + dz * k * 1.2);
      fish.g.rotation.set(-Math.cos(k * Math.PI) * 0.9, fish.a, 0);
      if (k >= 1) {
        fish.t = -1;
        fish.g.visible = false;
        splashAt(fish.g.position.x, fish.g.position.z, 0.3);
        sfx.plop(0.5);
      }
    }
  }

  // ── 金どんぐり ───────────────────────────────────
  const acornGeo = acornGeometry();
  const goldMat = new THREE.MeshToonMaterial({ color: 0xffd24a, emissive: 0x7a4a00, emissiveIntensity: 0.4 });
  const items = new Map();
  function addItem(e) {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(acornGeo, goldMat);
    mesh.scale.setScalar(4.2);
    mesh.castShadow = true;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.55, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, depthWrite: false }));
    ring.position.y = 0.03;
    g.add(mesh, ring, makeShadow(0.5));
    g.position.set(e.x, 0, e.z);
    scene.add(g);
    items.set(e.id, { g, mesh, ring, t: 0 });
    sparkle(new THREE.Vector3(e.x, 0.6, e.z), 0xffd24a, 6, 0.35);
    sfx.pon();
  }
  function removeItem(id) {
    const v = items.get(id);
    if (!v) return;
    scene.remove(v.g);
    v.ring.material.dispose();
    items.delete(id);
  }
  function updateItems(dt) {
    const byId = new Map(game.state.items.map((it) => [it.id, it]));
    for (const [id, v] of items) {
      v.t += dt;
      const it = byId.get(id);
      v.mesh.position.y = 0.45 + Math.sin(v.t * 3) * 0.1;
      v.mesh.rotation.y = v.t * 2.5;
      v.ring.scale.setScalar(1 + Math.sin(v.t * 5) * 0.08);
      v.g.visible = !(it && it.life < 2 && Math.sin(it.life * 20) < 0);
    }
  }

  // ── ゲームの進行 ────────────────────────────────────
  let mode = 'idle';
  let picked = CHARACTERS[0].key;
  let tour = null;
  let game = null;
  let intro = 1;
  const INTRO_TIME = 2.4;
  const input = { touch: null, stick: null, keys: new Set(), target: null, hold: false, holdPointer: null, holdKey: false };

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS });
    if (game) for (const r of game.runners) scene.remove(r.holder);
    for (const id of [...items.keys()]) removeItem(id);
    for (const f of fx.splice(0)) scene.remove(f.obj);
    const state = createGame(players, seed);
    const runners = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const def = CHARACTERS.find((c) => c.key === p.character);
      const size = def.size || 1;
      const holder = new THREE.Group();
      const body = new THREE.Group(); // ためる・とっしんで かたむける
      body.add(model.root);
      holder.add(body);
      const sh = makeShadow(0.95 * size);
      holder.add(sh);
      // ためているときの 足もとの輪
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[slot].hex, transparent: true, opacity: 0, depthWrite: false }));
      ring.position.y = 0.04;
      ring.renderOrder = 2;
      holder.add(ring);
      const r = state.runners[slot];
      holder.position.set(r.x, 0, r.z);
      scene.add(holder);
      return { model, holder, body, shadow: sh, ring, size, scale: 1, fall: null, happyT: 0, lean: 0, dustAcc: 0, spinV: 0, spinA: 0, suckAcc: 0, full: false };
    }));
    // 自分の頭の上に しるし
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    runners[0].holder.add(marker);
    runners[0].marker = marker;

    // くずれる かけら(試合ごとに 切れめが ちがう)
    for (const m of pieceMeshes.splice(0)) { stage.stump.remove(m); m.geometry.dispose(); }
    pieceMeshes.push(...buildPieces(state, stage.stump));
    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), runners, acc: 0, endTimer: null, lastR: RULES.r0, shake: 0, hitstop: 0, slow: 0, focus: null, warned: false, lastTwo: false };
    atmosphere.apply(params.get('time') || state.timeOfDay);
    atmosphere.setupShadows(runners.map((r) => r.holder), runners.map((r) => r.holder));
    Object.assign(input, { touch: null, stick: null, target: null, hold: false, holdPointer: null, holdKey: false });
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoU').classList.add('show');
    if (!fromSky) splash('はっけよい…');
    updateStump(0);
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudU').hidden = m !== 'playing';
    document.body.classList.toggle('ingame', m !== 'idle');
  }
  function leave(to) { onExit(to); }

  // ── 一時停止 ──────────────────────────────────────
  let paused = false;
  function setPaused(on) {
    if (mode === 'idle') { paused = false; return; }
    paused = on && mode === 'playing';
    $('pause').hidden = !paused;
    if (paused) { input.touch = null; input.hold = false; input.holdPointer = null; }
  }
  const mine = (fn) => () => { if (mode !== 'idle') fn(); };
  $('pauseBtnU').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: どこでもスティック + ためるボタン ───────────────
  const STICK_R = 56;
  const FULL = 26, DEAD = 6;
  const stickEl = $('stickU'), knobEl = stickEl.firstElementChild;
  const tameEl = $('tameU');
  const playing = () => mode === 'playing' && !paused;
  tameEl.addEventListener('pointerdown', (e) => {
    if (!playing()) return;
    e.preventDefault();
    e.stopPropagation();
    unlockAudio();
    input.holdPointer = e.pointerId;
    input.hold = true;
    tameEl.classList.add('down');
    tameEl.setPointerCapture?.(e.pointerId);
  });
  const tameUp = (e) => {
    if (input.holdPointer !== e.pointerId) return;
    input.holdPointer = null;
    input.hold = false;
    tameEl.classList.remove('down');
  };
  tameEl.addEventListener('pointerup', tameUp);
  tameEl.addEventListener('pointercancel', tameUp);
  window.addEventListener('pointerdown', (e) => {
    if (!playing() || input.touch !== null || e.target.closest('button, a')) return;
    unlockAudio();
    input.touch = e.pointerId;
    input.stick = { ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    stickEl.style.left = `${e.clientX}px`;
    stickEl.style.top = `${e.clientY}px`;
    knobEl.style.transform = 'translate(-50%, -50%)';
    stickEl.hidden = false;
    $('howtoU').classList.remove('show');
  });
  window.addEventListener('pointermove', (e) => {
    if (input.touch !== e.pointerId || !input.stick) return;
    let dx = e.clientX - input.stick.ox, dy = e.clientY - input.stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R * 1.4) {
      input.stick.ox += (dx / d) * (d - STICK_R * 1.4);
      input.stick.oy += (dy / d) * (d - STICK_R * 1.4);
      stickEl.style.left = `${input.stick.ox}px`;
      stickEl.style.top = `${input.stick.oy}px`;
      dx = e.clientX - input.stick.ox;
      dy = e.clientY - input.stick.oy;
    }
    const dist = Math.hypot(dx, dy);
    const k = Math.min(1, Math.max(0, (dist - DEAD) / (FULL - DEAD)));
    const a = Math.atan2(dy, dx);
    input.stick.dx = Math.cos(a) * k;
    input.stick.dy = Math.sin(a) * k;
    const shownD = Math.min(dist, STICK_R);
    knobEl.style.transform = `translate(calc(-50% + ${Math.cos(a) * shownD}px), calc(-50% + ${Math.sin(a) * shownD}px))`;
  });
  const release = (e) => {
    if (input.touch !== e.pointerId) return;
    input.touch = null;
    input.stick = null;
    stickEl.hidden = true;
  };
  for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, release);
  const KEYS = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
  window.addEventListener('keydown', (e) => {
    if (mode !== 'playing') return;
    if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!paused); return; }
    if (e.code === 'Space') { e.preventDefault(); unlockAudio(); input.holdKey = true; return; }
    if (KEYS[e.code]) {
      e.preventDefault();
      unlockAudio();
      input.keys.add(e.code);
      $('howtoU').classList.remove('show');
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') input.holdKey = false;
    input.keys.delete(e.code);
  });
  window.addEventListener('blur', () => { input.keys.clear(); input.touch = null; input.stick = null; input.hold = input.holdKey = false; stickEl.hidden = true; });

  const fwd = new THREE.Vector3();
  function myInput() {
    const hold = input.hold || input.holdKey;
    if (input.target) return { ...input.target, hold: input.target.hold ?? hold };
    const me = game.state.runners[0];
    let sx = 0, sy = 0;
    if (input.keys.size) {
      for (const k of input.keys) { sx += KEYS[k][0]; sy += KEYS[k][1]; }
      const d = Math.hypot(sx, sy);
      if (d) { sx /= d; sy /= d; }
    } else if (input.stick) {
      sx = input.stick.dx;
      sy = input.stick.dy;
    }
    if (Math.hypot(sx, sy) < 0.05) return { x: null, z: null, hold };
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const wx = -fwd.z * sx + fwd.x * -sy, wz = fwd.x * sx + fwd.z * -sy;
    return { x: me.x + wx * 0.5, z: me.z + wz * 0.5, hold };
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashU');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildChips() {
    $('chipsU').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'chip' + (slot === 0 ? ' me' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      d.innerHTML = `<i></i><b></b>`;
      d.title = p.name;
      return d;
    }));
  }
  // 太鼓のどろどろ
  function taiko() {
    for (let i = 0; i < 12; i++) voice({ type: 'triangle', pts: [[0, 110], [0.08, 70]], len: 0.12, gain: 0.05 + i * 0.008, at: i * 0.08 });
    voice({ type: 'triangle', pts: [[0, 140], [0.2, 60]], len: 0.35, gain: 0.16, at: 1.0 });
  }
  function renderHud() {
    const s = game.state;
    // 土俵が くずれはじめる 2.5 秒前に 知らせる
    const tp = Math.max(0, s.t - RULES.readyTime);
    if (s.phase === 'play' && tp > RULES.crumbleAt - 2.5 && !game.warned) {
      game.warned = true;
      splash('もうすぐ くずれる!', 'red small');
      sfx.rumble();
    }
    [...$('chipsU').children].forEach((c, slot) => {
      const r = s.runners[slot];
      c.classList.toggle('out', !r.alive);
      c.classList.toggle('power', r.power > 0);
      c.lastChild.textContent = r.alive ? '' : `${s.out.length - s.out.indexOf(slot) + aliveSlots(s).length}位`;
    });
    // ためるボタン: たまり具合(いっぱいで金色)
    const me = s.runners[0];
    const k = Math.min(1, me.charge / RULES.chargeMax);
    tameEl.style.setProperty('--k', k.toFixed(3));
    tameEl.classList.toggle('full', k >= 1);
    tameEl.disabled = !me.alive;
  }
  const tmpV = new THREE.Vector3();
  function pop(text, x, y, z, cls = '') {
    tmpV.set(x, y, z).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsU').append(el);
    setTimeout(() => el.remove(), 900);
  }

  // ── できごと ────────────────────────────────────────
  function cheer() {
    for (const a of audience) { a.model.play('cheer'); a.model.setFace('happy'); a.until = 1.4; }
  }
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'start':
          splash('のこった!');
          setTimeout(() => $('howtoU').classList.remove('show'), 6000);
          voice({ type: 'triangle', pts: [[0, 784]], len: 0.12, gain: 0.12 });
          voice({ type: 'triangle', pts: [[0, 1046]], len: 0.25, gain: 0.12, at: 0.12 });
          break;
        case 'shrink':
          splash('土俵が くずれる!', 'red small');
          game.shake = 0.25;
          break;
        case 'crack': {
          // ぐらぐら: 上の面が赤く ちかちか、ひびから 土ぼこり
          const m = pieceMeshes[e.id];
          m.material = [shakyMat, m.material[1]];
          const p = m.userData.piece, rr = (p.outer + p.inner) / 2;
          puff(Math.cos(m.userData.mid) * rr, Math.sin(m.userData.mid) * rr, 3);
          sfx.crack(volFor(Math.cos(m.userData.mid) * rr, Math.sin(m.userData.mid) * rr));
          break;
        }
        case 'crumble': {
          // くずれる: 外へ かたむきながら 湖へ
          const m = pieceMeshes[e.id];
          m.userData.fall = { t: 0, vy: 0, splashed: false };
          const p = m.userData.piece, rr = (p.outer + p.inner) / 2;
          const x = Math.cos(m.userData.mid) * rr, z = Math.sin(m.userData.mid) * rr;
          for (let k = 0; k < 3; k++) crumb(x, z);
          sfx.rumble(0.6 * volFor(x, z));
          break;
        }
        case 'item':
          addItem(e);
          break;
        case 'itemGone':
          removeItem(e.id);
          break;
        case 'power': {
          removeItem(e.id);
          const v = game.runners[e.slot];
          sparkle(v.holder.position.clone().setY(1.2), 0xffd24a, 10, 0.45);
          sfx.kiran(e.slot === 0 ? 1 : volFor(v.holder.position.x, v.holder.position.z));
          v.happyT = 1;
          if (e.slot === 0) splash('どんぐりパワー!', 'gold');
          break;
        }
        case 'charge':
          if (e.slot === 0) sfx.charge();
          break;
        case 'dash': {
          const v = game.runners[e.slot];
          sfx.dash(e.power, e.slot === 0 ? 1 : 0.5);
          puff(v.holder.position.x, v.holder.position.z, 4);
          break;
        }
        case 'bump': {
          if (e.force < 2.2) break;
          impact(e.x, 0.9, e.z, e.force);
          const near = e.a === 0 || e.b === 0;
          sfx.don(e.force, near ? 1 : volFor(e.x, e.z));
          if (e.force > 4.5) {
            pop(e.by !== null ? 'ドーン!' : 'ドン!', e.x, 1.8, e.z, e.by !== null ? 'don' : 'bang');
            if (near) game.shake = Math.max(game.shake, Math.min(0.3, e.force / 30));
          }
          // とっしんで当てられた子は、くるくる回りながら とぶ
          if (e.by !== null && e.force > 3) {
            const hit = e.by === e.a ? e.b : e.a;
            game.runners[hit].spinV = (Math.random() < 0.5 ? -1 : 1) * Math.min(26, e.force * 2.6);
            game.runners[e.by].happyT = 0.8;
            // 強く当たったら、ほんの一瞬 止める(ヒットストップ)
            if (e.force > 5.5) game.hitstop = Math.max(game.hitstop, near ? 0.09 : 0.05);
          }
          break;
        }
        case 'fall': {
          const v = game.runners[e.slot];
          // 外へ とびながら 湖へ
          const sp = Math.max(2.5, Math.hypot(e.vx, e.vz));
          const d = Math.hypot(e.x, e.z) || 1;
          v.fall = { t: 0, x: e.x, z: e.z, vx: (e.x / d) * sp * 0.7 + e.vx * 0.3, vz: (e.z / d) * sp * 0.7 + e.vz * 0.3, vy: 3.2, y: 0, inWater: false };
          if (e.slot === 0) splash('おちた…', 'red');
          else if (e.by === 0) splash('おしだし!', 'gold');
          cheer();
          // スローにして、落ちる子を カメラで追う(勝負が決まる 落ち方は 長めに)
          const last = aliveSlots(s).length <= 1;
          game.slow = last ? 1.1 : 0.45;
          game.focus = { slot: e.slot, t: last ? 1.6 : 0.9 };
          // のこり2人
          if (aliveSlots(s).length === 2 && !game.lastTwo) {
            game.lastTwo = true;
            setTimeout(() => {
              if (game.state.phase !== 'play') return;
              splash('さいごの ふたり!', 'gold small');
              taiko();
            }, 900);
          }
          break;
        }
        case 'finished': {
          game.endTimer = 5.2; // 落ちるところを スローで見せてから、勝った子
          const w = s.runners[e.winner];
          splash(e.timeUp ? 'そこまで!' : 'しょうぶあり!');
          confetti(w.x, w.z);
          cheer();
          voice({ type: 'triangle', pts: [[0, 784]], len: 0.15, gain: 0.1 });
          voice({ type: 'triangle', pts: [[0, 988]], len: 0.15, gain: 0.1, at: 0.15 });
          voice({ type: 'triangle', pts: [[0, 1175]], len: 0.4, gain: 0.1, at: 0.3 });
          break;
        }
      }
    }
  }

  function showResult() {
    const s = game.state;
    if (tour) {
      const done = tour.onFinish;
      setMode('idle');
      done({ ranking: ranking(s), picked: null });
      return;
    }
    const order = ranking(s);
    const winner = game.players[s.winner];
    $('resultTitle').textContent = s.winner === 0 ? 'あなたの勝ち!' : `${winner.name}の勝ち!`;
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = game.players[slot];
      const r = s.runners[slot];
      const li = document.createElement('li');
      if (slot === 0) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : 'あなた';
      const def = CHARACTERS.find((c) => c.key === p.character);
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}</small></span><span class="dist">おしだし ${r.pushes}<small>とっしん ${r.dashes}</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
  function updateRunners(dt) {
    const s = game.state;
    const done = s.phase === 'finished';
    s.runners.forEach((r, i) => {
      const v = game.runners[i];
      v.happyT = Math.max(0, v.happyT - dt);
      // どんぐりパワー: 大きくなる
      const want = r.power > 0 ? RULES.powerR / RULES.bodyR : 1;
      v.scale += (want - v.scale) * (1 - Math.exp(-dt * 8));
      let clip = 'idle', face = 'normal', timeScale = 1;
      if (v.fall) {
        // 落ちた: とんで、ざぶん。そのあとは 水にうかんで ぷかぷか
        const f = v.fall;
        f.t += dt;
        if (!f.inWater) {
          f.vy -= dt * 14;
          f.x += f.vx * dt; f.z += f.vz * dt; f.y += f.vy * dt;
          if (f.y < WATER_Y - 0.2) {
            f.inWater = true;
            splashAt(f.x, f.z, 1);
            sfx.splash(i === 0 ? 1 : volFor(f.x, f.z));
          }
        } else {
          f.x += f.vx * dt * 0.15; f.z += f.vz * dt * 0.15;
          f.vx *= 1 - dt; f.vz *= 1 - dt;
          f.y = WATER_Y - 0.55 + Math.sin(f.t * 3) * 0.05;
        }
        v.holder.position.set(f.x, f.y, f.z);
        v.shadow.visible = false;
        v.ring.material.opacity = 0;
        v.body.rotation.x = f.inWater ? 0 : -0.6;
        clip = 'dizzy';
        face = 'frustrated';
        if (done && s.winner !== i) { clip = 'wave'; face = 'happy'; }
      } else {
        v.holder.position.set(r.x, 0, r.z);
        const speed = Math.hypot(r.vx, r.vz);
        v.model.root.rotation.y = lerpAngle(v.model.root.rotation.y, r.face, 1 - Math.exp(-dt * 14));
        // ためる: しゃがんで ぷるぷる。とっしん: 前へ かたむく
        const ck = r.charge / RULES.chargeMax;
        const leanWant = r.dash > 0 ? 0.45 : r.recover > 0 ? -0.1 : 0;
        v.lean += (leanWant - v.lean) * (1 - Math.exp(-dt * 14));
        v.spinA += v.spinV * dt;
        v.spinV *= Math.exp(-dt * 2.5);
        if (Math.abs(v.spinV) < 0.5) v.spinA = lerpAngle(v.spinA, 0, 1 - Math.exp(-dt * 8));
        v.body.rotation.set(0, v.spinA, 0);
        const fwdX = Math.sin(r.face), fwdZ = Math.cos(r.face);
        v.body.rotation.x = v.lean * fwdZ;
        v.body.rotation.z = -v.lean * fwdX;
        const shiver = r.holding ? Math.sin(time * 60) * 0.02 * ck : 0;
        v.body.position.set(shiver, 0, 0);
        v.body.scale.set(v.scale * (1 + ck * 0.08), v.scale * (1 - ck * 0.16), v.scale * (1 + ck * 0.08));
        // 足もとの輪: ためると広がって、いっぱいで金色
        v.ring.material.opacity = r.holding ? 0.85 : Math.max(0, v.ring.material.opacity - dt * 4);
        v.ring.scale.setScalar(v.scale * (0.8 + ck * 0.9));
        v.ring.material.color.setHex(ck >= 1 ? 0xffd24a : PLAYER_COLORS[i].hex);
        v.shadow.visible = true;
        v.shadow.scale.setScalar(0.95 * v.size * v.scale);
        // ためる: まわりから 光のつぶが すいこまれる(たまるほど たくさん)
        if (r.holding) {
          v.suckAcc += dt * (10 + ck * 30);
          while (v.suckAcc >= 1) { v.suckAcc--; suck(v, ck >= 1 ? 0xffd24a : PLAYER_COLORS[i].hex); }
          if (ck >= 1 && !v.full) {
            v.full = true;
            sparkle(new THREE.Vector3(r.x, 1.2 * v.scale, r.z), 0xffd24a, 8, 0.4);
            if (i === 0) [1568, 2093].forEach((f, n) => voice({ pts: [[0, f]], len: 0.25, gain: 0.06, at: n * 0.06 }));
          }
        } else v.full = false;
        // とっしん中は土ぼこりと 風のすじ
        if (r.dash > 0) {
          v.dustAcc += dt;
          if (v.dustAcc > 0.035) {
            v.dustAcc = 0;
            puff(r.x - fwdX * 0.3, r.z - fwdZ * 0.3, 1);
            streak(r.x - fwdX * 0.5, r.z - fwdZ * 0.5, r.face, v.scale);
          }
        }
        if (r.power > 0 && Math.random() < dt * 8) sparkle(new THREE.Vector3(r.x + (Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 1.4 * v.scale, r.z + (Math.random() - 0.5) * 0.8), 0xffd24a, 1, 0.22);
        if (done) {
          if (s.winner === i) { clip = 'cheer'; face = 'happy'; v.model.root.rotation.y = lerpAngle(v.model.root.rotation.y, Math.atan2(camera.position.x - r.x, camera.position.z - r.z), 0.2); }
        } else if (r.stun > 0) { clip = 'dizzy'; face = 'surprised'; }
        else if (r.holding) face = 'frustrated';
        else if (r.dash > 0) { clip = 'run'; timeScale = 2; face = 'frustrated'; }
        else if (speed > 0.3) { clip = 'run'; timeScale = 0.6 + 0.6 * Math.min(1, speed / RULES.maxSpeed); }
        if (v.happyT > 0 && clip !== 'dizzy') face = 'happy';
      }
      v.model.play(clip, { timeScale });
      v.model.setFace(face);
      v.model.update(dt);
      if (v.marker) v.marker.position.set(0, 2.0 * v.size * v.scale + 0.08 * Math.sin(performance.now() / 180), 0);
    });
  }
  // かけら: ぐらぐら(だんだん大きく ふるえる)→ くずれて 外へ かたむきながら 湖へ ざぶん
  function updateStump(dt) {
    if (!game) return;
    const s = game.state;
    shakyMat.color.setHex(Math.sin(time * 16) > 0 ? 0xff8a70 : 0xffffff);
    for (const m of pieceMeshes) {
      const p = m.userData.piece, u = m.userData;
      if (p.state === 1) {
        const k = 1 - p.t / RULES.crumbleWarn; // 0 → 1
        const a = 0.01 + k * 0.05;
        m.position.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a * 0.5, (Math.random() - 0.5) * a);
        if (Math.random() < dt * 6 * k) {
          const rr = p.outer - Math.random() * 0.3;
          crumb(Math.cos(u.mid) * rr, Math.sin(u.mid) * rr);
        }
      } else if (u.fall) {
        const f = u.fall;
        f.t += dt;
        f.vy -= dt * 9;
        const out = Math.min(1, f.t * 1.5);
        m.position.set(Math.cos(u.mid) * out * 0.6, m.position.y + f.vy * dt, Math.sin(u.mid) * out * 0.6);
        // 外がわへ たおれる(中心の まわりではなく、かけらの 内がわのふちを じくに 回したように)
        m.rotation.set(Math.sin(u.mid) * f.t * 0.9, 0, -Math.cos(u.mid) * f.t * 0.9);
        if (!f.splashed && m.position.y < WATER_Y + 0.3) {
          f.splashed = true;
          const rr = (p.outer + p.inner) / 2;
          splashAt(Math.cos(u.mid) * rr, Math.sin(u.mid) * rr, 0.9);
          sfx.splash(0.5 * volFor(Math.cos(u.mid) * rr, Math.sin(u.mid) * rr));
        }
        if (m.position.y < -H_SINK) m.visible = false;
      }
    }
    MOSS.forEach((m, k) => { stage.mosses[k].visible = mossAlive(s, m); });
  }

  let freeCamera = false;
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const s = game?.state;
    let pos, look;
    // 落ちる子を追う(勝負が決まる 落ち方も、勝った子より先に見せる)
    if (game?.focus && game.focus.t > 0) {
      game.focus.t -= dt;
      const f = game.runners[game.focus.slot].holder.position;
      pos = new THREE.Vector3(f.x * 0.6, portrait ? 5.5 : 4.2, f.z * 0.6 + (portrait ? 6 : 4.8));
      look = new THREE.Vector3(f.x, Math.max(WATER_Y, f.y), f.z);
      return moveCamera(pos, look, dt, portrait, snap);
    }
    if (s && (s.phase === 'finished' || mode === 'result')) {
      const w = s.runners[s.winner];
      pos = new THREE.Vector3(w.x * 0.6, 3.6, w.z + (portrait ? 6.5 : 5));
      look = new THREE.Vector3(w.x, 0.9, w.z);
    } else {
      // 自分を追いかける(落ちたら まん中)。土俵が小さくなるほど 寄る
      const me = s && s.runners[0].alive ? s.runners[0] : { x: 0, z: 0 };
      const R = s ? s.radius : RULES.r0;
      const fx = me.x * 0.55, fz = me.z * 0.55;
      const far = 0.75 + 0.25 * (R / RULES.r0);
      pos = new THREE.Vector3(fx, (portrait ? 11.5 : 8) * far, fz + (portrait ? 8.6 : 7.2) * far);
      look = new THREE.Vector3(fx, 0, fz - 0.6);
    }
    moveCamera(pos, look, dt, portrait, snap);
  }
  function moveCamera(pos, look, dt, portrait, snap) {
    camera.fov = portrait ? 58 : 46;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(-14, 20, -16);
      camera.position.lerpVectors(sky, pos, e);
      camera.userData.look = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 0, 0), look, Math.min(1, e * 1.1));
      camera.lookAt(camera.userData.look);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 4);
    camera.position.lerp(pos, k);
    camera.userData.look = camera.userData.look ? camera.userData.look.lerp(look, k) : look.clone();
    camera.lookAt(camera.userData.look);
    if (game && game.shake > 0) {
      game.shake = Math.max(0, game.shake - dt);
      const a = game.shake;
      camera.position.add(new THREE.Vector3((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, 0));
    }
  }

  // ── 画質 ─────────────────────────────────────────
  const quality = { level: 0, sum: 0, n: 0, timer: 0, shadows: true };
  function applyQuality() {
    if (settings.quality === 'light') quality.level = 2;
    if (settings.quality === 'high') quality.level = 0;
    renderer.setPixelRatio(quality.level === 0 ? Math.min(devicePixelRatio, 2) : quality.level === 1 ? Math.min(devicePixelRatio, 1.25) : 1);
    renderer.setSize(innerWidth, innerHeight, false);
    const shadows = quality.level < 2;
    renderer.shadowMap.enabled = shadows;
    if (quality.shadows !== shadows) scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    quality.shadows = shadows;
  }
  function watchQuality(rawDt) {
    quality.sum += rawDt;
    quality.n++;
    quality.timer += rawDt;
    if (quality.timer < 2) return;
    const avg = quality.sum / quality.n;
    quality.sum = quality.n = quality.timer = 0;
    if (avg < 1 / 40 || quality.level >= 2 || settings.quality === 'high') return;
    quality.level++;
    applyQuality();
  }

  // ── 1フレーム ─────────────────────────────────────
  let time = 0;
  function frame(rawDt) {
    let dt = Math.min(rawDt, 0.1);
    time += dt;
    if (mode === 'playing' && intro >= 1) watchQuality(rawDt);
    if (intro < 1 && !paused) {
      intro = Math.min(1, intro + dt / INTRO_TIME);
      if (intro >= 1) splash('はっけよい…');
    }
    // ヒットストップ: 強く当たった一瞬だけ、なにもかも止める
    const stopped = game && game.hitstop > 0;
    if (stopped) { game.hitstop -= rawDt; renderer.render(scene, camera); return; }
    // 落ちる瞬間は スローに(すべての動きを ゆっくりにする)
    if (game && game.slow > 0 && !paused) {
      game.slow -= rawDt;
      dt *= 0.3;
    }
    if (game && mode === 'playing' && !paused && intro >= 1) {
      const s = game.state;
      game.acc += dt;
      while (game.acc >= STEP && s.phase !== 'finished') {
        const inputs = game.players.map((p, slot) => (p.cpu ? cpuInput(game.cpus[slot], s, slot) : myInput()));
        onEvents(step(s, inputs));
        game.acc -= STEP;
      }
      if (game.endTimer !== null) {
        game.endTimer -= dt;
        if (game.endTimer <= 0) {
          game.endTimer = null;
          showResult();
        }
      }
    }
    if (game && mode === 'playing') renderHud();
    if (game && !paused) {
      updateRunners(dt);
      updateItems(dt);
      updateStump(dt);
      updateFx(dt);
    }
    if (!paused) {
      for (const a of audience) {
        if (a.until > 0) {
          a.until -= dt;
          if (a.until <= 0) { a.model.play('idle'); a.model.setFace('normal'); }
        }
        a.model.update(dt);
      }
      if (stage.water?.material.map) stage.water.material.map.offset.set(time * 0.006, time * 0.004);
      updateLake(dt);
    }
    atmosphere.update(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  // E2E 用の口
  window.dsumo = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    steer: (t) => { input.target = t; },
    // 描かずに、みんな CPU で sec 秒すすめる(自分も CPU)
    advance: (sec) => {
      const me = createCpu('normal', 1, 0);
      for (let i = 0; i < sec / STEP && game.state.phase !== 'finished'; i++) {
        onEvents(step(game.state, game.players.map((p, slot) => cpuInput(slot ? game.cpus[slot] : me, game.state, slot))));
      }
    },
    holdCpus: () => game.cpus.forEach((c, slot) => { if (c) { c.think = 1e9; c.hold = false; c.rest = 1e9; c.target = { x: game.state.runners[slot].x, z: game.state.runners[slot].z }; } }),
    get paused() { return paused; },
    camera, renderer, scene,
    freeCamera: (on) => { freeCamera = on; },
    setTime: (key) => atmosphere.apply(key),
  };

  updateCamera(0, true);
  await renderer.compileAsync(scene, camera).catch(() => {});

  return {
    scene,
    camera,
    frame,
    async enter(character, { fromSky = true, lineup = null, onFinish = null } = {}) {
      picked = character;
      tour = onFinish ? { lineup, onFinish } : null;
      unlockAudio();
      applyQuality();
      await startGame({ fromSky });
      renderer.compile(scene, camera);
    },
    exit() {
      setMode('idle');
      input.touch = null;
      input.stick = null;
      input.hold = input.holdKey = false;
      $('stickU').hidden = true;
      input.keys.clear();
    },
    get intro() { return intro; },
  };
}
