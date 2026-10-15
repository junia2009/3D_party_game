// だるまさんがころんだ の画面(ひとり + CPU)。
//
// ルールは rules.js、CPU は cpu.js。ここは「入力を集めて rules.step を回し、
// 結果を3Dと HUD に映す」だけ。state を書きかえるのは rules.step だけにする
// (オンライン対応のとき、step をサーバーに移せば済むように)。

import * as THREE from 'three';
import { CHARACTERS, PLAYER_COLORS } from '../../characters.js';
import { createModel, preload, toonMaterial } from '../../runtime/models.js';
import { nextRandom, seedFrom } from '../../rng.js';
import { MORA, RULES, STEP, TRACK, chantCount, createGame, lookAmount, ranking, step } from './rules.js';
import { PERSONALITIES, cpuHold, createCpu } from './cpu.js';

const $ = (id) => document.getElementById(id);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const SLOTS = 5;
const laneX = (slot) => (slot - (SLOTS - 1) / 2) * 1.15;
const params = new URLSearchParams(location.search);

// ── 3D の土台 ──────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas: $('cv'), antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe9f4e6, 30, 70);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
scene.add(new THREE.HemisphereLight(0xffffff, 0xa9c7a0, 1.7));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(4, 8, 5);
scene.add(sun);

function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMaterial(color));
}

function buildField() {
  const field = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 140), toonMaterial(0x93d384));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -20;
  field.add(ground);
  // レーン(1本おきに色を変える)
  for (let i = 0; i < SLOTS; i++) {
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(1.08, TRACK + 3), toonMaterial(i % 2 ? 0xc4e8a6 : 0xb3df95));
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(laneX(i), 0.004, -TRACK / 2 + 0.5);
    field.add(lane);
  }
  const width = SLOTS * 1.15 + 0.3;
  const start = box(width, 0.02, 0.14, 0xffffff);
  start.position.set(0, 0.01, 0);
  field.add(start);
  const goal = box(width, 0.02, 0.2, 0xffffff);
  goal.position.set(0, 0.01, -TRACK);
  field.add(goal);
  // 5m ごとの目印
  for (let m = 5; m < TRACK; m += 5) {
    for (const s of [-1, 1]) {
      const peg = box(0.12, 0.3, 0.12, 0xffffff);
      peg.position.set(s * (width / 2 + 0.25), 0.15, -m);
      field.add(peg);
    }
  }
  // ゴールテープ
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 10), toonMaterial(0xffffff));
    post.position.set(s * (width / 2 + 0.25), 0.65, -TRACK);
    field.add(post);
  }
  const tape = box(width + 0.5, 0.08, 0.03, 0xff5a4e);
  tape.position.set(0, 1.05, -TRACK);
  field.add(tape);
  // 木と雲(飾り。乱数は演出なので Math.random でよい)
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 1, 8);
  const leafGeo = new THREE.SphereGeometry(1, 14, 10);
  for (let i = 0; i < 46; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (5 + Math.random() * 14);
    const z = 2 - Math.random() * 52; // カメラの手前には生やさない
    const k = 0.7 + Math.random() * 0.8;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, toonMaterial(0x8a6247));
    trunk.position.y = 0.5;
    const leaf = new THREE.Mesh(leafGeo, toonMaterial([0x5fb55a, 0x4ea957, 0x79c463][i % 3]));
    leaf.position.y = 1.5;
    leaf.scale.set(0.9, 1.05, 0.9);
    tree.add(trunk, leaf);
    tree.position.set(x, 0, z);
    tree.scale.setScalar(k);
    field.add(tree);
  }
  for (let i = 0; i < 7; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(leafGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      puff.scale.set(1.4 - j * 0.3, 0.8 - j * 0.15, 1);
      puff.position.set(j * 1.2 - 1.2, 0, 0);
      cloud.add(puff);
    }
    cloud.position.set(-30 + i * 10 + Math.random() * 4, 11 + Math.random() * 5, -50 - Math.random() * 10);
    field.add(cloud);
  }
  return field;
}
scene.add(buildField());

