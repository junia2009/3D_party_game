// どんぐりキャッチ の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
// タイトルと同じページで動く(だるまと同じ作り)。描画の器(renderer)と音はタイトルから借り、
// 1フレームぶんの更新と描画は frame() をタイトルの輪から呼んでもらう。
//
// 動かし方: 画面を指でなぞると、なぞったところへ走る(はなすと、そこまで行って止まる)。
// パソコンは矢印キー / WASD。

import * as THREE from 'three';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonMaterial } from '../../runtime/models.js';
import { nextRandom, seedFrom } from '../../rng.js';
import { ARENA_R, ITEMS, RULES, STEP, createGame, isHazard, ranking, step, timeLeft } from './rules.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { PERCH, SEATS, STUMP_TOP, buildStage } from './stage.js';
import { createAtmosphere, windify } from '../daruma/atmosphere.js';
import { acornGeometry } from '../daruma/trees.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const DROP_H = 7.5; // どんぐりが見えはじめる高さ
const FALL_SHOW = 1.2; // 落ちきる何秒前から、どんぐりが見えるか(影はそれより前から出ている)
const params = new URLSearchParams(location.search);

export async function createCatch({ renderer, settings, getAudio, onExit }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 700);
  const atmosphere = createAtmosphere(scene, renderer, camera, { course: false });
  const stage = buildStage(scene);
  windify(stage.group);

  // ── 音 ──────────────────────────────────────────
  let audio = null;
  const unlockAudio = () => { audio = settings.sound ? getAudio() : null; };
  function tone(freq, len = 0.09, type = 'triangle', gain = 0.12, at = 0) {
    if (!audio) return;
    const t = audio.currentTime + at;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + len);
  }
  function sweep(from, to, len, type = 'square', gain = 0.06) {
    if (!audio) return;
    const t = audio.currentTime;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + len);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + len);
  }
  // ガサガサ(枝がゆれる)
  function rustle(gain = 0.25) {
    if (!audio) return;
    const len = 0.6;
    const buf = audio.createBuffer(1, audio.sampleRate * len, audio.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / audio.sampleRate;
      d[i] = (Math.random() * 2 - 1) * Math.max(0, Math.sin(t * 30)) ** 3 * (1 - t / len);
    }
    const src = audio.createBufferSource();
    src.buffer = buf;
    const f = audio.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1500;
    const g = audio.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(audio.destination);
    src.start();
  }

  // ── 読みこみ: 審判の先生と観客 ───────────────────────
  await preload([...CHARACTERS.map((c) => c.key), 'hoho', ...new Set(SEATS.map((s) => s.kind))]);
  const owl = await createModel('hoho');
  owl.root.position.copy(PERCH);
  owl.root.rotation.y = 0.3; // 広場のほうを向く
  owl.play('idle');
  owl.setFace('normal');
  scene.add(owl.root);
  const audience = await Promise.all(SEATS.map(async (seat) => {
    const m = await createModel(seat.kind);
    m.root.position.set(seat.x, STUMP_TOP, seat.z);
    m.root.rotation.y = Math.atan2(-seat.x, -seat.z + 2); // 広場のほう(少し手前)を向く
    m.play('idle');
    m.actions.idle.time = Math.random() * 2;
    m.setFace('normal');
    scene.add(m.root);
    return { seat, model: m, until: 0 };
  }));
  atmosphere.setupShadows([stage.group, owl.root], [stage.group]);
  atmosphere.setupShadows([], audience.map((a) => a.model.root));

  // ── 落ちてくるもの ─────────────────────────────────
  const acornGeo = acornGeometry();
  const acornMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true });
  const goldMat = new THREE.MeshToonMaterial({ color: 0xffd24a, emissive: 0x7a4a00, emissiveIntensity: 0.35 });
  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(30,40,20,0.55)');
    r.addColorStop(0.7, 'rgba(30,40,20,0.35)');
    r.addColorStop(1, 'rgba(30,40,20,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  function makeShadow(size, color = 0xffffff) {
    const m = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, color }));
    m.position.y = 0.02;
    m.scale.setScalar(size);
    m.renderOrder = 1;
    return m;
  }
  // 毛虫: みどりの玉をつないで、顔をつける
  function makeWorm() {
    const g = new THREE.Group();
    const body = toonMaterial(0x7cc35a), belt = toonMaterial(0xf2d34a);
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.07 - i * 0.004, 12, 8), i % 2 ? belt : body);
      b.position.set(0, 0, -i * 0.085);
      g.add(b);
    }
    const eyeW = new THREE.MeshBasicMaterial({ color: 0xffffff }), eyeB = new THREE.MeshBasicMaterial({ color: 0x1b1b1b });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), eyeW);
      e.position.set(s * 0.032, 0.04, 0.05);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 4), eyeB);
      p.position.set(s * 0.032, 0.043, 0.07);
      g.add(e, p);
    }
    g.scale.setScalar(2);
    return g;
  }
  // まつぼっくり: うろこを重ねた円すい
  function makeCone() {
    const g = new THREE.Group();
    const mat = toonMaterial(0x8a5a32), tip = toonMaterial(0xb07a44);
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.11 - i * 0.017, 0.07, 8), i % 2 ? tip : mat);
      c.position.y = -0.1 + i * 0.05;
      c.rotation.y = i * 0.4;
      g.add(c);
    }
    g.rotation.x = Math.PI;
    g.scale.setScalar(1.9);
    return g;
  }
  function makeItem(kind) {
    if (kind === 'worm') return makeWorm();
    if (kind === 'cone') return makeCone();
    const m = new THREE.Mesh(acornGeo, kind === 'gold' ? goldMat : acornMat);
    m.scale.setScalar(kind === 'gold' ? 3 : 2.5);
    return m;
  }
  // 落ちるところの輪(どんぐりは白、金どんぐりは金、じゃまものは赤)。落ちる直前にきゅっと縮む
  const ringGeo = new THREE.RingGeometry(0.42, 0.5, 32).rotateX(-Math.PI / 2);
  const ringMats = { acorn: 0xffffff, gold: 0xffd24a, worm: 0xff5a4e, cone: 0xff5a4e }; // ふつうのどんぐりは影だけ(輪は出さない)
  const items = new Map(); // id → { mesh, shadow, ring, kind, fly }
  const itemGroup = new THREE.Group();
  scene.add(itemGroup);
  function addItem(e) {
    const mesh = makeItem(e.kind);
    mesh.traverse((o) => { o.castShadow = true; });
    const sh = makeShadow(0.5);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: ringMats[e.kind], transparent: true, depthWrite: false }));
    ring.renderOrder = 2;
    ring.position.set(e.x, 0.03, e.z);
    itemGroup.add(mesh, sh, ring);
    const v = { mesh, shadow: sh, ring, kind: e.kind, x: e.x, z: e.z, fly: null, spin: Math.random() * 6 };
    items.set(e.id, v);
    return v;
  }
  function removeItem(id) {
    const v = items.get(id);
    if (!v) return;
    itemGroup.remove(v.mesh, v.shadow, v.ring);
    v.shadow.material.dispose();
    v.ring.material.dispose();
    items.delete(id);
  }
  // 枝がゆれたところの目じるし(葉っぱがひらひら落ちる)
  const leafGeo = new THREE.PlaneGeometry(0.16, 0.1);
  const leafMats = [0x6fb24e, 0x8fcf5f, 0xd9a34a].map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, transparent: true }));
  const leaves = [];
  function shakeLeaves(x, z) {
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(leafGeo, leafMats[i % 3]);
      m.position.set(x + (Math.random() - 0.5) * 2, DROP_H + Math.random() * 1.5, z + (Math.random() - 0.5) * 2);
      scene.add(m);
      leaves.push({ m, vy: -(1.2 + Math.random()), ph: Math.random() * 6, life: 3 });
    }
  }

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
    t.repeat.set(3, 1);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  function makeBasket() {
    const g = new THREE.Group();
    const mat = new THREE.MeshToonMaterial({ map: weave, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.24, 0.22, 20, 1, true), mat);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.24, 20).rotateX(-Math.PI / 2), toonMaterial(0xa06c38));
    bottom.position.y = -0.105;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 6, 24).rotateX(Math.PI / 2), toonMaterial(0x8a5a2e));
    rim.position.y = 0.11;
    // 中のどんぐり(拾った数だけ見える。12 こまで)
    const pile = new THREE.InstancedMesh(acornGeo, acornMat, 12);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 12; i++) {
      const a = i * 2.4, r = 0.06 + (i % 4) * 0.045;
      dummy.position.set(Math.cos(a) * r, -0.06 + Math.floor(i / 4) * 0.06, Math.sin(a) * r);
      dummy.rotation.set(Math.random() * 3, Math.random() * 6, Math.random());
      dummy.scale.setScalar(1.3);
      dummy.updateMatrix();
      pile.setMatrixAt(i, dummy.matrix);
    }
    pile.count = 0;
    g.add(body, bottom, rim, pile);
    g.traverse((o) => { o.castShadow = true; });
    return { group: g, pile };
  }

  // ── ゲームの進行 ────────────────────────────────────
  let mode = 'idle'; // idle(タイトルにいる)→ playing → result
  let picked = CHARACTERS[0].key;
  let game = null; // { state, players, cpus, runners(見た目), acc, endTimer }
  let intro = 1;
  const INTRO_TIME = 2.4;
  const input = { touch: null, stick: null, keys: new Set(), target: null };

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const pick = { rng: seedFrom(`${seed}:pick`) };
    const others = CHARACTERS.filter((c) => c.key !== picked).map((c) => c.key);
    const cpuChars = [];
    while (cpuChars.length < SLOTS - 1) cpuChars.push(others.splice(Math.floor(nextRandom(pick) * others.length), 1)[0]);
    const kinds = Object.keys(PERSONALITIES);
    const players = [
      { id: 'me', name: 'あなた', character: picked, cpu: null },
      ...cpuChars.map((key, i) => ({ id: `cpu${i}`, name: CHARACTERS.find((c) => c.key === key).name, character: key, cpu: kinds[Math.floor(nextRandom(pick) * kinds.length)] })),
    ];
    if (game) for (const r of game.runners) scene.remove(r.holder);
    for (const id of [...items.keys()]) removeItem(id);

    const state = createGame(players, seed);
    const runners = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const holder = new THREE.Group();
      holder.add(model.root);
      const def = CHARACTERS.find((c) => c.key === p.character);
      const size = def.size || 1;
      const basket = makeBasket();
      basket.group.position.y = 1.62 * size;
      holder.add(basket.group);
      const sh = makeShadow(0.95 * size);
      holder.add(sh);
      const r = state.runners[slot];
      holder.position.set(r.x, 0, r.z);
      model.root.rotation.y = Math.atan2(-r.x, -r.z); // まん中を向く
      scene.add(holder);
      return { model, holder, basket, shadow: sh, size, face: model.root.rotation.y, bob: 0 };
    }));
    // 自分の足もとに、自分の色の輪
    const foot = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.58, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex, transparent: true, opacity: 0.9, depthWrite: false }));
    foot.position.y = 0.025;
    foot.renderOrder = 2;
    runners[0].holder.add(foot);
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    runners[0].holder.add(marker);
    runners[0].marker = marker;

    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), runners, acc: 0, endTimer: null };
    atmosphere.apply(params.get('time') || state.timeOfDay);
    atmosphere.setupShadows(runners.map((r) => r.holder), runners.map((r) => r.holder));
    input.touch = null;
    input.stick = null;
    input.target = null;
    buildScores();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoC').classList.add('show');
    if (!fromSky) splash('よーい…');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudC').hidden = m !== 'playing';
    document.body.classList.toggle('ingame', m !== 'idle');
  }
  function leave(to) {
    input.touch = null;
    onExit(to);
  }

  // ── 一時停止(だるまと同じ画面を使う。会場にいるときだけ反応する) ──────
  let paused = false;
  function setPaused(on) {
    if (mode === 'idle') { paused = false; return; } // ほかの競技の いちじていし にさわらない
    paused = on && mode === 'playing';
    $('pause').hidden = !paused;
    if (paused) input.touch = null;
  }
  const mine = (fn) => () => { if (mode !== 'idle') fn(); };
  $('pauseBtnC').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: どこでもスティック ─────────────────────────
  // 画面のどこを触っても、そこがスティックのまん中になる。指をずらした向きへ、ずらした量に応じた速さで走る。
  // 指は画面の下のほうに置いたままでよい(広場をかくさない)。パソコンは矢印キー / WASD。
  const STICK_R = 56; // これだけずらすと全速力(px)
  const stickEl = $('stickC'), knobEl = stickEl.firstElementChild;
  const canSteer = (e) => mode === 'playing' && !paused && !e.target.closest('button, a');
  window.addEventListener('pointerdown', (e) => {
    if (!canSteer(e) || input.touch !== null) return;
    unlockAudio();
    input.touch = e.pointerId;
    input.stick = { ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    stickEl.style.left = `${e.clientX}px`;
    stickEl.style.top = `${e.clientY}px`;
    knobEl.style.transform = 'translate(-50%, -50%)';
    stickEl.hidden = false;
    $('howtoC').classList.remove('show');
  });
  window.addEventListener('pointermove', (e) => {
    if (input.touch !== e.pointerId || !input.stick) return;
    let dx = e.clientX - input.stick.ox, dy = e.clientY - input.stick.oy;
    const d = Math.hypot(dx, dy);
    // 大きくずらしたら、スティックのまん中も指についてくる(指を戻さなくても向きを変えられる)
    if (d > STICK_R * 1.4) {
      input.stick.ox += (dx / d) * (d - STICK_R * 1.4);
      input.stick.oy += (dy / d) * (d - STICK_R * 1.4);
      stickEl.style.left = `${input.stick.ox}px`;
      stickEl.style.top = `${input.stick.oy}px`;
      dx = e.clientX - input.stick.ox;
      dy = e.clientY - input.stick.oy;
    }
    const k = Math.min(1, Math.hypot(dx, dy) / STICK_R);
    const a = Math.atan2(dy, dx);
    input.stick.dx = Math.cos(a) * k;
    input.stick.dy = Math.sin(a) * k;
    knobEl.style.transform = `translate(calc(-50% + ${input.stick.dx * STICK_R}px), calc(-50% + ${input.stick.dy * STICK_R}px))`;
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
      $('howtoC').classList.remove('show');
    }
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.touch = null; input.stick = null; stickEl.hidden = true; });

  // 画面の上下左右を、地面の向きにする(カメラの向きに合わせる)
  const fwd = new THREE.Vector3();
  function myInput() {
    if (input.target) return input.target; // E2E 用
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
    const k = Math.hypot(sx, sy);
    if (k < 0.12) return null; // まん中あたりは止まる
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    // 画面の右 = カメラの右、画面の上 = カメラの前
    const wx = -fwd.z * sx + fwd.x * -sy, wz = fwd.x * sx + fwd.z * -sy;
    // ルールは「行き先」で動くので、ずらした量に応じた近さに行き先を置く(近いほどゆっくり)
    return { x: me.x + wx * 0.6 * k, z: me.z + wz * 0.6 * k };
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashC');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildScores() {
    $('scoresC').replaceChildren(...game.players.map((p, slot) => {
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
    const left = s.phase === 'ready' ? RULES.timeLimit : timeLeft(s);
    $('timerC').firstChild.nodeValue = String(Math.ceil(left));
    $('timerC').classList.toggle('rain', s.rain && s.phase === 'play');
    // 点数の札: 多い順に並べなおす(位置は transform で動かして、ならびかえを見せる)
    const order = ranking(s);
    const chips = [...$('scoresC').children];
    order.forEach((slot, rank) => {
      const c = chips[slot];
      c.style.order = rank;
      const b = c.lastChild;
      if (b.textContent !== String(s.runners[slot].acorns)) {
        b.textContent = s.runners[slot].acorns;
        c.classList.remove('up');
        void c.offsetWidth;
        c.classList.add('up');
      }
      c.classList.toggle('stun', s.runners[slot].stun > 0);
    });
  }
  // 「+1」などを、その場所の上にふわっと出す
  const tmpV = new THREE.Vector3();
  function pop(text, x, y, z, cls = '') {
    tmpV.set(x, y, z).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsC').append(el);
    setTimeout(() => el.remove(), 900);
  }

  // ── できごと ────────────────────────────────────────
  function cheer(x, z, r = 4) {
    for (const a of audience) {
      if (Math.hypot(a.seat.x - x, a.seat.z - z) > r) continue;
      a.model.play('cheer');
      a.model.setFace('happy');
      a.until = 1.2;
    }
  }
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'start':
          splash('スタート!');
          setTimeout(() => $('howtoC').classList.remove('show'), 6000);
          tone(784, 0.12); tone(1046, 0.25, 'triangle', 0.12, 0.12);
          break;
        case 'shake': {
          rustle(0.18);
          shakeLeaves(e.x, e.z);
          // 大木の茂みもゆらす
          stage.crowns && (stage.crowns.userData.shake = 0.5);
          break;
        }
        case 'drop':
          addItem(e);
          break;
        case 'spill': {
          const v = addItem({ ...e, kind: 'acorn' });
          const from = game.runners[e.from];
          v.fly = { t: 0, len: RULES.spillLock, from: from.holder.position.clone().setY(1.7 * from.size), to: new THREE.Vector3(e.x, 0.1, e.z) };
          break;
        }
        case 'catch': case 'pickup': {
          const v = items.get(e.id);
          const r = game.runners[e.slot];
          if (v) {
            // かごへ飛びこむ
            v.fly = { t: 0, len: 0.18, from: v.mesh.position.clone(), to: null, into: r, remove: true };
            v.shadow.visible = v.ring.visible = false;
          }
          const gold = e.kind === 'gold';
          if (e.slot === 0) {
            tone(gold ? 1318 : 1046, 0.08, 'sine', 0.1);
            tone(gold ? 1760 : 1568, 0.14, 'sine', 0.1, 0.07);
            if (gold) tone(2093, 0.25, 'sine', 0.08, 0.14);
          }
          if (e.slot === 0 || gold) {
            const p = r.holder.position;
            pop(`+${ITEMS[e.kind].value}`, p.x, 2.2 * r.size, p.z, (gold ? 'gold' : '') + (e.slot === 0 ? ' me' : ''));
          }
          if (gold) cheer(r.holder.position.x, r.holder.position.z, 6);
          break;
        }
        case 'stun': {
          const v = items.get(e.id);
          const r = game.runners[e.slot];
          if (v) {
            v.fly = { t: 0, len: 0.15, from: v.mesh.position.clone(), to: null, into: r, remove: true };
            v.shadow.visible = v.ring.visible = false;
          }
          sweep(e.kind === 'cone' ? 320 : 600, e.kind === 'cone' ? 90 : 200, 0.3, 'square', 0.07);
          if (e.slot === 0) splash(e.kind === 'worm' ? 'けむし!' : 'ゴツン!', 'red');
          break;
        }
        case 'bump': {
          sweep(240, 110, 0.15, 'square', 0.06);
          if (e.hit === 0 && e.spilled) splash('こぼれた!', 'red');
          else if (e.by === 0 && e.spilled) splash('ドーン!');
          cheer(e.x, e.z, 5);
          break;
        }
        case 'land':
          if (e.gone) removeItem(e.id);
          else tone(330, 0.05, 'sine', 0.04);
          break;
        case 'vanish':
          removeItem(e.id);
          break;
        case 'rain':
          splash('どんぐりの雨!', 'gold');
          owl.play('flap', { fade: 0.1 });
          for (const a of audience) { a.model.play('cheer'); a.model.setFace('happy'); a.until = 2; }
          rustle(0.35);
          break;
        case 'timeup':
          splash('そこまで!');
          owl.play('flap', { fade: 0.1 });
          break;
        case 'finished':
          game.endTimer = 2.6;
          break;
      }
    }
    void s;
  }

  function showResult() {
    const s = game.state;
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
        `<span>${def.name}<small>${who}</small></span><span class="dist">どんぐり ${r.acorns}<small>${r.golds ? `金どんぐり ${r.golds}` : ''}</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateRunners(dt) {
    const s = game.state;
    const done = s.phase === 'finished';
    s.runners.forEach((r, i) => {
      const v = game.runners[i];
      v.holder.position.set(r.x, 0, r.z);
      const speed = Math.hypot(r.vx, r.vz);
      // 走る向きへ体を回す
      if (speed > 0.4) v.face = Math.atan2(r.vx, r.vz);
      let d = v.face - v.model.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      v.model.root.rotation.y += d * (1 - Math.exp(-dt * 12));
      let clip = 'idle', face = 'normal', timeScale = 1;
      if (r.stun > 0) {
        clip = 'dizzy';
        face = 'frustrated';
      } else if (done) {
        const win = s.winner === i;
        clip = win ? 'cheer' : 'idle';
        face = win ? 'happy' : 'frustrated';
        if (win) v.face = Math.atan2(camera.position.x - r.x, camera.position.z - r.z);
      } else if (speed > 0.3) {
        clip = 'run';
        timeScale = 0.6 + 0.6 * (speed / RULES.maxSpeed);
      }
      v.model.play(clip, { timeScale });
      v.model.setFace(face);
      v.model.update(dt);
      // かごは頭の上で、走るとゆれる
      v.bob += dt * (speed > 0.3 ? 14 : 3);
      const lift = v.model.node('rig').position.y;
      v.basket.group.position.set(Math.sin(v.bob) * 0.02, 1.62 * v.size + lift, 0);
      v.basket.group.rotation.z = Math.sin(v.bob) * (speed > 0.3 ? 0.08 : 0.02);
      v.basket.pile.count = Math.min(12, r.acorns);
      v.shadow.scale.setScalar(0.95 * v.size * (1 - Math.min(0.5, lift * 0.9)));
      if (v.marker) v.marker.position.set(0, 2.2 * v.size + 0.08 * Math.sin(performance.now() / 180), 0);
    });
  }

  function updateItems(dt) {
    const s = game.state;
    const byId = new Map(s.items.map((it) => [it.id, it]));
    for (const [id, v] of items) {
      v.spin += dt * 3;
      if (v.fly) {
        v.fly.t += dt;
        const k = Math.min(1, v.fly.t / v.fly.len);
        const to = v.fly.into ? v.fly.into.holder.position.clone().setY(1.7 * v.fly.into.size) : v.fly.to;
        v.mesh.position.lerpVectors(v.fly.from, to, k);
        if (!v.fly.into) v.mesh.position.y += Math.sin(k * Math.PI) * 1.2; // こぼれたどんぐりは弧をえがく
        v.mesh.rotation.set(v.spin, v.spin * 0.7, 0);
        v.shadow.position.set(v.mesh.position.x, 0.02, v.mesh.position.z);
        if (k >= 1) {
          if (v.fly.remove) { removeItem(id); continue; }
          v.fly = null;
        }
        continue;
      }
      const it = byId.get(id);
      if (!it) continue;
      if (it.ground === null) {
        // 落ちてくる: 影が先に出て、だんだん濃く大きく。どんぐり自体は終わりの FALL_SHOW 秒だけ見える
        const f = Math.max(0, it.left) / RULES.fallTime; // 1 → 0
        const h = Math.max(0, it.left) / FALL_SHOW; // 1 をこえているあいだは、まだ枝の中
        v.mesh.visible = h < 1;
        v.mesh.position.set(it.x, 0.9 + (DROP_H - 0.9) * Math.min(1, h) ** 1.6, it.z);
        v.mesh.rotation.set(v.spin, v.spin * 0.6, 0);
        if (v.kind === 'worm') v.mesh.rotation.set(Math.PI / 2 + Math.sin(v.spin * 3) * 0.4, v.spin, 0);
        const near = 1 - Math.min(1, f);
        v.shadow.position.set(it.x, 0.02, it.z);
        v.shadow.scale.setScalar(0.4 + near * 0.6);
        v.shadow.material.opacity = 0.5 + near * 0.5;
        // 輪(金どんぐりとじゃまものだけ): 大きく出て、落ちる直前に受けとれる大きさまで縮む
        v.ring.visible = v.kind !== 'acorn';
        v.ring.scale.setScalar(RULES.catchR / 0.46 * (1 + f * 0.8));
        v.ring.material.opacity = 0.35 + near * 0.6;
      } else {
        // 地面: ころんと寝かせる。消える前は点滅
        v.mesh.visible = it.ground > 0.8 || Math.sin(it.ground * 30) > 0;
        v.mesh.position.set(it.x, 0.11, it.z);
        v.mesh.rotation.set(Math.PI / 2, v.spin * 0.1, 0.3);
        v.ring.visible = false;
        v.shadow.scale.setScalar(0.35);
        v.shadow.material.opacity = 0.6;
      }
    }
    // 葉っぱ
    for (let i = leaves.length - 1; i >= 0; i--) {
      const l = leaves[i];
      l.life -= dt;
      l.m.position.y += l.vy * dt;
      l.m.position.x += Math.sin(l.ph + l.life * 3) * dt * 0.8;
      l.m.rotation.set(l.life * 3 + l.ph, l.life * 2, l.ph);
      l.m.material.opacity = Math.min(1, l.life);
      if (l.life <= 0 || l.m.position.y < 0.05) {
        scene.remove(l.m);
        leaves.splice(i, 1);
      }
    }
  }

  let freeCamera = false;
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const me = game ? game.state.runners[0] : { x: 0, z: 0 };
    let pos, look;
    if (game && (game.state.phase === 'finished' || mode === 'result')) {
      // 決着: 勝った子に寄る
      const w = game.state.runners[game.state.winner];
      pos = new THREE.Vector3(w.x * 0.6, 3.4, w.z + (portrait ? 7 : 5.5));
      look = new THREE.Vector3(w.x, 1.1, w.z);
    } else {
      // 自分に寄せて追いかける。見る先は自分の少し奥(どんぐりは奥の大木のほうから来ることが多い)。
      // 広場の外ばかり映らないよう、見る先は広場の中に寄せておく
      const fx = me.x * 0.8, fz = me.z * 0.8;
      pos = new THREE.Vector3(fx, portrait ? 9.2 : 6.6, fz + (portrait ? 7.4 : 6.2));
      look = new THREE.Vector3(fx, 0, fz - (portrait ? 1.0 : 0.9));
    }
    camera.fov = portrait ? 58 : 46;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      // 空から広場へ降りてくる: 大木の上のほうから、くるっと回りこんで手前へ
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(-10, 26, -14);
      const skyLook = new THREE.Vector3(0, 0, 0);
      camera.position.lerpVectors(sky, pos, e);
      camera.userData.look = new THREE.Vector3().lerpVectors(skyLook, look, Math.min(1, e * 1.1));
      camera.lookAt(camera.userData.look);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 4);
    camera.position.lerp(pos, k);
    camera.userData.look = camera.userData.look ? camera.userData.look.lerp(look, k) : look.clone();
    camera.lookAt(camera.userData.look);
  }

  // ── 画質(だるまと同じ考え方) ─────────────────────────
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

  // ── 1フレーム(タイトルの輪から呼ばれる) ─────────────────
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
      updateRunners(dt);
      updateItems(dt);
    }
    if (!paused) {
      for (const a of audience) {
        if (a.until > 0) {
          a.until -= dt;
          if (a.until <= 0) { a.model.play('idle'); a.model.setFace('normal'); }
        }
        a.model.update(dt);
      }
      owl.update(dt);
      if (owl.current === 'flap' && owl.actions.flap.time > 1.2) owl.play('idle');
      // 茂みのゆれ
      const cr = stage.crowns;
      if (cr && cr.userData.shake > 0) {
        cr.userData.shake = Math.max(0, cr.userData.shake - dt);
        cr.position.set(Math.sin(time * 37) * 0.08, Math.sin(time * 29) * 0.05, 0).multiplyScalar(cr.userData.shake * 2);
      }
    }
    atmosphere.update(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  // E2E 用の口
  window.dcatch = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    steer: (t) => { input.target = t; },
    // 描かずに、みんな CPU で sec 秒すすめる(途中の場面を撮る用)
    advance: (sec) => {
      const me = createCpu('normal', 1, 0);
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
    async enter(character, { fromSky = true } = {}) {
      picked = character;
      unlockAudio();
      applyQuality();
      await startGame({ fromSky });
      renderer.compile(scene, camera);
    },
    exit() {
      setMode('idle');
      input.touch = null;
      input.stick = null;
      $('stickC').hidden = true;
      input.keys.clear();
    },
    get intro() { return intro; },
  };
}
