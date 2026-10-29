// 森の学校の けしごむ大戦 の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
//
// 動かし方: 画面の どこでも おして ひっぱる(パチンコの ように)。おして いる あいだ ためて、はなすと はじく。
// ひっぱる ゆびを まげると ひねり(回りながら すべる)。ひっぱらずに はなすと、いちばん ちかい 子に むかって はじく。
// パソコンは ←→ で 向き、スペースを おして ためる、Q/E で ひねり。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { RULES, STEP, aliveCount, canFlick, createGame, halfDesk, launchSpeed, ranking, step, timeLeft } from './rules.js';
import { createNetDriver, replaceState } from '../../net/drive.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { DESK_Y, ERASER_H, FLOOR_Y, buildStage, eraserMesh, glowTex, toWorld } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const RIDER = 0.6; // けしごむに のる キャラの 大きさ

export async function createKeshigomu({ renderer, settings, getAudio, onExit }) {
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
    flick(k) { noise({ len: 0.08, gain: 0.08 + k * 0.08, freq: [3000, 1200], q: 1.5 }); voice({ type: 'triangle', pts: [[0, 500 + k * 400], [0.08, 260]], len: 0.1, gain: 0.05 }); },
    hit(k) { voice({ type: 'triangle', pts: [[0, 320 + Math.random() * 80], [0.1, 160]], len: 0.14, gain: 0.04 + k * 0.08 }); noise({ len: 0.06, gain: 0.03 + k * 0.05, freq: [1600, 600], q: 2 }); },
    charge(k) { voice({ type: 'sine', pts: [[0, 300 + k * 600]], len: 0.06, gain: 0.025 }); },
    fall() { voice({ pts: [[0, 700], [0.6, 120]], len: 0.65, gain: 0.05 }); noise({ len: 0.3, gain: 0.06, freq: [400, 120], type: 'lowpass', at: 0.6 }); },
    duel() { [[0, 330], [0.18, 330], [0.36, 494]].forEach(([at, f]) => voice({ type: 'square', pts: [[0, f]], len: 0.15, gain: 0.05, at })); },
    crumble() { noise({ len: 0.5, gain: 0.05, freq: [300, 90], type: 'lowpass' }); },
    go() { voice({ type: 'square', pts: [[0, 880]], len: 0.18, gain: 0.05 }); },
    ready() { voice({ type: 'square', pts: [[0, 440]], len: 0.12, gain: 0.04 }); },
    whistle() { voice({ pts: [[0, 1800], [0.5, 900]], len: 0.6, gain: 0.04 }); },
    fanfare() { [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1047], [0.5, 1047]].forEach(([at, f], i) => voice({ type: 'square', pts: [[0, f]], len: i === 4 ? 0.6 : 0.12, gain: 0.05, at })); },
  };

  await preload(CHARACTERS.map((c) => c.key));

  // ── 演出: ぶつかった 星・紙ふぶき ──────────────────────
  const fx = [];
  function spark(at, n = 10, color = 0xffe066, sp = 3) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.06 + Math.random() * 0.05), new THREE.MeshBasicMaterial({ color: i % 3 ? color : 0xffffff, transparent: true }));
      m.position.copy(at);
      scene.add(m);
      const a = Math.random() * 6.28;
      fx.push({ obj: m, t: 0, life: 0.5, vel: new THREE.Vector3(Math.cos(a) * sp * (0.4 + Math.random()), 1.5 + Math.random() * 2, Math.sin(a) * sp * (0.4 + Math.random())), kind: 'drop' });
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.32, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    ring.position.copy(at);
    scene.add(ring);
    fx.push({ obj: ring, t: 0, life: 0.35, vel: new THREE.Vector3(), kind: 'ring' });
  }
  // はじく ゆび(つくえの 上に ねかせた 絵。うしろから すっと 出て、はじいて きえる)
  const fingerTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.font = '96px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.translate(64, 64); g.rotate(Math.PI / 2); // 「👆」を 右むきに
    g.fillText('👆', 0, 6);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  function flickFinger(b, aim) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: fingerTex, transparent: true, depthWrite: false }));
    m.rotation.y = aim;
    const back = toWorld(b.x - Math.cos(aim) * 1.6, b.y - Math.sin(aim) * 1.6);
    m.position.copy(back).setY(DESK_Y + 0.35);
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 0.45, vel: new THREE.Vector3(Math.cos(aim) * 2.2, 0, -Math.sin(aim) * 2.2), kind: 'finger' });
  }
  // すべった あとの こすれた すじ と けしかす
  function rubMark(b) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8a7a6a, transparent: true, opacity: 0.25, depthWrite: false }));
    toWorld(b.x, b.y, m.position).y += 0.006;
    m.rotation.y = Math.atan2(b.vy, b.vx);
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 2.5, vel: new THREE.Vector3(), kind: 'mark', base: 0.25 });
  }
  function crumbs(at, n = 3) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.12), new THREE.MeshBasicMaterial({ color: 0xf6f2e6, transparent: true }));
      m.position.copy(at);
      m.rotation.y = Math.random() * 6;
      scene.add(m);
      const a = Math.random() * 6.28;
      fx.push({ obj: m, t: 0, life: 0.6, vel: new THREE.Vector3(Math.cos(a) * 0.8, 1 + Math.random(), Math.sin(a) * 0.8), kind: 'chip', floor: DESK_Y + 0.02 });
    }
  }
  // くずれる 板の 木くず
  function woodChips(at, n = 4) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.16), new THREE.MeshBasicMaterial({ color: [0xd8a868, 0xb07a40, 0xefc98e][i % 3], transparent: true }));
      m.position.copy(at);
      scene.add(m);
      const a = Math.random() * 6.28;
      fx.push({ obj: m, t: 0, life: 1.2, vel: new THREE.Vector3(Math.cos(a) * 1.2, 1.5 + Math.random() * 1.5, Math.sin(a) * 1.2), kind: 'drop', spin: Math.random() * 10 });
    }
  }
  // 回って いる けしごむの まわりの くるくる 線
  function swirl(u, w) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.03, 4, 20, Math.PI * 0.6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
    m.position.copy(u.group.position).setY(DESK_Y + 0.25);
    m.rotation.y = Math.random() * 6;
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 0.3, vel: new THREE.Vector3(), kind: 'swirl', spin: -w });
  }
  function confetti(at, n = 40) {
    const cols = [0xff6a9a, 0xffd24a, 0x7ad8ff, 0x8ad04a, 0xff8a3a];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.24), new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, transparent: true }));
      m.position.copy(at);
      scene.add(m);
      const a = Math.random() * 6.28;
      fx.push({ obj: m, t: 0, life: 2.4, vel: new THREE.Vector3(Math.cos(a) * 3 * Math.random(), 5 + Math.random() * 3, Math.sin(a) * 3 * Math.random()), kind: 'paper', spin: Math.random() * 8 });
    }
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = f.t / f.life;
      f.obj.position.addScaledVector(f.vel, dt);
      if (f.kind === 'drop') f.vel.y -= 9 * dt;
      if (f.kind === 'ring') f.obj.scale.setScalar(1 + k * 4);
      if (f.kind === 'finger') { f.vel.multiplyScalar(1 - dt * 6); f.obj.scale.setScalar(1 + k * 0.2); }
      if (f.kind === 'chip') { f.vel.y -= 9 * dt; if (f.obj.position.y < f.floor) { f.obj.position.y = f.floor; f.vel.set(0, 0, 0); } }
      if (f.kind === 'swirl') f.obj.rotation.y += f.spin * dt;
      if (f.spin && f.kind === 'drop') { f.obj.rotation.x += f.spin * dt; f.obj.rotation.z += f.spin * 0.6 * dt; }
      if (f.kind === 'mark') { f.obj.material.opacity = f.base * (1 - k); if (k >= 1) { scene.remove(f.obj); f.obj.material.dispose(); fx.splice(i, 1); } continue; }
      if (f.kind === 'paper') { f.vel.multiplyScalar(1 - dt * 1.2); f.vel.y -= 5 * dt; f.obj.rotation.x += f.spin * dt; f.obj.rotation.y += f.spin * 0.7 * dt; }
      f.obj.material.opacity = 1 - k * k;
      if (k >= 1) { scene.remove(f.obj); f.obj.material.dispose(); fx.splice(i, 1); }
    }
  }

  // ── ねらいの 点線・ためる わ ─────────────────────────
  const DOTS = 14;
  const aimDots = Array.from({ length: DOTS }, () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
    m.visible = false;
    scene.add(m);
    return m;
  });
  const aimHead = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 12).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
  aimHead.visible = false;
  scene.add(aimHead);
  // ためる わ(けしごむの まわり。ためるほど 一周に ちかづく)
  const SEG = 28;
  function chargeRing(color) {
    const g = new THREE.Group();
    const segs = Array.from({ length: SEG }, (_, k) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
      const a = (k / SEG) * Math.PI * 2;
      m.position.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
      m.rotation.y = -a;
      g.add(m);
      return m;
    });
    g.visible = false;
    g.userData.segs = segs;
    scene.add(g);
    return g;
  }
  // とまって いて はじける よ、の しるし(自分だけ)
  const readyMark = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.22, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
  readyMark.visible = false;
  scene.add(readyMark);

  // ── ゲームの進行 ────────────────────────────────────
  let mode = 'idle';
  let picked = CHARACTERS[0].key;
  let tour = null;
  let game = null;
  let intro = 1;
  const INTRO_TIME = 2.4;
  const input = { keys: new Set(), target: null, hold: false, aim: null, spin: 0, drag: null };

  async function startGame({ fromSky = false } = {}) {
    const net = tour?.net ?? null; // オンライン: { client, start }。席・種・顔ぶれは サーバーが きめる
    const me = net ? net.start.seat : 0;
    const seed = net ? net.start.seed : params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS, me });
    if (game) for (const u of game.units) scene.remove(u.group, u.ring);
    for (const f of fx.splice(0)) scene.remove(f.obj);
    stage.reset();
    const state = createGame(players, seed);
    if (net) replaceState(state, net.start.s);
    const units = await Promise.all(players.map(async (p, slot) => {
      const b = state.bodies[slot];
      const group = new THREE.Group();
      const eraser = eraserMesh(b.kind, PLAYER_COLORS[slot].hex);
      group.add(eraser);
      // けしごむに のる キャラ
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const rider = new THREE.Group();
      rider.add(model.root);
      rider.scale.setScalar(RIDER);
      const seat = b.kind === 'donguri' ? [0, -0.22] : [0, 0];
      rider.position.set(seat[0], ERASER_H, -seat[1]);
      group.add(rider);
      scene.add(group);
      const ring = chargeRing(PLAYER_COLORS[slot].hex);
      return { group, eraser, rider, model, ring, fall: null, face: 0, lean: 0, hurt: 0 };
    }));
    game = { me, net: net ? createNetDriver({ client: net.client, rules: { STEP, step }, state, me }) : null, seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), units, acc: 0, endTimer: null, shake: 0, lastAim: 0, kos: players.map(() => 0) };
    atmosphere.apply(params.get('time') || 'day');
    atmosphere.setupShadows(units.map((u) => u.group), [stage.group]);
    input.hold = false;
    input.drag = null;
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoX').classList.add('show');
    if (!fromSky) splash('よーい…');
    updateCamera(0);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudX').hidden = m !== 'playing';
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
  $('pauseBtnX').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: ひっぱって はじく ─────────────────────────
  const playing = () => mode === 'playing' && !paused;
  const ray = new THREE.Raycaster();
  const deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DESK_Y);
  // 画面の 点 → つくえの 上の ルールの 座標
  function deskPoint(cx, cy) {
    const v = new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(v, camera);
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(deskPlane, p)) return null;
    return [p.x, -p.z];
  }
  // ひっぱった ゆびの 道すじから、向きと ひねりを だす
  function readDrag() {
    const d = input.drag;
    if (!d || d.pts.length < 2) return;
    const a = deskPoint(d.pts[0].x, d.pts[0].y), b = deskPoint(d.x, d.y);
    const px = Math.hypot(d.x - d.pts[0].x, d.y - d.pts[0].y);
    if (!a || !b || px < 18) { input.aim = null; input.spin = 0; return; }
    input.aim = Math.atan2(a[1] - b[1], a[0] - b[0]); // ひっぱった 向きの はんたい
    // まがりかた: 道すじの、まっすぐ からの ずれ(画面で)
    const ux = (d.x - d.pts[0].x) / px, uy = (d.y - d.pts[0].y) / px;
    let dev = 0;
    for (const p of d.pts) {
      const e = (p.x - d.pts[0].x) * uy - (p.y - d.pts[0].y) * ux;
      if (Math.abs(e) > Math.abs(dev)) dev = e;
    }
    input.spin = clamp(dev / Math.max(60, px) * 2.2, -1, 1);
    if (Math.abs(input.spin) < 0.2) input.spin = 0;
  }
  window.addEventListener('pointerdown', (e) => {
    if (!playing() || e.target.closest('button, a')) return;
    unlockAudio();
    input.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, pts: [{ x: e.clientX, y: e.clientY }] };
    input.hold = true;
    $('howtoX').classList.remove('show');
  });
  window.addEventListener('pointermove', (e) => {
    const d = input.drag;
    if (!d || e.pointerId !== d.id) return;
    d.x = e.clientX; d.y = e.clientY;
    const last = d.pts[d.pts.length - 1];
    if (Math.hypot(d.x - last.x, d.y - last.y) > 6) d.pts.push({ x: d.x, y: d.y });
    readDrag();
  });
  for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, (e) => {
    if (!input.drag || e.pointerId !== input.drag.id) return;
    readDrag();
    input.drag = null;
    input.hold = false;
  });
  window.addEventListener('keydown', (e) => {
    if (mode !== 'playing') return;
    if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!paused); return; }
    if (['Space', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE'].includes(e.code)) { e.preventDefault(); unlockAudio(); input.keys.add(e.code); }
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => input.keys.clear());

  // ねらいが きまって いない ときは、いちばん ちかい 子へ
  function autoAim(s) {
    const me = s.bodies[game.me];
    let best = null, bd = Infinity;
    s.bodies.forEach((b, i) => {
      if (i === game.me || b.out) return;
      const d = Math.hypot(b.x - me.x, b.y - me.y);
      if (d < bd) { bd = d; best = Math.atan2(b.y - me.y, b.x - me.x); }
    });
    return best ?? game.lastAim;
  }
  function myInput(dt) {
    if (input.target) return input.target;
    const s = game.state;
    // キー: ←→ で 向きを 回す(はじめは いちばん ちかい 子へ)
    if (input.keys.has('ArrowLeft') || input.keys.has('ArrowRight')) {
      if (game.keyAim === undefined) game.keyAim = autoAim(s);
      game.keyAim += (input.keys.has('ArrowLeft') ? 1 : -1) * dt * 1.8;
    }
    const keySpin = input.keys.has('KeyQ') ? 1 : input.keys.has('KeyE') ? -1 : 0;
    const aim = input.aim ?? game.keyAim ?? autoAim(s);
    game.lastAim = aim;
    return { hold: input.hold || input.keys.has('Space'), aim, spin: keySpin || input.spin };
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashX');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildChips() {
    $('chipsX').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'chip' + (slot === game.me ? ' me' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      d.innerHTML = `<i></i><b>${CHARACTERS.find((c) => c.key === p.character)?.name || ''}</b>`;
      return d;
    }));
  }
  // 「○○が △△を おとした!」
  function toast(by, slot) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<i style="background:${css(PLAYER_COLORS[by].hex)}"></i>${nameOf(by)}が <i style="background:${css(PLAYER_COLORS[slot].hex)}"></i>${nameOf(slot)}を おとした!`;
    $('toastX').append(el);
    setTimeout(() => el.remove(), 2200);
  }
  function renderHud() {
    const s = game.state;
    [...$('chipsX').children].forEach((c, slot) => {
      c.classList.toggle('out', s.bodies[slot].out);
      c.dataset.ko = game.kos[slot] ? '★'.repeat(Math.min(4, game.kos[slot])) : '';
    });
    $('hudX').classList.toggle('duel', s.phase === 'battle' && aliveCount(s) === 2);
    $('timeX').textContent = s.phase === 'battle' ? String(Math.ceil(timeLeft(s))) : '';
    $('leftX').textContent = s.phase === 'battle' || s.phase === 'show' ? `のこり ${aliveCount(s)}` : '';
  }
  const tmpV = new THREE.Vector3();
  function pop(text, at, cls = '', life = 900) {
    tmpV.copy(at).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsX').append(el);
    setTimeout(() => el.remove(), life);
  }
  const nameOf = (slot) => (slot === game.me ? 'あなた' : CHARACTERS.find((c) => c.key === game.players[slot].character)?.name || '');

  // ── できごと ────────────────────────────────────────
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'go':
          splash('はじけ!', 'gold');
          sfx.go();
          setTimeout(() => game?.state === s && $('howtoX').classList.remove('show'), 5000);
          break;
        case 'flick': {
          if (e.slot === game.me) sfx.flick(e.power);
          game.units[e.slot].face = 0.5;
          const b = s.bodies[e.slot];
          flickFinger(b, Math.atan2(b.vy, b.vx));
          game.units[e.slot].lean = 0.5; // のって いる 子が うしろへ のけぞる
          break;
        }
        case 'hit': {
          const at = toWorld(e.x, e.y).add(new THREE.Vector3(0, ERASER_H * 0.6, 0));
          const k = clamp(e.power / 8, 0, 1);
          spark(at, 4 + Math.round(k * 12), 0xffe066, 2 + k * 3);
          sfx.hit(k);
          if (k > 0.5) game.shake = Math.max(game.shake, k * 0.25);
          if (k > 0.55) pop(k > 0.85 ? 'ドカッ!' : 'ゴン!', at.clone().add(new THREE.Vector3(0, 0.8, 0)), k > 0.85 ? 'red' : 'gold', 600);
          crumbs(at, 2 + Math.round(k * 4));
          for (const i of [e.a, e.b]) game.units[i].hurt = 0.6;
          break;
        }
        case 'out': {
          const u = game.units[e.slot];
          u.fall = { t: 0, vx: e.vx * 0.6, vz: -e.vy * 0.6, vy: 1.5, spin: (Math.random() - 0.5) * 8, rest: false };
          sfx.fall();
          pop(e.slot === game.me ? 'おちた〜!' : `${nameOf(e.slot)} アウト!`, toWorld(e.x, e.y).add(new THREE.Vector3(0, 1.2, 0)), e.slot === game.me ? 'red' : '', 1300);
          if (e.by === game.me) setTimeout(() => game?.state === s && splash('おとした!', 'gold small'), 300);
          if (e.by !== null) { game.kos[e.by]++; toast(e.by, e.slot); }
          // のこり 2人: いっきうち
          if (aliveCount(s) === 2 && s.phase === 'battle') setTimeout(() => { if (game?.state === s && s.phase === 'battle') { splash('いっきうち!', 'red'); sfx.duel(); } }, 900);
          break;
        }
        case 'shrink':
          splash('つくえが けずれる!', 'small');
          sfx.crumble();
          break;
        case 'show':
          splash(aliveCount(s) === 1 ? 'そこまで!' : 'じかんぎれ!', 'small');
          sfx.whistle();
          break;
        case 'finished': {
          game.endTimer = 4;
          const win = e.winner === game.me;
          if (win) { sfx.fanfare(); splash('1い!', 'gold'); } else splash(`${ranking(s).indexOf(game.me) + 1}い`, 'small');
          const w = game.units[e.winner];
          w.win = true;
          confetti(w.group.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 60);
          game.finale = 0.5;
          // 王冠(のって いる 子の 頭の 上)
          const crown = new THREE.Group();
          const gold = new THREE.MeshToonMaterial({ color: 0xffcf3a, emissive: 0x5a3a00 });
          const band = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.13, 12, 1, true), gold);
          band.material.side = THREE.DoubleSide;
          crown.add(band);
          for (let k = 0; k < 5; k++) {
            const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.15, 4), gold);
            sp.position.set(Math.cos((k / 5) * 6.28) * 0.22, 0.13, Math.sin((k / 5) * 6.28) * 0.22);
            crown.add(sp);
          }
          crown.position.y = 2.4;
          w.rider.add(crown);
          w.crown = crown;
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
    const kos = s.bodies.map((_, i) => s.bodies.filter((b) => b.outBy === i).length);
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = game.players[slot];
      const b = s.bodies[slot];
      const li = document.createElement('li');
      if (slot === game.me) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : slot === game.me ? 'あなた' : 'ともだち';
      const def = CHARACTERS.find((c) => c.key === p.character);
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}${kos[slot] ? `・おとした ${kos[slot]}` : ''}</small></span><span class="dist">${b.out ? 'アウト' : 'のこり'}</span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateWorld(dt) {
    const s = game.state;
    s.bodies.forEach((b, slot) => {
      const u = game.units[slot];
      if (u.fall) {
        // おちる: すべって いた いきおいの まま とびだして、くるくる まわって 下へ
        // ゆかに あたると ぽよんと はねて、ころがって とまる(のって いる 子は くやしい かお)
        const f = u.fall;
        f.t += dt;
        const p = u.group.position;
        p.x += f.vx * dt;
        p.z += f.vz * dt;
        if (!f.rest) {
          f.vy -= 18 * dt;
          p.y += f.vy * dt;
          u.group.rotation.x += f.spin * dt;
          u.group.rotation.z += f.spin * 0.7 * dt;
          if (p.y <= FLOOR_Y) {
            p.y = FLOOR_Y;
            f.vy = -f.vy * 0.42;
            f.vx *= 0.6; f.vz *= 0.6; f.spin *= 0.5;
            if (f.vy > 1.2) { spark(p.clone().setY(FLOOR_Y + 0.1), 5, 0xffffff, 2); if (slot === game.me || f.t < 1.4) sfx.hit(0.3); }
            else f.rest = true;
          }
        } else {
          f.vx *= 1 - dt * 4; f.vz *= 1 - dt * 4;
          u.group.rotation.x += (Math.round(u.group.rotation.x / Math.PI) * Math.PI - u.group.rotation.x) * Math.min(1, dt * 6);
          u.group.rotation.z += (Math.round(u.group.rotation.z / Math.PI) * Math.PI - u.group.rotation.z) * Math.min(1, dt * 6);
        }
        u.model.setFace(f.rest ? 'frustrated' : 'surprised');
      } else {
        toWorld(b.x, b.y, u.group.position);
        u.group.rotation.set(0, b.a, 0);
        // すべって いる: こすれた すじと けしかす。回って いると くるくる 線
        const sp = Math.hypot(b.vx, b.vy);
        u.rubT = (u.rubT || 0) - dt * sp;
        if (sp > 1.2 && u.rubT <= 0) { u.rubT = 0.35; rubMark(b); if (Math.random() < 0.4) crumbs(u.group.position.clone().setY(DESK_Y + 0.05), 1); }
        u.swT = (u.swT || 0) - dt;
        if (Math.abs(b.w) > 4 && u.swT <= 0) { u.swT = 0.12; swirl(u, b.w); }
        // ぶつかった ときは すこし はねる
        if (u.hurt > 0) { u.hurt = Math.max(0, u.hurt - dt); u.group.position.y += Math.sin(u.hurt / 0.6 * Math.PI) * 0.15; }
        u.model.setFace(u.win ? 'happy' : u.hurt > 0.2 ? 'surprised' : b.charge > 0.6 ? 'frustrated' : 'normal');
      }
      if (u.face > 0) u.face = Math.max(0, u.face - dt);
      u.model.play(u.win ? 'cheer' : 'idle');
      u.model.update(dt);
      // のる キャラは ふだんは カメラの ほう、ためて いる あいだは ねらう 向きを 見る
      const camYaw = innerWidth < innerHeight && !u.win ? -Math.PI / 2 : 0;
      const aimNow = slot === game.me ? game.lastAim : game.cpus[slot]?.plan?.aim;
      const want = b.charge > 0 && aimNow !== undefined ? Math.atan2(Math.cos(aimNow), -Math.sin(aimNow)) : camYaw;
      u.yaw = u.yaw === undefined ? want : u.yaw + Math.atan2(Math.sin(want - u.yaw), Math.cos(want - u.yaw)) * Math.min(1, dt * 8);
      u.rider.rotation.y = u.fall ? u.rider.rotation.y : u.yaw - b.a;
      // はじいた ときは のけぞる。いっぱい ためると ぷるぷる
      if (u.lean > 0) u.lean = Math.max(0, u.lean - dt * 1.5);
      u.rider.rotation.x = -u.lean * 0.6 + (b.charge >= 1 ? Math.sin(time * 40) * 0.05 : 0);
      u.rider.scale.setScalar(RIDER * (1 - b.charge * 0.12)); // ためると ちぢこまる
      u.rider.position.y = ERASER_H + (u.win ? Math.abs(Math.sin(time * 6)) * 0.4 : 0);
      if (u.crown) u.crown.rotation.y = time * 2;
      // ためる わ
      const ring = u.ring;
      ring.visible = !b.out && b.charge > 0;
      if (ring.visible) {
        ring.position.copy(u.group.position).setY(DESK_Y + 0.03);
        const n = Math.round(b.charge * SEG);
        ring.userData.segs.forEach((m, k) => { m.visible = k < n; });
        ring.scale.setScalar(1 + (b.charge >= 1 ? Math.sin(time * 20) * 0.04 : 0));
      }
    });
    // 自分: はじける ときの しるしと、ねらいの 点線(どこまで すべるか)
    const me = s.bodies[game.me];
    const ready = !me.out && s.phase === 'battle' && (canFlick(s, me) || me.charge > 0);
    readyMark.visible = ready && me.charge === 0;
    if (readyMark.visible) {
      readyMark.position.copy(game.units[game.me].group.position).setY(DESK_Y + 0.02);
      readyMark.material.opacity = 0.35 + Math.sin(time * 5) * 0.25;
    }
    const showAim = ready && (me.charge > 0 || input.drag);
    const aim = game.lastAim, spin = input.spin;
    const v = launchSpeed(Math.max(0.15, me.charge));
    const travel = (v * v) / (2 * me.fric);
    let x = me.x, y = me.y, dir = aim;
    const stepLen = travel / DOTS;
    for (let k = 0; k < DOTS; k++) {
      dir -= spin * 0.06;
      x += Math.cos(dir) * stepLen;
      y += Math.sin(dir) * stepLen;
      const m = aimDots[k];
      m.visible = showAim && k > 0;
      toWorld(x, y, m.position).y += 0.08;
      const hot = me.charge >= 1;
      m.material.color.setHex(hot ? 0xff5a4e : 0xffffff);
      m.material.opacity = (1 - k / DOTS) * 0.9;
    }
    aimHead.visible = showAim;
    if (showAim) {
      toWorld(me.x + Math.cos(aim) * 1.35, me.y + Math.sin(aim) * 1.35, aimHead.position).y += 0.15;
      aimHead.rotation.set(0, aim - Math.PI / 2, 0);
      aimHead.material.color.setHex(me.charge >= 1 ? 0xff5a4e : 0xffffff);
    }
    // つくえが せまく なる(つぎの 2秒で くずれる 板は 赤く 光る)
    const half = halfDesk(s);
    const kNext = clamp((RULES.battleTime - s.phaseT + 2 - RULES.shrinkFrom) / (RULES.shrinkTo - RULES.shrinkFrom), 0, 1);
    const sNext = s.phase === 'battle' ? 1 - (1 - RULES.shrinkMin) * kNext : s.shrink;
    if (s.phase === 'finished' && game.finale !== undefined) {
      game.finale -= dt;
      if (game.finale <= 0) { game.finale = 0.6; confetti(game.units[s.winner].group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 3, (Math.random() - 0.5) * 2)), 20); }
    }
    const dropped = stage.updateDesk(half, [RULES.desk[0] / 2 * sNext, RULES.desk[1] / 2 * sNext], dt, time);
    if (dropped.length && Math.random() < 0.3) sfx.crumble();
    for (const d of dropped) if (Math.random() < 0.25) woodChips(toWorld(d.x, d.y), 3);
    stage.update(time);
  }

  let freeCamera = false;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  function updateCamera(dt) {
    if (freeCamera || !game) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const s = game.state;
    // 上から つくえ ぜんたい。たてもちでは つくえの ながい ほうを たてに する。せまく なると 寄る
    const z = 0.55 + 0.45 * s.shrink;
    if (portrait) {
      camPos.set(-9.5 * z, 16.5 * z + 1, 0);
      camLook.set(0.6 * z, DESK_Y, 0);
      camera.up.set(1, 0, 0);
    } else {
      camPos.set(0, 12.5 * z + 1, 9 * z);
      camLook.set(0, DESK_Y, -0.2 * z);
      camera.up.set(0, 1, 0);
    }
    // 決着: 勝った 子へ 寄る
    game.winCam = s.phase === 'finished' ? Math.min(1, (game.winCam ?? 0) + dt * 0.8) : 0;
    if (game.winCam > 0 && s.winner !== null && !s.bodies[s.winner].out) {
      // 勝った 子の まえ(手前)から。うしろに 教室の 黒板が 入る
      const wp = game.units[s.winner].group.position;
      const k = game.winCam * game.winCam * (3 - 2 * game.winCam);
      camPos.lerp(wp.clone().add(new THREE.Vector3(0, 2.4, portrait ? 6 : 4.4)), k);
      camLook.lerp(wp.clone().add(new THREE.Vector3(0, 1.4, -3)), k);
      camera.up.lerp(new THREE.Vector3(0, 1, 0), k).normalize();
    }
    camera.fov = portrait ? 60 : 46;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      camera.position.lerpVectors(new THREE.Vector3(10, 30, 18), camPos, e);
      camera.lookAt(camLook);
      return;
    }
    camera.position.copy(camPos);
    if (game.shake > 0) {
      game.shake = Math.max(0, game.shake - dt);
      camera.position.x += (Math.random() - 0.5) * game.shake * 0.6;
      camera.position.z += (Math.random() - 0.5) * game.shake * 0.6;
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
  let time = 0, chargeT = 0;
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
        const mi = myInput(STEP);
        const inputs = game.players.map((p, slot) => (p.cpu ? (game.net ? null : cpuInput(game.cpus[slot], s, slot)) : mi));
        onEvents((game.net ? game.net.step : step)(s, inputs));
        game.acc -= STEP;
      }
      // ためる 音(自分)
      const me = s.bodies[game.me];
      chargeT -= dt;
      if (me.charge > 0 && me.charge < 1 && chargeT <= 0) { chargeT = 0.09; sfx.charge(me.charge); }
      if (me.charge === 0 && !input.hold) game.keyAim = undefined;
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
  window.dkeshigomu = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    steer: (t) => { input.target = t; },
    // 描かずに、みんな CPU で sec 秒すすめる(自分も CPU)
    advance: (sec) => {
      const me = game.meCpu || (game.meCpu = createCpu('normal', 1, 0));
      for (let i = 0; i < sec / STEP && game.state.phase !== 'finished'; i++) {
        onEvents(step(game.state, game.players.map((p, slot) => cpuInput(slot ? game.cpus[slot] : me, game.state, slot))));
      }
    },
    deskPoint,
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