// 足元の丸い影
const shadowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(20,50,20,0.38)');
  r.addColorStop(1, 'rgba(20,50,20,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
function shadow(size) {
  const m = new THREE.Mesh(shadowGeo, shadowMat);
  m.position.y = 0.012;
  m.scale.setScalar(size);
  return m;
}

// ── 音(数える声のかわりの ピッ) ─────────────────────────
let audio = null;
function beep(freq, len = 0.09, type = 'triangle', gain = 0.12) {
  if (!audio) return;
  const t = audio.currentTime;
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
function unlockAudio() {
  if (audio) return;
  try {
    audio = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    audio = null;
  }
}

// ── 読み込み ────────────────────────────────────────
await preload([...CHARACTERS.map((c) => c.key), 'hoho']);
const owl = await createModel('hoho');
owl.root.position.set(0, 0, -TRACK - 1.7);
owl.root.rotation.y = Math.PI; // 体はうしろ(コースの外)を向く
owl.play('idle');
owl.setFace('normal');
scene.add(owl.root);
const owlHead = owl.node('head');
const owlShadow = shadow(2.2);
owlShadow.position.set(0, 0.012, -TRACK - 1.7);
scene.add(owlShadow);
$('loading').remove();

// ── ゲームの進行 ────────────────────────────────────
let mode = 'select'; // select → playing → result
let picked = params.get('char') && CHARACTERS.some((c) => c.key === params.get('char')) ? params.get('char') : CHARACTERS[0].key;
let game = null; // { state, players, cpus, runners(見た目), acc, endTimer }
let held = false;

async function startGame() {
  const seed = params.has('seed') ? seedFrom(params.get('seed')) : (Date.now() | 0);
  const pick = { rng: seedFrom(`${seed}:pick`) };
  const others = CHARACTERS.filter((c) => c.key !== picked).map((c) => c.key);
  // CPU のキャラと性格を決める
  const cpuChars = [];
  while (cpuChars.length < SLOTS - 1) cpuChars.push(others.splice(Math.floor(nextRandom(pick) * others.length), 1)[0]);
  const kinds = Object.keys(PERSONALITIES);
  const players = [
    { id: 'me', name: 'あなた', character: picked, cpu: null },
    ...cpuChars.map((key, i) => ({ id: `cpu${i}`, name: CHARACTERS.find((c) => c.key === key).name, character: key, cpu: kinds[Math.floor(nextRandom(pick) * kinds.length)] })),
  ];
  // 前のゲームの片付け
  if (game) for (const r of game.runners) scene.remove(r.holder);

  const runners = await Promise.all(players.map(async (p, slot) => {
    const model = await createModel(p.character);
    model.setPlayerColor(PLAYER_COLORS[slot].hex);
    model.setFace('normal');
    model.play('idle');
    const holder = new THREE.Group();
    holder.add(model.root);
    model.root.rotation.y = Math.PI; // ゴールのほうを向く
    const def = CHARACTERS.find((c) => c.key === p.character);
    const sh = shadow(0.95 * (def.size || 1));
    holder.add(sh);
    holder.position.set(laneX(slot), 0, 0);
    scene.add(holder);
    return { model, holder, shadow: sh, size: def.size || 1, x: 0 };
  }));
  // 自分の頭の上の目印
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[0].hex }));
  marker.rotation.x = Math.PI;
  runners[0].holder.add(marker);
  runners[0].marker = marker;

  game = {
    seed,
    players,
    state: createGame(players, seed),
    cpus: players.map((p, slot) => (p.cpu ? createCpu(p.cpu, seed, slot) : null)),
    runners,
    acc: 0,
    endTimer: null,
    lastCount: 0,
  };
  held = false;
  buildTrackDots();
  setMode('playing');
  splash('よーい…');
}

function setMode(m) {
  mode = m;
  $('select').hidden = m !== 'select';
  $('result').hidden = m !== 'result';
  $('hud').hidden = m !== 'playing';
  if (m === 'select') renderSelect();
}

