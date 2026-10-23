// 森の谷まの かみひこうき の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
//
// 動かし方: スマホを かたむける(左右で まがる・むこうへ たおすと 下がる・てまえへ おこすと 上がる)。
// はじめる ときの もちかたが「まっすぐ」。センサーが つかえない ときは、画面の どこでも 指を おいて ずらす(上へ ずらすと 上がる)。
// パソコンは 矢印 / WASD。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonMaterial } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { RULES, STEP, createGame, ranking, step, timeLeft } from './rules.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { buildCourse, buildStage, pathAt, toWorld } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 紙ひこうき(よこ はば 1.8 m)。白い 紙に 色の ふち
function paperPlane(color) {
  const g = new THREE.Group();
  const paper = new THREE.MeshToonMaterial({ color: 0xfbf8f0, side: THREE.DoubleSide });
  const edge = new THREE.MeshToonMaterial({ color, side: THREE.DoubleSide });
  const tri = (pts, mat) => {
    const geo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...p)));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
  };
  // はなさき(+z が 前)・つばさ・まん中の おりめ(下へ)
  g.add(tri([[0, 0, 1.3], [-0.95, 0.12, -0.9], [0, 0, -0.9]], paper));
  g.add(tri([[0, 0, 1.3], [0, 0, -0.9], [0.95, 0.12, -0.9]], paper));
  g.add(tri([[0, 0, 1.3], [0, 0, -0.9], [0, -0.32, -0.75]], paper));
  // つばさの ふち(色の すじ)
  g.add(tri([[-0.95, 0.125, -0.9], [-0.8, 0.12, -0.6], [-0.62, 0.11, -0.9]], edge));
  g.add(tri([[0.95, 0.125, -0.9], [0.8, 0.12, -0.6], [0.62, 0.11, -0.9]], edge));
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export async function createHikouki({ renderer, settings, getAudio, onExit }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);
  const atmosphere = createAtmosphere(scene, renderer, camera, { course: false });
  const stage = buildStage(scene);
  let course = null;

  // ── 音 ──────────────────────────────────────────
  let audio = null;
  const unlockAudio = () => { audio = settings.sound ? getAudio() : null; };
  function voice({ type = 'sine', pts, len, gain = 0.1, at = 0 }) {
    if (!audio || gain <= 0) return;
    const t = audio.currentTime + at;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(pts[0][1], t);
    for (const [dt, f] of pts.slice(1)) o.frequency.exponentialRampToValueAtTime(f, t + dt);
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
    ring(n) { voice({ type: 'triangle', pts: [[0, 660 + n * 40]], len: 0.12, gain: 0.07 }); voice({ type: 'triangle', pts: [[0, 990 + n * 60]], len: 0.15, gain: 0.05, at: 0.06 }); },
    gold() { [0, 0.06, 0.12, 0.18].forEach((at, i) => voice({ type: 'triangle', pts: [[0, 880 * 2 ** (i / 4)]], len: 0.14, gain: 0.06, at })); },
    hit() { noise({ len: 0.3, gain: 0.18, freq: [900, 200], type: 'lowpass', attack: 0.003 }); voice({ pts: [[0, 600], [0.4, 180]], len: 0.45, gain: 0.05 }); },
    splash() { noise({ len: 0.5, gain: 0.14, freq: [2400, 400], q: 0.6 }); },
    lift() { noise({ len: 1.2, gain: 0.06, freq: [300, 1400], q: 0.7, attack: 0.3 }); },
    wind() { noise({ len: 1.8, gain: 0.08, freq: [250, 900], q: 0.8, attack: 0.5 }); },
    goal() { [[0, 523], [0.1, 659], [0.2, 784], [0.3, 1047]].forEach(([at, f]) => voice({ type: 'square', pts: [[0, f]], len: 0.12, gain: 0.05, at })); },
    fanfare() { [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1047], [0.5, 1047]].forEach(([at, f], i) => voice({ type: 'square', pts: [[0, f]], len: i === 4 ? 0.6 : 0.12, gain: 0.05, at })); },
  };

  await preload(CHARACTERS.map((c) => c.key));

  // ── 演出: きらきら・水しぶき・葉っぱ・紙ふぶき ─────────────────
  const fx = [];
  function sparkle(at, n = 8, color = 0xfff2a0, sp = 2) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.copy(at);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 0.6, vel: new THREE.Vector3((Math.random() - 0.5) * sp * 2, (Math.random() - 0.3) * sp * 2, (Math.random() - 0.5) * sp * 2), kind: 'spark' });
    }
  }
  function splashAt(at) {
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xe0f6ff, transparent: true }));
      m.position.copy(at);
      scene.add(m);
      const a = Math.random() * 6.28;
      fx.push({ obj: m, t: 0, life: 0.7, vel: new THREE.Vector3(Math.cos(a) * 2, 3 + Math.random() * 3, Math.sin(a) * 2), kind: 'drop' });
    }
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = f.t / f.life;
      f.obj.position.addScaledVector(f.vel, dt);
      if (f.kind === 'drop') f.vel.y -= 12 * dt;
      if (f.kind === 'bit') { f.vel.multiplyScalar(1 - dt * 1.5); f.vel.y -= 1.5 * dt; f.obj.rotation.x += f.spin * dt; f.obj.rotation.z += f.spin * dt * 0.7; }
      f.obj.material.opacity = 1 - k;
      f.obj.rotation.y += dt * 5;
      if (k >= 1) { scene.remove(f.obj); f.obj.material.dispose(); fx.splice(i, 1); }
    }
  }
  // 飛行機雲: つばさの 先から 2本の 帯(自分の 色が まざった 白)
  const TRAIL = 28;
  function makeTrail(color) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(TRAIL * 2 * 3), alpha = new Float32Array(TRAIL * 2);
    const idx = [];
    for (let k = 0; k < TRAIL - 1; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    for (let k = 0; k < TRAIL; k++) alpha[k * 2] = alpha[k * 2 + 1] = 1 - k / (TRAIL - 1);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55) }, k: { value: 1 } },
      vertexShader: 'attribute float alpha; varying float va; void main(){ va = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 color; uniform float k; varying float va; void main(){ gl_FragColor = vec4(color, va * va * 0.75 * k); }',
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    scene.add(m);
    return { m, pts: [], filled: false };
  }
  const tipL = new THREE.Vector3(), tipR = new THREE.Vector3(), up = new THREE.Vector3();
  function pushTrail(tr, a, b) {
    // とびすぎた(ワープ・はじめ)ときは ひきなおす
    if (tr.pts.length && tr.pts[0][0].distanceTo(a) > 3) tr.pts.length = 0;
    tr.pts.unshift([a.clone(), b.clone()]);
    if (tr.pts.length > TRAIL) tr.pts.length = TRAIL;
    const pos = tr.m.geometry.attributes.position;
    for (let k = 0; k < TRAIL; k++) {
      const p = tr.pts[Math.min(k, tr.pts.length - 1)];
      pos.setXYZ(k * 2, p[0].x, p[0].y, p[0].z);
      pos.setXYZ(k * 2 + 1, p[1].x, p[1].y, p[1].z);
    }
    pos.needsUpdate = true;
  }
  // くるくるの 星(ぶつかった あと 頭の 上)
  function dizzyStars() {
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: 0xffe07a }));
      st.position.set(Math.cos((k / 3) * 6.28) * 0.28, 0, Math.sin((k / 3) * 6.28) * 0.28);
      g.add(st);
    }
    g.visible = false;
    return g;
  }
  // 羽・葉っぱが ちる
  function burstBits(at, color, n = 14) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide }));
      m.position.copy(at);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 1.1, vel: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 2.5, (Math.random() - 0.5) * 4), kind: 'bit', spin: Math.random() * 10 });
    }
  }
  // 上昇気流の 中: まわりで 葉っぱが まいあがる
  function liftLeaf(at) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.09), new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0xbaff8a : 0xfff2a0, transparent: true, side: THREE.DoubleSide }));
    const a = Math.random() * 6.28;
    m.position.copy(at).add(new THREE.Vector3(Math.cos(a) * 1.4, -1.2, Math.sin(a) * 1.4));
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 1.0, vel: new THREE.Vector3(-Math.sin(a) * 1.5, 5, Math.cos(a) * 1.5), kind: 'bit', spin: 8 });
  }
  // 風の すじ(自分の まわり)
  const streaks = [];
  for (let k = 0; k < 24; k++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    scene.add(m);
    streaks.push({ m, x: (Math.random() - 0.5) * 16, y: Math.random() * 10 - 3, d: Math.random() * 14 });
  }

  // ── ゲームの進行 ────────────────────────────────────
  let mode = 'idle';
  let picked = CHARACTERS[0].key;
  let tour = null;
  let game = null;
  let intro = 1;
  const INTRO_TIME = 2.4;
  const input = { touch: null, stick: null, keys: new Set(), target: null, tilt: null, useTilt: false, zero: null };

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS });
    if (game) for (const u of game.units) { scene.remove(u.holder); for (const t of u.trails) scene.remove(t.m); }
    for (const f of fx.splice(0)) scene.remove(f.obj);
    course?.dispose();
    const state = createGame(players, seed);
    course = buildCourse(scene, state);
    const units = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('happy');
      model.play('idle');
      const holder = new THREE.Group();
      const plane = paperPlane(PLAYER_COLORS[slot].hex);
      plane.scale.setScalar(1.25);
      holder.add(plane);
      // 紙ひこうきの せなかに ちょこんと のる
      const def = CHARACTERS.find((c) => c.key === p.character);
      model.root.scale.setScalar(0.42 / (def?.size || 1));
      model.root.position.set(0, 0.12, -0.15);
      plane.add(model.root);
      scene.add(holder);
      const stars = dizzyStars();
      plane.add(stars);
      return { model, holder, plane, spin: 0, wob: 0, stars, trails: [makeTrail(PLAYER_COLORS[slot].hex), makeTrail(PLAYER_COLORS[slot].hex)], arms: [model.node('arm_L'), model.node('arm_R')], trailT: 0 };
    }));
    // 自分の 目じるし
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.32, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    units[0].holder.add(marker);
    units[0].marker = marker;
    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), units, acc: 0, endTimer: null, shake: 0, combo: 0, camRoll: 0 };
    atmosphere.apply(params.get('time') || 'morning');
    atmosphere.setupShadows(units.map((u) => u.holder), [stage.group]);
    Object.assign(input, { touch: null, stick: null, target: null });
    input.zero = null; // はじめの もちかたを「まっすぐ」に しなおす
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoA').classList.add('show');
    $('tiltA').hidden = !(tiltAvailable() && !input.useTilt && !input.asked);
    if (!fromSky) splash('よーい…');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudA').hidden = m !== 'playing';
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
  $('pauseBtnA').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => { setPaused(false); input.zero = null; }));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: かたむき(ジャイロ)/ どこでもスティック / キー ─────────────
  const tiltAvailable = () => typeof window.DeviceOrientationEvent !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  function onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    // 画面の 向きに あわせて「左右」「前後」を とりなおす
    const ang = (screen.orientation?.angle ?? window.orientation ?? 0) | 0;
    let lr, fb;
    if (ang === 90) { lr = e.beta; fb = -e.gamma; }
    else if (ang === -90 || ang === 270) { lr = -e.beta; fb = e.gamma; }
    else if (ang === 180) { lr = -e.gamma; fb = -e.beta; }
    else { lr = e.gamma; fb = e.beta; }
    input.tilt = { lr, fb };
    if (input.zero === null) input.zero = { fb };
  }
  async function enableTilt() {
    input.asked = true;
    try {
      // iPhone は ボタンを おした ときに 許可を もらう
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') throw new Error('denied');
      }
      window.addEventListener('deviceorientation', onOrient);
      input.useTilt = true;
      input.zero = null;
      $('tiltA').hidden = true;
      splash('かたむけて あそぶ!', 'small');
    } catch {
      input.useTilt = false;
      $('tiltA').hidden = true;
      splash('ゆびで あそぶよ', 'small');
    }
  }
  $('tiltOnA').addEventListener('click', (e) => { e.stopPropagation(); unlockAudio(); enableTilt(); });
  $('tiltOffA').addEventListener('click', (e) => { e.stopPropagation(); input.asked = true; $('tiltA').hidden = true; });
  $('recenterA').addEventListener('click', (e) => { e.stopPropagation(); input.zero = null; splash('まっすぐ に したよ', 'small'); });

  const STICK_R = 56;
  const FULL = 40, DEAD = 4;
  const stickEl = $('stickA'), knobEl = stickEl.firstElementChild;
  const playing = () => mode === 'playing' && !paused;
  window.addEventListener('pointerdown', (e) => {
    if (!playing() || input.touch !== null || e.target.closest('button, a, .tiltask')) return;
    unlockAudio();
    input.touch = e.pointerId;
    input.stick = { ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    stickEl.style.left = `${e.clientX}px`;
    stickEl.style.top = `${e.clientY}px`;
    knobEl.style.transform = 'translate(-50%, -50%)';
    stickEl.hidden = false;
    $('howtoA').classList.remove('show');
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
  const KEYS = { ArrowUp: [0, 1], KeyW: [0, 1], ArrowDown: [0, -1], KeyS: [0, -1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
  window.addEventListener('keydown', (e) => {
    if (mode !== 'playing') return;
    if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!paused); return; }
    if (KEYS[e.code]) { e.preventDefault(); unlockAudio(); input.keys.add(e.code); $('howtoA').classList.remove('show'); }
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.touch = null; input.stick = null; stickEl.hidden = true; });

  // いまの かたむき(-1..1)。y は「てまえへ おこす = 上がる」が +
  function myInput() {
    if (input.target) return input.target;
    if (input.keys.size) {
      let x = 0, y = 0;
      for (const k of input.keys) { x += KEYS[k][0]; y += KEYS[k][1]; }
      return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
    }
    if (input.stick) return { x: input.stick.dx, y: -input.stick.dy }; // 上へ ずらすと 上がる
    if (input.useTilt && input.tilt) {
      const dz = (v) => (Math.abs(v) < 0.08 ? 0 : (v - Math.sign(v) * 0.08) / 0.92);
      const x = dz(clamp(input.tilt.lr / 24, -1, 1));
      // てまえへ おこす(上の はしが 起きる)と beta が 大きく なる → 上がる
      const y = dz(clamp((input.tilt.fb - (input.zero?.fb ?? input.tilt.fb)) / 18, -1, 1));
      return { x, y };
    }
    return { x: 0, y: 0 };
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashA');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildChips() {
    $('chipsA').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'chip' + (slot === 0 ? ' me' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      d.innerHTML = '<i></i><b>0</b>';
      return d;
    }));
  }
  function renderHud() {
    const s = game.state;
    const order = ranking(s);
    [...$('chipsA').children].forEach((c, slot) => {
      c.querySelector('b').textContent = String(s.planes[slot].points);
      c.style.order = String(order.indexOf(slot));
      c.classList.toggle('lead', order[0] === slot && s.planes[slot].points > 0);
    });
    $('timeA').textContent = s.phase === 'play' ? String(Math.ceil(timeLeft(s))) : '';
    // のこりの きょり
    const me = s.planes[0];
    $('progA').style.setProperty('--k', String(clamp(me.s / RULES.length, 0, 1)));
    // かたむきの めやす(自分の 入力)
    const inp = game.lastInput || { x: 0, y: 0 };
    $('tiltDotA').style.transform = `translate(${inp.x * 22}px, ${-inp.y * 22}px)`;
    $('recenterA').hidden = !input.useTilt;
    // よこかぜの 合図
    const w = s.wind;
    const show = w.warn || w.x;
    $('windA').hidden = !show || s.phase !== 'play';
    if (show) {
      const dir = w.warn ? w.dir : Math.sign(w.x);
      $('windA').querySelector('b').textContent = dir > 0 ? '→→' : '←←';
      $('windA').classList.toggle('soon', !!w.warn);
    }
  }
  const tmpV = new THREE.Vector3();
  function pop(text, at, cls = '', life = 800) {
    tmpV.copy(at).project(camera);
    if (tmpV.z > 1) return;
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsA').append(el);
    setTimeout(() => el.remove(), life);
  }

  // ── できごと ────────────────────────────────────────
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'start':
          splash('とべ!');
          setTimeout(() => $('howtoA').classList.remove('show'), 6000);
          break;
        case 'ring': {
          const u = game.units[e.slot];
          if (e.slot !== 0) break;
          const r = course.rings[e.id];
          r.done = true;
          game.combo++;
          sparkle(r.m.position, e.gold ? 22 : 10, e.gold ? 0xffe07a : 0xd8ffb0, e.gold ? 3 : 2);
          pop(e.gold ? '+3 きん!' : e.center ? '+1 まんなか!' : '+1', r.m.position, e.gold ? 'gold' : 'me', 800);
          if (e.gold) sfx.gold(); else sfx.ring(Math.min(8, game.combo));
          if (game.combo >= 5 && game.combo % 5 === 0) splash(`${game.combo} れんぞく!`, 'gold small');
          void u;
          break;
        }
        case 'missRing':
          if (e.slot === 0) game.combo = 0;
          break;
        case 'hit': {
          const u = game.units[e.slot];
          u.spin = 1;
          burstBits(u.holder.position, e.what === 'bird' ? 0xf4f0e8 : 0x6ab84a, e.slot === 0 ? 18 : 8);
          if (e.slot === 0) {
            sfx.hit();
            game.shake = 0.35;
            game.combo = 0;
            pop(e.what === 'bird' ? 'とりに ぶつかった!' : 'えだに ぶつかった!', u.holder.position, 'red', 900);
          }
          break;
        }
        case 'splash': {
          const u = game.units[e.slot];
          splashAt(toWorld(e.s, e.x, 0.1, new THREE.Vector3()));
          if (e.slot === 0) { sfx.splash(); game.shake = 0.25; pop('ばしゃっ!', u.holder.position, 'red', 800); }
          break;
        }
        case 'lift':
          if (e.slot === 0) { sfx.lift(); pop('ふわっ!', game.units[0].holder.position, 'me', 700); }
          break;
        case 'windSoon':
          splash(e.dir > 0 ? 'かぜが くる! →' : '← かぜが くる!', 'small');
          break;
        case 'wind':
          sfx.wind();
          break;
        case 'goal':
          if (e.slot === 0) { sfx.goal(); splash(`ゴール! ${s.planes[0].points}てん`, 'gold'); }
          break;
        case 'finished': {
          game.endTimer = 3.5;
          const win = e.winner === 0;
          if (win) { sfx.fanfare(); splash('1い!', 'gold'); }
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
    $('resultTitle').textContent = order[0] === 0 ? 'あなたの 勝ち!' : `${CHARACTERS.find((c) => c.key === game.players[order[0]].character).name}の 勝ち!`;
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = game.players[slot];
      const pl = s.planes[slot];
      const li = document.createElement('li');
      if (slot === 0) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : 'あなた';
      const def = CHARACTERS.find((c) => c.key === p.character);
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}・わっか ${pl.rings}(きん ${pl.golds})</small></span><span class="dist">${pl.points}<small>てん</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  const q = new THREE.Quaternion(), e3 = new THREE.Euler();
  function updateWorld(dt) {
    const s = game.state;
    s.planes.forEach((p, slot) => {
      const u = game.units[slot];
      toWorld(p.s, p.x, p.y, u.holder.position);
      const pa = pathAt(p.s, {});
      u.spin = Math.max(0, u.spin - dt / RULES.stunTime);
      // 向き: コースの 向き + よこの うごき、かたむき(ロール)と 上下(ピッチ)
      const yaw = -pa.a + Math.PI + Math.atan2(-p.vx, p.v) * 0.6;
      const pitch = Math.atan2(p.vy, p.v);
      // ロール: 右へ まがる ときは 右の つばさを 下げる(機体の +x は 左の つばさ なので +回転で 左が 上がる)
      const roll = p.roll * 0.7 + u.spin * Math.PI * 4;
      e3.set(-pitch, yaw, roll, 'YXZ');
      u.holder.quaternion.setFromEuler(e3);
      // ゆらゆら(よこかぜの ときは ぶるぶる)
      const windy = Math.abs(s.wind.x) > 0 ? 1 : 0;
      u.plane.position.y = Math.sin(time * 2.4 + slot) * 0.06 + windy * Math.sin(time * 31 + slot) * 0.03;
      u.plane.rotation.z = windy * Math.sin(time * 23 + slot) * 0.05;
      const fast = p.v > RULES.speed + 1.6 && p.stun <= 0;
      u.model.setFace(u.spin > 0 || p.bump > 0 ? 'surprised' : fast ? 'happy' : 'normal');
      u.model.play(fast ? 'cheer' : 'idle');
      u.model.update(dt);
      // 急降下で ばんざい / ふだんは 紙の ふちを つかむ
      const [aL, aR] = u.arms;
      if (aL && aR && !fast) { aL.rotation.x = aR.rotation.x = -0.6; }
      // くるくるの 星
      u.stars.visible = u.spin > 0;
      if (u.spin > 0) { u.stars.position.set(0, 0.95, -0.15); u.stars.rotation.y = time * 8; }
      // 飛行機雲: つばさの 先(機体の よこ はば ±1.15)
      if (u.holder.visible && dt > 0) {
        u.holder.updateMatrixWorld();
        up.set(0, 0.13, 0);
        for (const [k, sx] of [[0, 1.15], [1, -1.15]]) {
          tipL.set(sx, 0.15, -1.1).applyMatrix4(u.holder.matrixWorld);
          tipR.copy(tipL).add(up);
          tipL.sub(up);
          pushTrail(u.trails[k], tipL, tipR);
          u.trails[k].m.material.uniforms.k.value = (fast ? 1.25 : 0.85) * (slot === 0 ? 1 : 0.6);
          u.trails[k].m.visible = u.holder.visible;
        }
      } else for (const t of u.trails) t.m.visible = u.holder.visible;
      // 上昇気流の 中: まわりで 葉っぱが まいあがる(自分だけ)
      if (slot === 0 && p.lifting && Math.random() < dt * 14) liftLeaf(u.holder.position);
      if (u.marker) u.marker.position.set(0, 1.25 + Math.sin(time * 5) * 0.08, 0);
      // ほかの 子が カメラの すぐ 前に いると じゃまなので、近いほど 小さく(みんな おなじ ところを とぶ)
      if (slot !== 0) {
        // 自分より うしろ(カメラがわ)の 子は 消す。前の 子は 見える
        const d = u.holder.position.distanceTo(camera.position);
        const dMe = game.units[0].holder.position.distanceTo(camera.position);
        const k = clamp((d - dMe - 0.5) / 2.5, 0, 1);
        u.holder.scale.setScalar(0.9 * k);
        u.holder.visible = k > 0.02;
      }
    });
    course.update(s, time);
    // つぎに くぐる わっか(自分の)を 光らせて、画面の 外なら はしに 矢じるし
    const nx = course.rings[s.planes[0].next];
    for (const r of course.rings) if (!r.done) r.m.scale.setScalar(r === nx ? 1 + Math.sin(time * 6) * 0.06 : 1);
    const arrow = $('arrowA');
    if (nx && s.phase === 'play') {
      tmpV.copy(nx.m.position).project(camera);
      const off = tmpV.z > 1 || Math.abs(tmpV.x) > 0.92 || Math.abs(tmpV.y) > 0.9;
      arrow.hidden = !off;
      if (off) {
        let ax = tmpV.x, ay = tmpV.y;
        if (tmpV.z > 1) { ax = -ax; ay = -ay; }
        const a = Math.atan2(ay, ax);
        const r = Math.min(0.88 / Math.abs(Math.cos(a) || 1e-6), 0.85 / Math.abs(Math.sin(a) || 1e-6));
        arrow.style.left = `${((Math.cos(a) * r + 1) / 2) * 100}%`;
        arrow.style.top = `${((1 - Math.sin(a) * r) / 2) * 100}%`;
        arrow.style.transform = `translate(-50%, -50%) rotate(${-a}rad)`;
        arrow.classList.toggle('gold', nx.r.gold);
      }
    } else arrow.hidden = true;
    // スピード線(急降下)
    $('hudA').classList.toggle('fast', s.planes[0].v > RULES.speed + 2 && s.phase === 'play');
    stage.update(time, camera);
    // 風の すじ: よこかぜの とき、自分の まわりを よこへ ながれる
    const me = s.planes[0];
    const wk = Math.min(1, Math.abs(s.wind.x) / RULES.wind);
    for (const st of streaks) {
      st.x += Math.sign(s.wind.x || 1) * dt * 14;
      if (st.x > 9) st.x -= 18;
      if (st.x < -9) st.x += 18;
      toWorld(me.s + st.d, me.x + st.x, me.y + st.y, st.m.position);
      st.m.rotation.y = -pathAt(me.s).a + Math.PI;
      st.m.material.opacity = wk * 0.5;
    }
  }

  let freeCamera = false;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  function updateCamera(dt, snap = false) {
    if (freeCamera || !game) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const s = game.state;
    const me = s.planes[0];
    const back = portrait ? 6.8 : 5.8;
    // 自分の うしろ・すこし 上から 前を 見る(よこの うごきに すこし おくれて ついていく)
    toWorld(me.s - back, me.x * 0.85, me.y + (portrait ? 2.4 : 1.8), camPos);
    toWorld(me.s + 8, me.x * 0.95, me.y + 0.2, camLook);
    if (s.phase === 'finished') {
      // ゴールの アーチの 前から、とんでくる みんなを 見る
      toWorld(RULES.length + 10, 3, 6, camPos);
      toWorld(RULES.length - 6, 0, 6, camLook);
    }
    camera.fov = portrait ? 66 : 55;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      const sky = toWorld(-10, 0, 30, new THREE.Vector3());
      camera.position.lerpVectors(sky, camPos, e);
      camera.lookAt(camLook);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    camera.position.lerp(camPos, k);
    camera.userData.look = camera.userData.look && !snap ? camera.userData.look.lerp(camLook, k) : camLook.clone();
    if (game.shake > 0) {
      game.shake = Math.max(0, game.shake - dt);
      camera.position.x += (Math.random() - 0.5) * game.shake * 0.6;
      camera.position.y += (Math.random() - 0.5) * game.shake * 0.6;
    }
    camera.lookAt(camera.userData.look);
    // 自分の かたむきに あわせて すこし カメラも かたむく
    game.camRoll += ((s.phase === 'play' ? -me.roll * 0.18 : 0) - game.camRoll) * Math.min(1, dt * 4);
    camera.rotateZ(game.camRoll);
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
    const dt = Math.min(rawDt, 0.1);
    time += dt;
    if (mode === 'playing' && intro >= 1) watchQuality(rawDt);
    if (intro < 1 && !paused) {
      intro = Math.min(1, intro + dt / INTRO_TIME);
      if (intro >= 1) splash('よーい…');
    }
    if (game && mode === 'playing' && !paused && intro >= 1) {
      const s = game.state;
      // まだ かたむきを えらんで いない あいだは はじめない
      if ($('tiltA').hidden) {
        game.acc += dt;
        while (game.acc >= STEP && s.phase !== 'finished') {
          const mi = myInput();
          game.lastInput = mi;
          const inputs = game.players.map((p, slot) => (p.cpu ? cpuInput(game.cpus[slot], s, slot) : mi));
          onEvents(step(s, inputs));
          game.acc -= STEP;
        }
      }
      if (game.endTimer !== null) {
        game.endTimer -= dt;
        if (game.endTimer <= 0) { game.endTimer = null; showResult(); }
      }
    }
    if (game && mode === 'playing') renderHud();
    if (game && !paused) { updateWorld(dt); updateFx(dt); }
    atmosphere.update(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  // E2E・確認用
  window.dhikouki = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    steer: (t) => { input.target = t; },
    skipTilt: () => { input.asked = true; $('tiltA').hidden = true; },
    // 描かずに、みんな CPU で sec 秒すすめる(自分も CPU)
    advance: (sec) => {
      const me = game.meCpu || (game.meCpu = createCpu('normal', 1, 0));
      for (let i = 0; i < sec / STEP && game.state.phase !== 'finished'; i++) {
        onEvents(step(game.state, game.players.map((p, slot) => cpuInput(slot ? game.cpus[slot] : me, game.state, slot))));
      }
    },
    tick: () => updateWorld(0),
    world: (s, x, y) => toWorld(s, x, y, new THREE.Vector3()),
    get paused() { return paused; },
    camera, renderer, scene,
    freeCamera: (on) => { freeCamera = on; },
    setTime: (key) => atmosphere.apply(key),
  };

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
      $('stickA').hidden = true;
    },
    get intro() { return intro; },
  };
}
