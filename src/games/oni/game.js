// 夕ぐれの 森の 広場の おにごっこ の画面(ひとり + CPU / オンライン)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
//
// 動かし方: 画面の どこでも 指を おいて ずらすと、その 向きへ 走る(どこでもスティック)。
// 右下の「ダッシュ」で ひと走り。パソコンは 矢印 / WASD で 走って、スペースで ダッシュ。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonMaterial } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { RULES, STEP, createGame, points, ranking, step, timeLeft } from './rules.js';
import { createNetDriver, replaceState } from '../../net/drive.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { FLOOR_Y, buildStage, glowTex } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);

export async function createOni({ renderer, settings, getAudio, onExit }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 700);
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
  // 効果音の 高さは SFX_BAND(450〜1600Hz)の 中に おく
  const sfx = {
    // ポンッ: タッチ
    tag(vol = 1) {
      voice({ type: 'triangle', pts: [[0, 880], [0.08, 1300], [0.2, 700]], len: 0.22, gain: 0.12 * vol });
      noise({ len: 0.1, gain: 0.06 * vol, freq: [1600, 600], type: 'lowpass', attack: 0.003 });
    },
    // じゃーん(ひくめ): 自分が 鬼に なった
    oni() { [[0, 620], [0.14, 520], [0.28, 466]].forEach(([at, f]) => voice({ type: 'square', pts: [[0, f]], len: 0.18, gain: 0.05, at })); },
    // ヒュッ: ダッシュ
    dash(vol = 1) { noise({ len: 0.28, gain: 0.08 * vol, freq: [700, 1600], q: 0.9 }); },
    // がさがさ: 草むら
    rustle(vol = 1) { noise({ len: 0.22, gain: 0.05 * vol, freq: [1500, 900], q: 0.6 }); noise({ len: 0.18, gain: 0.04 * vol, freq: [1200, 700], q: 0.6, at: 0.1 }); },
    // きらりん: 金の どんぐり
    pick(vol = 1) { [988, 1318, 1568].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.16, gain: 0.07 * vol, at: i * 0.06 })); },
    // ぽとん: どんぐりが 落ちてくる
    drop(vol = 1) { voice({ pts: [[0, 1400], [0.15, 600]], len: 0.18, gain: 0.05 * vol }); },
    // チッ チッ: のこり すこし
    tick() { voice({ type: 'square', pts: [[0, 1200]], len: 0.05, gain: 0.03 }); },
    beep(last) { voice({ type: 'square', pts: [[0, last ? 1320 : 660]], len: last ? 0.5 : 0.16, gain: 0.05 }); },
    whistle() { voice({ pts: [[0, 1500], [0.4, 1100]], len: 0.45, gain: 0.05 }); voice({ pts: [[0, 1500]], len: 0.5, gain: 0.04, at: 0.5 }); },
    fanfare() {
      [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1047]].forEach(([at, f]) => voice({ type: 'square', pts: [[0, f]], len: 0.12, gain: 0.05, at }));
      voice({ type: 'square', pts: [[0, 1047]], len: 0.6, gain: 0.05, at: 0.5 });
    },
  };
  function volFor(x, z) {
    const me = game.state.runners[game.me];
    return Math.max(0.2, 1 - Math.hypot(x - me.x, z - me.z) / 12);
  }

  await preload(CHARACTERS.map((c) => c.key));

  // ── 鬼の しるし: 赤い つのの かちゅーしゃ と 足もとの 赤い 輪 ──
  function makeHorns() {
    const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 6, 20, Math.PI), toonMaterial(0xe8402f));
    band.rotation.z = 0;
    g.add(band);
    for (const sx of [-0.2, 0.2]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.3, 8), toonMaterial(0xffd24a));
      h.position.set(sx, 0.36, 0);
      h.rotation.z = -sx * 0.9;
      g.add(h);
    }
    return g;
  }
  const horns = makeHorns();
  horns.scale.setScalar(1.6);
  scene.add(horns);
  const oniRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.78, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.85, depthWrite: false }));
  scene.add(oniRing);
  const oniGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff5a3a, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  oniGlow.scale.setScalar(2.4);
  scene.add(oniGlow);

  // ── 金の どんぐり ──
  const acornGeo = (() => {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const k = i / 10; pts.push(new THREE.Vector2(Math.sin(k * Math.PI) * 0.17 * (1 - k * 0.25) + 0.001, -0.22 + k * 0.3)); }
    return new THREE.LatheGeometry(pts, 14);
  })();
  const capGeo = new THREE.SphereGeometry(0.19, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const acornMeshes = new Map(); // id → { g, t }
  function makeAcorn() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(acornGeo, new THREE.MeshBasicMaterial({ color: 0xffd24a }));
    const cap = new THREE.Mesh(capGeo, toonMaterial(0x9a6a2a));
    cap.position.y = 0.06;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.1, 5), toonMaterial(0x6a4422));
    stem.position.y = 0.25;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe27a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(1.4);
    g.add(body, cap, stem, glow);
    return g;
  }

  // ── けむり・星・紙ふぶき・葉っぱ ───────────────────────
  const fx = [];
  const puffGeo = new THREE.SphereGeometry(0.2, 6, 4);
  function puff(x, y, z, n = 4, color = 0xe8dcc0, size = 1) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
      m.position.set(x + (Math.random() - 0.5) * 0.4, y + Math.random() * 0.2, z + (Math.random() - 0.5) * 0.4);
      m.scale.setScalar(size);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 0.6 + Math.random() * 0.3, vel: new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.6 + Math.random(), (Math.random() - 0.5) * 1.2), kind: 'puff', size });
    }
  }
  const starGeo = (() => {
    const sh = new THREE.Shape();
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 0.08 : 0.2;
      if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return new THREE.ShapeGeometry(sh);
  })();
  function stars(x, y, z, n = 8, power = 1, colors = [0xffd23c, 0xffffff, 0xff8a5a]) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(starGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true, side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      scene.add(m);
      const a = (i / n) * Math.PI * 2;
      fx.push({ obj: m, t: 0, life: 0.6, vel: new THREE.Vector3(Math.cos(a) * 3 * power, 2 + Math.random() * 2, Math.sin(a) * 3 * power), kind: 'spark', spin: 8 });
    }
  }
  const leafGeo = new THREE.PlaneGeometry(0.16, 0.1);
  function leaves(x, z, n = 6) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(leafGeo, new THREE.MeshBasicMaterial({ color: [0x5a9a3c, 0x7ab04a, 0x4f8a34][i % 3], side: THREE.DoubleSide, transparent: true }));
      m.position.set(x + (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.6);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 0.9, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2), kind: 'leaf', spin: 6 });
    }
  }
  const ringGeo = new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2);
  function shock(x, z, color = 0xffffff, size = 1) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(x, FLOOR_Y + 0.06, z);
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 0.45, vel: new THREE.Vector3(), kind: 'ring', size });
  }
  const confettiGeo = new THREE.PlaneGeometry(0.12, 0.07);
  function confetti(x, z) {
    const colors = [...PLAYER_COLORS.map((c) => c.hex), 0xffd24a, 0xffffff];
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true }));
      m.position.set(x + (Math.random() - 0.5) * 4, 4 + Math.random() * 2.5, z + (Math.random() - 0.5) * 3);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 3 + Math.random() * 1.5, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, -(0.7 + Math.random() * 0.6), (Math.random() - 0.5) * 0.6), spin: 8, kind: 'confetti' });
    }
  }
  // 走った あとの 土けむり
  function dust(x, z) { puff(x, FLOOR_Y + 0.08, z, 1, 0xd8c8a0, 0.6); }
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
      } else if (f.kind === 'spark') {
        f.vel.y -= 10 * dt;
        f.obj.rotation.z += f.spin * dt;
        f.obj.lookAt(camera.position);
        f.obj.material.opacity = 1 - k;
      } else if (f.kind === 'leaf') {
        f.vel.y -= 5 * dt;
        f.vel.multiplyScalar(Math.exp(-1.5 * dt));
        f.obj.rotation.x += f.spin * dt;
        f.obj.rotation.y += f.spin * 0.7 * dt;
        f.obj.material.opacity = Math.min(1, (1 - k) * 3);
      } else if (f.kind === 'ring') {
        f.obj.scale.setScalar(f.size * (0.4 + k * 2.2));
        f.obj.material.opacity = 1 - k;
      } else if (f.kind === 'confetti') {
        f.obj.rotation.x += f.spin * dt;
        f.obj.rotation.y += f.spin * dt;
        f.obj.material.opacity = Math.min(1, (1 - k) * 3);
        if (f.obj.position.y < 0.02) { f.obj.position.y = 0.02; f.vel.set(0, 0, 0); f.spin = 0; }
      }
      if (k >= 1) {
        scene.remove(f.obj);
        f.obj.material.dispose();
        fx.splice(i, 1);
      }
    }
  }

  // かくれて いる 子は うすく(自分は そのまま)
  function setAlpha(u, a) {
    if (u.alpha === a) return;
    u.alpha = a;
    u.model.root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (m.userData.baseTransparent === undefined) m.userData.baseTransparent = m.transparent;
        m.transparent = a < 1 || m.userData.baseTransparent;
        m.opacity = a;
        m.depthWrite = a >= 1;
      }
    });
  }

  // ── ゲームの進行 ────────────────────────────────────
  let mode = 'idle';
  let picked = CHARACTERS[0].key;
  let tour = null;
  let game = null;
  let intro = 1;
  const INTRO_TIME = 2.4;
  const input = { touch: null, stick: null, keys: new Set(), dash: false, target: null };

  async function startGame({ fromSky = false } = {}) {
    const net = tour?.net ?? null; // オンライン: { client, start }。席・種・顔ぶれは サーバーが きめる
    const me = net ? net.start.seat : 0;
    const seed = net ? net.start.seed : params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS, me });
    if (game) for (const r of game.runners) scene.remove(r.holder);
    for (const f of fx.splice(0)) scene.remove(f.obj);
    for (const a of acornMeshes.values()) scene.remove(a.g);
    acornMeshes.clear();
    const state = createGame(players, seed);
    if (net) replaceState(state, net.start.s);
    const runners = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const holder = new THREE.Group();
      const def = CHARACTERS.find((c) => c.key === p.character);
      const size = def.size || 1;
      model.root.scale.setScalar(0.85 / size ** 0.3);
      holder.add(model.root);
      // 足もとの 色の 輪(だれか わかる ように)
      const ring = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[slot].hex, transparent: true, opacity: 0.55, depthWrite: false }));
      ring.position.y = 0.02;
      holder.add(ring);
      scene.add(holder);
      return { model, holder, ring, size, alpha: 1, run: 0, dustT: 0, hop: 0, h: 0 };
    }));
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.36, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[me].hex }));
    marker.rotation.x = Math.PI;
    runners[me].holder.add(marker);
    runners[me].marker = marker;
    game = { me, net: net ? createNetDriver({ client: net.client, rules: { STEP, step }, state, me }) : null, seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), runners, acc: 0, endTimer: null, shake: 0, count: 4, tick: 11 };
    atmosphere.apply(params.get('time') || 'evening');
    atmosphere.setupShadows(runners.map((r) => r.holder), [stage.group]);
    Object.assign(input, { touch: null, stick: null, dash: false, target: null });
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoOk').classList.add('show');
    if (!fromSky) splash('よーい…');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudOk').hidden = m !== 'playing';
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
  $('pauseBtnOk').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: どこでもスティック + ダッシュボタン ──────────────
  const STICK_R = 56;
  const FULL = 26, DEAD = 6;
  const stickEl = $('stickOk'), knobEl = stickEl.firstElementChild;
  const dashEl = $('dashOk');
  const playing = () => mode === 'playing' && !paused;
  dashEl.addEventListener('pointerdown', (e) => {
    if (!playing()) return;
    e.preventDefault();
    e.stopPropagation();
    unlockAudio();
    input.dash = true;
    dashEl.classList.add('down');
  });
  const dashUp = () => { input.dash = false; dashEl.classList.remove('down'); };
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) dashEl.addEventListener(ev, dashUp);
  window.addEventListener('pointerdown', (e) => {
    if (!playing() || input.touch !== null || e.target.closest('button, a')) return;
    unlockAudio();
    input.touch = e.pointerId;
    input.stick = { ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    stickEl.style.left = `${e.clientX}px`;
    stickEl.style.top = `${e.clientY}px`;
    knobEl.style.transform = 'translate(-50%, -50%)';
    stickEl.hidden = false;
    $('howtoOk').classList.remove('show');
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
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); unlockAudio(); input.dash = true; return; }
    if (KEYS[e.code]) {
      e.preventDefault();
      unlockAudio();
      input.keys.add(e.code);
      $('howtoOk').classList.remove('show');
    }
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
    if (e.code === 'Space' || e.code === 'Enter') input.dash = false;
  });
  window.addEventListener('blur', () => { input.keys.clear(); input.touch = null; input.stick = null; input.dash = false; stickEl.hidden = true; });

  function myInput() {
    if (input.target) return { ...input.target };
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
    return { x: sx, z: sy, dash: input.dash };
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashOk');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildChips() {
    $('chipsOk').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'chip' + (slot === game.me ? ' me' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      d.innerHTML = '<i></i><b></b>';
      return d;
    }));
  }
  function renderHud() {
    const s = game.state;
    [...$('chipsOk').children].forEach((c, i) => {
      c.classList.toggle('oni', i === s.oni && s.phase !== 'ready');
      c.lastChild.textContent = String(Math.floor(points(s.runners[i])));
    });
    $('timeOk').textContent = s.phase === 'play' ? String(Math.ceil(timeLeft(s))) : '';
    const me = s.runners[game.me];
    dashEl.hidden = s.phase === 'finished';
    dashEl.style.setProperty('--k', String(1 - me.cool / RULES.cool));
    dashEl.classList.toggle('wait', me.cool > 0);
    $('hudOk').classList.toggle('oni', s.oni === game.me && s.phase === 'play');
    $('hudOk').classList.toggle('hurry', s.hurried && s.phase === 'play');
  }
  const tmpV = new THREE.Vector3();
  function pop(text, x, y, z, cls = '', life = 800) {
    tmpV.set(x, y, z).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsOk').append(el);
    setTimeout(() => el.remove(), life);
  }
  const nameOf = (slot) => (slot === game.me ? 'あなた' : CHARACTERS.find((c) => c.key === game.players[slot].character).name);

  // ── できごと ────────────────────────────────────────
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'start':
          splash(e.oni === game.me ? 'あなたが おに!' : `${nameOf(e.oni)}が おに!`, e.oni === game.me ? 'red small' : 'small');
          sfx.whistle();
          if (e.oni === game.me) sfx.oni();
          setTimeout(() => $('howtoOk').classList.remove('show'), 6000);
          break;
        case 'dash': {
          const r = s.runners[e.slot];
          sfx.dash(volFor(r.x, r.z));
          puff(r.x - Math.sin(r.h) * 0.4, FLOOR_Y + 0.15, r.z - Math.cos(r.h) * 0.4, 4, 0xe8dcc0, 0.9);
          break;
        }
        case 'tag': {
          sfx.tag(volFor(e.x, e.z));
          stars(e.x, FLOOR_Y + 1, e.z, 10, 1, [0xff5a3a, 0xffd23c, 0xffffff]);
          shock(e.x, e.z, 0xff6a3a, 1.2);
          pop('タッチ!', e.x, FLOOR_Y + 1.8, e.z, 'red', 900);
          game.runners[e.to].hop = 0.5;
          if (e.to === game.me) { splash('あなたが おに!', 'red small'); sfx.oni(); game.shake = 0.3; }
          else if (e.from === game.me) splash('にげろ!', 'gold small');
          else splash(`${nameOf(e.to)}が おに!`, 'small');
          break;
        }
        case 'hide': {
          const r = s.runners[e.slot];
          leaves(r.x, r.z, e.slot === game.me ? 8 : 4);
          sfx.rustle(volFor(r.x, r.z) * 0.8);
          if (e.slot === game.me) pop('かくれた!', r.x, FLOOR_Y + 1.6, r.z, 'green', 700);
          break;
        }
        case 'unhide': {
          const r = s.runners[e.slot];
          leaves(r.x, r.z, 3);
          break;
        }
        case 'acorn': {
          const m = makeAcorn();
          m.position.set(e.x, 6, e.z);
          scene.add(m);
          acornMeshes.set(e.id, { g: m, t: 0, x: e.x, z: e.z, born: s.t, landed: false });
          break;
        }
        case 'pick': {
          const a = acornMeshes.get(e.id);
          if (a) { scene.remove(a.g); acornMeshes.delete(e.id); }
          sfx.pick(volFor(e.x, e.z));
          stars(e.x, FLOOR_Y + 0.6, e.z, 8, 0.7);
          pop(`+${RULES.acornBonus}`, e.x, FLOOR_Y + 1.6, e.z, 'gold', 900);
          break;
        }
        case 'acornGone': {
          const a = acornMeshes.get(e.id);
          if (a) { puff(a.x, FLOOR_Y + 0.2, a.z, 3, 0xfff0c0, 0.6); scene.remove(a.g); acornMeshes.delete(e.id); }
          break;
        }
        case 'hurry':
          splash('のこり 10びょう!', 'gold small');
          break;
        case 'finished': {
          game.endTimer = 4.5;
          sfx.whistle();
          const win = e.winner === game.me;
          splash(win ? 'あなたの かち!' : 'そこまで!', win ? 'gold' : '');
          if (win) sfx.fanfare();
          const r = s.runners[e.winner];
          confetti(r.x, r.z);
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
    $('resultTitle').textContent = order[0] === game.me ? 'あなたの 勝ち!' : `${order.indexOf(game.me) + 1}位`;
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = game.players[slot];
      const r = s.runners[slot];
      const li = document.createElement('li');
      if (slot === game.me) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : slot === game.me ? 'あなた' : 'ともだち';
      const def = CHARACTERS.find((c) => c.key === p.character);
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}</small></span><span class="dist">${Math.floor(points(r))}<small>点・つかまった ${r.caught}</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateWorld(dt) {
    const s = game.state;
    for (const [slot, u] of game.runners.entries()) {
      const r = s.runners[slot];
      const sp = Math.hypot(r.vx, r.vz);
      u.run += ((sp > 0.6 ? 1 : 0) - u.run) * Math.min(1, dt * 10);
      // 向きは なめらかに
      if (sp > 0.3) u.h += Math.atan2(Math.sin(r.h - u.h), Math.cos(r.h - u.h)) * Math.min(1, dt * 14);
      u.hop = Math.max(0, u.hop - dt);
      const hopY = u.hop > 0 ? Math.sin((u.hop / 0.5) * Math.PI) * 0.5 : 0;
      u.holder.position.set(r.x, FLOOR_Y + hopY, r.z);
      u.holder.rotation.y = u.h;
      // ダッシュ中は まえのめり
      u.model.root.rotation.x = r.dash > 0 ? 0.25 : 0;
      let clip = u.run > 0.5 ? 'run' : 'idle', face = 'normal';
      if (s.phase === 'play') {
        if (slot === s.oni) face = r.freeze > 0 ? 'surprised' : 'frustrated';
        else {
          const o = s.runners[s.oni];
          const d = Math.hypot(o.x - r.x, o.z - r.z);
          face = d < 2.2 ? 'surprised' : 'happy';
        }
        if (r.freeze > 0) clip = 'dizzy';
      }
      if (s.phase === 'finished') {
        clip = slot === s.winner ? 'cheer' : 'idle';
        face = slot === s.winner ? 'happy' : 'normal';
      }
      u.model.play(clip);
      u.model.setFace(face);
      u.model.update(dt);
      // かくれて いる: 自分は すこし だけ、ほかの 子は うすく
      setAlpha(u, r.hidden && s.phase === 'play' ? (slot === game.me ? 0.75 : 0.28) : 1);
      u.ring.visible = !(r.hidden && slot !== game.me && s.phase === 'play');
      // 走ると 土けむり
      u.dustT -= dt;
      if (u.dustT <= 0 && sp > (r.dash > 0 ? 2 : 3.2) && !r.hidden) { u.dustT = r.dash > 0 ? 0.05 : 0.14; dust(r.x - Math.sin(r.h) * 0.3, r.z - Math.cos(r.h) * 0.3); }
      if (u.marker) {
        u.marker.visible = true;
        u.marker.position.set(0, 2.35 + 0.1 * Math.sin(performance.now() / 180), 0);
      }
    }
    // 鬼の しるし: 頭の 上の つの、足もとの 赤い 輪
    const o = s.runners[s.oni];
    const ou = game.runners[s.oni];
    horns.position.set(o.x, FLOOR_Y + 1.5 * (0.85 / ou.size ** 0.3) + (ou.hop > 0 ? Math.sin((ou.hop / 0.5) * Math.PI) * 0.5 : 0), o.z);
    horns.rotation.y = ou.h;
    oniRing.position.set(o.x, FLOOR_Y + 0.03, o.z);
    oniRing.scale.setScalar(1 + Math.sin(time * 6) * 0.08);
    oniGlow.position.set(o.x, FLOOR_Y + 0.5, o.z);
    oniGlow.material.opacity = o.freeze > 0 ? 0.25 + Math.sin(time * 20) * 0.2 : 0.45;
    // 金の どんぐり: 上から ふわっと 落ちて、地面で くるくる
    for (const a of acornMeshes.values()) {
      a.t += dt;
      const y = Math.max(0.35, 6 - a.t * a.t * 9);
      if (!a.landed && y <= 0.35) { a.landed = true; puff(a.x, 0.1, a.z, 3, 0xfff0c0, 0.6); sfx.drop(volFor(a.x, a.z)); }
      a.g.position.set(a.x, y + (a.landed ? Math.sin(time * 3 + a.x) * 0.08 : 0), a.z);
      a.g.rotation.y += dt * 2.5;
      // 消える まえは ちかちか
      const left = RULES.acornLife - (s.t - a.born);
      a.g.visible = left > 2.5 || Math.floor(time * 8) % 2 === 0;
    }
    stage.update(time, s.runners, dt);
  }

  let freeCamera = false;
  const camLook = new THREE.Vector3();
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const s = game?.state;
    // 自分の まわりを 見る(広場の まん中へ すこし よせる)
    let fx0 = 0, fz0 = 0;
    if (s) {
      const t = s.phase === 'finished' && s.winner !== null ? s.runners[s.winner] : s.runners[game.me];
      fx0 = t.x * 0.55; fz0 = t.z * 0.55;
    }
    const look = new THREE.Vector3(fx0, 0, fz0 + (portrait ? 0.6 : 0.3));
    const off = portrait ? new THREE.Vector3(0, 15.5, 10.5) : new THREE.Vector3(0, 11, 9.5);
    if (s?.phase === 'finished') off.multiplyScalar(0.6);
    const pos = look.clone().add(off);
    camera.fov = portrait ? 52 : 45;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(10, 18, -26);
      camera.position.lerpVectors(sky, pos, e);
      camera.lookAt(new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 4, -10), look, Math.min(1, e * 1.1)));
      camLook.copy(look);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 3.5);
    camera.position.lerp(pos, k);
    camLook.lerp(look, k);
    if (game?.shake > 0) {
      game.shake = Math.max(0, game.shake - dt);
      camera.position.x += (Math.random() - 0.5) * game.shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * game.shake * 0.5;
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
    // スタートの 合図: 3・2・1
    if (game && mode === 'playing' && intro >= 1 && game.state.phase === 'ready') {
      const n = Math.ceil(RULES.readyTime - game.state.t);
      if (n < game.count && n >= 1) {
        game.count = n;
        splash(String(n), 'small');
        sfx.beep(false);
      }
    }
    // のこり すこし: チッ チッ
    if (game && game.state.phase === 'play') {
      const n = Math.ceil(timeLeft(game.state));
      if (n < game.tick && n <= 5) { game.tick = n; sfx.tick(); }
    }
    if (game && mode === 'playing' && (!paused || game.net) && intro >= 1) {
      const s = game.state;
      game.acc += dt;
      while (game.acc >= STEP && s.phase !== 'finished') {
        const inputs = game.players.map((p, slot) => (p.cpu ? (game.net ? null : cpuInput(game.cpus[slot], s, slot)) : myInput()));
        onEvents((game.net ? game.net.step : step)(s, inputs));
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
  window.doni = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    steer: (t) => { input.target = t; },
    // 描かずに、みんな CPU で sec 秒すすめる(自分も CPU)
    advance: (sec) => {
      const me = game.meCpu || (game.meCpu = createCpu('normal', 1, game.me));
      for (let i = 0; i < sec / STEP && game.state.phase !== 'finished'; i++) {
        onEvents(step(game.state, game.players.map((p, slot) => cpuInput(slot === game.me ? me : game.cpus[slot], game.state, slot))));
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
    async enter(character, { fromSky = true, lineup = null, onFinish = null, net = null } = {}) {
      picked = character;
      tour = onFinish ? { lineup, onFinish, net } : null;
      unlockAudio();
      applyQuality();
      await startGame({ fromSky });
      renderer.compile(scene, camera);
    },
    exit() {
      setMode('idle');
      input.touch = null;
      input.stick = null;
      input.dash = false;
      $('stickOk').hidden = true;
    },
    get intro() { return intro; },
  };
}