// ── 入力 ────────────────────────────────────────────
function press(on) {
  if (mode !== 'playing') return;
  held = on;
  $('run').classList.toggle('down', on);
}
const runBtn = $('run');
runBtn.addEventListener('pointerdown', (e) => {
  unlockAudio();
  runBtn.setPointerCapture(e.pointerId);
  press(true);
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) runBtn.addEventListener(ev, () => press(false));
// ボタンの外を押しても走れる(押したまま指がずれても止まらないように)
window.addEventListener('pointerdown', (e) => {
  if (mode !== 'playing' || e.target === runBtn) return;
  unlockAudio();
  press(true);
});
window.addEventListener('pointerup', (e) => { if (e.target !== runBtn) press(false); });
window.addEventListener('blur', () => press(false));
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    unlockAudio();
    if (!e.repeat) press(true);
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') press(false);
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ── HUD ─────────────────────────────────────────────
function splash(text, red = false) {
  const el = $('splash');
  el.textContent = text;
  el.classList.toggle('red', red);
  el.classList.remove('show');
  void el.offsetWidth; // アニメーションをやり直す
  el.classList.add('show');
}

function buildTrackDots() {
  $('track').replaceChildren(...game.players.map((p, slot) => {
    const d = document.createElement('div');
    d.className = 'dot' + (slot === 0 ? ' me' : '');
    d.style.background = css(PLAYER_COLORS[slot].hex);
    d.title = p.name;
    return d;
  }));
}

function renderHud() {
  const s = game.state;
  const chant = $('chant');
  const count = chantCount(s);
  if (s.phase === 'ready') {
    if (chant.dataset.mode !== 'ready') {
      chant.dataset.mode = 'ready';
      chant.className = 'chant';
      chant.innerHTML = '<span class="msg">よーい…</span>';
    }
  } else {
    if (chant.dataset.mode !== 'mora') {
      chant.dataset.mode = 'mora';
      chant.replaceChildren(...MORA.map((m) => Object.assign(document.createElement('span'), { textContent: m })));
    }
    chant.classList.toggle('watch', s.phase === 'turn' || s.phase === 'watch');
    [...chant.children].forEach((el, i) => el.classList.toggle('on', i < count));
  }
  const left = Math.max(0, RULES.timeLimit - Math.max(0, s.t - RULES.readyTime));
  $('timer').firstChild.nodeValue = String(Math.ceil(left));
  const dots = $('track').children;
  s.runners.forEach((r, i) => {
    dots[i].style.bottom = `calc(10px + (100% - 20px) * ${(game.runners[i].x / TRACK).toFixed(4)})`;
    dots[i].classList.toggle('stun', r.stun > 0);
  });
}

// ── できごと ────────────────────────────────────────
function onEvents(events) {
  const s = game.state;
  for (const e of events) {
    switch (e.type) {
      case 'chant':
        owl.setFace('normal');
        owl.play('chant', { timeScale: 2.5 / s.chant.length });
        game.lastCount = 0;
        break;
      case 'fake':
        owl.play('idle');
        splash('……?');
        break;
      case 'resume':
        owl.play('chant', { timeScale: 2.5 / s.chant.length });
        break;
      case 'turn':
        sweep(300, 900, 0.25, 'sawtooth', 0.05);
        splash('ころんだ!', true);
        owl.play('idle');
        break;
      case 'watch':
        owl.setFace('glare');
        break;
      case 'caught':
        owl.play('flap', { fade: 0.1 });
        sweep(700, 120, 0.4, 'square', 0.07);
        if (e.slot === 0) splash('みつかった!', true);
        break;
      case 'back':
        owl.setFace('normal');
        owl.play('idle');
        break;
      case 'goal':
        beep(784, 0.12); setTimeout(() => beep(1046, 0.25), 120);
        splash(e.slot === 0 ? 'ゴール!' : `${game.players[e.slot].name} ゴール!`);
        break;
      case 'timeup':
        splash('そこまで!');
        break;
      case 'finished':
        game.endTimer = 2.6;
        break;
    }
  }
  // 数える声のかわりに、1文字ごとに ピッ
  const count = chantCount(s);
  if (s.phase === 'chant' && count > game.lastCount) {
    for (let i = game.lastCount; i < count; i++) beep(520 + i * 28, 0.07);
    game.lastCount = count;
  }
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
    const dist = r.finishTime !== null ? 'ゴール' : `のこり ${(TRACK - r.x).toFixed(1)}m`;
    li.innerHTML = `<span class="no">${i + 1}</span><span class="dot" style="background:${css(PLAYER_COLORS[slot].hex)}"></span>` +
      `<span>${def.name}<small>${who}</small></span><span class="dist">${dist}</span>`;
    return li;
  }));
  setMode('result');
}

// ── 選ぶ画面 ────────────────────────────────────────
function renderSelect() {
  $('chars').replaceChildren(...CHARACTERS.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(c.key === picked));
    b.innerHTML = `<span class="dot" style="background:${css(c.main)}"></span>${c.name}<small>${c.species}</small>`;
    b.addEventListener('click', () => { picked = c.key; renderSelect(); });
    return b;
  }));
}
$('start').addEventListener('click', () => { unlockAudio(); startGame(); });
$('again').addEventListener('click', () => { unlockAudio(); startGame(); });
$('reselect').addEventListener('click', () => setMode('select'));

