// 森の 倒れ木の どんぐりボウリング の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
//
// 投げ方: 画面を 上へ シュッと はじく(スワイプ)。はやさ = いきおい、向き = すすむ 向き、
// さいごに まげると ひねり(カーブ)。パソコンは マウスで おなじ。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { RULES, STEP, canThrow, createGame, ranking, step } from './rules.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { ballMesh, buildStage, laneX, obstacleMesh, pinMesh, toWorld } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SCALE = 0.55;

// スワイプ → 投げかた
export function swipeToThrow(pts) {
  // はなす まえに とまった 点は のぞく(とまって 0.3 秒 たったら はじいて いない)
  let n = pts.length;
  while (n > 1 && pts[n - 1].x === pts[n - 2].x && pts[n - 1].y === pts[n - 2].y) n--;
  if (n < 2 || pts[pts.length - 1].t - pts[n - 1].t > 300) return null;
  pts = pts.slice(0, n);
  const end = pts[pts.length - 1];
  // さいごの 0.12 秒の うごきで いきおいと 向き
  let k = pts.length - 1;
  while (k > 0 && end.t - pts[k - 1].t < 120) k--;
  const a = pts[Math.max(0, k - 1)];
  const dt = Math.max(16, end.t - a.t) / 1000;
  const vx = (end.x - a.x) / dt, vy = (end.y - a.y) / dt;
  if (vy > -250) return null; // 上へ はじいて いない
  const v = Math.hypot(vx, vy);
  // まがり: はじめの 半分の 向きと、さいごの 向きの ちがい
  const start = pts[0], mid = pts[Math.floor(pts.length / 2)];
  const a0 = Math.atan2(mid.x - start.x, -(mid.y - start.y));
  const a1 = Math.atan2(vx, -vy);
  const bend = Math.hypot(mid.x - start.x, mid.y - start.y) > 25 ? a1 - a0 : 0;
  return {
    angle: clamp(Math.atan2(vx, -vy) * 0.2, -RULES.maxAngle, RULES.maxAngle),
    speed: clamp((v - 400) / 2400, 0, 1),
    spin: clamp(bend / 0.55, -1, 1),
  };
}

