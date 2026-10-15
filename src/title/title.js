// タイトル画面: 読み込み → タイトル(タップしてはじめる)→ メニュー → 競技えらび / せってい。
//
// 3D は空に浮かぶ島(island.js)と木の看板(sign.js)。画面ごとに島の見え方を変える
// (縦長のメニューでは島を上へ、横長では左へずらして、メニューの場所をあける)。
// ブラウザの戻るボタンは無いものとして作る。どの画面にも「もどる」を置く。

import * as THREE from 'three';
import { CHARACTERS, PLAYER_COLORS } from '../characters.js';
import { createModel, preload } from '../runtime/models.js';
import { createAtmosphere } from '../games/daruma/atmosphere.js';
import { loadSettings, saveSettings } from '../settings.js';
import { ROLES, buildIsland, islandHeight } from './island.js';
import { buildSign, drawSign } from './sign.js';
import { woodPlank } from './wood.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const settings = loadSettings();

// 木の板の絵を、メニューのボタンの背景にする
document.documentElement.style.setProperty('--wood', `url(${woodPlank(640, 140, { seed: 3 })})`);

// ── 音 ─────────────────────────────────────────────
let audio = null;
function unlockAudio() {
  if (audio || !settings.sound) return;
  try {
    audio = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    audio = null;
  }
}
function tone(freq, start, len, type = 'triangle', gain = 0.12) {
  if (!audio || !settings.sound) return;
  const t = audio.currentTime + start;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(audio.destination);
  o.start(t);
  o.stop(t + len + 0.02);
}
// ジングル: ドミソド と、最後に鈴
function jingle() {
  [[523, 0], [659, 0.11], [784, 0.22], [1047, 0.36]].forEach(([f, s]) => tone(f, s, 0.32, 'triangle', 0.13));
  [[1568, 0.36], [2093, 0.42], [2637, 0.48]].forEach(([f, s]) => tone(f, s, 0.5, 'sine', 0.05));
}
// 木の板を押したときの「コッ」
function knock() {
  tone(420, 0, 0.08, 'square', 0.04);
  tone(260, 0.01, 0.1, 'sine', 0.08);
}
function boop() {
  tone(330, 0, 0.12, 'sine', 0.08);
  tone(247, 0.1, 0.16, 'sine', 0.08);
}

// ── 3D ─────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas: $('cv'), antialias: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1500);
scene.add(camera);
const atmosphere = createAtmosphere(scene, renderer, camera, { course: false });
atmosphere.sun.target.position.set(0, 0, 0);
atmosphere.apply(params.get('time') || 'day');
function applyQuality() {
  const light = settings.quality === 'light';
  renderer.setPixelRatio(Math.min(devicePixelRatio, light ? 1 : 2));
  renderer.shadowMap.enabled = !light;
  scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
  resize();
}

const loadingText = $('loadingText');
loadingText.textContent = 'しまを つくっています…';
// 看板と表彰台に使う字を先に読みこむ(読みこむ前に描くと、ちがう字になる)
await Promise.all([
  document.fonts.load('46px "Dela Gothic One"', '123ドングリンピック'),
  document.fonts.load('800 54px "M PLUS Rounded 1c"', '森のなかまの どんぐり大会'),
]).catch(() => {});
const island = buildIsland(scene);

loadingText.textContent = 'なかまを よんでいます…';
await preload([...CHARACTERS.map((c) => c.key), 'hoho']);
const owl = await createModel('hoho');
owl.root.position.copy(island.perch);
owl.root.scale.multiplyScalar(island.oakScale / 0.8);
owl.root.rotation.y = Math.PI; // 体は幹のほう、首だけこっちを向く
owl.node('head').rotation.y = Math.PI;
owl.play('idle');
owl.setFace('normal');
scene.add(owl.root);

