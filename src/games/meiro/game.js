// 森の いせきの どんぐり めいろ の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
//
// 動かし方: 画面の どこでも おして ずらす(どこでも スティック)。パソコンは 矢じるしキー / WASD。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { RULES, STEP, createGame, moverPhase, moverWarn, ranking, step, timeLeft } from './rules.js';
import { createNetDriver, replaceState } from '../../net/drive.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { WALL_H, acornMesh, buildMaze, buildStage, chestMesh, ghostMesh, glowTex, toWorld } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SCALE = 0.5; // めいろを はしる キャラの 大きさ

export async function createMeiro({ renderer, settings, getAudio, onExit }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
  const atmosphere = createAtmosphere(scene, renderer, camera, { course: false });
  const stage = buildStage(scene);

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
    // つづけて ひろうと だんだん 高く
    get(n = 0) { const f = 880 * 2 ** (Math.min(n, 8) / 12); voice({ type: 'triangle', pts: [[0, f], [0.06, f * 1.5]], len: 0.09, gain: 0.04 }); },
    open() { voice({ type: 'square', pts: [[0, 220], [0.12, 330]], len: 0.14, gain: 0.03 }); noise({ len: 0.15, gain: 0.03, freq: [900, 300], q: 1.5 }); },
    appear() { [[0, 1568], [0.07, 2093], [0.14, 2637]].forEach(([at, f]) => voice({ pts: [[0, f]], len: 0.25, gain: 0.025, at })); },
    tick(n) { voice({ type: 'square', pts: [[0, n <= 3 ? 1320 : 990]], len: 0.07, gain: 0.035 }); },
    big() { [[0, 523], [0.1, 659], [0.2, 784], [0.3, 1047], [0.42, 1319], [0.54, 1568]].forEach(([at, f]) => voice({ type: 'triangle', pts: [[0, f]], len: 0.16, gain: 0.05, at })); noise({ len: 0.8, gain: 0.03, freq: [3000, 6000], type: 'highpass', at: 0.3 }); },
    rain() { [0, 0.15, 0.3, 0.45].forEach((at, i) => voice({ type: 'triangle', pts: [[0, 1047 * 2 ** (i * 4 / 12)]], len: 0.1, gain: 0.03, at: at + 0.6 })); },
    land() { noise({ len: 0.12, gain: 0.04, freq: [400, 120], type: 'lowpass' }); },
    chest() { [[0, 784], [0.08, 988], [0.16, 1175], [0.24, 1568]].forEach(([at, f]) => voice({ type: 'triangle', pts: [[0, f]], len: 0.12, gain: 0.05, at })); },
    ghost() { voice({ type: 'sine', pts: [[0, 600], [0.4, 200]], len: 0.45, gain: 0.06 }); noise({ len: 0.3, gain: 0.04, freq: [1200, 300], q: 2 }); },
    jump() { voice({ type: 'square', pts: [[0, 300], [0.25, 900]], len: 0.28, gain: 0.04 }); },
    rumble() { noise({ len: 0.5, gain: 0.06, freq: [220, 60], type: 'lowpass', attack: 0.05 }); voice({ type: 'sawtooth', pts: [[0, 55], [0.4, 45]], len: 0.45, gain: 0.02 }); },
    go() { voice({ type: 'square', pts: [[0, 880]], len: 0.18, gain: 0.05 }); },
    ready() { voice({ type: 'square', pts: [[0, 440]], len: 0.12, gain: 0.04 }); },
    whistle() { voice({ pts: [[0, 1800], [0.5, 900]], len: 0.6, gain: 0.04 }); },
    fanfare() { [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1047], [0.5, 1047]].forEach(([at, f], i) => voice({ type: 'square', pts: [[0, f]], len: i === 4 ? 0.6 : 0.12, gain: 0.05, at })); },
  };

  await preload(CHARACTERS.map((c) => c.key));

  // ── 演出 ────────────────────────────────────────
  const fx = [];
  function spark(at, n = 8, color = 0xffe066, sp = 2) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.05 + Math.random() * 0.04), new THREE.MeshBasicMaterial({ color: i % 3 ? color : 0xffffff, transparent: true }));
      m.position.copy(at);
      scene.add(m);
      const a = Math.random() * 6.28;
      fx.push({ obj: m, t: 0, life: 0.5, vel: new THREE.Vector3(Math.cos(a) * sp * 0.5, 1 + Math.random() * 2, Math.sin(a) * sp * 0.5), kind: 'drop' });
    }
  }
  function confetti(at, n = 40) {
    const cols = [0xff6a9a, 0xffd24a, 0x7ad8ff, 0x8ad04a, 0xff8a3a];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.15), new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, transparent: true }));
      m.position.copy(at);
      scene.add(m);
      const a = Math.random() * 6.28;
      fx.push({ obj: m, t: 0, life: 2.4, vel: new THREE.Vector3(Math.cos(a) * 2 * Math.random(), 3 + Math.random() * 2.5, Math.sin(a) * Math.random()), kind: 'paper', spin: Math.random() * 8 });
    }
  }
  // つちけむり(ゆかに ふわっと ひろがって きえる)
  const puffGeo = new THREE.IcosahedronGeometry(0.12, 0);
  function dust(at, n = 6, { color = 0xcfc2a2, sp = 1.2, size = 1, up = 0.4, life = 0.6 } = {}) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
      m.position.copy(at);
      m.scale.setScalar(size * (0.6 + Math.random() * 0.6));
      scene.add(m);
      const a = (i / n) * 6.28 + Math.random() * 0.5;
      fx.push({ obj: m, t: 0, life: life * (0.8 + Math.random() * 0.4), vel: new THREE.Vector3(Math.cos(a) * sp, up * (0.5 + Math.random()), Math.sin(a) * sp), kind: 'puff', grow: size * 1.8 });
    }
  }
  // ゆかに ひろがる わ
  const ringGeo = new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2);
  function ring(at, color, size = 1, life = 0.5) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.copy(at).setY(0.04);
    scene.add(m);
    fx.push({ obj: m, t: 0, life, vel: new THREE.Vector3(), kind: 'ring', size });
  }
  // 空から おりる ひかりの はしら
  function beam(at, color, { h = 7, r = 0.45, life = 1.4 } = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16, 1, true).translate(0, h / 2, 0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.position.copy(at).setY(0);
    scene.add(m);
    fx.push({ obj: m, t: 0, life, vel: new THREE.Vector3(), kind: 'beam' });
  }
  // ひろった どんぐりが キャラへ すいこまれる
  function flyTo(from, holder) {
    const m = acornMesh();
    m.position.copy(from);
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 0.32, vel: new THREE.Vector3(), kind: 'fly', from: from.clone(), holder });
  }
  // たからばこが ひらいて きんかが とびだす
  function openChest(at, size = 1) {
    const m = chestMesh();
    m.position.copy(at).setY(0);
    m.userData.size = size;
    m.getObjectByName('glow').visible = false;
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 1.3, vel: new THREE.Vector3(), kind: 'chest', lid: m.getObjectByName('lid') });
    const shine = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    shine.position.copy(at).setY(0.5);
    scene.add(shine);
    fx.push({ obj: shine, t: 0, life: 0.9, vel: new THREE.Vector3(), kind: 'shine' });
    const coinGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.02, 10).rotateX(Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const c = new THREE.Mesh(coinGeo, new THREE.MeshBasicMaterial({ color: i % 4 ? 0xffd24a : 0xfff4b0, transparent: true }));
      c.position.copy(at).setY(0.4);
      scene.add(c);
      const a = Math.random() * 6.28;
      fx.push({ obj: c, t: -0.15, life: 0.9, vel: new THREE.Vector3(Math.cos(a) * 1.2, 3.5 + Math.random() * 2, Math.sin(a) * 1.2), kind: 'drop', spin: 10 + Math.random() * 10 });
    }
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      if (f.t < 0) { f.obj.visible = false; continue; } // まだ でない
      f.obj.visible = true;
      const k = f.t / f.life;
      if (f.kind === 'fly') {
        const to = f.holder.position;
        const e = Math.min(1, k);
        f.obj.position.lerpVectors(f.from, to, e * e);
        f.obj.position.y = f.from.y + (to.y + 0.6 - f.from.y) * e + Math.sin(e * Math.PI) * 0.8;
        f.obj.scale.setScalar(1.6 * (1 - e * 0.7));
        f.obj.rotation.y += dt * 20;
        if (k >= 1) { scene.remove(f.obj); f.obj.material.dispose(); fx.splice(i, 1); }
        continue;
      }
      if (f.kind === 'chest') {
        const o = Math.min(1, f.t / 0.25);
        f.lid.rotation.x = -(1 - (1 - o) ** 3) * 1.9;
        f.obj.scale.setScalar(f.obj.userData.size * (k < 0.75 ? 1 + Math.sin(Math.min(1, f.t / 0.2) * Math.PI) * 0.15 : 1 - (k - 0.75) * 4));
        if (k >= 1) { scene.remove(f.obj); fx.splice(i, 1); }
        continue;
      }
      if (f.kind === 'ring') f.obj.scale.setScalar(f.size * (0.3 + k * 1.2));
      if (f.kind === 'beam') { f.obj.scale.set(1 - k * 0.6, 1, 1 - k * 0.6); f.obj.material.opacity = 0.5 * Math.sin(Math.min(1, k * 3) * Math.PI / 2) * (1 - k); }
      if (f.kind === 'shine') f.obj.scale.setScalar(0.5 + k * 3);
      if (f.kind === 'puff') { f.vel.multiplyScalar(1 - dt * 4); f.obj.scale.addScalar(f.grow * dt); }
      if (f.spin) { f.obj.rotation.y += f.spin * dt; f.obj.rotation.x += f.spin * 0.3 * dt; }
      f.obj.position.addScaledVector(f.vel, dt);
      if (f.kind === 'drop') f.vel.y -= 8 * dt;
      if (f.kind === 'paper') { f.vel.multiplyScalar(1 - dt * 1.2); f.vel.y -= 4 * dt; f.obj.rotation.x += f.spin * dt; f.obj.rotation.y += f.spin * 0.7 * dt; }
      if (f.kind !== 'beam') f.obj.material.opacity = (f.kind === 'puff' ? 0.8 : 1) * (1 - k * k);
      if (k >= 1) { scene.remove(f.obj); f.obj.material.dispose(); fx.splice(i, 1); }
    }
  }

  const starGeo = new THREE.OctahedronGeometry(0.16, 0);
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });

  // ── ゲームの進行 ────────────────────────────────────
  let mode = 'idle';
  let picked = CHARACTERS[0].key;
  let tour = null;
  let game = null;
  let intro = 1;
  const INTRO_TIME = 2.4;
  const input = { touch: null, stick: null, keys: new Set(), target: null };

  async function startGame({ fromSky = false } = {}) {
    const net = tour?.net ?? null; // オンライン: { client, start }。席・種・顔ぶれは サーバーが きめる
    const me = net ? net.start.seat : 0;
    const seed = net ? net.start.seed : params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS, me });
    if (game) {
      for (const u of game.units) scene.remove(u.holder);
      scene.remove(game.maze.group);
      for (const m of game.itemMeshes.values()) scene.remove(m);
      for (const g of game.ghostMeshes) scene.remove(g);
    }
    for (const f of fx.splice(0)) scene.remove(f.obj);
    const state = createGame(players, seed);
    if (net) replaceState(state, net.start.s);
    const maze = buildMaze(scene, state);
    const units = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const holder = new THREE.Group();
      holder.add(model.root);
      holder.scale.setScalar(SCALE);
      scene.add(holder);
      // あしもとの わ(だれか わかる ように)
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[slot].hex, transparent: true, opacity: 0.8, depthWrite: false }));
      ring.position.y = 0.02;
      ring.scale.setScalar(1 / SCALE);
      holder.add(ring);
      // ふらふらの ほし(おばけに ぶつかった あと)
      const stars = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const st = new THREE.Mesh(starGeo, starMat);
        st.position.set(Math.cos((i / 3) * 6.28) * 0.5, 0, Math.sin((i / 3) * 6.28) * 0.5);
        stars.add(st);
      }
      stars.position.y = 2.9;
      stars.visible = false;
      holder.add(stars);
      return { model, holder, yaw: 0, run: 0, stars, step: 0, air: false, trail: 0 };
    }));
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[me].hex }));
    marker.rotation.x = Math.PI;
    units[me].holder.add(marker);
    units[me].marker = marker;
    const ghostMeshes = state.ghosts.map(() => { const g = ghostMesh(); scene.add(g); return g; });
    game = { me, net: net ? createNetDriver({ client: net.client, rules: { STEP, step }, state, me }) : null, seed, players, state, maze, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), units, acc: 0, endTimer: null, shake: 0, itemMeshes: new Map(), ghostMeshes, combo: { n: 0, t: 0 }, ready: false };
    atmosphere.apply(params.get('time') || 'evening');
    atmosphere.setupShadows(units.map((u) => u.holder), [stage.group, maze.group]);
    Object.assign(input, { touch: null, stick: null, target: null });
    $('stickI').hidden = true;
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoI').classList.add('show');
    if (!fromSky) splash('よーい…');
    syncItems();
    game.ready = true;
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudI').hidden = m !== 'playing';
    document.body.classList.toggle('ingame', m !== 'idle');
  }
  function leave(to) { onExit(to); }

  // ── 一時停止 ──────────────────────────────────────
  let paused = false;
  function setPaused(on) {
    if (mode === 'idle') { paused = false; return; }
    paused = on && mode === 'playing';
    $('pause').hidden = !paused;
  }
  const mine = (fn) => () => { if (mode !== 'idle') fn(); };
  $('pauseBtnI').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: どこでも スティック ─────────────────────────
  const STICK_R = 56;
  const FULL = 26, DEAD = 6;
  const stickEl = $('stickI'), knobEl = stickEl.firstElementChild;
  const playing = () => mode === 'playing' && !paused;
  window.addEventListener('pointerdown', (e) => {
    if (!playing() || input.touch !== null || e.target.closest('button, a')) return;
    unlockAudio();
    input.touch = e.pointerId;
    input.stick = { ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    stickEl.style.left = `${e.clientX}px`;
    stickEl.style.top = `${e.clientY}px`;
    knobEl.style.transform = 'translate(-50%, -50%)';
    stickEl.hidden = false;
    $('howtoI').classList.remove('show');
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
    if (KEYS[e.code]) { e.preventDefault(); unlockAudio(); input.keys.add(e.code); $('howtoI').classList.remove('show'); }
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.touch = null; input.stick = null; stickEl.hidden = true; });
  function myInput() {
    if (input.target) return { ...input.target };
    let sx = 0, sy = 0;
    if (input.keys.size) {
      for (const k of input.keys) { sx += KEYS[k][0]; sy += KEYS[k][1]; }
      const d = Math.hypot(sx, sy);
      if (d) { sx /= d; sy /= d; }
    } else if (input.stick) { sx = input.stick.dx; sy = input.stick.dy; }
    // カメラは 手前の 上から 見て いるので、画面の 上 = めいろの 上(y が へる)
    return { x: sx, y: sy };
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashI');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  const nameOf = (slot) => (slot === game.me ? 'あなた' : CHARACTERS.find((c) => c.key === game.players[slot].character)?.name || '');
  function buildChips() {
    $('chipsI').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'chip' + (slot === game.me ? ' me' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      d.innerHTML = '<i></i><b>0</b>';
      return d;
    }));
  }
  function renderHud() {
    const s = game.state;
    const order = ranking(s);
    [...$('chipsI').children].forEach((c, slot) => {
      c.querySelector('b').textContent = String(s.players[slot].score);
      c.style.order = String(order.indexOf(slot));
      c.classList.toggle('lead', order[0] === slot && s.players[slot].score > 0);
    });
    const left = s.phase === 'play' ? Math.ceil(timeLeft(s)) : 0;
    $('timeI').textContent = s.phase === 'play' ? String(left) : '';
    $('timeI').classList.toggle('hurry', s.phase === 'play' && left <= 10);
    $('hudI').classList.toggle('hurry', s.phase === 'play' && left <= 10);
    if (s.phase === 'play' && left <= 5 && left !== game.lastTick) { game.lastTick = left; sfx.tick(left); }
    // 画面の そとの たからばこは、ふちに 矢じるしで 向きを 見せる
    const chests = s.phase === 'play' ? s.items.filter((it) => it.kind === 'chest') : [];
    const box = $('arrowsI');
    while (box.children.length < chests.length) { const el = document.createElement('div'); el.className = 'chestarrow'; el.innerHTML = '<i></i><b>🎁</b>'; box.append(el); }
    [...box.children].forEach((el, k) => {
      const it = chests[k];
      if (!it) { el.hidden = true; return; }
      el.classList.toggle('big', !!it.big);
      tmpV.copy(toWorld(it.x + 0.5, it.y + 0.5)).setY(0.3).project(camera);
      const inView = tmpV.z < 1 && Math.abs(tmpV.x) < 0.92 && Math.abs(tmpV.y) < 0.85;
      el.hidden = inView;
      if (inView) return;
      // カメラの うしろでも 向きが あう ように、自分から みた 向きで きめる
      const me = s.players[game.me];
      const a = Math.atan2(it.y + 0.5 - me.y, it.x + 0.5 - me.x); // 画面の 右 = +x、下 = +y
      const c = Math.cos(a), sn = Math.sin(a);
      const m = Math.max(Math.abs(c) / 0.42, Math.abs(sn) / 0.4);
      el.style.left = `${50 + (c / m) * 100}%`;
      el.style.top = `${52 + (sn / m) * 100}%`;
      el.firstElementChild.style.transform = `rotate(${a}rad)`;
    });
  }
  const tmpV = new THREE.Vector3();
  function pop(text, at, cls = '', life = 900) {
    tmpV.copy(at).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsI').append(el);
    setTimeout(() => el.remove(), life);
  }
  const keyOf = (it) => `${it.x},${it.y},${it.kind}`;
  // どんぐり・たからばこの 見た目を state に あわせる
  function syncItems() {
    const s = game.state;
    const live = new Set();
    for (const it of s.items) {
      const k = keyOf(it);
      live.add(k);
      if (!game.itemMeshes.has(k)) {
        const m = it.kind === 'chest' ? chestMesh() : acornMesh();
        toWorld(it.x + 0.5, it.y + 0.5, m.position);
        m.userData = { born: time, ph: Math.random() * 6, drop: it.kind === 'chest' && game.ready, size: it.big ? 1.7 : it.kind === 'chest' ? 1 : 1.6 };
        if (it.big) m.getObjectByName('glow').scale.setScalar(2.2);
        if (m.userData.drop) { beam(m.position, 0xffd860, it.big ? { h: 12, r: 0.9, life: 2.4 } : undefined); if (!it.big) sfx.appear(); }
        scene.add(m);
        game.itemMeshes.set(k, m);
      }
    }
    for (const [k, m] of game.itemMeshes) if (!live.has(k)) { scene.remove(m); game.itemMeshes.delete(k); }
  }

  // ── できごと ────────────────────────────────────────
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'go':
          splash('あつめろ!', 'gold');
          sfx.go();
          setTimeout(() => game?.state === s && $('howtoI').classList.remove('show'), 4000);
          break;
        case 'get': {
          const at = toWorld(e.x + 0.5, e.y + 0.5).setY(0.5);
          if (e.kind === 'chest') {
            openChest(at, e.value > RULES.chestValue ? 1.7 : 1);
            ring(at, 0xffd24a, 1.4, 0.7);
            if (e.value > RULES.chestValue) { beam(at, 0xffe070, { h: 9, r: 0.7, life: 1.2 }); confetti(at.clone().setY(1), 30); if (e.slot === game.me) sfx.big(); else splash(`${nameOf(e.slot)}が 大きな たからばこ!`, 'small'); }
            if (e.slot === game.me) { sfx.open(); sfx.chest(); game.shake = 0.15; pop(`たからばこ +${e.value}!`, at.clone().setY(1.2), 'gold', 1000); }
          } else {
            flyTo(at.clone().setY(0.3), game.units[e.slot].holder);
            if (e.slot === game.me) {
              // つづけて ひろうと れんさ
              const c = game.combo;
              c.n = c.t > 0 ? c.n + 1 : 0;
              c.t = 1.1;
              sfx.get(c.n);
              spark(at, 4 + Math.min(c.n, 6), c.n >= 4 ? 0xffe066 : 0xc8843a, 1.5);
              pop(c.n >= 2 ? `+1 れんさ${c.n + 1}` : '+1', at.clone().setY(1), c.n >= 4 ? 'gold' : 'me', 500);
            }
          }
          break;
        }
        case 'ghost': {
          const at = toWorld(e.x, e.y).setY(0.6);
          spark(at, 10, 0x9ab8ff, 2.5);
          ring(at, 0x9a7aff, 1, 0.5);
          // ぶつかった おばけは 「ばあ!」と ふくらむ
          let gk = 0, gd = Infinity;
          s.ghosts.forEach((g, k) => { const d = Math.hypot(g.x - e.x, g.y - e.y); if (d < gd) { gd = d; gk = k; } });
          if (game.ghostMeshes[gk]) game.ghostMeshes[gk].userData.boo = 0.5;
          if (e.slot === game.me) { sfx.ghost(); game.shake = 0.3; pop('おばけだ〜!', at.clone().setY(1.4), 'red', 1000); }
          game.units[e.slot].scared = 1.2;
          break;
        }
        case 'drop': {
          // おとした どんぐりが とびちる(とんで いって おちる)
          const from = toWorld(e.fromX, e.fromY).setY(0.6);
          const to = toWorld(e.x + 0.5, e.y + 0.5);
          const m = acornMesh();
          m.position.copy(from);
          scene.add(m);
          fx.push({ obj: m, t: 0, life: 0.5, vel: to.clone().sub(from).multiplyScalar(2).setY(3), kind: 'drop' });
          break;
        }
        case 'jump': {
          if (e.slot === game.me) sfx.jump();
          const pd = game.maze.pads.find((q) => q.x === e.x && q.y === e.y);
          if (pd) pd.flash = 1;
          ring(toWorld(e.x + 0.5, e.y + 0.5), 0x8af0ff, 0.8, 0.4);
          break;
          break;
        }
        case 'rise': {
          const near = Math.hypot(e.x + 0.5 - s.players[game.me].x, e.y + 0.5 - s.players[game.me].y);
          if (near < 4) sfx.rumble();
          if (near < 4) game.shake = Math.max(game.shake, 0.12);
          if (near < 9) dust(toWorld(e.x + 0.5, e.y + 0.5).setY(0.1), 10, { sp: 1.4, size: 1.2 });
          break;
        }
        case 'sink':
          if (Math.hypot(e.x + 0.5 - s.players[game.me].x, e.y + 0.5 - s.players[game.me].y) < 9) dust(toWorld(e.x + 0.5, e.y + 0.5).setY(0.1), 5, { sp: 0.8, up: 0.2 });
          break;
        case 'pushed':
          if (e.slot === game.me) pop('おしだされた!', toWorld(s.players[game.me].x, s.players[game.me].y).setY(1.2), 'red', 800);
          break;
        case 'chest':
          splash('たからばこが でた!', 'small');
          break;
        case 'big':
          splash('大きな たからばこ!', 'gold');
          sfx.big();
          game.shake = 0.25;
          break;
        case 'show':
          splash('そこまで!', 'small');
          sfx.whistle();
          break;
        case 'finished': {
          game.endTimer = 4;
          const win = e.winner === game.me;
          if (win) { sfx.fanfare(); splash('1い!', 'gold'); } else splash(`${ranking(s).indexOf(game.me) + 1}い`, 'small');
          const w = game.units[e.winner];
          w.win = true;
          confetti(w.holder.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 50);
          beam(w.holder.position, 0xffe070, { h: 10, r: 0.8, life: 3 });
          ring(w.holder.position, 0xffd24a, 1.6, 0.8);
          game.rain = 2.2;
          sfx.rain();
          // 王冠
          const crown = new THREE.Group();
          const gold = new THREE.MeshToonMaterial({ color: 0xffcf3a, emissive: 0x5a3a00, side: THREE.DoubleSide });
          crown.add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 12, 1, true), gold));
          for (let k = 0; k < 5; k++) {
            const sp = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 4), gold);
            sp.position.set(Math.cos((k / 5) * 6.28) * 0.24, 0.14, Math.sin((k / 5) * 6.28) * 0.24);
            crown.add(sp);
          }
          const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), new THREE.MeshBasicMaterial({ color: 0xff4a6a }));
          gem.position.set(0, 0.02, 0.25);
          crown.add(gem);
          crown.position.y = 2.3;
          w.holder.add(crown);
          w.crown = crown;
          if (w.marker) w.marker.visible = false;
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
    $('resultTitle').textContent = order[0] === game.me ? 'あなたの 勝ち!' : `${nameOf(order[0])}の 勝ち!`;
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = game.players[slot];
      const pl = s.players[slot];
      const li = document.createElement('li');
      if (slot === game.me) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : slot === game.me ? 'あなた' : 'ともだち';
      const def = CHARACTERS.find((c) => c.key === p.character);
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}${pl.chests ? `・たからばこ ${pl.chests}` : ''}</small></span><span class="dist">${pl.score}<small>こ</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateWorld(dt) {
    const s = game.state;
    syncItems();
    // どんぐりは くるくる、たからばこは ゆらゆら
    for (const m of game.itemMeshes.values()) {
      const d = m.userData;
      const k = Math.min(1, (time - d.born) / 0.3);
      m.scale.setScalar(d.size * (d.drop ? 1 : k));
      if (d.drop) {
        // ひかりの はしらを とおって どすんと おちて くる
        const t = time - d.born - 0.35;
        const y = t < 0 ? 6 : Math.max(0, 6 - 0.5 * 26 * t * t);
        m.position.y = y;
        m.visible = t >= 0;
        if (y === 0) { d.drop = false; dust(m.position.clone().setY(0.1), d.size > 1 ? 14 : 8, { sp: 1.6 * d.size, size: d.size }); ring(m.position, 0xffd860, 1.2 * d.size); }
      }
      if (!m.children.length) { m.rotation.y = time * 2 + d.ph; m.position.y = 0.25 + Math.sin(time * 3 + d.ph) * 0.05; }
      else m.rotation.y = Math.sin(time + d.ph) * 0.3;
    }
    // うごく かべ: でる まえは ぐらぐら
    s.movers.forEach((mv, k) => {
      const o = game.maze.movers[k];
      const up = moverPhase(s, mv) < 0.5;
      o.cur += ((up ? 0 : -WALL_H) - o.cur) * Math.min(1, dt * 10);
      const warn = !up && moverWarn(s, mv);
      o.mesh.position.y = WALL_H / 2 + o.cur + (warn ? 0.06 + Math.abs(Math.sin(time * 30)) * 0.05 : 0);
      o.mesh.position.x = toWorld(mv.x + 0.5, 0).x + (warn ? Math.sin(time * 40) * 0.03 : 0);
    });
    for (const [k, pd] of game.maze.pads.entries()) {
      pd.flash = Math.max(0, pd.flash - dt * 2.5);
      pd.glow.material.opacity = 0.35 + Math.sin(time * 4 + k) * 0.2 + pd.flash * 0.6;
      pd.glow.scale.setScalar(1.3 + pd.flash * 1.2);
    }
    if (game.combo.t > 0) game.combo.t -= dt;
    // おばけ: ふわふわ
    s.ghosts.forEach((g, k) => {
      const m = game.ghostMeshes[k];
      const target = toWorld(g.x, g.y);
      m.position.x = target.x; m.position.z = target.z;
      m.position.y = 0.1 + Math.sin(time * 3 + k) * 0.1;
      const boo = m.userData.boo || 0;
      if (boo > 0) m.userData.boo = boo - dt;
      m.scale.setScalar(1 + Math.sin(Math.max(0, boo) / 0.5 * Math.PI) * 0.5);
      const dx = (g.tx ?? 0) + 0.5 - g.x, dy = (g.ty ?? 0) + 0.5 - g.y;
      if (Math.hypot(dx, dy) > 0.01) m.rotation.y = Math.atan2(dx, dy);
    });
    // キャラ
    s.players.forEach((p, slot) => {
      const u = game.units[slot];
      const w = toWorld(p.x, p.y);
      const moved = Math.hypot(w.x - u.holder.position.x, w.z - u.holder.position.z);
      u.run = moved / Math.max(dt, 1e-3);
      u.holder.position.x = w.x;
      u.holder.position.z = w.z;
      // じゃんぷ: 山なりに とぶ
      u.holder.position.y = p.jump ? Math.sin(Math.min(1, p.jump.t / RULES.jumpTime) * Math.PI) * 1.4 : 0;
      if (p.jump || u.run > 0.3) u.yaw = Math.atan2(p.fx, p.fy);
      u.holder.rotation.y += Math.atan2(Math.sin(u.yaw - u.holder.rotation.y), Math.cos(u.yaw - u.holder.rotation.y)) * Math.min(1, dt * 12);
      if (u.scared > 0) u.scared -= dt;
      u.model.setFace(u.win ? 'happy' : u.scared > 0 ? 'surprised' : 'normal');
      u.model.play(u.win ? 'cheer' : u.run > 0.8 ? 'run' : 'idle');
      u.model.update(dt);
      // おばけに ぶつかった あとは ちかちか
      u.holder.visible = !(p.safe > 0 && p.stun <= 0 && Math.sin(time * 30) > 0.3);
      if (u.marker) u.marker.position.set(0, 2.6 + Math.sin(time * 5) * 0.1, 0);
      u.stars.visible = p.stun > 0;
      if (p.stun > 0) u.stars.rotation.y = time * 6;
      const near = Math.hypot(p.x - s.players[game.me].x, p.y - s.players[game.me].y) < 9;
      // はしると つちけむり
      if (u.run > 1.5 && !p.jump && near) {
        u.step -= dt;
        if (u.step <= 0) { u.step = 0.16; dust(u.holder.position.clone().setY(0.05), 1, { sp: 0.3, size: 0.6, up: 0.6, life: 0.45 }); }
      }
      // とんで いる あいだは ひかる しっぽ、おりたら どすん
      if (p.jump) {
        u.air = true;
        u.trail -= dt;
        if (u.trail <= 0) { u.trail = 0.04; spark(u.holder.position.clone().setY(u.holder.position.y + 0.5), 1, 0x8af0ff, 0.3); }
      } else if (u.air) {
        u.air = false;
        if (near) { dust(u.holder.position.clone().setY(0.05), 7, { sp: 1.3 }); ring(u.holder.position, 0x8af0ff, 0.7, 0.35); }
        if (slot === game.me) sfx.land();
      }
    });
    stage.update(time);
    // のこり 10秒から たいまつが ごうごう
    const hurry = s.phase === 'play' ? clamp((10 - timeLeft(s)) / 3, 0, 1) : s.phase === 'show' ? 1 : 0;
    game.hurry = (game.hurry || 0) + (hurry - (game.hurry || 0)) * Math.min(1, dt * 3);
    game.maze.update(time, game.hurry);
    // かった 子の 王冠と どんぐりの あめ
    for (const u of game.units) if (u.crown) { u.crown.rotation.y = time * 2; u.crown.position.y = 2.3 + Math.sin(time * 4) * 0.06; }
    if (game.rain > 0) {
      game.rain -= dt;
      game.rainT = (game.rainT || 0) - dt;
      if (game.rainT <= 0) {
        game.rainT = 0.05;
        const w = game.units[s.winner].holder.position;
        const m = acornMesh();
        const a = Math.random() * 6.28, r = 0.3 + Math.random() * 1.6;
        m.position.set(w.x + Math.cos(a) * r, 3 + Math.random() * 1.2, w.z + Math.sin(a) * r);
        m.scale.setScalar(1.1);
        m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
        scene.add(m);
        fx.push({ obj: m, t: 0, life: 1.1, vel: new THREE.Vector3(0, -2, 0), kind: 'drop', spin: 6 });
      }
    }
  }

  let freeCamera = false;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  function updateCamera(dt, snap = false) {
    if (freeCamera || !game) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const s = game.state;
    // 自分を 上から おいかける(めいろが よく 見える ように たかめ)
    const me = game.units[game.state.winner !== null && s.phase === 'finished' ? s.winner : 0].holder.position;
    const want = new THREE.Vector3(me.x, portrait ? 11 : 8.5, me.z + (portrait ? 5.5 : 4.5));
    const look = new THREE.Vector3(me.x, 0, me.z - 0.3);
    if (s.phase === 'finished') {
      // かった 子の まわりを ゆっくり まわる
      const a = Math.sin(time * 0.35) * 0.6;
      want.set(me.x + Math.sin(a) * 2.6, 6.8, me.z + Math.cos(a) * 2.8); // かべに かくれない ように 上から
      look.set(me.x, 0.5, me.z);
    }
    const k = snap ? 1 : Math.min(1, dt * 5);
    camPos.lerp(want, k);
    camLook.lerp(look, k);
    camera.fov = portrait ? 56 : 46;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      camera.position.lerpVectors(new THREE.Vector3(0, 30, 16), camPos, e);
      camera.lookAt(camLook);
      return;
    }
    camera.position.copy(camPos);
    if (game.shake > 0) {
      game.shake = Math.max(0, game.shake - dt);
      camera.position.x += (Math.random() - 0.5) * game.shake * 0.4;
    }
    camera.lookAt(camLook);
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
    if (game && mode === 'playing' && (!paused || game.net) && intro >= 1) {
      const s = game.state;
      game.acc += dt;
      while (game.acc >= STEP && s.phase !== 'finished') {
        const mi = myInput();
        const inputs = game.players.map((p, slot) => (p.cpu ? (game.net ? null : cpuInput(game.cpus[slot], s, slot)) : mi));
        onEvents((game.net ? game.net.step : step)(s, inputs));
        game.acc -= STEP;
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
  window.dmeiro = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    steer: (t) => { input.target = t; },
    advance: (sec) => {
      const me = game.meCpu || (game.meCpu = createCpu('normal', 1, 0));
      for (let i = 0; i < sec / STEP && game.state.phase !== 'finished'; i++) {
        onEvents(step(game.state, game.players.map((p, slot) => cpuInput(slot ? game.cpus[slot] : me, game.state, slot))));
      }
    },
    events: (evs) => onEvents(evs),
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
    async enter(character, { fromSky = true, lineup = null, onFinish = null, net = null } = {}) {
      picked = character;
      tour = onFinish ? { lineup, onFinish, net } : null;
      unlockAudio();
      applyQuality();
      await startGame({ fromSky });
      renderer.compile(scene, camera);
    },
    exit() { setMode('idle'); },
    get intro() { return intro; },
  };
}
