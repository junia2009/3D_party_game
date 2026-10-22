// 森の湖の いろいろキノコ の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
//
// 動かし方: 画面の どこでも 指を おいて ずらすと 走る(どこでもスティック)。右下の ボタンで ジャンプ、
// 空中で もう一度 おすと ヒップドロップ。パソコンは 矢印 / WASD と スペース。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { HEXES, RULES, STEP, createGame, moveTime, ranking, step } from './rules.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { OWL_AT, PALETTE, SINK_Y, WATER_Y, buildFlag, buildMushrooms, buildStage, css as colorCss } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);

export async function createKinoko({ renderer, settings, getAudio, onExit }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 700);
  const atmosphere = createAtmosphere(scene, renderer, camera, { course: false });
  const stage = buildStage(scene);
  const mushrooms = buildMushrooms(scene);

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
    // ピッ: 旗(色ごとに 高さが ちがう)
    flag(id) { const f = 520 + id * 70; voice({ type: 'square', pts: [[0, f]], len: 0.12, gain: 0.05 }); voice({ type: 'square', pts: [[0, f * 1.5]], len: 0.22, gain: 0.05, at: 0.12 }); },
    // チッ チッ: もうすぐ しずむ
    tick() { voice({ type: 'square', pts: [[0, 1600]], len: 0.03, gain: 0.03 }); },
    // ゴボゴボ: しずむ
    sink() { noise({ len: 0.7, gain: 0.12, freq: [600, 150], type: 'lowpass', attack: 0.05 }); for (let i = 0; i < 4; i++) voice({ pts: [[0, 300 + Math.random() * 200], [0.06, 600]], len: 0.08, gain: 0.03, at: 0.1 + i * 0.12 }); },
    rise() { voice({ pts: [[0, 300], [0.5, 600]], len: 0.5, gain: 0.03 }); },
    jump() { voice({ pts: [[0, 480], [0.1, 760]], len: 0.12, gain: 0.05 }); },
    drop() { voice({ type: 'triangle', pts: [[0, 900], [0.15, 300]], len: 0.16, gain: 0.05 }); },
    slam(vol = 1) { noise({ len: 0.3, gain: 0.2 * vol, freq: [500, 80], type: 'lowpass', attack: 0.004 }); voice({ type: 'triangle', pts: [[0, 160], [0.2, 60]], len: 0.22, gain: 0.1 * vol }); },
    stomp(vol = 1) { voice({ type: 'square', pts: [[0, 300], [0.08, 600], [0.16, 200]], len: 0.18, gain: 0.05 * vol }); },
    bump(vol = 1) { voice({ type: 'triangle', pts: [[0, 260], [0.1, 140]], len: 0.12, gain: 0.05 * vol }); },
    splash(vol = 1) { noise({ len: 0.9, gain: 0.25 * vol, freq: [1500, 300], type: 'lowpass', q: 0.6, attack: 0.005 }); voice({ pts: [[0, 500], [0.25, 120]], len: 0.3, gain: 0.08 * vol }); },
    beep(last) { voice({ type: 'square', pts: [[0, last ? 1320 : 660]], len: last ? 0.5 : 0.16, gain: 0.05 }); },
    fanfare() {
      [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1047]].forEach(([at, f]) => voice({ type: 'square', pts: [[0, f]], len: 0.12, gain: 0.05, at }));
      voice({ type: 'square', pts: [[0, 1047]], len: 0.6, gain: 0.05, at: 0.5, vib: 12, vibRate: 7 });
    },
  };
  function volFor(x, z) {
    const me = game.state.runners[0];
    return Math.max(0.25, 1 - Math.hypot(x - me.x, z - me.z) / 9);
  }

  // ── 先生と 旗 ───────────────────────────────────
  await preload([...CHARACTERS.map((c) => c.key), 'hoho']);
  const owl = await createModel('hoho');
  owl.play('idle');
  owl.root.position.copy(OWL_AT);
  owl.root.rotation.y = Math.atan2(-OWL_AT.x, -OWL_AT.z) * 0.6 + 0.4;
  owl.root.scale.setScalar(1.3);
  scene.add(owl.root);
  const flag = buildFlag();
  flag.g.position.set(OWL_AT.x - 1.7, OWL_AT.y, OWL_AT.z + 0.4); // 先生の よこ(カメラから 見て 体に かさならない)
  flag.g.scale.setScalar(2.0);
  scene.add(flag.g);
  let flagUp = 0; // 0 さげている 〜 1 あげている

  // ── しぶき・けむり・紙ふぶき ───────────────────────
  const fx = [];
  const puffGeo = new THREE.SphereGeometry(0.2, 6, 4);
  function puff(x, y, z, n = 4, color = 0xffffff, size = 1) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
      m.position.set(x + (Math.random() - 0.5) * 0.4, y + Math.random() * 0.2, z + (Math.random() - 0.5) * 0.4);
      m.scale.setScalar(size);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 0.6 + Math.random() * 0.3, vel: new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.6 + Math.random(), (Math.random() - 0.5) * 1.6), kind: 'puff', size });
    }
  }
  function splashAt(x, z, n = 14) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: i % 3 ? 0xe8f8ff : 0x9ad8f0, transparent: true }));
      m.position.set(x, WATER_Y + 0.1, z);
      m.scale.setScalar(0.5 + Math.random() * 0.5);
      scene.add(m);
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.5;
      fx.push({ obj: m, t: 0, life: 0.9, vel: new THREE.Vector3(Math.cos(a) * sp, 3 + Math.random() * 3, Math.sin(a) * sp), kind: 'drop' });
    }
    ripple(x, z);
  }
  const ringGeo = new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2);
  function ripple(x, z, y = WATER_Y + 0.03, color = 0xffffff, size = 1) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    m.position.set(x, y, z);
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 1.0, vel: new THREE.Vector3(), kind: 'ring', size });
  }
  const starGeo = (() => {
    const sh = new THREE.Shape();
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 0.08 : 0.2;
      if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return new THREE.ShapeGeometry(sh);
  })();
  function stars(x, y, z, n = 8) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(starGeo, new THREE.MeshBasicMaterial({ color: [0xffd23c, 0xffffff, 0xff8fd0][i % 3], transparent: true, side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      scene.add(m);
      const a = (i / n) * Math.PI * 2;
      fx.push({ obj: m, t: 0, life: 0.5, vel: new THREE.Vector3(Math.cos(a) * 3, 2 + Math.random() * 2, Math.sin(a) * 3), kind: 'spark' });
    }
  }
  // 魚: 遠くの 水面から ぴょんと はねて、ぽちゃん
  const fishGeo = new THREE.SphereGeometry(0.18, 8, 6).scale(1, 0.6, 2.2);
  const fishMat = new THREE.MeshToonMaterial({ color: 0xff9a3a });
  function fish() {
    const a = Math.random() * Math.PI * 2, d = 8 + Math.random() * 8;
    const x = Math.cos(a) * d, z = Math.sin(a) * d - 2;
    const m = new THREE.Mesh(fishGeo, fishMat.clone());
    m.position.set(x, WATER_Y, z);
    scene.add(m);
    ripple(x, z);
    const dir = Math.random() * Math.PI * 2;
    fx.push({ obj: m, t: 0, life: 0.9, vel: new THREE.Vector3(Math.cos(dir) * 1.6, 4.4, Math.sin(dir) * 1.6), kind: 'fish', dir });
  }
  // あわ(しずむ キノコから ぶくぶく)
  const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.8 });
  function bubble(x, z) {
    const m = new THREE.Mesh(puffGeo, bubbleMat.clone());
    m.position.set(x + (Math.random() - 0.5) * 2.6, WATER_Y + 0.02, z + (Math.random() - 0.5) * 2.6);
    m.scale.setScalar(0.3 + Math.random() * 0.5);
    m.scale.y *= 0.5;
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 0.5 + Math.random() * 0.3, vel: new THREE.Vector3(0, 0.2, 0), kind: 'bubble' });
  }
  // しずく(上がってきた キノコの ふちから ぽたぽた)
  function drip(x, y, z) {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xc8ecff, transparent: true }));
    m.scale.set(0.3, 0.45, 0.3);
    m.position.set(x, y, z);
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 0.6, vel: new THREE.Vector3(0, -0.5, 0), kind: 'drop' });
  }
  // 旗の キノコに 立つ 光の 柱
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(RULES.hexR * 0.8, RULES.hexR * 0.95, 6, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.rotation.y = Math.PI / 6;
  beam.position.y = 3;
  scene.add(beam);
  // うきわ(落ちた 子が 湖で つかまる)
  const tubeGeo = new THREE.TorusGeometry(0.55, 0.2, 8, 18).rotateX(Math.PI / 2);
  const confettiGeo = new THREE.PlaneGeometry(0.12, 0.07);
  function confetti(x, z) {
    const colors = Object.values(PALETTE).map((p) => p.top);
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
      if (f.kind === 'puff') {
        f.vel.multiplyScalar(Math.exp(-3 * dt));
        f.obj.scale.setScalar(f.size * (1 + k * 1.6));
        f.obj.material.opacity = 0.85 * (1 - k);
      } else if (f.kind === 'drop') {
        f.vel.y -= 14 * dt;
        f.obj.material.opacity = 1 - k;
        if (f.obj.position.y < WATER_Y) f.t = f.life;
      } else if (f.kind === 'spark') {
        f.vel.y -= 10 * dt;
        f.obj.lookAt(camera.position);
        f.obj.material.opacity = 1 - k;
      } else if (f.kind === 'ring') {
        f.obj.scale.setScalar(f.size * (0.4 + k * 1.8));
        f.obj.material.opacity = 0.8 * (1 - k);
      } else if (f.kind === 'bubble') {
        f.obj.material.opacity = 0.8 * (1 - k);
        f.obj.scale.multiplyScalar(1 + dt * 1.5);
      } else if (f.kind === 'fish') {
        f.vel.y -= 10 * dt;
        f.obj.rotation.set(-Math.atan2(f.vel.y, 1.6), Math.PI / 2 - f.dir, 0);
        if (!f.plop && f.obj.position.y < WATER_Y) { f.plop = true; ripple(f.obj.position.x, f.obj.position.z); }
      } else if (f.kind === 'confetti') {
        f.obj.rotation.x += f.spin.x * dt;
        f.obj.rotation.y += f.spin.y * dt;
        f.obj.material.opacity = Math.min(1, (1 - k) * 3);
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

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS });
    if (game) for (const r of game.runners) scene.remove(r.holder);
    for (const f of fx.splice(0)) scene.remove(f.obj);
    const state = createGame(players, seed);
    const runners = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const holder = new THREE.Group();
      holder.add(model.root);
      scene.add(holder);
      const def = CHARACTERS.find((c) => c.key === p.character);
      return { model, holder, size: def.size || 1, out: null, landK: 0 };
    }));
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    runners[0].holder.add(marker);
    runners[0].marker = marker;
    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), runners, acc: 0, endTimer: null, shake: 0, duel: false, count: 4, tick: 0 };
    atmosphere.apply(params.get('time') || 'day');
    atmosphere.setupShadows([...runners.map((r) => r.holder), ...mushrooms], [stage.group, ...mushrooms]);
    Object.assign(input, { touch: null, stick: null, jump: false, target: null });
    $('flagG').hidden = true;
    flagUp = 0;
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoG').classList.add('show');
    if (!fromSky) splash('よーい…');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudG').hidden = m !== 'playing';
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
  $('pauseBtnG').addEventListener('click', mine(() => setPaused(true)));
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
  const stickEl = $('stickG'), knobEl = stickEl.firstElementChild;
  const jumpEl = $('jumpG');
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
    $('howtoG').classList.remove('show');
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
      $('howtoG').classList.remove('show');
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
    const el = $('splashG');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildChips() {
    $('chipsG').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'chip' + (slot === 0 ? ' me' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      d.innerHTML = '<i></i><b></b>';
      return d;
    }));
  }
  function renderHud() {
    const s = game.state;
    [...$('chipsG').children].forEach((c, i) => c.classList.toggle('out', !s.runners[i].alive));
    $('jumpG').hidden = s.phase === 'finished' || !s.runners[0].alive;
    const el = $('flagG');
    if (s.stage === 'signal' && s.flag !== null) {
      const k = Math.max(0, s.stageT / moveTime(s.round));
      el.style.setProperty('--k', String(k));
      el.classList.toggle('hurry', s.stageT < 0.8);
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
    $('popsG').append(el);
    setTimeout(() => el.remove(), life);
  }

  // ── できごと ────────────────────────────────────────
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'start':
          splash('スタート!');
          sfx.beep(true);
          setTimeout(() => $('howtoG').classList.remove('show'), 6000);
          break;
        case 'flag': {
          const el = $('flagG');
          el.style.setProperty('--c', colorCss(e.color));
          el.hidden = false;
          el.classList.remove('hurry');
          el.style.animation = 'none';
          void el.offsetWidth;
          el.style.animation = '';
          flag.cloth.material.color.set(colorCss(e.color));
          owl.play('flap', { fade: 0.1 });
          setTimeout(() => owl.play('idle', { fade: 0.3 }), 900);
          sfx.flag(e.id);
          // 旗の キノコが ぴかっ
          mushrooms[e.id].userData.flash = 1;
          if (e.round === 4) setTimeout(() => splash('だんだん はやく!', 'gold small'), 300);
          break;
        }
        case 'sink':
          $('flagG').hidden = true;
          sfx.sink();
          for (const m of mushrooms) if (m.userData.hex.id !== e.keep) { const h = m.userData.hex; ripple(h.x, h.z, WATER_Y + 0.03, 0xffffff, 1.6); }
          break;
        case 'rise':
          sfx.rise();
          flagUp = 0;
          break;
        case 'jump': {
          if (e.slot === 0) sfx.jump();
          const r = s.runners[e.slot];
          puff(r.x, 0.05, r.z, 2, 0xffffff, 0.7);
          break;
        }
        case 'drop':
          if (e.slot === 0 || volFor(s.runners[e.slot].x, s.runners[e.slot].z) > 0.5) sfx.drop();
          break;
        case 'slam': {
          sfx.slam(volFor(e.x, e.z));
          { const h = HEXES.find((q) => Math.hypot(q.x - e.x, q.z - e.z) < RULES.hexR); if (h) { mushrooms[h.id].userData.boing = 1; ripple(h.x, h.z, WATER_Y + 0.03, 0xffffff, 2.2); } }
          puff(e.x, 0.05, e.z, 8, 0xffffff, 1.2);
          ripple(e.x, e.z, 0.04, 0xffd23c, 1.5);
          stars(e.x, 0.6, e.z, 10);
          pop('ドスン!', e.x, 1.6, e.z, 'gold');
          game.shake = Math.max(game.shake, 0.25);
          break;
        }
        case 'knock': {
          const r = s.runners[e.slot];
          pop('わっ!', r.x, 1.8, r.z);
          break;
        }
        case 'stomp': {
          const r = s.runners[e.target];
          sfx.stomp(volFor(r.x, r.z));
          stars(r.x, 1.2, r.z, 7);
          pop('ふんづけ!', r.x, 2.0, r.z, 'gold');
          break;
        }
        case 'bump':
          if (e.force > 3) sfx.bump(volFor(e.x, e.z));
          break;
        case 'fall': {
          const u = game.runners[e.slot];
          u.out = { t: 0, x: e.x, z: e.z, y: 0, vy: 1.5 };
          pop(e.sunk ? 'ブクブク…' : 'あ〜っ!', e.x, 1.6, e.z, e.slot === 0 ? 'red' : 'out');
          if (e.slot === 0) splash('おちちゃった…', 'red small');
          if (s.phase === 'play' && s.runners.filter((x) => x.alive).length === 2 && !game.duel) {
            game.duel = true;
            setTimeout(() => splash('いっきうち!', 'gold small'), 900);
          }
          break;
        }
        case 'finished': {
          game.endTimer = 4.5;
          $('flagG').hidden = true;
          const win = e.winner === 0;
          splash(e.timeUp ? 'じかん ぎれ!' : win ? 'さいごの 1人!' : 'しゅうりょう!', win ? 'gold' : '');
          if (win) sfx.fanfare();
          const r = s.runners[e.winner];
          confetti(r.x, r.z);
          owl.play('flap', { fade: 0.1 });
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
        `<span>${def.name}<small>${who}</small></span><span class="dist">${r.alive ? 'のこった!' : ''}<small>${r.survived} かい セーフ</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateWorld(dt) {
    const s = game.state;
    // キノコ: しずむ / 上がる。しずむ 少し前は ぷるぷる
    for (const m of mushrooms) {
      const id = m.userData.hex.id;
      const k = s.sink[id];
      const e = k * k * (3 - 2 * k);
      // 上がりきったら ぽよん
      if (k === 0 && (m.userData.prevK ?? 0) > 0) m.userData.boing = 1;
      if (k > 0 && k < 1 && s.stage !== 'rise' && Math.random() < 0.5) bubble(m.userData.hex.x, m.userData.hex.z);
      if (s.stage === 'rise' && k > 0.02 && k < 0.6 && Math.random() < 0.35) {
        const a = Math.random() * Math.PI * 2;
        drip(m.userData.hex.x + Math.cos(a) * RULES.hexR * 0.85, m.position.y - 0.3, m.userData.hex.z + Math.sin(a) * RULES.hexR * 0.85);
      }
      m.userData.prevK = k;
      m.userData.boing = Math.max(0, (m.userData.boing || 0) - dt * 2.5);
      const bo = Math.sin(m.userData.boing * Math.PI * 2) * m.userData.boing * 0.08;
      m.scale.set(1 - bo, 1 + bo, 1 - bo);
      m.position.y = SINK_Y * e;
      m.rotation.x = Math.sin(id * 1.7) * 0.12 * Math.sin(k * Math.PI);
      const warn = s.stage === 'signal' && id !== s.flag && s.stageT < 0.9;
      const w = warn ? (0.9 - s.stageT) * 0.06 : 0;
      m.position.x = m.userData.hex.x + Math.sin(time * 45 + id) * w;
      m.position.z = m.userData.hex.z + Math.cos(time * 39 + id) * w;
      m.rotation.z = Math.sin(time * 31 + id) * w * 0.5;
      // 旗の キノコは ぴかっと 光る
      m.userData.flash = Math.max(0, (m.userData.flash || 0) - dt * 1.5);
      const glow = s.stage === 'signal' && id === s.flag ? 0.25 + Math.sin(time * 10) * 0.1 : m.userData.flash * 0.5;
      m.userData.top.emissive.setRGB(glow, glow, glow * 0.8);
      // 旗の あいだ、ほかの キノコは 少し くらく
      const dim = s.stage === 'signal' && s.flag !== null && id !== s.flag ? Math.min(1, (1 - s.stageT / moveTime(s.round)) * 1.5) * 0.3 : 0;
      m.userData.top.color.setScalar(1 - dim);
    }
    // 光の 柱: 旗の キノコに
    const show = (s.stage === 'signal' || s.stage === 'sink') && s.flag !== null;
    if (show) { const h = HEXES[s.flag]; beam.position.x = h.x; beam.position.z = h.z; beam.material.color.set(colorCss(h.color)); }
    beam.material.opacity += ((show ? 0.22 + Math.sin(time * 6) * 0.05 : 0) - beam.material.opacity) * Math.min(1, dt * 8);
    beam.visible = beam.material.opacity > 0.01;
    // 先生の 旗: 旗の あいだは 上に、ほかは 下に
    const want = s.stage === 'signal' || s.stage === 'sink' || s.stage === 'hold' ? 1 : 0;
    flagUp += (want - flagUp) * Math.min(1, dt * 10);
    flag.g.rotation.z = (1 - flagUp) * 1.3;
    flag.cloth.rotation.y = Math.sin(time * 6) * 0.25;
    owl.update(dt);
    // 子
    for (const [slot, u] of game.runners.entries()) {
      const r = s.runners[slot];
      let clip = 'idle', face = 'normal';
      if (u.out) {
        // 湖へ ざぶん → ぷかぷか うかぶ
        const o = u.out;
        o.t += dt;
        if (!o.splashed) {
          o.vy -= 18 * dt;
          o.y += o.vy * dt;
          if (o.y < WATER_Y) {
            o.splashed = true;
            splashAt(o.x, o.z);
            sfx.splash(volFor(o.x, o.z));
            // ぷかっと うきわが 出てくる
            if (!u.tube) { u.tube = new THREE.Mesh(tubeGeo, new THREE.MeshToonMaterial({ color: PLAYER_COLORS[slot].hex })); u.holder.add(u.tube); }
            u.tube.visible = true;
            u.tube.position.y = 0.55;
            u.tube.scale.setScalar(0.01);
          }
        } else {
          o.y += (WATER_Y - 0.55 + Math.sin(o.t * 2.5 + slot) * 0.06 - o.y) * Math.min(1, dt * 4);
          // しずむ キノコから 少し はなれて ただよう
          o.x += (o.x / (Math.hypot(o.x, o.z) || 1)) * dt * 0.15;
          o.z += (o.z / (Math.hypot(o.x, o.z) || 1)) * dt * 0.15;
        }
        u.holder.position.set(o.x, o.y, o.z);
        u.holder.rotation.set(0, u.holder.rotation.y + dt * 0.4, 0);
        if (u.tube) u.tube.scale.setScalar(Math.min(1, u.tube.scale.x + dt * 4));
        if (o.splashed && Math.random() < dt * 1.2) ripple(o.x, o.z, WATER_Y + 0.03, 0xffffff, 0.7);
        clip = o.splashed ? 'wave' : 'dizzy';
        face = 'frustrated';
      } else {
        const moving = Math.hypot(r.vx, r.vz) > 0.4;
        clip = r.air ? 'cheer' : moving ? 'run' : 'idle';
        // 足もとの キノコと いっしょに 上下(しずみかけの キノコの 上)
        let base = 0;
        if (!r.air) for (const m of mushrooms) { const h = m.userData.hex; if (Math.hypot(r.x - h.x, r.z - h.z) < RULES.hexR * 0.95) { base = m.position.y; break; } }
        u.holder.position.set(r.x, r.y + base, r.z);
        // ヒップドロップ: 空中で くるっと 1回転してから まっすぐ
        u.spin = r.dropping && r.drop > 0 ? (u.spin || 0) + dt * 40 : 0;
        u.holder.rotation.set(r.dropping ? Math.PI * 0.15 : 0, r.face + u.spin, 0);
        // ふんづけられて ぺしゃんこ / 着地で むにゅっ
        if (!r.air && u.wasAir) u.landK = 1;
        u.wasAir = r.air;
        u.landK = Math.max(0, u.landK - dt * 5);
        const sq = r.squash > 0 ? 0.45 : 1 - Math.sin(u.landK * Math.PI) * 0.18;
        u.holder.scale.set(1 + (1 - sq) * 0.6, sq, 1 + (1 - sq) * 0.6);
        if (r.squash > 0 || r.stun > 0) { clip = 'dizzy'; face = 'frustrated'; }
        if (s.stage === 'signal' && s.stageT < 0.8 && s.flag !== null) {
          const h = HEXES[s.flag];
          if (Math.hypot(r.x - h.x, r.z - h.z) > RULES.hexR) face = 'surprised';
        }
        if (s.phase === 'finished') { clip = 'cheer'; face = 'happy'; }
      }
      u.model.play(clip);
      u.model.setFace(face);
      u.model.update(dt);
      if (u.marker) {
        u.marker.visible = !u.out;
        u.marker.position.set(0, 2.0 * u.size + 0.1 * Math.sin(performance.now() / 180), 0);
      }
    }
    // もうすぐ しずむ: チッ チッ
    if (s.stage === 'signal' && s.stageT < 1.0 && s.phase === 'play') {
      game.tick -= dt;
      if (game.tick <= 0) { game.tick = 0.2; sfx.tick(); }
    }
    stage.water.material.map.offset.x += dt * 0.01;
    stage.update(time);
    // ときどき 魚が ぴょんと はねる
    game.fishT = (game.fishT ?? 3) - dt;
    if (game.fishT <= 0) { game.fishT = 4 + Math.random() * 5; fish(); }
  }

  let freeCamera = false;
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const pos = portrait ? new THREE.Vector3(0, 21, 17) : new THREE.Vector3(0, 13, 14.5);
    const look = new THREE.Vector3(0, portrait ? -0.6 : -0.3, portrait ? 0.4 : 0.2);
    const s = game?.state;
    if (s && (game.duel || s.phase === 'finished')) {
      const alive = s.runners.filter((r) => r.alive);
      const target = s.phase === 'finished' && s.winner !== null ? [s.runners[s.winner]] : alive;
      if (target.length) {
        const mx = target.reduce((a, r) => a + r.x, 0) / target.length, mz = target.reduce((a, r) => a + r.z, 0) / target.length;
        const near = s.phase === 'finished' ? 0.5 : 0.8;
        look.set(mx * 0.6, 0.3, mz * 0.6);
        pos.set(look.x, look.y + (pos.y - look.y) * near, look.z + (pos.z - look.z) * near);
      }
    }
    camera.fov = portrait ? 52 : 45;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(-6, 16, -22);
      camera.position.lerpVectors(sky, pos, e);
      camera.userData.look = new THREE.Vector3().lerpVectors(OWL_AT, look, Math.min(1, e * 1.1));
      camera.lookAt(camera.userData.look);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 4);
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
    // スタートの 合図: 3・2・1
    if (game && mode === 'playing' && intro >= 1 && game.state.phase === 'ready') {
      const n = Math.ceil(RULES.readyTime - game.state.t);
      if (n < game.count && n >= 1) { game.count = n; splash(String(n), 'small'); sfx.beep(false); }
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
    atmosphere.update(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  // E2E・確認用
  window.dkinoko = {
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
      $('stickG').hidden = true;
    },
    get intro() { return intro; },
  };
}
