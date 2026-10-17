// お祭りの 大なわとび の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
//
// 動かし方: 画面のどこでも おすと ジャンプ。おしつづけると 大ジャンプ(パソコンは スペース / エンター)。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonMaterial } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { RULES, STEP, createGame, ranking, step } from './rules.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { AXIS_Y, TURN_X, YAGURA, benchSpot, buildStage, slotX } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);
const HIGH_AMP = AXIS_Y - RULES.clearHigh - 0.08; // 大なみの なわの ふれはば(足もとより 高い ところを 通る)
const LOW_AMP = AXIS_Y - 0.03;
const SIDE = Math.PI / 2; // とぶ子の 向き(右を 向いて 1列に ならぶ)

export async function createNawa({ renderer, settings, getAudio, onExit }) {
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
    // ドン: やぐらの 大太鼓(なわが 足もとを 通るたび)
    drum() { voice({ type: 'triangle', pts: [[0, 110], [0.12, 55]], len: 0.2, gain: 0.18 }); noise({ len: 0.06, gain: 0.06, freq: [700, 160], type: 'lowpass' }); },
    // ひゅん: なわが 地面を たたく
    swish() { noise({ len: 0.12, gain: 0.05, freq: [2400, 900], q: 2 }); },
    jump() { voice({ pts: [[0, 520], [0.08, 780]], len: 0.1, gain: 0.05 }); },
    big() { voice({ type: 'triangle', pts: [[0, 600], [0.18, 1300]], len: 0.22, gain: 0.07 }); },
    caught() { voice({ type: 'square', pts: [[0, 330], [0.25, 140]], len: 0.3, gain: 0.06 }); },
    high() { [0, 0.12].forEach((at) => voice({ type: 'square', pts: [[0, 880]], len: 0.08, gain: 0.05, at })); },
    croak() { voice({ type: 'sawtooth', pts: [[0, 180], [0.1, 120]], len: 0.14, gain: 0.05, vib: 30, vibRate: 40 }); },
    safe() { voice({ type: 'triangle', pts: [[0, 660], [0.1, 990]], len: 0.16, gain: 0.06 }); },
    fanfare() {
      [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1047]].forEach(([at, f]) => voice({ type: 'square', pts: [[0, f]], len: 0.12, gain: 0.05, at }));
      voice({ type: 'square', pts: [[0, 1047]], len: 0.6, gain: 0.05, at: 0.5, vib: 12, vibRate: 7 });
    },
  };

  // ── 先生・回す子 ────────────────────────────────────
  await preload([...CHARACTERS.map((c) => c.key), 'hoho', 'risu', 'harinezumi']);
  const owl = await createModel('hoho');
  owl.root.position.set(YAGURA.x - 0.25, YAGURA.top + 0.07, YAGURA.z + 0.1);
  owl.play('idle');
  owl.setFace('normal');
  scene.add(owl.root);
  const turners = await Promise.all([['risu', -1], ['harinezumi', 1]].map(async ([kind, sx]) => {
    const m = await createModel(kind);
    m.root.position.set(sx * TURN_X, 0, 0);
    m.root.rotation.y = -sx * Math.PI / 2;
    m.root.scale.setScalar(1.35);
    m.play('idle');
    m.setFace('happy');
    scene.add(m.root);
    return { model: m, sx, arm: m.node(sx < 0 ? 'arm_R' : 'arm_L') || m.node('arm_R') };
  }));
  atmosphere.setupShadows([stage.group, owl.root, ...turners.map((t) => t.model.root)], [stage.group]);

  // ── なわ ───────────────────────────────────────────
  const rope = new THREE.Mesh(new THREE.BufferGeometry(), toonMaterial(0xf5c86a));
  rope.castShadow = true;
  scene.add(rope);
  const ropePts = Array.from({ length: 25 }, () => new THREE.Vector3());
  let amp = LOW_AMP;
  function shapeRope(theta) {
    for (let i = 0; i < ropePts.length; i++) {
      const u = i / (ropePts.length - 1);
      const f = Math.min(1, Math.sin(u * Math.PI) * 3.5); // まん中は 平ら(5人みんなの 足もとを 通る)
      ropePts[i].set((u * 2 - 1) * (TURN_X - 0.3), AXIS_Y - amp * f * Math.cos(theta), amp * f * Math.sin(theta) * 0.9);
    }
    rope.geometry.dispose();
    rope.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ropePts), 48, 0.045, 6);
  }

  // ── じゃまのカエル(小さな みどりの カエル) ─────────────────
  const frog = new THREE.Group();
  {
    const green = toonMaterial(0x5ab84a), belly = toonMaterial(0xd8f0a8), black = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), green);
    body.scale.set(1.1, 0.8, 1);
    body.position.y = 0.14;
    const tummy = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), belly);
    tummy.position.set(0, 0.12, 0.07);
    tummy.scale.set(1, 0.8, 0.8);
    frog.add(body, tummy);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), toonMaterial(0xffffff));
      eye.position.set(s * 0.08, 0.28, 0.05);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), black);
      pupil.position.set(s * 0.08, 0.29, 0.1);
      const leg = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), green);
      leg.position.set(s * 0.14, 0.05, -0.02);
      leg.scale.set(1, 0.6, 1.5);
      frog.add(eye, pupil, leg);
    }
    frog.visible = false;
    scene.add(frog);
  }
  const frogFx = { x: 0, targetX: 0, y: 0, vy: 0, enter: 0, leaving: false, nextHop: 0 };

  // ── きらきら・紙ふぶき ───────────────────────────────
  const fx = [];
  const puffGeo = new THREE.IcosahedronGeometry(0.1, 1);
  function puff(x, y, z, n = 3, color = 0xd8c8a0) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
      m.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 0.5, vel: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8), kind: 'puff' });
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
      f.obj.position.addScaledVector(f.vel, dt);
      if (f.kind === 'puff') {
        f.obj.scale.setScalar(1 + k * 1.5);
        f.obj.material.opacity = 0.8 * (1 - k);
      } else if (f.kind === 'confetti') {
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
  let held = false;
  let latch = false; // すごく みじかい タップ(フレームの あいだに はなした)も 1回は とどける

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
      model.actions.idle.time = Math.random() * 2;
      const holder = new THREE.Group();
      holder.add(model.root);
      holder.position.set(slotX(slot, players.length), 0, 0);
      scene.add(holder);
      const def = CHARACTERS.find((c) => c.key === p.character);
      return { slot, model, holder, size: def?.size || 1, home: holder.position.x, out: null, squash: 0 };
    }));
    const me = units[0];
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.28, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    me.holder.add(marker);
    me.marker = marker;
    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), units, acc: 0, endTimer: null, benchN: 0, holdT: 0 };
    atmosphere.apply(params.get('time') || state.timeOfDay);
    atmosphere.setupShadows(units.map((u) => u.holder), []);
    frog.visible = false;
    amp = LOW_AMP;
    held = false;
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoJ').classList.add('show');
    $('countJ').textContent = '0';
    if (!fromSky) splash('よーい…');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudJ').hidden = m !== 'playing';
    document.body.classList.toggle('ingame', m !== 'idle');
  }
  function leave(to) { onExit(to); }

  // ── 一時停止 ──────────────────────────────────────
  let paused = false;
  function setPaused(on) {
    if (mode === 'idle') { paused = false; return; }
    paused = on && mode === 'playing';
    $('pause').hidden = !paused;
    held = false;
  }
  const mine = (fn) => () => { if (mode !== 'idle') fn(); };
  $('pauseBtnJ').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: どこでも おす(おしているあいだ held) ─────────────
  const pointers = new Set();
  window.addEventListener('pointerdown', (e) => {
    if (mode !== 'playing' || paused || e.target.closest('button, a')) return;
    unlockAudio();
    pointers.add(e.pointerId);
    held = latch = true;
  });
  const up = (e) => { pointers.delete(e.pointerId); if (!pointers.size) held = false; };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('keydown', (e) => {
    if (mode !== 'playing') return;
    if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!paused); return; }
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); unlockAudio(); held = latch = true; }
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'Enter') held = false; });

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashJ');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function call(text, cls = '') {
    const el = $('callJ');
    el.textContent = text;
    el.className = 'call ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildChips() {
    $('chipsJ').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'chip' + (slot === 0 ? ' me' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      d.innerHTML = '<i></i>';
      return d;
    }));
  }
  function renderHud() {
    const s = game.state;
    [...$('chipsJ').children].forEach((c, i) => c.classList.toggle('out', !s.alive[i]));
    // 長おしの 輪(大ジャンプまで)
    const me = s.runners[0];
    const k = me.air && me.holdT >= 0 ? Math.min(1, me.holdT / RULES.holdTime) : me.air && game.bigAt === me.jumps ? 1 : 0;
    $('holdJ').style.setProperty('--k', k.toFixed(3));
    $('holdJ').classList.toggle('full', k >= 1);
    $('holdJ').hidden = s.phase !== 'play' || !s.alive[0];
  }
  const tmpV = new THREE.Vector3();
  function pop(text, x, y, z, cls = '', life = 800) {
    tmpV.set(x, y, z).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsJ').append(el);
    setTimeout(() => el.remove(), life);
  }

  // ── できごと ────────────────────────────────────────
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'start':
          splash('はじめ!');
          setTimeout(() => $('howtoJ').classList.remove('show'), 7000);
          break;
        case 'top':
          if (e.kind === 'high') {
            call('大なみ!', 'high');
            sfx.high();
            for (const t of turners) t.model.setFace('surprised');
          } else for (const t of turners) t.model.setFace('happy');
          break;
        case 'jump':
          if (e.who === 0) sfx.jump();
          break;
        case 'big': {
          const u = game.units[e.who];
          if (e.who === 0) { sfx.big(); game.bigAt = s.runners[0].jumps; }
          puff(u.holder.position.x, 0.05, 0, 3, 0xffe8a8);
          break;
        }
        case 'land':
          game.units[e.who].squash = 1;
          break;
        case 'pass': {
          sfx.drum();
          sfx.swish();
          owl.play('flap', { fade: 0.05 });
          $('countJ').textContent = String(e.n);
          for (const i of e.caught) {
            const u = game.units[i];
            if (e.redo) { pop('あっ!', u.holder.position.x, 1.6 * u.size, 0, 'out'); continue; }
            u.out = { t: 0, bench: benchSpot(game.benchN++) };
            pop('あうっ!', u.holder.position.x, 1.6 * u.size, 0, i === 0 ? 'red' : 'out');
            puff(u.holder.position.x, 0.05, 0, 4);
          }
          if (e.redo) { splash('みんな ひっかかった!\nもう1回', 'small'); sfx.safe(); }
          else if (e.caught.includes(0)) { splash('ひっかかった…', 'red small'); sfx.caught(); }
          else if (e.caught.length) sfx.caught();
          break;
        }
        case 'frog':
          frog.visible = true;
          frogFx.leaving = false;
          frogFx.enter = 0;
          frogFx.targetX = gapX(e.gap);
          frogFx.x = frogFx.targetX + (frogFx.targetX < 0 ? -4 : 4);
          sfx.croak();
          break;
        case 'frogLeave':
          frogFx.leaving = true;
          break;
        case 'finished': {
          game.endTimer = 4.5;
          const win = e.winner === 0;
          splash(win ? 'さいごの 1人!' : 'しゅうりょう!', win ? 'gold' : '');
          if (win) sfx.fanfare();
          confetti(game.units[e.winner].holder.position.x, 0);
          break;
        }
      }
    }
  }
  // カエルが 入る すきま(gap 番目の子の ひだり)
  function gapX(gap) {
    const n = game.players.length;
    if (gap <= 0) return slotX(0, n) - 0.4;
    if (gap >= n) return slotX(n - 1, n) + 0.4;
    return (slotX(gap - 1, n) + slotX(gap, n)) / 2;
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
    $('resultTitle').textContent = order[0] === 0 ? 'あなたの 勝ち!' : `${order.indexOf(0) + 1}位`;
    $('ranks').replaceChildren(...order.map((slot, i) => {
      const p = game.players[slot];
      const r = s.runners[slot];
      const li = document.createElement('li');
      if (slot === 0) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : 'あなた';
      const def = CHARACTERS.find((c) => c.key === p.character);
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}</small></span><span class="dist">${r.clears}<small>かい とんだ</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateUnits(dt) {
    const s = game.state;
    for (const u of game.units) {
      const r = s.runners[u.slot];
      u.squash = Math.max(0, u.squash - dt * 6);
      let clip = 'idle', face = 'normal', x = u.home, y = r.y, z = 0, rotY = SIDE; // とぶ子は みんな 同じ 横向き
      if (u.out) {
        // ひっかかった: その場で ころんで、うしろの ベンチへ
        u.out.t += dt;
        const k = Math.min(1, Math.max(0, (u.out.t - 1.0) / 0.9));
        x = u.home + (u.out.bench.x - u.home) * k;
        z = u.out.bench.z * k;
        y = 0;
        clip = u.out.t < 1.0 ? 'dizzy' : k < 1 ? 'run' : 'idle';
        face = u.out.t < 1.0 ? 'frustrated' : 'normal';
        rotY = k <= 0 ? SIDE : k < 1 ? Math.atan2(u.out.bench.x - u.home, u.out.bench.z) : 0;
        if (s.phase === 'finished') { clip = 'wave'; face = 'happy'; }
      } else if (s.phase === 'finished') {
        clip = 'cheer'; face = 'happy'; rotY = 0; // 勝った子は こちらを 向いて よろこぶ
        y = Math.abs(Math.sin(time * 6)) * 0.3;
      } else if (r.air) {
        clip = 'cheer'; face = r.vy > 0 ? 'happy' : 'surprised';
      } else if (s.phase === 'play') {
        // なわが 近づくと 身がまえる
        face = 'normal';
      }
      u.holder.position.set(x, y, z);
      u.holder.rotation.y = rotY;
      const sq = u.squash * 0.18;
      u.model.root.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
      u.model.play(clip, { timeScale: clip === 'cheer' && r.air ? 0.3 : 1 });
      u.model.setFace(face);
      u.model.update(dt);
      if (u.marker) {
        u.marker.visible = !u.out;
        u.marker.position.set(0, 2.0 * u.size + 0.08 * Math.sin(performance.now() / 180), 0);
      }
    }
    // なわ: 大なみの 1回は ふれはばを 小さく(高い ところを 通る)
    const r = s.rope;
    const target = s.phase === 'play' && r.kind === 'high' ? HIGH_AMP : LOW_AMP;
    amp += (target - amp) * Math.min(1, dt * 6);
    shapeRope(s.phase === 'ready' ? Math.PI : r.theta);
    for (const t of turners) {
      if (t.arm) t.arm.rotation.x = -1.2 + Math.sin(r.theta) * 0.6 * t.sx;
      t.model.update(dt);
    }
    // カエル: くずれた リズムで ぴょこぴょこ
    if (frog.visible) {
      frogFx.x += (frogFx.leaving ? (frogFx.x < 0 ? -1 : 1) * dt * 3 : (frogFx.targetX - frogFx.x) * Math.min(1, dt * 3));
      frogFx.vy -= 18 * dt;
      frogFx.y = Math.max(0, frogFx.y + frogFx.vy * dt);
      if (frogFx.y <= 0 && time >= frogFx.nextHop) {
        frogFx.vy = 2.6 + Math.random() * 2;
        frogFx.nextHop = time + 0.15 + Math.random() * 0.7;
        if (Math.random() < 0.3) sfx.croak();
      }
      frog.position.set(frogFx.x, frogFx.y, 0.25);
      frog.rotation.y = frogFx.leaving ? (frogFx.x < 0 ? -Math.PI / 2 : Math.PI / 2) : Math.sin(time * 3) * 0.4;
      if (Math.abs(frogFx.x) > 8) frog.visible = false;
    }
  }

  let freeCamera = false;
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const pos = portrait ? new THREE.Vector3(0, 3.0, 14.2) : new THREE.Vector3(0, 2.3, 8.0);
    const look = new THREE.Vector3(0, portrait ? 1.9 : 1.2, -1.2);
    camera.fov = portrait ? 58 : 44;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      const sky = new THREE.Vector3(0, 12, -12);
      camera.position.lerpVectors(sky, pos, e);
      camera.userData.look = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 2, -6), look, Math.min(1, e * 1.1));
      camera.lookAt(camera.userData.look);
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 4);
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
  let frozen = false;
  function frame(rawDt) {
    const dt = Math.min(rawDt, 0.1);
    time += dt;
    if (mode === 'playing' && intro >= 1) watchQuality(rawDt);
    if (intro < 1 && !paused) {
      intro = Math.min(1, intro + dt / INTRO_TIME);
      if (intro >= 1) splash('よーい…');
    }
    if (game && mode === 'playing' && !paused && !frozen && intro >= 1) {
      const s = game.state;
      game.acc += dt;
      while (game.acc >= STEP && s.phase !== 'finished') {
        const inputs = game.players.map((p, slot) => (p.cpu ? cpuInput(game.cpus[slot], s, slot) : held || latch));
        latch = false;
        onEvents(step(s, inputs));
        game.acc -= STEP;
      }
      if (s.phase === 'play' && s.t > RULES.readyTime + 7) $('howtoJ').classList.remove('show');
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
      updateUnits(dt);
      updateFx(dt);
    }
    if (!paused) {
      for (const t of turners) if (!game) t.model.update(dt);
      owl.update(dt);
      if (owl.current === 'flap' && owl.actions.flap.time > 0.4) owl.play('idle');
      // ちょうちんが ゆらゆら
      stage.lanterns.forEach((l, i) => { l.position.x += Math.sin(time * 1.3 + i) * 0.0008; });
    }
    atmosphere.update(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  // E2E・確認用
  window.dnawa = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    hold: (on) => { held = on; },
    // 描かずに、みんな CPU で sec 秒すすめる(自分も CPU)
    advance: (sec) => {
      const me = game.meCpu || (game.meCpu = createCpu('normal', 1, 0));
      for (let i = 0; i < sec / STEP && game.state.phase !== 'finished'; i++) {
        onEvents(step(game.state, game.players.map((p, slot) => cpuInput(slot ? game.cpus[slot] : me, game.state, slot))));
      }
    },
    get paused() { return paused; },
    // 時間を 止める(確認用。止めても 描くのは つづける)
    freeze: (on) => { frozen = on; },
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
      held = false;
      pointers.clear();
    },
    get intro() { return intro; },
  };
}
