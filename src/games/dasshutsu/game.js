// どんぐりマンション だっしゅつ の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
// マンションは 手前の かべが ない 切り口(ドールハウス)で見せるので、ほかの階の子の ようすも見える。
//
// 動かし方: どこでもスティックで走って、ドアの前で 右下の「あける」。パソコンは 矢印キー / WASD と スペース。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { HALL_W, RULES, STEP, TOP, createGame, doorAt, hintOn, ranking, step, timeLeft } from './rules.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { DOOR_COLORS, DOOR_H, buildStage, floorY, makeDoor } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);
const floorName = (f) => `${f + 1}かい`;

export async function createDasshutsu({ renderer, settings, getAudio, onExit }) {
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
    // ガチャ: ドアを あける
    open(vol = 1) { noise({ len: 0.06, gain: 0.12 * vol, freq: [2500, 1200], q: 3 }); voice({ type: 'square', pts: [[0, 300], [0.08, 200]], len: 0.1, gain: 0.03 * vol, at: 0.05 }); },
    // ポワン?: ふしぎ(同じドアから出てくる)
    fushigi(vol = 1) { voice({ pts: [[0, 500], [0.25, 900], [0.5, 600]], len: 0.55, gain: 0.08 * vol, vib: 30, vibRate: 9 }); },
    // トントントン: かいだんを おりる
    stairs(vol = 1) { for (let i = 0; i < 4; i++) voice({ type: 'triangle', pts: [[0, 660 - i * 80], [0.05, 500 - i * 60]], len: 0.07, gain: 0.07 * vol, at: i * 0.12 }); },
    // シューッ: すべり台
    slide(vol = 1) { noise({ len: 1.0, gain: 0.12 * vol, freq: [3000, 600], q: 0.8, attack: 0.05 }); voice({ pts: [[0, 1200], [0.9, 300]], len: 1.0, gain: 0.05 * vol }); },
    // ヒューン↑: 上へ もどされる
    up(vol = 1) { voice({ pts: [[0, 300], [0.5, 1000]], len: 0.6, gain: 0.07 * vol }); },
    // キラン: ヒントの印
    kiran() { [1568, 2093].forEach((f, i) => voice({ pts: [[0, f]], len: 0.25, gain: 0.05, at: i * 0.07 })); },
    fanfare() {
      [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1047]].forEach(([at, f]) => voice({ type: 'square', pts: [[0, f]], len: 0.12, gain: 0.05, at }));
      voice({ type: 'square', pts: [[0, 1047]], len: 0.6, gain: 0.05, at: 0.5, vib: 12, vibRate: 7 });
    },
  };

  // ── ドア(階ごとに、試合のたびに作る) ───────────────────
  const doorGroups = {}; // floor → [door group]
  const marks = []; // まちがいの しるし
  const markTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,255,255,.9)';
    g.lineWidth = 9;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(14, 14); g.lineTo(50, 50); g.moveTo(50, 14); g.lineTo(14, 50); g.stroke();
    return new THREE.CanvasTexture(c);
  })();
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,240,170,1)');
    r.addColorStop(0.35, 'rgba(255,210,80,.8)');
    r.addColorStop(1, 'rgba(255,190,40,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const hintSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  hintSp.scale.setScalar(1.2);
  hintSp.visible = false;
  scene.add(hintSp);
  const hintSprites = [];
  function buildDoors(s) {
    for (const f of Object.keys(doorGroups)) for (const d of doorGroups[f]) scene.remove(d);
    for (const m of marks.splice(0)) scene.remove(m);
    for (const h of hintSprites.splice(0)) scene.remove(h);
    for (let f = TOP; f >= 1; f--) {
      doorGroups[f] = s.floors[f].doors.map((d, i) => {
        const g = makeDoor(DOOR_COLORS[(i + f) % DOOR_COLORS.length], String(i + 1));
        g.position.set(d.x, floorY(f), 0);
        scene.add(g);
        return g;
      });
      // ヒントの印(ただしいドアの上の どんぐり)
      const di = s.floors[f].doors.findIndex((d) => d.kind === 'down');
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      sp.position.set(s.floors[f].doors[di].x, floorY(f) + DOOR_H + 0.35, 0.15);
      sp.scale.setScalar(0.9);
      sp.userData.floor = f;
      scene.add(sp);
      hintSprites.push(sp);
    }
    atmosphere.setupShadows(Object.values(doorGroups).flat(), []);
  }
  function markDoor(f, i) {
    const d = doorGroups[f]?.[i];
    if (!d || d.userData.marked) return;
    d.userData.marked = true;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex, color: 0xff6a5a, transparent: true, depthWrite: false }));
    m.position.set(d.position.x, d.position.y + DOOR_H + 0.3, 0.12);
    m.scale.setScalar(0.42);
    scene.add(m);
    marks.push(m);
  }

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
  const confettiGeo = new THREE.PlaneGeometry(0.12, 0.07);
  function confetti(x, y, z) {
    const colors = [...PLAYER_COLORS.map((c) => c.hex), 0xffd24a, 0xffffff];
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true }));
      m.position.set(x + (Math.random() - 0.5) * 3, y + 2.4 + Math.random() * 1.5, z + (Math.random() - 0.5) * 1.5);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 3, floorY: y, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, -(0.7 + Math.random() * 0.6), (Math.random() - 0.5) * 0.4), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), kind: 'confetti' });
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
      } else if (f.kind === 'confetti') {
        f.obj.position.addScaledVector(f.vel, dt);
        f.obj.rotation.x += f.spin.x * dt;
        f.obj.rotation.y += f.spin.y * dt;
        f.obj.material.opacity = Math.min(1, (1 - k) * 3);
        if (f.obj.position.y < f.floorY + 0.02) { f.obj.position.y = f.floorY + 0.02; f.vel.set(0, 0, 0); f.spin.set(0, 0, 0); }
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
  const input = { touch: null, stick: null, keys: new Set(), target: null, open: false };
  await preload(CHARACTERS.map((c) => c.key));

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS });
    if (game) for (const r of game.runners) scene.remove(r.holder);
    for (const f of fx.splice(0)) scene.remove(f.obj);
    const state = createGame(players, seed);
    buildDoors(state);
    const runners = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const holder = new THREE.Group();
      holder.add(model.root);
      scene.add(holder);
      const def = CHARACTERS.find((c) => c.key === p.character);
      return { model, holder, size: def.size || 1, face: Math.PI, lastAct: null, happyT: 0 };
    }));
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    runners[0].holder.add(marker);
    runners[0].marker = marker;
    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), runners, acc: 0, endTimer: null, lastHint: false };
    atmosphere.apply(params.get('time') || state.timeOfDay);
    atmosphere.setupShadows(runners.map((r) => r.holder), [stage.group]);
    Object.assign(input, { touch: null, stick: null, target: null, open: false });
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoD').classList.add('show');
    if (!fromSky) splash('よーい…');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudD').hidden = m !== 'playing';
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
  $('pauseBtnD').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: どこでもスティック + あけるボタン ───────────────
  const STICK_R = 56;
  const FULL = 26, DEAD = 6;
  const stickEl = $('stickD'), knobEl = stickEl.firstElementChild;
  const openEl = $('openD');
  const playing = () => mode === 'playing' && !paused;
  openEl.addEventListener('pointerdown', (e) => {
    if (!playing()) return;
    e.preventDefault();
    e.stopPropagation();
    unlockAudio();
    input.open = true;
    openEl.classList.add('down');
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) openEl.addEventListener(ev, () => openEl.classList.remove('down'));
  window.addEventListener('pointerdown', (e) => {
    if (!playing() || input.touch !== null || e.target.closest('button, a')) return;
    unlockAudio();
    input.touch = e.pointerId;
    input.stick = { ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    stickEl.style.left = `${e.clientX}px`;
    stickEl.style.top = `${e.clientY}px`;
    knobEl.style.transform = 'translate(-50%, -50%)';
    stickEl.hidden = false;
    $('howtoD').classList.remove('show');
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
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); unlockAudio(); input.open = true; return; }
    if (KEYS[e.code]) {
      e.preventDefault();
      unlockAudio();
      input.keys.add(e.code);
      $('howtoD').classList.remove('show');
    }
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.touch = null; input.stick = null; stickEl.hidden = true; });

  function myInput() {
    const open = input.open;
    input.open = false;
    if (input.target) return { ...input.target, open: input.target.open ?? open };
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
    if (Math.hypot(sx, sy) < 0.05) return { x: null, z: null, open };
    // カメラは まっすぐ前(-z)を見ているので、画面の右 = +x、画面の上 = 奥(-z)
    return { x: me.x + sx * 0.5, z: me.z + sy * 0.5, open };
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashD');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function notice(text, slot) {
    const el = $('noticeD');
    el.innerHTML = `<i style="background:${css(PLAYER_COLORS[slot].hex)}"></i>${text}`;
    el.className = 'notice';
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildChips() {
    $('chipsD').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'chip' + (slot === 0 ? ' me' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      d.innerHTML = `<i></i><b></b>`;
      d.title = p.name;
      return d;
    }));
  }
  function renderHud() {
    const s = game.state;
    const order = ranking(s);
    const chips = [...$('chipsD').children];
    order.forEach((slot, rank) => {
      const c = chips[slot];
      const r = s.runners[slot];
      c.style.order = rank;
      c.lastChild.textContent = r.done ? `${s.finished.indexOf(slot) + 1}位` : `${r.floor + 1}F`;
      c.classList.toggle('done', r.done);
    });
    const me = s.runners[0];
    $('floorD').firstChild.nodeValue = me.done ? 'ゴール' : `${me.floor + 1}`;
    $('floorD').classList.toggle('done', me.done);
    $('timeD').textContent = s.phase === 'play' ? `のこり ${Math.ceil(timeLeft(s))}` : '';
    // あけるボタン: ドアの前に いるときだけ 光る
    const near = !me.done && !me.act && doorAt(s, me.floor, me.x, me.z) >= 0;
    openEl.classList.toggle('near', near);
    openEl.disabled = me.done;
  }
  const tmpV = new THREE.Vector3();
  function pop(text, x, y, z, cls = '') {
    tmpV.set(x, y, z).project(camera);
    if (tmpV.z > 1 || Math.abs(tmpV.x) > 1.1 || Math.abs(tmpV.y) > 1.1) return;
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsD').append(el);
    setTimeout(() => el.remove(), 1200);
  }

  // ── できごと ────────────────────────────────────────
  function volFor(slot, floor) {
    if (slot === 0) return 1;
    const me = game.state.runners[0];
    return floor === me.floor ? 0.4 : 0.12;
  }
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      const r = e.slot !== undefined ? s.runners[e.slot] : null;
      switch (e.type) {
        case 'start':
          splash('スタート!');
          setTimeout(() => $('howtoD').classList.remove('show'), 6000);
          voice({ type: 'triangle', pts: [[0, 784]], len: 0.12, gain: 0.12 });
          voice({ type: 'triangle', pts: [[0, 1046]], len: 0.25, gain: 0.12, at: 0.12 });
          break;
        case 'open':
          sfx.open(volFor(e.slot, e.floor));
          break;
        case 'wrong':
          break;
        case 'out': {
          markDoor(e.floor, e.door);
          sfx.fushigi(volFor(e.slot, e.floor));
          pop(e.slot === 0 ? 'あれれ? もどってきた…' : '?', r.x, floorY(e.floor) + 2.0, r.z, e.slot === 0 ? 'me' : '');
          break;
        }
        case 'down':
          sfx.stairs(volFor(e.slot, e.floor));
          if (e.slot === 0) pop('あたり!', r.x, floorY(e.floor) + 2.0, 0.4, 'gold');
          break;
        case 'slide':
          sfx.slide(volFor(e.slot, e.floor));
          if (e.slot === 0) splash('すべり台! 2かい下へ', 'gold');
          else notice(`${game.players[e.slot].name}が すべり台!`, e.slot);
          break;
        case 'upstairs':
          markDoor(e.floor, e.door);
          sfx.up(volFor(e.slot, e.floor));
          if (e.slot === 0) splash('上の階に もどった!', 'red');
          break;
        case 'arrive':
          if (e.slot === 0) splash(floorName(e.floor));
          break;
        case 'goal': {
          game.runners[e.slot].happyT = 99;
          if (e.slot === 0) { splash(e.rank === 1 ? 'いちばんで だっしゅつ!' : `${e.rank}ばんめに だっしゅつ!`, 'gold'); sfx.fanfare(); }
          else notice(`${game.players[e.slot].name}が ${e.rank}ばんめに だっしゅつ!`, e.slot);
          if (e.rank === 1) confetti(0, 0, 1.2);
          break;
        }
        case 'finished':
          game.endTimer = 3.0;
          splash(e.timeUp ? 'そこまで!' : 'しゅうりょう!');
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
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = game.players[slot];
      const r = s.runners[slot];
      const li = document.createElement('li');
      if (slot === 0) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : 'あなた';
      const def = CHARACTERS.find((c) => c.key === p.character);
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}</small></span><span class="dist">${r.done ? `${r.time.toFixed(1)}びょう` : `${r.floor + 1}かい`}<small>まちがい ${r.wrong}</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
  function updateRunners(dt) {
    const s = game.state;
    // ドアを開けている子(ドアごと)
    const opening = new Set();
    s.runners.forEach((r, i) => {
      const v = game.runners[i];
      v.happyT = Math.max(0, v.happyT - dt);
      let clip = 'idle', face = 'normal', timeScale = 1;
      let x = r.x, y = floorY(r.floor), z = r.z, vis = true, want = v.face;
      const a = r.act;
      if (r.done) {
        // 1かいの ロビーで、ゴールした順に ならんで よろこぶ
        const k = s.finished.indexOf(i);
        x = -2 + k * 1.0; y = 0; z = 1.6;
        clip = 'cheer'; face = 'happy'; want = 0;
      } else if (a) {
        const door = s.floors[r.floor].doors[a.door];
        if (a.kind === 'enter') {
          // ドアへ 入っていく
          const k = 1 - a.t / RULES.enterTime;
          x = door.x; z = Math.max(-0.4, 0.5 - k * 0.9);
          want = Math.PI;
          clip = 'run';
          opening.add(`${r.floor}:${a.door}`);
        } else if (a.kind === 'daze') {
          // 同じドアから 出てきて「あれれ?」
          if (a.t > RULES.dazeTime - 0.2) opening.add(`${r.floor}:${a.door}`);
          clip = 'dizzy'; face = 'surprised'; want = 0;
        } else vis = false; // ドアの中・かいだん・すべり台
      } else {
        const speed = Math.hypot(r.vx, r.vz);
        if (speed > 0.3) { clip = 'run'; timeScale = 0.6 + 0.6 * speed / RULES.maxSpeed; want = r.face; }
        if (s.phase === 'finished') { clip = 'wave'; face = 'frustrated'; }
      }
      if (v.happyT > 0 && !r.done) face = 'happy';
      v.holder.visible = vis;
      v.holder.position.set(x, y, z);
      v.face = want;
      v.model.root.rotation.y = lerpAngle(v.model.root.rotation.y, want, 1 - Math.exp(-dt * 14));
      v.model.play(clip, { timeScale });
      v.model.setFace(face);
      v.model.update(dt);
      if (v.marker) v.marker.position.set(0, 2.0 * v.size + 0.08 * Math.sin(performance.now() / 180), 0);
    });
    // ドアの あけしめ
    for (const [f, list] of Object.entries(doorGroups)) {
      list.forEach((d, i) => {
        const u = d.userData;
        u.want = opening.has(`${f}:${i}`) ? 1 : 0;
        u.open += (u.want - u.open) * (1 - Math.exp(-dt * (u.want ? 14 : 7)));
        u.hinge.rotation.y = -u.open * 1.7;
      });
    }
    // ヒントの印
    const me = s.runners[0];
    for (const sp of hintSprites) {
      const on = hintOn(s, sp.userData.floor);
      sp.material.opacity += ((on ? 1 : 0) - sp.material.opacity) * (1 - Math.exp(-dt * 12));
      sp.scale.setScalar(0.7 + sp.material.opacity * 0.5 + Math.sin(time * 10) * 0.05);
      if (on && sp.userData.floor === me.floor && !sp.userData.was) sfx.kiran();
      sp.userData.was = on;
    }
  }

  let freeCamera = false;
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const s = game?.state;
    const me = s?.runners[0];
    let pos, look;
    if (!me || me.done || s.phase === 'finished' || mode === 'result') {
      // ゴールしたら(おわったら)マンションぜんたいを 引いて見せる
      pos = portrait ? new THREE.Vector3(0, 9.5, 27) : new THREE.Vector3(0, 8.5, 19);
      look = new THREE.Vector3(0, portrait ? 8.2 : 7.8, 0);
    } else {
      // 自分の階を 前から。左右は自分を追う(ろうかの はしは 少し内がわまで)
      const lim = HALL_W - (portrait ? 2.6 : 3.6);
      const x = Math.max(-lim, Math.min(lim, me.x * 0.8));
      const y = floorY(me.floor);
      pos = portrait ? new THREE.Vector3(x, y + 2.4, 12.5) : new THREE.Vector3(x, y + 2.0, 8.6);
      look = new THREE.Vector3(x, y + 1.2, 0);
    }
    camera.fov = portrait ? 58 : 46;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      // マンションの てっぺんの上から、5かいへ おりてくる
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(0, floorY(TOP) + 16, 26);
      camera.position.lerpVectors(sky, pos, e);
      camera.userData.look = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, floorY(TOP) + 2, 0), look, Math.min(1, e * 1.1));
      camera.lookAt(camera.userData.look);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 5);
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
      updateFx(dt);
    }
    atmosphere.update(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  // E2E 用の口
  window.ddasshutsu = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    steer: (t) => { input.target = t; },
    open: () => { input.open = true; },
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
      input.touch = null;
      input.stick = null;
      $('stickD').hidden = true;
      input.keys.clear();
    },
    get intro() { return intro; },
  };
}
