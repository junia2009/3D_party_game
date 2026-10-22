// 夏の浜べの ビーチバレー の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
//
// 動かし方: 画面の どこでも 指を おいて ずらすと 走る(どこでもスティック)。右下の「うつ」で うちかえす
// (ボールが 手の とどく ところに 来ると 自動で うつ。少し 早めに おしても 待ってくれる)。
// パソコンは 矢印 / WASD・スペース(うつ)。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonMaterial } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { RULES, STEP, createGame, landing, ranking, step, timeLeft } from './rules.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { TEAM_COLORS, buildStage } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);
const HELPER_NAMES = { risu: 'リス', harinezumi: 'ハリネズミ', komadori: 'コマドリ' };

export async function createVolley({ renderer, settings, getAudio, onExit }) {
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
    bump() { voice({ type: 'triangle', pts: [[0, 330], [0.08, 220]], len: 0.1, gain: 0.09 }); noise({ len: 0.06, gain: 0.06, freq: [900, 400], type: 'lowpass', attack: 0.002 }); },
    toss() { voice({ type: 'triangle', pts: [[0, 520], [0.06, 620]], len: 0.08, gain: 0.06 }); },
    spike() { noise({ len: 0.16, gain: 0.22, freq: [2400, 500], type: 'lowpass', attack: 0.002 }); voice({ type: 'square', pts: [[0, 220], [0.1, 110]], len: 0.12, gain: 0.05 }); },
    serve() { voice({ type: 'triangle', pts: [[0, 392], [0.1, 330]], len: 0.12, gain: 0.08 }); },
    land() { noise({ len: 0.3, gain: 0.12, freq: [700, 200], type: 'lowpass', attack: 0.005 }); },
    net() { noise({ len: 0.25, gain: 0.08, freq: [500, 300], q: 2 }); },
    whistle() { voice({ pts: [[0, 2300], [0.25, 2250]], len: 0.32, gain: 0.05, vib: 60, vibRate: 30 }); },
    point(win) {
      if (win) [0, 0.09, 0.18].forEach((at, i) => voice({ type: 'square', pts: [[0, [659, 784, 1047][i]]], len: 0.12, gain: 0.04, at }));
      else voice({ type: 'square', pts: [[0, 392], [0.3, 262]], len: 0.32, gain: 0.04 });
    },
    wind() { noise({ len: 1.6, gain: 0.07, freq: [300, 900], q: 0.8, attack: 0.5 }); },
    fanfare() {
      [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1047]].forEach(([at, f]) => voice({ type: 'square', pts: [[0, f]], len: 0.12, gain: 0.05, at }));
      voice({ type: 'square', pts: [[0, 1047]], len: 0.6, gain: 0.05, at: 0.5, vib: 12, vibRate: 7 });
    },
  };

  await preload([...CHARACTERS.map((c) => c.key), 'risu', 'harinezumi', 'komadori', 'mogura', 'hoho']);

  // ── しんぱんの フクロウ先生 ─────────────────────────
  const owl = await createModel('hoho');
  owl.play('idle');
  owl.root.position.copy(stage.umpire);
  owl.root.scale.setScalar(0.62);
  scene.add(owl.root);

  // ── 見物の なかま(試合に 出ていない 子が 砂に すわって 見る) ──────────
  const fans = [];
  async function buildFans(state, players) {
    for (const f of fans.splice(0)) scene.remove(f.model.root);
    const used = new Set([...players.map((p) => p.character), ...state.units.filter((u) => u.slot < 0).map((u) => u.kind)]);
    const keys = [...CHARACTERS.map((c) => c.key), 'risu', 'harinezumi', 'komadori', 'mogura'].filter((k) => !used.has(k)).slice(0, stage.seats.length);
    for (const [k, key] of keys.entries()) {
      const m = await createModel(key);
      m.play('idle');
      m.setFace('normal');
      const st = stage.seats[k];
      m.root.position.set(st.x, 0, st.z);
      m.root.rotation.y = Math.PI + (st.x * -0.05);
      m.root.scale.setScalar(0.85);
      scene.add(m.root);
      fans.push({ model: m, cheer: 0, seat: st, phase: k * 1.3 });
    }
  }

  // ── 砂の 足あと(見た目だけ。走ると ぽつぽつ のこって、だんだん 消える) ───────
  const STEPS = 160;
  const stepMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.1, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xa8824a, transparent: true, opacity: 0.5, depthWrite: false }), STEPS);
  stepMesh.count = STEPS;
  const stepAge = new Float32Array(STEPS).fill(99);
  let stepNext = 0;
  const stepM = new THREE.Matrix4(), stepQ = new THREE.Quaternion(), stepS = new THREE.Vector3(), stepP = new THREE.Vector3(), upY = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < STEPS; i++) stepMesh.setMatrixAt(i, stepM.makeScale(0, 0, 0));
  scene.add(stepMesh);
  function footprint(x, z, face, side) {
    const i = stepNext;
    stepNext = (stepNext + 1) % STEPS;
    stepAge[i] = 0;
    const ox = Math.cos(face) * 0.11 * side, oz = -Math.sin(face) * 0.11 * side;
    stepMesh.setMatrixAt(i, stepM.compose(stepP.set(x + ox, 0.013, z + oz), stepQ.setFromAxisAngle(upY, face), stepS.set(0.8, 1, 1.25)));
  }
  function updateSteps(dt) {
    let dirty = false;
    for (let i = 0; i < STEPS; i++) {
      if (stepAge[i] >= 6) continue;
      stepAge[i] += dt;
      dirty = true;
      stepMesh.getMatrixAt(i, stepM);
      stepM.decompose(stepP, stepQ, stepS);
      const k = Math.max(0, 1 - stepAge[i] / 6);
      stepS.set(0.8 * k, 1, 1.25 * k);
      stepMesh.setMatrixAt(i, stepM.compose(stepP, stepQ, stepS));
    }
    if (dirty) stepMesh.instanceMatrix.needsUpdate = true;
  }

  // ── ボール(白・黄・青の ビーチボール)と 影・落ちる ところ ──────────────
  const ballTex = (() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const g = c.getContext('2d');
    const cols = ['#ffffff', '#ffd23a', '#ffffff', '#3a8ae8', '#ffffff', '#ff5a5a'];
    cols.forEach((col, k) => { g.fillStyle = col; g.fillRect((k * 128) / 6, 0, 128 / 6 + 1, 64); });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(RULES.ballR * 1.5, 18, 12), new THREE.MeshToonMaterial({ map: ballTex }));
  ball.castShadow = true;
  scene.add(ball);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(RULES.ballR * 1.3, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5a3a1a, transparent: true, opacity: 0.4, depthWrite: false }));
  shadow.position.y = 0.015;
  scene.add(shadow);
  // 落ちる ところの わ(ボールが 自分の チームへ 来る ときだけ)
  const landRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
  landRing.position.y = 0.02;
  scene.add(landRing);
  // スパイクの すじ
  const trail = [];
  for (let k = 0; k < 8; k++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(RULES.ballR * (1 - k * 0.1), 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(m);
    trail.push(m);
  }
  const trailPos = [];

  // ── 砂けむり・きらきら・紙ふぶき・風の すじ ──────────────────
  const fx = [];
  const puffGeo = new THREE.IcosahedronGeometry(0.1, 1);
  function sandBurst(x, z, n = 10, sp = 2.4) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0xe8d0a0 : 0xf6e6c4, transparent: true }));
      m.position.set(x, 0.1, z);
      m.scale.setScalar(0.5 + Math.random() * 0.9);
      scene.add(m);
      const a = Math.random() * Math.PI * 2;
      fx.push({ obj: m, t: 0, life: 0.7, vel: new THREE.Vector3(Math.cos(a) * sp * Math.random(), 1.5 + Math.random() * 2.5, Math.sin(a) * sp * Math.random()), kind: 'chunk' });
    }
  }
  function sparkle(x, y, z, n = 3, color = 0xfff2a0) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.set(x + (Math.random() - 0.5) * 0.4, y + (Math.random() - 0.5) * 0.3, z + (Math.random() - 0.5) * 0.4);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 0.5, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 0.8 + Math.random(), (Math.random() - 0.5) * 2), kind: 'spark' });
    }
  }
  const confettiGeo = new THREE.PlaneGeometry(0.12, 0.07);
  function confetti(x, z) {
    const colors = [...PLAYER_COLORS.map((c) => c.hex), 0xffd24a, 0xffffff];
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true }));
      m.position.set(x + (Math.random() - 0.5) * 6, 4 + Math.random() * 2.5, z + (Math.random() - 0.5) * 4);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 3 + Math.random() * 1.5, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, -(0.7 + Math.random() * 0.6), (Math.random() - 0.5) * 0.6), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), kind: 'confetti' });
    }
  }
  // 風の すじ(風が ふいている あいだ、z の 向きへ ながれる)
  const streaks = [];
  const streakGeo = new THREE.PlaneGeometry(0.04, 1.6).rotateX(-Math.PI / 2);
  for (let k = 0; k < 26; k++) {
    const m = new THREE.Mesh(streakGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set((Math.random() - 0.5) * 22, 0.6 + Math.random() * 3.5, (Math.random() - 0.5) * 12);
    scene.add(m);
    streaks.push(m);
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = f.t / f.life;
      f.obj.position.addScaledVector(f.vel, dt);
      if (f.kind === 'chunk') {
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
    const w = game?.state ? (game.state.wind.until > game.state.t ? game.state.wind.z : 0) : 0;
    windShown += ((w ? 1 : 0) - windShown) * Math.min(1, dt * 2);
    for (const [k, m] of streaks.entries()) {
      m.material.opacity = windShown * 0.5;
      if (windShown < 0.01) continue;
      m.position.z += Math.sign(w || 1) * dt * (9 + (k % 4) * 2);
      if (m.position.z > 7) m.position.z -= 14;
      if (m.position.z < -7) m.position.z += 14;
    }
  }
  let windShown = 0;

  // ── ゲームの進行 ────────────────────────────────────
  let mode = 'idle';
  let picked = CHARACTERS[0].key;
  let tour = null;
  let game = null;
  let intro = 1;
  const INTRO_TIME = 2.4;
  const input = { touch: null, stick: null, keys: new Set(), hit: false, target: null };

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS });
    if (game) for (const u of game.units) scene.remove(u.holder);
    for (const f of fx.splice(0)) scene.remove(f.obj);
    const state = createGame(players, seed);
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
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.44, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[su.side], transparent: true, opacity: 0.85 }));
      ring.position.y = 0.02;
      holder.add(ring);
      scene.add(holder);
      const def = helper ? null : CHARACTERS.find((c) => c.key === key);
      return { model, holder, ring, size: def?.size || 1, hitT: 0, hitKind: null, arms: [model.node('arm_L'), model.node('arm_R')], cheer: 0 };
    }));
    const meIdx = state.units.findIndex((u) => u.slot === 0);
    const me = units[meIdx];
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.36, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    me.holder.add(marker);
    me.marker = marker;
    await buildFans(state, players);
    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), units, acc: 0, endTimer: null, shake: 0, meIdx, focus: new THREE.Vector3() };
    atmosphere.apply(params.get('time') || 'day');
    atmosphere.setupShadows([...units.map((u) => u.holder), ball], [stage.group]);
    Object.assign(input, { touch: null, stick: null, hit: false, target: null });
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoP').classList.add('show');
    if (!fromSky) splash('よーい…');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudP').hidden = m !== 'playing';
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
  $('pauseBtnP').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: どこでもスティック + うつボタン ───────────────
  const STICK_R = 56;
  const FULL = 30, DEAD = 3;
  const stickEl = $('stickP'), knobEl = stickEl.firstElementChild;
  const hitEl = $('hitP');
  const playing = () => mode === 'playing' && !paused;
  hitEl.addEventListener('pointerdown', (e) => {
    if (!playing()) return;
    e.preventDefault();
    e.stopPropagation();
    unlockAudio();
    input.hit = true;
    hitEl.classList.add('down');
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) hitEl.addEventListener(ev, () => hitEl.classList.remove('down'));
  window.addEventListener('pointerdown', (e) => {
    if (!playing() || input.touch !== null || e.target.closest('button, a')) return;
    unlockAudio();
    input.touch = e.pointerId;
    input.stick = { ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    stickEl.style.left = `${e.clientX}px`;
    stickEl.style.top = `${e.clientY}px`;
    knobEl.style.transform = 'translate(-50%, -50%)';
    stickEl.hidden = false;
    $('howtoP').classList.remove('show');
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
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); unlockAudio(); input.hit = true; return; }
    if (KEYS[e.code]) {
      e.preventDefault();
      unlockAudio();
      input.keys.add(e.code);
      $('howtoP').classList.remove('show');
    }
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.touch = null; input.stick = null; stickEl.hidden = true; });

  function myInput() {
    const hit = input.hit;
    input.hit = false;
    if (input.target) return { ...input.target, hit: input.target.hit ?? hit };
    let sx = 0, sy = 0;
    if (input.keys.size) {
      for (const k of input.keys) { sx += KEYS[k][0]; sy += KEYS[k][1]; }
      const d = Math.hypot(sx, sy);
      if (d) { sx /= d; sy /= d; }
    } else if (input.stick) {
      sx = input.stick.dx;
      sy = input.stick.dy;
    }
    // カメラは 自分の チームの うしろから ネットを 見ている。左チームなら 画面の 上 = +x・右 = +z(右チームは 逆)
    const f = camSign();
    return { x: -sy * f, z: sx * f, hit };
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashP');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildChips() {
    const s = game.state;
    for (const side of ['L', 'R']) {
      $(`team${side}P`).querySelector('.mem').replaceChildren(...s.teams[side].map((i) => {
        const u = s.units[i];
        const d = document.createElement('div');
        d.className = 'chip' + (u.slot === 0 ? ' me' : '') + (u.slot < 0 ? ' helper' : '');
        d.style.setProperty('--c', css(u.slot < 0 ? 0xb8a890 : PLAYER_COLORS[u.slot].hex));
        d.innerHTML = u.slot < 0 ? `<b>${HELPER_NAMES[u.kind]}</b>` : '<i></i>';
        return d;
      }));
    }
    $('hudP').dataset.side = s.units[game.meIdx].side;
    $('ptLP').textContent = $('ptRP').textContent = '0';
  }
  function renderHud() {
    const s = game.state;
    $('timeP').textContent = s.phase === 'play' ? String(Math.ceil(timeLeft(s))) : '';
    const me = s.units[game.meIdx];
    const b = s.ball;
    $('hitP').hidden = s.phase === 'finished';
    // 手の とどく ところに 来そう: ボタンが 光る。ネットの 前なら「スパイク!」
    const near = b.state === 'fly' && b.vy < 0 && Math.hypot(b.x - me.x, b.z - me.z) < RULES.reach * 1.3 && b.y < RULES.spikeHi + 0.6 && Math.sign(b.x) === (me.side === 'L' ? -1 : 1) && !(b.lastSide === me.side && b.last === game.meIdx);
    $('hitP').classList.toggle('near', near);
    const mine = b.lastSide === me.side ? b.touches : 0;
    $('hitP').classList.toggle('spike', near && Math.abs(me.x) < RULES.spikeX && (mine >= 1 || b.lastSide !== me.side) && b.y > 1.2 && mine >= 1);
    const w = s.wind.until > s.t ? s.wind.z : 0;
    $('windP').hidden = !w || s.phase !== 'play';
    if (w) {
      const right = w * camSign() > 0;
      $('windP').querySelector('b').textContent = right ? '→' : '←';
      $('windTxtP').textContent = right ? 'みぎへ' : 'ひだりへ';
    }
  }
  const tmpV = new THREE.Vector3();
  function pop(text, x, y, z, cls = '', life = 800) {
    tmpV.set(x, y, z).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsP').append(el);
    setTimeout(() => el.remove(), life);
  }

  // ── できごと ────────────────────────────────────────
  const WHY = { land: 'イン!', out: 'アウト!', net: 'ネット!', touch: '4回 さわった!' };
  function onEvents(events) {
    const s = game.state;
    const mySide = s.units[game.meIdx].side;
    for (const e of events) {
      switch (e.type) {
        case 'start':
          splash('はじめ!');
          setTimeout(() => $('howtoP').classList.remove('show'), 7000);
          break;
        case 'serve':
          game.units[e.who].hitT = 1;
          game.units[e.who].hitKind = 'serve';
          sfx.serve();
          break;
        case 'hit': {
          const u = game.units[e.who];
          u.hitT = 1;
          u.hitKind = e.kind;
          const su = s.units[e.who];
          if (e.kind === 'spike') {
            sfx.spike();
            pop('スパイク!', su.x, 3.4, su.z, e.who === game.meIdx ? 'gold' : 'me', 900);
            sparkle(s.ball.x, s.ball.y, s.ball.z, 8, 0xffe07a);
            game.shake = 0.18;
          } else if (e.kind === 'toss') sfx.toss();
          else sfx.bump();
          if (e.kind !== 'spike' && su.side === mySide) pop(['', 'レシーブ', 'トス', 'アタック'][Math.min(3, e.touches)] || '', su.x, 2.6, su.z, 'me', 600);
          break;
        }
        case 'net':
          sfx.net();
          pop('ネット!', 0, 2.6, e.z, 'red', 900);
          break;
        case 'land':
          sfx.land();
          sandBurst(e.x, e.z, e.inside ? 14 : 8);
          break;
        case 'point': {
          for (const f of fans) f.cheer = 1.2 + Math.random() * 0.6;
          owl.play('flap', { fade: 0.1 });
          setTimeout(() => owl.play('idle', { fade: 0.3 }), 900);
          const win = e.side === mySide;
          sfx.whistle();
          setTimeout(() => sfx.point(win), 250);
          const el = $(`pt${e.side}P`);
          el.textContent = String(e.score[e.side]);
          el.classList.remove('bump');
          void el.offsetWidth;
          el.classList.add('bump');
          if (s.phase !== 'finished') {
            const by = e.by !== null ? s.units[e.by] : null;
            const name = by && by.slot === 0 ? 'ナイス!' : '';
            splash(`${WHY[e.why]} ${name}`.trim(), (win ? 'gold' : 'red') + ' small');
          }
          for (const j of s.teams[e.side]) game.units[j].cheer = 1.4;
          if (e.by !== null) pop('+1', s.units[e.by].x, 2.6, s.units[e.by].z, 'gold', 900);
          // マッチポイント
          const mp = (side) => s.score[side] === RULES.winScore - 1;
          if (s.phase !== 'finished' && (mp('L') || mp('R'))) setTimeout(() => { if (game?.state === s && s.phase !== 'finished') splash('マッチポイント!', 'gold small'); }, 900);
          break;
        }
        case 'wind':
          sfx.wind();
          splash(e.z * camSign() > 0 ? 'かぜ! みぎへ →' : 'かぜ! ← ひだりへ', 'small');
          break;
        case 'finished': {
          game.endTimer = 4.5;
          const win = e.winner === mySide;
          splash(e.timeUp ? (win ? 'じかんぎれ! かち!' : 'じかんぎれ… まけ') : win ? 'かった!' : 'まけた…', win ? 'gold' : 'red');
          if (win) sfx.fanfare();
          confetti(e.winner === 'L' ? -3.5 : 3.5, 0);
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
    $('resultTitle').textContent = `${mySide === s.winner ? 'あなたの チームの勝ち!' : 'あいての チームの勝ち!'} ${s.score.L} - ${s.score.R}`;
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = game.players[slot];
      const u = s.units.find((x) => x.slot === slot);
      const li = document.createElement('li');
      if (slot === 0) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : 'あなた';
      const def = CHARACTERS.find((c) => c.key === p.character);
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}・${u.side === s.winner ? 'かち' : 'まけ'}</small></span><span class="dist">${u.points}<small>きめた</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateWorld(dt) {
    const s = game.state;
    const b = s.ball;
    const mySide = s.units[game.meIdx].side;
    for (const [i, u] of game.units.entries()) {
      const su = s.units[i];
      u.hitT = Math.max(0, u.hitT - dt * 3.2);
      u.cheer = Math.max(0, u.cheer - dt);
      const moving = Math.hypot(su.vx, su.vz) > 0.5;
      let clip = moving ? 'run' : 'idle', face = 'normal';
      // ボールを 見る(うごいていない ときは ボールの ほうを 向く)
      let face2 = su.face;
      if (!moving && s.phase !== 'finished') face2 = Math.atan2(b.x - su.x, b.z - su.z);
      if (s.phase === 'finished') face2 = su.side === s.winner ? (su.side === 'L' ? -Math.PI / 2 : Math.PI / 2) : Math.atan2(-su.x, -su.z);
      u.holder.rotation.y = lerpAngle(u.holder.rotation.y, face2, Math.min(1, dt * 10));
      // スパイク: ジャンプ
      let y = 0;
      if (su.jump > 0) y = Math.sin((1 - su.jump / 0.45) * Math.PI) * 0.9;
      if (u.cheer > 0 && s.phase !== 'finished') { y = Math.abs(Math.sin(u.cheer * 9)) * 0.25; face = 'happy'; }
      if (s.phase === 'finished') {
        const won = su.side === s.winner;
        clip = won ? 'cheer' : 'idle';
        face = won ? 'happy' : 'frustrated';
        if (won) y = Math.abs(Math.sin(time * 6 + i)) * 0.35;
      }
      // 決着: 勝った チームは ベースラインの 近くに ならんで ばんざい(見た目だけ。state は そのまま)
      let px = su.x, pz = su.z;
      if (s.phase === 'finished' && su.side === s.winner) {
        u.gather = Math.min(1, (u.gather || 0) + dt * 1.6);
        const k = s.teams[su.side].indexOf(i);
        const e = u.gather * u.gather * (3 - 2 * u.gather);
        px += ((su.side === 'L' ? -4.2 : 4.2) - su.x) * e;
        pz += ((k - 1) * 1.25 - su.z) * e;
      } else u.gather = 0;
      u.holder.position.set(px, y, pz);
      if (moving && y < 0.05 && s.phase === 'play') {
        u.stepT = (u.stepT || 0) - dt;
        if (u.stepT <= 0) { u.stepT = 0.17; u.foot = -(u.foot || 1); footprint(px, pz, su.face, u.foot); }
      }
      u.model.play(clip, { timeScale: clip === 'run' ? 1.4 : 1 });
      u.model.setFace(u.hitT > 0.5 && u.hitKind === 'spike' ? 'surprised' : face);
      u.model.update(dt);
      // 腕: レシーブ(両手を 前で そろえる)/ トス(両手を 上へ)/ スパイク・サーブ(右手を ふりおろす)
      const [aL, aR] = u.arms;
      if (u.hitT > 0 && aL && aR) {
        const k = 1 - u.hitT;
        if (u.hitKind === 'pass' || u.hitKind === 'lob') {
          aL.rotation.x = aR.rotation.x = -1.2 + Math.sin(k * Math.PI) * -0.4;
          aL.rotation.z = 0.35; aR.rotation.z = -0.35;
        } else if (u.hitKind === 'toss') {
          aL.rotation.x = aR.rotation.x = -2.9 + Math.sin(k * Math.PI) * 0.3;
        } else {
          aR.rotation.x = k < 0.2 ? -3.0 : -3.0 + ((k - 0.2) / 0.8) * 3.6;
        }
      }
      // うけ身: ボールが 自分の 近くへ 落ちてくる あいだは 両手を 前に かまえる
      const close = b.state === 'fly' && Math.hypot(b.x - su.x, b.z - su.z) < 1.4 && b.vy < 0 && u.hitT <= 0 && aL && aR && Math.sign(b.x) === (su.side === 'L' ? -1 : 1);
      if (close) { aL.rotation.x = aR.rotation.x = -0.9; }
      if (u.marker) u.marker.position.set(0, 2.25 * u.size + 0.1 * Math.sin(performance.now() / 180), 0);
    }
    // ボール
    if (b.state === 'serve') {
      // サーバーの 手の上で ぽんぽん
      ball.position.set(b.x + (b.x < 0 ? 0.3 : -0.3), 1.5 + Math.abs(Math.sin(time * 5)) * 0.4, b.z);
    } else ball.position.set(b.x, b.y, b.z);
    ball.rotation.x += dt * (b.kind === 'spike' ? 22 : 6);
    ball.rotation.z += dt * 3;
    shadow.position.set(ball.position.x, 0.015, ball.position.z);
    const hy = Math.max(0, ball.position.y);
    shadow.scale.setScalar(1 + hy * 0.12);
    shadow.material.opacity = Math.max(0.15, 0.5 - hy * 0.05);
    // 落ちる ところ(自分の チームへ 来る ボール)
    const land = b.state === 'fly' ? landing(s) : null;
    const toMe = land && Math.sign(land.x) === (mySide === 'L' ? -1 : 1) && b.lastSide !== mySide;
    landRing.visible = !!toMe;
    if (toMe) {
      landRing.position.set(land.x, 0.02, land.z);
      landRing.material.color.setHex(TEAM_COLORS[mySide]);
      landRing.scale.setScalar(0.8 + Math.min(1, land.t) * 0.6 + Math.sin(time * 10) * 0.05);
      landRing.material.opacity = 0.5 + 0.4 * (1 - Math.min(1, land.t));
    }
    // スパイクの すじ
    trailPos.unshift(ball.position.clone());
    trailPos.length = Math.min(trailPos.length, trail.length * 2);
    trail.forEach((m, k) => {
      const p = trailPos[(k + 1) * 2 - 1];
      m.visible = !!p && b.kind === 'spike' && b.state === 'fly';
      if (p) m.position.copy(p);
      m.material.opacity = 0.55 * (1 - k / trail.length);
    });
    stage.update(time, s.wind.until > s.t ? s.wind.z / RULES.windAcc : 0);
    updateSteps(dt);
    // 見物: ふだんは ゆらゆら。点が 入ると ばんざい
    for (const f of fans) {
      f.cheer = Math.max(0, f.cheer - dt);
      f.model.play(f.cheer > 0 || s.phase === 'finished' ? 'cheer' : 'idle');
      f.model.setFace(f.cheer > 0 || s.phase === 'finished' ? 'happy' : 'normal');
      f.model.root.position.y = f.cheer > 0 ? Math.abs(Math.sin(f.cheer * 8 + f.phase)) * 0.2 : 0;
      // ボールを 目で おう
      f.model.root.rotation.y = lerpAngle(f.model.root.rotation.y, Math.atan2(b.x - f.seat.x, b.z - f.seat.z), Math.min(1, dt * 3));
      f.model.update(dt);
    }
    // フクロウ先生も ボールを 見る
    owl.root.rotation.y = lerpAngle(owl.root.rotation.y, Math.atan2(b.x - stage.umpire.x, b.z - stage.umpire.z), Math.min(1, dt * 4));
    owl.update(dt);
  }
  const lerpAngle = (a, b, k) => {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
  };

  // 自分が 左の チームなら +1(カメラは -x がわ)、右なら -1
  const camSign = () => (game && game.state.units[game.meIdx].side === 'R' ? -1 : 1);
  let freeCamera = false;
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    // 自分の チームの うしろの 上から、ネットの むこうまで 見わたす(自分の コートが 手前)
    const f = camSign();
    const pos = portrait ? new THREE.Vector3(-f * 18.5, 17, 0) : new THREE.Vector3(-f * 12.5, 8.2, 0);
    const look = new THREE.Vector3(f * (portrait ? 0.8 : 1.2), 0, 0);
    const s = game?.state;
    if (s && s.phase === 'finished') {
      // 決着: 勝った チームを むこうの はし(ベースラインの 外)から。うしろに ネット
      const sw = s.winner === 'L' ? -1 : 1;
      look.set(sw * 4.2, 1.0, 0);
      pos.set(sw * (4.2 + (portrait ? 7.5 : 6)), portrait ? 3.4 : 2.8, 0);
    } else if (s && s.phase === 'play') {
      // ボールの ほうへ すこし よる
      look.z += Math.max(-1.5, Math.min(1.5, s.ball.z * 0.25));
      pos.z = look.z * 0.5;
    }
    camera.fov = portrait ? 50 : 45;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(6, 14, -30);
      camera.position.lerpVectors(sky, pos, e);
      camera.userData.look = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 4, -80), look, Math.min(1, e * 1.1));
      camera.lookAt(camera.userData.look);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * (s?.phase === 'finished' ? 4 : 2.5));
    camera.position.lerp(pos, k);
    camera.userData.look = camera.userData.look ? camera.userData.look.lerp(look, k) : look.clone();
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
    } else if (!game) stage.update(time, 0);
    atmosphere.update(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  // E2E・確認用
  window.dvolley = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    steer: (t) => { input.target = t; },
    hit: () => { input.hit = true; },
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
      $('stickP').hidden = true;
    },
    get intro() { return intro; },
  };
}
