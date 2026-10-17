// おぼえて かくれんぼ の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
// かごの動き(いれかわりの弧)は state の swaps と時間から決める(ルールと ずれない)。
//
// 動かし方: 「リスは どこ?」のあいだに、かごを タップ。パソコンは 数字キー(1〜)。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonMaterial } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { ROUNDS, RULES, STEP, createGame, ranking, roundInfo, step } from './rules.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { HOST, LANTERN_OFF, LANTERN_ON, LINE_Z, buildStage, slotX } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const MAX_N = 5;
const params = new URLSearchParams(location.search);
const REVEAL_AT = 1.05; // こたえあわせで リスの かごが あがる時刻(ほかの かごは 先に)
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

export async function createKakure({ renderer, settings, getAudio, onExit }) {
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
    swish() { noise({ len: 0.18, gain: 0.07, freq: [900, 2400], q: 1.2 }); },
    pyoko() { voice({ pts: [[0, 600], [0.08, 1100]], len: 0.12, gain: 0.08 }); },
    jan() { [523, 659, 784].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.35, gain: 0.07, at: i * 0.02 })); },
    tap() { voice({ pts: [[0, 880], [0.05, 660]], len: 0.08, gain: 0.08 }); },
    drum() { for (let i = 0; i < 16; i++) voice({ type: 'triangle', pts: [[0, 120], [0.06, 80]], len: 0.08, gain: 0.04 + i * 0.006, at: i * 0.06 }); },
    hit() { [784, 988, 1175, 1568].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.25, gain: 0.08, at: 1.08 + i * 0.07 })); },
    miss() { voice({ type: 'square', pts: [[0, 220], [0.3, 180]], len: 0.35, gain: 0.05, at: 1.08 }); },
    kon() { [0, 0.18].forEach((at) => voice({ type: 'sawtooth', pts: [[0, 900], [0.08, 650]], len: 0.1, gain: 0.05, at: 1.08 + at })); },
    off() { noise({ len: 0.3, gain: 0.08, freq: [1200, 300], type: 'lowpass' }); },
    on() { voice({ pts: [[0, 300], [0.1, 500]], len: 0.15, gain: 0.05 }); },
  };

  // ── 先生・リス・キツネ ─────────────────────────────
  await preload([...CHARACTERS.map((c) => c.key), 'hoho', 'risu']);
  const owl = await createModel('hoho');
  owl.root.position.set(HOST.x, HOST.top, HOST.z);
  owl.play('idle');
  owl.setFace('normal');
  scene.add(owl.root);
  atmosphere.attachOwlEyes(owl.node('head'));
  const risu = await createModel('risu');
  risu.root.scale.setScalar(0.85);
  risu.root.visible = false;
  risu.play('idle');
  risu.setFace('happy');
  scene.add(risu.root);
  // いたずらキツネ(小さな だいだいの きつね。しっぽの先は白)
  const fox = (() => {
    const g = new THREE.Group();
    const or = toonMaterial(0xf0883a), wh = toonMaterial(0xfff4e8), bk = new THREE.MeshBasicMaterial({ color: 0x1b1b1b });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), or);
    body.scale.set(1, 1.05, 0.9);
    body.position.y = 0.24;
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), wh);
    belly.position.set(0, 0.22, 0.1);
    belly.scale.set(1, 1.1, 0.6);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), or);
    head.position.y = 0.58;
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 10), wh);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.54, 0.22);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), bk);
    nose.position.set(0, 0.55, 0.32);
    g.add(body, belly, head, snout, nose);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.17, 8), or);
      ear.position.set(s * 0.11, 0.78, -0.02);
      ear.rotation.z = -s * 0.25;
      // いたずらっぽい 目(にやり)
      const eye = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 4, 8, Math.PI), bk);
      eye.position.set(s * 0.08, 0.63, 0.17);
      g.add(ear, eye);
    }
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), or);
    tail.scale.set(0.8, 0.8, 1.8);
    tail.position.set(0.16, 0.25, -0.24);
    tail.rotation.y = 0.6;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), wh);
    tip.position.set(0.26, 0.3, -0.48);
    g.add(tail, tip);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.visible = false;
    scene.add(g);
    return g;
  })();
  atmosphere.setupShadows([stage.group, owl.root, risu.root], [stage.group]);

  // ── かご ───────────────────────────────────────────
  const weave = (() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#c8955a';
    g.fillRect(0, 0, 128, 64);
    for (let y = 0; y < 64; y += 8) {
      for (let x = 0; x < 128; x += 16) {
        g.fillStyle = ((x + y) / 8) % 2 ? '#b07a42' : '#dcae6e';
        g.fillRect(x + ((y / 8) % 2) * 8, y, 12, 6);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 2);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const basketMat = new THREE.MeshToonMaterial({ map: weave, side: THREE.DoubleSide });
  const rimMat = toonMaterial(0x8a5a2e);
  const baskets = Array.from({ length: MAX_N }, () => {
    const g = new THREE.Group();
    // ふせた かご: 下が広く、上は とじている
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.8, 22, 1, true), basketMat);
    body.position.y = 0.4;
    const top = new THREE.Mesh(new THREE.CircleGeometry(0.42, 22).rotateX(-Math.PI / 2), basketMat);
    top.position.y = 0.8;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 6, 26).rotateX(Math.PI / 2), rimMat);
    rim.position.y = 0.03;
    const knob = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 6, 14), rimMat);
    knob.position.y = 0.9;
    g.add(body, top, rim, knob);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    // えらんだ子の しるし(かごの上に ならぶ 色の玉)
    const pins = new THREE.Group();
    pins.position.y = 1.1;
    g.add(pins);
    // 自分が えらんだ かごの 足もとの輪
    const mine = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.74, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex, transparent: true, opacity: 0.9, depthWrite: false }));
    mine.position.y = 0.02;
    mine.visible = false;
    g.add(mine);
    g.scale.setScalar(0.85);
    scene.add(g);
    return { g, pins, mine, lift: 0, liftV: 0 };
  });
  atmosphere.setupShadows(baskets.map((b) => b.g), []);
  const pinGeo = new THREE.SphereGeometry(0.09, 10, 8);

  // ── きらきら・紙ふぶき ───────────────────────────────
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
      fx.push({ obj: sp, t: 0, life: 0.6, vel: new THREE.Vector3(Math.cos(a) * 1.6, 1.4 + Math.random(), Math.sin(a) * 1.6), size, kind: 'sparkle' });
    }
  }
  const puffGeo = new THREE.IcosahedronGeometry(0.12, 1);
  function puffAt(x, z) {
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xc8a882, transparent: true, opacity: 0.7 }));
      m.position.set(x + (Math.random() - 0.5) * 0.6, 0.08, z + (Math.random() - 0.5) * 0.4);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 0.5, vel: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.3, (Math.random() - 0.5) * 0.5), kind: 'puff' });
    }
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
      const k = f.t / f.life;
      if (f.kind === 'sparkle') {
        f.vel.y -= dt * 4;
        f.obj.position.addScaledVector(f.vel, dt);
        f.obj.material.opacity = 1 - k;
        f.obj.scale.setScalar(f.size * (1 - k * 0.6));
      } else if (f.kind === 'puff') {
        f.obj.position.addScaledVector(f.vel, dt);
        f.obj.scale.setScalar(1 + k * 1.6);
        f.obj.material.opacity = 0.7 * (1 - k);
      } else if (f.kind === 'confetti') {
        f.obj.position.addScaledVector(f.vel, dt);
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
  }

  // ── ゲームの進行 ────────────────────────────────────
  let mode = 'idle';
  let picked = CHARACTERS[0].key;
  let tour = null;
  let game = null;
  let intro = 1;
  const INTRO_TIME = 2.4;
  let myPick = null;

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS });
    if (game) for (const r of game.runners) scene.remove(r.holder);
    for (const f of fx.splice(0)) scene.remove(f.obj);
    const state = createGame(players, seed);
    const n = players.length;
    const runners = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const holder = new THREE.Group();
      holder.add(model.root);
      holder.position.set((slot - (n - 1) / 2) * 1.3, 0, LINE_Z);
      holder.rotation.y = Math.PI; // かごのほうを向く
      scene.add(holder);
      const def = CHARACTERS.find((c) => c.key === p.character);
      return { model, holder, size: def.size || 1, react: null, reactT: 0 };
    }));
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    runners[0].holder.add(marker);
    runners[0].marker = marker;
    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), runners, acc: 0, endTimer: null, darkK: 0, lastSec: null, leader: null, swapSeen: -1 };
    atmosphere.apply(params.get('time') || 'night');
    atmosphere.setupShadows(runners.map((r) => r.holder), []);
    myPick = null;
    for (const b of baskets) { b.g.visible = false; b.pins.clear(); b.mine.visible = false; b.lift = 0; }
    risu.root.visible = fox.visible = false;
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    ask('');
    $('howtoZ').classList.add('show');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudZ').hidden = m !== 'playing';
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
  $('pauseBtnZ').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: かごを タップ / 数字キー ─────────────────────
  const tmpV = new THREE.Vector3();
  function basketScreen(i) {
    tmpV.copy(baskets[i].g.position).setY(0.45).project(camera);
    return { x: ((tmpV.x + 1) / 2) * innerWidth, y: ((1 - tmpV.y) / 2) * innerHeight };
  }
  function choose(slot) {
    const s = game.state;
    if (s.phase !== 'ask' || s.answers[0] || myPick !== null) return;
    myPick = slot;
    sfx.tap();
  }
  window.addEventListener('pointerdown', (e) => {
    if (mode !== 'playing' || paused || e.target.closest('button, a') || !game) return;
    unlockAudio();
    $('howtoZ').classList.remove('show');
    const s = game.state;
    if (s.phase !== 'ask') return;
    // いちばん近い かご(指から 90px 以内)
    let best = -1, bd = 90;
    for (let i = 0; i < roundInfo(s).n; i++) {
      const p = basketScreen(i);
      const d = Math.hypot(p.x - e.clientX, p.y - e.clientY);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) choose(s.baskets[best].slot);
  });
  window.addEventListener('keydown', (e) => {
    if (mode !== 'playing') return;
    if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!paused); return; }
    const m = /^Digit([1-9])$/.exec(e.code);
    if (m && game) { unlockAudio(); choose(Number(m[1]) - 1); }
  });

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashZ');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function ask(text) {
    const el = $('askZ');
    el.firstChild.nodeValue = text;
    el.classList.toggle('show', !!text);
  }
  function notice(text, slot) {
    const el = $('noticeZ');
    el.innerHTML = `<i style="background:${css(PLAYER_COLORS[slot].hex)}"></i>${text}`;
    el.className = 'notice ' + (slot === 0 ? 'up' : '');
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildChips() {
    $('chipsZ').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'chip' + (slot === 0 ? ' me' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      d.innerHTML = `<i></i><b>0</b>`;
      d.title = p.name;
      return d;
    }));
  }
  function renderHud() {
    const s = game.state;
    const order = ranking(s);
    const chips = [...$('chipsZ').children];
    order.forEach((slot, rank) => {
      const c = chips[slot];
      c.style.order = rank;
      const b = c.lastChild;
      const v = String(s.runners[slot].score);
      if (b.textContent !== v) {
        b.textContent = v;
        c.classList.remove('up');
        void c.offsetWidth;
        c.classList.add('up');
      }
      c.classList.toggle('done', s.phase === 'ask' && !!s.answers[slot]);
    });
    // こたえる のこり時間
    $('askZ').style.setProperty('--k', s.phase === 'ask' ? Math.max(0, 1 - s.phaseT / RULES.askTime).toFixed(3) : '0');
    $('roundZ').textContent = s.round >= 0 ? `${s.round + 1} / ${ROUNDS.length}` : '';
  }
  function pop(text, x, y, z, cls = '') {
    tmpV.set(x, y, z).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsZ').append(el);
    setTimeout(() => el.remove(), 1400);
  }

  // ── できごと ────────────────────────────────────────
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'show': {
          myPick = null;
          for (const b of baskets) { b.pins.clear(); b.mine.visible = false; }
          const R = ROUNDS[e.round];
          splash(`${e.round + 1}かいめ`);
          ask(R.fox ? 'リスと キツネが かくれるよ' : 'リスが かくれるよ');
          if (R.fox && !ROUNDS[e.round - 1]?.fox) setTimeout(() => splash('キツネも まぎれた!', 'red'), 900);
          if (R.dark && !ROUNDS[e.round - 1]?.dark) setTimeout(() => splash('まっくらに なるかも!', 'red'), 900);
          if (e.round === ROUNDS.length - 1) setTimeout(() => splash('さいごは いちばん はやいよ!', 'red'), 900);
          // キツネは かくれる前に にやっと
          if (R.fox) setTimeout(() => { if (fox.visible) pop('コンコン♪', fox.position.x, 1.2, fox.position.z, 'red'); }, 700);
          setTimeout(() => sfx.pyoko(), 300);
          break;
        }
        case 'shuffle':
          ask('よーく見て!');
          break;
        case 'swapped':
          break;
        case 'dark':
          sfx.off();
          break;
        case 'light':
          sfx.on();
          break;
        case 'ask':
          ask('リスは どこ?');
          $('howtoZ').classList.remove('show');
          sfx.jan();
          owl.play('flap', { fade: 0.1 });
          break;
        case 'pick': {
          // その かごの上に 色の玉。自分なら 足もとの輪も
          const b = baskets[s.baskets.find((x) => x.slot === e.at).id];
          const m = new THREE.Mesh(pinGeo, new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[e.slot].hex }));
          const k = b.pins.children.length;
          m.position.set((k % 3 - 1) * 0.2, Math.floor(k / 3) * 0.2, 0);
          b.pins.add(m);
          if (e.slot === 0) b.mine.visible = true;
          break;
        }
        case 'reveal': {
          ask('');
          sfx.drum();
          const me = e.answers[0];
          if (me?.result === 'hit') sfx.hit(); else if (me?.result === 'fox') sfx.kon(); else sfx.miss();
          setTimeout(() => {
            if (!game || game.state !== s) return;
            e.answers.forEach((a, i) => {
              const v = game.runners[i];
              const p = v.holder.position;
              if (!a) { pop('…', p.x, 2.1, p.z, 'out'); v.react = 'miss'; }
              else if (a.result === 'hit') { pop(`+${a.gain}`, p.x, 2.1, p.z, a.gain > RULES.hit ? 'gold' : ''); v.react = 'hit'; }
              else if (a.result === 'fox') { pop(`${a.gain}`, p.x, 2.1, p.z, 'red'); v.react = 'fox'; }
              else { pop('×', p.x, 2.1, p.z, 'out'); v.react = 'miss'; }
              v.reactT = 1.8;
            });
            const hb = baskets[s.hider];
            sparkle(hb.g.position.clone().setY(0.8), 0xffe27a, 14, 0.45);
            if (me?.result === 'fox') splash('キツネだった!', 'red');
            else if (me?.result === 'hit') splash(me.gain > RULES.hit + 1 ? 'いちばん!' : 'あたり!', 'gold');
            // トップが 入れかわったら「ぎゃくてん!」
            const lead = ranking(game.state)[0];
            if (game.leader !== null && lead !== game.leader && game.state.runners[lead].score > game.state.runners[game.leader].score) {
              setTimeout(() => notice(lead === 0 ? 'ぎゃくてん! トップ!' : `${game.players[lead].name}が ぎゃくてん!`, lead), 600);
            }
            game.leader = lead;
          }, 1050);
          break;
        }
        case 'finished': {
          game.endTimer = 3.4;
          const w = game.runners[e.winner].holder.position;
          confetti(w.x, w.z);
          splash(e.winner === 0 ? 'あなたの勝ち!' : `${game.players[e.winner].name}の勝ち!`, 'gold');
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
        `<span>${def.name}<small>${who}</small></span><span class="dist">${r.score}点<small>あたり ${r.hits}/${ROUNDS.length}${r.firsts ? `・いちばん ${r.firsts}` : ''}</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  // かごの位置: 置き場所から。いれかわり中の2つは、手前と奥に 弧をえがいて すれちがう
  function basketPos(s, b, out) {
    const n = roundInfo(s).n;
    let x = slotX(b.slot, n), z = 0, y = 0;
    if (s.phase === 'shuffle' && s.nextSwap < s.swaps.length) {
      const w = s.swaps[s.nextSwap];
      if (s.phaseT >= w.t0 && (b.slot === w.a || b.slot === w.b)) {
        const k = ease(Math.min(1, (s.phaseT - w.t0) / w.dur));
        const xa = slotX(w.a, n), xb = slotX(w.b, n);
        const from = b.slot === w.a ? xa : xb, to = b.slot === w.a ? xb : xa;
        const r = Math.min(1.1, Math.abs(xa - xb) * 0.35 + 0.25);
        x = from + (to - from) * k;
        z = (b.slot === w.a ? 1 : -1) * Math.sin(k * Math.PI) * r;
        y = Math.sin(k * Math.PI) * 0.12;
      }
    }
    return out.set(x, y, z);
  }
  const posV = new THREE.Vector3();
  // いれかわりの はじまりに シュッ、おわりに 土ぼこり
  function swapFx(s) {
    if (s.phase !== 'shuffle' || s.nextSwap >= s.swaps.length) return;
    const w = s.swaps[s.nextSwap];
    if (s.phaseT < w.t0 || game.swapSeen === s.nextSwap + s.round * 100) return;
    game.swapSeen = s.nextSwap + s.round * 100;
    if (!(s.dark?.on && !s.dark.off)) sfx.swish();
    const n = roundInfo(s).n;
    for (const slot of [w.a, w.b]) puffAt(slotX(slot, n), 0);
  }
  function updateBaskets(dt) {
    const s = game.state;
    swapFx(s);
    const n = s.round >= 0 ? roundInfo(s).n : 0;
    baskets.forEach((b, i) => {
      b.g.visible = i < n && s.round >= 0;
      if (!b.g.visible) return;
      const st = s.baskets[i];
      basketPos(s, st, posV);
      // もちあげる: show(かくれるところ)/ reveal(ぜんぶ)
      let want = 0;
      if (s.phase === 'show') {
        const t = s.phaseT;
        const up = (i === s.hider || i === s.fox) && t > 0.25 && t < RULES.showTime - 0.15;
        want = up ? 1 : 0;
      } else if (s.phase === 'reveal') want = s.phaseT > (i === s.hider ? REVEAL_AT : 0.45) ? 1 : 0;
      else if (s.phase === 'finished') want = 1;
      // ばねで ぴょこっと
      b.liftV = (b.liftV + (want - b.lift) * 220 * dt) * Math.exp(-dt * 13);
      b.lift += b.liftV * dt;
      b.g.position.set(posV.x, posV.y + Math.max(0, b.lift) * 1.15, posV.z);
      b.g.rotation.z = Math.max(0, b.lift) * 0.25 * (i % 2 ? 1 : -1);
      // ためらうように かごが ゆれる(こたえるあいだ)
      if (s.phase === 'ask') b.g.rotation.z = Math.sin(time * 3 + i) * 0.03;
      // こたえあわせ: リスの かごは あがる前に ぶるぶる
      if (s.phase === 'reveal' && i === s.hider && s.phaseT > 0.45 && s.phaseT < REVEAL_AT) {
        const k = (s.phaseT - 0.45) / (REVEAL_AT - 0.45);
        b.g.rotation.z = Math.sin(time * 60) * 0.06 * k;
        b.g.position.y += Math.abs(Math.sin(time * 30)) * 0.05 * k;
      }
    });
    // リス・キツネは かくれた かごの下に
    const vis = s.round >= 0 && (s.phase === 'show' || s.phase === 'reveal' || s.phase === 'finished');
    const hb = baskets[s.hider];
    risu.root.visible = vis && hb.lift > 0.15;
    risu.root.position.set(hb.g.position.x, 0, hb.g.position.z);
    risu.root.rotation.y = Math.atan2(-hb.g.position.x * 0.3, LINE_Z - hb.g.position.z);
    if (s.fox !== null) {
      const fb = baskets[s.fox];
      fox.visible = vis && fb.lift > 0.15;
      const jump = s.phase === 'reveal' && s.phaseT > 0.5 && s.phaseT < 1.6 ? Math.abs(Math.sin((s.phaseT - 0.5) * 9)) * 0.45 : 0;
      fox.position.set(fb.g.position.x, Math.abs(Math.sin(time * 8)) * 0.08 + jump, fb.g.position.z);
      fox.rotation.y = Math.sin(time * 4) * 0.4;
      fox.rotation.z = jump ? Math.sin(time * 20) * 0.2 : 0;
    } else fox.visible = false;
  }
  function updateRunners(dt) {
    const s = game.state;
    s.runners.forEach((r, i) => {
      const v = game.runners[i];
      v.reactT = Math.max(0, v.reactT - dt);
      let clip = 'idle', face = 'normal';
      if (s.phase === 'finished') {
        if (s.winner === i) { clip = 'cheer'; face = 'happy'; } else { clip = 'wave'; face = 'happy'; }
      } else if (v.reactT > 0) {
        if (v.react === 'hit') { clip = 'cheer'; face = 'happy'; }
        else if (v.react === 'fox') { clip = 'dizzy'; face = 'surprised'; }
        else { face = 'frustrated'; }
      } else if (s.phase === 'shuffle') face = 'surprised';
      else if (s.phase === 'ask' && s.answers[i]) face = 'happy';
      v.model.play(clip);
      v.model.setFace(face);
      v.model.update(dt);
      // かごを 目で追う(頭ごと 少し向ける)
      if (s.phase === 'shuffle' && s.nextSwap < s.swaps.length) {
        const w = s.swaps[s.nextSwap];
        const tx = (slotX(w.a, roundInfo(s).n) + slotX(w.b, roundInfo(s).n)) / 2;
        const want = Math.PI + Math.atan2(tx - v.holder.position.x, LINE_Z) * 0.6;
        v.holder.rotation.y += (want - v.holder.rotation.y) * (1 - Math.exp(-dt * 10));
      } else if (s.phase !== 'finished' || s.winner !== i) v.holder.rotation.y += (Math.PI - v.holder.rotation.y) * (1 - Math.exp(-dt * 6));
      else v.holder.rotation.y += (0 - v.holder.rotation.y) * (1 - Math.exp(-dt * 4)); // 勝った子は こちらを向く
      if (v.marker) v.marker.position.set(0, 2.0 * v.size + 0.08 * Math.sin(performance.now() / 180), 0);
    });
    risu.update(dt);
    if (risu.root.visible) risu.play(s.phase === 'show' ? 'wave' : 'cheer');
  }
  // まっくら: ちょうちんが消えて、画面も暗く
  function updateDark(dt) {
    const s = game.state;
    const dark = s.phase === 'shuffle' && s.dark && s.dark.on && !s.dark.off;
    game.darkK += ((dark ? 1 : 0) - game.darkK) * (1 - Math.exp(-dt * (dark ? 30 : 8)));
    $('darkZ').style.opacity = (game.darkK * 0.9).toFixed(3);
    stage.lanternMat.color.setHex(game.darkK > 0.5 ? LANTERN_OFF : LANTERN_ON);
    for (const L of stage.lights) L.intensity = 9 * (1 - game.darkK) * (0.92 + Math.sin(time * 7 + L.position.x) * 0.08);
    for (const g of stage.glows) g.visible = game.darkK < 0.5;
    for (const [k, l] of stage.string.entries()) l.rotation.z = Math.sin(time * 1.5 + k) * 0.1;
    // 森の 光る目: ときどき まばたき。まっくらのときは よく光る
    for (const e of stage.eyes) {
      const u = e.userData;
      const blink = ((time + u.ph) % u.every) < 0.15;
      e.scale.y = blink ? 0.1 : 1;
      e.visible = Math.sin(time * 0.3 + u.ph) > -0.3 || game.darkK > 0.3;
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
      // 勝った子は こちらを向いて よろこぶ。うしろから 寄る
      const w = game.runners[s.winner].holder.position;
      pos = new THREE.Vector3(w.x * 0.6, 2.6, w.z + (portrait ? 5.2 : 4.2));
      look = new THREE.Vector3(w.x, 1.0, w.z);
    } else {
      const close = s && (s.phase === 'shuffle' || s.phase === 'ask') ? 1 : 0;
      pos = portrait ? new THREE.Vector3(0, 8.6 - close * 0.5, 11.6 - close * 0.7) : new THREE.Vector3(0, 5.2 - close * 0.4, 8.8 - close * 0.6);
      look = new THREE.Vector3(0, 0.2, -0.5);
    }
    camera.fov = portrait ? 58 : 46;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(10, 16, -14);
      camera.position.lerpVectors(sky, pos, e);
      camera.userData.look = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 0, -2), look, Math.min(1, e * 1.1));
      camera.lookAt(camera.userData.look);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 3);
    camera.position.lerp(pos, k);
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
  function frame(rawDt) {
    const dt = Math.min(rawDt, 0.1);
    time += dt;
    if (mode === 'playing' && intro >= 1) watchQuality(rawDt);
    if (intro < 1 && !paused) intro = Math.min(1, intro + dt / INTRO_TIME);
    if (game && mode === 'playing' && !paused && intro >= 1) {
      const s = game.state;
      game.acc += dt;
      while (game.acc >= STEP && s.phase !== 'finished') {
        const inputs = game.players.map((p, slot) => (p.cpu ? cpuInput(game.cpus[slot], s, slot) : myPick));
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
      updateBaskets(dt);
      updateRunners(dt);
      updateDark(dt);
      updateFx(dt);
    }
    if (!paused) {
      owl.update(dt);
      if (owl.current === 'flap' && owl.actions.flap.time > 1.0) owl.play('idle');
    }
    atmosphere.update(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  // E2E 用の口
  window.dkakure = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    choose: (slot) => choose(slot),
    // 描かずに すすめる(自分は えらばない)
    advance: (sec) => {
      for (let i = 0; i < sec / STEP && game.state.phase !== 'finished'; i++) {
        onEvents(step(game.state, game.players.map((p, slot) => (p.cpu ? cpuInput(game.cpus[slot], game.state, slot) : null))));
      }
    },
    until: (phase) => {
      for (let i = 0; i < 60 / STEP && game.state.phase !== phase && game.state.phase !== 'finished'; i++) {
        onEvents(step(game.state, game.players.map((p, slot) => (p.cpu ? cpuInput(game.cpus[slot], game.state, slot) : null))));
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
      myPick = null;
    },
    get intro() { return intro; },
  };
}
