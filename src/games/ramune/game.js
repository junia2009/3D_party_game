// 夏祭りの ラムネ しゅわしゅわ の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
//
// 動かし方: スマホを ふる(加速度センサー)。ふれない ときは 画面を 連打。「ポン!」ボタンで ふたを とばす。
// パソコンは スペースを おしている あいだ ふる・エンターで ポン。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonMaterial } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { RULES, STEP, createGame, limitOf, rattleK, ranking, step, timeLeft } from './rules.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { SEAT_X, buildStage, ramuneBottle } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const UNIT_Z = 0.55; // キャラは カウンターの 前(お客さん)に 立つ

export async function createRamune({ renderer, settings, getAudio, onExit }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
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
    fizz(k) { noise({ len: 0.12, gain: 0.02 + k * 0.03, freq: [4000, 7000], type: 'highpass', q: 0.5 }); },
    rattle() { noise({ len: 0.06, gain: 0.06, freq: [900, 1400], q: 4 }); },
    drumroll() { for (let k = 0; k < 14; k++) noise({ len: 0.08, gain: 0.05 + k * 0.004, freq: [180, 90], type: 'lowpass', at: k * 0.07 }); },
    clink() { voice({ type: 'triangle', pts: [[0, 2400 + Math.random() * 600]], len: 0.05, gain: 0.03 }); },
    pop() { voice({ pts: [[0, 180], [0.05, 900]], len: 0.12, gain: 0.14 }); noise({ len: 0.25, gain: 0.1, freq: [6000, 2000], type: 'highpass' }); },
    burst() { noise({ len: 0.9, gain: 0.16, freq: [3000, 500], q: 0.6, attack: 0.02 }); voice({ type: 'square', pts: [[0, 400], [0.5, 150]], len: 0.55, gain: 0.04 }); },
    go() { voice({ type: 'square', pts: [[0, 880]], len: 0.18, gain: 0.05 }); },
    ready() { voice({ type: 'square', pts: [[0, 440]], len: 0.12, gain: 0.04 }); },
    whistle() { voice({ pts: [[0, 900], [1.4, 1800]], len: 1.4, gain: 0.03 }); },
    boom() { noise({ len: 0.8, gain: 0.12, freq: [400, 80], type: 'lowpass', attack: 0.005 }); },
    fanfare() { [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1047], [0.5, 1047]].forEach(([at, f], i) => voice({ type: 'square', pts: [[0, f]], len: i === 4 ? 0.6 : 0.12, gain: 0.05, at })); },
  };

  await preload(CHARACTERS.map((c) => c.key));

  // ── 演出: しぶき・ふたの すじ・花火 ─────────────────────
  const fx = [];
  function spray(at, n = 20, sp = 2.5, color = 0xffffff, up = 4) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.035 + Math.random() * 0.03, 6, 4), new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.copy(at);
      scene.add(m);
      const a = Math.random() * 6.28;
      fx.push({ obj: m, t: 0, life: 0.9, vel: new THREE.Vector3(Math.cos(a) * sp * Math.random(), up + Math.random() * up, Math.sin(a) * sp * Math.random()), kind: 'drop' });
    }
  }
  function firework(at, color) {
    for (let i = 0; i < 46; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: i % 4 ? color : 0xffffff, transparent: true, fog: false }));
      m.position.copy(at);
      scene.add(m);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, (Math.random() - 0.5) * 0.4).normalize().multiplyScalar(5 + Math.random() * 2);
      fx.push({ obj: m, t: 0, life: 1.3, vel: v, kind: 'fire' });
    }
  }
  // ポンの ときの 光の わ
  function ringAt(at, color = 0xffffff) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.22, 24), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.position.copy(at);
    m.lookAt(camera.position);
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 0.45, vel: new THREE.Vector3(), kind: 'ring' });
  }
  // ふきこぼれの 水たまり
  function puddle(at) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.4, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, depthWrite: false }));
    m.position.set(at.x, 0.012, at.z + 0.1);
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 4, vel: new THREE.Vector3(), kind: 'puddle' });
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = f.t / f.life;
      f.obj.position.addScaledVector(f.vel, dt);
      if (f.kind === 'drop') f.vel.y -= 12 * dt;
      if (f.kind === 'fire') { f.vel.multiplyScalar(1 - dt * 1.6); f.vel.y -= 2 * dt; }
      if (f.kind === 'ring') f.obj.scale.setScalar(1 + k * 6);
      if (f.kind === 'puddle') f.obj.scale.setScalar(Math.min(1, f.t * 3) * 1.4);
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
  const input = { keys: new Set(), target: null, useMotion: false, asked: false, motion: 0, tap: 0, pop: false };

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS });
    if (game) for (const u of game.units) { scene.remove(u.holder); scene.remove(u.capFly); }
    for (const f of fx.splice(0)) scene.remove(f.obj);
    const state = createGame(players, seed);
    const units = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const holder = new THREE.Group();
      holder.add(model.root);
      holder.position.set(SEAT_X(slot), 0, UNIT_Z);
      // 自分の びんは すこし 大きく
      const bottle = ramuneBottle(true);
      const BS = slot === 0 ? 0.95 : 0.85;
      bottle.scale.setScalar(BS);
      scene.add(holder, bottle);
      // とんで いく ふた(と すじ)
      const capFly = new THREE.Group();
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.16, 12), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[slot].hex, fog: false }));
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, fog: false, depthWrite: false }));
      capFly.add(cap, glow);
      capFly.visible = false;
      scene.add(capFly);
      const def = CHARACTERS.find((c) => c.key === p.character);
      // 体の 大きさを はかって、びんを おなかの 前(体に めりこまない ところ)に もつ
      holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model.root);
      const front = box.max.z + 0.13 * BS + 0.03; // 体の いちばん 前 + びんの 太さ + すきま
      const handY = box.min.y + (box.max.y - box.min.y) * 0.32; // おなかの 高さ(びんの そこ)
      const headY = box.max.y;
      return { model, holder, bottle, capFly, size: def?.size || 1, arms: [model.node('arm_L'), model.node('arm_R')], shakeT: 0, lift: 0, front, handY, headY, bs: BS };
    }));
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    units[0].holder.add(marker);
    units[0].marker = marker;
    const swoosh = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 4, 16, Math.PI * 0.7), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      return m;
    });
    if (game?.swoosh) for (const m of game.swoosh) scene.remove(m);
    game = { swoosh, seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), units, acc: 0, endTimer: null, shake: 0, camY: 0 };
    atmosphere.apply(params.get('time') || 'night');
    atmosphere.setupShadows(units.map((u) => u.holder), [stage.group]);
    input.pop = false;
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoR').classList.add('show');
    $('shakeAskR').hidden = !(motionAvailable() && !input.useMotion && !input.asked);
    if (!fromSky) splash('よーい…');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudR').hidden = m !== 'playing';
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
  $('pauseBtnR').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: ふる(加速度)/ 連打 / キー ───────────────────
  const motionAvailable = () => typeof window.DeviceMotionEvent !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const grav = new THREE.Vector3();
  function onMotion(e) {
    // 重力を ぬいた 加速度(なければ、ゆっくり うごく 重力を ひいて つかう)
    let x, y, z;
    if (e.acceleration && e.acceleration.x != null) ({ x, y, z } = e.acceleration);
    else if (e.accelerationIncludingGravity) {
      const a = e.accelerationIncludingGravity;
      grav.x += (a.x - grav.x) * 0.1; grav.y += (a.y - grav.y) * 0.1; grav.z += (a.z - grav.z) * 0.1;
      x = a.x - grav.x; y = a.y - grav.y; z = a.z - grav.z;
    } else return;
    const m = Math.hypot(x, y, z);
    // 3 m/秒² から ふりはじめ、18 で いっぱい。ピークは すこし のこす
    const v = clamp((m - 3) / 15, 0, 1);
    input.motion = Math.max(v, input.motion);
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
      $('shakeAskR').hidden = true;
      splash('ふって あそぶ!', 'small');
    } catch {
      input.useMotion = false;
      $('shakeAskR').hidden = true;
      splash('タップで あそぶよ', 'small');
    }
  }
  $('shakeOnR').addEventListener('click', (e) => { e.stopPropagation(); unlockAudio(); enableMotion(); });
  $('shakeOffR').addEventListener('click', (e) => { e.stopPropagation(); input.asked = true; $('shakeAskR').hidden = true; });
  const playing = () => mode === 'playing' && !paused;
  // 連打(画面の どこでも。ボタン いがい)
  window.addEventListener('pointerdown', (e) => {
    if (!playing() || e.target.closest('button, a, .shakeask')) return;
    unlockAudio();
    input.tap = Math.min(1.2, input.tap + 0.34);
    $('howtoR').classList.remove('show');
  });
  const popEl = $('popR');
  popEl.addEventListener('pointerdown', (e) => {
    if (!playing()) return;
    e.preventDefault();
    e.stopPropagation();
    unlockAudio();
    input.pop = true;
    popEl.classList.add('down');
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) popEl.addEventListener(ev, () => popEl.classList.remove('down'));
  window.addEventListener('keydown', (e) => {
    if (mode !== 'playing') return;
    if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!paused); return; }
    if (e.code === 'Enter' && !e.repeat) { unlockAudio(); input.pop = true; return; }
    if (e.code === 'Space') { e.preventDefault(); unlockAudio(); input.keys.add('Space'); }
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => input.keys.clear());

  function myInput() {
    const pop = input.pop;
    input.pop = false;
    if (input.target) return { ...input.target, pop: input.target.pop ?? pop };
    let shake = Math.max(input.motion, Math.min(1, input.tap));
    if (input.keys.has('Space')) shake = 1;
    return { shake, pop };
  }
  // ふる 強さは ゆっくり へる(ふった ピークを すこし のこす)
  function decayInput(dt) {
    input.motion = Math.max(0, input.motion - dt * 3);
    input.tap = Math.max(0, input.tap - dt * 2.6);
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashR');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildChips() {
    $('chipsR').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'chip' + (slot === 0 ? ' me' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      d.innerHTML = '<i></i><b>0</b>';
      return d;
    }));
  }
  function renderHud() {
    const s = game.state;
    const order = ranking(s);
    [...$('chipsR').children].forEach((c, slot) => {
      c.querySelector('b').textContent = `${s.bottles[slot].total}m`;
      c.style.order = String(order.indexOf(slot));
      c.classList.toggle('lead', order[0] === slot && s.bottles[slot].total > 0);
    });
    $('roundR').textContent = s.round >= 0 ? `${s.round + 1} / ${RULES.rounds} かいめ` : '';
    $('timeR').textContent = s.phase === 'shake' ? String(Math.ceil(timeLeft(s))) : '';
    const b = s.bottles[0];
    const active = s.phase === 'shake' && !b.popped && !b.burst;
    popEl.hidden = !active;
    // あわの メーター(げんかいは 見せない。がたがたで わかる)
    // ゲージの てっぺん = その回の げんかい(こえると ふきこぼれ)。がたがたが はじまる ところから 上は あわで くもる
    $('meterR').style.setProperty('--k', String(clamp(b.fizz / limitOf(s), 0, 1)));
    $('meterR').style.setProperty('--r', String(s.rattleAt[Math.max(0, s.round)]));
    $('meterR').classList.toggle('rattle', b.rattle && active);
    $('meterR').hidden = !(s.phase === 'shake' || s.phase === 'prep');
    $('hudR').classList.toggle('danger', active && rattleK(s, b) > 0.5);
  }
  // ほかの 子の ようす(自分の びんを アップ している あいだ)
  function toast(slot, text) {
    const el = document.createElement('div');
    el.className = 'toast';
    const name = CHARACTERS.find((c) => c.key === game.players[slot].character)?.name || '';
    el.innerHTML = `<i style="background:${css(PLAYER_COLORS[slot].hex)}"></i>${name}が ${text}`;
    $('toastR').append(el);
    setTimeout(() => el.remove(), 1700);
  }
  const tmpV = new THREE.Vector3();
  function pop(text, at, cls = '', life = 900) {
    tmpV.copy(at).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsR').append(el);
    setTimeout(() => el.remove(), life);
  }

  // ── できごと ────────────────────────────────────────
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'round': {
          const last = e.round === RULES.rounds - 1;
          splash(last ? 'さいごの 1本!' : `${e.round + 1}かいめ`, last ? 'gold' : '');
          // さいごの 回は 金の ラムネ(たいこの ドロドロ)
          for (const u of game.units) u.bottle.userData.glass.color.setHex(last ? 0xffd86a : 0x7ad8e8);
          if (last) sfx.drumroll();
          // かまえ: びんを もちあげて「よーし!」
          setTimeout(() => {
            if (game?.state !== s || s.phase !== 'prep') return;
            const u0 = game.units[0];
            pop('よーし!', u0.holder.position.clone().add(new THREE.Vector3(0, u0.headY + 0.7, 0)), 'gold', 700);
          }, 800);
          sfx.ready();
          for (const u of game.units) { u.capFly.visible = false; u.flyH = 0; u.burst = 0; }
          game.showFrom = null;
          break;
        }
        case 'go':
          splash('ふって!', 'gold');
          sfx.go();
          setTimeout(() => $('howtoR').classList.remove('show'), 4000);
          break;
        case 'rattle':
          if (e.slot === 0) { sfx.rattle(); pop('がたがた!', game.units[0].bottle.position.clone().add(new THREE.Vector3(0, 1, 0)), 'red', 700); }
          break;
        case 'pop': {
          const u = game.units[e.slot];
          u.flyFrom = s.t;
          u.flyH = e.height;
          u.capFly.visible = true;
          const mouth = u.bottle.position.clone().add(new THREE.Vector3(0, 0.75 * u.bs, 0));
          spray(mouth, e.slot === 0 ? 36 : 16, 1.0, 0xe8f8ff, e.slot === 0 ? 5 : 3);
          ringAt(mouth, 0xffffff);
          if (e.slot === 0) {
            sfx.pop();
            sfx.whistle();
            game.shake = 0.15;
            pop(e.auto ? 'じかんぎれ ポン!' : 'しゅぽん!', mouth.clone().add(new THREE.Vector3(0, 0.35, 0)), 'gold', 800);
          } else if ((game.zoom ?? 0) > 0.5) toast(e.slot, 'ポン!');
          break;
        }
        case 'burst': {
          const u = game.units[e.slot];
          u.burst = 1;
          u.fountain = 1.2; // しばらく あわが ふきだしつづける
          spray(u.bottle.position.clone().add(new THREE.Vector3(0, 0.75 * u.bs, 0)), 50, 2.6, 0xffffff, 5);
          puddle(u.bottle.position);
          if (e.slot === 0) { sfx.burst(); game.shake = 0.4; splash('ふきこぼれた!', 'red small'); }
          else if ((game.zoom ?? 0) > 0.5) toast(e.slot, 'ふきこぼれ!');
          break;
        }
        case 'show': {
          game.showFrom = s.t;
          // この回の 1ばんを 発表(ふたが てっぺんに ついた ころ)
          const hs = e.heights;
          const top = Math.max(...hs);
          const who = hs.indexOf(top);
          const me = s.bottles[0];
          const best = me.height > 0 && me.height >= me.best && s.round > 0 && me.heights.slice(0, -1).every((h) => h < me.height);
          setTimeout(() => {
            if (game?.state !== s) return;
            if (top > 0) {
              const name = who === 0 ? 'あなた' : CHARACTERS.find((c) => c.key === game.players[who].character)?.name;
              splash(`この回 1ばん ${name} ${top}m!`, who === 0 ? 'gold small' : 'small');
              if (who === 0) sfx.fanfare();
            }
            if (best && who !== 0) setTimeout(() => game?.state === s && splash(`じこベスト ${me.height}m!`, 'gold small'), 1000);
          }, 1500);
          break;
        }
        case 'finished': {
          game.endTimer = 5.5;
          const win = e.winner === 0;
          if (win) { sfx.fanfare(); splash('1い!', 'gold'); } else splash(`${ranking(s).indexOf(0) + 1}い`, 'small');
          // フィナーレ: 夜空に 大きな 花火を つぎつぎ。勝った 子に 王冠
          game.finale = 0;
          const w = game.units[e.winner];
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
          crown.position.set(0, w.headY + 0.25, 0);
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
      const b = s.bottles[slot];
      const li = document.createElement('li');
      if (slot === 0) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : 'あなた';
      const def = CHARACTERS.find((c) => c.key === p.character);
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}・${b.heights.map((h) => (h ? `${h}m` : 'ぶしゅ')).join(' / ')}</small></span><span class="dist">${b.total}<small>m</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateWorld(dt) {
    const s = game.state;
    const shaking = s.phase === 'shake';
    s.bottles.forEach((b, slot) => {
      const u = game.units[slot];
      const x = SEAT_X(slot);
      // ふる 強さ(見た目): 自分は 入力、ほかの 子は あわの ふえかたから
      const active = shaking && !b.popped && !b.burst;
      const power = active ? (b.push > 1.5 ? Math.min(1, b.push / 9) : 0) : 0;
      u.shakeT += dt * (8 + power * 14);
      const amp = power * 0.16;
      const rk = active ? rattleK(s, b) : 0;
      // かまえ(「びんを もって!」の あいだ): びんを 頭の 上へ もちあげて「よーし!」。ふりはじめで おなかの 前へ
      const prep = s.phase === 'prep' ? 1 - s.phaseT / RULES.prepTime : -1;
      const liftTo = prep >= 0 ? Math.sin(Math.min(1, prep * 1.8) * Math.PI / 2) : 0;
      u.lift += (liftTo - u.lift) * Math.min(1, dt * (liftTo > u.lift ? 10 : 14));
      const topY = u.headY - 0.1; // 頭の 高さ(手が とどく ところ)
      // びん: 手の 前で 上下に ふる。がたがたは こまかく ふるえる
      const pump = prep > 0.6 ? Math.abs(Math.sin(prep * 22)) * 0.08 : 0; // かまえの さいごに ぐっ ぐっ
      u.bottle.position.set(x + Math.sin(time * 60) * rk * 0.03, u.handY + (topY - u.handY) * u.lift + pump + Math.sin(u.shakeT) * amp, UNIT_Z + u.front * (1 - u.lift * 0.25));
      u.bottle.rotation.z = Math.sin(u.shakeT * 0.5) * amp * 1.5 + Math.sin(time * 47) * rk * 0.12;
      // ビー玉: ふると くびれで カラカラ はねる
      const { marble, drops } = u.bottle.userData;
      marble.position.y = 0.58 + Math.abs(Math.sin(u.shakeT * 2)) * 0.03 * power;
      if (slot === 0 && power > 0.5) { u.clinkT = (u.clinkT || 0) - dt; if (u.clinkT <= 0) { u.clinkT = 0.22 + Math.random() * 0.15; sfx.clink(); } }
      // 水てき(つたって おちる)
      for (const d of drops) {
        const dd = d.userData;
        dd.y -= dt * dd.sp * (1 + power * 3);
        if (dd.y < 0.02) dd.y = 0.42;
        d.position.set(Math.cos(dd.a) * 0.128, dd.y, Math.sin(dd.a) * 0.128);
      }
      // がたがた: 口から あわが じわっと あふれる
      if (rk > 0.25 && Math.random() < dt * rk * (slot === 0 ? 30 : 8)) {
        const m = u.bottle.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.72 * u.bs, 0.02));
        spray(m, 1, 0.3, 0xffffff, 0.6);
      }
      // ふきこぼれ: しばらく あわが ふきだす
      if (u.fountain > 0) {
        u.fountain -= dt;
        if (Math.random() < dt * 40) spray(u.bottle.position.clone().add(new THREE.Vector3(0, 0.75 * u.bs, 0)), 2, 0.8, 0xffffff, 2.5);
      }
      // シャカシャカの 線(自分だけ)
      if (slot === 0) {
        game.swoosh.forEach((m, k) => {
          m.visible = power > 0.25;
          m.position.set(x + (k ? 0.32 : -0.32) * u.bs * 1.3, u.bottle.position.y + 0.35 * u.bs, u.bottle.position.z);
          m.rotation.z = (k ? -1 : 1) * (0.4 + Math.sin(u.shakeT) * 0.5);
          m.material.opacity = Math.min(1, power) * (0.5 + 0.5 * Math.abs(Math.sin(u.shakeT)));
        });
      }
      // 中を のぼる あわの つぶ(ふるほど はやく、たくさん)
      const bub = u.bottle.userData.bubbles;
      const lvl = clamp(b.fizz / limitOf(s), 0, 1);
      bub.forEach((m, k) => {
        const d = m.userData;
        d.y += dt * d.sp * (0.15 + power * 1.2 + rk * 0.8);
        if (d.y > 0.44) d.y -= 0.42;
        m.visible = !b.popped && !b.burst && k < 3 + lvl * 11;
        m.position.set(Math.cos(d.a + d.y * 6) * d.r, 0.02 + d.y, Math.sin(d.a + d.y * 6) * d.r);
      });
      // 中の あわ(びんの 高さ 0.5 まで)。ふきこぼれたら ぜんぶ あわ
      const { foam, liquid, cap } = u.bottle.userData;
      const level = b.burst ? 1 : clamp(b.fizz / limitOf(s), 0, 1); // びんの 口まで = げんかい
      liquid.scale.y = 0.42;
      liquid.position.y = 0.21;
      foam.scale.y = Math.max(0.01, level * 0.5);
      foam.position.y = 0.42 - level * 0.18 + (b.burst ? 0.1 : 0);
      foam.material.color.setHex(b.burst ? 0xffffff : 0xf4fbff);
      cap.visible = !b.popped && !b.burst;
      // キャラ: びんを もつ 手。ふきこぼれたら びっくり、高く とんだら にっこり
      u.holder.position.set(x, u.holder.position.y, UNIT_Z);
      u.holder.rotation.y = 0;
      u.model.setFace(b.burst ? 'surprised' : rk > 0.4 ? 'surprised' : (b.popped && b.height > 20) || u.lift > 0.5 ? 'happy' : 'normal');
      u.model.play(u.crown || (b.popped && b.height > 18 && s.phase === 'show') ? 'cheer' : 'idle');
      u.model.update(dt);
      // かまえで ちょっと せのび
      u.holder.position.y = u.lift * 0.08 + pump * 0.5;
      const [aL, aR] = u.arms;
      if (aL && aR && !(b.popped && s.phase === 'show')) {
        aL.rotation.x = aR.rotation.x = -1.3 - u.lift * 1.6 + Math.sin(u.shakeT) * amp * 3;
        aL.rotation.z = 0.25 - u.lift * 0.1; aR.rotation.z = -0.25 + u.lift * 0.1;
      }
      if (u.marker) u.marker.position.set(0, 2.05 * u.size + Math.sin(time * 5) * 0.06, 0);
      // とんで いく ふた: すうっと 上へ、てっぺんで ふわっと とまる
      if (u.capFly.visible && u.flyFrom !== undefined) {
        const tt = Math.min(1, (s.t - u.flyFrom) / 1.4);
        const e = 1 - (1 - tt) ** 3;
        u.capFly.position.set(x, u.handY + 0.75 * u.bs + u.flyH * e, UNIT_Z + u.front);
        u.capFly.rotation.x += dt * 14 * (1 - tt);
        if (tt >= 1 && !u.peak) {
          u.peak = true;
          if (u.flyH > 0) {
            firework(u.capFly.position, PLAYER_COLORS[slot].hex);
            if (slot === 0) sfx.boom();
            pop(`${u.flyH}m`, u.capFly.position.clone().add(new THREE.Vector3(0, 0.6, 0)), slot === 0 ? 'gold' : 'me', 1600);
          }
        }
        if (tt < 1) u.peak = false;
      }
    });
    stage.update(time);
    if (s.phase === 'finished' && game.finale !== undefined) {
      game.finale -= dt;
      if (game.finale <= 0) {
        game.finale = 0.35 + Math.random() * 0.25;
        const cols = [0xff6a9a, 0xffd24a, 0x7ad8ff, 0xb48cff, 0x8ad04a, 0xff8a3a];
        firework(new THREE.Vector3((Math.random() - 0.5) * 7, 4.5 + Math.random() * 3, -2 - Math.random() * 3), cols[Math.floor(Math.random() * cols.length)]);
        sfx.boom();
      }
    }
    for (const [i, u] of game.units.entries()) {
      if (!u.crown) continue;
      u.crown.rotation.y = time * 2;
      u.crown.position.y = u.headY + 0.25 + Math.sin(time * 4) * 0.05;
      u.holder.position.y = Math.abs(Math.sin(time * 6 + i)) * 0.25;
      u.model.setFace('happy');
    }
  }

  let freeCamera = false;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  function updateCamera(dt, snap = false) {
    if (freeCamera || !game) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const s = game.state;
    // ふつう: 屋台の 正面。ふたが とぶ ときは 上へ ついていく(いちばん 高い ふたまで)
    let target = 0;
    if (s.phase === 'show' && game.showFrom !== null) {
      const top = Math.max(...game.units.map((u) => (u.capFly.visible ? u.capFly.position.y - u.handY : 0)));
      target = Math.max(0, top - 2);
    }
    game.camY += (target - game.camY) * Math.min(1, dt * 3);
    camPos.set(portrait ? 0.3 : 0, (portrait ? 2.1 : 1.9) + game.camY, portrait ? 8.6 : 5.6);
    camLook.set(portrait ? 0.3 : 0, 1.0 + game.camY * 1.02, -0.4);
    // ふる あいだは 自分の びんを アップ(ポンしたら ひく)
    const mb = s.bottles[0], mu = game.units[0];
    const close = s.phase === 'shake' && !mb.popped && !mb.burst ? 1 : s.phase === 'shake' && (mb.popped || mb.burst) && s.t - (mb.popAt ?? s.t) < 0.25 ? 1 : 0;
    game.zoom = (game.zoom ?? 0) + (close - (game.zoom ?? 0)) * Math.min(1, dt * (close ? 3.5 : 2.5));
    if (game.zoom > 0.001) {
      const bp = mu.bottle.position;
      const z = game.zoom * game.zoom * (3 - 2 * game.zoom);
      const cx = bp.x + 0.28, cy = mu.handY + 0.5, cz = bp.z + (portrait ? 1.55 : 1.25);
      camPos.set(camPos.x + (cx - camPos.x) * z, camPos.y + (cy - camPos.y) * z, camPos.z + (cz - camPos.z) * z);
      camLook.set(camLook.x + (bp.x - camLook.x) * z, camLook.y + (mu.handY + 0.32 - camLook.y) * z, camLook.z + (bp.z - camLook.z) * z);
      // がたがたで 画面も ふるえる
      const rk = s.phase === 'shake' && !mb.popped && !mb.burst ? rattleK(s, mb) : 0;
      if (rk > 0) { camPos.x += (Math.random() - 0.5) * rk * 0.05 * z; camPos.y += (Math.random() - 0.5) * rk * 0.05 * z; }
    }
    // ふたを おう ときは すこし ひいて、竹ざおの 目もりも 入れる
    if (s.phase === 'show' && game.camY > 1) { const k = Math.min(1, game.camY / 6); camPos.z += k * 3; camPos.x += k * 1.2; camLook.x += k * 1.2; }
    // 決着: 勝った 子へ ゆっくり 寄って、うしろの 夜空の 花火も 入れる
    game.winCam = s.phase === 'finished' ? Math.min(1, (game.winCam ?? 0) + dt * 0.8) : 0;
    if (game.winCam > 0 && s.winner !== null) {
      const wu = game.units[s.winner];
      const z = game.winCam * game.winCam * (3 - 2 * game.winCam);
      const wx = wu.holder.position.x;
      camPos.lerp(new THREE.Vector3(wx, 1.5, portrait ? 5.4 : 4.0), z);
      camLook.lerp(new THREE.Vector3(wx, wu.headY + 1.1, -1.5), z);
    }
    camera.fov = portrait ? 56 : 46;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      camera.position.lerpVectors(new THREE.Vector3(6, 22, 14), camPos, e);
      camera.lookAt(camLook);
      return;
    }
    camera.position.copy(camPos);
    if (game.shake > 0) {
      game.shake = Math.max(0, game.shake - dt);
      camera.position.x += (Math.random() - 0.5) * game.shake * 0.4;
      camera.position.y += (Math.random() - 0.5) * game.shake * 0.4;
    }
    camera.lookAt(camLook);
    void snap;
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
  let time = 0, fizzT = 0;
  function frame(rawDt) {
    const dt = Math.min(rawDt, 0.1);
    time += dt;
    if (mode === 'playing' && intro >= 1) watchQuality(rawDt);
    if (intro < 1 && !paused) {
      intro = Math.min(1, intro + dt / INTRO_TIME);
      if (intro >= 1) splash('よーい…');
    }
    if (game && mode === 'playing' && !paused && intro >= 1 && $('shakeAskR').hidden) {
      const s = game.state;
      game.acc += dt;
      while (game.acc >= STEP && s.phase !== 'finished') {
        const mi = myInput();
        const inputs = game.players.map((p, slot) => (p.cpu ? cpuInput(game.cpus[slot], s, slot) : mi));
        onEvents(step(s, inputs));
        game.acc -= STEP;
      }
      decayInput(dt);
      // しゅわしゅわ の 音(自分の びん)
      const b = s.bottles[0];
      fizzT -= dt;
      if (s.phase === 'shake' && !b.popped && !b.burst && fizzT <= 0 && b.push > 1) { fizzT = 0.14; sfx.fizz(Math.min(1, b.fizz / 90)); if (b.rattle) sfx.rattle(); }
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
  window.dramune = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    steer: (t) => { input.target = t; },
    skipAsk: () => { input.asked = true; $('shakeAskR').hidden = true; },
    // 描かずに、みんな CPU で sec 秒すすめる(自分も CPU)
    advance: (sec) => {
      const me = game.meCpu || (game.meCpu = createCpu('normal', 1, 0));
      for (let i = 0; i < sec / STEP && game.state.phase !== 'finished'; i++) {
        onEvents(step(game.state, game.players.map((p, slot) => cpuInput(slot ? game.cpus[slot] : me, game.state, slot))));
      }
    },
    limit: () => limitOf(game.state),
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
