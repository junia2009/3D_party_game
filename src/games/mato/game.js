// まつぼっくり的あて の画面(会場・キャラ・まつぼっくり・的・ねらいの線・HUD)。
// ルールは rules.js、CPU は cpu.js。ここは state を読んで描くだけ(state を書くのは rules.step だけ)。
//
// 操作: 画面のどこかに指をおいて、下へひっぱって、はなす(ぱちんこ)。
//   ひっぱる長さ → 強さ(遠く)、左へひっぱる → 右へ飛ぶ。ひっぱっているあいだ、飛ぶ道すじ(風なし)が見える。
//   PC: ← → でねらいを動かし、スペースを長押しで強さをためて、はなすと投げる。

import * as THREE from 'three';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload } from '../../runtime/models.js';
import { nextRandom, seedFrom } from '../../rng.js';
import { RULES, STEP, createGame, launch, fly, ranking, step, timeLeft } from './rules.js';
import { createTargets } from './targets.js';
import { makeBasket, makeSling } from './sling.js';
import { createPond } from './pond.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { buildStage } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);
// 桟橋の立ち位置: 自分(席0)はまん中。ほかの子は左右へ
const STAND = [0, -2.3, 2.9, -4.6, 5.2]; // カメラが右肩のうしろなので、右どなりは少しはなす