export async function createBowl({ renderer, settings, getAudio, onExit }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 900);
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
    for (const [dt, f] of pts) o.frequency.setValueAtTime(f, t + dt);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + len + 0.02);
  }
  function noise({ len, gain, freq, type = 'bandpass', q = 1, at = 0, attack = 0.005 }) {
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
  // 効果音の 高さは 450〜1600Hz(BGM が あけて いる 帯域)
  const sfx = {
    throw() { noise({ len: 0.25, gain: 0.05, freq: [700, 1400], q: 1.2 }); },
    roll() { noise({ len: 0.5, gain: 0.03, freq: [500, 460], q: 2, attack: 0.08 }); },
    pin(n) { const f = 900 + Math.random() * 400; noise({ len: 0.08, gain: 0.05 + Math.min(n, 4) * 0.01, freq: [f, f * 0.8], q: 4 }); voice({ type: 'triangle', pts: [[0, f * 0.6]], len: 0.06, gain: 0.025 }); },
    bump() { voice({ type: 'triangle', pts: [[0, 620], [0.05, 480]], len: 0.1, gain: 0.05 }); noise({ len: 0.06, gain: 0.04, freq: [1200, 700], q: 3 }); },
    gutter() { voice({ type: 'triangle', pts: [[0, 700], [0.3, 470]], len: 0.35, gain: 0.04 }); },
    strike() { [[0, 784], [0.09, 988], [0.18, 1175], [0.27, 1568]].forEach(([at, f], i) => voice({ type: 'square', pts: [[0, f]], len: i === 3 ? 0.4 : 0.1, gain: 0.04, at })); },
    spare() { [[0, 659], [0.1, 880], [0.2, 1319]].forEach(([at, f]) => voice({ type: 'triangle', pts: [[0, f]], len: 0.14, gain: 0.05, at })); },
    gold() { [[0, 1047], [0.07, 1319], [0.14, 1568]].forEach(([at, f]) => voice({ pts: [[0, f]], len: 0.3, gain: 0.04, at })); },
    go() { voice({ type: 'square', pts: [[0, 880]], len: 0.18, gain: 0.05 }); },
    whistle() { voice({ pts: [[0, 1500], [0.5, 900]], len: 0.6, gain: 0.04 }); },
    fanfare() { [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1047], [0.5, 1047]].forEach(([at, f], i) => voice({ type: 'square', pts: [[0, f]], len: i === 4 ? 0.6 : 0.12, gain: 0.05, at })); },
  };

  await preload(CHARACTERS.map((c) => c.key));

  // ── 演出 ────────────────────────────────────────
  const fx = [];
  function spark(at, n = 8, color = 0xffe066, sp = 2) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.03 + Math.random() * 0.03), new THREE.MeshBasicMaterial({ color: i % 3 ? color : 0xffffff, transparent: true }));
      m.position.copy(at);
      scene.add(m);
      const a = Math.random() * 6.28;
      fx.push({ obj: m, t: 0, life: 0.6, vel: new THREE.Vector3(Math.cos(a) * sp * 0.5, 0.8 + Math.random() * 1.6, Math.sin(a) * sp * 0.5), kind: 'drop' });
    }
  }
  function confetti(at, n = 40) {
    const cols = [0xff6a9a, 0xffd24a, 0x7ad8ff, 0x8ad04a, 0xff8a3a];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.1), new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, transparent: true }));
      m.position.copy(at);
      scene.add(m);
      const a = Math.random() * 6.28;
      fx.push({ obj: m, t: 0, life: 2.4, vel: new THREE.Vector3(Math.cos(a) * 1.5 * Math.random(), 2.4 + Math.random() * 2, Math.sin(a) * Math.random()), kind: 'paper', spin: Math.random() * 8 });
    }
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = f.t / f.life;
      f.obj.position.addScaledVector(f.vel, dt);
      if (f.kind === 'drop') f.vel.y -= 6 * dt;
      if (f.kind === 'paper') { f.vel.multiplyScalar(1 - dt * 1.2); f.vel.y -= 3 * dt; f.obj.rotation.x += f.spin * dt; f.obj.rotation.y += f.spin * 0.7 * dt; }
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
  const input = { pts: null, id: null, pending: null };

  function buildLaneProps() {
    // ピンと じゃまものを いまの state に あわせて 作りなおす(フレームの はじめ)
    const s = game.state;
    for (const L of game.lanes) {
      for (const m of L.pins) scene.remove(m);
      for (const m of L.obstacles) scene.remove(m);
    }
    game.lanes.forEach((L, slot) => {
      L.pins = s.lanes[slot].pins.map((p) => {
        const m = pinMesh(p.gold);
        toWorld(slot, p.x, p.y, m.position);
        m.userData = { fall: 0, dir: Math.random() * 6.28, spinY: Math.random() * 6 };
        scene.add(m);
        return m;
      });
      L.obstacles = s.obstacles.map((o) => {
        const m = obstacleMesh(o);
        toWorld(slot, o.x, o.y, m.position);
        m.position.y += 0;
        scene.add(m);
        return m;
      });
    });
    game.frameShown = s.frame;
  }

  async function startGame({ fromSky = false } = {}) {
    const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS });
    if (game) {
      for (const u of game.units) scene.remove(u.holder);
      for (const L of game.lanes) { scene.remove(L.ball); for (const m of [...L.pins, ...L.obstacles]) scene.remove(m); }
    }
    for (const f of fx.splice(0)) scene.remove(f.obj);
    const state = createGame(players, seed);
    const units = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const holder = new THREE.Group();
      holder.add(model.root);
      holder.scale.setScalar(SCALE);
      holder.position.set(laneX(slot) - 0.62, 0, 0.8);
      holder.rotation.y = Math.PI; // おくを 向く
      scene.add(holder);
      return { model, holder, act: 0 };
    }));
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
    marker.rotation.x = Math.PI;
    units[0].holder.add(marker);
    units[0].marker = marker;
    const lanes = players.map((p, slot) => {
      const ball = ballMesh();
      toWorld(slot, 0, 0, ball.position);
      scene.add(ball);
      return { ball, pins: [], obstacles: [], rollX: 0 };
    });
    // ねらいの 矢じるし(自分の レーンだけ)
    const guide = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 3).translate(0, 1.5, 0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
    guide.position.set(laneX(0), 0.01, -0.2);
    guide.visible = false;
    scene.add(guide);
    if (game?.guide) scene.remove(game.guide);
    game = { seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), units, lanes, guide, acc: 0, endTimer: null, shake: 0, frameShown: -1, pinCount: 0 };
    buildLaneProps();
    atmosphere.apply(params.get('time') || 'day');
    atmosphere.setupShadows([...units.map((u) => u.holder), ...lanes.map((l) => l.ball)], [stage.group]);
    Object.assign(input, { pts: null, id: null, pending: null });
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoBo').classList.add('show');
    if (!fromSky) splash('よーい…');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudBo').hidden = m !== 'playing';
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
  $('pauseBtnBo').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: 上へ はじく ─────────────────────────────
  const playing = () => mode === 'playing' && !paused && game && intro >= 1;
  window.addEventListener('pointerdown', (e) => {
    if (!playing() || input.id !== null || e.target.closest('button, a')) return;
    unlockAudio();
    if (!canThrow(game.state, 0)) return;
    input.id = e.pointerId;
    input.pts = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    $('howtoBo').classList.remove('show');
  });
  window.addEventListener('pointermove', (e) => {
    if (input.id !== e.pointerId) return;
    input.pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    if (input.pts.length > 60) input.pts.splice(1, 1);
  });
  const release = (e) => {
    if (input.id !== e.pointerId) return;
    input.pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    const th = swipeToThrow(input.pts);
    if (th && game && canThrow(game.state, 0)) input.pending = th;
    else if (!th) pop('上へ シュッと!', null, 'small', 700);
    input.id = null;
    input.pts = null;
  };
  for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, release);
  window.addEventListener('keydown', (e) => {
    if (mode !== 'playing') return;
    if (e.code === 'Escape' || e.code === 'KeyP') setPaused(!paused);
  });
  function myInput() {
    if (!input.pending) return null;
    const p = input.pending;
    input.pending = null;
    return p;
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashBo');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  const nameOf = (slot) => (slot === 0 ? 'あなた' : CHARACTERS.find((c) => c.key === game.players[slot].character)?.name || '');
  function buildChips() {
    $('chipsBo').replaceChildren(...game.players.map((p, slot) => {
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
    [...$('chipsBo').children].forEach((c, slot) => {
      const b = c.querySelector('b');
      const v = String(s.players[slot].score);
      if (b.textContent !== v) { b.textContent = v; c.classList.remove('up'); void c.offsetWidth; c.classList.add('up'); }
      c.style.order = String(order.indexOf(slot));
      c.classList.toggle('lead', order[0] === slot && s.players[slot].score > 0);
    });
    $('frameBo').textContent = s.phase === 'ready' || s.phase === 'show' || s.phase === 'finished' ? '' : `${s.frame + 1}/${RULES.frames}`;
    $('throwBo').textContent = s.phase === 'aim' || s.phase === 'roll' ? (s.throwNo ? '2投め' : '1投め') : '';
    // 投げる 時間の のこり
    const bar = $('aimBo');
    const show = canThrow(s, 0);
    bar.hidden = !show;
    if (show) bar.firstElementChild.style.transform = `scaleX(${clamp(s.aimLeft / RULES.aimTime, 0, 1)})`;
  }
  const tmpV = new THREE.Vector3();
  function pop(text, at, cls = '', life = 900) {
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    if (at) {
      tmpV.copy(at).project(camera);
      el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
      el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    } else { el.style.left = '50%'; el.style.top = '62%'; }
    $('popsBo').append(el);
    setTimeout(() => el.remove(), life);
  }

  // ── できごと ────────────────────────────────────────
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      switch (e.type) {
        case 'aim':
          if (s.frame !== game.frameShown) buildLaneProps();
          if (e.frame === 0 && e.throwNo === 0) { splash('なげろ!', 'gold'); sfx.go(); }
          else if (e.throwNo === 0) splash(`フレーム ${e.frame + 1}`, 'small');
          else if (canThrow(s, 0)) splash('2投め', 'small');
          break;
        case 'throw':
          game.units[e.slot].act = 0.5;
          if (e.slot === 0) { sfx.throw(); sfx.roll(); }
          break;
        case 'pin': {
          const L = game.lanes[e.slot];
          const m = L.pins[e.i];
          if (m) m.userData.dir = Math.atan2(e.x - s.lanes[e.slot].pins[e.i].x, 1);
          if (e.slot === 0) { game.pinCount++; sfx.pin(game.pinCount); }
          if (e.gold) spark(toWorld(e.slot, e.x, e.y).setY(0.3), 14, 0xffd24a, 2);
          break;
        }
        case 'bump':
          if (e.slot === 0) { sfx.bump(); pop(e.kind === 'stone' ? 'こつん!' : 'ぼこっ!', game.lanes[0].ball.position.clone().setY(0.4), 'small', 600); }
          break;
        case 'gutter':
          if (e.slot === 0) { sfx.gutter(); pop('みぞ…', game.lanes[0].ball.position.clone().setY(0.3), 'red', 800); }
          break;
        case 'scored': {
          const at = toWorld(e.slot, 0, RULES.headPin).setY(0.8);
          if (e.slot === 0) {
            game.pinCount = 0;
            if (e.mark === 'strike') { splash('ストライク!', 'gold'); sfx.strike(); game.shake = 0.25; }
            else if (e.mark === 'spare') { splash('スペア!', 'gold'); sfx.spare(); }
            else pop(`${e.knocked}本`, at, 'me', 900);
            if (e.gold) { sfx.gold(); pop(`金の ピン +${RULES.gold}!`, at.clone().setY(1.2), 'gold', 1100); }
          } else if (e.mark) pop(e.mark === 'strike' ? 'ストライク!' : 'スペア!', at, 'small', 900);
          if (e.mark === 'strike') confetti(at, 24);
          game.units[e.slot].mood = e.mark ? 1.4 : e.knocked <= 2 ? -1.2 : 0;
          break;
        }
        case 'frameEnd':
          if (e.frame + 1 < RULES.frames) splash(`フレーム ${e.frame + 1} おわり`, 'small');
          break;
        case 'show':
          splash('そこまで!', 'small');
          sfx.whistle();
          break;
        case 'finished': {
          game.endTimer = 4;
          const win = e.winner === 0;
          if (win) { sfx.fanfare(); splash('1い!', 'gold'); } else splash(`${ranking(s).indexOf(0) + 1}い`, 'small');
          game.units[e.winner].win = true;
          confetti(game.units[e.winner].holder.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 50);
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
      const pl = s.players[slot];
      const li = document.createElement('li');
      if (slot === 0) li.className = 'me';
      const who = p.cpu ? `CPU(${PERSONALITIES[p.cpu].label})` : 'あなた';
      const def = CHARACTERS.find((c) => c.key === p.character);
      const marks = [pl.strikes ? `ストライク ${pl.strikes}` : '', pl.spares ? `スペア ${pl.spares}` : ''].filter(Boolean).join('・');
      li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
        `<span>${def.name}<small>${who}${marks ? `・${marks}` : ''}</small></span><span class="dist">${pl.score}<small>点</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateWorld(dt) {
    const s = game.state;
    s.lanes.forEach((lane, slot) => {
      const L = game.lanes[slot];
      // どんぐり: 投げる まえは 線の 上、ころがって いる あいだは state どおり
      const b = lane.ball;
      if (b) {
        const prev = L.ball.position.clone();
        toWorld(slot, b.x, b.y, L.ball.position);
        if (b.gutter) L.ball.position.y = -0.1;
        const moved = prev.distanceTo(L.ball.position);
        L.ball.userData.spin.rotation.x -= moved / RULES.ballR;
        L.ball.rotation.y = Math.atan2(b.vx, b.vy) * -1;
        L.ball.visible = b.y < RULES.laneL + 0.8;
      } else {
        toWorld(slot, 0, -0.15, L.ball.position);
        L.ball.visible = true;
      }
      // ピン: たおれたら その 向きへ ころん
      lane.pins.forEach((p, i) => {
        const m = L.pins[i];
        if (!m) return;
        if (p.x > 8) { m.visible = false; return; }
        m.visible = true;
        toWorld(slot, p.x, p.y, m.position);
        const d = m.userData;
        if (p.down) d.fall = Math.min(1, d.fall + dt * 5);
        const k = d.fall;
        m.rotation.set(0, 0, 0);
        m.rotateY(d.dir);
        m.rotateX(-k * Math.PI / 2 * 0.95);
        m.position.y = k * 0.06;
        if (m.children[2]) m.children[2].visible = !p.down;
      });
    });
    // キャラ
    s.players.forEach((p, slot) => {
      const u = game.units[slot];
      if (u.act > 0) u.act -= dt;
      if (u.mood) u.mood -= Math.sign(u.mood) * dt;
      if (Math.abs(u.mood || 0) < 0.05) u.mood = 0;
      const happy = u.win || (u.mood || 0) > 0;
      u.model.setFace(happy ? 'happy' : (u.mood || 0) < 0 ? 'surprised' : 'normal');
      u.model.play(u.win || (u.mood || 0) > 0 ? 'cheer' : u.act > 0 ? 'run' : 'idle');
      u.model.update(dt);
      if (u.marker) u.marker.position.set(0, 2.6 + Math.sin(time * 5) * 0.1, 0);
    });
    // ねらいの 線(はじいて いる あいだ)
    const g = game.guide;
    const th = input.pts && input.pts.length > 2 ? swipeToThrow(input.pts) : null;
    g.visible = !!th && canThrow(s, 0);
    if (th) g.rotation.y = -th.angle * 3;
    stage.update(time);
  }

  let freeCamera = false;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  function updateCamera(dt, snap = false) {
    if (freeCamera || !game) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const s = game.state;
    const lx = laneX(0);
    const b = s.lanes[0].ball;
    const want = new THREE.Vector3(lx, portrait ? 2.3 : 1.95, portrait ? 3.3 : 2.9);
    const look = new THREE.Vector3(lx, 0, -6.5);
    if (s.phase === 'roll' || s.phase === 'aim') {
      if (b && s.lanes[0].thrown) {
        // どんぐりを おいかけて、ピンの てまえで とまる
        const z = -Math.min(b.y, RULES.headPin - 3.2);
        want.set(lx + b.x * 0.4, portrait ? 1.6 : 1.25, z + (portrait ? 2.6 : 2.1));
        look.set(lx + b.x * 0.3, 0, z - 4);
      }
    }
    if (s.phase === 'result') { want.set(lx, 1.5, -RULES.headPin + 3.4); look.set(lx, 0.1, -RULES.headPin - 0.4); }
    if (s.phase === 'frameEnd' || s.phase === 'show') { want.set(0, 5.5, 6.5); look.set(0, 0, -4); }
    if (s.phase === 'finished') {
      const w = game.units[s.winner].holder.position;
      want.set(w.x + 0.4, 1.3, w.z + 2.4); look.set(w.x, 0.6, w.z);
    }
    const k = snap ? 1 : Math.min(1, dt * 4);
    camPos.lerp(want, k);
    camLook.lerp(look, k);
    camera.fov = portrait ? 62 : 48;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      camera.position.lerpVectors(new THREE.Vector3(0, 14, 12), camPos, e);
      camera.lookAt(camLook);
      return;
    }
    camera.position.copy(camPos);
    if (game.shake > 0) {
      game.shake = Math.max(0, game.shake - dt);
      camera.position.x += (Math.random() - 0.5) * game.shake * 0.3;
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
        const mi = myInput();
        const inputs = game.players.map((p, slot) => (p.cpu ? cpuInput(game.cpus[slot], s, slot) : mi));
        onEvents(step(s, inputs));
        game.acc -= STEP;
      }
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
  window.dbowl = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    throw: (t) => { input.pending = t; },
    advance: (sec) => {
      const me = game.meCpu || (game.meCpu = createCpu('normal', 1, 0));
      for (let i = 0; i < sec / STEP && game.state.phase !== 'finished'; i++) {
        onEvents(step(game.state, game.players.map((p, slot) => cpuInput(slot ? game.cpus[slot] : me, game.state, slot))));
      }
    },
    events: (evs) => onEvents(evs),
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
