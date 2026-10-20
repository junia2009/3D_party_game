// 雪山の 雪合戦 の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
//
// 動かし方: 画面の どこでも 指を おいて ずらすと 走る(どこでもスティック)。少しだけ ずらすと その場で 向きを かえる。
// 右下の ボタンで 向いている 向きへ なげる。パソコンは 矢印 / WASD と スペース。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonMaterial } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { RULES, STEP, createGame, onIce, ranking, step, timeLeft } from './rules.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { TEAM_COLORS, buildIce, buildStage, buildWall } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);
const HELPER_NAMES = { risu: 'リス', harinezumi: 'ハリネズミ', komadori: 'コマドリ' };
const BALL_Y = 0.9; // 雪玉の とぶ 高さ

export async function createYuki({ renderer, settings, getAudio, onExit }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 700);
  const atmosphere = createAtmosphere(scene, renderer, camera, { course: false });
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
    throw() { noise({ len: 0.18, gain: 0.08, freq: [2200, 700], q: 1.5 }); },
    hit() { noise({ len: 0.22, gain: 0.2, freq: [1600, 300], type: 'lowpass', attack: 0.003 }); voice({ pts: [[0, 660], [0.12, 330]], len: 0.14, gain: 0.05 }); },
    wall() { noise({ len: 0.15, gain: 0.12, freq: [1000, 300], type: 'lowpass', attack: 0.003 }); },
    crumble() { noise({ len: 0.5, gain: 0.2, freq: [800, 120], type: 'lowpass' }); },
    make() { voice({ type: 'triangle', pts: [[0, 520], [0.06, 700]], len: 0.08, gain: 0.04 }); },
    gold() { [0, 0.07, 0.14].forEach((at, i) => voice({ pts: [[0, 988 + i * 260]], len: 0.1, gain: 0.05, at })); },
    out() { voice({ type: 'square', pts: [[0, 523], [0.3, 196]], len: 0.35, gain: 0.05 }); },
    slip() { voice({ pts: [[0, 900], [0.2, 500]], len: 0.22, gain: 0.03 }); },
    fanfare() {
      [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1047]].forEach(([at, f]) => voice({ type: 'square', pts: [[0, f]], len: 0.12, gain: 0.05, at }));
      voice({ type: 'square', pts: [[0, 1047]], len: 0.6, gain: 0.05, at: 0.5, vib: 12, vibRate: 7 });
    },
  };

  await preload([...CHARACTERS.map((c) => c.key), 'risu', 'harinezumi', 'komadori']);

  // ── 雪の かべ・こおり(state から 作る) ───────────────────
  const fieldGroup = new THREE.Group();
  scene.add(fieldGroup);
  let walls = new Map();

  // ── 雪玉・金の 雪玉 ──────────────────────────────────
  const ballGeo = new THREE.SphereGeometry(RULES.ballR * 1.2, 10, 8);
  const ballMat = toonMaterial(0xffffff);
  const goldMat = new THREE.MeshBasicMaterial({ color: 0xffd23c });
  const balls = new Map();
  const golds = new Map();
  function syncBalls(s) {
    for (const b of s.balls) {
      if (balls.has(b.id)) continue;
      const m = new THREE.Mesh(ballGeo, b.gold ? goldMat : ballMat);
      m.castShadow = true;
      scene.add(m);
      balls.set(b.id, m);
    }
    for (const [id, m] of balls) {
      const b = s.balls.find((x) => x.id === id);
      if (!b) { scene.remove(m); balls.delete(id); continue; }
      // 少し 山なりに とぶ
      const k = 1 - b.left / RULES.ballRange;
      m.position.set(b.x, BALL_Y + Math.sin(Math.min(1, k * 1.3) * Math.PI) * 0.25, b.z);
      if (b.gold && Math.random() < 0.5) sparkle(b.x, m.position.y, b.z, 1);
    }
  }
  function syncGolds(s) {
    for (const g of s.golds) {
      if (golds.has(g.id)) continue;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), goldMat);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 6, 24), new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.8 }));
      m.add(halo);
      m.position.set(g.x, 0.25, g.z);
      scene.add(m);
      golds.set(g.id, m);
    }
    for (const [id, m] of golds) {
      const g = s.golds.find((x) => x.id === id);
      if (!g) { scene.remove(m); golds.delete(id); continue; }
      m.position.y = 0.3 + Math.sin(time * 4 + id) * 0.08;
      m.children[0].rotation.set(time * 2, time * 3, 0);
      m.visible = g.until - s.t > 2 || Math.floor(time * 8) % 2 === 0;
      if (Math.random() < 0.08) sparkle(g.x, 0.5, g.z, 1);
    }
  }

  // ── こなゆき・きらきら・ふる 雪・紙ふぶき ──────────────────
  const fx = [];
  const puffGeo = new THREE.IcosahedronGeometry(0.1, 1);
  function burst(x, y, z, n = 8, color = 0xffffff, sp = 2.2) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.set(x, y, z);
      m.scale.setScalar(0.6 + Math.random() * 0.8);
      scene.add(m);
      const a = Math.random() * Math.PI * 2;
      fx.push({ obj: m, t: 0, life: 0.6, vel: new THREE.Vector3(Math.cos(a) * sp * Math.random(), 1 + Math.random() * 2.5, Math.sin(a) * sp * Math.random()), kind: 'chunk' });
    }
  }
  function sparkle(x, y, z, n = 3) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true }));
      m.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 0.5, vel: new THREE.Vector3(0, 0.6, 0), kind: 'spark' });
    }
  }
  // えんとつの けむり
  const smokeTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  function smoke(at) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xb8c0cc, transparent: true, opacity: 0, depthWrite: false }));
    m.position.copy(at);
    m.scale.setScalar(0.4);
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 3.5, vel: new THREE.Vector3(0.25, 0.7, 0), kind: 'smoke' });
  }
  const confettiGeo = new THREE.PlaneGeometry(0.12, 0.07);
  function confetti(x, z) {
    const colors = [...PLAYER_COLORS.map((c) => c.hex), 0xffd24a, 0xffffff];
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true }));
      m.position.set(x + (Math.random() - 0.5) * 5, 4 + Math.random() * 2.5, z + (Math.random() - 0.5) * 3);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 3 + Math.random() * 1.5, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, -(0.7 + Math.random() * 0.6), (Math.random() - 0.5) * 0.6), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), kind: 'confetti' });
    }
  }
  // ちらちら ふる 雪(ずっと)
  const flakes = (() => {
    const n = 500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 30; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = (Math.random() - 0.5) * 24; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.9 }));
    scene.add(p);
    return p;
  })();
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = f.t / f.life;
      f.obj.position.addScaledVector(f.vel, dt);
      if (f.kind === 'smoke') {
        f.obj.scale.setScalar(0.4 + k * 1.8);
        f.obj.material.opacity = 0.7 * Math.sin(Math.min(1, k) * Math.PI);
      } else if (f.kind === 'chunk') {
        f.vel.y -= 9 * dt;
        if (f.obj.position.y < 0.05) { f.obj.position.y = 0.05; f.vel.set(0, 0, 0); }
        f.obj.material.opacity = Math.min(1, (1 - k) * 3);
      } else if (f.kind === 'spark') {
        f.obj.material.opacity = 1 - k;
        f.obj.rotation.y += dt * 6;
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
    const pos = flakes.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - dt * (0.6 + (i % 5) * 0.12);
      if (y < 0) y += 14;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(time * 0.8 + i) * dt * 0.15);
    }
    pos.needsUpdate = true;
  }

  // 雪だるま(雪玉を 3回 当てられた子)。首に チームの 色の マフラー
  function snowman(color) {
    const g = new THREE.Group();
    const white = toonMaterial(0xffffff);
    const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), white);
    b1.position.y = 0.4;
    const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), white);
    b2.position.y = 0.98;
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.06, 6, 16).rotateX(Math.PI / 2), toonMaterial(color));
    scarf.position.y = 0.78;
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.22, 10), toonMaterial(0x6a8aa8));
    bucket.position.y = 1.32;
    bucket.rotation.z = 0.2;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 6).rotateX(Math.PI / 2), toonMaterial(0xff8a3d));
    nose.position.set(0, 0.98, 0.32);
    const black = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), black);
      e.position.set(sx * 0.1, 1.06, 0.27);
      g.add(e);
    }
    g.add(b1, b2, scarf, bucket, nose);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // ── ゲームの進行 ────────────────────────────────────
  let mode = 'idle';
  let picked = CHARACTERS[0].key;
  let tour = null;
  let game = null;
  let intro = 1;
  const INTRO_TIME = 2.4;
  const input = { touch: null, stick: null, keys: new Set(), throw: false, target: null };

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS });
    if (game) for (const u of game.units) scene.remove(u.holder);
    for (const f of fx.splice(0)) scene.remove(f.obj);
    for (const m of balls.values()) scene.remove(m);
    balls.clear();
    for (const m of golds.values()) scene.remove(m);
    golds.clear();
    const state = createGame(players, seed);
    fieldGroup.clear();
    walls = new Map(state.walls.map((w) => {
      const v = buildWall(w);
      fieldGroup.add(v.group);
      return [w.id, { ...v, w, fall: 0 }];
    }));
    for (const c of state.ice) fieldGroup.add(buildIce(c));
    const units = await Promise.all(state.units.map(async (su) => {
      const helper = su.slot < 0;
      const key = helper ? su.kind : players[su.slot].character;
      const model = await createModel(key);
      if (!helper) model.setPlayerColor(PLAYER_COLORS[su.slot].hex);
      model.setFace('normal');
      model.play('idle');
      const holder = new THREE.Group();
      holder.add(model.root);
      // 足もとに チームの 色の わ
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.46, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[su.side], transparent: true, opacity: 0.85 }));
      ring.position.y = 0.02;
      holder.add(ring);
      // 手に もった 雪玉(のこりの 数を 頭の上に)
      const pips = new THREE.Group();
      for (let k = 0; k < RULES.ammoMax; k++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), ballMat);
        p.position.set((k - 1) * 0.18, 0, 0);
        pips.add(p);
      }
      holder.add(pips);
      scene.add(holder);
      const def = helper ? null : CHARACTERS.find((c) => c.key === key);
      // 雪玉を つくっている ときに 手もとで まるくなる 雪
      const makeBall = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), ballMat);
      makeBall.position.set(0, 0.18, 0.42);
      makeBall.visible = false;
      holder.add(makeBall);
      return { model, holder, ring, pips, makeBall, size: def?.size || 1, snow: null, flash: 0, throwT: 0, splats: [], arms: [model.node('arm_L'), model.node('arm_R')] };
    }));
    const me = units[state.units.findIndex((u) => u.slot === 0)];
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.36, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    me.holder.add(marker);
    me.marker = marker;
    // 自分の 向きの 矢じるし(どこへ とぶか わかるように)
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 3).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex, transparent: true, opacity: 0.85 }));
    arrow.position.set(0, 0.05, 0.75);
    me.holder.add(arrow);
    me.arrow = arrow;
    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), units, acc: 0, endTimer: null, shake: 0, meIdx: state.units.findIndex((u) => u.slot === 0) };
    atmosphere.apply(params.get('time') || state.timeOfDay);
    atmosphere.setupShadows([...units.map((u) => u.holder), fieldGroup], [stage.group, fieldGroup]);
    Object.assign(input, { touch: null, stick: null, throw: false, target: null });
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoY').classList.add('show');
    if (!fromSky) splash('よーい…');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudY').hidden = m !== 'playing';
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
  $('pauseBtnY').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: どこでもスティック + なげるボタン ───────────────
  const STICK_R = 56;
  const FULL = 30, DEAD = 3;
  const stickEl = $('stickY'), knobEl = stickEl.firstElementChild;
  const throwEl = $('throwY');
  const playing = () => mode === 'playing' && !paused;
  throwEl.addEventListener('pointerdown', (e) => {
    if (!playing()) return;
    e.preventDefault();
    e.stopPropagation();
    unlockAudio();
    input.throw = true;
    throwEl.classList.add('down');
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) throwEl.addEventListener(ev, () => throwEl.classList.remove('down'));
  window.addEventListener('pointerdown', (e) => {
    if (!playing() || input.touch !== null || e.target.closest('button, a')) return;
    unlockAudio();
    input.touch = e.pointerId;
    input.stick = { ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    stickEl.style.left = `${e.clientX}px`;
    stickEl.style.top = `${e.clientY}px`;
    knobEl.style.transform = 'translate(-50%, -50%)';
    stickEl.hidden = false;
    $('howtoY').classList.remove('show');
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
    stickEl.classList.toggle('turn', k > 0.08 && k < RULES.turnOnly);
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
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); unlockAudio(); input.throw = true; return; }
    if (KEYS[e.code]) {
      e.preventDefault();
      unlockAudio();
      input.keys.add(e.code);
      $('howtoY').classList.remove('show');
    }
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.touch = null; input.stick = null; stickEl.hidden = true; });

  function myInput() {
    const thr = input.throw;
    input.throw = false;
    if (input.target) return { ...input.target, throw: input.target.throw ?? thr };
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
    return { x: sx, z: sy, throw: thr };
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashY');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildChips() {
    const s = game.state;
    for (const side of ['L', 'R']) {
      $(`team${side}Y`).replaceChildren(...s.teams[side].map((i) => {
        const u = s.units[i];
        const d = document.createElement('div');
        d.className = 'chip' + (u.slot === 0 ? ' me' : '') + (u.slot < 0 ? ' helper' : '');
        d.style.setProperty('--c', css(u.slot < 0 ? 0xb8a890 : PLAYER_COLORS[u.slot].hex));
        d.innerHTML = (u.slot < 0 ? `<b>${HELPER_NAMES[u.kind]}</b>` : '<i></i>') + '<span class="hp"></span>';
        return d;
      }));
    }
    $('hudY').dataset.side = s.units[game.meIdx].side;
  }
  function renderHud() {
    const s = game.state;
    for (const side of ['L', 'R']) {
      [...$(`team${side}Y`).children].forEach((c, k) => {
        const u = s.units[s.teams[side][k]];
        c.classList.toggle('out', !u.alive);
        c.querySelector('.hp').textContent = '●'.repeat(Math.max(0, u.hp)) + '○'.repeat(Math.max(0, RULES.hp - Math.max(0, u.hp)));
      });
    }
    $('timeY').textContent = s.phase === 'play' ? String(Math.ceil(timeLeft(s))) : '';
    const me = s.units[game.meIdx];
    $('throwY').hidden = s.phase === 'finished' || !me.alive;
    $('ammoY').hidden = $('throwY').hidden;
    $('ammoY').innerHTML = Array.from({ length: RULES.ammoMax }, (_, k) => `<i class="${k < me.ammo ? (me.gold && k === me.ammo - 1 ? 'on gold' : 'on') : ''}"></i>`).join('');
    $('throwY').classList.toggle('empty', me.ammo <= 0);
    $('ammoY').classList.toggle('making', me.make > 0);
    $('ammoY').style.setProperty('--m', (me.make / RULES.makeTime).toFixed(3));
  }
  const tmpV = new THREE.Vector3();
  function pop(text, x, y, z, cls = '', life = 800) {
    tmpV.set(x, y, z).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsY').append(el);
    setTimeout(() => el.remove(), life);
  }

  // ── できごと ────────────────────────────────────────
  function onEvents(events) {
    const s = game.state;
    const mySide = s.units[game.meIdx].side;
    for (const e of events) {
      switch (e.type) {
        case 'start':
          splash('はじめ!');
          setTimeout(() => $('howtoY').classList.remove('show'), 7000);
          break;
        case 'throw':
          game.units[e.who].throwT = 1;
          if (e.who === game.meIdx || s.units[e.who].side === mySide) sfx.throw();
          break;
        case 'hit': {
          const u = game.units[e.who];
          u.flash = 1;
          // 体に 雪が べちゃっと つく(4こまで)
          if (u.splats.length < 4) {
            const sp = new THREE.Mesh(new THREE.SphereGeometry(0.13 + Math.random() * 0.06, 8, 6), e.gold ? goldMat : ballMat);
            const a = Math.random() * Math.PI * 2;
            sp.position.set(Math.cos(a) * 0.3 * u.size, (0.5 + Math.random() * 0.7) * u.size, Math.sin(a) * 0.3 * u.size);
            sp.scale.set(1, 0.7, 0.55);
            sp.lookAt(0, sp.position.y, 0);
            u.model.root.add(sp);
            u.splats.push(sp);
          }
          burst(e.x, BALL_Y, e.z, e.gold ? 14 : 9, e.gold ? 0xffe07a : 0xffffff);
          pop(e.gold ? 'ドカッ!' : 'ぺしゃ!', e.x, 2.0, e.z, e.who === game.meIdx ? 'red' : e.by === game.meIdx ? 'gold' : 'me');
          sfx.hit();
          if (e.who === game.meIdx) game.shake = 0.25;
          break;
        }
        case 'out': {
          const u = game.units[e.who];
          u.snow = { t: 0 };
          const sm = snowman(TEAM_COLORS[s.units[e.who].side]);
          sm.scale.setScalar(0.01);
          u.holder.add(sm);
          u.snowman = sm;
          pop('ゆきだるま!', s.units[e.who].x, 2.4, s.units[e.who].z, 'out', 1100);
          sfx.out();
          if (e.who === game.meIdx) splash('ゆきだるまに なっちゃった…', 'red small');
          break;
        }
        case 'wallHit': {
          burst(e.x, BALL_Y, e.z, 5);
          sfx.wall();
          const v = walls.get(e.id);
          if (v) v.shake = 0.25;
          // ブロックを ひとつずつ へらす
          if (v && e.hp > 0) { const b = v.blocks.filter((x) => x.visible).pop(); if (b) { b.visible = false; burst(v.w.x + b.position.x, b.position.y, v.w.z + b.position.z, 6); } }
          break;
        }
        case 'wallBreak': {
          const v = walls.get(e.id);
          if (v) {
            v.fall = 0.001;
            burst(v.w.x, 0.5, v.w.z, 18, 0xffffff, 3);
            // 雪けむり
            for (let k = 0; k < 6; k++) {
              const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
              m.position.set(v.w.x + (Math.random() - 0.5) * 0.6, 0.3, v.w.z + (Math.random() - 0.5) * 1.2);
              m.scale.setScalar(0.4);
              scene.add(m);
              fx.push({ obj: m, t: 0, life: 1.2, vel: new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.8, (Math.random() - 0.5) * 1.2), kind: 'smoke' });
            }
          }
          sfx.crumble();
          break;
        }
        case 'miss':
          burst(e.x, 0.1, e.z, 4);
          break;
        case 'make':
          if (e.who === game.meIdx) sfx.make();
          break;
        case 'gold':
          break;
        case 'pick':
          pop('金の 雪玉!', s.units[e.who].x, 2.2, s.units[e.who].z, 'gold');
          if (e.who === game.meIdx) sfx.gold();
          break;
        case 'finished': {
          game.endTimer = 4.5;
          const win = e.winner === mySide;
          splash(e.timeUp ? (win ? 'じかんぎれ! かち!' : 'じかんぎれ… まけ') : win ? 'かった!' : 'まけた…', win ? 'gold' : 'red');
          if (win) sfx.fanfare();
          confetti(e.winner === 'L' ? -3 : 3, 0);
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
    const mySide = s.units[game.meIdx].side;
    $('resultTitle').textContent = mySide === s.winner ? 'あなたの チームの勝ち!' : 'あいての チームの勝ち!';
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = game.players[slot];
      const u = s.units.find((x) => x.slot === slot);
      const li = document.createElement('li');
      if (slot === 0) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : 'あなた';
      const def = CHARACTERS.find((c) => c.key === p.character);
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}・${u.side === s.winner ? 'かち' : 'まけ'}</small></span><span class="dist">${u.hits}<small>あてた</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateWorld(dt) {
    const s = game.state;
    for (const [i, u] of game.units.entries()) {
      const su = s.units[i];
      u.flash = Math.max(0, u.flash - dt * 3);
      u.throwT = Math.max(0, u.throwT - dt * 4);
      let clip = 'idle', face = 'normal';
      u.holder.position.set(su.x, 0, su.z);
      if (u.snow) {
        // 雪だるまに なる: 雪が もりあがって つつむ
        u.snow.t += dt;
        const k = Math.min(1, u.snow.t / 0.5);
        u.snowman.scale.setScalar(k * (1 + Math.sin(k * Math.PI) * 0.2));
        u.model.root.visible = u.snow.t < 0.35;
        u.makeBall.visible = false;
        u.ring.visible = false;
        u.pips.visible = false;
        if (u.arrow) u.arrow.visible = false;
        u.holder.rotation.y = 0;
        continue;
      }
      const moving = Math.hypot(su.vx, su.vz) > 0.5;
      const ice = onIce(s, su.x, su.z);
      clip = su.stun > 0 ? 'dizzy' : moving ? 'run' : 'idle';
      if (su.stun > 0) face = 'surprised';
      if (s.phase === 'finished') { clip = su.side === s.winner ? 'cheer' : 'idle'; face = su.side === s.winner ? 'happy' : 'frustrated'; }
      u.holder.rotation.y = su.face;
      const sliding = ice && moving;
      const making = su.make > 0 && s.phase === 'play';
      if (sliding) face = 'surprised';
      // こおりの 上で すべっている ときは、体を かたむけて ゆらゆら
      u.model.root.rotation.z = sliding ? Math.sin(time * 9 + i) * 0.18 : 0;
      // なげた しゅんかん: ぐっと 前へ。雪玉を つくる ときは しゃがむ
      u.model.root.rotation.x = u.throwT * 0.45 + (making ? 0.45 : 0);
      u.model.play(making ? 'idle' : clip, { timeScale: clip === 'run' ? 1.3 : 1 });
      u.model.setFace(face);
      u.model.update(dt);
      // 腕: なげる(うしろから 前へ ふりぬく)/ すべる(両手を ひろげる)/ つくる(手を 前へ)
      const [aL, aR] = u.arms;
      if (aR && u.throwT > 0) {
        const k = 1 - u.throwT; // 0 → 1
        aR.rotation.x = k < 0.25 ? -2.8 : -2.8 + ((k - 0.25) / 0.75) * 3.6;
      } else if (sliding) {
        if (aL) aL.rotation.z = 1.3;
        if (aR) aR.rotation.z = -1.3;
      } else if (making) {
        for (const a of [aL, aR]) if (a) a.rotation.x = -1.1 + Math.sin(time * 14) * 0.25;
      }
      u.makeBall.visible = making;
      if (making) u.makeBall.scale.setScalar(0.3 + (su.make / RULES.makeTime) * 0.7);
      // 当たったら ぎゅっと ちぢむ。しゃがむと 低く
      const sq = u.flash * 0.15 + (making ? 0.12 : 0);
      u.model.root.scale.set(1 + sq, 1 - sq, 1 + sq);
      // 頭の上の 雪玉の 数
      u.pips.position.set(0, 1.85 * u.size, 0);
      u.pips.rotation.y = -su.face;
      u.pips.children.forEach((p, k) => {
        p.visible = k < su.ammo;
        p.material = su.gold && k === su.ammo - 1 ? goldMat : ballMat;
      });
      if (u.marker) {
        u.marker.position.set(0, 2.25 * u.size + 0.1 * Math.sin(performance.now() / 180), 0);
        u.pips.position.y = 1.75 * u.size;
      }
      if (u.arrow) u.arrow.material.opacity = su.ammo > 0 ? 0.9 : 0.3;
    }
    // かべ: ゆれる・くずれる
    for (const v of walls.values()) {
      if (v.shake > 0) { v.shake -= dt; v.group.position.x = v.w.x + Math.sin(time * 60) * 0.04; } else v.group.position.x = v.w.x;
      if (v.fall > 0) {
        v.fall += dt;
        const k = Math.min(1, v.fall / 0.6);
        v.group.scale.set(1 + k * 0.4, Math.max(0.01, 1 - k), 1 + k * 0.4);
        if (k >= 1) v.group.visible = false;
      }
    }
    syncBalls(s);
    syncGolds(s);
    // 旗が ゆれる
    stage.flags.forEach((f, k) => { f.rotation.y = Math.sin(time * 3 + k) * 0.3; });
  }

  let freeCamera = false;
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const pos = portrait ? new THREE.Vector3(0, 21, 10.5) : new THREE.Vector3(0, 10.5, 9.0);
    const look = new THREE.Vector3(0, 0, portrait ? 0.9 : 0.4);
    camera.fov = portrait ? 52 : 45;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(4, 16, -26);
      camera.position.lerpVectors(sky, pos, e);
      camera.userData.look = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 6, -60), look, Math.min(1, e * 1.1));
      camera.lookAt(camera.userData.look);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 4);
    camera.position.lerp(pos, k);
    camera.userData.look = camera.userData.look ? camera.userData.look.lerp(look, k) : look.clone();
    if (game?.shake > 0) {
      game.shake = Math.max(0, game.shake - dt);
      camera.position.x += (Math.random() - 0.5) * game.shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * game.shake * 0.5;
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
  let smokeT = 0;
  function frame(rawDt) {
    const dt = Math.min(rawDt, 0.1);
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
      smokeT -= dt;
      if (smokeT <= 0) { smokeT = 0.45; for (const c of stage.chimneys) smoke(c); }
      // ろうそく・まどの あかりが ゆらゆら
      stage.glows.forEach((g, i) => { g.material.opacity = (i < 2 ? 0.9 : 0.55) + Math.sin(time * 7 + i * 2) * 0.08 + Math.sin(time * 13 + i) * 0.05; });
    }
    atmosphere.update(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  // E2E・確認用
  window.dyuki = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    steer: (t) => { input.target = t; },
    throw: () => { input.throw = true; },
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
      $('stickY').hidden = true;
    },
    get intro() { return intro; },
  };
}