export async function createMato({ renderer, settings, getAudio, onExit }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
  const atmosphere = createAtmosphere(scene, renderer, camera, { course: false });
  atmosphere.sun.target.position.set(0, 0, -9);
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
  let noiseBuf = null;
  function hiss({ type = 'bandpass', f0, f1 = f0, q = 1, len, gain = 0.1, at = 0, attack = 0.005 }) {
    if (!audio || gain <= 0) return;
    if (!noiseBuf) {
      noiseBuf = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = audio.currentTime + at;
    const src = audio.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = audio.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + len);
    const g = audio.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(audio.destination);
    src.start(t, Math.random() * 0.5);
    src.stop(t + len + 0.05);
  }
  // ドレミ(れんぞくの音が、1つずつ上がっていく)
  const SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
  const sfx = {
    // はなす: ゴムのばちん + 風を切る音
    throw: () => {
      hiss({ type: 'highpass', f0: 1800, len: 0.05, gain: 0.12, attack: 0.002 });
      voice({ type: 'triangle', pts: [[0, 160], [0.05, 70]], len: 0.07, gain: 0.1 });
      hiss({ f0: 700, f1: 2600, q: 2, len: 0.28, gain: 0.07, attack: 0.04, at: 0.02 });
    },
    // 木の的に当たる: コーン!(れんぞくで音が上がる)
    hit: (combo) => {
      const up = 2 ** (SCALE[Math.min(combo, SCALE.length) - 1] / 12);
      hiss({ type: 'bandpass', f0: 3000, q: 1.5, len: 0.04, gain: 0.1, attack: 0.002 });
      voice({ type: 'triangle', pts: [[0, 880 * up], [0.03, 840 * up]], len: 0.16, gain: 0.16 });
      voice({ type: 'sine', pts: [[0, 1320 * up]], len: 0.22, gain: 0.06, at: 0.01 });
      voice({ type: 'sine', pts: [[0, 220], [0.08, 140]], len: 0.1, gain: 0.08 }); // 板がゆれる低い音
    },
    // れんぞく3つ・6つ: 小さなファンファーレ
    combo: (big) => (big ? [1047, 1319, 1568, 2093] : [1047, 1319, 1568]).forEach((f, i) => voice({ type: 'square', pts: [[0, f]], len: 0.12, gain: 0.035, at: 0.12 + i * 0.07 })),
    gold: () => {
      [1319, 1568, 2093, 2637].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.3, gain: 0.08, at: i * 0.06 }));
      voice({ type: 'sine', pts: [[0, 3136]], len: 0.8, gain: 0.04, at: 0.25, vib: 18, vibRate: 9 });
    },
    // 池に落ちる: ぽちゃん / 岸に落ちる: ぼすっ
    splash: (far) => {
      voice({ type: 'sine', pts: [[0, 900], [0.09, 260]], len: 0.11, gain: far ? 0.04 : 0.09 });
      hiss({ type: 'lowpass', f0: 2600, f1: 400, len: 0.35, gain: far ? 0.04 : 0.08, at: 0.02 });
    },
    thud: () => { voice({ type: 'triangle', pts: [[0, 150], [0.08, 70]], len: 0.1, gain: 0.08 }); hiss({ type: 'lowpass', f0: 900, len: 0.08, gain: 0.05 }); },
    // ハチ: ぶーん(近づいて、また遠ざかる)
    sting: () => {
      for (const [f, d] of [[210, 0], [240, 0.04], [190, 0.08]]) {
        voice({ type: 'sawtooth', pts: [[0, f], [0.6, f * 1.15], [1.4, f * 0.9]], len: 1.5, gain: 0.035, vib: 18, vibRate: 34 + d * 50, at: d });
      }
      voice({ type: 'square', pts: [[0, 330], [0.15, 220]], len: 0.2, gain: 0.05 }); // あいたっ
    },
    wind: () => hiss({ f0: 300, f1: 900, q: 0.7, len: 1.6, gain: 0.07, attack: 0.5 }),
    beep: (hi) => voice({ type: 'square', pts: [[0, hi ? 1046 : 523]], len: hi ? 0.4 : 0.15, gain: 0.06 }),
    tick: (n) => voice({ type: 'square', pts: [[0, n % 2 ? 1568 : 1319]], len: 0.06, gain: 0.05 }),
    whistle: () => voice({ type: 'sine', pts: [[0, 2000], [0.5, 2100]], len: 0.6, gain: 0.08, vib: 60, vibRate: 30 }),
    fanfare: () => [784, 988, 1175, 1568].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.3 + i * 0.1, gain: 0.1, at: i * 0.13 })),
    // 負けたとき: やさしい2音
    finish: () => [659, 784].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.35, gain: 0.07, at: i * 0.16 })),
    // 的が出てくる(自分の的だけ。小さく)
    appear: (kind) => {
      if (kind === 'pad') voice({ type: 'sine', pts: [[0, 500], [0.06, 900]], len: 0.08, gain: 0.04 });
      if (kind === 'stump') voice({ type: 'triangle', pts: [[0, 420], [0.05, 640]], len: 0.07, gain: 0.05 });
      if (kind === 'swing') hiss({ f0: 2500, f1: 1200, q: 3, len: 0.3, gain: 0.03, attack: 0.05 });
      if (kind === 'gold') voice({ type: 'sawtooth', pts: [[0, 140], [0.5, 160]], len: 0.6, gain: 0.02, vib: 40, vibRate: 60 });
      if (kind === 'hive') voice({ type: 'sawtooth', pts: [[0, 190], [0.6, 200]], len: 0.7, gain: 0.02, vib: 15, vibRate: 32 });
    },
    bird: () => {
      const f = 2600 + Math.random() * 1200;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) voice({ type: 'sine', pts: [[0, f], [0.05, f * 1.25], [0.09, f * 0.95]], len: 0.1, gain: 0.025, at: i * 0.13 });
    },
  };
  // ひっぱっているあいだの、ゴムのきしむ音(引くほど高く)
  let creak = null;
  function startCreak() {
    if (!audio || creak) return;
    const o = audio.createOscillator(), g = audio.createGain(), f = audio.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.value = 120;
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 2;
    g.gain.value = 0;
    o.connect(f).connect(g).connect(audio.destination);
    o.start();
    creak = { o, g, f, last: 0 };
  }
  function updateCreak(power, dt) {
    if (!creak) return;
    // 引く長さが変わっているときだけ鳴る(止めて持っているあいだは静か)
    const moving = Math.min(1, Math.abs(power - creak.last) / Math.max(dt, 1e-3) * 0.6);
    creak.last = power;
    creak.o.frequency.value = 110 + power * 260;
    creak.f.frequency.value = 700 + power * 900;
    creak.g.gain.value += (moving * 0.05 - creak.g.gain.value) * Math.min(1, dt * 20);
  }
  function stopCreak() {
    if (!creak) return;
    creak.o.stop();
    creak = null;
  }
  // まわりの音: 水のたぷたぷ(いつも)と、風(強さで)。ときどき小鳥
  let amb = null;
  function startAmbience() {
    if (!audio || amb) return;
    if (!noiseBuf) hiss({ f0: 100, len: 0.01, gain: 0.0001 }); // 雑音の元を作る
    const layer = (type, freq, q) => {
      const src = audio.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = audio.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = audio.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(audio.destination);
      src.start();
      return { src, f, g };
    };
    amb = { water: layer('lowpass', 420, 0.7), wind: layer('bandpass', 500, 0.6), bird: 3 + Math.random() * 4 };
  }
  function stopAmbience() {
    if (!amb) return;
    amb.water.src.stop();
    amb.wind.src.stop();
    amb = null;
  }
  function updateAmbience(dt, wind, time) {
    if (!amb) return;
    amb.water.g.gain.value = 0.025 + Math.sin(time * 1.3) * 0.01; // 岸に寄せる波
    const w = Math.abs(wind) / RULES.windMax;
    amb.wind.g.gain.value += (w * w * 0.06 - amb.wind.g.gain.value) * Math.min(1, dt * 2);
    amb.wind.f.frequency.value = 350 + w * 500 + Math.sin(time * 0.7) * 80;
    amb.bird -= dt;
    if (amb.bird <= 0) { sfx.bird(); amb.bird = 4 + Math.random() * 7; }
  }

  await preload(CHARACTERS.map((c) => c.key));

  // ── まつぼっくり ──────────────────────────────────────
  const pineGeo = (() => {
    // しずく形の胴に、うろこの段(色を交互に)
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector2(Math.sin(t * Math.PI) ** 0.8 * (0.13 - t * 0.04) + 0.005, (t - 0.5) * 0.34));
    }
    const geo = new THREE.LatheGeometry(pts, 9);
    const p = geo.attributes.position;
    const cols = [];
    const a = new THREE.Color(0x8a5a2e), b = new THREE.Color(0x5e3a1c);
    for (let i = 0; i < p.count; i++) {
      const c = Math.floor((p.getY(i) + 0.17) / 0.05) % 2 ? a : b;
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    return geo;
  })();
  const pineMat = new THREE.MeshToonMaterial({ vertexColors: true });
  const shotMeshes = new Map(); // shot(state の中のもの) → mesh

  // ── ねらいの線(風なしの道すじ)と、ぱちんこのゴム ──────────────
  const DOTS = 26;
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
  const dots = Array.from({ length: DOTS }, () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), dotMat);
    m.visible = false;
    scene.add(m);
    return m;
  });
  const landRing = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
  landRing.rotation.x = -Math.PI / 2;
  landRing.visible = false;
  scene.add(landRing);

  // ── 水しぶき(演出なので Math.random でよい) ─────────
  const fx = [];
  const dropGeo = new THREE.SphereGeometry(0.06, 5, 4);
  const dropMat = new THREE.MeshBasicMaterial({ color: 0xdff6ff });
  const rippleGeo = new THREE.RingGeometry(0.85, 1, 28);
  rippleGeo.rotateX(-Math.PI / 2);
  function splashAt(x, z, n = 10) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(dropGeo, dropMat);
      m.position.set(x, 0.05, z);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 0.6 + Math.random() * 0.3, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 2), g: 9 });
    }
    const r = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
    r.position.set(x, 0.04, z);
    scene.add(r);
    fx.push({ obj: r, t: 0, life: 1.2, ripple: true });
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      if (f.ripple) {
        const k = f.t / f.life;
        f.obj.scale.setScalar(0.2 + k * 1.4);
        f.obj.material.opacity = 0.8 * (1 - k);
      } else {
        f.vel.y -= f.g * dt;
        f.obj.position.addScaledVector(f.vel, dt);
        if (f.spin) f.obj.rotation.x += f.spin * dt;
      }
      if (f.t >= f.life) {
        scene.remove(f.obj);
        if (f.ripple) f.obj.material.dispose();
        fx.splice(i, 1);
      }
    }
  }

  const targets = createTargets(scene, { splashAt, onAppear: (kind) => sfx.appear(kind) });
  const pond = createPond(scene);

  // ── ゲームの進行 ────────────────────────────────────
  let mode = 'idle';
  let picked = CHARACTERS[0].key;
  let game = null;
  let intro = 1;
  const INTRO_TIME = 2.4;

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
    for (const m of shotMeshes.values()) scene.remove(m);
    shotMeshes.clear();
    targets.clear();
    targets.setColor(PLAYER_COLORS[0].hex);
    for (const f of fx.splice(0)) scene.remove(f.obj);

    const state = createGame(players, seed);
    const runners = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      model.actions.idle.time = Math.random() * 2;
      const holder = new THREE.Group();
      holder.position.set(STAND[slot], 0.46, 0);
      holder.rotation.y = Math.PI; // 池のほう(-z)を向く
      holder.add(model.root);
      scene.add(holder);
      const def = CHARACTERS.find((c) => c.key === p.character);
      const size = def.size || 1;
      // 右手で右前に構えるぱちんこ(キャラから見て +z が前、+x が左)と、左足もとのかご。
      // カメラは右肩のうしろなので、ぱちんこを右に構えると、引いたゴムが肩の横に見える
      const sling = makeSling(pineGeo, pineMat);
      sling.group.position.set(-0.52 * size, 0.92 * size, 0.3 * size); // 大きな頭にかくれないよう、右へ外して
      sling.group.scale.setScalar(1.35);
      holder.add(sling.group);
      const basket = makeBasket(pineGeo, pineMat);
      basket.position.set(0.55, 0, 0.1);
      holder.add(basket);
      return { model, holder, size, sling, arms: [model.node('arm_L'), model.node('arm_R')], throwT: 0, pull: 0, yaw: 0, time: 0, stunT: 0 };
    }));
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    runners[0].holder.add(marker);
    runners[0].marker = marker;

    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), runners, acc: 0, endTimer: null, countdown: null };
    atmosphere.apply(params.get('time') || state.timeOfDay);
    atmosphere.setupShadows(runners.map((r) => r.holder), runners.map((r) => r.holder));
    aim.active = false;
    aim.pending = null;
    buildScores();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoM').classList.add('show');
    updateRunners(0);
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudM').hidden = m !== 'playing';
    document.body.classList.toggle('ingame', m !== 'idle');
    if (m !== 'playing') endAim();
    if (m === 'playing') startAmbience();
    if (m === 'idle') stopAmbience();
  }
  function leave(to) {
    endAim();
    onExit(to);
  }

  // ── 一時停止(ほかの競技と同じ画面。この会場にいるときだけ反応する) ────
  let paused = false;
  function setPaused(on) {
    if (mode === 'idle') { paused = false; return; }
    paused = on && mode === 'playing';
    $('pause').hidden = !paused;
    if (paused) { endAim(); if (amb) amb.water.g.gain.value = amb.wind.g.gain.value = 0; }
  }
  const mine = (fn) => () => { if (mode !== 'idle') fn(); };
  $('pauseBtnM').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: ひっぱって、はなす ─────────────────────────
  // power: 下へひっぱった長さ(画面の高さの 30% で最大)/ yaw: 左へひっぱると右へ飛ぶ
  const aim = { active: false, id: null, x0: 0, y0: 0, x: 0, y: 0, yaw: 0, power: 0, pending: null, pendingT: 0, key: false, keyYaw: 0 };
  function aimFrom(x, y) {
    const pull = Math.max(0, y - aim.y0) / (innerHeight * 0.3);
    return { yaw: Math.max(-1, Math.min(1, (aim.x0 - x) / (innerWidth * 0.45))) * RULES.yawMax, power: Math.min(1, pull) };
  }
  function endAim() {
    aim.active = false;
    aim.key = false;
    aim.id = null;
    $('bandM').classList.remove('on');
    for (const d of dots) d.visible = false;
    landRing.visible = false;
    stopCreak();
  }
  function release() {
    if (!aim.active) return;
    // 少しだけ引いてはなしたのは、やめたことにする
    if (aim.power > 0.06) {
      aim.pending = { yaw: aim.yaw, power: aim.power };
      aim.pendingT = 0.7;
    }
    endAim();
  }
  const canPress = (e) => mode === 'playing' && !paused && intro >= 1 && !e.target.closest('button, a');
  window.addEventListener('pointerdown', (e) => {
    if (!canPress(e) || aim.active) return;
    unlockAudio();
    Object.assign(aim, { active: true, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, yaw: 0, power: 0 });
    $('howtoM').classList.remove('show');
    startCreak();
  });
  window.addEventListener('pointermove', (e) => {
    if (!aim.active || e.pointerId !== aim.id) return;
    aim.x = e.clientX;
    aim.y = e.clientY;
    Object.assign(aim, aimFrom(e.clientX, e.clientY));
  });
  window.addEventListener('pointerup', (e) => { if (aim.active && e.pointerId === aim.id) release(); });
  window.addEventListener('pointercancel', (e) => { if (aim.active && e.pointerId === aim.id) endAim(); });
  // PC: ← → でねらい、スペース長押しで強さ
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (mode !== 'playing') return;
    if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!paused); return; }
    if (paused || intro < 1) return;
    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) { e.preventDefault(); keys.add(e.code); }
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      unlockAudio();
      if (!aim.active) { Object.assign(aim, { active: true, key: true, id: null, yaw: aim.keyYaw, power: 0 }); startCreak(); }
      $('howtoM').classList.remove('show');
    }
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'Space' && aim.key) release();
  });
  window.addEventListener('blur', () => { keys.clear(); endAim(); });
  function updateKeys(dt) {
    const dir = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
    aim.keyYaw = Math.max(-RULES.yawMax, Math.min(RULES.yawMax, aim.keyYaw + dir * dt * 0.7));
    if (aim.key) {
      aim.yaw = aim.keyYaw;
      aim.power = Math.min(1, aim.power + dt / 1.1);
    }
  }
  function myInput() {
    if (!aim.pending) return null;
    return { throw: aim.pending };
  }

  // ねらいの線: 風なしで飛ばしたときの道すじと、落ちるところの輪
  const tmp = new THREE.Vector3();
  function updateAim() {
    const on = aim.active && aim.power > 0.02;
    $('bandM').classList.toggle('on', aim.active && !aim.key);
    if (aim.active && !aim.key) {
      const line = $('bandLine');
      line.setAttribute('x1', aim.x0); line.setAttribute('y1', aim.y0);
      line.setAttribute('x2', aim.x); line.setAttribute('y2', aim.y);
      const k = $('bandKnob');
      k.setAttribute('cx', aim.x); k.setAttribute('cy', aim.y);
    }
    if (!on) { for (const d of dots) d.visible = false; landRing.visible = false; return; }
    const p = launch(aim);
    let t = 0, n = 0, next = 0;
    const ox = STAND[0];
    while (p.y > 0 && p.d < RULES.farD && t < 4) {
      fly(p, 0);
      t += STEP;
      if (t >= next && n < DOTS) {
        dots[n].position.set(ox + p.x, p.y, -p.d);
        dots[n].visible = true;
        n++;
        next += 0.07;
      }
    }
    for (let i = n; i < DOTS; i++) dots[i].visible = false;
    landRing.visible = true;
    landRing.position.set(ox + p.x, Math.max(0.04, p.y) + 0.02, -p.d);
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashM');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildScores() {
    $('scoresM').replaceChildren(...game.players.map((p, slot) => {
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
    $('timerM').firstChild.nodeValue = String(Math.ceil(left));
    const order = ranking(s);
    const chips = [...$('scoresM').children];
    order.forEach((slot, rank) => {
      const c = chips[slot];
      c.style.order = rank;
      const b = c.lastChild;
      if (b.textContent !== String(s.runners[slot].score)) {
        b.textContent = s.runners[slot].score;
        c.classList.remove('up');
        void c.offsetWidth;
        c.classList.add('up');
      }
      c.classList.toggle('stun', s.runners[slot].stun > 0);
    });
    // 風: 矢印の数と向き
    const w = s.wind;
    const n = Math.abs(w) < 0.15 ? 0 : Math.abs(w) < 0.6 ? 1 : Math.abs(w) < 1.05 ? 2 : 3;
    const el = $('windM');
    const txt = n === 0 ? 'なぎ' : (w > 0 ? '→'.repeat(n) : '←'.repeat(n));
    if (el.dataset.txt !== txt) { el.dataset.txt = txt; el.querySelector('b').textContent = txt; el.classList.toggle('calm', n === 0); }
    const me = s.runners[0];
    // のこり5秒: チクタク鳴って、時計が赤く脈打つ
    const secs = Math.ceil(left);
    $('timerM').classList.toggle('hurry', s.phase === 'play' && secs <= 5);
    if (s.phase === 'play' && secs <= 5 && secs !== game.lastTick) { game.lastTick = secs; sfx.tick(secs); }
    // れんぞく3つ以上: 画面のふちが金色に光る
    $('glowM').classList.toggle('on', me.combo >= 3);
    $('comboM').textContent = me.combo >= 2 ? `${me.combo}れんぞく${me.combo >= 6 ? ' +2' : me.combo >= 3 ? ' +1' : ''}` : '';
    $('comboM').classList.toggle('hot', me.combo >= 3);
  }
  function pop(text, pos, cls = '') {
    tmp.copy(pos).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmp.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmp.y) / 2) * 100}%`;
    $('popsM').append(el);
    setTimeout(() => el.remove(), 900);
  }

  // ── できごと ────────────────────────────────────────
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'start':
          splash('はじめ!');
          sfx.whistle();
          break;
        case 'throw': {
          const v = game.runners[e.slot];
          v.throwT = 0.35;
          v.yaw = e.aim.yaw;
          if (e.slot === 0) { sfx.throw(); aim.pending = null; }
          break;
        }
        case 'hit': {
          if (e.slot === 0) {
            const at = new THREE.Vector3(STAND[0] + e.x, e.y, -e.d);
            targets.hit(e.id, at);
            pop(`+${e.points + e.bonus}`, at.clone().setY(at.y + 0.6), e.kind === 'gold' ? 'gold me' : 'me');
            if (e.kind === 'gold') { sfx.gold(); splash('金の的!', 'gold'); } else sfx.hit(e.combo);
            if (e.combo === 3 || e.combo === 6) { splash(e.combo === 6 ? '6れんぞく! +2' : '3れんぞく! +1', 'gold'); sfx.combo(e.combo === 6); }
          } else {
            const v = game.runners[e.slot];
            pop(`+${e.points + e.bonus}`, tmp.copy(v.holder.position).setY(2.2));
          }
          break;
        }
        case 'sting': {
          const v = game.runners[e.slot];
          v.stunT = RULES.stun;
          if (e.slot === 0) {
            targets.hit(e.id, new THREE.Vector3(STAND[0] + e.x, e.y, -e.d));
            sfx.sting();
            splash(`ハチの巣! -${RULES.hivePenalty}`, 'red');
          } else pop(`-${RULES.hivePenalty}`, tmp.copy(v.holder.position).setY(2.2), 'red');
          break;
        }
        case 'miss':
          if (e.water) splashAt(STAND[e.slot] + e.x, -e.d, e.slot === 0 ? 12 : 6);
          if (e.slot === 0) (e.water ? sfx.splash(false) : sfx.thud());
          break;
        case 'wind':
          if (Math.abs(e.to) > 0.4) { splash(e.to > 0 ? 'かぜ →' : '← かぜ'); sfx.wind(); }
          break;
        case 'finished':
          splash('そこまで!');
          sfx.whistle();
          game.endTimer = 2.2;
          break;
      }
    }
  }

  function showResult() {
    const s = game.state;
    const order = ranking(s);
    const winner = game.players[s.winner];
    $('resultTitle').textContent = s.winner === 0 ? 'あなたの勝ち!' : `${winner.name}の勝ち!`;
    if (s.winner === 0) sfx.fanfare(); else sfx.finish();
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = game.players[slot];
      const r = s.runners[slot];
      const li = document.createElement('li');
      if (slot === 0) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : 'あなた';
      const def = CHARACTERS.find((c) => c.key === p.character);
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}</small></span><span class="dist">${r.score}てん<small>あてた ${r.hits}/${r.throws}・れんぞく ${r.best}</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateShots(dt) {
    const s = game.state;
    const live = new Set(s.shots);
    for (const p of s.shots) {
      let m = shotMeshes.get(p);
      if (!m) { m = new THREE.Mesh(pineGeo, pineMat); m.castShadow = true; scene.add(m); shotMeshes.set(p, m); }
      m.position.set(STAND[p.slot] + p.x, p.y, -p.d);
      m.rotation.x += dt * 14;
      m.rotation.z += dt * 5;
    }
    for (const [p, m] of shotMeshes) if (!live.has(p)) { scene.remove(m); shotMeshes.delete(p); }
  }
  function updateRunners(dt) {
    const s = game.state;
    s.runners.forEach((r, i) => {
      const v = game.runners[i];
      v.time += dt;
      v.throwT = Math.max(0, v.throwT - dt);
      v.stunT = Math.max(0, v.stunT - dt);
      let clip = 'idle', face = 'normal';
      if (s.phase === 'finished' || mode === 'result') { clip = ranking(s)[0] === i ? 'cheer' : 'wave'; face = ranking(s)[0] === i ? 'happy' : 'normal'; }
      else if (v.stunT > 0) { clip = 'dizzy'; face = 'surprised'; }
      v.model.play(clip);
      v.model.setFace(face);
      v.model.update(dt);
      // ぱちんこ: 自分はひっぱっている強さ。CPU は、投げる少し前から引いて構える(考えている間の最後の 0.45 秒)
      const cpu = game.cpus[i];
      const ready = s.phase === 'play' && r.reload <= 0 && r.stun <= 0;
      let pull = 0;
      if (i === 0) pull = aim.active ? aim.power : 0;
      else if (ready && cpu) pull = Math.max(0, Math.min(1, 1 - cpu.wait / 0.45)) * 0.75;
      if (i === 0 && aim.active) v.yaw = aim.yaw;
      v.pull += (pull - v.pull) * Math.min(1, dt * 16);
      // 体は ねらう向きへ少し回る
      v.holder.rotation.y += (Math.PI - v.yaw * 0.8 - v.holder.rotation.y) * Math.min(1, dt * 8);
      const loaded = r.reload <= 0.08 && r.stun <= 0 && s.phase !== 'finished';
      v.sling.group.visible = s.phase !== 'finished' && mode !== 'result';
      v.sling.update(dt, { pull: v.pull, yaw: v.yaw, loaded });
      v.model.root.rotation.x = -v.pull * 0.18; // 引くほど、うしろへそる
      const [armL, armR] = v.arms;
      if (s.phase !== 'finished' && mode !== 'result' && v.stunT <= 0) {
        // 右手: ぱちんこを右前へ構える
        armR?.rotation.set(-1.25 - v.pull * 0.1, 0, -0.6);
        if (armL) {
          if (v.throwT > 0.15) {
            // はなした直後: 左手は前へふりぬく
            armL.rotation.set(-1.9, 0, -0.15);
          } else if (!loaded) {
            // 次のまつぼっくりを、左足もとのかごから取る
            armL.rotation.set(-0.35, 0, 0.75);
          } else {
            // 袋をつまんで(体の前を右へ)、引くほどうしろへ
            armL.rotation.set(-1.3 + v.pull * 0.9, 0, -0.75 - v.pull * 0.2);
          }
        }
      }
      if (v.marker) v.marker.position.set(0, 2.1 * v.size + 0.08 * Math.sin(performance.now() / 180), 0);
    });
  }

  let freeCamera = false;
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    // 自分の右肩のうしろ・上から、池の向こうを見る(自分は左下に小さく。まん中は的のためにあける)
    const pos = new THREE.Vector3(STAND[0] + 0.9, portrait ? 4.3 : 3.4, portrait ? 5.4 : 4.6);
    const look = new THREE.Vector3(STAND[0] + 0.2, portrait ? 1.0 : 1.4, -12);
    camera.fov = portrait ? 58 : 46;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      // 空から: 池の上の高いところから、桟橋のうしろへ降りてくる
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(10, 24, -26);
      camera.position.lerpVectors(sky, pos, e);
      camera.userData.look = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 0, -8), look, Math.min(1, e * 1.1));
      camera.lookAt(camera.userData.look);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    camera.position.lerp(pos, k);
    camera.userData.look = camera.userData.look ? camera.userData.look.lerp(look, k) : look.clone();
    camera.lookAt(camera.userData.look);
  }

  // ── 画質(ほかの競技と同じ考え方) ──────────────────────
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
  function frame(rawDt, draw = true) {
    const dt = Math.min(rawDt, 0.1);
    if (draw && mode === 'playing' && intro >= 1) watchQuality(rawDt);
    if (intro < 1 && !paused) intro = Math.min(1, intro + dt / INTRO_TIME);
    if (game && mode === 'playing' && !paused && intro >= 1) {
      const s = game.state;
      if (s.phase === 'ready') {
        const n = Math.ceil(RULES.readyTime - s.t);
        if (n !== game.countdown && n > 0) {
          game.countdown = n;
          splash(String(n));
          sfx.beep(false);
        }
      }
      updateKeys(dt);
      if (aim.pending && (aim.pendingT -= dt) <= 0) aim.pending = null;
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
    if (game && mode === 'playing') { renderHud(); updateAim(); if (aim.active) updateCreak(aim.power, dt); }
    if (game && !paused) updateAmbience(dt, game.state.wind, performance.now() / 1000);
    if (game && !paused) {
      updateRunners(dt);
      targets.sync(game.state, game.state.runners[0], STAND[0], camera, dt);
      updateShots(dt);
      updateFx(dt);
    }
    if (!paused) pond.update(dt, game ? game.state.wind : 0, splashAt);
    atmosphere.update(dt);
    updateCamera(dt);
    if (draw) renderer.render(scene, camera);
  }

  // E2E 用の口
  window.dmato = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    get aim() { return aim; },
    start: (key = picked) => { picked = key; return startGame(); },
    camera, renderer, scene,
    freeCamera: (on) => { freeCamera = on; },
    setTime: (key) => atmosphere.apply(key),
    tick: (sec) => { for (let i = 0; i < sec * 60; i++) frame(1 / 60, false); },
    // 描かずに、みんな CPU で sec 秒すすめる(途中の場面を撮る用)
    advance: (sec) => {
      const me = createCpu('normal', 1, 0);
      for (let i = 0; i < sec / STEP && game.state.phase !== 'finished'; i++) {
        onEvents(step(game.state, game.players.map((p, slot) => cpuInput(slot ? game.cpus[slot] : me, game.state, slot))));
      }
    },
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
      keys.clear();
    },
    get intro() { return intro; },
  };
}
