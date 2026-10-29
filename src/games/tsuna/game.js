// 川原の つなひき の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
//
// 動かし方: 画面のどこでも 連打(パソコンは スペース / エンター)。先生の「せーの!」で 力が 2倍。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonMaterial } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { RULES, STEP, cheer, createGame, ranking, seenoOn, step, timeLeft } from './rules.js';
import { createNetDriver, replaceState } from '../../net/drive.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { FRONT, GAP, HOST, SEATS, STREAM_W, STUMP_TOP, WATER_Y, buildStage, groundY } from './stage.js';
import { createAtmosphere, windify } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);
const HELPER_NAMES = { risu: 'リス', harinezumi: 'ハリネズミ', komadori: 'コマドリ' };
const HELPER_COLOR = 0xb8a890;

export async function createTsuna({ renderer, settings, getAudio, onExit }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 700);
  const atmosphere = createAtmosphere(scene, renderer, camera, { course: false });
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
    // ドン: 太鼓(「せーの!」)
    drum() { voice({ type: 'triangle', pts: [[0, 130], [0.1, 60]], len: 0.16, gain: 0.16 }); noise({ len: 0.05, gain: 0.05, freq: [800, 200], type: 'lowpass' }); },
    // 自分の タップ(せーのの あいだは 明るい音)
    tap(on) { voice({ type: 'triangle', pts: [[0, on ? 660 : 330 + Math.random() * 40], [0.04, on ? 880 : 260]], len: 0.05, gain: on ? 0.05 : 0.035 }); },
    sync() { [0, 0.06].forEach((at, i) => voice({ type: 'triangle', pts: [[0, 660 + i * 220], [0.08, 880 + i * 220]], len: 0.14, gain: 0.07, at })); },
    hoot() { voice({ pts: [[0, 420], [0.12, 380]], len: 0.18, gain: 0.08 }); voice({ pts: [[0, 420], [0.12, 360]], len: 0.22, gain: 0.08, at: 0.22 }); },
    plop() { noise({ len: 0.4, gain: 0.14, freq: [1200, 300], type: 'lowpass', attack: 0.005 }); },
    tick(n) { voice({ type: 'square', pts: [[0, n <= 1 ? 1046 : 784]], len: 0.09, gain: 0.05 }); },
    roll() { voice({ type: 'triangle', pts: [[0, 130 + Math.random() * 20], [0.06, 70]], len: 0.08, gain: 0.09 }); },
    slip() { voice({ pts: [[0, 900], [0.25, 300]], len: 0.3, gain: 0.08 }); },
    save() { voice({ type: 'triangle', pts: [[0, 440], [0.1, 660]], len: 0.15, gain: 0.08 }); },
    fall() { noise({ len: 0.25, gain: 0.12, freq: [600, 150], type: 'lowpass' }); },
    splash() { noise({ len: 1.0, gain: 0.3, freq: [1600, 300], type: 'lowpass', q: 0.6, attack: 0.005 }); voice({ pts: [[0, 500], [0.25, 120]], len: 0.3, gain: 0.08 }); },
    fanfare() {
      [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1047]].forEach(([at, f]) => voice({ type: 'square', pts: [[0, f]], len: 0.12, gain: 0.05, at }));
      voice({ type: 'square', pts: [[0, 1047]], len: 0.6, gain: 0.05, at: 0.5, vib: 12, vibRate: 7 });
    },
  };

  // ── 先生・観客 ─────────────────────────────────────
  await preload([...CHARACTERS.map((c) => c.key), 'hoho', 'risu', 'harinezumi', 'komadori']);
  const owl = await createModel('hoho');
  owl.root.position.set(HOST.x, HOST.top, HOST.z);
  owl.play('idle');
  owl.setFace('normal');
  scene.add(owl.root);
  const audience = await Promise.all(SEATS.map(async (seat) => {
    const m = await createModel(seat.kind);
    m.root.position.set(seat.x, STUMP_TOP, seat.z);
    m.root.rotation.y = Math.atan2(-seat.x, -seat.z + 3);
    m.play('idle');
    m.actions.idle.time = Math.random() * 2;
    m.setFace('normal');
    scene.add(m.root);
    return { seat, model: m, side: seat.x < 0 ? 'L' : 'R' };
  }));
  atmosphere.setupShadows([stage.group, owl.root], [stage.group]);

  // ── つな ───────────────────────────────────────────
  const ropeTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = '#d8b880';
    g.fillRect(0, 0, 64, 16);
    g.strokeStyle = '#a8864e';
    g.lineWidth = 3;
    for (let x = -16; x < 80; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 16, 16); g.stroke(); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(30, 1);
    return t;
  })();
  const ROPE_LEN = (FRONT + GAP * 2 + 1.2) * 2;
  // つなは 毎フレーム 形を 作りなおす: ゆるむと まん中が たれて ゆれ、引いた 直後は ぴんと 張る
  const rope = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshToonMaterial({ map: ropeTex }));
  rope.castShadow = true;
  scene.add(rope);
  const ropePts = Array.from({ length: 17 }, () => new THREE.Vector3());
  const ROPE_Y = 0.82;
  const TAIL = FRONT + GAP * 2 + 0.25; // いちばん うしろの子の 手より 外は、地面へ たれる
  let tension = 0;
  let ropeSag = 0.1;
  function shapeRope() {
    const half = ROPE_LEN / 2;
    ropeSag = 0.012 + 0.11 * (1 - tension);
    const wob = 0.02 * (1 - tension);
    for (let i = 0; i < ropePts.length; i++) {
      const x = ((i / (ropePts.length - 1)) * 2 - 1) * half;
      const ax = Math.abs(x);
      let y = 0;
      if (ax < FRONT) y = -(ropeSag + Math.sin(time * 6) * wob) * (1 - (x / FRONT) ** 2);
      else if (ax > TAIL) y = -(((ax - TAIL) / (half - TAIL)) ** 1.6) * (ROPE_Y - 0.06);
      ropePts[i].set(x, y, ax > TAIL ? (ax - TAIL) * 0.35 : 0);
    }
    rope.geometry.dispose();
    rope.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ropePts), 40, 0.045, 6);
  }
  // まん中の 赤い目じるし
  const ribbon = new THREE.Group();
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), toonMaterial(0xe8344a));
  ribbon.add(knot);
  for (const s of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.02), toonMaterial(0xe8344a));
    tail.position.set(s * 0.05, -0.16, 0);
    tail.rotation.z = s * 0.3;
    ribbon.add(tail);
  }
  scene.add(ribbon);
  // 勝ちの 線(左右の 川原の 目じるしの 旗)
  for (const sx of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6), toonMaterial(0x7a5032));
    pole.position.set(sx * RULES.win, 0.55, -0.7);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    flag.position.set(sx * RULES.win + 0.17, 1.0, -0.7);
    scene.add(pole, flag);
  }

  // ── しぶき・きらきら・紙ふぶき ─────────────────────────
  const fx = [];
  const dropGeo = new THREE.SphereGeometry(0.05, 6, 4);
  const dropMat = new THREE.MeshBasicMaterial({ color: 0xdff4ff });
  const mudMat = new THREE.MeshBasicMaterial({ color: 0x6a4a2a });
  function splashAt(x, z, size = 1, { y = WATER_Y + 0.1, mat = dropMat, up = 1 } = {}) {
    for (let i = 0; i < 30 * size; i++) {
      const m = new THREE.Mesh(dropGeo, mat);
      m.position.set(x, y, z);
      scene.add(m);
      const a = Math.random() * Math.PI * 2, sp = (0.5 + Math.random() * 1.5) * size;
      fx.push({ obj: m, t: 0, life: 1.2, vel: new THREE.Vector3(Math.cos(a) * sp, (3 + Math.random() * 3) * up, Math.sin(a) * sp), kind: 'drop', floor: y - 0.12 });
    }
  }
  // どろの 水たまり(すべった 足もと。少しずつ うすれる)
  const puddleGeo = new THREE.CircleGeometry(0.6, 14).rotateX(-Math.PI / 2);
  function mudAt(x, z) {
    splashAt(x, z + 0.2, 0.5, { y: 0.1, mat: mudMat, up: 0.5 });
    const m = new THREE.Mesh(puddleGeo, new THREE.MeshBasicMaterial({ color: 0x5a3e22, transparent: true, opacity: 0.85, depthWrite: false }));
    m.position.set(x, 0.015, z + 0.15);
    m.scale.set(0.6, 1, 0.45);
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 2.6, vel: new THREE.Vector3(), kind: 'puddle' });
  }
  // 水の わ(ざぶんの あとに ひろがる)
  const rippleGeo = new THREE.RingGeometry(0.85, 1, 28).rotateX(-Math.PI / 2);
  function ripple(x, z, size = 1) {
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
      m.position.set(x, WATER_Y + 0.02, z);
      scene.add(m);
      fx.push({ obj: m, t: -i * 0.25, life: 1.4, vel: new THREE.Vector3(), kind: 'ripple', size });
    }
  }
  const puffGeo = new THREE.IcosahedronGeometry(0.12, 1);
  function puff(x, y, z, n = 3, color = 0xd8c8a0) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
      m.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 0.5, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6), kind: 'puff' });
    }
  }
  const confettiGeo = new THREE.PlaneGeometry(0.12, 0.07);
  function confetti(x, z) {
    const colors = [...PLAYER_COLORS.map((c) => c.hex), 0xffd24a, 0xffffff];
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true }));
      m.position.set(x + (Math.random() - 0.5) * 4, 3.5 + Math.random() * 2.5, z + (Math.random() - 0.5) * 2);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 3 + Math.random() * 1.5, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, -(0.7 + Math.random() * 0.6), (Math.random() - 0.5) * 0.6), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), kind: 'confetti' });
    }
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = f.t / f.life;
      if (f.kind === 'drop') {
        f.vel.y -= dt * 12;
        f.obj.position.addScaledVector(f.vel, dt);
        if (f.obj.position.y < Math.min(f.floor, WATER_Y)) f.t = f.life;
      } else if (f.kind === 'puff') {
        f.obj.position.addScaledVector(f.vel, dt);
        f.obj.scale.setScalar(1 + k * 1.5);
        f.obj.material.opacity = 0.8 * (1 - k);
      } else if (f.kind === 'ripple') {
        const r = 0.2 + Math.max(0, k) * f.size;
        f.obj.scale.set(r, 1, r * 0.8);
        f.obj.visible = f.t > 0;
        f.obj.material.opacity = 0.8 * (1 - Math.max(0, k));
      } else if (f.kind === 'puddle') {
        f.obj.scale.set(0.6 + Math.min(1, f.t * 6) * 0.6, 1, 0.45 + Math.min(1, f.t * 6) * 0.4);
        f.obj.material.opacity = 0.85 * Math.min(1, (1 - k) * 2.5);
      } else if (f.kind === 'confetti') {
        f.obj.position.addScaledVector(f.vel, dt);
        f.obj.rotation.x += f.spin.x * dt;
        f.obj.rotation.y += f.spin.y * dt;
        f.obj.material.opacity = Math.min(1, (1 - k) * 3);
        if (f.obj.position.y < 0.02) { f.obj.position.y = 0.02; f.vel.set(0, 0, 0); f.spin.set(0, 0, 0); }
      }
      if (k >= 1) {
        scene.remove(f.obj);
        if (f.kind !== 'drop') f.obj.material.dispose();
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
  let pressed = false;

  async function startGame({ fromSky = false } = {}) {
    const net = tour?.net ?? null; // オンライン: { client, start }。席・種・顔ぶれは サーバーが きめる
    const meSeat = net ? net.start.seat : 0;
    const seed = net ? net.start.seed : params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS, me: meSeat });
    if (game) for (const u of game.units) scene.remove(u.holder);
    for (const f of fx.splice(0)) scene.remove(f.obj);
    const state = createGame(players, seed);
    if (net) replaceState(state, net.start.s);
    // 見た目の なかま(プレイヤーと すけっと)。チームの中の ならび順は teams の順
    const units = [];
    for (const side of ['L', 'R']) {
      for (const [k, id] of state.teams[side].entries()) {
        const helper = id < 0;
        const key = helper ? state.helpers[-1 - id].kind : players[id].character;
        const model = await createModel(key);
        if (!helper) model.setPlayerColor(PLAYER_COLORS[id].hex);
        model.setFace('normal');
        model.play('idle');
        const holder = new THREE.Group();
        const body = new THREE.Group();
        body.add(model.root);
        holder.add(body);
        scene.add(holder);
        const def = CHARACTERS.find((c) => c.key === key);
        units.push({ id, side, k, helper, model, holder, body, size: helper ? 1 : def?.size || 1, yank: 0, fall: null, arms: [model.node('arm_L'), model.node('arm_R')] });
      }
    }
    const me = units.find((u) => u.id === meSeat);
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[meSeat].hex }));
    marker.rotation.x = Math.PI;
    me.holder.add(marker);
    me.marker = marker;
    game = { me: meSeat, net: net ? createNetDriver({ client: net.client, rules: { STEP, step }, state, me: meSeat }) : null, seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), units, acc: 0, endTimer: null, shake: 0, seenoPull: { L: 0, R: 0 }, myTaps: [], rate: 0, count: null, roll: 0, edgeSide: null, slow: 0 };
    atmosphere.apply(params.get('time') || state.timeOfDay);
    atmosphere.setupShadows(units.map((u) => u.holder), []);
    pressed = false;
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoN').classList.add('show');
    if (!fromSky) splash('よーい…');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudN').hidden = m !== 'playing';
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
  $('pauseBtnN').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: どこでも タップ ─────────────────────────────
  window.addEventListener('pointerdown', (e) => {
    if (mode !== 'playing' || paused || e.target.closest('button, a')) return;
    unlockAudio();
    $('howtoN').classList.remove('show');
    pressed = true;
  });
  window.addEventListener('keydown', (e) => {
    if (mode !== 'playing') return;
    if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!paused); return; }
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); unlockAudio(); pressed = true; }
  });

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashN');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function call(text, cls = '') {
    const el = $('callN');
    el.textContent = text;
    el.className = 'call ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildChips() {
    const s = game.state;
    for (const side of ['L', 'R']) {
      $(`team${side}N`).replaceChildren(...s.teams[side].map((id) => {
        const d = document.createElement('div');
        d.className = 'chip' + (id === game.me ? ' me' : '') + (id < 0 ? ' helper' : '');
        d.style.setProperty('--c', css(id < 0 ? HELPER_COLOR : PLAYER_COLORS[id].hex));
        d.innerHTML = id < 0 ? `<b>${HELPER_NAMES[s.helpers[-1 - id].kind]}</b>` : `<i></i>`;
        return d;
      }));
    }
    const mySide = s.runners[game.me].side;
    $('hudN').dataset.side = mySide;
  }
  function renderHud() {
    const s = game.state;
    // つなの 目じるし(まん中が 0、はしが 勝ち)
    $('meterN').style.setProperty('--p', (s.p / RULES.win).toFixed(3));
    $('timeN').textContent = s.phase === 'play' ? String(Math.ceil(timeLeft(s))) : '';
    // 連打の メーター: いまの 1秒あたりの タップ(上限で いっぱい)
    const taps = game.myTaps;
    while (taps.length && taps[0] < s.t - 1) taps.shift();
    game.rate += (taps.length - game.rate) * 0.2;
    $('mashN').style.setProperty('--k', Math.min(1, game.rate / RULES.tapCap).toFixed(3));
    $('mashN').classList.toggle('max', game.rate > RULES.tapCap * 0.8);
    $('mashN').hidden = s.phase !== 'play';
    $('hudN').classList.toggle('seeno', s.phase === 'play' && seenoOn(s));
    for (const side of ['L', 'R']) $(`cheer${side}N`).classList.toggle('on', s.phase === 'play' && cheer(s, side) > 1.05);
  }
  const tmpV = new THREE.Vector3();
  function pop(text, x, y, z, cls = '', life = 800) {
    tmpV.set(x, y, z).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsN').append(el);
    setTimeout(() => el.remove(), life);
  }
  const unitOf = (who) => game.units.find((u) => u.id === who);

  // ── できごと ────────────────────────────────────────
    function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'start':
          splash('はじめ!');
          setTimeout(() => $('howtoN').classList.remove('show'), 6000);
          break;
        case 'seenoWarn':
          // 先生が 羽を あげて、すうっと 息を すう
          owl.play('chant', { fade: 0.1 });
          owl.setFace('glare');
          owlTalk = RULES.seenoWarn + 0.2;
          pop('せーの…', HOST.x, HOST.top + 2.9, HOST.z, 'owl', 700);
          sfx.hoot();
          break;
        case 'seeno':
          game.seenoPull = { L: 0, R: 0 };
          call('せーの!', 'seeno');
          sfx.drum();
          owl.play('flap', { fade: 0.05 });
          owl.setFace('normal');
          break;
        case 'seenoEnd': {
          // せーので よく引いた チームに「そろった!」
          const g = game.seenoPull;
          const side = g.L === g.R ? null : g.L > g.R ? 'L' : 'R';
          if (side && Math.max(g.L, g.R) > 6) {
            const team = game.units.filter((v) => v.side === side);
            for (const v of team) { v.yank = 1.5; puff(v.holder.position.x, 0.05, v.holder.position.z, 2); }
            tension = 1;
            const mid = team.reduce((a, v) => a + v.holder.position.x, 0) / team.length;
            const mine = side === s.runners[game.me].side;
            pop('そろった!', mid, 2.3, 0, mine ? 'sync' : 'sync them');
            if (mine) sfx.sync();
          }
          break;
        }
        case 'pull': {
          const u = unitOf(e.who);
          if (u) u.yank = Math.max(u.yank, e.seeno ? 1.2 : 0.7);
          tension = Math.min(1, tension + (e.seeno ? 0.12 : 0.05));
          if (e.seeno) game.seenoPull[e.side] += e.pull;
          if (e.who === game.me) {
            game.myTaps.push(s.t);
            sfx.tap(e.seeno);
            if (e.seeno && Math.random() < 0.5) pop('×2', u.holder.position.x + (Math.random() - 0.5) * 0.4, 1.9 * u.size, u.holder.position.z, 'gold');
          }
          if (e.seeno && u && Math.random() < 0.3) puff(u.holder.position.x, 0.05, u.holder.position.z, 1);
          break;
        }
        case 'slip': {
          const u = unitOf(e.who);
          if (u) u.slip = true;
          if (e.who === game.me) { splash('つるっ!\n連打で ふんばれ!', 'red small'); sfx.slip(); }
          if (u) mudAt(u.holder.position.x, u.holder.position.z);
          break;
        }
        case 'save': {
          const u = unitOf(e.who);
          if (u) u.slip = false;
          if (e.who === game.me) { pop('ふんばった!', u.holder.position.x, 2.0, u.holder.position.z, 'gold'); sfx.save(); }
          break;
        }
        case 'fall': {
          const u = unitOf(e.who);
          if (u) { u.slip = false; u.downT = RULES.slipDown; }
          if (e.who === game.me) { splash('すってんころりん…', 'red small'); sfx.fall(); }
          break;
        }
        case 'finished': {
          game.endTimer = 5.0;
          game.slow = 1.4; // 決着の しゅんかんは ゆっくり
          $('meterN').classList.remove('edge');
          const lose = e.winner === 'L' ? 'R' : 'L';
          for (const u of game.units) if (u.side === lose) u.fall = { t: 0, delay: u.k * 0.18 };
          const mine = s.runners[game.me].side === e.winner;
          splash(mine ? 'かった!' : 'まけた…', mine ? 'gold' : 'red');
          if (mine) sfx.fanfare();
          confetti(e.winner === 'L' ? -3 : 3, 0);
          for (const a of audience) { a.model.play(a.side === e.winner ? 'cheer' : 'wave'); a.model.setFace('happy'); }
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
    const mine = s.runners[game.me].side === s.winner;
    $('resultTitle').textContent = mine ? 'あなたの チームの勝ち!' : 'あいての チームの勝ち!';
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = game.players[slot];
      const r = s.runners[slot];
      const li = document.createElement('li');
      if (slot === game.me) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : slot === game.me ? 'あなた' : 'ともだち';
      const def = CHARACTERS.find((c) => c.key === p.character);
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}・${r.side === s.winner ? 'かち' : 'まけ'}</small></span><span class="dist">ちから ${Math.round(r.pull * 10)}<small>れんだ ${r.taps}</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateUnits(dt) {
    const s = game.state;
    for (const u of game.units) {
      const dir = u.side === 'L' ? -1 : 1;
      let x = dir * (FRONT + u.k * GAP) + s.p;
      let y = 0, z = 0;
      u.yank = Math.max(0, u.yank - dt * 6);
      u.downT = Math.max(0, (u.downT || 0) - dt);
      let clip = 'run', face = 'frustrated', timeScale = 0.4;
      let lean = 0.32 + Math.min(1.5, u.yank) * 0.28;
      if (s.phase === 'ready') { clip = 'idle'; face = 'normal'; lean = 0.1; }
      if (u.slip) { lean = -0.25 + Math.sin(time * 30) * 0.1; face = 'surprised'; clip = 'idle'; x -= dir * 0.12; }
      if (u.downT > 0) { lean = 0.9; clip = 'dizzy'; face = 'frustrated'; }
      if (s.phase === 'finished') {
        if (u.side === s.winner) {
          // 勝った チームは じゅんばんに とびはねる
          clip = 'cheer'; face = 'happy'; lean = 0;
          y = Math.abs(Math.sin(time * 7 + u.k * 1.1)) * 0.35 + 0.001;
        }
        else if (u.fall) {
          // 小川へ ずるずる → ざぶん
          // 前の子から じゅんに、ひっぱられて 岸を すべり、ぴょんと 小川へ
          const f = u.fall;
          f.t += dt;
          const k = Math.max(0, f.t - f.delay);
          const endX = dir * (0.1 + u.k * 0.22);
          const m = Math.min(1, k * 0.9);
          x = x + (endX - x) * m * m;
          z = (u.k - 1) * 0.55 * m;
          if (m > 0.55 && m < 1) y = Math.sin(((m - 0.55) / 0.45) * Math.PI) * 0.45 + 0.001;
          if (m >= 1) {
            y = WATER_Y - 0.38 + Math.sin(time * 3 + u.k) * 0.04;
            if (!f.splashed) {
              f.splashed = true;
              const big = u.k === 0;
              splashAt(x, z, big ? 1.8 : 0.9);
              ripple(x, z, big ? 1.6 : 1);
              if (big) { game.shake = 0.35; sfx.splash(); } else sfx.plop();
            }
          }
          clip = 'dizzy'; face = 'surprised'; lean = m >= 1 ? 0.1 : -0.4;
        }
      }
      u.holder.position.set(x, y || Math.max(WATER_Y - 0.2, groundY(x)), z);
      // 小川の ほう(まん中)を 向いて、うしろへ のけぞる
      u.holder.rotation.y = dir < 0 ? Math.PI / 2 : -Math.PI / 2;
      if (s.phase === 'finished' && u.side === s.winner) u.holder.rotation.y = 0;
      u.body.rotation.x = -lean;
      u.model.play(clip, { timeScale });
      u.model.setFace(face);
      u.model.update(dt);
      // 両手を 前へ(つなを にぎる)
      if (s.phase === 'play' && u.downT <= 0) {
        u.arms.forEach((a, n) => {
          if (!a) return;
          const side = n === 0 ? 1 : -1;
          if (u.slip) {
            // つるっ: 片手で つなに しがみついて、もう片手を ばたばた
            a.rotation.x = n === 0 ? -1.4 : -2.6 + Math.sin(time * 26) * 0.7;
            a.rotation.z = side * (n === 0 ? 0.15 : 0.6 + Math.sin(time * 19) * 0.3);
          } else {
            a.rotation.x = -1.4 - u.yank * 0.15;
            a.rotation.z = side * 0.15;
          }
        });
      }
      if (u.marker) u.marker.position.set(0, 2.1 * u.size + 0.08 * Math.sin(performance.now() / 180), 0);
    }
    // つなと 目じるし
    tension = Math.max(0, tension - dt * 1.8);
    shapeRope();
    rope.position.set(s.p, ROPE_Y, 0.12);
    ribbon.position.set(s.p, ROPE_Y - ropeSag - Math.sin(time * 6) * 0.02 * (1 - tension), 0.12);
    ribbon.rotation.z = Math.sin(time * 6) * 0.2;
    rope.visible = s.phase !== 'finished' || game.endTimer > 4.0;
  }

  let freeCamera = false;
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const s = game?.state;
    // つなの まん中を 追って、左右に 少し ずれる
    // 自分の チームの ほうへ 少し 寄せる
    const cx = s ? s.p * 0.85 + (s.runners[game.me].side === 'L' ? -0.3 : 0.3) * (portrait ? 1 : 0.5) : 0;
    const pos = portrait ? new THREE.Vector3(cx, 4.3, 13.0) : new THREE.Vector3(cx, 2.1, 6.4);
    const look = new THREE.Vector3(cx, portrait ? 0.9 : 1.15, -0.6);
    camera.fov = portrait ? 58 : 42;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(0, 14, -14);
      camera.position.lerpVectors(sky, pos, e);
      camera.userData.look = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 0, -6), look, Math.min(1, e * 1.1));
      camera.lookAt(camera.userData.look);
      return;
    }
    if (s?.phase === 'finished') {
      // 決着: はじめは 負けた チームが 落ちる 小川へ 寄り、そのあと 引いて 勝った チームの よろこびを 見せる
      const wd = s.winner === 'L' ? -1 : 1;
      if (game.endTimer > 3.3) {
        pos.set(-wd * 0.2, portrait ? 2.8 : 1.9, portrait ? 9.2 : 5.6);
        look.set(-wd * 0.2, 0.5, 0);
      } else {
        const wx = wd * (FRONT + GAP) + s.p;
        const lx = wx * (portrait ? 0.75 : 0.5);
        pos.set(lx, portrait ? 3.6 : 2.3, portrait ? 11 : 6.6);
        look.set(lx, 0.9, -0.4);
      }
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * (s?.phase === 'finished' ? 2.2 : 4));
    camera.position.lerp(pos, k);
    if (game?.shake > 0) {
      game.shake = Math.max(0, game.shake - dt);
      camera.position.x += (Math.random() - 0.5) * game.shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * game.shake * 0.5;
    }
    camera.userData.look = camera.userData.look ? camera.userData.look.lerp(look, k) : look.clone();
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
  let owlTalk = 0;
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
        const inputs = game.players.map((p, slot) => (p.cpu ? (game.net ? null : cpuInput(game.cpus[slot], s, slot)) : pressed));
        pressed = false;
        onEvents((game.net ? game.net.step : step)(s, inputs));
        game.acc -= STEP;
      }
      if (s.phase === 'play' && s.t > RULES.readyTime + 6) $('howtoN').classList.remove('show');
      // のこり 5秒の カウントダウン
      const sec = Math.ceil(timeLeft(s));
      if (s.phase === 'play' && sec <= 5 && sec >= 1 && game.count !== sec) { game.count = sec; splash(String(sec), 'count'); sfx.tick(sec); }
      // あと すこしで 決まりそう: 太鼓の 連打と メーターが ふるえる
      const edge = s.phase === 'play' ? Math.abs(s.p) / RULES.win : 0;
      $('meterN').classList.toggle('edge', edge > 0.72);
      if (edge > 0.72) {
        game.roll -= dt;
        if (game.roll <= 0) { sfx.roll(); game.roll = 0.09; }
        const near = s.p > 0 ? 'L' : 'R'; // 目じるしが 相手がわへ 行っている = 負けそうな チーム
        if (game.edgeSide !== near) {
          game.edgeSide = near;
          const mine = s.runners[game.me].side;
          splash(near === mine ? 'ふんばれ!' : 'あと すこし!', near === mine ? 'red small' : 'gold small');
        }
      } else if (edge < 0.5) game.edgeSide = null;
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
      // 決着の しゅんかんは スローモーション
      let vdt = dt;
      if (game.slow > 0) { game.slow -= dt; vdt = dt * (game.slow > 0.3 ? 0.3 : 0.65); }
      updateUnits(vdt);
      updateFx(vdt);
    }
    if (!paused) {
      audience.forEach((a, n) => {
        // 負けている チームの がわの 観客は 切り株の上で とびはねて 応援
        const on = game && game.state.phase === 'play' && cheer(game.state, a.side) > 1.05;
        if (game?.state.phase !== 'finished') { a.model.play(on ? 'cheer' : 'idle'); a.model.setFace(on ? 'happy' : 'normal'); }
        a.hop = on ? 1 : Math.max(0, (a.hop || 0) - dt * 3);
        a.model.root.position.y = STUMP_TOP + Math.abs(Math.sin(time * 7 + n * 1.3)) * 0.24 * a.hop;
        if (on && Math.random() < dt * 0.5) pop(['がんばれー!', 'まけるなー!', 'ひけー!'][Math.floor(Math.random() * 3)], a.seat.x, 1.5, a.seat.z, 'fan ' + a.side);
        a.model.update(dt);
      });
      owl.update(dt);
      owlTalk = Math.max(0, owlTalk - dt);
      if (owl.current === 'flap' && owl.actions.flap.time > 0.5) owl.play('idle');
      if (owl.current === 'chant' && owlTalk <= 0) { owl.play('idle'); owl.setFace('normal'); }
      stage.water.material.map.offset.y -= dt * 0.25;
      stage.sparkle.material.map.offset.y -= dt * 0.42;
      stage.sparkle.material.opacity = 0.5 + Math.sin(time * 2.3) * 0.2;
    }
    atmosphere.update(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  // E2E 用の口
  window.dtsuna = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    tap: () => { pressed = true; },
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
      pressed = false;
    },
    get intro() { return intro; },
  };
}