const actors = await Promise.all(ROLES.map(async (role, i) => {
  const m = await createModel(role.key);
  m.setPlayerColor(PLAYER_COLORS[i % PLAYER_COLORS.length].hex);
  m.setFace(role.face || 'normal');
  m.play(role.act === 'chase' ? 'run' : role.act);
  m.actions[role.act === 'chase' ? 'run' : role.act].time = i * 0.37; // みんなでそろわないように
  if (role.podium) m.root.position.copy(island.podiumTop);
  else m.root.position.set(role.x, islandHeight(role.x, role.z), role.z);
  scene.add(m.root);
  return { role, model: m };
}));
atmosphere.setupShadows([island.group, owl.root, ...actors.map((a) => a.model.root)], [island.group]);

// 木の看板。カメラにくっつけて、画面の上からつるす
const sign = buildSign(drawSign());
camera.add(sign.pivot);
const signRest = new THREE.Vector3();
let signDrop = -1; // 落ちてきてからの時間(マイナスはまだ落ちていない)
let viewH = 1; // 看板の距離での画面の高さ

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 58 : 42;
  // 看板: 縦長は幅の 9 割、横長は幅の 4 割まで。上ふちが画面の上から 5% のところに来るように
  const dist = 6;
  const h = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const w = h * camera.aspect;
  viewH = h;
  const sc = Math.min((w * (camera.aspect < 1 ? 0.9 : 0.42)) / sign.width, (h * 0.3) / (sign.height - 0.9));
  sign.pivot.scale.setScalar(sc);
  signRest.set(0, h / 2 - h * 0.05 + 0.9 * sc, -dist);
}
addEventListener('resize', resize);
applyQuality();

// ── 画面の切りかえ ──────────────────────────────────
// view: 島をどれだけずらすか(画面の割合)。sign: 看板を出すか
const SCREENS = {
  title: { el: null, view: [0, 0], sign: true },
  menu: { el: $('menu'), view: [0.2, 0.17], sign: true },
  games: { el: $('games'), view: [0.24, 0.17], sign: false },
  settings: { el: $('settings'), view: [0.24, 0.17], sign: false },
};
let screen = 'loading';
const view = { x: 0, y: 0, sign: 1 };

function go(next) {
  for (const [key, s] of Object.entries(SCREENS)) {
    if (!s.el) continue;
    if (key === next) {
      s.el.hidden = false;
      s.el.classList.add('enter');
      requestAnimationFrame(() => requestAnimationFrame(() => s.el.classList.remove('enter')));
    } else {
      s.el.hidden = true;
    }
  }
  $('tap').hidden = next !== 'title';
  $('ver').hidden = next !== 'title';
  screen = next;
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1400);
}

// タイトル: どこを押してもメニューへ
addEventListener('pointerdown', () => {
  if (screen !== 'title') return;
  unlockAudio();
  jingle();
  go('menu');
});
addEventListener('keydown', (e) => {
  if (screen === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
    unlockAudio();
    jingle();
    go('menu');
  } else if (e.code === 'Escape' && (screen === 'games' || screen === 'settings')) {
    go('menu');
  }
});

// メニュー
for (const b of document.querySelectorAll('#menu [data-go]')) {
  b.addEventListener('click', () => {
    unlockAudio();
    knock();
    const to = b.dataset.go;
    if (to === 'zukan') location.href = './viewer.html';
    else go(to);
  });
}
for (const b of document.querySelectorAll('[data-soon]')) {
  b.addEventListener('click', () => {
    unlockAudio();
    boop();
    b.classList.remove('shake');
    void b.offsetWidth;
    b.classList.add('shake');
    toast(`${b.dataset.soon}は もうすこし まっててね!`);
  });
}
for (const b of document.querySelectorAll('[data-back]')) {
  b.addEventListener('click', () => {
    unlockAudio();
    knock();
    go('menu');
  });
}
for (const a of document.querySelectorAll('.play')) a.addEventListener('click', () => knock());