// ── 見た目を state に合わせる ─────────────────────────
function updateRunners(dt) {
  const s = game.state;
  const done = s.phase === 'finished';
  s.runners.forEach((r, i) => {
    const v = game.runners[i];
    // 見つかって戻されたときは、すっと引き戻す(瞬間移動に見せない)
    const diff = r.x - v.x;
    v.x = Math.abs(diff) > 0.3 ? v.x + diff * (1 - Math.exp(-dt * 7)) : r.x;
    v.holder.position.set(laneX(i), 0, -v.x);
    let clip = 'idle', face = 'normal', timeScale = 1;
    if (r.stun > 0) {
      clip = 'dizzy';
      face = 'frustrated';
    } else if (r.finishTime !== null || (done && s.winner === i)) {
      clip = 'cheer';
      face = 'happy';
    } else if (r.v > 0.1) {
      clip = 'run';
      timeScale = 0.5 + 0.7 * (r.v / RULES.maxSpeed);
    } else if (done) {
      face = 'frustrated';
    } else if (s.phase === 'turn' || s.phase === 'watch') {
      face = 'surprised';
    }
    v.model.play(clip, { timeScale });
    v.model.setFace(face);
    v.model.update(dt);
    const lift = v.model.node('rig').position.y;
    v.shadow.scale.setScalar(0.95 * v.size * (1 - Math.min(0.5, lift * 0.9)));
    if (v.marker) v.marker.position.set(0, 2.05 * v.size + 0.08 * Math.sin(performance.now() / 180), 0);
  });
}

function updateCamera(dt, snap = false) {
  const aspect = innerWidth / innerHeight;
  const portrait = aspect < 1;
  let z, pos, look;
  const s = game?.state;
  if (s && s.phase === 'finished' && game.endTimer !== null || mode === 'result') {
    // 決着: 勝った人を正面(先生の側)から映す
    const w = s.winner;
    const wz = -game.runners[w].x;
    // 真正面は先生の陰になるので、先生から離れる側の斜め前から
    const side = laneX(w) > 0 ? 1 : -1;
    pos = new THREE.Vector3(laneX(w) + side * (portrait ? 2.2 : 2.8), 2.0, wz - (portrait ? 3.4 : 2.6));
    look = new THREE.Vector3(laneX(w), 0.95, wz);
  } else if (mode === 'playing') {
    // 自分のうしろ。5レーン全部が入るよう引きぎみにして、少しだけ自分の側へ寄せる
    z = -game.runners[0].x;
    const bias = laneX(0) * 0.3;
    pos = new THREE.Vector3(bias, portrait ? 7.2 : 4.6, z + (portrait ? 11 : 7.5));
    look = new THREE.Vector3(bias, 0.4, Math.max(-TRACK - 1, z - (portrait ? 6 : 7.5)));
  } else {
    // 選ぶ画面: コース全体と先生
    pos = new THREE.Vector3(0, portrait ? 10 : 8, portrait ? 12 : 9);
    look = new THREE.Vector3(0, 0, -TRACK / 2 - 2);
  }
  camera.fov = portrait ? 60 : 46;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  const k = snap ? 1 : 1 - Math.exp(-dt * 4);
  camera.position.lerp(pos, k);
  camera.userData.look = camera.userData.look ? camera.userData.look.lerp(look, k) : look.clone();
  camera.lookAt(camera.userData.look);
}

// ── ループ ──────────────────────────────────────────
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (game && mode === 'playing') {
    const s = game.state;
    game.acc += dt;
    while (game.acc >= STEP && s.phase !== 'finished') {
      const holds = game.players.map((p, slot) => (p.cpu ? cpuHold(game.cpus[slot], s, slot) : held));
      onEvents(step(s, holds));
      game.acc -= STEP;
    }
    if (game.endTimer !== null) {
      game.endTimer -= dt;
      if (game.endTimer <= 0) {
        game.endTimer = null;
        showResult();
      }
    }
    renderHud();
  }
  if (game) updateRunners(dt);
  // 先生の首: 0 = うしろ、1 = こっち。回り始めと終わりをなめらかに
  const look = !game || mode === 'select' ? 0 : game.state.phase === 'finished' ? 1 : lookAmount(game.state);
  owlHead.rotation.y = Math.PI * (look * look * (3 - 2 * look));
  owl.update(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// E2E 用の口
window.daruma = {
  get mode() { return mode; },
  get state() { return game?.state; },
  get game() { return game; },
  pick: (key) => { picked = key; renderSelect(); },
  start: () => startGame(),
  hold: (on) => press(on),
};

setMode(params.has('autostart') ? 'playing' : 'select');
if (params.has('autostart')) await startGame();
updateCamera(0, true);
frame();
