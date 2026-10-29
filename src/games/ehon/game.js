// 森の図書館の ぱらぱらブック の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
//
// 動かし方: 画面の どこでも 指を おいて ずらすと 走る(どこでもスティック)。パソコンは 矢印 / WASD。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonGradient } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { RULES, STEP, createGame, flipTime, ranking, showTime, step } from './rules.js';
import { createNetDriver, replaceState } from '../../net/drive.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { buildStage, pageTexture, shadowTexture } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);
const W = RULES.W, D = RULES.D;

export async function createEhon({ renderer, settings, getAudio, onExit }) {
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
  const sfx = {
    // ぺらっ: ページが 立つ
    page() { noise({ len: 0.25, gain: 0.07, freq: [3000, 1200], q: 0.7 }); },
    // ひゅっ: たおれてくる
    whoosh(len) { noise({ len, gain: 0.08, freq: [500, 2200], q: 0.8, attack: len * 0.7 }); },
    // ばたん: ページが 床に
    slam() { noise({ len: 0.35, gain: 0.25, freq: [900, 120], type: 'lowpass', attack: 0.003 }); voice({ type: 'triangle', pts: [[0, 140], [0.15, 60]], len: 0.18, gain: 0.08 }); },
    // ぺしゃっ: つぶれる
    squash() { voice({ type: 'square', pts: [[0, 420], [0.25, 90]], len: 0.3, gain: 0.05 }); },
    // セーフ!
    tick() { voice({ type: 'square', pts: [[0, 1600]], len: 0.03, gain: 0.03 }); },
    safe() { [784, 1047].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.12, gain: 0.04, at: i * 0.07 })); },
    hurry() { [523, 659, 784, 1047, 1319].forEach((f, i) => voice({ type: 'square', pts: [[0, f]], len: 0.09, gain: 0.04, at: i * 0.06 })); },
    beep(last) { voice({ type: 'square', pts: [[0, last ? 1320 : 660]], len: last ? 0.5 : 0.16, gain: 0.05 }); },
    drum() { for (let i = 0; i < 18; i++) noise({ len: 0.06, gain: 0.05 + i * 0.004, freq: [220, 120], type: 'lowpass', at: i * 0.07 }); },
    fanfare() {
      [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1047]].forEach(([at, f]) => voice({ type: 'square', pts: [[0, f]], len: 0.12, gain: 0.05, at }));
      voice({ type: 'square', pts: [[0, 1047]], len: 0.6, gain: 0.05, at: 0.5 });
    },
  };

  // ── ページ ────────────────────────────────────────
  // 立っている ページ(とじめで まわる)と、床に うつる 影
  const pageGeo = new THREE.PlaneGeometry(W, D).translate(0, D / 2, 0);
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.02, 0);
  scene.add(pivot);
  let pageMesh = null;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  shadow.position.set(0, 0.012, D / 2);
  scene.add(shadow);
  let fallen = null; // たおれた ページ(少しのあいだ 床に のこる)
  function newPage(holes, page) {
    if (pageMesh) {
      dropFallen();
      scene.attach(pageMesh); // 床に たおれた まま のこす(とじめの 回転から はずす)
      fallen = { mesh: pageMesh, t: 0 };
    }
    const tex = pageTexture(holes, page);
    pageMesh = new THREE.Mesh(pageGeo, new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient, side: THREE.DoubleSide, alphaTest: 0.5, transparent: false }));
    pageMesh.castShadow = true;
    pivot.add(pageMesh);
    pivot.rotation.x = -0.35; // うしろから ぱっと 立ちあがる
    pivot.userData.rise = 0;
    if (shadow.material.map) shadow.material.map.dispose();
    shadow.material.map = shadowTexture(holes);
    shadow.material.needsUpdate = true;
  }
  function dropFallen() {
    if (!fallen) return;
    fallen.mesh.removeFromParent();
    fallen.mesh.material.map.dispose();
    fallen.mesh.material.dispose();
    fallen = null;
  }

  // ── けむり・紙きれ・紙ふぶき ─────────────────────────
  const fx = [];
  const puffGeo = new THREE.SphereGeometry(0.2, 6, 4);
  function puff(x, y, z, n = 4, color = 0xf3e7cc, size = 1) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
      m.position.set(x + (Math.random() - 0.5) * 0.4, y + Math.random() * 0.2, z + (Math.random() - 0.5) * 0.4);
      m.scale.setScalar(size);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 0.6 + Math.random() * 0.3, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 0.6 + Math.random(), (Math.random() - 0.5) * 2), kind: 'puff', size });
    }
  }
  const confettiGeo = new THREE.PlaneGeometry(0.12, 0.07);
  function confetti(x, z) {
    const colors = [...PLAYER_COLORS.map((c) => c.hex), 0xffd24a, 0xffffff];
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true }));
      m.position.set(x + (Math.random() - 0.5) * 4, 4 + Math.random() * 2.5, z + (Math.random() - 0.5) * 3);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 3 + Math.random() * 1.5, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, -(0.7 + Math.random() * 0.6), (Math.random() - 0.5) * 0.6), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), kind: 'confetti' });
    }
  }
  // 風の すじ(ページが たおれてくる とき、床を 手前へ ふきぬける)
  const windGeo = new THREE.PlaneGeometry(0.05, 1.4).rotateX(-Math.PI / 2);
  function wind() {
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(windGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
      m.position.set(-W / 2 + Math.random() * W, 0.15 + Math.random() * 0.6, Math.random() * 2);
      scene.add(m);
      fx.push({ obj: m, t: -Math.random() * 0.2, life: 0.45, vel: new THREE.Vector3(0, 0, 9 + Math.random() * 4), kind: 'fade' });
    }
  }
  // 星(ぺちゃんこの とき)
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
  // 紙の 切れはし(ページが 立つ とき・ぱたんの とき)
  const scrapGeo = new THREE.PlaneGeometry(0.22, 0.15);
  function scraps(x, y, z, n = 6) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(scrapGeo, new THREE.MeshToonMaterial({ color: 0xf3e7cc, side: THREE.DoubleSide, transparent: true }));
      m.position.set(x + (Math.random() - 0.5) * 2, y, z + (Math.random() - 0.5) * 0.5);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 1.4, vel: new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.2) * 2), spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, 0), kind: 'scrap' });
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
      } else if (f.kind === 'fade') {
        if (f.t < 0) { f.obj.visible = false; f.obj.position.addScaledVector(f.vel, -dt); continue; }
        f.obj.visible = true;
        f.obj.material.opacity = 0.7 * (1 - k);
      } else if (f.kind === 'spark') {
        f.vel.y -= 10 * dt;
        f.obj.lookAt(camera.position);
        f.obj.material.opacity = 1 - k;
      } else if (f.kind === 'scrap') {
        f.vel.multiplyScalar(Math.exp(-dt * 1.5));
        f.vel.y -= 2.5 * dt;
        f.obj.rotation.x += f.spin.x * dt;
        f.obj.rotation.y += f.spin.y * dt;
        f.obj.material.opacity = Math.min(1, (1 - k) * 3);
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
  const input = { touch: null, stick: null, keys: new Set(), target: null };
  await preload([...CHARACTERS.map((c) => c.key), 'hoho']);
  // ホーホー先生: 本の 手前の 机で 見まもる(ページが たおれると ばさっ)
  const owl = await createModel('hoho');
  owl.play('idle');
  owl.root.position.set(W / 2 - 1.7, -0.35, D + 1.0); // 本の 手前の 机に ちょこんと(こちらを 向いて 見まもる)
  owl.root.rotation.y = -0.45;
  owl.root.scale.setScalar(0.75);
  scene.add(owl.root);

  async function startGame({ fromSky = false } = {}) {
    const net = tour?.net ?? null; // オンライン: { client, start }。席・種・顔ぶれは サーバーが きめる
    const me = net ? net.start.seat : 0;
    const seed = net ? net.start.seed : params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS, me });
    if (game) for (const r of game.runners) scene.remove(r.holder);
    for (const f of fx.splice(0)) scene.remove(f.obj);
    dropFallen();
    const state = createGame(players, seed);
    if (net) replaceState(state, net.start.s);
    const runners = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const holder = new THREE.Group();
      holder.add(model.root);
      scene.add(holder);
      const def = CHARACTERS.find((c) => c.key === p.character);
      return { model, holder, size: def.size || 1, out: null, safeT: 0 };
    }));
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[me].hex }));
    marker.rotation.x = Math.PI;
    runners[me].holder.add(marker);
    runners[me].marker = marker;
    game = { me, net: net ? createNetDriver({ client: net.client, rules: { STEP, step }, state, me }) : null, seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), runners, acc: 0, endTimer: null, shake: 0, duel: false, count: 4 };
    newPage(state.holes, 0);
    dropFallen();
    pivot.rotation.x = 0;
    atmosphere.apply('day');
    atmosphere.setupShadows([...runners.map((r) => r.holder), pivot], [stage.group, stage.floorPage]);
    Object.assign(input, { touch: null, stick: null, target: null });
    $('hudE').classList.remove('fast');
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoE').classList.add('show');
    if (!fromSky) splash('よーい…');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudE').hidden = m !== 'playing';
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
  $('pauseBtnE').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: どこでもスティック ───────────────────────────
  const STICK_R = 56;
  const FULL = 26, DEAD = 6;
  const stickEl = $('stickE'), knobEl = stickEl.firstElementChild;
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
    $('howtoE').classList.remove('show');
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
    if (KEYS[e.code]) {
      e.preventDefault();
      unlockAudio();
      input.keys.add(e.code);
      $('howtoE').classList.remove('show');
    }
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
    } else if (input.stick) {
      sx = input.stick.dx;
      sy = input.stick.dy;
    }
    // カメラは 手前の 上から 奥(-z)を 見ているので、画面の 右 = +x、画面の 上 = 奥(-z)
    return { x: sx, z: sy };
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashE');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildChips() {
    $('chipsE').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'chip' + (slot === game.me ? ' me' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      d.innerHTML = '<i></i><b></b>';
      return d;
    }));
  }
  function renderHud() {
    const s = game.state;
    [...$('chipsE').children].forEach((c, i) => c.classList.toggle('out', !s.runners[i].alive));
    $('pageE').textContent = s.phase === 'ready' ? '' : `${s.page + 1}まいめ`;
  }
  const tmpV = new THREE.Vector3();
  function pop(text, x, y, z, cls = '', life = 800) {
    tmpV.set(x, y, z).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsE').append(el);
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
          setTimeout(() => $('howtoE').classList.remove('show'), 6000);
          break;
        case 'page':
          if (e.page > 0) { newPage(e.holes, e.page); sfx.page(); scraps(0, D * 0.8, 0.2, 3); }
          // 10まいごとに「とっぱ!」(先生も ばさばさ)
          if (e.page > 0 && e.page % 10 === 0) {
            setTimeout(() => { splash(`${e.page}まい とっぱ!`, 'gold small'); sfx.hurry(); }, 200);
            owl.play('flap', { fade: 0.1 });
            setTimeout(() => owl.play('idle', { fade: 0.3 }), 1200);
            const el = $('pageE');
            el.classList.remove('bump');
            void el.offsetWidth;
            el.classList.add('bump');
          }
          break;
        case 'faster':
          if (e.page % 10 !== 0) splash('はやく なるよ!', 'gold small');
          sfx.hurry();
          $('hudE').classList.toggle('fast', e.page >= 10);
          break;
        case 'flip':
          pivot.userData.flip = { t: 0, time: e.time };
          setTimeout(wind, e.time * 600);
          owl.play('flap', { fade: 0.1 });
          setTimeout(() => owl.play('idle', { fade: 0.3 }), 700);
          sfx.whoosh(e.time);
          break;
        case 'slam': {
          pivot.userData.flip = null;
          pivot.rotation.x = Math.PI / 2;
          pivot.userData.bounce = 1; // ぱたんの あと 少し はねる
          for (let i = 0; i < 10; i++) { const side = i % 3; const x = side === 0 ? -W / 2 - 0.1 : side === 1 ? W / 2 + 0.1 : -W / 2 + Math.random() * W; const z = side === 2 ? D + 0.2 : Math.random() * D; puff(x, 0.1, z, 1, 0xe8dcc0, 1.3); }
          scraps(0, 0.3, D, 5);
          sfx.slam();
          game.shake = 0.3;
          // ページの ふちから 風で 紙の ほこり
          for (let i = 0; i < 6; i++) puff(-W / 2 + Math.random() * W, 0.1, D + 0.2, 1, 0xf3e7cc, 1.2);
          for (const [slot, r] of s.runners.entries()) {
            if (!r.alive || game.runners[slot].out) continue;
            game.runners[slot].safeT = 0.6;
            if (slot === game.me) { pop('セーフ!', r.x, 1.8, r.z, 'gold'); sfx.safe(); }
          }
          break;
        }
        case 'squash': {
          const u = game.runners[e.slot];
          u.out = { t: 0, x: e.x, z: e.z };
          sfx.squash();
          stars(e.x, 0.4, e.z, 9);
          pop('ぺちゃんこ!', e.x, 1.4, e.z, e.slot === game.me ? 'red' : 'out');
          if (e.slot === game.me) splash('ぺちゃんこ…', 'red small');
          if (s.runners.filter((x) => x.alive).length === 2 && !game.duel) {
            game.duel = true;
            setTimeout(() => { splash('いっきうち!', 'gold small'); sfx.drum(); }, 700);
          }
          break;
        }
        case 'finished': {
          game.endTimer = 4.5;
          const win = e.winner === game.me;
          splash(e.timeUp ? 'じかん ぎれ!' : win ? 'さいごの 1人!' : 'しゅうりょう!', win ? 'gold' : '');
          if (win) sfx.fanfare();
          const r = s.runners[e.winner];
          confetti(r.x, r.z);
          // 本から ページが ぱらぱら 舞いあがる。先生も 大よろこび
          for (let i = 0; i < 6; i++) setTimeout(() => scraps(-W / 2 + Math.random() * W, 0.4, Math.random() * D, 8), i * 250);
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
    $('resultTitle').textContent = order[0] === game.me ? 'あなたの 勝ち!' : `${order.indexOf(game.me) + 1}位`;
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = game.players[slot];
      const r = s.runners[slot];
      const li = document.createElement('li');
      if (slot === game.me) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : slot === game.me ? 'あなた' : 'ともだち';
      const def = CHARACTERS.find((c) => c.key === p.character);
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}</small></span><span class="dist">${r.alive ? 'のこった!' : ''}<small>${r.safe} まい セーフ</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateWorld(dt) {
    const s = game.state;
    // ページ: 立ちあがる → たおれてくる(だんだん 速く)→ ぱたん
    const f = pivot.userData.flip;
    if (f) {
      f.t += dt;
      const k = Math.min(1, f.t / f.time);
      pivot.rotation.x = (Math.PI / 2) * k * k;
    } else if (pivot.userData.bounce > 0 && s.stage === 'after') {
      pivot.userData.bounce = Math.max(0, pivot.userData.bounce - dt * 4);
      pivot.rotation.x = Math.PI / 2 - Math.sin((1 - pivot.userData.bounce) * Math.PI) * 0.05;
    } else if (s.stage === 'show' || s.phase === 'ready') {
      pivot.userData.rise = Math.min(1, (pivot.userData.rise ?? 1) + dt * 5);
      const k = pivot.userData.rise;
      pivot.rotation.x = -0.35 * (1 - k) * (1 - k) + Math.sin(k * Math.PI) * 0.04;
      // 立っている あいだ ふわっと ゆれて、たおれる 前は ぐらぐら
      if (s.phase === 'play' && s.stage === 'show') {
        const left = s.stageT;
        pivot.rotation.x += Math.sin(time * 2) * 0.015 + (left < 0.5 ? Math.sin(time * 40) * 0.025 * (1 - left / 0.5) : 0);
      }
    }
    if (fallen) {
      // たおれた ページは 少しのあいだ 床に のこってから 消える
      fallen.t += dt;
      if (fallen.t > 0.45) dropFallen();
    }
    // 床の 影: ページが たおれてくるほど こく
    const show = s.phase === 'play' || s.phase === 'ready';
    const fk = f ? Math.min(1, f.t / f.time) : 0;
    const late = s.stage === 'show' ? 1 - Math.min(1, s.stageT / showTime(s.page)) : 1;
    const pulse = s.stage === 'show' && s.stageT < 0.6 ? Math.sin(time * 30) * 0.12 : 0;
    shadow.material.opacity = show && (s.stage === 'show' || s.stage === 'flip') ? 0.35 + late * 0.25 + fk * 0.4 + pulse : 0;
    // 子
    for (const [slot, u] of game.runners.entries()) {
      const r = s.runners[slot];
      let clip = 'idle', face = 'normal';
      if (u.out) {
        // ぺちゃんこ → 紙きれみたいに ひらひら 飛んでいく
        const o = u.out;
        o.t += dt;
        if (o.t < 0.5) u.holder.scale.set(1.5, 0.06, 1.5);
        else {
          const k = o.t - 0.5;
          // 奥(本棚の ほう)へ ひらひら 飛んで、小さくなって 消える
          u.holder.position.set(o.x + Math.sin(k * 3 + slot) * 0.8 * k, 0.05 + k * 2.2, o.z - k * 2.5);
          u.holder.rotation.set(Math.sin(k * 4) * 1.2, k * 2, Math.cos(k * 3) * 0.6);
          const sc = Math.max(0.01, 1 - k / 1.6);
          u.holder.scale.set(1.5 * sc, 0.06, 1.5 * sc);
          u.holder.visible = k < 1.6;
        }
        if (o.t < 0.5) u.holder.position.set(o.x, 0.02, o.z);
        clip = 'dizzy';
        face = 'frustrated';
      } else {
        const moving = Math.hypot(r.vx, r.vz) > 0.4;
        clip = moving ? 'run' : 'idle';
        u.holder.position.set(r.x, 0, r.z);
        u.holder.rotation.set(0, s.phase === 'finished' ? 0 : r.face, 0);
        u.holder.scale.setScalar(1);
        // ページが たおれてくる: 穴の 外だと びっくり。たすかったら ばんざい
        if (s.stage === 'flip') face = 'surprised';
        u.safeT = Math.max(0, u.safeT - dt);
        if (u.safeT > 0) {
          clip = 'cheer';
          face = 'happy';
          // 穴から ひょこっ
          const k = 1 - u.safeT / 0.6;
          u.holder.position.y = Math.sin(Math.min(1, k * 2) * Math.PI) * 0.35;
          u.holder.scale.set(1 + Math.sin(k * Math.PI * 2) * 0.08 * (1 - k), 1 - Math.sin(k * Math.PI * 2) * 0.08 * (1 - k), 1);
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
    stage.glow.material.opacity = 0.85 + Math.sin(time * 2.3) * 0.08;
    stage.glow.scale.setScalar(game.duel && s.phase === 'play' ? 8.5 + Math.sin(time * 6) * 0.6 : 7);
    stage.update(time);
    owl.update(dt);
    // たおれる 少し前: チッ チッ
    if (s.phase === 'play' && s.stage === 'show' && s.stageT < 0.6) { game.tickT = (game.tickT ?? 0) - dt; if (game.tickT <= 0) { game.tickT = 0.15; sfx.tick(); } }
  }

  let freeCamera = false;
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const pos = portrait ? new THREE.Vector3(0, 12.5, 16) : new THREE.Vector3(0, 8.5, 11.5);
    const look = new THREE.Vector3(0, portrait ? 1.4 : 1.6, portrait ? 2.6 : 2.4);
    const s = game?.state;
    if (s && s.phase === 'finished' && s.winner !== null) {
      const r = s.runners[s.winner];
      look.set(r.x * 0.7, 1.0, r.z - 0.5);
      pos.set(r.x * 0.7 - 1.2, 6.2, r.z + 9);
    } else if (s && game.duel) {
      pos.multiplyScalar(0.88);
    }
    camera.fov = portrait ? 52 : 45;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(6, 14, -6);
      camera.position.lerpVectors(sky, pos, e);
      camera.userData.look = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 3, 0), look, Math.min(1, e * 1.1));
      camera.lookAt(camera.userData.look);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 4);
    camera.position.lerp(pos, k);
    camera.userData.look = camera.userData.look ? camera.userData.look.lerp(look, k) : look.clone();
    if (game?.shake > 0) {
      game.shake = Math.max(0, game.shake - dt);
      camera.position.x += (Math.random() - 0.5) * game.shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * game.shake * 0.5;
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
    if (game && mode === 'playing' && intro >= 1 && game.state.phase === 'ready') {
      const n = Math.ceil(RULES.readyTime - game.state.t);
      if (n < game.count && n >= 1) { game.count = n; splash(String(n), 'small'); sfx.beep(false); }
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
  window.dehon = {
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
      $('stickE').hidden = true;
    },
    get intro() { return intro; },
  };
}