// せってい
function renderSettings() {
  for (const b of $('optSound').children) b.setAttribute('aria-pressed', String((b.dataset.v === 'on') === settings.sound));
  for (const b of $('optQuality').children) b.setAttribute('aria-pressed', String(b.dataset.v === settings.quality));
}
$('optSound').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.v;
  if (!v) return;
  settings.sound = v === 'on';
  saveSettings(settings);
  if (settings.sound) {
    unlockAudio();
    knock();
  }
  renderSettings();
});
$('optQuality').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.v;
  if (!v) return;
  settings.quality = v;
  saveSettings(settings);
  knock();
  applyQuality();
  renderSettings();
});
renderSettings();

// ── 動かす ──────────────────────────────────────────
const clock = new THREE.Clock();
let t = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  t += dt;
  const portrait = camera.aspect < 1;
  // 島のずらし方を、画面に合わせてなめらかに変える
  const target = SCREENS[screen] || SCREENS.title;
  const k = 1 - Math.exp(-dt * 5);
  view.x += ((portrait ? 0 : target.view[0]) - view.x) * k;
  view.y += ((portrait ? target.view[1] : 0) - view.y) * k;
  view.sign += ((portrait && !target.sign ? 0 : 1) - view.sign) * k;
  camera.setViewOffset(innerWidth, innerHeight, view.x * innerWidth, view.y * innerHeight, innerWidth, innerHeight);
  // カメラは島のまわりをゆっくり回る
  const a = t * 0.06 + 0.5;
  const r = portrait ? 25 : 20;
  camera.position.set(Math.sin(a) * r, portrait ? 6.5 : 5.2, Math.cos(a) * r);
  camera.lookAt(0, portrait ? 2.6 : 1.4, 0);
  camera.updateProjectionMatrix();

  for (const { role, model } of actors) {
    if (role.act === 'chase') {
      // 大木の幹のまわりを追いかけっこ
      const ang = t * 0.7 + (role.lead ? 0.75 : 0);
      const x = Math.cos(ang) * 2.3 - 1.4, z = Math.sin(ang) * 2.3 - 2.2;
      model.root.position.set(x, islandHeight(x, z), z);
      model.root.rotation.y = -ang;
    } else {
      // カメラのほうを向く
      model.root.rotation.y = Math.atan2(camera.position.x - model.root.position.x, camera.position.z - model.root.position.z);
    }
    model.update(dt);
  }
  owl.update(dt);
  island.update(dt, t);

  // 看板: 上から落ちてきて弾み、そのあとはゆらゆら。島を上へずらした分は戻して、画面の上に残す
  if (signDrop >= 0) signDrop += dt;
  const fall = signDrop < 0 ? 1 : Math.exp(-3.2 * signDrop);
  sign.pivot.position.copy(signRest);
  // 縦長: 島を上へずらした分だけ看板を下げて、画面の上に残す(看板もカメラにくっついているので、一緒に動いてしまう)
  // 横長: 看板は島と一緒に左へ動いて、島の上にいる
  sign.pivot.position.y -= viewH * view.y;
  if (signDrop < 0) sign.pivot.position.y += viewH;
  else sign.pivot.position.y += 3 * fall * Math.cos(signDrop * 9) * (signDrop < 0.17 ? 1 : 0.35);
  sign.pivot.position.y += (1 - view.sign) * viewH * 0.5; // 競技えらび・せっていでは上へしまう
  sign.pivot.rotation.z = Math.sin(t * 1.1) * 0.022 + fall * Math.sin(Math.max(0, signDrop) * 7) * 0.12;

  atmosphere.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// 読み込みおわり
$('loading').classList.add('done');
setTimeout(() => $('loading').remove(), 600);
signDrop = 0;
go(location.hash === '#menu' ? 'menu' : 'title');
frame();

// E2E 用の口
window.title = { camera, scene, go, get screen() { return screen; }, setTime: (k) => atmosphere.apply(k), redrop: () => { signDrop = 0; } };
