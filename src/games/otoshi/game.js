// お正月の お寺の だるまおとし の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
//
// 動かし方: じぶんの ばんに 画面を おして いる あいだ こづちを ひいて ためる(つよさは いったり きたり)。
// ちょうどいい ところで はなすと たたく。パソコンは スペース。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { RULES, STEP, alive, createGame, ranking, step, timeLeft, windowOf } from './rules.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { BASE_Y, BLOCK_H, BLOCK_R, HIT_X, SEATS, blockMesh, buildStage, headMesh, malletMesh } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const KIND_LABEL = { normal: 'ふつうの だん', hard: 'かたい だん! つよく', slip: 'すべる だん! よわく' };
const RESULT = { perfect: ['ぴったり!', 'gold'], good: ['ぬけた!', 'me'], weak: ['よわい…', ''], strong: ['つよすぎ!', 'red'] };

export async function createOtoshi({ renderer, settings, getAudio, onExit }) {
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
    knock(k) { voice({ type: 'triangle', pts: [[0, 900 - k * 300], [0.08, 500]], len: 0.12, gain: 0.08 }); noise({ len: 0.05, gain: 0.05, freq: [2500, 1200], q: 3 }); },
    slide() { noise({ len: 0.25, gain: 0.05, freq: [1800, 600], q: 0.8 }); },
    tick(k) { voice({ type: 'sine', pts: [[0, 300 + k * 600]], len: 0.05, gain: 0.02 }); },
    wobble() { voice({ type: 'triangle', pts: [[0, 180], [0.2, 140]], len: 0.22, gain: 0.03 }); },
    crash() { noise({ len: 0.9, gain: 0.14, freq: [900, 120], type: 'lowpass' }); for (let k = 0; k < 6; k++) voice({ type: 'triangle', pts: [[0, 400 + Math.random() * 500]], len: 0.08, gain: 0.04, at: 0.1 + k * 0.09 }); },
    turn() { voice({ type: 'square', pts: [[0, 660]], len: 0.1, gain: 0.03 }); },
    go() { voice({ type: 'square', pts: [[0, 880]], len: 0.18, gain: 0.05 }); },
    fanfare() { [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1047], [0.5, 1047]].forEach(([at, f], i) => voice({ type: 'square', pts: [[0, f]], len: i === 4 ? 0.6 : 0.12, gain: 0.05, at })); },
  };

  await preload(CHARACTERS.map((c) => c.key));

  // ── 演出 ────────────────────────────────────────
  const fx = [];
  function spark(at, n = 10, color = 0xffe066, sp = 3) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.05 + Math.random() * 0.04), new THREE.MeshBasicMaterial({ color: i % 3 ? color : 0xffffff, transparent: true }));
      m.position.copy(at);
      scene.add(m);
      const a = Math.random() * 6.28;
      fx.push({ obj: m, t: 0, life: 0.5, vel: new THREE.Vector3(Math.cos(a) * sp * 0.5, 1 + Math.random() * 2, Math.sin(a) * sp * 0.5), kind: 'drop' });
    }
  }
  // ほこり(くずれた とき・だんが おちた とき)
  const puffTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, 'rgba(240,230,210,.9)'); grd.addColorStop(1, 'rgba(240,230,210,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  function dust(at, n = 8) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false }));
      m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.1, (Math.random() - 0.5) * 0.6));
      m.scale.setScalar(0.4);
      scene.add(m);
      const a = Math.random() * 6.28;
      fx.push({ obj: m, t: 0, life: 1.1, vel: new THREE.Vector3(Math.cos(a) * 1.2, 0.4 + Math.random() * 0.5, Math.sin(a) * 0.8), kind: 'puff' });
    }
  }
  // あせ(だるまが ぐらぐらで あせる)
  function sweat(at) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0x8ad8ff, transparent: true }));
    m.scale.set(0.8, 1.3, 0.8);
    m.position.copy(at);
    scene.add(m);
    fx.push({ obj: m, t: 0, life: 0.6, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.6, 0.3), kind: 'drop' });
  }
  function confetti(at, n = 40) {
    const cols = [0xff6a9a, 0xffd24a, 0x7ad8ff, 0x8ad04a, 0xff8a3a];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.15), new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, transparent: true }));
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
      f.obj.position.addScaledVector(f.vel, dt);
      if (f.kind === 'drop') f.vel.y -= 8 * dt;
      if (f.kind === 'puff') { f.vel.multiplyScalar(1 - dt * 2); f.obj.scale.setScalar(0.4 + k * 1.4); }
      if (f.kind === 'paper') { f.vel.multiplyScalar(1 - dt * 1.2); f.vel.y -= 4 * dt; f.obj.rotation.x += f.spin * dt; f.obj.rotation.y += f.spin * 0.7 * dt; }
      f.obj.material.opacity = 1 - k * k;
      if (k >= 1) { scene.remove(f.obj); f.obj.material.dispose(); fx.splice(i, 1); }
    }
  }

  // ── だるま ──────────────────────────────────────
  // tower: 台の 上に たつ グループ(ぐらぐらは ここを かたむける)。blocks は 下から じゅんばん
  const tower = new THREE.Group();
  scene.add(tower);
  let blocks = [];
  let head = null;
  const flying = []; // とんで いく だん・くずれた かけら
  function rebuild(s, drop = false) {
    for (const m of [...blocks, head]) if (m) tower.remove(m);
    for (const f of flying.splice(0)) scene.remove(f.obj);
    blocks = s.tower.map((b, i) => {
      const m = blockMesh(b.kind, i + s.round);
      m.userData = { kind: b.kind, y: BASE_Y + BLOCK_H * (i + 0.5), drop: drop ? 1.5 + i * 0.5 : 0 };
      tower.add(m);
      return m;
    });
    head = headMesh();
    Object.assign(head.userData, { y: BASE_Y + BLOCK_H * s.tower.length, drop: drop ? 1.5 + s.tower.length * 0.5 : 0 });
    tower.add(head);
  }
  // ぬけた だんは 右へ とんで ころがる
  function knockOut(power) {
    const m = blocks.shift();
    if (!m) return;
    tower.remove(m);
    m.position.copy(tower.localToWorld(m.position.clone()));
    scene.add(m);
    flying.push({ obj: m, vel: new THREE.Vector3(2.2 + power * 3, 0.8, -0.3 - Math.random() * 0.5), spin: -6 - power * 6, t: 0, floor: BLOCK_R });
    // うえの だんは 1だん おちる(すとんと)
    for (const b of blocks) b.userData.y -= BLOCK_H;
    if (head) head.userData.y -= BLOCK_H;
  }
  // くずれる: ぜんぶの だんが ばらばらに とぶ
  function collapse(dir) {
    for (const m of [...blocks, head]) {
      if (!m) continue;
      const wp = tower.localToWorld(m.position.clone());
      tower.remove(m);
      m.position.copy(wp);
      scene.add(m);
      const h = wp.y;
      flying.push({ obj: m, vel: new THREE.Vector3(dir * (0.8 + Math.random() * 1.6) + (Math.random() - 0.5), 1 + Math.random() * 1.5, -Math.random() * 1.5), spin: (Math.random() - 0.5) * 10, t: 0, floor: m === head ? 0.45 : BLOCK_R, h });
    }
    blocks = [];
    head = null;
  }
  function updateFlying(dt) {
    for (const f of flying) {
      f.t += dt;
      const p = f.obj.position;
      f.vel.y -= 12 * dt;
      p.addScaledVector(f.vel, dt);
      if (f.roll !== undefined) {
        // たたみの 上を ころころ(よこだおしで わの ように ころがる)
        f.vel.x *= 1 - dt * 1.2; f.vel.z *= 1 - dt * 1.2;
        f.roll -= f.vel.x / BLOCK_R * dt;
        f.tip = Math.min(1, f.tip + dt * 6);
        f.obj.rotation.set(Math.PI / 2 * f.tip, f.roll, f.obj.rotation.z * (1 - f.tip));
      } else f.obj.rotation.z += f.spin * dt;
      if (p.y < f.floor) {
        p.y = f.floor; f.vel.y = Math.abs(f.vel.y) > 1.5 ? -f.vel.y * 0.35 : 0; f.vel.x *= 0.7; f.vel.z *= 0.7; f.spin *= 0.6;
        if (f.h === undefined && f.roll === undefined && f.vel.y === 0) { f.roll = 0; f.tip = 0; }
        if (f.h !== undefined && !f.dusted) { f.dusted = true; dust(p.clone(), 3); }
      }
      if (f.h === undefined && f.t > 3) f.obj.scale.setScalar(Math.max(0.001, 1 - (f.t - 3) * 2));
    }
  }

  // ── ゲームの進行 ────────────────────────────────────
  let mode = 'idle';
  let picked = CHARACTERS[0].key;
  let tour = null;
  let game = null;
  let intro = 1;
  const INTRO_TIME = 2.4;
  const input = { keys: new Set(), target: null, hold: false };
  const mallet = malletMesh();
  scene.add(mallet);

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS });
    if (game) for (const u of game.units) scene.remove(u.holder);
    for (const f of fx.splice(0)) scene.remove(f.obj);
    const state = createGame(players, seed);
    const units = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const holder = new THREE.Group();
      holder.add(model.root);
      const [x, z] = SEATS[slot];
      holder.position.set(x, 0, z);
      scene.add(holder);
      return { model, holder, arms: [model.node('arm_L'), model.node('arm_R')] };
    }));
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    units[0].holder.add(marker);
    units[0].marker = marker;
    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), units, acc: 0, endTimer: null, shake: 0, swing: 0, lastPower: 0 };
    rebuild(state, false);
    atmosphere.apply(params.get('time') || 'night');
    atmosphere.setupShadows([...units.map((u) => u.holder), tower], [stage.group]);
    input.hold = false;
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoO').classList.add('show');
    if (!fromSky) splash('よーい…');
    updateCamera(0);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudO').hidden = m !== 'playing';
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
  $('pauseBtnO').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: おして ためて、はなして たたく ─────────────────
  const playing = () => mode === 'playing' && !paused;
  let pid = null;
  window.addEventListener('pointerdown', (e) => {
    if (!playing() || e.target.closest('button, a')) return;
    unlockAudio();
    pid = e.pointerId;
    input.hold = true;
    $('howtoO').classList.remove('show');
  });
  for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, (e) => { if (e.pointerId === pid) { pid = null; input.hold = false; } });
  window.addEventListener('keydown', (e) => {
    if (mode !== 'playing') return;
    if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!paused); return; }
    if (e.code === 'Space') { e.preventDefault(); unlockAudio(); input.keys.add('Space'); }
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => input.keys.clear());
  function myInput() {
    if (input.target) return input.target;
    return { hold: input.hold || input.keys.has('Space') };
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashO');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  const nameOf = (slot) => (slot === 0 ? 'あなた' : CHARACTERS.find((c) => c.key === game.players[slot].character)?.name || '');
  function buildChips() {
    $('chipsO').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'chip' + (slot === 0 ? ' me' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      d.innerHTML = `<i></i><b>${CHARACTERS.find((c) => c.key === p.character)?.name || ''}</b>`;
      return d;
    }));
  }
  function renderHud() {
    const s = game.state;
    [...$('chipsO').children].forEach((c, slot) => {
      c.classList.toggle('out', s.outs[slot] !== null);
      c.classList.toggle('now', s.phase === 'aim' && s.turn === slot);
    });
    $('timeO').textContent = s.phase === 'aim' ? String(Math.ceil(timeLeft(s))) : '';
    const aiming = s.phase === 'aim';
    $('turnO').textContent = aiming ? (s.turn === 0 ? 'あなたの ばん!' : `${nameOf(s.turn)}の ばん`) : '';
    $('turnO').classList.toggle('mine', aiming && s.turn === 0);
    // つよさの ゲージ: みどり = ちょうどいい、金の 線 = まんなか、はり = いまの つよさ
    const g = $('gaugeO');
    g.hidden = !aiming || !s.tower.length;
    if (!g.hidden) {
      const [lo, hi] = windowOf(s);
      g.style.setProperty('--lo', String(lo));
      g.style.setProperty('--hi', String(hi));
      g.style.setProperty('--p', String(s.charge));
      g.classList.toggle('mine', s.turn === 0);
      $('kindO').textContent = KIND_LABEL[s.tower[0].kind] + (s.shift > 0 ? '(ずれてる)' : '');
      $('kindO').className = 'kind ' + s.tower[0].kind;
    }
    $('hudO').classList.toggle('danger', s.wobble > 0.55 && aiming);
  }
  const tmpV = new THREE.Vector3();
  function pop(text, at, cls = '', life = 900) {
    tmpV.copy(at).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsO').append(el);
    setTimeout(() => el.remove(), life);
  }
  const topOfTower = () => new THREE.Vector3(0, BASE_Y + BLOCK_H * (blocks.length + 1) + 0.8, 0);

  // ── できごと ────────────────────────────────────────
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'turn':
          if (e.slot === 0) { splash('あなたの ばん!', 'gold small'); sfx.turn(); }
          break;
        case 'timeout':
          if (e.slot === 0) pop('じかんぎれ!', topOfTower(), 'red', 800);
          break;
        case 'hit': {
          game.swing = 1;
          game.lastPower = e.power;
          sfx.knock(e.power);
          const at = new THREE.Vector3(-BLOCK_R, BASE_Y + BLOCK_H / 2, 0.2);
          const kind = blocks[0]?.userData.kind;
          spark(at, e.result === 'perfect' ? 14 : 6, kind === 'hard' ? 0xff9a3a : kind === 'slip' ? 0x9ae8ff : e.result === 'perfect' ? 0xffe066 : 0xffffff, 2);
          // カーン!(ぴったりは 金で 大きく)。かたい だんは ガキン!
          pop(kind === 'hard' && e.result !== 'weak' ? 'ガキン!' : e.result === 'perfect' ? 'カーーン!' : 'コン!', at.clone().add(new THREE.Vector3(-0.3, 0.5, 0)), e.result === 'perfect' ? 'gold big' : '', 700);
          if (e.result === 'perfect' || e.result === 'strong') game.slow = 0.18; // たたいた しゅんかんを すこし ゆっくり
          if (e.result === 'weak') blocks[0] && (blocks[0].userData.kick = 0.25);
          else { knockOut(e.power); sfx.slide(); }
          if (e.result === 'strong') game.shake = 0.3;
          if (e.wobble > 0.5) sfx.wobble();
          const [text, cls] = RESULT[e.result];
          pop(text, topOfTower(), cls, 900);
          break;
        }
        case 'collapse':
          collapse(Math.random() < 0.5 ? -1 : 1);
          dust(new THREE.Vector3(0, BASE_Y, 0), 14);
          for (const u of game.units) u.shock = 0.8;
          sfx.crash();
          game.shake = 0.6;
          splash(e.slot === 0 ? 'くずれた〜!' : `${nameOf(e.slot)} アウト!`, e.slot === 0 ? 'red' : 'small');
          game.units[e.slot].sad = 2.4;
          break;
        case 'clear':
          splash('おみごと!', 'gold');
          sfx.fanfare();
          confetti(new THREE.Vector3(0, 2, 0), 40);
          break;
        case 'build':
          rebuild(s, true);
          if (e.round > 0 && s.phase !== 'show') setTimeout(() => game?.state === s && splash(`${e.round + 1}だんめの だるま`, 'small'), 200);
          break;
        case 'show':
          splash('そこまで!', 'small');
          break;
        case 'finished': {
          game.endTimer = 4;
          const win = e.winner === 0;
          if (win) { sfx.fanfare(); splash('1い!', 'gold'); } else splash(`${ranking(s).indexOf(0) + 1}い`, 'small');
          game.units[e.winner].win = true;
          confetti(game.units[e.winner].holder.position.clone().add(new THREE.Vector3(0, 2, 0)), 60);
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
    $('resultTitle').textContent = order[0] === 0 ? 'あなたの 勝ち!' : `${nameOf(order[0])}の 勝ち!`;
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = game.players[slot];
      const li = document.createElement('li');
      if (slot === 0) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : 'あなた';
      const def = CHARACTERS.find((c) => c.key === p.character);
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}・ぬいた ${s.knocks[slot]}</small></span><span class="dist">${s.outs[slot] === null ? 'のこり' : 'アウト'}</span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateWorld(dt) {
    const s = game.state;
    // だるま: ぐらぐら(だいを 中心に かたむく)。うえほど ゆれる
    const wob = s.phase === 'collapse' ? 0 : s.wobble;
    tower.rotation.z = Math.sin(time * 6.5) * wob * 0.12;
    tower.rotation.x = Math.sin(time * 4.3 + 1) * wob * 0.05;
    blocks.forEach((m, i) => {
      const d = m.userData;
      if (d.drop > 0) d.drop = Math.max(0, d.drop - dt * 6);
      const kick = d.kick > 0 ? (d.kick = Math.max(0, d.kick - dt)) : 0;
      const shiftX = i === 0 ? s.shift * 0.28 + Math.sin(kick * 40) * kick * 0.2 : 0;
      // 下の だんが ぬけたら すとんと おちる(つみなおしは 上から ふって くる)
      d.cur = d.cur === undefined ? d.y + d.drop : d.cur + (d.y + d.drop - d.cur) * Math.min(1, dt * 16);
      m.position.set(shiftX + Math.sin(time * 9 + i) * wob * 0.02 * i, d.cur, 0);
    });
    if (head) {
      const d = head.userData;
      if (d.drop > 0) d.drop = Math.max(0, d.drop - dt * 6);
      d.cur = d.cur === undefined ? d.y + d.drop : d.cur + (d.y + d.drop - d.cur) * Math.min(1, dt * 16);
      head.position.set(Math.sin(time * 9 + 7) * wob * 0.05, d.cur, 0);
      head.rotation.z = Math.sin(time * 6.5 + 0.5) * wob * 0.15;
      // ぐらぐらが つよいと かおが 青ざめて あせ
      const pale = clamp((wob - 0.4) / 0.5, 0, 1);
      d.faceMat?.color.setRGB(1 - pale * 0.25, 0.95 - pale * 0.05, 0.88 + pale * 0.1);
      d.sweatT = (d.sweatT || 0) - dt;
      if (pale > 0.2 && d.sweatT <= 0) { d.sweatT = 0.35 - pale * 0.2; sweat(tower.localToWorld(head.position.clone().add(new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * 0.4, 0.75, 0.2)))); }
    }
    updateFlying(dt);
    // キャラ: たたく 子は だるまの 左へ。ほかの 子は うしろで 見る
    s.outs.forEach((out, slot) => {
      const u = game.units[slot];
      const hitter = (s.phase === 'aim' || s.phase === 'after') && s.turn === slot;
      const [sx, sz] = SEATS[slot];
      const tx = hitter ? HIT_X - 0.25 : sx, tz = hitter ? 0.35 : sz;
      u.holder.position.x += (tx - u.holder.position.x) * Math.min(1, dt * 5);
      u.holder.position.z += (tz - u.holder.position.z) * Math.min(1, dt * 5);
      const yaw = hitter ? Math.PI / 2 : Math.atan2(-sx, 2.5 - sz) * 0.6;
      u.holder.rotation.y += (yaw - u.holder.rotation.y) * Math.min(1, dt * 6);
      if (u.sad > 0) u.sad -= dt;
      if (u.shock > 0) u.shock -= dt;
      u.model.setFace(u.win ? 'happy' : u.sad > 0 ? 'frustrated' : u.shock > 0 || (hitter && s.charge > 0) || s.wobble > 0.6 ? 'surprised' : 'normal');
      // たたく 子は ためると ふりかぶって のけぞる
      u.model.root.rotation.x = hitter && s.phase === 'aim' ? -s.charge * 0.25 : 0;
      u.model.play(u.win ? 'cheer' : 'idle');
      u.model.update(dt);
      u.holder.position.y = u.win ? Math.abs(Math.sin(time * 6 + slot)) * 0.25 : 0;
      // アウトの 子は すこし ちいさく すわる
      u.holder.scale.setScalar(out !== null ? 0.85 : 1);
      if (hitter) {
        const [aL, aR] = u.arms;
        if (aL && aR) { aL.rotation.x = aR.rotation.x = -1.4; aL.rotation.z = -0.3; aR.rotation.z = 0.3; }
      }
      if (u.marker) u.marker.position.set(0, 2.1 + Math.sin(time * 5) * 0.06, 0);
    });
    // こづち: たたく 子の 手もとから ぶらさげて、ためると うしろへ ひく。はなすと ぶん!
    const showMallet = s.phase === 'aim' || s.phase === 'after';
    mallet.visible = showMallet;
    if (showMallet) {
      if (game.swing > 0) game.swing = Math.max(0, game.swing - dt * 2.5);
      const back = s.phase === 'aim' ? s.charge * 1.25 : 0;
      const swingAng = game.swing > 0.8 ? -0.25 : back * (1 - game.swing);
      mallet.position.set(-BLOCK_R - 0.25, BASE_Y + BLOCK_H / 2 + 0.9, 0.05);
      mallet.rotation.set(0, 0, swingAng);
      // ためると こづちが 光る(ちょうどいい ところで 金色)
      const [lo, hi] = s.tower.length ? windowOf(s) : [0, 0];
      const inWin = s.phase === 'aim' && s.charge >= lo && s.charge <= hi;
      mallet.userData.headMat.emissive.setHex(inWin ? 0xffc030 : 0xff5a20);
      mallet.userData.headMat.emissiveIntensity = s.phase === 'aim' ? s.charge * (inWin ? 0.9 : 0.5) : 0;
    }
    stage.update(time);
  }

  let freeCamera = false;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  function updateCamera(dt) {
    if (freeCamera || !game) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const s = game.state;
    // 正面から だるまと たたく 子。たてもちは すこし ひく
    camPos.set(-0.3, portrait ? 2.6 : 2.2, portrait ? 8.6 : 6.2);
    camLook.set(-0.3, portrait ? 1.3 : 1.1, 0);
    game.winCam = s.phase === 'finished' ? Math.min(1, (game.winCam ?? 0) + dt * 0.8) : 0;
    if (game.winCam > 0 && s.winner !== null) {
      const wp = game.units[s.winner].holder.position;
      const k = game.winCam * game.winCam * (3 - 2 * game.winCam);
      camPos.lerp(wp.clone().add(new THREE.Vector3(0, 1.6, portrait ? 6 : 4.5)), k);
      camLook.lerp(wp.clone().add(new THREE.Vector3(0, 0.9, 0)), k);
    }
    camera.fov = portrait ? 56 : 46;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      camera.position.lerpVectors(new THREE.Vector3(6, 14, 14), camPos, e);
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
  let time = 0, tickT = 0;
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
      game.acc += dt * (game.slow > 0 ? 0.25 : 1);
      while (game.acc >= STEP && s.phase !== 'finished') {
        const mi = myInput();
        const inputs = game.players.map((p, slot) => (p.cpu ? cpuInput(game.cpus[slot], s, slot) : mi));
        onEvents(step(s, inputs));
        game.acc -= STEP;
      }
      tickT -= dt;
      if (s.phase === 'aim' && s.charge > 0 && tickT <= 0) { tickT = 0.08; if (s.turn === 0) sfx.tick(s.charge); }
      if (game.endTimer !== null) {
        game.endTimer -= dt;
        if (game.endTimer <= 0) { game.endTimer = null; showResult(); }
      }
    }
    if (game && mode === 'playing') renderHud();
    const wdt = game?.slow > 0 ? dt * 0.25 : dt; // ヒットストップ
    if (game?.slow > 0) game.slow -= dt;
    if (game && !paused) { updateWorld(wdt); updateFx(wdt); }
    atmosphere.update(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  // E2E・確認用
  window.dotoshi = {
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
