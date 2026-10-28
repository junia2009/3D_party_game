// 秋の森の わたあめ まき の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
//
// 動かし方: スマホを 円を かくように ぐるぐる 回す(加速度センサー)。または 画面を 指で ぐるぐる なぞる。
// 「ざらめ!」ボタン(または エンター)で 色の ざらめ。パソコンは マウスで ぐるぐる、スペースで ふつうに 回す。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonGradient } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { RULES, STEP, bandOf, chanceNow, createGame, ranking, spinLeft, step } from './rules.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { SEAT_X, TABLE_Y, TABLE_Z, WOOL_COLORS, buildStage, cottonCandy } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const GAUGE_MAX = 4; // はやさの メーターの いちばん 右(回/秒)
const BOWL_Y = TABLE_Y + 0.16; // わたあめが できはじめる 高さ(ボウルの 中)
const STRAND_N = 14; // 糸 1本の 点の 数

export async function createWataame({ renderer, settings, getAudio, onExit }) {
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
    whirr(k) { noise({ len: 0.16, gain: 0.012 + k * 0.02, freq: [600 + k * 900, 900 + k * 1200], q: 2 }); },
    squeak(k) { voice({ type: 'triangle', pts: [[0, 1400 + k * 900], [0.08, 1800 + k * 1200]], len: 0.09, gain: 0.03 }); },
    tear() { noise({ len: 0.35, gain: 0.14, freq: [2500, 400], q: 0.8 }); voice({ type: 'square', pts: [[0, 600], [0.3, 160]], len: 0.32, gain: 0.04 }); },
    chance() { [[0, 880], [0.09, 1175], [0.18, 1568]].forEach(([at, f]) => voice({ type: 'triangle', pts: [[0, f]], len: 0.12, gain: 0.05, at })); },
    sugar(good) { for (let k = 0; k < (good ? 10 : 4); k++) voice({ type: 'triangle', pts: [[0, 2000 + Math.random() * 1600]], len: 0.05, gain: 0.025, at: k * 0.03 }); },
    miss() { voice({ pts: [[0, 330], [0.2, 220]], len: 0.22, gain: 0.05 }); },
    go() { voice({ type: 'square', pts: [[0, 880]], len: 0.18, gain: 0.05 }); },
    ready() { voice({ type: 'square', pts: [[0, 440]], len: 0.12, gain: 0.04 }); },
    whistle() { voice({ pts: [[0, 1800], [0.5, 900]], len: 0.6, gain: 0.04 }); },
    fanfare() { [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1047], [0.5, 1047]].forEach(([at, f], i) => voice({ type: 'square', pts: [[0, f]], len: i === 4 ? 0.6 : 0.12, gain: 0.05, at })); },
  };

  await preload(CHARACTERS.map((c) => c.key));

  // ── 演出: ちぎれた わたあめ・ざらめの つぶ・紙ふぶき ─────────
  const fx = [];
  function sprinkle(at, color, n = 16, sp = 0.8, up = 1.6) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.016 + Math.random() * 0.012, 5, 3), new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.copy(at);
      scene.add(m);
      const a = Math.random() * 6.28;
      fx.push({ obj: m, t: 0, life: 0.8, vel: new THREE.Vector3(Math.cos(a) * sp * Math.random(), up * (0.4 + Math.random()), Math.sin(a) * sp * Math.random()), kind: 'drop' });
    }
  }
  // ちぎれた ふわふわを とばす(わたあめから はずして、ふわっと とんで きえる)
  function flyPuff(m, from) {
    scene.attach(m);
    m.material = m.material.clone();
    m.material.transparent = true;
    const dir = m.position.clone().sub(from).normalize();
    fx.push({ obj: m, t: 0, life: 1.2, vel: dir.multiplyScalar(1.4 + Math.random()).add(new THREE.Vector3(0, 0.8, 0)), kind: 'puff', spin: Math.random() - 0.5 });
  }
  // ざらめ: 色の つぶが 上から さらさら ふりかかる
  function sugarRain(at, color, n = 40) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.012 + Math.random() * 0.01), new THREE.MeshBasicMaterial({ color: i % 5 ? color : 0xffffff, transparent: true }));
      const a = Math.random() * 6.28, rr = Math.random() * 0.12;
      m.position.set(at.x + Math.cos(a) * rr, at.y + 0.5 + Math.random() * 0.5, at.z + Math.sin(a) * rr);
      scene.add(m);
      fx.push({ obj: m, t: -Math.random() * 0.25, life: 0.7, vel: new THREE.Vector3(0, -1.6 - Math.random(), 0), kind: 'sugar' });
    }
  }
  // ちぎれた ときの 糸くず(白い みじかい すじが はじける)
  function snap(at, n = 14) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12 + Math.random() * 0.1, 3), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      m.position.copy(at);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(1.5 + Math.random() * 1.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 0.5, vel: v, kind: 'drop' });
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.085, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    ring.position.copy(at);
    ring.lookAt(camera.position);
    scene.add(ring);
    fx.push({ obj: ring, t: 0, life: 0.4, vel: new THREE.Vector3(), kind: 'ring' });
  }
  function confetti(at, n = 40) {
    const cols = [0xff6a9a, 0xffd24a, 0x7ad8ff, 0x8ad04a, 0xff8a3a];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.11), new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, transparent: true }));
      m.position.copy(at);
      scene.add(m);
      const a = Math.random() * 6.28;
      fx.push({ obj: m, t: 0, life: 2.4, vel: new THREE.Vector3(Math.cos(a) * 2 * Math.random(), 3 + Math.random() * 2.5, Math.sin(a) * Math.random()), kind: 'paper', spin: Math.random() * 8 });
    }
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = f.t / f.life;
      if (f.t >= 0) f.obj.position.addScaledVector(f.vel, dt);
      if (f.t < 0) { f.obj.visible = false; continue; }
      f.obj.visible = true;
      if (f.kind === 'drop') f.vel.y -= 6 * dt;
      if (f.kind === 'sugar') { f.vel.y -= 4 * dt; f.obj.rotation.x += dt * 8; }
      if (f.kind === 'ring') f.obj.scale.setScalar(1 + k * 3);
      if (f.kind === 'puff') { f.vel.multiplyScalar(1 - dt * 1.5); f.vel.y -= 0.6 * dt; f.obj.rotation.y += f.spin * dt * 4; f.obj.scale.multiplyScalar(1 + dt * 0.3); }
      if (f.kind === 'paper') { f.vel.multiplyScalar(1 - dt * 1.2); f.vel.y -= 4 * dt; f.obj.rotation.x += f.spin * dt; f.obj.rotation.y += f.spin * 0.7 * dt; }
      f.obj.material.opacity = 1 - k * k;
      if (k >= 1) { scene.remove(f.obj); f.obj.material.dispose(); fx.splice(i, 1); }
    }
  }

  // ── ゲームの進行 ────────────────────────────────────
  let mode = 'idle';
  let picked = CHARACTERS[0].key;
  let tour = null;
  let game = null;
  let intro = 1;
  const INTRO_TIME = 2.4;
  const input = { keys: new Set(), target: null, useMotion: false, asked: false, finger: 0, motion: 0, acc: 0, zarame: false };

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS });
    if (game) for (const u of game.units) scene.remove(u.holder, u.candy, u.stick, ...u.strands);
    for (const f of fx.splice(0)) scene.remove(f.obj);
    const state = createGame(players, seed);
    const units = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const holder = new THREE.Group();
      holder.add(model.root);
      holder.position.set(SEAT_X(slot), 0, 0);
      const candy = cottonCandy();
      scene.add(holder, candy);
      const def = CHARACTERS.find((c) => c.key === p.character);
      holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model.root);
      const arms = [model.node('arm_L'), model.node('arm_R')];
      // わりばし(わたあめから 手まで。毎フレーム のばす)と、ボウルから まきつく 糸
      candy.userData.stick.visible = false;
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), new THREE.MeshToonMaterial({ color: 0xf0dcb0, gradientMap: toonGradient }));
      const strands = Array.from({ length: slot === 0 ? 5 : 3 }, (_, k) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STRAND_N * 3), 3));
        const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe0f0, transparent: true, opacity: 0, depthWrite: false }));
        l.frustumCulled = false;
        l.userData.ph = k / 5 * Math.PI * 2;
        return l;
      });
      scene.add(stick, ...strands);
      return { model, holder, candy, stick, strands, size: def?.size || 1, arms, tips: arms.map(armTip), headY: box.max.y, front: box.max.z, midY: box.min.y + (box.max.y - box.min.y) * 0.42, ang: Math.random() * 6, shown: 0, strainT: 0 };
    }));
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    units[0].holder.add(marker);
    units[0].marker = marker;
    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), units, acc: 0, endTimer: null, shake: 0 };
    atmosphere.apply(params.get('time') || 'evening');
    stage.machines.forEach((m, slot) => m.userData.plate.material.color.setHex(PLAYER_COLORS[slot].hex));
    atmosphere.setupShadows(units.map((u) => u.holder), [stage.group]);
    input.zarame = false;
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoL').classList.add('show');
    $('spinAskL').hidden = !(motionAvailable() && !input.useMotion && !input.asked);
    if (!fromSky) splash('よーい…');
    updateCamera(0);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudL').hidden = m !== 'playing';
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
  $('pauseBtnL').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: 回す(加速度・ゆびで ぐるぐる)/ キー ───────────────
  // どちらも「回った 角度」を ためて、1フレームごとに 回/秒 に する
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const motionAvailable = () => typeof window.DeviceMotionEvent !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const motion = { last: null, gx: 0, gy: 0 };
  function onMotion(e) {
    // 円を かくと 加速度の 向きが ぐるっと 回る(重力は ゆっくり うごく ぶんを ひいて のぞく)
    let x, y;
    if (e.acceleration && e.acceleration.x != null) ({ x, y } = e.acceleration);
    else if (e.accelerationIncludingGravity) {
      const a = e.accelerationIncludingGravity;
      motion.gx += (a.x - motion.gx) * 0.1; motion.gy += (a.y - motion.gy) * 0.1;
      x = a.x - motion.gx; y = a.y - motion.gy;
    } else return;
    // 小さな ゆれは かぞえない。向きが 一気に とぶのも ぶれなので かぞえない
    // (手首の ひねり(ジャイロ)は 一しゅんで 針が とんで しまうので つかわない)
    if (Math.hypot(x, y) < 2.2) { motion.last = null; return; }
    const a = Math.atan2(y, x);
    if (motion.last !== null) {
      const d = wrap(a - motion.last);
      if (Math.abs(d) < 1.2) input.acc += d;
    }
    motion.last = a;
  }
  async function enableMotion() {
    input.asked = true;
    try {
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const r = await DeviceMotionEvent.requestPermission();
        if (r !== 'granted') throw new Error('denied');
      }
      window.addEventListener('devicemotion', onMotion);
      input.useMotion = true;
      $('spinAskL').hidden = true;
      splash('回して あそぶ!', 'small');
    } catch {
      input.useMotion = false;
      $('spinAskL').hidden = true;
      splash('ゆびで ぐるぐる!', 'small');
    }
  }
  $('spinOnL').addEventListener('click', (e) => { e.stopPropagation(); unlockAudio(); enableMotion(); });
  $('spinOffL').addEventListener('click', (e) => { e.stopPropagation(); input.asked = true; $('spinAskL').hidden = true; });
  const playing = () => mode === 'playing' && !paused;
  // ゆびで ぐるぐる: なぞる 向きが 回った ぶんを たす(円の 中心が どこでも、1周で 1回)
  const finger = { id: null, x: 0, y: 0, last: null };
  window.addEventListener('pointerdown', (e) => {
    if (!playing() || e.target.closest('button, a, .spinask')) return;
    unlockAudio();
    Object.assign(finger, { id: e.pointerId, x: e.clientX, y: e.clientY, last: null });
    $('howtoL').classList.remove('show');
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== finger.id || !playing()) return;
    const dx = e.clientX - finger.x, dy = e.clientY - finger.y;
    if (Math.hypot(dx, dy) < 5) return; // ちいさな ゆれは まとめる
    finger.x = e.clientX;
    finger.y = e.clientY;
    const a = Math.atan2(dy, dx);
    if (finger.last !== null) input.acc += wrap(a - finger.last);
    finger.last = a;
  });
  for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, (e) => { if (e.pointerId === finger.id) finger.id = null; });
  const zBtn = $('zarameL');
  zBtn.addEventListener('pointerdown', (e) => {
    if (!playing()) return;
    e.preventDefault();
    e.stopPropagation();
    unlockAudio();
    input.zarame = true;
    zBtn.classList.add('down');
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) zBtn.addEventListener(ev, () => zBtn.classList.remove('down'));
  window.addEventListener('keydown', (e) => {
    if (mode !== 'playing') return;
    if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!paused); return; }
    if (e.code === 'Enter' && !e.repeat) { unlockAudio(); input.zarame = true; return; }
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); unlockAudio(); input.keys.add(e.code); }
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => input.keys.clear());

  // 回った 角度 → 回/秒(すこし なめらかに)。向きつきで ならすので、いったり きたりは うちけしあう
  let spinRate = 0, spinSigned = 0;
  function sampleSpin(dt) {
    const raw = input.acc / (Math.PI * 2) / Math.max(dt, 1e-3);
    input.acc = 0;
    spinSigned += (raw - spinSigned) * Math.min(1, dt * (input.useMotion ? 2.5 : 4)); // スマホを 回す ときは よけいに ならす
    spinRate = Math.abs(spinSigned);
  }
  function myInput() {
    const zarame = input.zarame;
    input.zarame = false;
    if (input.target) return { ...input.target, zarame: input.target.zarame ?? zarame };
    let spin = spinRate;
    if (input.keys.has('Space')) spin = Math.max(spin, 1.6);
    if (input.keys.has('ArrowUp')) spin = Math.max(spin, 2.6);
    return { spin, zarame };
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashL');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildChips() {
    $('chipsL').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'chip' + (slot === 0 ? ' me' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      d.innerHTML = '<i></i><b>0</b>';
      return d;
    }));
  }
  const gauge = $('gaugeL');
  function renderHud() {
    const s = game.state;
    const order = ranking(s);
    [...$('chipsL').children].forEach((c, slot) => {
      c.querySelector('b').textContent = `${Math.floor(s.units[slot].size)}cm`;
      c.style.order = String(order.indexOf(slot));
      c.classList.toggle('lead', order[0] === slot && s.units[slot].size > 0);
    });
    $('timeL').textContent = s.phase === 'spin' ? String(Math.ceil(spinLeft(s))) : '';
    const u = s.units[0];
    // はやさの メーター: 半円(0〜GAUGE_MAX 回/秒)。みどり = ちょうどいい、あか = はやすぎ
    const [lo, hi] = bandOf(u.size);
    const deg = (w) => clamp(w / GAUGE_MAX, 0, 1) * 180;
    gauge.style.setProperty('--lo', `${deg(lo)}deg`);
    gauge.style.setProperty('--hi', `${deg(hi)}deg`);
    gauge.style.setProperty('--w', `${deg(u.w) - 90}deg`);
    gauge.style.setProperty('--strain', String(clamp(u.strain, 0, 1)));
    gauge.hidden = s.phase !== 'spin';
    gauge.classList.toggle('over', u.w > hi);
    $('hudL').classList.toggle('danger', s.phase === 'spin' && u.strain > 0.55);
    // ざらめ: わが ちぢんで ボタンに かさなったら おす
    const ch = chanceNow(s);
    const open = ch.i >= 0 && u.zarame[ch.i] === undefined;
    zBtn.hidden = !open;
    if (open) {
      zBtn.style.setProperty('--k', String(clamp(ch.left / RULES.ring, -0.2, 1)));
      zBtn.style.setProperty('--zc', css(WOOL_COLORS[ch.i + 1]));
      zBtn.classList.toggle('now', Math.abs(ch.left) <= RULES.perfect);
    }
  }
  const tmpV = new THREE.Vector3();
  // 腕の ノードの 中で、つけねから いちばん とおい ところ(手の 先)を 腕の 座標で
  function armTip(arm) {
    if (!arm) return null;
    arm.updateMatrixWorld(true);
    const inv = arm.matrixWorld.clone().invert();
    let best = null, bd = -1;
    const v = new THREE.Vector3();
    arm.traverse((o) => {
      if (!o.isMesh) return;
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 3) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
        const d = v.lengthSq();
        if (d > bd) { bd = d; best = v.clone(); }
      }
    });
    return best ? best.multiplyScalar(0.85) : null; // 先から すこし もどった ところで にぎる
  }
  // 2点の あいだに わりばしを わたす
  const UP = new THREE.Vector3(0, 1, 0);
  function stretch(mesh, a, b) {
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    const d = tmpV.copy(b).sub(a);
    mesh.scale.set(1, d.length(), 1);
    mesh.quaternion.setFromUnitVectors(UP, d.normalize());
  }
  function pop(text, at, cls = '', life = 900) {
    tmpV.copy(at).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsL').append(el);
    setTimeout(() => el.remove(), life);
  }
  const woolTop = (u) => u.candy.position.clone().add(new THREE.Vector3(0, (u.candy.userData.r || 0.05) + 0.15, 0));

  // ── できごと ────────────────────────────────────────
  const Q_TEXT = { perfect: 'ぴったり!', good: 'いいね!', early: 'はやい…', miss: 'おそい…', still: '回して!' };
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'go':
          splash('ぐるぐる!', 'gold');
          sfx.go();
          setTimeout(() => game?.state === s && $('howtoL').classList.remove('show'), 4500);
          break;
        case 'chance':
          $('howtoL').classList.remove('show');
          splash('ざらめ チャンス!', 'small');
          sfx.chance();
          break;
        case 'zarame': {
          const u = game.units[e.slot];
          const good = e.q === 'perfect' || e.q === 'good';
          if (good) {
            u.candy.userData.setColor(e.i + 1);
            u.colorUntil = s.units[e.slot].size + 3.5; // 色の しまは すこしの あいだ だけ(また ピンクに もどる)
            sugarRain(u.candy.position, WOOL_COLORS[e.i + 1], e.slot === 0 ? (e.q === 'perfect' ? 70 : 40) : 16);
            u.flash = 1; // わたあめが ぱっと 光って ふくらむ
            stage.machines[e.slot].userData.glow.material.color.setHex(WOOL_COLORS[e.i + 1]);
          }
          if (e.slot === 0) {
            if (good) sfx.sugar(e.q === 'perfect'); else sfx.miss();
            pop(Q_TEXT[e.q] + (e.bonus ? ` +${e.bonus}cm` : ''), woolTop(u), good ? 'gold' : 'red', 900);
          }
          break;
        }
        case 'tear': {
          const u = game.units[e.slot];
          const from = u.candy.position.clone();
          for (const m of u.candy.userData.tear(s.units[e.slot].size)) flyPuff(m, from);
          snap(from.clone().add(new THREE.Vector3(0, u.candy.userData.r * 0.6, 0)), e.slot === 0 ? 18 : 8);
          sprinkle(from, 0xffffff, e.slot === 0 ? 24 : 10, 1.4, 1.2);
          u.candy.userData.setSize(s.units[e.slot].size);
          u.shown = s.units[e.slot].size;
          if (e.slot === 0) { sfx.tear(); game.shake = 0.35; pop(`ちぎれた! -${e.lost}cm`, woolTop(u), 'red', 1100); }
          break;
        }
        case 'show': {
          splash('そこまで!', 'small');
          sfx.whistle();
          const top = Math.max(...e.sizes);
          game.units.forEach((u, slot) => setTimeout(() => {
            if (game?.state !== s) return;
            pop(`${e.sizes[slot]}cm`, woolTop(u), e.sizes[slot] === top ? 'gold' : slot === 0 ? 'me' : '', 2400);
          }, 500 + slot * 120));
          break;
        }
        case 'finished': {
          game.endTimer = 5;
          const win = e.winner === 0;
          if (win) { sfx.fanfare(); splash('1い!', 'gold'); } else splash(`${ranking(s).indexOf(0) + 1}い`, 'small');
          const w = game.units[e.winner];
          confetti(new THREE.Vector3(w.holder.position.x, 2.6, 0.4), 60);
          w.win = true;
          game.finale = 0.4;
          const crown = new THREE.Group();
          const gold = new THREE.MeshToonMaterial({ color: 0xffcf3a, emissive: 0x5a3a00, gradientMap: toonGradient });
          const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12, 1, true), gold);
          band.material.side = THREE.DoubleSide;
          crown.add(band);
          for (let k = 0; k < 5; k++) {
            const sp = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 4), gold);
            sp.position.set(Math.cos((k / 5) * 6.28) * 0.2, 0.12, Math.sin((k / 5) * 6.28) * 0.2);
            crown.add(sp);
          }
          crown.position.set(0, w.headY + 0.05, 0);
          w.holder.add(crown);
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
    $('resultTitle').textContent = order[0] === 0 ? 'あなたの 勝ち!' : `${CHARACTERS.find((c) => c.key === game.players[order[0]].character).name}の 勝ち!`;
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = game.players[slot];
      const u = s.units[slot];
      const li = document.createElement('li');
      if (slot === 0) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : 'あなた';
      const def = CHARACTERS.find((c) => c.key === p.character);
      const sugar = u.zarame.filter((q) => q === 'perfect').length;
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}${u.tears ? `・ちぎれ ${u.tears}` : ''}${sugar ? `・ぴったり ${sugar}` : ''}</small></span><span class="dist">${u.size}<small>cm</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateWorld(dt) {
    const s = game.state;
    s.units.forEach((su, slot) => {
      const u = game.units[slot];
      const x = SEAT_X(slot);
      const mach = stage.machines[slot].userData;
      const spinning = s.phase === 'spin';
      // わりばし: ボウルの 上で 小さく 円を かく(回す はやさで)
      u.ang += dt * su.w * Math.PI * 2;
      const r = u.candy.userData.r || 0.05;
      const orbit = 0.05 + Math.min(0.08, su.w * 0.02);
      const cy = BOWL_Y + r * 0.7;
      u.candy.position.set(x + Math.cos(u.ang) * orbit, cy, TABLE_Z + Math.sin(u.ang) * orbit * 0.6);
      u.candy.rotation.y = u.ang * 0.5;
      // はり: 糸が ぴんと はると、たてに のびて ふるえる
      const st = clamp(su.strain, 0, 1);
      const wob = st > 0.3 ? Math.sin(time * 40) * st * 0.04 : 0;
      u.candy.userData.wool.scale.set(1 - st * 0.08 + wob, 1 + st * 0.15, 1 - st * 0.08 - wob);
      // 大きさは じわっと おいつく
      if (Math.abs(u.shown - su.size) > 0.05) { u.shown += (su.size - u.shown) * Math.min(1, dt * 6); u.candy.userData.setSize(u.shown); }
      if (u.colorUntil && u.shown > u.colorUntil) { u.colorUntil = 0; u.candy.userData.setColor(0); }
      if (slot === 0 && spinning) {
        if (st > 0.3 && !u.warned) { u.warned = true; pop('ゆっくり!', woolTop(u), 'red', 900); }
        if (st < 0.05) u.warned = false;
      }
      if (slot === 0 && spinning && st > 0.4) { u.strainT -= dt; if (u.strainT <= 0) { u.strainT = 0.25 - st * 0.15; sfx.squeak(st); } }
      // わたあめ機: つぼが 回って、糸が ボウルの 中を まわる
      mach.head.rotation.y += dt * (spinning ? 30 : 4);
      mach.threads.forEach((m, k) => { m.rotation.y += dt * (spinning ? 9 + k * 3 : 1); m.material.opacity = spinning ? 0.55 : 0.15; });
      mach.glow.material.opacity = 0.22 + Math.sin(time * 8 + slot) * 0.08;
      // キャラ: 両手で わりばしを もって 回す。ちぎれたら びっくり
      const torn = su.stun > 0;
      u.model.setFace(torn ? 'surprised' : u.win ? 'happy' : st > 0.5 ? 'surprised' : 'normal');
      u.model.play(u.win ? 'cheer' : 'idle');
      u.model.update(dt);
      // 両手で わりばしを にぎって、手ごと 小さく 円を かく(体も すこし ゆれる)
      const [aL, aR] = u.arms;
      const c = Math.cos(u.ang), sn = Math.sin(u.ang);
      const pw = clamp(su.w / 2.5, 0, 1);
      // 「そこまで!」の あとは わたあめを 高く かかげて 見せあう
      const done = s.phase === 'show' || s.phase === 'finished';
      u.raise = (u.raise || 0) + ((done ? 1 : 0) - (u.raise || 0)) * Math.min(1, dt * 4);
      const rs = u.raise * u.raise * (3 - 2 * u.raise);
      if (aL && aR) {
        aL.rotation.x = aR.rotation.x = (-0.95 + sn * 0.16 * pw - (torn ? 0.5 : 0)) * (1 - rs) + (-2.75 + (u.win ? Math.sin(time * 8) * 0.15 : 0)) * rs;
        aL.rotation.z = (-0.5 + c * 0.12 * pw) * (1 - rs) - 0.25 * rs; aR.rotation.z = (0.5 + c * 0.12 * pw) * (1 - rs) + 0.25 * rs; // 手を まえで あわせる
      }
      u.holder.position.y = u.win ? Math.abs(Math.sin(time * 6 + slot)) * 0.25 : 0;
      u.holder.rotation.z = c * 0.04 * pw * (1 - rs);
      u.holder.rotation.x = (0.06 + sn * 0.03 * pw) * (1 - rs); // すこし まえかがみ
      u.holder.updateMatrixWorld(true);
      // わりばし: わたあめの しんから 両手の まんなかへ
      const hand = new THREE.Vector3();
      if (u.tips[0] && u.tips[1]) {
        hand.copy(u.tips[0]).applyMatrix4(aL.matrixWorld).add(tmpV.copy(u.tips[1]).applyMatrix4(aR.matrixWorld)).multiplyScalar(0.5);
      } else hand.set(x, u.midY + 0.3, u.front + 0.1);
      const top = hand.clone().add(new THREE.Vector3(0, -0.02, 0.1 * (1 - rs))); // 手の まえ(口に ささらない ように)
      if (rs > 0.001) {
        // かかげる: わたあめは 手の 上
        const up = new THREE.Vector3(top.x, u.holder.position.y + u.headY + r + 0.12, top.z + 0.05); // 頭の 上(顔に かからない)
        u.candy.position.lerp(up, rs);
        u.candy.rotation.y += dt * 1.5;
      }
      stretch(u.stick, u.candy.position, rs > 0.5 ? top.clone().add(new THREE.Vector3(0, -0.12, 0)) : top);
      // 糸: ボウルの ふちから ぐるっと うずを まいて わたあめへ。はりが あると ぴんと まっすぐ、赤く 光る
      const gain = spinning && su.stun <= 0 ? clamp(su.w / 1.2, 0, 1) : 0;
      u.strands.forEach((l, k) => {
        const pa = l.geometry.attributes.position;
        const a0 = -time * (6 + su.w * 2) + l.userData.ph;
        const rim = 0.33;
        const curl = (1 - st) * 2.2 + 0.3;
        for (let i = 0; i < STRAND_N; i++) {
          const f = i / (STRAND_N - 1);
          const rr = rim + (r * 0.8 - rim) * f;
          const aa = a0 + f * curl;
          const yy = TABLE_Y + 0.12 + (u.candy.position.y - TABLE_Y - 0.12) * f + Math.sin(f * Math.PI) * 0.05 * (1 - st);
          const cx = x + (u.candy.position.x - x) * f, cz = TABLE_Z + (u.candy.position.z - TABLE_Z) * f;
          pa.setXYZ(i, cx + Math.cos(aa) * rr, yy, cz + Math.sin(aa) * rr * 0.9);
        }
        pa.needsUpdate = true;
        l.material.opacity = gain * (0.35 + 0.5 * Math.abs(Math.sin(time * 9 + k)));
        l.material.color.setHex(st > 0.5 ? (Math.sin(time * 30) > 0 ? 0xff3a2a : 0xffffff) : 0xffd0e8);
      });
      if (u.flash > 0) {
        u.flash = Math.max(0, u.flash - dt * 2.2);
        u.candy.userData.wool.scale.multiplyScalar(1 + Math.sin(u.flash * Math.PI) * 0.12);
      }
      // はりが つよいと、わたあめも 赤っぽく 光る
      u.candy.userData.wool.children.forEach((m) => { if (m.material.emissive) m.material.emissiveIntensity = 0.35 + (u.flash || 0) * 0.8 + (st > 0.5 ? Math.abs(Math.sin(time * 20)) * st * 0.5 : 0); });
      if (u.marker) u.marker.position.set(0, u.headY + 0.35 + Math.sin(time * 5) * 0.06, 0);
    });
    // いちばんの しるし(回して いる あいだと 見せあう とき)
    const lead = ranking(s)[0];
    const lu = game.units[lead];
    leadStar.visible = (s.phase === 'spin' || s.phase === 'show') && s.units[lead].size > 3;
    if (leadStar.visible) {
      leadStar.position.copy(lu.candy.position).add(new THREE.Vector3(0, (lu.candy.userData.r || 0.05) + 0.2 + Math.sin(time * 4) * 0.04, 0));
      leadStar.material.rotation = Math.sin(time * 2) * 0.3;
    }
    // 自分が 1ばんに なった
    if (s.phase === 'spin' && lead !== game.lastLead) {
      if (lead === 0 && game.lastLead !== undefined && time - (game.topAt || -9) > 3) { game.topAt = time; pop('トップ!', woolTop(game.units[0]), 'gold', 900); sfx.chance(); }
      game.lastLead = lead;
    }
    // 決着: 紙ふぶきを つづけて
    if (s.phase === 'finished' && game.finale !== undefined) {
      game.finale -= dt;
      if (game.finale <= 0) {
        game.finale = 0.5;
        const wx = game.units[s.winner].holder.position.x;
        confetti(new THREE.Vector3(wx + (Math.random() - 0.5) * 2, 3.2, 0.2), 24);
      }
    }
    for (const u of game.units) if (u.crown) { u.crown.rotation.y = time * 2; u.crown.position.y = u.headY + 0.05 + Math.sin(time * 4) * 0.03; }
    // ざらめ チャンス: 自分の ボウルの まわりの わが ちぢんで、ふちに かさなった ときが ぴったり(ボタンの わと おなじ)
    const ch = chanceNow(s);
    const open = ch.i >= 0 && s.units[0].zarame[ch.i] === undefined;
    chanceRing.visible = open;
    if (open) {
      const k = clamp(ch.left / RULES.ring, 0, 1);
      chanceRing.position.set(SEAT_X(0), TABLE_Y + 0.21, TABLE_Z);
      chanceRing.scale.setScalar(1 + k * 2.2);
      chanceRing.material.color.setHex(Math.abs(ch.left) <= RULES.perfect ? 0xffe066 : WOOL_COLORS[ch.i + 1]);
      chanceRing.material.opacity = 0.5 + (1 - k) * 0.5;
      stage.machines[0].userData.glow.material.color.setHex(WOOL_COLORS[ch.i + 1]);
    }
    stage.update(time);
  }
  // いちばん 大きい 子の わたあめの 上に 光る 星
  const leadStar = new THREE.Sprite(new THREE.SpriteMaterial({ map: (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.translate(32, 32);
    g.fillStyle = '#ffd24a'; g.strokeStyle = '#fff6d0'; g.lineWidth = 4;
    g.beginPath();
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? 12 : 28; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath(); g.fill(); g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })(), transparent: true, depthWrite: false }));
  leadStar.scale.setScalar(0.28);
  leadStar.visible = false;
  scene.add(leadStar);
  const chanceRing = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.42, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  chanceRing.visible = false;
  scene.add(chanceRing);

  let freeCamera = false;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  function updateCamera(dt) {
    if (freeCamera || !game) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const s = game.state;
    // ふつう: お店の 正面から みんなを
    camPos.set(0, portrait ? 2.4 : 2.1, portrait ? 12.2 : 6.6);
    camLook.set(0, portrait ? 2.0 : 1.3, -0.4); // たては 上に お店と 空を 入れる
    // 回す あいだは 自分の わたあめを ななめ上から アップ
    const close = s.phase === 'spin' ? 1 : 0;
    game.zoom = (game.zoom ?? 0) + (close - (game.zoom ?? 0)) * Math.min(1, dt * (close ? 2.5 : 2));
    if (game.zoom > 0.001) {
      const mu = game.units[0];
      const bx = SEAT_X(0);
      const r = mu.candy.userData.r || 0.05;
      const z = game.zoom * game.zoom * (3 - 2 * game.zoom);
      // ななめ上から ボウルを のぞきこむ(顔は おくに 入る)
      camPos.lerp(new THREE.Vector3(bx + 0.35, BOWL_Y + 1.5 + r * 1.2, TABLE_Z + (portrait ? 2.3 : 1.8) + r * 2), z);
      camLook.lerp(new THREE.Vector3(bx, BOWL_Y + r * 0.6 + 0.25, TABLE_Z - 0.1), z);
    }
    // 決着: 勝った 子へ 寄る
    game.winCam = s.phase === 'finished' ? Math.min(1, (game.winCam ?? 0) + dt * 0.8) : 0;
    if (game.winCam > 0 && s.winner !== null) {
      const wx = game.units[s.winner].holder.position.x;
      const z = game.winCam * game.winCam * (3 - 2 * game.winCam);
      camPos.lerp(new THREE.Vector3(wx, 1.9, portrait ? 4.6 : 3.4), z);
      camLook.lerp(new THREE.Vector3(wx, 1.1, 0), z);
    }
    camera.fov = portrait ? 56 : 46;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      camera.position.lerpVectors(new THREE.Vector3(6, 20, 16), camPos, e);
      camera.lookAt(camLook);
      return;
    }
    camera.position.copy(camPos);
    if (game.shake > 0) {
      game.shake = Math.max(0, game.shake - dt);
      camera.position.x += (Math.random() - 0.5) * game.shake * 0.3;
      camera.position.y += (Math.random() - 0.5) * game.shake * 0.3;
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
  let time = 0, whirrT = 0;
  function frame(rawDt) {
    const dt = Math.min(rawDt, 0.1);
    time += dt;
    if (mode === 'playing' && intro >= 1) watchQuality(rawDt);
    if (intro < 1 && !paused) {
      intro = Math.min(1, intro + dt / INTRO_TIME);
      if (intro >= 1) splash('よーい…');
    }
    sampleSpin(Math.min(rawDt, 0.5)); // 回った 角度は ほんとうの 時間で わる(重い ときに 速く 見えない ように)
    if (game && mode === 'playing' && !paused && intro >= 1 && $('spinAskL').hidden) {
      const s = game.state;
      game.acc += dt;
      while (game.acc >= STEP && s.phase !== 'finished') {
        const mi = myInput();
        const inputs = game.players.map((p, slot) => (p.cpu ? cpuInput(game.cpus[slot], s, slot) : mi));
        onEvents(step(s, inputs));
        game.acc -= STEP;
      }
      const left = spinLeft(s);
      if (s.phase === 'spin' && left <= 10 && !game.spurt) { game.spurt = true; splash('ラスト 10びょう!', 'gold small'); sfx.chance(); }
      if (s.phase === 'spin' && left <= 5 && Math.ceil(left) !== game.tick) { game.tick = Math.ceil(left); sfx.ready(); }
      $('hudL').classList.toggle('spurt', s.phase === 'spin' && left <= 10);
      // ぶーん の 音(自分の わりばし)
      const u = s.units[0];
      whirrT -= dt;
      if (s.phase === 'spin' && whirrT <= 0 && u.w > 0.4) { whirrT = 0.15; sfx.whirr(Math.min(1, u.w / 3)); }
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
  window.dwataame = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    get spinRate() { return spinRate; },
    start: (key = picked) => { picked = key; return startGame(); },
    steer: (t) => { input.target = t; },
    skipAsk: () => { input.asked = true; $('spinAskL').hidden = true; },
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
    exit() { setMode('idle'); },
    get intro() { return intro; },
  };
}
