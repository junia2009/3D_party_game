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
import { MOSS, RULES, STEP, aliveSlots, bodyR, createGame, ranking, step } from './rules.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { SEATS, WATER_Y, buildStage } from './stage.js';
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
    // ゴゴゴ: 土俵が ちぢむ
    rumble() { noise({ len: 1.2, gain: 0.15, freq: [200, 80], type: 'lowpass', attack: 0.2 }); },
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
  function crumb(r) {
    const a = Math.random() * Math.PI * 2;
    const m = new THREE.Mesh(chipGeo, chipMat);
    m.position.set(Math.cos(a) * (r + 0.1), -0.05, Math.sin(a) * (r + 0.1));
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 1.2, vel: new THREE.Vector3(Math.cos(a) * 0.8, 0.8, Math.sin(a) * 0.8), spin: new THREE.Vector3(5, 3, 4), kind: 'crumb' });
  }
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
      return { model, holder, body, shadow: sh, ring, size, scale: 1, fall: null, happyT: 0, lean: 0, dustAcc: 0 };
    }));
    // 自分の頭の上に しるし
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    runners[0].holder.add(marker);
    runners[0].marker = marker;

    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), runners, acc: 0, endTimer: null, lastR: RULES.r0, shake: 0 };
    atmosphere.apply(params.get('time') || state.timeOfDay);
    atmosphere.setupShadows(runners.map((r) => r.holder), runners.map((r) => r.holder));
    Object.assign(input, { touch: null, stick: null, target: null, hold: false, holdPointer: null, holdKey: false });
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoU').classList.add('show');
    if (!fromSky) splash('はっけよい…');
    updateStump();
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
  function renderHud() {
    const s = game.state;
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
          splash('土俵が ちぢむ!', 'red');
          sfx.rumble();
          game.shake = 0.25;
          break;
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
          break;
        }
        case 'finished': {
          game.endTimer = 3.6;
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
        v.body.rotation.set(0, 0, 0);
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
        // とっしん中は土ぼこり
        if (r.dash > 0) {
          v.dustAcc += dt;
          if (v.dustAcc > 0.04) { v.dustAcc = 0; puff(r.x - fwdX * 0.3, r.z - fwdZ * 0.3, 1); }
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
  // 切り株の大きさを土俵に合わせる。ちぢむときは ふちから木くずが落ちる
  function updateStump() {
    const R = game ? game.state.radius : RULES.r0;
    stage.stump.scale.set(R, 1, R);
    MOSS.forEach((m, k) => { stage.mosses[k].visible = Math.hypot(m.x, m.z) + RULES.mossR * 0.3 < R; });
    if (game && game.lastR - R > 0.04) {
      game.lastR = R;
      crumb(R);
      if (Math.random() < 0.3) sfx.plop(0.6);
    }
  }

  let freeCamera = false;
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const s = game?.state;
    let pos, look;
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
    camera.fov = portrait ? 58 : 46;
    camera.aspect = aspect;
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
    const dt = Math.min(rawDt, 0.1);
    time += dt;
    if (mode === 'playing' && intro >= 1) watchQuality(rawDt);
    if (intro < 1 && !paused) {
      intro = Math.min(1, intro + dt / INTRO_TIME);
      if (intro >= 1) splash('はっけよい…');
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
      updateStump();
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
