// いかだレース の画面(ひとり + CPU)。
//
// ルールは rules.js、川は course.js、CPU は cpu.js、会場は stage.js。
// ここは「たたいたのを集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
//
// 動かし方: 画面の左半分・右半分を こうごに たたいて こぐ。本物の舟と同じく、右をこぐと左へ、左をこぐと右へ向く。
// パソコンは ← → / A D。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonGradient, toonMaterial } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { RULES, STEP, createGame, ranking, step } from './rules.js';
import { FALLS, LENGTH, LOGS, LOG_R, TUNNEL, WHIRLS, currentAt, logX } from './course.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { SEATS, buildStage, coursePoint, courseHeading, seatPoint } from './stage.js';
import { PADDLE_TIP, makePaddle, makeRaft, wakeTexture } from './raft.js';
import { createAtmosphere } from '../daruma/atmosphere.js';
import { buildScenery } from './scenery.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);

export async function createIkada({ renderer, settings, getAudio, onExit }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);
  const atmosphere = createAtmosphere(scene, renderer, camera, { course: false });
  const stage = buildStage(scene);
  const scenery = buildScenery(scene);

  // ── 音 ──────────────────────────────────────────
  let audio = null;
  const unlockAudio = () => { audio = settings.sound ? getAudio() : null; };
  function voice({ type = 'sine', pts, len, gain = 0.1, at = 0 }) {
    if (!audio || gain <= 0) return;
    const t = audio.currentTime + at;
    const o = audio.createOscillator(), g = audio.createGain();
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
  let noiseBuf = null;
  function noise() {
    if (!noiseBuf) {
      noiseBuf = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  function hiss({ type = 'bandpass', f0, f1 = f0, q = 1, len, gain = 0.1, at = 0, attack = 0.005 }) {
    if (!audio) return;
    const t = audio.currentTime + at;
    const src = audio.createBufferSource();
    src.buffer = noise();
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
    src.start(t, Math.random());
    src.stop(t + len + 0.05);
  }
  const sfx = {
    // かいが水をかく: ちゃぷ(左右で少し高さを変える)
    paddle: (side, k = 1) => { hiss({ f0: side < 0 ? 900 : 1100, f1: 500, q: 1.5, len: 0.16, gain: 0.07 * k }); voice({ type: 'sine', pts: [[0, side < 0 ? 330 : 370], [0.08, 220]], len: 0.1, gain: 0.03 * k }); },
    crash: () => { voice({ type: 'triangle', pts: [[0, 160], [0.15, 70]], len: 0.25, gain: 0.16 }); hiss({ type: 'lowpass', f0: 1400, f1: 300, len: 0.4, gain: 0.1 }); },
    bump: () => [0, 0.06].forEach((at) => voice({ type: 'square', pts: [[0, 420], [0.05, 260]], len: 0.07, gain: 0.05, at })),
    whirl: () => hiss({ f0: 300, f1: 1200, q: 3, len: 0.9, gain: 0.06, attack: 0.2 }),
    fall: () => hiss({ f0: 2400, f1: 600, q: 1, len: 0.5, gain: 0.06, attack: 0.05 }),
    splash: () => { hiss({ type: 'lowpass', f0: 3000, f1: 400, len: 0.7, gain: 0.14 }); voice({ type: 'sine', pts: [[0, 140], [0.2, 60]], len: 0.3, gain: 0.1 }); },
    beep: (hi) => voice({ type: 'square', pts: [[0, hi ? 1046 : 523]], len: hi ? 0.4 : 0.15, gain: 0.06 }),
    fanfare: () => [784, 988, 1175, 1568].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.3 + i * 0.1, gain: 0.1, at: i * 0.13 })),
    finish: () => [659, 784].forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.35, gain: 0.07, at: i * 0.16 })),
    cheer: (g = 0.05) => { for (let i = 0; i < 5; i++) hiss({ f0: 700 + i * 180, f1: 900 + i * 150, q: 4, len: 1.3, gain: g, at: i * 0.05, attack: 0.15 }); },
  };
  // 川の音: ずっと流れている(急流で大きく)
  let river = null;
  function startRiver() {
    if (!audio || river) return;
    const src = audio.createBufferSource();
    src.buffer = noise();
    src.loop = true;
    const f = audio.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    const g = audio.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(audio.destination);
    src.start();
    river = { src, f, g };
  }
  function stopRiver() {
    if (!river) return;
    try { river.src.stop(); } catch { /* もう止まっている */ }
    river = null;
  }

  // ── 読みこみ: 観客と審判の先生(ゴールの門の上) ─────────────
  await preload([...CHARACTERS.map((c) => c.key), 'hoho', ...new Set(SEATS.map((s) => s.kind))]);
  const owl = await createModel('hoho');
  owl.root.position.copy(coursePoint(LENGTH, -2.2, 4.4));
  owl.root.rotation.y = courseHeading(LENGTH).yaw + Math.PI;
  owl.play('idle');
  scene.add(owl.root);
  const audience = await Promise.all(SEATS.map(async (seat) => {
    const m = await createModel(seat.kind);
    seatPoint(seat, m.root.position);
    const c = coursePoint(seat.s - 4, 0);
    m.root.rotation.y = Math.atan2(c.x - m.root.position.x, c.z - m.root.position.z);
    m.play('idle');
    m.actions.idle.time = Math.random() * 2;
    scene.add(m.root);
    return { seat, model: m, until: 0 };
  }));
  atmosphere.setupShadows([stage.group, owl.root], [stage.group]);

  // ── 流木(動く) ──────────────────────────────────────
  const logMat = toonMaterial(0x7a5434);
  const logs = LOGS.map((lg) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(LOG_R, LOG_R * 1.1, lg.len, 9), logMat);
    body.rotation.z = Math.PI / 2;
    g.add(body);
    for (const sd of [-1, 1]) {
      const end = new THREE.Mesh(new THREE.CircleGeometry(LOG_R * 0.95, 10), toonMaterial(0xd8b07a));
      end.position.x = sd * lg.len / 2 + sd * 0.01;
      end.rotation.y = sd * Math.PI / 2;
      g.add(end);
    }
    const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.8, 5), logMat);
    twig.position.set(0.3, 0.3, 0);
    twig.rotation.z = -0.7;
    g.add(twig);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    return { lg, g };
  });

  // ── うずのあわ: 白いつぶが らせんに まわりながら、まん中へ吸いこまれる ─────────
  const FOAM_N = 36;
  const foam = WHIRLS.map((w, wi) => {
    const m = new THREE.InstancedMesh(new THREE.CircleGeometry(0.09, 8), new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.85, depthWrite: false }), FOAM_N);
    m.frustumCulled = false;
    scene.add(m);
    const bits = Array.from({ length: FOAM_N }, (_, k) => ({ a: (k / FOAM_N) * Math.PI * 6, r: w.R * (0.25 + (k % 12) / 12 * 0.75), sz: 0.6 + (k % 5) * 0.2 }));
    return { w, m, bits, center: coursePoint(w.s, w.x, 0.05), spin: 1 };
  });
  const foamDummy = new THREE.Object3D();
  function updateFoam(dt) {
    const s = game?.state;
    foam.forEach((f, wi) => {
      // だれかが入っていると、はげしく回る
      const busy = s && s.runners.some((r) => r.whirl === wi);
      f.spin += ((busy ? 2.2 : 1) - f.spin) * Math.min(1, dt * 2);
      stage.whirls[wi].rotation.z += dt * 1.6 * f.spin;
      f.bits.forEach((b, k) => {
        b.a += dt * (1.2 + (f.w.R - b.r) * 0.9) * f.spin;
        b.r -= dt * 0.35 * f.spin;
        if (b.r < 0.2) b.r = f.w.R * (0.85 + (k % 3) * 0.05);
        foamDummy.position.set(f.center.x + Math.cos(b.a) * b.r, f.center.y - (1 - b.r / f.w.R) * 0.02, f.center.z + Math.sin(b.a) * b.r);
        foamDummy.rotation.set(-Math.PI / 2, 0, 0);
        foamDummy.scale.setScalar(b.sz * Math.min(1, b.r / 0.6));
        foamDummy.updateMatrix();
        f.m.setMatrixAt(k, foamDummy.matrix);
      });
      f.m.instanceMatrix.needsUpdate = true;
    });
  }

  // ── しぶき(水のつぶ) ──────────────────────────────────
  const dropGeo = new THREE.SphereGeometry(0.06, 6, 4);
  const dropMat = new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.9 });
  const drops = [];
  function spray(pos, n, power = 2, up = 1) {
    for (let i = 0; i < n; i++) {
      let d = drops.find((x) => !x.m.visible);
      if (!d) {
        if (drops.length > 160) break;
        d = { m: new THREE.Mesh(dropGeo, dropMat), v: new THREE.Vector3(), t: 0 };
        scene.add(d.m);
        drops.push(d);
      }
      d.m.visible = true;
      d.m.position.copy(pos);
      const a = Math.random() * Math.PI * 2;
      d.v.set(Math.cos(a) * power * (0.3 + Math.random() * 0.7), (1.5 + Math.random() * 2) * up, Math.sin(a) * power * (0.3 + Math.random() * 0.7));
      d.t = 0;
      d.m.scale.setScalar(0.7 + Math.random() * 0.9);
    }
  }
  function updateDrops(dt) {
    for (const d of drops) {
      if (!d.m.visible) continue;
      d.t += dt;
      d.v.y -= 9 * dt;
      d.m.position.addScaledVector(d.v, dt);
      if (d.t > 0.9) d.m.visible = false;
    }
  }

  // ── 波紋(かいが水に入ったところ・いかだのまわり) ─────────────────
  const rippleTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 14, 32, 32, 31);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const ripples = Array.from({ length: 40 }, () => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: rippleTex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    scene.add(m);
    return { m, t: 1, size: 1 };
  });
  let rippleNext = 0;
  function ripple(pos, size = 1) {
    const r = ripples[rippleNext++ % ripples.length];
    r.m.position.copy(pos);
    r.t = 0;
    r.size = size;
    r.m.visible = true;
  }
  function updateRipples(dt) {
    for (const r of ripples) {
      if (!r.m.visible) continue;
      r.t += dt / 0.8;
      const k = 0.3 + r.t * 1.2;
      r.m.scale.set(k * r.size, k * r.size, 1);
      r.m.material.opacity = 0.55 * (1 - r.t);
      if (r.t >= 1) r.m.visible = false;
    }
  }

  // ── ゲームの進行 ────────────────────────────────────
  let mode = 'idle';
  let picked = CHARACTERS[0].key;
  let tour = null;
  let game = null;
  let intro = 1;
  const INTRO_TIME = 2.6;
  let owlCheer = 0;

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS });
    if (game) for (const r of game.runners) scene.remove(r.holder);
    const state = createGame(players, seed);
    const runners = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const holder = new THREE.Group();
      const body = new THREE.Group(); // かたむける・ゆれる
      holder.add(body);
      const raft = makeRaft(PLAYER_COLORS[slot].hex, slot + 1);
      body.add(raft.g);
      const seat = new THREE.Group();
      seat.position.set(0, 0.2, 0.0);
      body.add(seat);
      seat.add(model.root);
      // かいは、むねの前で両手で持つ(左右にかたむけて、はしを水に入れる)
      const paddle = makePaddle(PLAYER_COLORS[slot].hex);
      paddle.rotation.order = 'YZX';
      seat.add(paddle);
      // 引き波(いかだのうしろ)
      const wake = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4.2), new THREE.MeshBasicMaterial({ map: wakeTexture(), transparent: true, depthWrite: false, opacity: 0 }));
      wake.rotation.x = -Math.PI / 2;
      wake.position.set(0, 0.0, -2.75);
      holder.add(wake);
      const def = CHARACTERS.find((c) => c.key === p.character);
      scene.add(holder);
      const node = (n) => model.node(n);
      return {
        model, holder, body, raft, seat, paddle, wake, size: def.size || 1, time: Math.random() * 10, dur: 0.28, lean: 0,
        strokeT: 9, strokeSide: 1, spinDir: 1, air: 0, lastSpin: 0, planted: true,
        arms: [node('arm_L'), node('arm_R')], legs: [node('leg_L'), node('leg_R')], head: node('head'),
      };
    }));
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    runners[0].holder.add(marker);
    runners[0].marker = marker;
    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), runners, acc: 0, endTimer: null, countdown: null };
    atmosphere.apply(params.get('time') || 'morning');
    // 朝もや: ふつうの朝より霧を近く
    scene.fog.near = 22;
    scene.fog.far = 150;
    atmosphere.sun.target.position.copy(coursePoint(LENGTH / 2, 0));
    atmosphere.setupShadows(runners.map((r) => r.holder), runners.map((r) => r.holder));
    taps.length = 0;
    $('comboK').textContent = '0';
    $('powK').style.width = '0%';
    buildBoard();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoK').classList.add('show');
    updateRunners(0);
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudK').hidden = m !== 'playing';
    document.body.classList.toggle('ingame', m !== 'idle');
    if (m !== 'playing') stopRiver();
  }
  function leave(to) {
    taps.length = 0;
    onExit(to);
  }

  // ── 一時停止 ────────────────────────────────────────
  let paused = false;
  function setPaused(on) {
    if (mode === 'idle') { paused = false; return; }
    paused = on && mode === 'playing';
    $('pause').hidden = !paused;
    if (paused) taps.length = 0;
    if (river) river.g.gain.value = 0;
  }
  const mine = (fn) => () => { if (mode !== 'idle') fn(); };
  $('pauseBtnK').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: 画面の左右をたたく(1回ずつ数える) ──────────────────
  const taps = [];
  const canPress = (e) => mode === 'playing' && !paused && intro >= 1 && !e.target.closest('button, a');
  function tap(side) {
    unlockAudio();
    startRiver();
    taps.push(side);
    const pad = $(side === 'left' ? 'padLK' : 'padRK');
    pad.classList.remove('hit');
    void pad.offsetWidth;
    pad.classList.add('hit');
    $('howtoK').classList.remove('show');
  }
  window.addEventListener('pointerdown', (e) => {
    if (!canPress(e)) return;
    tap(e.clientX < innerWidth / 2 ? 'left' : 'right');
  });
  const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  window.addEventListener('keydown', (e) => {
    if (mode !== 'playing') return;
    if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!paused); return; }
    if (KEYS[e.code]) {
      e.preventDefault();
      if (e.repeat || paused || intro < 1) return; // 押しっぱなしは数えない
      tap(KEYS[e.code]);
    }
  });
  // 1ステップに、たまったタップを全部わたす(左右いっしょなら、まっすぐ1かき)
  function myInput() {
    if (!taps.length) return null;
    const out = { left: taps.includes('left'), right: taps.includes('right') };
    taps.length = 0;
    return out;
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashK');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildBoard() {
    $('trackK').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'dot' + (slot === 0 ? ' me' : '');
      d.style.background = css(PLAYER_COLORS[slot].hex);
      return d;
    }));
  }
  // 3D の場所に、文字をぽんと出す(ガツン!・ドン!)
  const popV = new THREE.Vector3();
  function pop(text, pos, cls = '') {
    popV.copy(pos).project(camera);
    if (popV.z > 1) return; // カメラのうしろ
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((popV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - popV.y) / 2) * 100}%`;
    $('popsK').append(el);
    setTimeout(() => el.remove(), 900);
  }
  const near = (v, d = 16) => v.holder.position.distanceTo(camera.position) < d;

  // こぐリズム: 左右のランプ・こうごの数・ひとかきの強さ。コツを ことばで教える
  function rhythm(e) {
    const g = game;
    const now = g.state.t;
    const alt = e.alt && now - (g.lastStroke ?? -9) < 0.9;
    g.combo = alt ? (g.combo || 0) + 1 : 1;
    g.lastStroke = now;
    const lamp = $(e.side < 0 ? 'lampLK' : 'lampRK');
    lamp.classList.remove('on');
    void lamp.offsetWidth;
    lamp.classList.add('on');
    const c = $('comboK');
    c.textContent = g.combo;
    c.parentElement.classList.toggle('hot', g.combo >= 10);
    const pw = $('powK');
    pw.style.width = `${Math.round(e.power * 100)}%`;
    pw.className = e.power >= 0.75 ? 'good' : e.power >= 0.45 ? 'ok' : 'weak';
    // ことば(同じものは続けて出さない)
    g.fast = e.power < 0.45 && e.alt ? (g.fast || 0) + 1 : 0;
    let tip = null;
    if (!e.alt && e.side !== 0) tip = ['おなじがわ! こうごに', 'warn'];
    else if (g.fast >= 3) { tip = ['はやすぎ! ぐいっと', 'warn']; g.fast = 0; }
    else if (g.combo > 0 && g.combo % 10 === 0) tip = [`いいリズム! ${g.combo}`, 'good'];
    if (tip && (tip[0] !== g.lastTip || now - (g.tipAt ?? -9) > 2.5)) showTip(...tip);
  }
  function showTip(text, cls) {
    const el = $('tipK');
    el.textContent = text;
    el.className = 'rtip ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
    game.lastTip = text;
    game.tipAt = game.state.t;
  }
  function renderHud() {
    const s = game.state;
    const rank = ranking(s).indexOf(0);
    const el = $('rankK');
    if (el.dataset.rank !== String(rank)) {
      el.dataset.rank = String(rank);
      el.innerHTML = `${rank + 1}<small>位</small>`;
      el.classList.remove('up');
      void el.offsetWidth;
      el.classList.add('up');
    }
    const me = s.runners[0];
    $('timeK').textContent = (me.finish ?? Math.max(0, s.t - RULES.readyTime)).toFixed(1);
    const dots = $('trackK').children;
    s.runners.forEach((r, i) => {
      dots[i].style.bottom = `calc(8px + (100% - 16px) * ${Math.min(1, Math.max(0, r.s / LENGTH)).toFixed(4)})`;
    });
    $('sprayK').classList.toggle('on', game.sprayT > 0);
  }

  // ── できごと ────────────────────────────────────────
  const tmp = new THREE.Vector3();
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'start':
          splash('スタート!');
          sfx.beep(true);
          owl.play('flap', { fade: 0.1 });
          break;
        case 'stroke': {
          const v = game.runners[e.slot];
          // ひとかきの長さは、前のかきからの間に合わせる(速くこぐと、動きも速く)
          v.dur = Math.max(0.17, Math.min(0.34, v.strokeT * 0.95));
          v.strokeT = 0;
          v.planted = false;
          v.strokeSide = e.side || (v.strokeSide > 0 ? -1 : 1);
          if (e.slot === 0) { sfx.paddle(v.strokeSide); rhythm(e); }
          else if (Math.random() < 0.15) sfx.paddle(v.strokeSide, 0.35);
          break;
        }
        case 'crash': {
          const v = game.runners[e.slot];
          v.spinDir = Math.sign(s.runners[e.slot].yawV) || 1;
          // ぶつかったところ(いかだと岩のあいだ)に、しぶきと波紋。いかだは大きくゆれる
          const hitAt = coursePoint(e.s, e.x, 0.25).lerp(v.holder.position, 0.5);
          hitAt.y = v.holder.position.y + 0.3;
          spray(hitAt, e.slot === 0 ? 22 : 12, 2.8, 1.2);
          ripple(tmp.copy(hitAt).setY(v.holder.position.y), 2.2);
          v.roll = (v.roll || 0) + v.spinDir * 0.35;
          v.pitch = -0.2;
          if (e.slot === 0 || near(v, 12)) pop(e.kind === 'log' ? 'ゴツン!' : 'ガツン!', tmp.copy(hitAt).setY(hitAt.y + 0.8), 'bang');
          if (e.slot === 0) { sfx.crash(); game.shake = 0.4; }
          break;
        }
        case 'bump':
        {
          const A = game.runners[e.a], B = game.runners[e.b];
          const mid = tmp.copy(A.holder.position).lerp(B.holder.position, 0.5);
          mid.y = A.holder.position.y + 0.25;
          spray(mid, 6 + Math.round(e.hard * 3), 1.6);
          ripple(mid.clone().setY(A.holder.position.y), 1.4);
          // 当てられたがわへ ぐらっと(横の向きで、反対に)
          const side = Math.sign(s.runners[e.b].x - s.runners[e.a].x) || 1;
          A.roll = (A.roll || 0) - side * 0.18 * Math.min(2, e.hard);
          B.roll = (B.roll || 0) + side * 0.3 * Math.min(2, e.hard);
          A.surprise = B.surprise = 0.6;
          if (e.a === 0 || e.b === 0 || near(A, 10)) pop('ドン!', mid.clone().setY(mid.y + 0.9), 'don');
          if (e.a === 0 || e.b === 0) { sfx.bump(); game.shake = 0.2 + Math.min(0.2, e.hard * 0.08); }
        }
          break;
        case 'whirlIn':
          if (e.slot === 0) { sfx.whirl(); splash('うずだ!', 'red'); showTip('れんだで ぬけだせ!', 'warn'); }
          break;
        case 'whirlOut':
          if (e.slot === 0) showTip('ぬけた!', 'good');
          break;
        case 'fall':
          if (e.slot === 0) { sfx.fall(); }
          break;
        case 'splash': {
          const v = game.runners[e.slot];
          spray(tmp.copy(v.holder.position).setY(v.holder.position.y + 0.2), 22, 3, 1.4);
          if (e.slot === 0) { sfx.splash(); splash('ざぶーん!', 'gold'); game.sprayT = 1.2; game.shake = 0.3; }
          break;
        }
        case 'goal': {
          const v = game.runners[e.slot];
          if (e.slot === 0) {
            const rank = ranking(s).indexOf(0);
            splash(`ゴール! ${rank + 1}位`, rank === 0 ? 'gold' : '');
            sfx.fanfare();
          }
          for (const a of audience) { a.model.play('cheer'); a.model.setFace('happy'); a.until = 2; }
          sfx.cheer(e.slot === 0 ? 0.07 : 0.035);
          spray(tmp.copy(v.holder.position).setY(v.holder.position.y + 0.5), 10, 2);
          owl.play('cheer');
          owlCheer = 2.5;
          break;
        }
        case 'finished':
          game.endTimer = 2.4;
          break;
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
    if (s.winner === 0) sfx.fanfare(); else sfx.finish();
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = game.players[slot];
      const r = s.runners[slot];
      const li = document.createElement('li');
      if (slot === 0) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : 'あなた';
      const def = CHARACTERS.find((c) => c.key === p.character);
      const time = r.finish !== null ? `${r.finish.toFixed(1)}びょう` : `のこり ${Math.max(0, LENGTH - r.s).toFixed(0)}m`;
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}</small></span><span class="dist">${time}<small>ぶつかった ${r.crashes}かい</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  // いかだの上に座って、カヤックのかいを両手で持つ。ひとかき: はしを前で水に入れて(plant)→ うしろへかいて(pull)→ 上げる(exit)。
  // 左をこぐときは、キャラの左(+x)のはしを下げる。体も、こぐがわへ ひねって 前後にゆれる
  const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
  function rowPose(v, dt) {
    const sd = v.strokeSide; // -1 左 / 1 右
    const k = v.strokeT / v.dur;
    let tilt, sweep, lean;
    // tilt 0.9 で、はしが水面の下まで とどく(かいのまん中は いかだから 0.7m ほど上)
    if (k < 0.15) { const t = k / 0.15; tilt = lerp(0.3, 0.92, t); sweep = sd * 0.6; lean = lerp(0, 0.18, t); }
    else if (k < 0.75) { const t = (k - 0.15) / 0.6; tilt = 0.92; sweep = lerp(sd * 0.6, -sd * 0.5, t * t * (3 - 2 * t)); lean = lerp(0.18, -0.06, t); }
    else if (k < 1) { const t = (k - 0.75) / 0.25; tilt = lerp(0.92, 0.25, t); sweep = lerp(-sd * 0.5, -sd * 0.2, t); lean = lerp(-0.06, 0, t); }
    else { tilt = 0.12; sweep = 0; lean = 0; }
    // 休むときは ゆっくり もとへ(ひとかきの中は すぐに)
    const a = k < 1 ? 1 : 1 - Math.exp(-dt * 5);
    v.pt = lerp(v.pt ?? 0, sd * tilt, a);
    v.ps = lerp(v.ps ?? 0, sweep, a);
    v.lean = lerp(v.lean, lean, a);
    v.paddle.position.set(0, 0.45 * v.size, 0.42 * v.size);
    v.paddle.rotation.set(0, v.ps, v.pt);
    // 体: こぐがわへ ひねる・前へ かがむ
    v.model.root.rotation.set(v.lean, v.ps * 0.45, 0);
    const mix = (node, x, y, z) => { if (node) node.rotation.set(x, y, z); };
    v.legs.forEach((leg, j) => mix(leg, -1.35, 0, (j === 0 ? 1 : -1) * 0.2));
    v.arms.forEach((arm, j) => {
      const s2 = j === 0 ? 1 : -1; // L はキャラの左(+x)
      // 両手で かいをにぎる。かいの下がっているがわの手は下へ、上がっているがわは上へ
      const down = -v.pt * s2; // + でこの腕のがわが下がっている(左をこぐと pt < 0、L(+x)が下がる)
      mix(arm, -1.15 + down * 0.5, 0, s2 * (0.15 + v.ps * s2 * 0.3));
    });
    if (v.head) v.head.rotation.set(0.05 - v.lean * 0.5, -v.ps * 0.25, 0);
  }
  function updateRunners(dt) {
    const s = game.state;
    s.runners.forEach((r, i) => {
      const v = game.runners[i];
      v.time += dt;
      v.strokeT += dt;
      v.whirlT = r.whirl >= 0 ? (v.whirlT || 0) + dt : 0;
      // 滝: 落ちるあいだ、少し浮いて前へ傾く
      v.air += ((r.air > 0 ? 1 : 0) - v.air) * (1 - Math.exp(-dt * 14));
      const hop = r.air > 0 ? Math.sin((1 - r.air / RULES.fallTime) * Math.PI) * 0.5 : 0;
      const bob = Math.sin(v.time * 2.2 + i) * 0.04 + Math.sin(v.time * 3.7 + i * 2) * 0.02;
      coursePoint(r.s, r.x, 0.06 + bob + hop, v.holder.position);
      const head = courseHeading(r.s);
      // ぶつかったら くるっと1回転
      const spin = r.spin > 0 ? (1 - r.spin / RULES.spinTime) * Math.PI * 2 * v.spinDir : 0;
      v.holder.rotation.set(0, head.yaw - r.yaw + spin, 0);
      // ゆれ: ぶつかった・当てられたときの ぐらっ(ばねのように もどる)、うずの中は まん中へ かたむく
      v.roll = (v.roll || 0) * Math.exp(-dt * 3);
      v.pitch = (v.pitch || 0) * Math.exp(-dt * 4);
      v.surprise = Math.max(0, (v.surprise || 0) - dt);
      const wob = Math.sin(v.time * 14) * v.roll;
      v.body.rotation.set(head.slope * 0.8 - v.air * 0.25 + v.pitch + Math.sin(v.time * 1.9 + i) * 0.03, 0, Math.sin(v.time * 2.4 + i) * 0.04 + wob + (r.whirl >= 0 ? 0.14 : 0));
      // 旗がゆれる
      v.raft.flag.rotation.y = Math.PI / 2 + Math.sin(v.time * 6 + i) * 0.25;
      let clip = 'idle', face = 'normal';
      if (r.finish !== null) { clip = ranking(s)[0] === i ? 'cheer' : 'wave'; face = 'happy'; }
      else if (r.spin > 0) { clip = 'dizzy'; face = 'surprised'; }
      else if (r.whirl >= 0) { clip = r.whirl >= 0 && v.whirlT > 1.2 ? 'dizzy' : 'idle'; face = 'surprised'; }
      else if (v.surprise > 0) face = 'surprised';
      else if (r.air > 0) face = 'happy';
      v.model.play(clip);
      v.model.setFace(face);
      v.model.update(dt);
      v.model.root.position.y = -0.05 * v.size;
      if (r.finish === null) rowPose(v, dt);
      else { v.paddle.rotation.set(0, 0, 0.5); v.paddle.position.set(0, 1.2 * v.size, 0.2); v.model.root.rotation.set(0, 0, 0); }
      // かいが水に入るとき(ひとかきの はじめ)、しぶきと波紋。水からぬくときも少し
      const k = v.strokeT / v.dur;
      if (v.planted === false && k >= 0.12 && k < 1) {
        v.planted = true;
        v.paddle.updateMatrixWorld(true);
        const tip = v.paddle.localToWorld(tmp.set(-v.strokeSide * PADDLE_TIP, 0, 0));
        const wy = coursePoint(r.s, r.x, 0).y;
        tip.y = wy + 0.05;
        if (i === 0 || v.holder.position.distanceTo(camera.position) < 12) ripple(tip, 0.9);
        if (i === 0 || v.holder.position.distanceTo(camera.position) < 14) spray(tip, i === 0 ? 5 : 2, 0.8, 0.7);
      }
      // 引き波: 進む速さで こく、長く
      const sp = Math.max(0, r.v) + (r.finish === null ? 0.5 : 0);
      v.wake.material.opacity = Math.min(0.75, sp * 0.13) * (r.air > 0 ? 0 : 1);
      v.wake.scale.set(1, 0.6 + Math.min(0.6, sp * 0.1), 1);
      v.wake.position.z = -1.0 - 2.1 * v.wake.scale.y + 0.4;
      // うずの中・急流では、まわりに白いしぶき
      if ((r.whirl >= 0 || currentAt(r.s) > 3.5) && Math.random() < dt * 8) spray(tmp.copy(v.holder.position).setY(v.holder.position.y + 0.1), 1, 1.2, 0.6);
      if (v.marker) v.marker.position.set(0, 2.2 * v.size + 0.08 * Math.sin(performance.now() / 180), 0);
    });
    // 流木
    for (const { lg, g } of logs) {
      coursePoint(lg.s, logX(lg, s.t), 0.08, g.position);
      g.rotation.y = courseHeading(lg.s).yaw + Math.PI / 2;
      g.rotation.x = Math.sin(s.t * 1.3 + lg.s) * 0.08;
    }
    // 川の音: 自分のいるところの流れの速さで
    if (river) {
      const me = s.runners[0];
      const u = currentAt(me.s);
      river.g.gain.value += ((paused ? 0 : 0.035 + (u - 2.2) * 0.02) - river.g.gain.value) * Math.min(1, dt * 3);
      river.f.frequency.value = 500 + u * 150;
    }
  }

  let freeCamera = false;
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const me = game ? game.state.runners[0] : { s: 0, x: 0, air: 0 };
    let pos, look;
    if (game && (game.state.phase === 'finished' || mode === 'result')) {
      const w = game.state.runners[game.state.winner];
      pos = coursePoint(Math.min(w.s, LENGTH + 18) + 6, w.x * 0.5, 2.4);
      look = coursePoint(Math.min(w.s, LENGTH + 18), w.x, 0.8);
    } else {
      // うしろから追いかける。木の根のトンネルの中は低く
      const inTunnel = me.s > TUNNEL.from - 6 && me.s < TUNNEL.to + 2;
      const tun = camera.userData.tun = (camera.userData.tun ?? 0) + ((inTunnel ? 1 : 0) - (camera.userData.tun ?? 0)) * Math.min(1, dt * 2);
      // 滝: 落ち口に近づくと、カメラは高く上がって 下の滝つぼを見下ろす。落ちるあいだは 上に残って見送り、落ちたら追いつく
      const f = FALLS.find((q) => me.s > q.s - 9 && me.s < q.s + 6);
      const fk = f ? (me.s < f.s ? Math.min(1, (me.s - (f.s - 9)) / 5) : Math.max(0, 1 - (me.s - f.s) / 6)) : 0;
      const fall = camera.userData.fall = (camera.userData.fall ?? 0) + (fk - (camera.userData.fall ?? 0)) * Math.min(1, dt * 3);
      const back = (portrait ? 6.2 : 5.2) - tun * 1.2 + fall * 1.2, up = (portrait ? 3.4 : 2.6) - tun * 1.4 + fall * 1.6;
      // 落ちたあとは、カメラの道のりを少し おくらせる(上から見送る)
      const camS = f && me.s > f.s ? Math.max(f.s - back, me.s - back - (1 - Math.min(1, (me.s - f.s) / 5)) * 2) : me.s - back;
      pos = coursePoint(camS, me.x * 0.6, up);
      if (f && me.s > f.s - back) pos.y = Math.max(pos.y, coursePoint(f.s - 0.5, 0, 0).y + up * 0.8); // 落ち口より下へは まだ下りない
      look = coursePoint(me.s + (portrait ? 7 : 8) * (1 - fall * 0.35), me.x * 0.4, 0.5 - fall * 0.8);
    }
    if (game?.shake > 0) {
      game.shake = Math.max(0, game.shake - dt);
      pos.x += (Math.random() - 0.5) * game.shake * 0.6;
      pos.y += (Math.random() - 0.5) * game.shake * 0.6;
    }
    camera.fov = portrait ? 64 : 52;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      const sky = coursePoint(-24, 10, 22);
      camera.position.lerpVectors(sky, pos, e);
      camera.userData.look = new THREE.Vector3().lerpVectors(coursePoint(30, 0, 0), look, Math.min(1, e * 1.1));
      camera.lookAt(camera.userData.look);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    camera.position.lerp(pos, k);
    camera.userData.look = camera.userData.look ? camera.userData.look.lerp(look, k) : look.clone();
    camera.lookAt(camera.userData.look);
  }

  // ── 画質 ─────────────────────────────────────────────
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

  // ── 1フレーム ───────────────────────────────────────
  function frame(rawDt, draw = true) {
    const dt = Math.min(rawDt, 0.1);
    if (draw && mode === 'playing' && intro >= 1) watchQuality(rawDt);
    if (intro < 1 && !paused) intro = Math.min(1, intro + dt / INTRO_TIME);
    if (game && mode === 'playing' && !paused && intro >= 1) {
      const s = game.state;
      if (s.phase === 'ready') {
        const n = Math.ceil(RULES.readyTime - s.t);
        if (n !== game.countdown && n > 0) { game.countdown = n; splash(String(n)); sfx.beep(false); }
      }
      game.acc += dt;
      while (game.acc >= STEP && s.phase !== 'finished') {
        const inputs = game.players.map((p, slot) => (p.cpu ? cpuInput(game.cpus[slot], s, slot) : myInput()));
        onEvents(step(s, inputs));
        game.acc -= STEP;
      }
      if (game.endTimer !== null) {
        game.endTimer -= dt;
        if (game.endTimer <= 0) { game.endTimer = null; showResult(); }
      }
      game.sprayT = Math.max(0, (game.sprayT || 0) - dt);
    }
    if (game && mode === 'playing') renderHud();
    if (game && !paused) {
      updateRunners(dt);
      updateDrops(dt);
    }
    if (!paused) {
      // 水が流れる・うずが回る
      stage.water.map.offset.y -= dt * 0.5;
      updateFoam(dt);
      scenery.update(dt, camera);
      for (const a of audience) {
        if (a.until > 0 && (a.until -= dt) <= 0) { a.model.play('idle'); a.model.setFace('normal'); }
        a.model.update(dt);
      }
      if (owlCheer > 0 && (owlCheer -= dt) <= 0) owl.play('idle');
      owl.update(dt);
      if (owl.current === 'flap' && owl.actions.flap.time > 1.2) owl.play('idle');
    }
    atmosphere.update(dt);
    updateCamera(dt);
    if (draw) renderer.render(scene, camera);
  }

  // E2E 用の口
  window.dikada = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    camera, renderer, scene,
    point: (s, x, h) => coursePoint(s, x, h),
    freeCamera: (on) => { freeCamera = on; },
    snap: () => { updateCamera(0, true); renderer.render(scene, camera); },
    setTime: (key) => atmosphere.apply(key),
    tick: (sec) => { for (let i = 0; i < sec * 60; i++) frame(1 / 60, false); },
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
      taps.length = 0;
    },
    get intro() { return intro; },
  };
}
