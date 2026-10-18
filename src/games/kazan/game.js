// 火山の 落ちものよけ の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
//
// 動かし方: 画面の どこでも 指を おいて ずらすと 走る(どこでもスティック)。右下の ボタンで ジャンプ。
// パソコンは 矢印 / WASD で 走って、スペースで ジャンプ。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonGradient, toonMaterial } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { RULES, STEP, createGame, ranking, step, timeLeft } from './rules.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { LAVA_Y, buildPieces, buildStage } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);
const FALL_H = 11; // 落ちものが 見えはじめる 高さ
const FALL_T = 0.55; // 落ちてくるのが 見える 時間

export async function createKazan({ renderer, settings, getAudio, onExit }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 700);
  // 夕日は 火山の よこ(カメラの 正面 おく)
  const atmosphere = createAtmosphere(scene, renderer, camera, { course: false, sunDir: { evening: [0.4, 0.22, -0.9] } });
  const stage = buildStage(scene);

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
    whistle() { voice({ pts: [[0, 1400], [0.5, 500]], len: 0.5, gain: 0.03 }); },
    thud(big) { noise({ len: big ? 0.6 : 0.35, gain: big ? 0.35 : 0.2, freq: [big ? 500 : 800, 80], type: 'lowpass', attack: 0.004 }); },
    fire() { noise({ len: 0.5, gain: 0.12, freq: [3000, 600], q: 0.6 }); },
    jump() { voice({ pts: [[0, 480], [0.1, 760]], len: 0.12, gain: 0.05 }); },
    pick() { [0, 0.07, 0.14].forEach((at, i) => voice({ pts: [[0, 880 + i * 220]], len: 0.1, gain: 0.05, at })); },
    block() { voice({ type: 'triangle', pts: [[0, 1200], [0.15, 600]], len: 0.2, gain: 0.08 }); noise({ len: 0.15, gain: 0.08, freq: [3000, 1500] }); },
    out() { voice({ type: 'square', pts: [[0, 440], [0.4, 110]], len: 0.45, gain: 0.05 }); },
    crack() { noise({ len: 0.3, gain: 0.1, freq: [2000, 300], q: 2 }); },
    rumble() { noise({ len: 1.2, gain: 0.12, freq: [140, 50], type: 'lowpass', attack: 0.2 }); },
    boom() { noise({ len: 1.4, gain: 0.35, freq: [400, 40], type: 'lowpass', attack: 0.01 }); },
    fanfare() {
      [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1047]].forEach(([at, f]) => voice({ type: 'square', pts: [[0, f]], len: 0.12, gain: 0.05, at }));
      voice({ type: 'square', pts: [[0, 1047]], len: 0.6, gain: 0.05, at: 0.5, vib: 12, vibRate: 7 });
    },
  };

  // ── かけら(くずれる 足場) ───────────────────────────
  const pieceGroup = new THREE.Group();
  scene.add(pieceGroup);
  let pieces = [];

  // ── 落ちもの・転がる岩・かさ の 見た目 ─────────────────────
  const shadowGeo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = toonMaterial(0x4a3a34);
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
  const fireCore = new THREE.MeshBasicMaterial({ color: 0xffe07a });
  const drops = new Map(); // id → { shadow, obj, d }
  // 空で きらっ(落ちてくる 少し前に 見える)
  const twinkleTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, r = i % 2 ? 6 : 30;
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.fill();
    return new THREE.CanvasTexture(c);
  })();
  // ぐらぐらの かけらに 走る ひび
  const crackTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.strokeStyle = '#ff6a2a';
    g.lineWidth = 5;
    g.lineCap = 'round';
    const branch = (x, y, a, len, d) => {
      if (d > 3 || len < 6) return;
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      branch(x2, y2, a + (Math.random() - 0.5) * 1.2, len * 0.7, d + 1);
      if (Math.random() < 0.6) branch(x2, y2, a + (Math.random() < 0.5 ? 0.8 : -0.8), len * 0.5, d + 1);
    };
    for (let i = 0; i < 4; i++) branch(64, 64, (i / 4) * Math.PI * 2 + 0.3, 26, 0);
    return new THREE.CanvasTexture(c);
  })();
  function addDrop(e) {
    const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ color: e.kind === 'fire' ? 0x7a1a08 : 0x1a1010, transparent: true, opacity: 0, depthWrite: false }));
    shadow.position.set(e.x, 0.02, e.z);
    shadow.scale.setScalar(e.r * 0.4);
    scene.add(shadow);
    let obj;
    if (e.kind === 'fire') {
      obj = new THREE.Group();
      obj.add(new THREE.Mesh(new THREE.SphereGeometry(e.r * 0.75, 12, 10), fireMat));
      const core = new THREE.Mesh(new THREE.SphereGeometry(e.r * 0.45, 10, 8), fireCore);
      obj.add(core);
    } else {
      obj = new THREE.Mesh(rockGeo, rockMat);
      obj.scale.setScalar(e.r * 0.85);
      obj.castShadow = true;
    }
    obj.visible = false;
    scene.add(obj);
    const tw = new THREE.Sprite(new THREE.SpriteMaterial({ map: twinkleTex, color: e.kind === 'fire' ? 0xffb050 : 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    tw.position.set(e.x, FALL_H + 0.5, e.z);
    tw.scale.setScalar(0.1);
    scene.add(tw);
    drops.set(e.id, { shadow, obj, tw, d: e, at: game.state.t + e.warn, warn: e.warn, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()), trail: 0 });
  }
  function removeDrop(id) {
    const v = drops.get(id);
    if (!v) return;
    scene.remove(v.shadow, v.obj, v.tw);
    v.shadow.material.dispose();
    v.tw.material.dispose();
    drops.delete(id);
  }
  // 火の 玉の あとの 火(state.fires を 映す)
  const flames = new Map();
  function syncFlames(s) {
    for (const f of s.fires) {
      if (flames.has(f.id)) continue;
      const g = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), i % 2 ? fireMat : fireCore);
        const a = (i / 6) * Math.PI * 2;
        c.position.set(Math.cos(a) * f.r * 0.55, 0.25, Math.sin(a) * f.r * 0.55);
        g.add(c);
      }
      const scorch = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x2a0a04, transparent: true, opacity: 0.7, depthWrite: false }));
      scorch.scale.setScalar(f.r);
      scorch.position.y = 0.015;
      g.add(scorch);
      g.position.set(f.x, 0, f.z);
      scene.add(g);
      flames.set(f.id, g);
    }
    for (const [id, g] of flames) {
      if (s.fires.some((f) => f.id === id)) {
        g.children.forEach((c, i) => { if (c.geometry.type === 'ConeGeometry') c.scale.y = 0.7 + Math.sin(time * 14 + i * 2) * 0.3; });
      } else {
        scene.remove(g);
        flames.delete(id);
      }
    }
  }
  const rolls = new Map();
  function syncRolls(s) {
    for (const ro of s.rolls) {
      if (rolls.has(ro.id)) continue;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(RULES.rollR, 1), rockMat);
      m.castShadow = true;
      scene.add(m);
      rolls.set(ro.id, m);
    }
    for (const [id, m] of rolls) {
      const ro = s.rolls.find((r) => r.id === id);
      if (!ro) { scene.remove(m); rolls.delete(id); continue; }
      const onRock = Math.hypot(ro.x, ro.z) <= RULES.r0;
      if (onRock && Math.random() < dtLast * 18) puff(ro.x, 0.05, ro.z, 1, 0x8a7a70, 0.8);
      m.position.set(ro.x, (onRock ? 0 : -0.3) + RULES.rollR, ro.z);
      // 転がる 向きに くるくる
      const sp = Math.hypot(ro.dx, ro.dz);
      m.rotateOnWorldAxis(new THREE.Vector3(ro.dz / sp, 0, -ro.dx / sp), (sp / RULES.rollR) * dtLast);
    }
  }
  // かさ(落ちている / さしている)
  function umbrella(color = 0xff5a7a) {
    const g = new THREE.Group();
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.28, 8, 1, true), new THREE.MeshToonMaterial({ color, side: THREE.DoubleSide, gradientMap: toonGradient }));
    canopy.position.y = 0.7;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.75, 5), toonMaterial(0x6a4a2a));
    stick.position.y = 0.35;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), toonMaterial(0xffffff));
    tip.position.y = 0.86;
    g.add(canopy, stick, tip);
    return g;
  }
  const items = new Map();
  function syncItems(s) {
    for (const it of s.items) {
      if (items.has(it.id)) continue;
      const u = umbrella();
      u.position.set(it.x, 0, it.z);
      scene.add(u);
      items.set(it.id, u);
    }
    for (const [id, u] of items) {
      const it = s.items.find((x) => x.id === id);
      if (!it) { scene.remove(u); items.delete(id); continue; }
      u.position.y = 0.15 + Math.sin(time * 4 + id) * 0.08;
      u.rotation.y = time * 1.5;
      const left = it.until - s.t;
      u.visible = left > 2 || Math.floor(time * 8) % 2 === 0; // 消えそうに なったら ちかちか
    }
  }

  // ── けむり・すな・紙ふぶき ───────────────────────────
  const fx = [];
  const puffGeo = new THREE.IcosahedronGeometry(0.14, 1);
  function puff(x, y, z, n = 3, color = 0x8a7a70, size = 1) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
      m.position.set(x + (Math.random() - 0.5) * 0.4 * size, y, z + (Math.random() - 0.5) * 0.4 * size);
      m.scale.setScalar(size);
      scene.add(m);
      const a = Math.random() * Math.PI * 2;
      fx.push({ obj: m, t: 0, life: 0.7, vel: new THREE.Vector3(Math.cos(a) * 1.2 * size, 0.6 + Math.random() * 0.8, Math.sin(a) * 1.2 * size), kind: 'puff', size });
    }
  }
  function sparks(x, z, n = 14) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffd23c : 0xff6a2a, transparent: true }));
      m.position.set(x, 0.2, z);
      scene.add(m);
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 2.5;
      fx.push({ obj: m, t: 0, life: 0.7, vel: new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp), kind: 'spark' });
    }
  }
  // 火口の けむり(大きな まるい スプライト)・火の粉・ようがんの 泡
  const smokeTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,0.85)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.4)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  function smoke(dark = false) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: dark ? 0x3a2a2a : 0x7a6a6a, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    m.position.copy(stage.crater).add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
    m.scale.setScalar(8);
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 7 + Math.random() * 3, vel: new THREE.Vector3(1.5 + Math.random(), 3 + Math.random() * 1.5, 0), kind: 'smoke' });
  }
  const emberMat = [0xffd23c, 0xff8a2a, 0xff5a1a].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, fog: false }));
  const emberGeo = new THREE.SphereGeometry(0.4, 5, 4);
  function ember(big = false) {
    const m = new THREE.Mesh(emberGeo, emberMat[Math.floor(Math.random() * 3)].clone());
    m.position.copy(stage.crater);
    m.scale.setScalar(big ? 1.4 : 0.7 + Math.random() * 0.6);
    scene.add(m);
    const a = Math.random() * Math.PI * 2, sp = (big ? 10 : 5) * (0.5 + Math.random());
    fx.push({ obj: m, t: 0, life: 2.5 + Math.random(), vel: new THREE.Vector3(Math.cos(a) * sp, (big ? 22 : 14) + Math.random() * 8, Math.sin(a) * sp), kind: 'ember' });
  }
  const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xffc04a, transparent: true });
  function bubble() {
    const a = Math.random() * Math.PI * 2, d = RULES.r0 + 1 + Math.random() * 9;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.3 + Math.random() * 0.35, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), bubbleMat.clone());
    m.position.set(Math.cos(a) * d, LAVA_Y, Math.sin(a) * d - 1);
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 1.1, vel: new THREE.Vector3(), kind: 'bubble' });
  }
  // ようがんから ふわふわ 立ちのぼる 火の粉(遊んでいる カメラからも 見える)
  function rise() {
    const a = Math.random() * Math.PI * 2, d = RULES.r0 + 0.5 + Math.random() * 5;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 3), emberMat[Math.floor(Math.random() * 3)].clone());
    m.position.set(Math.cos(a) * d, LAVA_Y + 0.2, Math.sin(a) * d);
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 2.5 + Math.random() * 1.5, vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.6 + Math.random(), (Math.random() - 0.5) * 0.4), kind: 'rise', ph: Math.random() * 6 });
  }
  const confettiGeo = new THREE.PlaneGeometry(0.12, 0.07);
  function confetti(x, z) {
    const colors = [...PLAYER_COLORS.map((c) => c.hex), 0xffd24a, 0xffffff];
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true }));
      m.position.set(x + (Math.random() - 0.5) * 4, 4 + Math.random() * 2.5, z + (Math.random() - 0.5) * 3);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 3 + Math.random() * 1.5, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, -(0.7 + Math.random() * 0.6), (Math.random() - 0.5) * 0.6), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), kind: 'confetti' });
    }
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = f.t / f.life;
      f.obj.position.addScaledVector(f.vel, dt);
      if (f.kind === 'smoke') {
        f.vel.multiplyScalar(Math.exp(-0.15 * dt));
        f.obj.scale.setScalar(8 + k * 22);
        f.obj.material.opacity = 0.75 * Math.sin(Math.min(1, k) * Math.PI);
      } else if (f.kind === 'ember') {
        f.vel.y -= 14 * dt;
        f.obj.material.opacity = Math.min(1, (1 - k) * 2);
      } else if (f.kind === 'rise') {
        f.obj.position.x += Math.sin(time * 3 + f.ph) * dt * 0.3;
        f.obj.material.opacity = Math.sin(Math.min(1, k) * Math.PI);
      } else if (f.kind === 'bubble') {
        // ぷくっと ふくらんで ぱちん
        const s = k < 0.8 ? k / 0.8 : 1 + (k - 0.8) * 3;
        f.obj.scale.set(s, s * 0.9, s);
        f.obj.material.opacity = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
        if (!f.popped && k > 0.8) { f.popped = true; for (let j = 0; j < 3; j++) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 3), bubbleMat.clone()); e.position.copy(f.obj.position); scene.add(e); fx.push({ obj: e, t: 0, life: 0.6, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2), kind: 'spark' }); } }
      } else if (f.kind === 'puff') {
        f.vel.multiplyScalar(Math.exp(-3 * dt));
        f.obj.scale.setScalar(f.size * (1 + k * 1.6));
        f.obj.material.opacity = 0.85 * (1 - k);
      } else if (f.kind === 'spark') {
        f.vel.y -= 12 * dt;
        f.obj.material.opacity = 1 - k;
      } else if (f.kind === 'confetti') {
        f.obj.rotation.x += f.spin.x * dt;
        f.obj.rotation.y += f.spin.y * dt;
        f.obj.material.opacity = Math.min(1, (1 - k) * 3);
        if (f.obj.position.y < 0.02) { f.obj.position.y = 0.02; f.vel.set(0, 0, 0); f.spin.set(0, 0, 0); }
      }
      if (k >= 1) {
        scene.remove(f.obj);
        f.obj.material.dispose();
        fx.splice(i, 1);
      }
    }
  }

  // ── ゲームの進行 ────────────────────────────────────
  let mode = 'idle';
  let picked = CHARACTERS[0].key;
  let tour = null;
  let game = null;
  let intro = 1;
  const INTRO_TIME = 2.4;
  const input = { touch: null, stick: null, keys: new Set(), jump: false, target: null };
  await preload(CHARACTERS.map((c) => c.key));

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS });
    if (game) for (const r of game.runners) scene.remove(r.holder);
    for (const f of fx.splice(0)) scene.remove(f.obj);
    for (const id of [...drops.keys()]) removeDrop(id);
    for (const g of flames.values()) scene.remove(g);
    flames.clear();
    for (const m of rolls.values()) scene.remove(m);
    rolls.clear();
    for (const u of items.values()) scene.remove(u);
    items.clear();
    const state = createGame(players, seed);
    pieceGroup.clear();
    pieces = buildPieces(state, pieceGroup);
    const runners = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const holder = new THREE.Group();
      holder.add(model.root);
      scene.add(holder);
      const shield = umbrella(PLAYER_COLORS[slot].hex);
      shield.position.y = 0.9;
      shield.scale.setScalar(1.3);
      shield.visible = false;
      holder.add(shield);
      const def = CHARACTERS.find((c) => c.key === p.character);
      return { model, holder, shield, size: def.size || 1, out: null };
    }));
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    runners[0].holder.add(marker);
    runners[0].marker = marker;
    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), runners, acc: 0, endTimer: null, shake: 0, quake: 0, duel: false };
    $('hudV').classList.remove('erupt');
    atmosphere.apply(params.get('time') || state.timeOfDay);
    atmosphere.setupShadows([...runners.map((r) => r.holder), pieceGroup], [stage.group, pieceGroup]);
    Object.assign(input, { touch: null, stick: null, jump: false, target: null });
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoV').classList.add('show');
    if (!fromSky) splash('よーい…');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudV').hidden = m !== 'playing';
    document.body.classList.toggle('ingame', m !== 'idle');
  }
  function leave(to) { onExit(to); }

  // ── 一時停止 ──────────────────────────────────────
  let paused = false;
  function setPaused(on) {
    if (mode === 'idle') { paused = false; return; }
    paused = on && mode === 'playing';
    $('pause').hidden = !paused;
    if (paused) input.touch = null;
  }
  const mine = (fn) => () => { if (mode !== 'idle') fn(); };
  $('pauseBtnV').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: どこでもスティック + ジャンプボタン ──────────────
  const STICK_R = 56;
  const FULL = 26, DEAD = 6;
  const stickEl = $('stickV'), knobEl = stickEl.firstElementChild;
  const jumpEl = $('jumpV');
  const playing = () => mode === 'playing' && !paused;
  jumpEl.addEventListener('pointerdown', (e) => {
    if (!playing()) return;
    e.preventDefault();
    e.stopPropagation();
    unlockAudio();
    input.jump = true;
    jumpEl.classList.add('down');
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) jumpEl.addEventListener(ev, () => jumpEl.classList.remove('down'));
  window.addEventListener('pointerdown', (e) => {
    if (!playing() || input.touch !== null || e.target.closest('button, a')) return;
    unlockAudio();
    input.touch = e.pointerId;
    input.stick = { ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    stickEl.style.left = `${e.clientX}px`;
    stickEl.style.top = `${e.clientY}px`;
    knobEl.style.transform = 'translate(-50%, -50%)';
    stickEl.hidden = false;
    $('howtoV').classList.remove('show');
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
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); unlockAudio(); input.jump = true; return; }
    if (KEYS[e.code]) {
      e.preventDefault();
      unlockAudio();
      input.keys.add(e.code);
      $('howtoV').classList.remove('show');
    }
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.touch = null; input.stick = null; stickEl.hidden = true; });

  function myInput() {
    const jump = input.jump;
    input.jump = false;
    if (input.target) return { ...input.target, jump: input.target.jump ?? jump };
    let sx = 0, sy = 0;
    if (input.keys.size) {
      for (const k of input.keys) { sx += KEYS[k][0]; sy += KEYS[k][1]; }
      const d = Math.hypot(sx, sy);
      if (d) { sx /= d; sy /= d; }
    } else if (input.stick) {
      sx = input.stick.dx;
      sy = input.stick.dy;
    }
    // カメラは 手前の 上から 奥(-z)を 見ているので、画面の 右 = +x、画面の 上 = 奥(-z)
    return { x: sx, z: sy, jump };
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashV');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildChips() {
    $('chipsV').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'chip' + (slot === 0 ? ' me' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      d.innerHTML = '<i></i><b></b>';
      return d;
    }));
  }
  function renderHud() {
    const s = game.state;
    [...$('chipsV').children].forEach((c, i) => {
      const r = s.runners[i];
      c.classList.toggle('out', !r.alive);
      c.classList.toggle('shield', r.alive && r.shield > 0);
    });
    $('timeV').textContent = s.phase === 'play' ? String(Math.ceil(timeLeft(s))) : '';
    $('jumpV').hidden = s.phase === 'finished' || !s.runners[0].alive;
  }
  const tmpV = new THREE.Vector3();
  function pop(text, x, y, z, cls = '', life = 800) {
    tmpV.set(x, y, z).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsV').append(el);
    setTimeout(() => el.remove(), life);
  }

  // ── できごと ────────────────────────────────────────
  const CAUSE = { rock: 'ゴツン!', big: 'ドシーン!', fire: 'あちっ!', burn: 'あちち!', roll: 'ゴロゴロ…', fall: 'ひゅ〜…' };
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'eruptWarn':
          splash('ゴゴゴゴ…', 'red small');
          sfx.rumble();
          game.quake = 1.6;
          break;
        case 'erupt':
          splash('大ふんか!', 'red');
          sfx.boom();
          game.shake = 0.6;
          $('hudV').classList.add('erupt');
          for (let i = 0; i < 40; i++) ember(true);
          break;
        case 'eruptEnd':
          $('hudV').classList.remove('erupt');
          break;
        case 'start':
          splash('はじめ!');
          sfx.rumble();
          setTimeout(() => $('howtoV').classList.remove('show'), 6000);
          break;
        case 'drop':
          addDrop(e);
          break;
        case 'land_drop': {
          removeDrop(e.id);
          const big = e.kind === 'big';
          puff(e.x, 0.1, e.z, big ? 9 : 5, e.kind === 'fire' ? 0x5a3a2a : 0x8a7a70, big ? 1.6 : 1);
          if (e.kind === 'fire') { sparks(e.x, e.z); sfx.fire(); } else sfx.thud(big);
          game.shake = Math.max(game.shake, big ? 0.45 : 0.18);
          break;
        }
        case 'roll': {
          sfx.rumble();
          // 台に 入る ところに「ゴロゴロ…」
          const sp = Math.hypot(e.dx, e.dz);
          const ex = e.x + (e.dx / sp) * 1.6, ez = e.z + (e.dz / sp) * 1.6;
          pop('ゴロゴロ…', ex, 1.2, ez, 'roll', 1200);
          break;
        }
        case 'item':
          break;
        case 'pick': {
          const r = s.runners[e.who];
          pop('かさ!', r.x, 2.0, r.z, 'gold');
          game.runners[e.who].shieldPop = 0;
          if (e.who === 0) sfx.pick();
          break;
        }
        case 'block': {
          const r = s.runners[e.who];
          pop('セーフ!', r.x, 2.2, r.z, 'gold');
          sparks(r.x, r.z, 10);
          sfx.block();
          break;
        }
        case 'jump':
          if (e.who === 0) sfx.jump();
          puff(s.runners[e.who].x, 0.05, s.runners[e.who].z, 2);
          break;
        case 'shaky': {
          sfx.crack();
          // ひびが 走って、ふちから けむり
          const m = pieces[e.id];
          const p = m.userData.piece, mid = m.userData.mid, R = (p.outer + p.inner) / 2;
          const crack = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, opacity: 0, depthWrite: false }));
          crack.position.set(Math.cos(mid) * R, 0.012, Math.sin(mid) * R);
          crack.rotation.y = Math.random() * 6;
          m.add(crack);
          m.userData.crack = crack;
          puff(Math.cos(mid) * p.outer, -0.2, Math.sin(mid) * p.outer, 3, 0x6a5a50);
          break;
        }
        case 'crumble': {
          const m = pieces[e.id];
          m.userData.fall = { t: 0, vy: 0, spin: (Math.random() - 0.5) * 2 };
          const mid = m.userData.mid, R = (m.userData.piece.outer + m.userData.piece.inner) / 2;
          puff(Math.cos(mid) * R, 0, Math.sin(mid) * R, 6, 0x6a5a50, 1.3);
          sfx.thud(true);
          break;
        }
        case 'out': {
          const u = game.runners[e.who];
          const r = s.runners[e.who];
          u.out = { t: 0, cause: e.cause, x: r.x, z: r.z, vx: r.x * 0.6, vz: r.z * 0.6 + 0.5, vy: e.cause === 'fall' ? 0 : 7, y: r.y };
          pop(CAUSE[e.cause] || 'あっ!', r.x, 2.0, r.z, e.who === 0 ? 'red' : 'out');
          if (e.who === 0) { splash('あたっちゃった…', 'red small'); sfx.out(); }
          // のこり 2人: いっきうち
          if (s.phase === 'play' && s.runners.filter((x) => x.alive).length === 2 && !game.duel) {
            game.duel = true;
            setTimeout(() => splash('いっきうち!', 'gold small'), 900);
          }
          break;
        }
        case 'finished': {
          game.endTimer = 4.5;
          const win = e.winner === 0;
          splash(e.timeUp ? 'じかん ぎれ!' : win ? 'さいごの 1人!' : 'しゅうりょう!', win ? 'gold' : '');
          if (win) sfx.fanfare();
          const r = s.runners[e.winner];
          confetti(r.x, r.z);
          $('hudV').classList.remove('erupt');
          // 火山が お祝いの 火の粉を ドーン
          for (let i = 0; i < 6; i++) setTimeout(() => { for (let j = 0; j < 25; j++) ember(true); const a = Math.random() * Math.PI * 2; sparks(r.x + Math.cos(a) * 1.5, r.z + Math.sin(a) * 1.5, 30); sfx.boom(); }, 300 + i * 600);
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
    $('resultTitle').textContent = order[0] === 0 ? 'あなたの 勝ち!' : `${order.indexOf(0) + 1}位`;
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = game.players[slot];
      const r = s.runners[slot];
      const li = document.createElement('li');
      if (slot === 0) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : 'あなた';
      const def = CHARACTERS.find((c) => c.key === p.character);
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}</small></span><span class="dist">${r.alive ? 'のこった!' : ''}<small>かさ ${r.shields}</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateWorld(dt) {
    const s = game.state;
    // 子
    for (const [slot, u] of game.runners.entries()) {
      const r = s.runners[slot];
      let clip = 'idle', face = 'normal';
      if (u.out) {
        // 当たった: ぽーんと とんで ようがんへ / 足場から 落ちる
        const o = u.out;
        o.t += dt;
        o.vy -= 18 * dt;
        o.x += o.vx * dt;
        o.z += o.vz * dt;
        o.y += o.vy * dt;
        u.holder.position.set(o.x, o.y, o.z);
        u.holder.rotation.x += dt * (o.cause === 'fall' ? 2 : 8);
        clip = 'dizzy';
        face = 'surprised';
        u.holder.visible = o.y > LAVA_Y - 1;
        if (!o.splashed && o.y < LAVA_Y + 0.2) { o.splashed = true; sparks(o.x, o.z, 16); }
      } else {
        const moving = Math.hypot(r.vx, r.vz) > 0.4;
        clip = r.y > 0 ? 'cheer' : moving ? 'run' : 'idle';
        if (s.phase === 'finished') { clip = 'cheer'; face = 'happy'; }
        // 近くに 影が あったら こわがる
        for (const v of drops.values()) if (Math.hypot(v.d.x - r.x, v.d.z - r.z) < v.d.r + 0.8) face = 'surprised';
        const fallY = r.falling > 0 ? -(0.35 - r.falling) * 6 : 0;
        u.holder.position.set(r.x, r.y + fallY, r.z);
        u.holder.rotation.set(0, r.face, 0);
        u.shield.visible = r.shield > 0 && (r.shield > 1.5 || Math.floor(time * 8) % 2 === 0);
        // かさが ぽんっと ひらく(ばねの ように 少し 大きく なってから もどる)
        if (u.shieldPop !== undefined && u.shieldPop < 1) {
          u.shieldPop = Math.min(1, u.shieldPop + dt * 2.5);
          const k = u.shieldPop;
          u.shield.scale.setScalar(1.3 * (1 + Math.sin(k * Math.PI * 2.5) * (1 - k) * 0.6) * Math.min(1, k * 4));
        }
      }
      u.model.play(clip, { timeScale: clip === 'run' ? 1.3 : 1 });
      u.model.setFace(face);
      u.model.update(dt);
      if (u.marker) {
        u.marker.visible = !u.out;
        u.marker.position.set(0, 2.0 * u.size + 0.1 * Math.sin(performance.now() / 180), 0);
      }
    }
    // 落ちもの: 影が だんだん こく 大きく、さいごに 空から 落ちてくる
    for (const v of drops.values()) {
      const left = v.at - s.t;
      const k = 1 - Math.max(0, left) / v.warn;
      v.shadow.scale.setScalar(v.d.r * (0.4 + k * 0.6));
      v.shadow.material.opacity = 0.15 + k * 0.45;
      // 落ちる 直前は 影が 赤く ちかちか
      if (left < 0.4) v.shadow.material.color.setHex(Math.floor(time * 16) % 2 ? 0x8a1a0a : 0x1a1010);
      // 空で きらっ
      const tk = (FALL_T + 0.35 - left) / 0.35;
      if (tk > 0 && tk < 1.2) {
        v.tw.material.opacity = Math.sin(Math.min(1, tk) * Math.PI);
        v.tw.scale.setScalar(0.4 + Math.sin(Math.min(1, tk) * Math.PI) * (0.8 + v.d.r * 0.6));
        v.tw.material.rotation = tk * 2;
      } else v.tw.material.opacity = 0;
      if (left < FALL_T) {
        v.obj.visible = true;
        const f = Math.max(0, left / FALL_T);
        v.obj.position.set(v.d.x, v.d.r * 0.6 + f * f * FALL_H, v.d.z);
        v.obj.rotation.x += v.spin.x * dt * 6;
        v.obj.rotation.y += v.spin.y * dt * 6;
        // 火の玉は ほのおの 尾を ひく
        if (v.d.kind === 'fire') {
          v.trail -= dt;
          if (v.trail <= 0) {
            v.trail = 0.02;
            const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0xffb040 : 0xff5a1a, transparent: true, opacity: 0.9 }));
            m.position.copy(v.obj.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.2, (Math.random() - 0.5) * 0.3));
            m.scale.setScalar(v.d.r * 2.5);
            scene.add(m);
            fx.push({ obj: m, t: 0, life: 0.35, vel: new THREE.Vector3(0, 1.5, 0), kind: 'puff', size: v.d.r * 2.5 });
          }
          v.obj.children[0].scale.setScalar(1 + Math.sin(time * 30) * 0.1);
        }
      }
    }
    syncFlames(s);
    syncRolls(s);
    syncItems(s);
    // かけら: ぐらぐら → くずれて 落ちる
    for (const m of pieces) {
      const p = m.userData.piece;
      if (m.userData.fall) {
        const f = m.userData.fall;
        f.t += dt;
        f.vy -= 14 * dt;
        m.position.y += f.vy * dt;
        m.rotation.y += f.spin * dt * 0.1;
        m.visible = m.position.y > LAVA_Y - 3;
      } else if (p.state === 1) {
        const a = 0.03 + (1 - p.t / RULES.crumbleWarn) * 0.05;
        if (m.userData.crack) {
          const k = 1 - p.t / RULES.crumbleWarn;
          m.userData.crack.material.opacity = Math.min(1, k * 2.5);
          m.userData.crack.scale.setScalar(0.5 + k * 0.8);
        }
        m.position.set(Math.sin(time * 40 + p.id) * a, Math.sin(time * 33 + p.id) * a * 0.5, Math.cos(time * 37 + p.id) * a);
      }
    }
  }

  let freeCamera = false;
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const pos = portrait ? new THREE.Vector3(0, 17.5, 11.5) : new THREE.Vector3(0, 10.5, 10.5);
    const look = new THREE.Vector3(0, portrait ? -0.5 : -0.3, portrait ? 0.6 : 0.3);
    const s = game?.state;
    if (s && (game.duel || s.phase === 'finished')) {
      // いっきうち: のこった 子(決着後は 勝った子)へ 寄る
      const alive = s.runners.filter((r) => r.alive);
      const target = s.phase === 'finished' && s.winner !== null ? [s.runners[s.winner]] : alive;
      if (target.length) {
        const mx = target.reduce((a, r) => a + r.x, 0) / target.length, mz = target.reduce((a, r) => a + r.z, 0) / target.length;
        const near = s.phase === 'finished' ? 0.5 : 0.78;
        look.set(mx * 0.6, 0.3, mz * 0.6);
        pos.set(look.x, look.y + (pos.y - look.y) * near, look.z + (pos.z - look.z) * near);
      }
    }
    camera.fov = portrait ? 52 : 45;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(-6, 22, -30);
      camera.position.lerpVectors(sky, pos, e);
      camera.userData.look = new THREE.Vector3().lerpVectors(stage.crater, look, Math.min(1, e * 1.1));
      camera.lookAt(camera.userData.look);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 4);
    camera.position.lerp(pos, k);
    camera.userData.look = camera.userData.look ? camera.userData.look.lerp(look, k) : look.clone();
    if (game?.quake > 0) {
      game.quake = Math.max(0, game.quake - dt);
      camera.position.x += (Math.random() - 0.5) * 0.12;
      camera.position.y += (Math.random() - 0.5) * 0.08;
    }
    if (game?.shake > 0) {
      game.shake = Math.max(0, game.shake - dt);
      camera.position.x += (Math.random() - 0.5) * game.shake * 0.6;
      camera.position.y += (Math.random() - 0.5) * game.shake * 0.6;
    }
    camera.lookAt(camera.userData.look);
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
  let dtLast = 0;
  const amb = { smoke: 0, ember: 0, bubble: 0, rise: 0 };
  function frame(rawDt) {
    const dt = Math.min(rawDt, 0.1);
    dtLast = paused ? 0 : dt;
    time += dt;
    if (mode === 'playing' && intro >= 1) watchQuality(rawDt);
    if (intro < 1 && !paused) {
      intro = Math.min(1, intro + dt / INTRO_TIME);
      if (intro >= 1) splash('よーい…');
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
      updateWorld(dt);
      updateFx(dt);
    }
    if (!paused) {
      stage.lava.material.map.offset.x += dt * 0.01;
      stage.lava.material.map.offset.y += Math.sin(time * 0.3) * dt * 0.004;
      // ようがんの 光が ゆらゆら
      const fl = Math.sin(time * 2.1) * 0.5 + Math.sin(time * 5.3) * 0.3;
      stage.glow.intensity = 30 + fl * 8;
      stage.rim.material.opacity = 0.85 + fl * 0.15;
      amb.smoke -= dt; amb.ember -= dt; amb.bubble -= dt; amb.rise -= dt;
      if (amb.rise <= 0) { amb.rise = 0.08; rise(); }
      if (amb.smoke <= 0) { amb.smoke = 0.35; smoke(Math.random() < 0.5); }
      if (amb.ember <= 0) { amb.ember = 0.25 + Math.random() * 0.4; ember(); }
      if (amb.bubble <= 0) { amb.bubble = 0.25 + Math.random() * 0.35; bubble(); }
    }
    atmosphere.update(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  // E2E・確認用
  window.dkazan = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    steer: (t) => { input.target = t; },
    jump: () => { input.jump = true; },
    // 描かずに、みんな CPU で sec 秒すすめる(自分も CPU)
    advance: (sec) => {
      const me = game.meCpu || (game.meCpu = createCpu('normal', 1, 0));
      for (let i = 0; i < sec / STEP && game.state.phase !== 'finished'; i++) {
        onEvents(step(game.state, game.players.map((p, slot) => cpuInput(slot ? game.cpus[slot] : me, game.state, slot))));
      }
    },
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
      $('stickV').hidden = true;
    },
    get intro() { return intro; },
  };
}
