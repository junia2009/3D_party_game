// 空まで まめのきジャンプ の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、結果を3Dと HUD に映す」だけ。
//
// 動かし方: 下の 左右の ボタン(または 画面の 左半分 / 右半分を タップ)。パソコンは ← → か A D。

import * as THREE from 'three';
import { makePlayers } from '../lineup.js';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonGradient } from '../../runtime/models.js';
import { seedFrom } from '../../rng.js';
import { RULES, STEP, createGame, ranking, step, timeLeft } from './rules.js';
import { createNetDriver, replaceState } from '../../net/drive.js';
import { PERSONALITIES, cpuInput, createCpu } from './cpu.js';
import { LEAF_H, LEAF_X, buildStage, stalkX } from './stage.js';
import { createAtmosphere } from '../daruma/atmosphere.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const params = new URLSearchParams(location.search);
const SHOW_BELOW = 14; // 自分より 下の 葉っぱを 何まい 見せるか

export async function createMame({ renderer, settings, getAudio, onExit }) {
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
    // ぴょん: のぼるたびに 少しずつ 高い 音(8まいで 1まわり)
    hop(n) { const f = 520 * 2 ** ((n % 8) / 12); voice({ type: 'triangle', pts: [[0, f], [0.07, f * 1.4]], len: 0.09, gain: 0.05 }); },
    grow() { noise({ len: 0.08, gain: 0.03, freq: [2500, 4000], q: 2 }); },
    miss() { voice({ type: 'square', pts: [[0, 420], [0.3, 150]], len: 0.32, gain: 0.05 }); noise({ len: 0.3, gain: 0.06, freq: [2000, 500], q: 0.8 }); },
    beep(last) { voice({ type: 'square', pts: [[0, last ? 1320 : 660]], len: last ? 0.5 : 0.16, gain: 0.05 }); },
    combo(n) { [784, 988, 1175, 1568].slice(0, n >= 30 ? 4 : 3).forEach((f, i) => voice({ type: 'triangle', pts: [[0, f]], len: 0.1, gain: 0.04, at: i * 0.05 })); },
    boom() { noise({ len: 0.6, gain: 0.12, freq: [500, 90], type: 'lowpass', attack: 0.005 }); },
    spurt() { [523, 659, 784, 1047, 1319].forEach((f, i) => voice({ type: 'square', pts: [[0, f]], len: 0.09, gain: 0.04, at: i * 0.06 })); },
    tick() { voice({ type: 'square', pts: [[0, 1500]], len: 0.04, gain: 0.03 }); },
    fanfare() {
      [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1047]].forEach(([at, f]) => voice({ type: 'square', pts: [[0, f]], len: 0.12, gain: 0.05, at }));
      voice({ type: 'square', pts: [[0, 1047]], len: 0.6, gain: 0.05, at: 0.5 });
    },
  };

  // ── 葉っぱ(木ごとに 見えている ぶんだけ) ─────────────────
  const leafMat = new THREE.MeshToonMaterial({ color: 0x3f9a2a, gradientMap: toonGradient });
  const leafNew = new THREE.MeshToonMaterial({ color: 0xa8f070, gradientMap: toonGradient, emissive: 0x3a7a10 });
  // stalks[slot] = Map(葉っぱの 番号 → { mesh, grow })
  const stalks = Array.from({ length: SLOTS }, () => new Map());
  const leafPos = (slot, i, side, out = new THREE.Vector3()) => out.set(stalkX(slot) + (side === 'L' ? -LEAF_X : LEAF_X), i * LEAF_H, 0.05);
  function syncLeaves(slot, s) {
    const r = s.runners[slot];
    const top = r.leaf + 1;
    const lo = Math.max(1, r.leaf - SHOW_BELOW);
    const map = stalks[slot];
    for (const [i, l] of map) if (i < lo || i > top) { scene.remove(l.mesh); map.delete(i); }
    for (let i = lo; i <= top; i++) {
      if (map.has(i)) continue;
      const leaf = s.leaves[i];
      const mesh = new THREE.Mesh(stage.leafGeo, i === top ? leafNew : leafMat);
      const p = leafPos(slot, i, leaf.side);
      mesh.position.set(stalkX(slot), p.y, 0.05);
      mesh.rotation.y = leaf.side === 'L' ? Math.PI : 0;
      mesh.rotation.z = (leaf.side === 'L' ? -1 : 1) * 0.12;
      mesh.rotation.x = 0.6; // 上の 面を 手前(カメラ)へ 少し むける
      mesh.scale.setScalar(i === top ? 0.01 : 1);
      scene.add(mesh);
      const l = { mesh, grow: i === top ? 0 : 1, i };
      map.set(i, l);
      if (slot === game.me && i === top && game?.state.phase === 'play') sfx.grow();
    }
    for (const [i, l] of map) {
      // 生えたばかりの 葉っぱは ぷくっと ひらく
      if (l.grow < 1) { l.grow = Math.min(1, l.grow + 1 / 60 * 7); const k = l.grow; l.mesh.scale.setScalar(k < 1 ? k * (1 + Math.sin(k * Math.PI) * 0.35) : 1); }
      l.mesh.material = i === top ? leafNew : leafMat;
      // 乗られた 葉っぱは ぐっと しなって、ぷるんと もどる
      if (l.dip !== undefined) {
        l.dip += 1 / 60;
        const k = l.dip;
        l.mesh.rotation.z = (s.leaves[i].side === 'L' ? -1 : 1) * (0.12 - (k > 0 ? Math.sin(Math.min(1, k / 0.35) * Math.PI) * 0.35 * Math.exp(-k * 4) : 0));
        if (k > 1) { delete l.dip; l.mesh.rotation.z = (s.leaves[i].side === 'L' ? -1 : 1) * 0.12; }
      }
      // ずっと そよ風で ゆれる
      l.mesh.rotation.x = 0.6 + Math.sin(time * 2 + i * 0.7 + slot) * 0.05;
    }
  }
  function clearLeaves() { for (const map of stalks) { for (const l of map.values()) scene.remove(l.mesh); map.clear(); } }

  // ── いちばん 高い 子の 王冠 ─────────────────────────
  const crown = (() => {
    const g = new THREE.Group();
    const gold = new THREE.MeshToonMaterial({ color: 0xffd23c, emissive: 0x5a4000, gradientMap: toonGradient });
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.26, 0.16, 12, 1, true), gold));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), gold);
      t.position.set(Math.cos(a) * 0.26, 0.16, Math.sin(a) * 0.26);
      g.add(t);
    }
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4f6a }));
    gem.position.set(0, 0.02, 0.27);
    g.add(gem);
    g.visible = false;
    scene.add(g);
    return g;
  })();

  // ── きらきら・葉っぱの 舞い・紙ふぶき ───────────────────
  const fx = [];
  const sparkGeo = new THREE.OctahedronGeometry(0.07, 0);
  function sparkle(p, n = 8, color = 0xfff2a0) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.copy(p);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 0.6, vel: new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 2), kind: 'spark' });
    }
  }
  const bitGeo = new THREE.PlaneGeometry(0.16, 0.1);
  function leafBits(p, n = 5) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(bitGeo, new THREE.MeshToonMaterial({ color: 0x6ab84a, side: THREE.DoubleSide, transparent: true }));
      m.position.copy(p);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 1.0, vel: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 1.5), kind: 'bit', spin: Math.random() * 8 });
    }
  }
  const confettiGeo = new THREE.PlaneGeometry(0.12, 0.07);
  function confetti(p) {
    const colors = [...PLAYER_COLORS.map((c) => c.hex), 0xffd24a, 0xffffff];
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true }));
      m.position.set(p.x + (Math.random() - 0.5) * 4, p.y + 3 + Math.random() * 2.5, p.z + (Math.random() - 0.5) * 2);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 3 + Math.random() * 1.5, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, -(0.7 + Math.random() * 0.6), (Math.random() - 0.5) * 0.6), spin: Math.random() * 8, kind: 'bit' });
    }
  }
  // 花火(決着): 勝った子の まわりの 空で ひらく
  const fwGeo = new THREE.SphereGeometry(0.1, 5, 4);
  function firework(p) {
    const color = [0xff4f6a, 0xffd23c, 0x5cc0ff, 0x7ad35a, 0xb48cff][Math.floor(Math.random() * 5)];
    for (let i = 0; i < 36; i++) {
      const m = new THREE.Mesh(fwGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.copy(p);
      scene.add(m);
      fx.push({ obj: m, t: 0, life: 1.3, vel: new THREE.Vector3().randomDirection().multiplyScalar(2.6), kind: 'spark' });
    }
    sfx.boom();
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = f.t / f.life;
      f.obj.position.addScaledVector(f.vel, dt);
      if (f.kind === 'spark') { f.vel.y -= 6 * dt; f.obj.rotation.y += dt * 8; f.obj.material.opacity = 1 - k; }
      else if (f.kind === 'bit') { f.vel.y -= 2 * dt; f.obj.rotation.x += f.spin * dt; f.obj.rotation.y += f.spin * 0.7 * dt; f.obj.material.opacity = Math.min(1, (1 - k) * 3); }
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
  const input = { side: null, target: null };
  await preload(CHARACTERS.map((c) => c.key));

  async function startGame({ fromSky = false } = {}) {
    const net = tour?.net ?? null; // オンライン: { client, start }。席・種・顔ぶれは サーバーが きめる
    const me = net ? net.start.seat : 0;
    const seed = net ? net.start.seed : params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
    const players = makePlayers({ picked, lineup: tour?.lineup, seed, kinds: Object.keys(PERSONALITIES), slots: SLOTS, me });
    if (game) for (const r of game.runners) scene.remove(r.holder);
    for (const f of fx.splice(0)) scene.remove(f.obj);
    clearLeaves();
    const state = createGame(players, seed);
    if (net) replaceState(state, net.start.s);
    const runners = await Promise.all(players.map(async (p, slot) => {
      const model = await createModel(p.character);
      model.setPlayerColor(PLAYER_COLORS[slot].hex);
      model.setFace('normal');
      model.play('idle');
      const holder = new THREE.Group();
      holder.add(model.root);
      holder.scale.setScalar(0.72);
      holder.position.set(stalkX(slot), 0, 0.6);
      scene.add(holder);
      const def = CHARACTERS.find((c) => c.key === p.character);
      return { model, holder, size: def.size || 1, anim: null, side: 'R', shown: 0 };
    }));
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[me].hex }));
    marker.rotation.x = Math.PI;
    runners[me].holder.add(marker);
    runners[me].marker = marker;
    game = { me, net: net ? createNetDriver({ client: net.client, rules: { STEP, step }, state, me }) : null, seed, players, state, cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)), runners, acc: 0, endTimer: null, count: 4, camY: 0, tick: 0, lastSec: 99, shake: 0 };
    atmosphere.apply('day');
    atmosphere.setupShadows([], []);
    Object.assign(input, { side: null, target: null });
    $('hudF').classList.remove('spurt');
    buildChips();
    setMode('playing');
    intro = fromSky ? 0 : 1;
    $('howtoF').classList.add('show');
    if (!fromSky) splash('よーい…');
    updateCamera(0, true);
  }

  function setMode(m) {
    mode = m;
    $('restart').hidden = $('pauseReselect').hidden = $('again').hidden = $('reselect').hidden = !!tour;
    paused = false;
    $('pause').hidden = true;
    $('result').hidden = m !== 'result';
    $('hudF').hidden = m !== 'playing';
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
  $('pauseBtnF').addEventListener('click', mine(() => setPaused(true)));
  $('resume').addEventListener('click', mine(() => setPaused(false)));
  $('restart').addEventListener('click', mine(() => { setPaused(false); startGame(); }));
  $('pauseReselect').addEventListener('click', mine(() => leave('play')));
  $('pauseMenu').addEventListener('click', mine(() => leave('menu')));
  $('again').addEventListener('click', mine(() => { unlockAudio(); startGame(); }));
  $('reselect').addEventListener('click', mine(() => leave('play')));
  $('resultMenu').addEventListener('click', mine(() => leave('menu')));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ── 入力: 左右の ボタン(画面の 左半分 / 右半分 でも) ─────────────
  const playing = () => mode === 'playing' && !paused;
  const press = (side) => { if (!playing()) return; unlockAudio(); input.side = side; $('howtoF').classList.remove('show'); };
  for (const [id, side] of [['leftF', 'L'], ['rightF', 'R']]) {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); press(side); el.classList.add('down'); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => el.classList.remove('down'));
  }
  window.addEventListener('pointerdown', (e) => {
    if (!playing() || e.target.closest('button, a')) return;
    press(e.clientX < innerWidth / 2 ? 'L' : 'R');
  });
  window.addEventListener('keydown', (e) => {
    if (mode !== 'playing') return;
    if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!paused); return; }
    if (e.repeat) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); press('L'); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); press('R'); }
  });
  function myInput() {
    if (input.target) return { ...input.target };
    const side = input.side;
    input.side = null;
    return side ? { side } : null;
  }
  // ボタンが 光る(あたり / まちがい)
  function flashBtn(side, ok) {
    const el = $(side === 'L' ? 'leftF' : 'rightF');
    el.classList.remove('ok', 'bad');
    void el.offsetWidth;
    el.classList.add(ok ? 'ok' : 'bad');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('ok', 'bad'), 160);
  }

  // ── HUD ─────────────────────────────────────────────
  function splash(text, cls = '') {
    const el = $('splashF');
    el.textContent = text;
    el.className = 'splash ' + cls;
    void el.offsetWidth;
    el.classList.add('show');
  }
  function buildChips() {
    $('chipsF').replaceChildren(...game.players.map((p, slot) => {
      const d = document.createElement('div');
      d.className = 'chip' + (slot === game.me ? ' me' : '');
      d.style.setProperty('--c', css(PLAYER_COLORS[slot].hex));
      d.innerHTML = '<i></i><b>0</b>';
      return d;
    }));
  }
  function renderHud() {
    const s = game.state;
    [...$('chipsF').children].forEach((c, i) => { c.querySelector('b').textContent = String(s.runners[i].leaf); });
    $('timeF').textContent = s.phase === 'play' ? String(Math.ceil(timeLeft(s))) : '';
    $('hudF').querySelector('.lr').hidden = s.phase === 'finished';
  }
  const tmpV = new THREE.Vector3();
  function pop(text, x, y, z, cls = '', life = 800) {
    tmpV.set(x, y, z).project(camera);
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = `${((tmpV.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - tmpV.y) / 2) * 100}%`;
    $('popsF').append(el);
    setTimeout(() => el.remove(), life);
  }

  // ── できごと ────────────────────────────────────────
  // 子が 葉っぱの 上に 立つ ところ
  const standAt = (slot, leaf, side, out = new THREE.Vector3()) => {
    if (leaf === 0) return out.set(stalkX(slot), 0, 0.6);
    return leafPos(slot, leaf, side, out).add(tmpV.set(side === 'L' ? -0.08 : 0.08, 0.06, 0.1));
  };
  function onEvents(events) {
    const s = game.state;
    for (const e of events) {
      const u = game.runners[e.slot];
      switch (e.type) {
        case 'start':
          splash('スタート!');
          sfx.beep(true);
          setTimeout(() => $('howtoF').classList.remove('show'), 5000);
          break;
        case 'jump': {
          const from = u.holder.position.clone();
          u.side = e.side;
          u.anim = { from, to: standAt(e.slot, e.leaf, e.side), t: 0, time: RULES.jumpTime * 1.1, hop: true };
          if (e.slot === game.me) { sfx.hop(e.leaf); flashBtn(e.side, true); }
          // 乗った 葉っぱが しなる(着いた ときに)
          const lf = stalks[e.slot].get(e.leaf);
          if (lf) lf.dip = -RULES.jumpTime * 1.1;
          // れんぞく: 10 ごとに きらきら
          u.combo = (u.combo || 0) + 1;
          if (u.combo % 10 === 0) {
            const p = u.holder.position.clone().add(tmpV.set(0, 1, 0));
            sparkle(standAt(e.slot, e.leaf, e.side).add(tmpV.set(0, 0.6, 0)), u.combo >= 30 ? 14 : 8, u.combo >= 30 ? 0xffd23c : 0xfff2a0);
            if (e.slot === game.me) { pop(`${u.combo} れんぞく!`, p.x, p.y + 0.8, 0.6, u.combo >= 30 ? 'gold' : ''); sfx.combo(u.combo); }
          }
          if (e.leaf % 50 === 0) pop(`${e.leaf}まい!`, from.x, from.y + 1.6, 0.6, e.slot === game.me ? 'gold' : '');
          break;
        }
        case 'miss': {
          const from = u.holder.position.clone();
          u.anim = { from, to: standAt(e.slot, e.leaf, s.leaves[e.leaf]?.side || 'R'), t: 0, time: 0.4, hop: false, fall: true };
          leafBits(from, 6);
          u.combo = 0;
          // まちがえた ほうに 葉っぱは ないので、空を ふんで「すかっ」と 足が ばたばた
          u.flail = 0.4;
          if (e.slot === game.me) { sfx.miss(); flashBtn(e.side, false); pop('すべった!', from.x, from.y + 1.4, 0.6, 'red'); game.shake = 0.25; }
          break;
        }
        case 'finished': {
          game.endTimer = 4.5;
          const win = e.winner === game.me;
          splash(win ? 'いちばん 高い!' : 'しゅうりょう!', win ? 'gold' : '');
          if (win) sfx.fanfare();
          confetti(game.runners[e.winner].holder.position);
          for (let i = 0; i < 7; i++) setTimeout(() => { if (game?.state === s) firework(game.runners[e.winner].holder.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 2.5, -1.5))); }, 300 + i * 450);
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
        `<span>${def.name}<small>${who}</small></span><span class="dist">${r.leaf}まい<small>すべった ${r.falls}</small></span>`;
      return li;
    }));
    setMode('result');
  }

  // ── 見た目を state に合わせる ─────────────────────────
  function updateWorld(dt) {
    const s = game.state;
    for (const [slot, u] of game.runners.entries()) {
      const r = s.runners[slot];
      syncLeaves(slot, s);
      let clip = 'idle', face = 'normal';
      if (u.anim) {
        const a = u.anim;
        a.t += dt;
        const k = Math.min(1, a.t / a.time);
        u.holder.position.lerpVectors(a.from, a.to, a.fall ? k * k : k);
        if (a.hop) u.holder.position.y += Math.sin(k * Math.PI) * 0.45;
        if (k >= 1) { u.anim = null; u.land = 1; }
        clip = a.fall ? 'dizzy' : 'cheer';
      } else u.holder.position.copy(standAt(slot, r.leaf, r.leaf ? s.leaves[r.leaf].side : 'R'));
      // 葉っぱの 上では つるの ほうを 少し 向く(手前を 見せる)
      u.holder.rotation.y = r.leaf ? (u.side === 'L' ? 0.5 : -0.5) : 0;
      // 着地で むにゅっ、すべったら 足を ばたばた(体が ゆれる)
      u.land = Math.max(0, (u.land || 0) - dt * 6);
      const sq = Math.sin(u.land * Math.PI) * 0.15;
      u.holder.scale.set(0.72 * (1 + sq), 0.72 * (1 - sq), 0.72 * (1 + sq));
      u.flail = Math.max(0, (u.flail || 0) - dt);
      u.holder.rotation.z = u.flail > 0 ? Math.sin(time * 40) * 0.25 : 0;
      if (r.stun > 0) { clip = 'dizzy'; face = 'frustrated'; }
      if (s.phase === 'finished') {
        const win = ranking(s)[0] === slot;
        clip = win ? 'cheer' : 'wave';
        face = win ? 'happy' : 'normal';
      }
      u.model.play(clip);
      u.model.setFace(face);
      u.model.update(dt);
      if (u.marker) u.marker.position.set(0, 2.4 * u.size + 0.12 * Math.sin(performance.now() / 180), 0);
    }
    stage.update(time, camera);
    // 王冠: いま いちばん 高い 子の 頭の 上(同じ 高さなら 先に 着いた 子)
    const lead = ranking(s)[0];
    const showCrown = s.phase !== 'ready' && s.runners[lead].leaf > 0;
    crown.visible = showCrown;
    if (showCrown) {
      const h = game.runners[lead].holder;
      crown.position.set(h.position.x, h.position.y + 1.55 * game.runners[lead].size, h.position.z);
      crown.rotation.y = time * 2;
      if (game.lead !== lead && s.phase === 'play') { game.lead = lead; if (lead === game.me) pop('トップ!', h.position.x, h.position.y + 2.2, 0.6, 'gold'); }
    }
    [...$('chipsF').children].forEach((c, i) => c.classList.toggle('lead', showCrown && i === lead));
    // のこり 10 秒: ラストスパート
    if (s.phase === 'play' && timeLeft(s) <= 10 && !game.spurt) { game.spurt = true; splash('ラストスパート!', 'gold small'); sfx.spurt(); $('hudF').classList.add('spurt'); }
    // のこり 5 秒: チッ チッ
    if (s.phase === 'play') {
      const sec = Math.ceil(timeLeft(s));
      if (sec <= 5 && sec < game.lastSec) { game.lastSec = sec; sfx.tick(); splash(String(sec), 'small'); }
    }
  }

  let freeCamera = false;
  function updateCamera(dt, snap = false) {
    if (freeCamera) return;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    // 自分の 高さを 追う。決着したら いちばん 高い 子へ
    const s = game?.state;
    let y = game ? game.runners[game.me].holder.position.y : 0;
    if (s && s.phase === 'finished') y = game.runners[ranking(s)[0]].holder.position.y;
    const want = y + 1.8;
    game && (game.camY += (want - game.camY) * (snap ? 1 : Math.min(1, dt * 5)));
    const cy = game ? game.camY : want;
    const dist = portrait ? 19 : 11;
    camera.fov = portrait ? 52 : 45;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const cx = s && s.phase === 'finished' ? game.runners[ranking(s)[0]].holder.position.x * 0.8 : 0;
    const pos = new THREE.Vector3(cx, cy + 3.5, s && s.phase === 'finished' ? dist * 0.55 : dist);
    const look = new THREE.Vector3(cx, cy, 0);
    if (intro < 1) {
      const e = 1 - (1 - intro) ** 3;
      camera.position.lerpVectors(new THREE.Vector3(0, 30, 16), pos, e);
      camera.lookAt(new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 24, 0), look, e));
      return;
    }
    camera.position.copy(pos);
    if (game?.shake > 0) {
      game.shake = Math.max(0, game.shake - dt);
      camera.position.x += (Math.random() - 0.5) * game.shake;
      camera.position.y += (Math.random() - 0.5) * game.shake;
    }
    camera.lookAt(look);
  }

  // ── 画質 ─────────────────────────────────────────
  function applyQuality() {
    renderer.setPixelRatio(settings.quality === 'light' ? 1 : Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight, false);
  }

  // ── 1フレーム ─────────────────────────────────────
  let time = 0;
  function frame(rawDt) {
    const dt = Math.min(rawDt, 0.1);
    time += dt;
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
  window.dmame = {
    get mode() { return mode; },
    get state() { return game?.state; },
    get game() { return game; },
    get intro() { return intro; },
    start: (key = picked) => { picked = key; return startGame(); },
    press: (side) => { input.side = side; },
    // 描かずに、みんな CPU で sec 秒すすめる(自分も CPU)
    advance: (sec) => {
      const me = game.meCpu || (game.meCpu = createCpu('normal', 1, 0));
      for (let i = 0; i < sec / STEP && game.state.phase !== 'finished'; i++) {
        onEvents(step(game.state, game.players.map((p, slot) => cpuInput(slot ? game.cpus[slot] : me, game.state, slot))));
        for (const u of game.runners) u.anim = null;
      }
    },
    get paused() { return paused; },
    camera, renderer, scene,
    freeCamera: (on) => { freeCamera = on; },
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
    exit() { setMode('idle'); input.side = null; },
    get intro() { return intro; },
  };
}
